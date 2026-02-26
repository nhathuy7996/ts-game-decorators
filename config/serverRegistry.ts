import os from 'os';
import { getRedisClients } from './redis';

// ─── Server Identity ───────────────────────────────────────────────────────────
export const SERVER_ID = process.env.SERVER_ID || `${os.hostname()}-${process.pid}`;

// ─── Config ────────────────────────────────────────────────────────────────────
const REGISTRY_KEY = 'server:registry';       // Redis Hash key lưu tất cả servers
const HEARTBEAT_TTL = 30;                      // Mỗi server tự xoá sau 30 giây nếu không heartbeat
const HEARTBEAT_INTERVAL_MS = 10_000;         // Gửi heartbeat mỗi 10 giây

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface ServerInfo {
    serverId: string;
    hostname: string;
    pid: number;
    startedAt: string;
    lastHeartbeat: string;
}

// ─── Local Cache ───────────────────────────────────────────────────────────────
// Cache được cập nhật tự động mỗi heartbeat → game loop đọc miễn phí (0 Redis calls)

interface ServerCache {
    servers: ServerInfo[];   // Danh sách servers alive (đã sort theo serverId)
    count: number;           // Số lượng servers
    myIndex: number;         // Index (0-based) của server hiện tại, -1 nếu chưa có
    updatedAt: number;       // Timestamp lần cập nhật cuối
}

let _cache: ServerCache = {
    servers: [],
    count: 0,
    myIndex: -1,
    updatedAt: 0,
};

// ─── Internal helpers ──────────────────────────────────────────────────────────

const writeHeartbeat = async () => {
    const { pubClient } = getRedisClients();
    if (!pubClient?.isOpen) return;

    const now = new Date().toISOString();
    const info: ServerInfo = {
        serverId: SERVER_ID,
        hostname: os.hostname(),
        pid: process.pid,
        startedAt: (global as any).__serverStartedAt || now,
        lastHeartbeat: now,
    };

    // Gộp 2 lệnh vào 1 pipeline → 1 round-trip duy nhất thay vì 2
    const pipeline = pubClient.multi();
    pipeline.hSet(REGISTRY_KEY, SERVER_ID, JSON.stringify(info));
    pipeline.set(`server:registry:ttl:${SERVER_ID}`, '1', { EX: HEARTBEAT_TTL });
    await pipeline.exec();
};

/**
 * Fetch danh sách server từ Redis và cập nhật cache nội bộ.
 * Được gọi tự động sau mỗi heartbeat, KHÔNG cần gọi thủ công.
 */
const refreshCache = async (): Promise<void> => {
    const { pubClient } = getRedisClients();
    if (!pubClient?.isOpen) return;

    // Round-trip 1: lấy toàn bộ Hash
    const all = await pubClient.hGetAll(REGISTRY_KEY);
    const entries = Object.entries(all);

    if (entries.length === 0) {
        _cache = { servers: [], count: 0, myIndex: -1, updatedAt: Date.now() };
        return;
    }

    // Round-trip 2: kiểm tra alive tất cả trong 1 pipeline
    const pipeline = pubClient.multi();
    for (const [serverId] of entries) {
        pipeline.exists(`server:registry:ttl:${serverId}`);
    }
    const aliveResults = await pipeline.exec() as number[];

    const activeServers: ServerInfo[] = [];
    const deadServers: string[] = [];

    entries.forEach(([serverId, jsonStr], i) => {
        if (aliveResults[i]) {
            try { activeServers.push(JSON.parse(jsonStr as string)); }
            catch { /* bỏ qua JSON lỗi */ }
        } else {
            deadServers.push(serverId);
        }
    });

    // Cleanup servers chết
    if (deadServers.length > 0) {
        await pubClient.hDel(REGISTRY_KEY, deadServers);
    }

    // Natural sort: tách số cuối chuỗi để so sánh đúng thứ tự số
    // "server-2" < "server-10" (không phải ngược lại như lexicographic)
    const naturalKey = (id: string): [string, number] => {
        const match = id.match(/^(.*?)(-?\d+)$/);
        return match ? [match[1], parseInt(match[2], 10)] : [id, 0];
    };
    activeServers.sort((a, b) => {
        const [prefixA, numA] = naturalKey(a.serverId);
        const [prefixB, numB] = naturalKey(b.serverId);
        return prefixA !== prefixB
            ? prefixA.localeCompare(prefixB)  // khác prefix → sort theo chữ
            : numA - numB;                    // cùng prefix → sort theo số
    });

    _cache = {
        servers: activeServers,
        count: activeServers.length,
        myIndex: activeServers.findIndex(s => s.serverId === SERVER_ID),
        updatedAt: Date.now(),
    };
};

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Bắt đầu đăng ký server này vào registry và gửi heartbeat định kỳ.
 * Gọi hàm này SAU KHI Redis đã connect xong.
 */
