import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL 

let redisClient = null;

export async function connectRedis() {
  try {
    redisClient = createClient({
      url: REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('Redis: Too many reconnection attempts, giving up');
            return new Error('Too many retries');
          }
          return retries * 1000; // Wait 1s, 2s, 3s, etc.
        }
      }
    });

    redisClient.on('error', (err) => console.error('Redis Client Error:', err));
    redisClient.on('connect', () => console.log('🔴 Redis Connected'));
    redisClient.on('ready', () => console.log('🔴 Redis Ready'));
    redisClient.on('reconnecting', () => console.log('🔴 Redis Reconnecting...'));

    await redisClient.connect();
    
    return redisClient;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    // Don't throw - allow app to run without Redis
    return null;
  }
}

export function getRedisClient() {
  return redisClient;
}

export async function disconnectRedis() {
  if (redisClient) {
    await redisClient.quit();
    console.log('🔴 Redis Disconnected');
  }
}
