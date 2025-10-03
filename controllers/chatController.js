import Chat from '../models/Chat.js';
import User from '../models/User.js';

// Get or create chat between two users
export async function getChatBetween(req, res) {
  try {
    const otherUserId = req.params.userId;
    const currentUserId = req.user._id;

    // Check if either user has blocked the other
    const currentUser = await User.findById(currentUserId);
    const otherUser = await User.findById(otherUserId);
    
    const isBlockedByMe = currentUser.blockedUsers?.includes(otherUserId);
    const isBlockedByThem = otherUser.blockedUsers?.includes(currentUserId);
    
    if (isBlockedByMe || isBlockedByThem) {
      return res.status(403).json({ 
        message: 'Cannot access chat. User is blocked.',
        isBlockedByMe,
        isBlockedByThem
      });
    }

    // Find existing chat
    let chat = await Chat.findOne({
      users: { $all: [currentUserId, otherUserId] }
    }).populate('users', 'name profilePhoto');

    // Create if doesn't exist
    if (!chat) {
      chat = await Chat.create({
        users: [currentUserId, otherUserId],
        messages: []
      });
      chat = await Chat.findById(chat._id).populate('users', 'name profilePhoto');
    }

    // Filter messages deleted by current user (but keep deletedForEveryone to show indicator)
    const filteredMessages = chat.messages
      .filter(m => !m.deletedFor.some(id => String(id) === String(currentUserId)))
      .map(m => ({
        _id: m._id,
        text: m.text,
        messageType: m.messageType,
        mediaUrl: m.mediaUrl,
        mediaDuration: m.mediaDuration,
        sender: m.sender,
        sentAt: m.sentAt,
        deliveredTo: m.deliveredTo || [],
        seenBy: m.seenBy || [],
        reactions: m.reactions || [],
        deletedForEveryone: m.deletedForEveryone || false,
        fromSelf: String(m.sender) === String(currentUserId)
      }));

    res.json({
      chatId: chat._id,
      users: chat.users,
      messages: filteredMessages,
      isBlocked: chat.isBlocked,
      isBlockedByMe: currentUser.blockedUsers?.includes(otherUserId) || false,
      isBlockedByThem: otherUser.blockedUsers?.includes(String(currentUserId)) || false
    });
  } catch (e) {
    console.error('Get chat error:', e);
    res.status(400).json({ message: e.message });
  }
}

export async function getMessages(req, res) {
  const chat = await Chat.findById(req.params.chatId);
  if (!chat) return res.status(404).json({ message: 'Chat not found' });
  if (!chat.users.some(u => String(u) === String(req.user._id))) return res.status(403).json({ message: 'Not in chat' });
  if (chat.isBlocked) return res.status(403).json({ message: 'Chat blocked' });
  
  // Filter deleted messages (but keep deletedForEveryone to show indicator)
  const filteredMessages = chat.messages
    .filter(m => !m.deletedFor.some(id => String(id) === String(req.user._id)))
    .map(m => ({
      _id: m._id,
      text: m.text,
      messageType: m.messageType,
      mediaUrl: m.mediaUrl,
      mediaDuration: m.mediaDuration,
      sender: m.sender,
      sentAt: m.sentAt,
      deliveredTo: m.deliveredTo || [],
      seenBy: m.seenBy || [],
      reactions: m.reactions || [],
      deletedForEveryone: m.deletedForEveryone || false,
      fromSelf: String(m.sender) === String(req.user._id)
    }));
  
  res.json(filteredMessages);
}

