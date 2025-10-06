import Request from '../models/Request.js';
import User from '../models/User.js';
import Settings from '../models/Settings.js';
import Chat from '../models/Chat.js';
import { sendEmail } from '../utils/emailUtil.js';

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
        remaining: 0,
        isPremium: user.isPremium && user.premiumExpiresAt > today,
        needsPremium: true
      });
    }
    
    // Check if a request of the same type already exists in either direction
    const reqType = type || 'follow';
    const existing = await Request.findOne({
      type: reqType,
      $or: [
        { from: req.user._id, to: toUserId },
        { from: toUserId, to: req.user._id }
      ]
    });
    // Check for existing in same direction
    const existingSameDir = await Request.findOne({ from: req.user._id, to: toUserId });
    // And opposite direction
    const existingOppDir = await Request.findOne({ from: toUserId, to: req.user._id });
    
    if (existing) {
      return res.json({ message: 'Request already exists', status: existing.status });
    }
    // If a different type request exists in the SAME direction, upgrade to 'both'
    if (existingSameDir && existingSameDir.type !== reqType) {
      existingSameDir.type = 'both';
      await existingSameDir.save();
      return res.json({ message: 'Request updated', status: existingSameDir.status });
    }
    
    let created;
    try {
      created = await Request.create({ 
        from: req.user._id, 
        to: toUserId, 
        type: reqType 
      });
    } catch (err) {
      // Gracefully handle duplicate key error from legacy index {from,to}
      if (err && err.code === 11000) {
        const same = await Request.findOne({ from: req.user._id, to: toUserId });
        if (same) {
          if (same.type !== reqType) {
            same.type = 'both';
            await same.save();
          }
          return res.json({ message: 'Request already exists', status: same.status });
        }
        const opp = await Request.findOne({ from: toUserId, to: req.user._id });
        if (opp) {
          // Opposite direction exists; cannot create due to legacy unique index
          // Upgrade opposite to 'both' as last resort so a single doc represents both intents
          if (opp.type !== 'both') {
            opp.type = 'both';
            await opp.save();
          }
          return res.json({ message: 'Request already exists', status: opp.status });
        }
      }
      throw err;
    }
    
    // Increment daily counter only for non-photo requests
    if (reqType !== 'photo') {
      req.user.requestsToday += 1;
      await req.user.save();
    }

    const updatedToday = req.user.requestsToday;
    const remaining = Math.max(0, currentLimit - updatedToday);
    
    // Notify target user by email if admin enabled notifications
    try {
      const notifyFollow = !!settingsObj.notifyFollowRequestEmail;
      if (notifyFollow && reqType === 'follow') {
        const toUser = await User.findById(toUserId).select('email name');
        if (toUser?.email) {
          const fromName = req.user?.name || 'Someone';
          const html = `
            <div style="font-family:Arial,sans-serif;line-height:1.6">
              <h2>M Nikah</h2>
              <p><strong>${fromName}</strong> sent you a follow request.</p>
              <p>Log in to review the request and connect.</p>
            </div>`;
          sendEmail({ to: toUser.email, subject: 'New Follow Request', html }).catch(() => {});
        }
      }
    } catch (e) { /* non-blocking */ }

    // Notify target user in real-time for photo requests
    try {
      if (reqType === 'photo' && req.io) {
        req.io.emit(`user:${toUserId}`, { kind: 'photo:requested', from: String(req.user._id), to: String(toUserId) });
      }
    } catch {}
    // Notify admins of new request
    try {
      if (req.io) {
        req.io.emit('admin:request', { action: 'created', type: reqType, requestId: String(created._id) });
      }
    } catch {}
    
    res.json({ message: 'Request sent', requestId: created._id, status: 'pending', limit: currentLimit, remaining });
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
    
    // If accepted and not a photo request, create a chat room
    if (reqDoc.status === 'accepted' && reqDoc.type !== 'photo') {
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
    
    // Real-time notify both users for photo request decisions
    try {
      if (reqDoc.type === 'photo' && req.io) {
        const payload = { kind: reqDoc.status === 'accepted' ? 'photo:approved' : 'photo:rejected', from: String(reqDoc.from), to: String(reqDoc.to) };
        req.io.emit(`user:${reqDoc.from}`, payload);
        req.io.emit(`user:${reqDoc.to}`, payload);
      }
    } catch {}
    // Notify admins of request status change
    try {
      if (req.io) {
        req.io.emit('admin:request', { action: reqDoc.status, type: reqDoc.type, requestId: String(reqDoc._id) });
      }
    } catch {}
    
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

