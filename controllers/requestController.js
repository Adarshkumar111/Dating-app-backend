import Request from '../models/Request.js';
import User from '../models/User.js';
import Settings from '../models/Settings.js';
import Chat from '../models/Chat.js';
import { sendEmail } from '../utils/emailUtil.js';
import PremiumPlan from '../models/PremiumPlan.js';
import { invalidateNotificationCache, invalidateAdminNotificationCache } from '../services/redisNotificationService.js';

export async function sendRequest(req, res) {
  // Prevent admins from sending follow requests
  if (req.user.isAdmin) {
    return res.status(403).json({ message: 'Admins cannot send follow requests' });
  }
  
  try {
    const { toUserId, type } = req.body;
    if (!toUserId) {
      return res.status(400).json({ message: 'Missing toUserId' });
    }
    
    if (String(toUserId) === String(req.user._id)) {
      return res.status(400).json({ message: 'Cannot request self' });
    }
    
    // Check request limits
    const user = await User.findById(req.user._id); // Fetch fresh user data
    const today = new Date();
    
    // Get start of today in UTC (to match database dates)
    const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    
    console.log('Date Check:', {
      userId: user._id,
      email: user.email,
      requestsTodayAt: user.requestsTodayAt,
      todayStart,
      shouldReset: !user.requestsTodayAt || new Date(user.requestsTodayAt) < todayStart
    });
    
    // Reset daily counter if it's a new day (comparing UTC dates)
    if (!user.requestsTodayAt || new Date(user.requestsTodayAt) < todayStart) {
      user.requestsToday = 0;
      user.requestsTodayAt = today;
      await user.save();
      console.log('Counter reset for user:', user._id, 'from', user.requestsToday, 'to 0');
    }
    
    // Get settings for request limits
    const settings = await Settings.find();
    const settingsObj = {};
    settings.forEach(setting => {
      settingsObj[setting.key] = setting.value;
    });
    
    const freeLimit = Number(settingsObj.freeUserRequestLimit) || 2;
    let currentLimit = freeLimit;
    const hasActivePremium = user.isPremium && user.premiumExpiresAt && new Date(user.premiumExpiresAt) > today;
    let premiumLimitUsed = undefined;
    if (hasActivePremium) {
      let premiumLimit = Number(settingsObj.premiumUserRequestLimit) || undefined;
      // If a specific premium plan is attached, prefer its requestLimit
      if (user.premiumPlan) {
        try {
          const plan = await PremiumPlan.findById(user.premiumPlan).select('requestLimit');
          if (typeof plan?.requestLimit === 'number' && !isNaN(plan.requestLimit) && plan.requestLimit > 0) {
            premiumLimit = plan.requestLimit;
          }
        } catch (e) {
          // ignore and fall back
        }
      }
      // Final fallback for premium if nothing configured
      currentLimit = (typeof premiumLimit === 'number' && !isNaN(premiumLimit) && premiumLimit > 0) ? premiumLimit : 20;
      premiumLimitUsed = currentLimit;
    }
    
    console.log('Request Limit Check:', { 
      userId: user._id,
      email: user.email,
      freeLimit, 
      premiumLimit: premiumLimitUsed, 
      currentLimit, 
      requestsToday: user.requestsToday,
      isPremium: hasActivePremium,
      requestsTodayAt: user.requestsTodayAt,
      todayStart: todayStart
    });
    
    if (user.requestsToday >= currentLimit) {
      const isPremiumNow = !!(user.isPremium && user.premiumExpiresAt && new Date(user.premiumExpiresAt) > today);
      return res.status(429).json({ 
        message: 'Daily request limit reached',
        limit: currentLimit,
        remaining: 0,
        isPremium: isPremiumNow,
        needsPremium: !isPremiumNow
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
      
      // Invalidate notification cache for the recipient and admin
      await Promise.all([
        invalidateNotificationCache(toUserId),
        invalidateAdminNotificationCache()
      ]);
    } catch (err) {
      console.error('Request creation error:', err);
      // Check if duplicate error
      if (err.code === 11000) {
        const same = await Request.findOne({ from: req.user._id, to: toUserId });
        if (same) {
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
    
    console.log('Request created:', created);
    
    // If this is a chat request, ensure a pending chat exists so both users see the thread
    try {
      if (reqType === 'chat') {
        const Chat = (await import('../models/Chat.js')).default;
        const ids = [String(req.user._id), String(toUserId)].sort();
        const pairKey = `${ids[0]}_${ids[1]}`;
        let chat = await Chat.findOne({ pairKey });
        if (!chat) {
          await Chat.create({ users: [req.user._id, toUserId], pairKey, isPending: true, messages: [] });
        } else if (!chat.isPending) {
          chat.isPending = true;
          await chat.save();
        }
      }
    } catch (e) { /* non-blocking */ }

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
          sendEmail({ to: toUser.email, subject: 'New Follow Request', html }, { kind: 'user' }).catch(() => {});
        }
      }
    } catch (e) { /* non-blocking */ }

    // Notify target user in real-time for ALL request types
    try {
      if (req.io) {
        const eventType = reqType === 'photo' ? 'photo:requested' : 'request:received';
        req.io.emit(`user:${toUserId}`, { kind: eventType, from: String(req.user._id), to: String(toUserId), requestType: reqType });
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
    
    console.log('Respond request:', { requestId, action, userId: req.user._id });
    
    const reqDoc = await Request.findById(requestId).populate('from', 'name profilePhoto');
    
    if (!reqDoc) {
      console.log('Request not found:', requestId);
      return res.status(404).json({ message: 'Request not found or already processed' });
    }
    
    if (String(reqDoc.to) !== String(req.user._id)) {
      console.log('Unauthorized access:', { reqTo: reqDoc.to, userId: req.user._id });
      return res.status(403).json({ message: 'Unauthorized to respond to this request' });
    }
    
    if (reqDoc.status !== 'pending') {
      console.log('Request already processed:', reqDoc.status);
      return res.status(400).json({ message: `Request already ${reqDoc.status}` });
    }
    
    const isAccepted = action === 'accept';
    reqDoc.status = isAccepted ? 'accepted' : 'rejected';
    await reqDoc.save();
    
    // Invalidate cache for both sender and recipient, and admin
    await Promise.all([
      invalidateNotificationCache(reqDoc.from),
      invalidateNotificationCache(reqDoc.to),
      invalidateAdminNotificationCache()
    ]);
    
    // Create notification for the sender (User A)
    const Notification = (await import('../models/Notification.js')).default;
    await Notification.create({
      userId: reqDoc.from,
      type: 'system',
      title: isAccepted ? 'Request Accepted' : 'Request Rejected',
      message: isAccepted
        ? `${req.user.name} accepted your request`
        : `${req.user.name} rejected your request`,
      read: false,
      data: { relatedUser: req.user._id, requestId: String(reqDoc._id), kind: isAccepted ? 'request_accepted' : 'request_rejected' }
    });
    
    // Send email notification to the sender
    try {
      const fromUser = await User.findById(reqDoc.from).select('email name');
      if (fromUser?.email) {
        const requestTypeText = reqDoc.type === 'photo' ? 'photo access request' : reqDoc.type === 'chat' ? 'chat request' : 'follow request';
        const html = `
          <div style="font-family:Arial,sans-serif;line-height:1.6">
            <h2>M Nikah</h2>
            <h3 style="color: ${isAccepted ? '#22c55e' : '#ef4444'};">${isAccepted ? '✅' : '❌'} ${isAccepted ? 'Request Accepted' : 'Request Rejected'}</h3>
            <p><strong>${req.user.name}</strong> ${isAccepted ? 'accepted' : 'rejected'} your ${requestTypeText}.</p>
            ${isAccepted ? '<p>You can now connect with them. Log in to start chatting!</p>' : '<p>You can send another request if you wish.</p>'}
          </div>`;
        await sendEmail({ to: fromUser.email, subject: isAccepted ? 'Request Accepted' : 'Request Rejected', html }, { kind: 'system' });
      }
    } catch (e) {
      console.warn('Failed to send request response email:', e.message);
    }
    
    // If rejected, delete the request so User A can send again
    if (!isAccepted) {
      await Request.findByIdAndDelete(requestId);
      console.log('Request deleted after rejection:', requestId);
      // If this was a chat request, remove the pending chat
      if (reqDoc.type === 'chat') {
        try {
          const Chat = (await import('../models/Chat.js')).default;
          const ids = [String(reqDoc.from), String(reqDoc.to)].sort();
          const pairKey = `${ids[0]}_${ids[1]}`;
          const del = await Chat.deleteOne({ pairKey, isPending: true });
          if (!del.deletedCount) {
            await Chat.deleteOne({ users: { $all: [reqDoc.from, reqDoc.to] }, isPending: true });
          }
        } catch {}
      }
    }
    
    // If accepted and not a photo request, ensure chat exists and is not pending
    if (isAccepted && reqDoc.type !== 'photo') {
      const Chat = (await import('../models/Chat.js')).default;
      const ids = [String(reqDoc.from), String(reqDoc.to)].sort();
      const pairKey = `${ids[0]}_${ids[1]}`;
      let existingChat = await Chat.findOne({ pairKey });
      if (!existingChat) {
        // Fallback to legacy lookup then set pairKey
        existingChat = await Chat.findOne({ users: { $all: [reqDoc.from, reqDoc.to] } });
      }
      if (!existingChat) {
        await Chat.create({ users: [reqDoc.from, reqDoc.to], pairKey, isPending: false, messages: [] });
      } else {
        if (existingChat.isPending) existingChat.isPending = false;
        if (!existingChat.pairKey) existingChat.pairKey = pairKey;
        await existingChat.save();
      }
      // Additionally, auto-establish mutual follow (both directions) to emulate Instagram-like connect on accept
      try {
        const mkAccepted = async (from, to) => {
          const ex = await Request.findOne({ from, to, type: 'follow' });
          if (ex) {
            if (ex.status !== 'accepted') { ex.status = 'accepted'; await ex.save(); }
          } else {
            await Request.create({ from, to, type: 'follow', status: 'accepted' });
          }
        };
        await mkAccepted(reqDoc.from, reqDoc.to);
        await mkAccepted(reqDoc.to, reqDoc.from);
      } catch {}
    }
    
    // Real-time notify both users for photo request decisions
    try {
      if (reqDoc.type === 'photo' && req.io) {
        const payload = { kind: reqDoc.status === 'accepted' ? 'photo:approved' : 'photo:rejected', from: String(reqDoc.from), to: String(reqDoc.to) };
        req.io.emit(`user:${reqDoc.from}`, payload);
        req.io.emit(`user:${reqDoc.to}`, payload);
      }
    } catch {}

    // Real-time notification for request response
    try {
      if (req.io) {
        req.io.emit(`user:${reqDoc.from}`, { 
          kind: 'notification', 
          type: isAccepted ? 'request_accepted' : 'request_rejected',
          message: isAccepted 
            ? `${req.user.name} accepted your request` 
            : `${req.user.name} rejected your request`
        });
      }
    } catch {}
    
    // Notify admins of request status change
    try {
      if (req.io) {
        req.io.emit('admin:request', { action: reqDoc.status, type: reqDoc.type, requestId: String(reqDoc._id) });
      }
    } catch {}
    
    res.json({ 
      message: isAccepted ? 'Request accepted' : 'Request rejected', 
      status: reqDoc.status,
      deleted: !isAccepted 
    });
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
    
    // 1) Try to cancel a pending request SENT by current user
    let deleted = await Request.findOneAndDelete({
      from: req.user._id,
      to: userId,
      status: 'pending'
    });

    if (deleted) {
      return res.json({ message: 'Request cancelled successfully' });
    }

    // 2) If not found, try to cancel a pending request RECEIVED from that user (treat as reject)
    const incoming = await Request.findOneAndDelete({
      from: userId,
      to: req.user._id,
      status: 'pending'
    });

    if (incoming) {
      // Notify the original sender that their request was rejected
      try {
        const Notification = (await import('../models/Notification.js')).default;
        await Notification.create({
          userId: incoming.from,
          type: 'system',
          title: 'Request Rejected',
          message: `${req.user.name} rejected your request`,
          read: false,
          data: { relatedUser: req.user._id, requestId: String(incoming._id), kind: 'request_rejected' }
        });
      } catch (e) {
        console.warn('Failed to create rejection notification on cancel:', e.message);
      }

      return res.json({ message: 'Incoming request rejected' });
    }

    // Nothing to cancel
    return res.status(404).json({ message: 'Pending request not found' });
  } catch (e) {
    console.error('Cancel request error:', e);
    res.status(400).json({ message: e.message });
  }
}