export const startServerRegistry = async () => {
    (global as any).__serverStartedAt = new Date().toISOString();

    await writeHeartbeat();     // Gửi heartbeat ngay lần đầu
    await refreshCache();       // Khởi tạo cache ngay lần đầu
    console.log(`📋 Server registered: [${SERVER_ID}] | index: ${_cache.myIndex} / total: ${_cache.count}`);

    // Heartbeat + refresh cache định kỳ
    heartbeatTimer = setInterval(async () => {
        try {
            await writeHeartbeat();
            await refreshCache();
            console.log(`💓 [${SERVER_ID}] Heartbeat | index: ${_cache.myIndex} / total: ${_cache.count}`);
        } catch (err) {
            console.error('❌ Heartbeat failed:', err);
        }
    }, HEARTBEAT_INTERVAL_MS);
};

/**
 * ⚡ [ZERO COST] Lấy danh sách servers từ cache nội bộ — KHÔNG gọi Redis.
 * Dùng thoải mái trong game loop / update(). Refresh tự động mỗi 10 giây.
 */
export const getCachedActiveServers = (): ServerInfo[] => _cache.servers;

/**
 * ⚡ [ZERO COST] Lấy số lượng server đang chạy từ cache — KHÔNG gọi Redis.
 * An toàn 100% khi dùng trong 60 FPS update loop.
 */
export const getCachedServerCount = (): number => _cache.count;

/**
 * ⚡ [ZERO COST] Lấy index (0-based) của server hiện tại — KHÔNG gọi Redis.
 * Index ổn định vì list được sort theo serverId. Trả về -1 nếu chưa khởi tạo.
 * An toàn 100% khi dùng trong 60 FPS update loop.
 */
export const getCachedServerIndex = (): number => _cache.myIndex;

/**
 * 🌐 [REDIS CALL] Buộc refresh cache rồi trả về danh sách servers.
 * Chỉ dùng khi cần dữ liệu real-time tuyệt đối (admin API, monitoring...).
 */
export const getActiveServers = async (): Promise<ServerInfo[]> => {
    await refreshCache();
    return _cache.servers;
};

/**
 * 🌐 [REDIS CALL] Buộc refresh cache rồi trả về số lượng server.
 * Chỉ dùng khi cần chính xác tuyệt đối.
 */
export const getActiveServerCount = async (): Promise<number> => {
    await refreshCache();
    return _cache.count;
};

/**
 * Dừng heartbeat và xoá server này khỏi registry (gọi khi shutdown).
 */
export const stopServerRegistry = async () => {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }

    const { pubClient } = getRedisClients();
    if (!pubClient?.isOpen) return;

    await pubClient.hDel(REGISTRY_KEY, SERVER_ID);
    await pubClient.del(`server:registry:ttl:${SERVER_ID}`);
    console.log(`📋 Server unregistered: [${SERVER_ID}]`);
};
