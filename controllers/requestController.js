import Request from '../models/Request.js';
import User from '../models/User.js';
import Settings from '../models/Settings.js';
import Chat from '../models/Chat.js';

export async function sendRequest(req, res) {
  // Prevent admins from sending follow requests
  if (req.user.isAdmin) {
    return res.status(403).json({ message: 'Admins cannot send follow requests' });
  }
  
  try {
    const { toUserId, type } = req.body;
    
    if (String(toUserId) === String(req.user._id)) {
      return res.status(400).json({ message: 'Cannot request self' });
    }
    
    // Check request limits
    const user = req.user;
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    // Reset daily counter if it's a new day
    if (!user.requestsTodayAt || user.requestsTodayAt < todayStart) {
      user.requestsToday = 0;
      user.requestsTodayAt = today;
      await user.save();
    }
    
    // Get settings for request limits
    const settings = await Settings.find();
    const settingsObj = {};
    settings.forEach(setting => {
      settingsObj[setting.key] = setting.value;
    });
    
    const freeLimit = settingsObj.freeUserRequestLimit || 2;
    const premiumLimit = settingsObj.premiumUserRequestLimit || 20;
    const currentLimit = user.isPremium && user.premiumExpiresAt > today ? premiumLimit : freeLimit;
    
    if (user.requestsToday >= currentLimit) {
      return res.status(429).json({ 
        message: 'Daily request limit reached',
        limit: currentLimit,
        isPremium: user.isPremium && user.premiumExpiresAt > today,
        needsPremium: true
      });
    }
    
    // Check if request already exists
    const existing = await Request.findOne({
      $or: [
        { from: req.user._id, to: toUserId },
        { from: toUserId, to: req.user._id }
      ]
    });
    
    if (existing) {
      return res.json({ message: 'Request already exists', status: existing.status });
    }
    
    const created = await Request.create({ 
      from: req.user._id, 
      to: toUserId, 
      type: type || 'follow' 
    });
    
    req.user.requestsToday += 1;
    await req.user.save();
    
    res.json({ message: 'Request sent', requestId: created._id, status: 'pending' });
  } catch (e) {
    console.error('Send request error:', e);
    res.status(400).json({ message: e.message });
  }
}

export async function incoming(req, res) {
  // Prevent admins from accessing incoming requests
  if (req.user.isAdmin) {
    return res.status(403).json({ message: 'Admins cannot access follow requests' });
  }
  
  const items = await Request.find({ to: req.user._id, status: 'pending' })
    .populate('from', 'name age location profilePhoto');
  res.json(items);
}

export async function respond(req, res) {
  // Prevent admins from responding to requests
  if (req.user.isAdmin) {
    return res.status(403).json({ message: 'Admins cannot respond to follow requests' });
  }
  
  try {
    const { requestId, action } = req.body;
    const reqDoc = await Request.findById(requestId);
    
    if (!reqDoc || String(reqDoc.to) !== String(req.user._id)) {
      return res.status(404).json({ message: 'Request not found' });
    }
    
    reqDoc.status = action === 'accept' ? 'accepted' : 'rejected';
    await reqDoc.save();
    
    // If accepted, create a chat room
    if (reqDoc.status === 'accepted') {
      const existingChat = await Chat.findOne({
        users: { $all: [reqDoc.from, reqDoc.to] }
      });
      
      if (!existingChat) {
        await Chat.create({
          users: [reqDoc.from, reqDoc.to],
          messages: []
        });
      }
    }
    
    res.json({ message: 'Updated', status: reqDoc.status });
  } catch (e) {
    console.error('Respond to request error:', e);
    res.status(400).json({ message: e.message });
  }
}

export async function unfollow(req, res) {
  // Prevent admins from unfollowing
  if (req.user.isAdmin) {
    return res.status(403).json({ message: 'Admins cannot unfollow users' });
  }
  
  try {
    const { userId } = req.body;
    
    // Delete the request
    await Request.deleteOne({
      $or: [
        { from: req.user._id, to: userId },
        { from: userId, to: req.user._id }
      ]
    });
    
    res.json({ message: 'Unfollowed successfully' });
  } catch (e) {
    console.error('Unfollow error:', e);
    res.status(400).json({ message: e.message });
  }
}

export async function cancelRequest(req, res) {
  // Prevent admins from canceling requests
  if (req.user.isAdmin) {
    return res.status(403).json({ message: 'Admins cannot cancel follow requests' });
  }
  
  try {
    const { userId } = req.body;
    
    // Find and delete the pending request sent by current user
    const deleted = await Request.findOneAndDelete({
      from: req.user._id,
      to: userId,
      status: 'pending'
    });
    
    if (!deleted) {
      return res.status(404).json({ message: 'Pending request not found' });
    }
    
    res.json({ message: 'Request cancelled successfully' });
  } catch (e) {
    console.error('Cancel request error:', e);
    res.status(400).json({ message: e.message });
  }
}
