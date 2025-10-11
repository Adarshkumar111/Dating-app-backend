import Request from '../models/Request.js';
import Notification from '../models/Notification.js';
import HelpRequest from '../models/HelpRequest.js';
import { getCachedNotifications, cacheNotifications, invalidateNotificationCache } from '../services/redisNotificationService.js';

export async function getNotifications(req, res) {
  try {
    const userId = req.user._id;
    const isAdmin = req.user.isAdmin;

    // Try to get from Redis cache first
    const cached = await getCachedNotifications(userId, isAdmin);
    if (cached) {
      // Return cached data with a header indicating it's from cache
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    // Cache miss - fetch from database
    res.setHeader('X-Cache', 'MISS');

    // Admins see all pending requests across the system
    if (isAdmin) {
      const [requests, help] = await Promise.all([
        Request.find({ status: 'pending' })
          .populate('from', 'name profilePhoto')
          .populate('to', 'name profilePhoto')
          .sort({ createdAt: -1 })
          .limit(100),
        HelpRequest.find({ status: 'pending' })
          .populate('from', 'name profilePhoto')
          .sort({ createdAt: -1 })
          .limit(100)
      ]);
      const normalizedHelp = help.map(h => ({
        _id: h._id,
        type: 'help',
        from: h.from,
        to: null,
        createdAt: h.createdAt
      }));
      const merged = [...normalizedHelp, ...requests].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      // Cache the result
      await cacheNotifications(userId, merged, true);
      
      return res.json(merged);
    }

    // Regular users: pending requests + system notifications
    const [requests, systemNotifs] = await Promise.all([
      Request.find({ 
        to: userId, 
        status: 'pending' 
      })
      .populate('from', 'name about profilePhoto')
      .sort({ createdAt: -1 }),
      
      Notification.find({ 
        userId,
        read: false
      })
      .sort({ createdAt: -1 })
      .limit(50)
    ]);
    
    // Combine and return both
    const result = { 
      requests, 
      systemNotifications: systemNotifs 
    };
    
    // Cache the result
    await cacheNotifications(userId, result, false);
    
    res.json(result);
  } catch (err) {
    console.error('Fetch notifications error:', err);
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
}

export async function markAsRead(req, res) {
  try {
    const { requestId, notificationId } = req.body;
    
    if (notificationId) {
      // Mark system notification as read
      const notif = await Notification.findById(notificationId);
      if (!notif || String(notif.userId) !== String(req.user._id)) {
        return res.status(404).json({ message: 'Notification not found' });
      }
      notif.read = true;
      await notif.save();
      
      // Invalidate cache since notification state changed
      await invalidateNotificationCache(req.user._id);
      
      return res.json({ message: 'Notification marked as read' });
    }
    
    if (requestId) {
      const request = await Request.findById(requestId);
      if (!request || String(request.to) !== String(req.user._id)) {
        return res.status(404).json({ message: 'Notification not found' });
      }
      // You can add a 'read' field to Request model if needed
      
      // Invalidate cache
      await invalidateNotificationCache(req.user._id);
      
      return res.json({ message: 'Marked as read' });
    }
    
    res.status(400).json({ message: 'No ID provided' });
  } catch (err) {
    console.error('Mark as read error:', err);
    res.status(500).json({ message: 'Failed to mark as read' });
  }
}
