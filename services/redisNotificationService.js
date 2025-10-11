import { getRedisClient } from '../config/redis.js';

// Cache TTL - 5 minutes (notifications change frequently)
const NOTIFICATION_CACHE_TTL = 60 * 5;

/**
 * Generate cache key for user notifications
 */
function getNotificationKey(userId) {
  return `notifications:${userId}`;
}

/**
 * Generate cache key for admin notifications
 */
function getAdminNotificationKey() {
  return `notifications:admin:all`;
}

/**
 * Generate cache key for notification count
 */
function getNotificationCountKey(userId) {
  return `notifications:${userId}:count`;
}

/**
 * Get cached notifications for a user
 */
export async function getCachedNotifications(userId, isAdmin = false) {
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    const key = isAdmin ? getAdminNotificationKey() : getNotificationKey(userId);
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error('Redis getCachedNotifications error:', error);
    return null;
  }
}

/**
 * Cache notifications for a user
 */
export async function cacheNotifications(userId, notificationData, isAdmin = false) {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    const key = isAdmin ? getAdminNotificationKey() : getNotificationKey(userId);
    await redis.setEx(
      key,
      NOTIFICATION_CACHE_TTL,
      JSON.stringify(notificationData)
    );
  } catch (error) {
    console.error('Redis cacheNotifications error:', error);
  }
}

/**
 * Get cached notification count
 */
export async function getCachedNotificationCount(userId) {
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    const cached = await redis.get(getNotificationCountKey(userId));
    return cached ? parseInt(cached, 10) : null;
  } catch (error) {
    console.error('Redis getCachedNotificationCount error:', error);
    return null;
  }
}

/**
 * Cache notification count
 */
export async function cacheNotificationCount(userId, count) {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    await redis.setEx(
      getNotificationCountKey(userId),
      NOTIFICATION_CACHE_TTL,
      count.toString()
    );
  } catch (error) {
    console.error('Redis cacheNotificationCount error:', error);
  }
}

/**
 * Invalidate notification cache for a user
 */
export async function invalidateNotificationCache(userId) {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    await Promise.all([
      redis.del(getNotificationKey(userId)),
      redis.del(getNotificationCountKey(userId))
    ]);
  } catch (error) {
    console.error('Redis invalidateNotificationCache error:', error);
  }
}

/**
 * Invalidate admin notification cache
 */
export async function invalidateAdminNotificationCache() {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    await redis.del(getAdminNotificationKey());
  } catch (error) {
    console.error('Redis invalidateAdminNotificationCache error:', error);
  }
}

/**
 * Invalidate all notification caches (broadcast invalidation)
 */
export async function invalidateAllNotificationCaches() {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    // Delete all keys matching notifications:*
    const keys = await redis.keys('notifications:*');
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch (error) {
    console.error('Redis invalidateAllNotificationCaches error:', error);
  }
}
