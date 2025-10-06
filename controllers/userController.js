import User from '../models/User.js';
import Request from '../models/Request.js';
// Lazy imports inside functions to avoid circular deps/heavy startup

export async function me(req, res) {
  const u = req.user.toObject();
  delete u.passwordHash;
  delete u.resetPasswordToken;
  // User can see their own contact and email
  res.json(u);
}

// Instagram-style feed with rejected users and accepted friends excluded
export async function list(req, res) {
  // Prevent admins from accessing user discovery
  if (req.user.isAdmin) {
    return res.status(403).json({ message: 'Admins cannot access user discovery' });
  }
  
  const gender = req.user.gender === 'male' ? 'female' : 'male';
  const page = parseInt(req.query.page || '1');
  const pageSize = 10;

  // Build filter query from query params
  const q = { gender, status: 'approved', isAdmin: false };
  const { ageMin, ageMax, education, occupation, name } = req.query;
  if (ageMin || ageMax) {
    q.age = {};
    if (ageMin) q.age.$gte = parseInt(ageMin);
    if (ageMax) q.age.$lte = parseInt(ageMax);
  }
  if (education) {
    q.education = { $regex: new RegExp(education, 'i') };
  }
  if (occupation) {
    q.occupation = { $regex: new RegExp(occupation, 'i') };
  }
  if (name) {
    q.name = { $regex: new RegExp(name, 'i') };
  }
  
  // Get accepted friends to exclude from discover
  const acceptedRequests = await Request.find({
    $or: [
      { from: req.user._id, status: 'accepted' },
      { to: req.user._id, status: 'accepted' }
    ]
  });
  
  const friendIds = acceptedRequests.map(r => 
    String(r.from) === String(req.user._id) ? r.to : r.from
  );
  
  // Exclude rejected users, self, and accepted friends
  const excludeIds = [...(req.user.rejectedUsers || []), req.user._id, ...friendIds];
  
  const baseQuery = { ...q, _id: { $nin: excludeIds } };

  // Load admin-controlled profile display flags (before query to build projection)
  let displayFlags = {
    name: true,
    age: true,
    location: true,
    education: true,
    occupation: true,
    maritalStatus: true,
    about: true,
    profilePhoto: true,
    fatherName: false,
    motherName: false,
    contact: false,
    email: false,
    itNumber: false
  };
  try {
    const { default: AppSettings } = await import('../models/AppSettings.js');
    const s = await AppSettings.findOne().lean();
    if (s && s.profileDisplayFields) {
      displayFlags = { ...displayFlags, ...s.profileDisplayFields };
    }
  } catch {}
  
  // Build projection based on flags (always include isPremium for badges)
  const projectionFields = ['isPremium'];
  if (displayFlags.name) projectionFields.push('name');
  if (displayFlags.age) projectionFields.push('age');
  if (displayFlags.location) projectionFields.push('location');
  if (displayFlags.education) projectionFields.push('education');
  if (displayFlags.occupation) projectionFields.push('occupation');
  if (displayFlags.maritalStatus) projectionFields.push('maritalStatus');
  if (displayFlags.about) projectionFields.push('about');
  if (displayFlags.profilePhoto) projectionFields.push('profilePhoto');
  if (displayFlags.fatherName) projectionFields.push('fatherName');
  if (displayFlags.motherName) projectionFields.push('motherName');
  if (displayFlags.contact) projectionFields.push('contact');
  if (displayFlags.email) projectionFields.push('email');
  if (displayFlags.itNumber) projectionFields.push('itNumber');

  const [items, total] = await Promise.all([
    User.find(baseQuery)
      .select(projectionFields.join(' '))
      .skip((page-1)*pageSize)
      .limit(pageSize),
    User.countDocuments(baseQuery)
  ]);
  
  // For each user, check request status (chat vs photo)
  const itemsWithStatus = await Promise.all(items.map(async (item) => {
    const [chatReq, photoReq] = await Promise.all([
      Request.findOne({
        type: { $in: ['follow', 'chat', 'both'] },
        $or: [
          { from: req.user._id, to: item._id },
          { from: item._id, to: req.user._id }
        ]
      }),
      Request.findOne({
        type: 'photo',
        $or: [
          { from: req.user._id, to: item._id },
          { from: item._id, to: req.user._id }
        ]
      })
    ]);
    
    const obj = item.toObject();
    
    // Always hide contact and email from feed
    obj.contact = undefined;
    obj.email = undefined;
    obj.itCardPhoto = undefined;
    
    const isChatConnected = !!(chatReq && chatReq.status === 'accepted');
    const isPhotoAllowed = !!(photoReq && photoReq.status === 'accepted');
    const canSeePhotos = isChatConnected && isPhotoAllowed;
    
    // Hide only sensitive details until chat connected (keep basic profile facts visible)
    if (!isChatConnected) {
      obj.age = undefined;
      obj.location = undefined;
      // Keep education/occupation/maritalStatus visible in discover
    }
    // Hide photos until both chat connected and photo request accepted
    if (!canSeePhotos) {
      obj.profilePhoto = undefined;
      obj.galleryImages = undefined;
    }
    
    // Apply admin display flags (final enforcement)
    if (!displayFlags.name) obj.name = undefined;
    if (!displayFlags.age) obj.age = undefined;
    if (!displayFlags.location) obj.location = undefined;
    if (!displayFlags.education) obj.education = undefined;
    if (!displayFlags.occupation) obj.occupation = undefined;
    if (!displayFlags.about) obj.about = undefined;
    if (!displayFlags.profilePhoto) obj.profilePhoto = undefined;
    if (!displayFlags.fatherName) obj.fatherName = undefined;
    if (!displayFlags.motherName) obj.motherName = undefined;
    if (!displayFlags.contact) obj.contact = undefined;
    if (!displayFlags.email) obj.email = undefined;
    
    obj.requestStatus = chatReq ? chatReq.status : 'none';
    obj.requestDirection = chatReq ? (String(chatReq.from) === String(req.user._id) ? 'sent' : 'received') : null;
    obj.photoRequestStatus = photoReq ? photoReq.status : 'none';
    obj.photoRequestDirection = photoReq ? (String(photoReq.from) === String(req.user._id) ? 'sent' : 'received') : null;
    
    return obj;
  }));
  
  res.json({ items: itemsWithStatus, total, page, pageSize });
}

