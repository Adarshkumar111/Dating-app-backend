import HelpRequest from '../models/HelpRequest.js';
import Notification from '../models/Notification.js';
import Chat from '../models/Chat.js';

export async function sendHelpRequest(req, res) {
  try {
    const { issueType = '', issueDescription = '' } = req.body || {};
    const help = await HelpRequest.create({
      from: req.user._id,
      issueType,
      issueDescription,
      status: 'pending'
    });

    // Notify admins via socket to refresh notifications list
    try { req.io.emit('adminRequest', { kind: 'help:new', id: String(help._id) }); } catch {}

    return res.json({ ok: true, id: help._id });
  } catch (e) {
    console.error('sendHelpRequest error', e);
    return res.status(500).json({ message: 'Failed to submit help request' });
  }
}

export async function getHelpStatus(req, res) {
  try {
    const latest = await HelpRequest.findOne({ from: req.user._id }).sort({ createdAt: -1 }).lean();
    if (!latest) return res.json({ status: 'none' });
    return res.json({ status: latest.status, adminId: latest.adminId || null, id: String(latest._id) });
  } catch (e) {
    console.error('getHelpStatus error', e);
    return res.status(500).json({ message: 'Failed to fetch help status' });
  }
}

export async function respondHelp(req, res) {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Forbidden' });
    const { helpRequestId, action } = req.body || {};
    const help = await HelpRequest.findById(helpRequestId);
    if (!help) return res.status(404).json({ message: 'Help request not found' });

    if (action === 'approve') {
      help.status = 'approved';
      help.adminId = req.user._id;
      await help.save();
      // Ensure chat between admin and user is unblocked (in case it was previously closed)
      try {
        const chat = await Chat.findOne({ users: { $all: [help.from, help.adminId] } });
        if (chat) {
          if (chat.isBlocked) {
            chat.isBlocked = false;
            chat.blockedBy = null;
            await chat.save();
            req.io.to(String(chat._id)).emit('chatUnblocked');
          }
        }
      } catch (_) {}
      await Notification.create({
        userId: help.from,
        type: 'system',
        title: 'Help Request Approved',
        message: 'You can now chat with admin regarding your issue.',
        data: { kind: 'request_accepted' }
      });
      try { req.io.emit('userEvent', { userId: String(help.from), kind: 'request:help:approved' }); } catch {}
    } else if (action === 'reject') {
      help.status = 'rejected';
      await help.save();
      await Notification.create({
        userId: help.from,
        type: 'system',
        title: 'Help Request Rejected',
        message: 'Your help request was rejected by admin.',
        data: { kind: 'request_rejected' }
      });
      try { req.io.emit('userEvent', { userId: String(help.from), kind: 'request:help:rejected' }); } catch {}
    } else if (action === 'resolve') {
      help.status = 'resolved';
      await help.save();
      // Block chat between admin and user (if exists)
      try {
        let chat = await Chat.findOne({ users: { $all: [help.from, help.adminId] } });
        if (chat) {
          chat.isBlocked = true;
          chat.blockedBy = req.user._id;
          await chat.save();
          req.io.to(String(chat._id)).emit('chatBlocked', { blockedBy: String(req.user._id) });
        }
      } catch (_) {}
      await Notification.create({
        userId: help.from,
        type: 'system',
        title: 'Help Request Resolved',
        message: 'Your help query has been marked resolved by admin. Chat is now closed.',
        data: { kind: 'request_resolved' }
      });
      try { req.io.emit('userEvent', { userId: String(help.from), kind: 'request:help:resolved' }); } catch {}
    }

    try { req.io.emit('adminRequest', { kind: 'help:update', id: String(help._id) }); } catch {}

    return res.json({ ok: true });
  } catch (e) {
    console.error('respondHelp error', e);
    return res.status(500).json({ message: 'Failed to process help request' });
  }
}

export async function listHelpRequests(req, res) {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Forbidden' });
    const { status } = req.query || {};
    const q = {};
    if (status) q.status = status;
    const items = await HelpRequest.find(q)
      .populate('from', 'name email profilePhoto')
      .populate('adminId', 'name email profilePhoto')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    
    // For each help request, count unread messages from user to admin
    const itemsWithUnread = await Promise.all(items.map(async (item) => {
      let unreadCount = 0;
      let totalMessages = 0;
      
      if (item.adminId && item.from) {
        // Find chat between admin and user
        const chat = await Chat.findOne({
          users: { $all: [item.adminId._id, item.from._id] }
        }).lean();
        
        if (chat && chat.messages) {
          totalMessages = chat.messages.length;
          // Count messages from user that admin hasn't seen
          unreadCount = chat.messages.filter(msg => 
            String(msg.sender) === String(item.from._id) && 
            !msg.seenBy.some(id => String(id) === String(item.adminId._id))
          ).length;
        }
      }
      
      // Format count as "9+" if more than 9
      const unreadDisplay = unreadCount > 9 ? '9+' : unreadCount;
      const totalDisplay = totalMessages > 9 ? '9+' : totalMessages;
      
      return {
        ...item,
        unreadCount,
        unreadDisplay,
        totalMessages,
        totalDisplay
      };
    }));
    
    return res.json(itemsWithUnread);
  } catch (e) {
    console.error('listHelpRequests error', e);
    return res.status(500).json({ message: 'Failed to fetch help requests' });
  }
}

export async function getHelpRequest(req, res) {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Forbidden' });
    const { id } = req.params;
    const item = await HelpRequest.findById(id)
      .populate('from', 'name email profilePhoto about')
      .populate('adminId', 'name email profilePhoto')
      .lean();
    if (!item) return res.status(404).json({ message: 'Not found' });
    return res.json(item);
  } catch (e) {
    console.error('getHelpRequest error', e);
    return res.status(500).json({ message: 'Failed to fetch help request' });
  }
}

export async function deleteHelpRequest(req, res) {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Forbidden' });
    const { id } = req.params;
    const deleted = await HelpRequest.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Not found' });
    try { req.io.emit('adminRequest', { kind: 'help:deleted', id: String(id) }); } catch {}
    return res.json({ ok: true });
  } catch (e) {
    console.error('deleteHelpRequest error', e);
    return res.status(500).json({ message: 'Failed to delete help request' });
  }
}

export async function getHelpRequestStats(req, res) {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Forbidden' });
    
    // Count pending help requests
    const pendingCount = await HelpRequest.countDocuments({ status: 'pending' });
    
    // Count approved help requests with unread messages
    const approvedRequests = await HelpRequest.find({ status: 'approved' })
      .populate('from', '_id')
      .populate('adminId', '_id')
      .lean();
    
    let totalUnreadMessages = 0;
    
    for (const request of approvedRequests) {
      if (request.adminId && request.from) {
        const chat = await Chat.findOne({
          users: { $all: [request.adminId._id, request.from._id] }
        }).lean();
        
        if (chat && chat.messages) {
          const unreadCount = chat.messages.filter(msg => 
            String(msg.sender) === String(request.from._id) && 
            !msg.seenBy.some(id => String(id) === String(request.adminId._id))
          ).length;
          totalUnreadMessages += unreadCount;
        }
      }
    }
    
    const totalCount = pendingCount + totalUnreadMessages;
    const totalDisplay = totalCount > 9 ? '9+' : totalCount;
    
    return res.json({
      pendingCount,
      totalUnreadMessages,
      totalCount,
      totalDisplay
    });
  } catch (e) {
    console.error('getHelpRequestStats error', e);
    return res.status(500).json({ message: 'Failed to fetch help request stats' });
  }
}
