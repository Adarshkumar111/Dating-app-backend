import Request from '../models/Request.js';

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

    // Regular users: pending requests addressed to me
    const requests = await Request.find({ 
      to: userId, 
      status: 'pending' 
    })
    .populate('from', 'name about profilePhoto')
    .sort({ createdAt: -1 });
    
    res.json(requests);
  } catch (err) {
    console.error('Fetch notifications error:', err);
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
}

export async function markAsRead(req, res) {
  try {
    const { requestId } = req.body;
    
    const request = await Request.findById(requestId);
    if (!request || String(request.to) !== String(req.user._id)) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    
    // You can add a 'read' field to Request model if needed
    res.json({ message: 'Marked as read' });
  } catch (err) {
    console.error('Mark as read error:', err);
    res.status(500).json({ message: 'Failed to mark as read' });
  }
}
