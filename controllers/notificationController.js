import Request from '../models/Request.js';
import Notification from '../models/Notification.js';

export async function getNotifications(req, res) {
  try {
    const userId = req.user._id;

    // Admins see all pending requests across the system
    if (req.user.isAdmin) {
      const requests = await Request.find({ status: 'pending' })
        .populate('from', 'name profilePhoto')
        .populate('to', 'name profilePhoto')
        .sort({ createdAt: -1 })
        .limit(100);
      return res.json(requests);
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
    res.json({ 
      requests, 
      systemNotifications: systemNotifs 
    });
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
      return res.json({ message: 'Notification marked as read' });
    }
    
    if (requestId) {
      const request = await Request.findById(requestId);
      if (!request || String(request.to) !== String(req.user._id)) {
        return res.status(404).json({ message: 'Notification not found' });
      }
      // You can add a 'read' field to Request model if needed
      return res.json({ message: 'Marked as read' });
    }
    
    res.status(400).json({ message: 'No ID provided' });
  } catch (err) {
    console.error('Mark as read error:', err);
    res.status(500).json({ message: 'Failed to mark as read' });
  }
}
