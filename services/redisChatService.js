import { getRedisClient } from '../config/redis.js';

// Cache TTL (Time To Live) - 24 hours
const CHAT_CACHE_TTL = 60 * 60 * 24;

/**
 * Generate cache key for a chat
 */
function getChatKey(chatId) {
  return `chat:${chatId}`;
}

/**
 * Generate cache key for recent messages
 */
function getChatMessagesKey(chatId) {
  return `chat:${chatId}:messages`;
}

/**
 * Get chat from Redis cache
 */
export async function getCachedChat(chatId) {
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    const cached = await redis.get(getChatKey(chatId));
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error('Redis getCachedChat error:', error);
    return null;
  }
}

/**
 * Cache entire chat in Redis
 */
export async function cacheChat(chatId, chatData) {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    await redis.setEx(
      getChatKey(chatId),
      CHAT_CACHE_TTL,
      JSON.stringify(chatData)
    );
  } catch (error) {
    console.error('Redis cacheChat error:', error);
  }
}

/**
 * Get recent messages from Redis (last 50)
 */
export async function getCachedMessages(chatId) {
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    // Get last 50 messages from sorted set
    const messages = await redis.zRange(
      getChatMessagesKey(chatId),
      -50, // Start from 50th last
      -1,  // End at last
      { REV: false }
    );
    
    return messages.map(msg => JSON.parse(msg));
  } catch (error) {
    console.error('Redis getCachedMessages error:', error);
    return null;
  }
}

/**
 * Add a new message to Redis cache
 */
export async function cacheNewMessage(chatId, message) {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    const timestamp = new Date(message.sentAt).getTime();
    
    // Add to sorted set with timestamp as score
    await redis.zAdd(
      getChatMessagesKey(chatId),
      {
        score: timestamp,
        value: JSON.stringify(message)
      }
    );
    
    // Keep only last 100 messages in cache
    await redis.zRemRangeByRank(getChatMessagesKey(chatId), 0, -101);
    
    // Set expiry on the messages set
    await redis.expire(getChatMessagesKey(chatId), CHAT_CACHE_TTL);
    
    // Invalidate full chat cache
    await invalidateChatCache(chatId);
  } catch (error) {
    console.error('Redis cacheNewMessage error:', error);
  }
}

/**
 * Invalidate chat cache when data changes
 */
export async function invalidateChatCache(chatId) {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    await redis.del(getChatKey(chatId));
    await redis.del(getChatMessagesKey(chatId));
  } catch (error) {
    console.error('Redis invalidateChatCache error:', error);
  }
}

/**
 * Update message status in cache (delivered/seen)
 */
export async function updateMessageStatusInCache(chatId, messageIds, status) {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    // Get all messages
    const messages = await redis.zRange(
      getChatMessagesKey(chatId),
      0,
      -1
    );
    
    // Update status for matching messages
    const updates = [];
    for (const msgStr of messages) {
      const msg = JSON.parse(msgStr);
      if (messageIds.includes(String(msg._id))) {
        msg.status = status;
        const timestamp = new Date(msg.sentAt).getTime();
        updates.push({
          score: timestamp,
          value: JSON.stringify(msg)
        });
      }
    }
    
    // Re-add updated messages
    if (updates.length > 0) {
      await redis.zAdd(getChatMessagesKey(chatId), updates);
    }
    
    // Invalidate full chat cache
    await invalidateChatCache(chatId);
  } catch (error) {
    console.error('Redis updateMessageStatusInCache error:', error);
  }
}

/**
 * Clear all chat caches (for maintenance)
 */
export async function clearAllChatCaches() {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    const keys = await redis.keys('chat:*');
    if (keys.length > 0) {
      await redis.del(keys);
    }
    console.log(`Cleared ${keys.length} chat cache keys`);
  } catch (error) {
    console.error('Redis clearAllChatCaches error:', error);
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats() {
  const redis = getRedisClient();
  if (!redis) return { connected: false };

  try {
    const info = await redis.info('stats');
    const keys = await redis.keys('chat:*');
    
    return {
      connected: true,
      totalKeys: keys.length,
      info: info
    };
  } catch (error) {
    console.error('Redis getCacheStats error:', error);
    return { connected: false, error: error.message };
  }
}