// Get accepted friends list with unread message count
export async function getFriends(req, res) {
  // Prevent admins from accessing friends/messages
  if (req.user.isAdmin) {
    return res.status(403).json({ message: 'Admins cannot access messaging features' });
  }
  
  try {
    const Chat = (await import('../models/Chat.js')).default;
    
    // Find all accepted requests
    const acceptedRequests = await Request.find({
      $or: [
        { from: req.user._id, status: 'accepted' },
        { to: req.user._id, status: 'accepted' }
      ]
    }).populate('from to', 'name profilePhoto about age location');
    
    const friendsData = await Promise.all(acceptedRequests.map(async (request) => {
      // Get the other user
      const friend = String(request.from._id) === String(req.user._id) ? request.to : request.from;
      
      // Find chat between users
      const chat = await Chat.findOne({
        users: { $all: [req.user._id, friend._id] }
      });
      
      let unreadCount = 0;
      let isBlocked = false;
      let blockedBy = null;
      
      if (chat) {
        // Count unread messages (not seen by current user and not sent by current user)
        unreadCount = chat.messages.filter(m => 
          String(m.sender) !== String(req.user._id) && 
          !m.seenBy.includes(req.user._id) &&
          !m.deletedFor.includes(req.user._id) &&
          !m.deletedForEveryone
        ).length;
        
        isBlocked = chat.isBlocked;
        blockedBy = chat.blockedBy;
      }
      
      return {
        _id: friend._id,
        name: friend.name,
        profilePhoto: friend.profilePhoto,
        about: friend.about,
        age: friend.age,
        location: friend.location,
        unreadCount,
        isBlocked,
        blockedBy: blockedBy ? String(blockedBy) : null,
        chatId: chat?._id
      };
    }));
    
    res.json({ friends: friendsData });
  } catch (e) {
    console.error('Get friends error:', e);
    res.status(400).json({ message: e.message });
  }
}