export async function sendMessage(req, res) {
  try {
    const chat = await Chat.findById(req.params.chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    if (!chat.users.some(u => String(u) === String(req.user._id))) return res.status(403).json({ message: 'Not in chat' });
    if (chat.isBlocked) return res.status(403).json({ message: 'Chat blocked' });
    
    const { messageText, messageType, mediaUrl, mediaDuration } = req.body;
    
    const message = {
      sender: req.user._id,
      text: messageText || '',
      messageType: messageType || 'text',
      mediaUrl: mediaUrl || null,
      mediaDuration: mediaDuration || null,
      sentAt: new Date(),
      deliveredTo: [],
      seenBy: [],
      deletedFor: [],
      deletedForEveryone: false,
      reactions: []
    };
    
    chat.messages.push(message);
    await chat.save();
    
    // Emit to socket room
    const messageData = {
      _id: chat.messages[chat.messages.length - 1]._id,
      sender: req.user._id,
      text: message.text,
      messageType: message.messageType,
      mediaUrl: message.mediaUrl,
      mediaDuration: message.mediaDuration,
      sentAt: message.sentAt,
      deliveredTo: [],
      seenBy: [],
      reactions: []
    };
    
    req.io.to(req.params.chatId).emit('message', messageData);
    
    // Emit global notification to the recipient
    const recipient = chat.users.find(u => String(u) !== String(req.user._id));
    if (recipient) {
      req.io.emit(`user:${recipient}:newMessage`, {
        senderId: req.user._id,
        senderName: req.user.name,
        senderPhoto: req.user.profilePhoto,
        chatId: req.params.chatId,
        text: message.text,
        messageType: message.messageType
      });
    }
    
    res.json({ ok: true, message: messageData });
  } catch (e) {
    console.error('Send message error:', e);
    res.status(400).json({ message: e.message });
  }
}

export async function deleteMessage(req, res) {
  try {
    const { messageId, deleteType } = req.body; // deleteType: 'forMe' or 'forEveryone'
    const chat = await Chat.findById(req.params.chatId);
    
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    if (!chat.users.some(u => String(u) === String(req.user._id))) return res.status(403).json({ message: 'Not in chat' });
    
    const message = chat.messages.id(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    
    // Check if user is the sender
    const isSender = String(message.sender) === String(req.user._id);
    
    if (deleteType === 'forEveryone') {
      if (!isSender) return res.status(403).json({ message: 'Can only delete own messages for everyone' });
      
      // Check if within 2 hours
      const hoursSinceSent = (Date.now() - new Date(message.sentAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceSent > 2) {
        return res.status(400).json({ message: 'Can only delete for everyone within 2 hours' });
      }
      
      message.deletedForEveryone = true;
      message.text = ''; // Clear text
      message.mediaUrl = null; // Clear media
      
      // Emit delete event to all users in chat
      req.io.to(req.params.chatId).emit('messageDeleted', { messageId, deleteType: 'forEveryone' });
    } else {
      // Delete for me
      if (!message.deletedFor.includes(req.user._id)) {
        message.deletedFor.push(req.user._id);
      }
    }
    
    await chat.save();
    res.json({ ok: true, message: 'Message deleted' });
  } catch (e) {
    console.error('Delete message error:', e);
    res.status(400).json({ message: e.message });
  }
}

export async function addReaction(req, res) {
  try {
    const { messageId, emoji } = req.body;
    const chat = await Chat.findById(req.params.chatId);
    
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    if (!chat.users.some(u => String(u) === String(req.user._id))) return res.status(403).json({ message: 'Not in chat' });
    
    const message = chat.messages.id(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    
    // Remove existing reaction from this user
    message.reactions = message.reactions.filter(r => String(r.user) !== String(req.user._id));
    
    // Add new reaction
    if (emoji) {
      message.reactions.push({ user: req.user._id, emoji });
    }
    
    await chat.save();
    
    // Emit to socket room
    req.io.to(req.params.chatId).emit('reactionUpdated', { 
      messageId, 
      reactions: message.reactions 
    });
    
    res.json({ ok: true, reactions: message.reactions });
  } catch (e) {
    console.error('Add reaction error:', e);
    res.status(400).json({ message: e.message });
  }
}

export async function uploadMedia(req, res) {
  try {
    const chat = await Chat.findById(req.params.chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    if (!chat.users.some(u => String(u) === String(req.user._id))) return res.status(403).json({ message: 'Not in chat' });
    if (chat.isBlocked) return res.status(403).json({ message: 'Chat blocked' });
    
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    
    const { uploadToImageKit } = await import('../utils/imageUtil.js');
    const mediaUrl = await uploadToImageKit(req.file, 'matrimonial/chat');
    
    // Determine message type based on MIME type
    let messageType = 'image';
    if (req.file.mimetype.startsWith('video/')) {
      messageType = 'video';
    } else if (req.file.mimetype.startsWith('audio/')) {
      messageType = 'voice';
    }
    
    // Create message with media
    const message = {
      sender: req.user._id,
      text: '',
      messageType,
      mediaUrl,
      mediaDuration: req.body.duration ? parseFloat(req.body.duration) : null,
      sentAt: new Date(),
      deliveredTo: [],
      seenBy: [],
      deletedFor: [],
      deletedForEveryone: false,
      reactions: []
    };
    
    chat.messages.push(message);
    await chat.save();
    
    // Emit to socket room
    const messageData = {
      _id: chat.messages[chat.messages.length - 1]._id,
      sender: req.user._id,
      text: message.text,
      messageType: message.messageType,
      mediaUrl: message.mediaUrl,
      mediaDuration: message.mediaDuration,
      sentAt: message.sentAt,
      deliveredTo: [],
      seenBy: [],
      reactions: []
    };
    
    req.io.to(req.params.chatId).emit('message', messageData);
    
    // Emit global notification to the recipient  
    const recipient = chat.users.find(u => String(u) !== String(req.user._id));
    if (recipient) {
      req.io.emit(`user:${recipient}:newMessage`, {
        senderId: req.user._id,
        senderName: req.user.name,
        senderPhoto: req.user.profilePhoto,
        chatId: req.params.chatId,
        text: '',
        messageType: message.messageType
      });
    }
    
    res.json({ ok: true, mediaUrl, message: messageData });
  } catch (e) {
    console.error('Upload media error:', e);
    res.status(400).json({ message: e.message });
  }
}

export async function markMessagesAsSeen(req, res) {
  try {
    const chat = await Chat.findById(req.params.chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    if (!chat.users.some(u => String(u) === String(req.user._id))) return res.status(403).json({ message: 'Not in chat' });
    
    // Mark all messages from other users as seen
    let updated = false;
    chat.messages.forEach(msg => {
      if (String(msg.sender) !== String(req.user._id) && !msg.seenBy.includes(req.user._id)) {
        msg.seenBy.push(req.user._id);
        updated = true;
      }
    });
    
    if (updated) {
      await chat.save();
      // Emit seen status to other users
      req.io.to(req.params.chatId).emit('messagesSeen', { userId: req.user._id });
    }
    
    res.json({ ok: true });
  } catch (e) {
    console.error('Mark seen error:', e);
    res.status(400).json({ message: e.message });
  }
}

export async function markMessagesAsDelivered(req, res) {
  try {
    const chat = await Chat.findById(req.params.chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    
    // Mark all messages as delivered to current user
    let updated = false;
    chat.messages.forEach(m => {
      if (String(m.sender) !== String(req.user._id) && !m.deliveredTo.includes(req.user._id)) {
        m.deliveredTo.push(req.user._id);
        updated = true;
      }
    });
    
    if (updated) {
      await chat.save();
      // Emit delivered status to other users
      req.io.to(req.params.chatId).emit('messagesDelivered', { userId: req.user._id });
    }
    
    res.json({ ok: true });
  } catch (e) {
    console.error('Mark delivered error:', e);
    res.status(400).json({ message: e.message });
  }
}

export async function blockChat(req, res) {
  try {
    const chat = await Chat.findById(req.params.chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    
    // Check if user is part of this chat
    if (!chat.users.some(u => String(u) === String(req.user._id))) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    chat.isBlocked = true;
    chat.blockedBy = req.user._id;
    await chat.save();
    
    // Emit block event to other user
    req.io.to(req.params.chatId).emit('chatBlocked', { blockedBy: req.user._id });
    
    res.json({ ok: true, message: 'Chat blocked successfully' });
  } catch (e) {
    console.error('Block chat error:', e);
    res.status(400).json({ message: e.message });
  }
}

export async function unblockChat(req, res) {
  try {
    const chat = await Chat.findById(req.params.chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    
    // Check if user is part of this chat
    if (!chat.users.some(u => String(u) === String(req.user._id))) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    // Only the blocker can unblock
    if (String(chat.blockedBy) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Only the blocker can unblock' });
    }
    
    chat.isBlocked = false;
    chat.blockedBy = null;
    await chat.save();
    
    // Emit unblock event to other user
    req.io.to(req.params.chatId).emit('chatUnblocked');
    
    res.json({ ok: true, message: 'Chat unblocked successfully' });
  } catch (e) {
    console.error('Unblock chat error:', e);
    res.status(400).json({ message: e.message });
  }
}
