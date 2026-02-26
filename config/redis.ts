import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import dotenv from "dotenv"; 
import { startServerRegistry } from './serverRegistry';
import { createLogger } from '../utils/logger';

dotenv.config();

const log = createLogger('Redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_USERNAME = process.env.REDIS_USERNAME;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

// Redis client instances for reuse
let pubClient: any = null;
let subClient: any = null;
let redisAdapter: any = null;

export const createRedisAdapter = async (onReady?: (pubClient: any, subClient: any) => void | Promise<void>) => {
    try {
        log.info('🔗 Connecting to Redis...');
        
        // Build Redis client configuration
        const redisConfig: any = {
            url: REDIS_URL,
            socket: {
                // Retry vô hạn với exponential backoff, tối đa 10 giây giữa các lần
                // KHÔNG return Error() → client KHÔNG bao giờ bị destroy vĩnh viễn
                reconnectStrategy: (retries: number) => {
                    const delay = Math.min(retries * 200, 10_000);
                    log.warn(`🔄 Retrying connection (attempt ${retries}, next in ${delay}ms)`);
                    return delay;
                },
                // Timeout khi thiết lập kết nối ban đầu
                connectTimeout: 10_000,
                // TCP keepAlive: gửi probe packet mỗi 15 giây để giữ connection
                // sống qua NAT/firewall (AWS, GCP, ... drop idle TCP sau ~30-350s)
                // Phải nhỏ hơn idle timeout của firewall thấp nhất trong hệ thống
                keepAlive: 15_000,
            }
        };

        // Only add authentication if credentials are provided
        if (REDIS_USERNAME) {
            redisConfig.username = REDIS_USERNAME;
        }
        if (REDIS_PASSWORD) {
            redisConfig.password = REDIS_PASSWORD;
        }

        log.info(`🔗 Redis config: ${REDIS_URL} ${REDIS_USERNAME ? `(username: ${REDIS_USERNAME})` : ''} ${REDIS_PASSWORD ? '(password: ***)' : '(no auth)'}`);
        
        // Create publisher client
        pubClient = createClient(redisConfig);

        // Create subscriber client (duplicate of publisher)
        subClient = pubClient.duplicate();

        // Error handling for publisher
        pubClient.on('error', (err: Error) => {
            log.error('❌ Publisher Error:', err.message);
        });

        pubClient.on('connect', () => {
            log.info('✅ Publisher connected');
        });

        pubClient.on('reconnecting', () => {
            log.warn('🔄 Publisher reconnecting...');
        });

        // Error handling for subscriber
        subClient.on('error', (err: Error) => {
            log.error('❌ Subscriber Error:', err.message);
        });

        subClient.on('connect', () => {
            log.info('✅ Subscriber connected');
        });

        subClient.on('reconnecting', () => {
            log.warn('🔄 Subscriber reconnecting...');
        });

        // Connect both clients
        await Promise.all([pubClient.connect(), subClient.connect()]);

        // Create Socket.IO Redis adapter
        redisAdapter = createAdapter(pubClient, subClient, {
            key: 'socket.io',
            requestsTimeout: 5000
        });

        log.info('✅ Redis adapter created successfully');
        startServerRegistry();

        // Gọi callback sau khi adapter sẵn sàng (nếu có)
        if (onReady) {
            await onReady(pubClient, subClient);
        }

        return redisAdapter;

    } catch (error) {
        log.error('❌ Failed to create Redis adapter:', error);
        throw error;
    }
};


// Function to get Redis adapter instance
export const getRedisAdapter = () => {
    return redisAdapter;
};

// Function to get Redis clients for direct operations
export const getRedisClients = () => {
    return { pubClient, subClient };
};

// Graceful shutdown for Redis connections
export const closeRedisConnections = async () => {
    try {
        log.info('🛑 Closing Redis connections...');
        
        if (pubClient && pubClient.isOpen) {
            try {
                await pubClient.quit();
                log.info('✅ Publisher connection closed');
            } catch (error) {
                log.error('❌ Error closing Publisher connection:', error);
            }
        } else if (pubClient) {
            log.warn('⚠️ Publisher was already closed');
        }
        
        if (subClient && subClient.isOpen) {
            try {
                await subClient.quit();
                log.info('✅ Subscriber connection closed');
            } catch (error) {
                log.error('❌ Error closing Subscriber connection:', error);
            }
        } else if (subClient) {
            log.warn('⚠️ Subscriber was already closed');
        }
    } catch (error) {
        log.error('❌ Error closing Redis connections:', error);
    }
}; 