export async function getProfile(req, res) {
  const target = await User.findById(req.params.id).select('-passwordHash -resetPasswordToken');
  if (!target) return res.status(404).json({ message: 'Not found' });
  
  const isOwnProfile = String(req.user._id) === String(target._id);
  const isAdmin = req.user.isAdmin;
  // Hide admin profiles from regular users
  if (target.isAdmin && !isOwnProfile && !isAdmin) {
    return res.status(404).json({ message: 'Not found' });
  }
  
  // Check if either user has blocked the other
  const currentUser = req.user;
  const isBlockedByMe = currentUser.blockedUsers?.includes(String(target._id));
  const isBlockedByThem = target.blockedUsers?.includes(String(req.user._id));
  
  // If blocked by target user, return minimal info (they can't view profile)
  if (isBlockedByThem && !isOwnProfile && !isAdmin) {
    return res.status(403).json({ 
      message: 'Profile not accessible',
      blocked: true,
      name: target.name // Only show name
    });
  }
  
  // Check chat connection and photo permission separately
  const [connection, photoPermission] = await Promise.all([
    Request.findOne({
      type: { $in: ['follow', 'chat', 'both'] },
      $or: [
        { from: req.user._id, to: target._id, status: 'accepted' },
        { from: target._id, to: req.user._id, status: 'accepted' }
      ]
    }),
    Request.findOne({
      type: 'photo',
      $or: [
        { from: req.user._id, to: target._id, status: 'accepted' },
        { from: target._id, to: req.user._id, status: 'accepted' }
      ]
    })
  ]);
  
  const data = target.toObject();
  
  // Always hide sensitive fields from other users
  if (!isOwnProfile && !isAdmin) {
    data.contact = undefined;
    data.email = undefined;
    data.itCardPhoto = undefined;
    data.itNumber = undefined;
  }
  
  // If I blocked them, hide their bio/about
  if (isBlockedByMe && !isOwnProfile && !isAdmin) {
    data.about = undefined;
  }
  
  // Privacy: hide details until chat connected; hide photos until chat connected AND photo permission
  if (!isOwnProfile && !isAdmin) {
    if (!connection) {
      data.age = undefined;
      data.location = undefined;
      data.education = undefined;
      data.occupation = undefined;
    }
    if (!(connection && photoPermission)) {
      data.profilePhoto = undefined;
      data.galleryImages = undefined;
    }
  }
  
  // Common flags
  data.isConnected = !!connection;
  data.isPhotoAccessible = !!photoPermission;
  data.isBlockedByMe = isBlockedByMe;
  data.isBlockedByThem = isBlockedByThem;

  // Apply admin-controlled profile display flags for sensitive fields when connected
  if (!isOwnProfile && !isAdmin && data.isConnected) {
    let displayFlags = { email: false, contact: false, itNumber: false };
    try {
      const { default: AppSettings } = await import('../models/AppSettings.js');
      const s = await AppSettings.findOne().lean();
      if (s && s.profileDisplayFields) {
        displayFlags = { ...displayFlags, ...s.profileDisplayFields };
      }
    } catch {}
    if (displayFlags.email) data.email = target.email;
    if (displayFlags.contact) data.contact = target.contact;
    if (displayFlags.itNumber) data.itNumber = target.itNumber;
  }

  // Also expose current photo request status/direction for the viewer
  const photoReq = await Request.findOne({
    type: 'photo',
    $or: [
      { from: req.user._id, to: target._id },
      { from: target._id, to: req.user._id }
    ]
  });
  data.photoRequestStatus = photoReq ? photoReq.status : 'none';
  data.photoRequestDirection = photoReq ? (String(photoReq.from) === String(req.user._id) ? 'sent' : 'received') : null;

  return res.json(data);
}

export async function rejectUser(req, res) {
  try {
    const { userId } = req.body;
    const user = req.user;
    
    if (!user.rejectedUsers) user.rejectedUsers = [];
    if (!user.rejectedUsers.includes(userId)) {
      user.rejectedUsers.push(userId);
      await user.save();
    }
    
    res.json({ message: 'User removed from feed' });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
}

export async function blockUser(req, res) {
  try {
    const { userId } = req.body;
    const user = req.user;
    
    if (!user.blockedUsers) user.blockedUsers = [];
    if (!user.blockedUsers.includes(userId)) {
      user.blockedUsers.push(userId);
      await user.save();
      
      // Remove connection (accepted request) between users
      // They'll need to send/accept request again after unblocking
      await Request.deleteMany({
        $or: [
          { from: user._id, to: userId, status: 'accepted' },
          { from: userId, to: user._id, status: 'accepted' }
        ]
      });
      
      // Also delete pending requests
      await Request.deleteMany({
        $or: [
          { from: user._id, to: userId, status: 'pending' },
          { from: userId, to: user._id, status: 'pending' }
        ]
      });
    }
    
    res.json({ message: 'User blocked successfully', silent: true });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
}

export async function unblockUser(req, res) {
  try {
    const { userId } = req.body;
    const user = req.user;
    
    if (!user.blockedUsers) user.blockedUsers = [];
    user.blockedUsers = user.blockedUsers.filter(id => String(id) !== String(userId));
    await user.save();
    
    res.json({ message: 'User unblocked successfully' });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
}

export async function getBlockedUsers(req, res) {
  try {
    const user = await req.user.populate('blockedUsers', 'name profilePhoto email');
    res.json({ blockedUsers: user.blockedUsers || [] });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
}

// Permanently delete chat(s) with a specific blocked user
export async function deleteChatsWithUser(req, res) {
  try {
    const { userId } = req.body;
    const currentUser = req.user;

    // Ensure the target is actually blocked by current user
    const isBlocked = (currentUser.blockedUsers || []).some(id => String(id) === String(userId));
    if (!isBlocked) {
      return res.status(403).json({ message: 'User is not blocked' });
    }

    const { default: Chat } = await import('../models/Chat.js');
    const { invalidateChatCache } = await import('../services/redisChatService.js');

    // Find all chats between the two users (normally 1)
    const chats = await Chat.find({
      users: { $all: [currentUser._id, userId] }
    }).select('_id');

    // Invalidate caches first (best effort)
    await Promise.all(chats.map(c => invalidateChatCache(c._id).catch(() => {})));

    // Delete chats
    await Chat.deleteMany({ users: { $all: [currentUser._id, userId] } });

    return res.json({ ok: true, deleted: chats.length });
  } catch (e) {
    console.error('Delete chats with user error:', e);
    res.status(400).json({ message: e.message });
  }
}
