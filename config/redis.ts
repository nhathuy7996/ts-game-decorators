import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import dotenv from "dotenv"; 
import { startServerRegistry } from './serverRegistry';

dotenv.config();


const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_USERNAME = process.env.REDIS_USERNAME;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

// Redis client instances for reuse
let pubClient: any = null;
let subClient: any = null;
let redisAdapter: any = null;

export const createRedisAdapter = async (onReady?: (pubClient: any, subClient: any) => void | Promise<void>) => {
    try {
        console.log('🔗 Connecting to Redis...');
        
        // Build Redis client configuration
        const redisConfig: any = {
            url: REDIS_URL,
            socket: {
                // Retry vô hạn với exponential backoff, tối đa 10 giây giữa các lần
                // KHÔNG return Error() → client KHÔNG bao giờ bị destroy vĩnh viễn
                reconnectStrategy: (retries: number) => {
                    const delay = Math.min(retries * 200, 10_000);
                    console.log(`🔄 Redis: Retrying connection (attempt ${retries}, next in ${delay}ms)`);
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

        console.log(`🔗 Redis config: ${REDIS_URL} ${REDIS_USERNAME ? `(username: ${REDIS_USERNAME})` : ''} ${REDIS_PASSWORD ? '(password: ***)' : '(no auth)'}`);
        
        // Create publisher client
        pubClient = createClient(redisConfig);

        // Create subscriber client (duplicate of publisher)
        subClient = pubClient.duplicate();

        // Error handling for publisher
        pubClient.on('error', (err: Error) => {
            console.error('❌ Redis Publisher Error:', err);
        });

        pubClient.on('connect', () => {
            console.log('✅ Redis Publisher connected');
        });

        pubClient.on('reconnecting', () => {
            console.log('🔄 Redis Publisher reconnecting...');
        });

        // Error handling for subscriber
        subClient.on('error', (err: Error) => {
            console.error('❌ Redis Subscriber Error:', err);
        });

        subClient.on('connect', () => {
            console.log('✅ Redis Subscriber connected');
        });

        subClient.on('reconnecting', () => {
            console.log('🔄 Redis Subscriber reconnecting...');
        });

        // Connect both clients
        await Promise.all([pubClient.connect(), subClient.connect()]);

        // Create Socket.IO Redis adapter
        redisAdapter = createAdapter(pubClient, subClient, {
            key: 'socket.io',
            requestsTimeout: 5000
        });

        console.log('✅ Redis adapter created successfully');
        startServerRegistry();

        // Gọi callback sau khi adapter sẵn sàng (nếu có)
        if (onReady) {
            await onReady(pubClient, subClient);
        }

        return redisAdapter;

    } catch (error) {
        console.error('❌ Failed to create Redis adapter:', error);
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
        console.log('🛑 Closing Redis connections...');
        
        if (pubClient && pubClient.isOpen) {
            try {
                await pubClient.quit();
                console.log('✅ Redis Publisher connection closed');
            } catch (error) {
                console.error('❌ Error closing Redis Publisher connection:', error);
            }
        } else if (pubClient) {
            console.log('⚠️ Redis Publisher was already closed');
        }
        
        if (subClient && subClient.isOpen) {
            try {
                await subClient.quit();
                console.log('✅ Redis Subscriber connection closed');
            } catch (error) {
                console.error('❌ Error closing Redis Subscriber connection:', error);
            }
        } else if (subClient) {
            console.log('⚠️ Redis Subscriber was already closed');
        }
    } catch (error) {
        console.error('❌ Error closing Redis connections:', error);
    }
}; 