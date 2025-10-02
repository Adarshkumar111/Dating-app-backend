import Request from '../models/Request.js';

export async function getNotifications(req, res) {
  try {
    const userId = req.user._id;
    
    // Get all pending requests sent to this user
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
