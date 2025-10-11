import User from '../models/User.js';
import Request from '../models/Request.js';
// Lazy imports inside functions to avoid circular deps/heavy startup

export async function me(req, res) {
  const u = req.user.toObject();
  delete u.passwordHash;
  delete u.resetPasswordToken;
  // Compute request limits and remaining (read-only)
  try {
    const today = new Date();
    const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const settingsMod = await import('../models/Settings.js');
    const PremiumPlanMod = await import('../models/PremiumPlan.js');
    const Settings = settingsMod.default;
    const PremiumPlan = PremiumPlanMod.default;
    const settings = await Settings.find();
    const settingsObj = {};
    settings.forEach(s => { settingsObj[s.key] = s.value; });
    const freeLimit = Number(settingsObj.freeUserRequestLimit) || 2;
    let limit = freeLimit;
    const hasActivePremium = u.isPremium && u.premiumExpiresAt && new Date(u.premiumExpiresAt) > today;
    if (hasActivePremium) {
      let premiumLimit = Number(settingsObj.premiumUserRequestLimit) || undefined;
      if (u.premiumPlan) {
        try {
          const plan = await PremiumPlan.findById(u.premiumPlan).select('requestLimit');
          if (typeof plan?.requestLimit === 'number' && plan.requestLimit > 0) premiumLimit = plan.requestLimit;
        } catch {}
      }
      limit = (typeof premiumLimit === 'number' && premiumLimit > 0) ? premiumLimit : 20;
    }
    const effectiveTodayCount = (!u.requestsTodayAt || new Date(u.requestsTodayAt) < todayStart) ? 0 : (u.requestsToday || 0);
    const remaining = Math.max(0, limit - effectiveTodayCount);
    u.requestsLimit = limit;
    u.requestsRemaining = remaining;
  } catch {}
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
  const { ageMin, ageMax, education, occupation, state, district, name } = req.query;
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
  if (state) {
    q.state = { $regex: new RegExp(state, 'i') };
  }
  if (district) {
    q.district = { $regex: new RegExp(district, 'i') };
  }
  if (name) {
    q.name = { $regex: new RegExp(name, 'i') };
  }
  
  // Get accepted friends to exclude from discover
  const acceptedRequests = await Request.find({
    type: { $in: ['follow', 'chat', 'both'] },
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
  
  // Build projection based on flags (always include isPremium for badges, displayPriority for sorting, and isPublic for visibility)
  const projectionFields = ['isPremium', 'premiumTier', 'premiumPlan', 'displayPriority', 'isPublic'];
  if (displayFlags.name) projectionFields.push('name');
  if (displayFlags.age) projectionFields.push('age');
  if (displayFlags.location) projectionFields.push('location');
  if (displayFlags.education) projectionFields.push('education');
  if (displayFlags.occupation) projectionFields.push('occupation');
  if (displayFlags.maritalStatus) projectionFields.push('maritalStatus');
  if (displayFlags.about) projectionFields.push('about');
  if (displayFlags.profilePhoto) projectionFields.push('profilePhoto');
  // Include DOB when either DOB is enabled or age is enabled (to compute age)
  if (displayFlags.dateOfBirth || displayFlags.age) projectionFields.push('dateOfBirth');
  if (displayFlags.fatherName) projectionFields.push('fatherName');
  if (displayFlags.motherName) projectionFields.push('motherName');
  if (displayFlags.contact) projectionFields.push('contact');
  if (displayFlags.email) projectionFields.push('email');
  if (displayFlags.itNumber) projectionFields.push('itNumber');

  const [items, total] = await Promise.all([
    User.find(baseQuery)
      .select(projectionFields.join(' '))
      .populate('premiumPlan', 'tier name')
      .sort({ displayPriority: -1, createdAt: -1 }) // Sort by priority first, then newest
      .skip((page-1)*pageSize)
      .limit(pageSize),
    User.countDocuments(baseQuery)
  ]);
  
  // Check if viewing user is Diamond tier
  const viewingUser = await User.findById(req.user._id).populate('premiumPlan');
  const isDiamond = viewingUser?.isPremium && String(viewingUser?.premiumTier).toLowerCase() === 'diamond';
  const diamondFeatures = isDiamond && viewingUser?.premiumPlan?.advancedFeatures ? viewingUser.premiumPlan.advancedFeatures : null;
  
  // For each user, check request status (chat vs photo) and respect public profiles
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
    const isPublic = !!item.isPublic;
    
    // Diamond users with permissions can see private profiles and photos
    const canViewPrivate = isDiamond && diamondFeatures?.viewAllUsers;
    const canViewDiamondPhotos = isDiamond && diamondFeatures?.viewAllPhotos;
    const canSeePhotos = isPublic || (isChatConnected && isPhotoAllowed) || canViewDiamondPhotos;
    
    // Respect admin display flags for basic fields even if not connected.
    // Do NOT force-hide age/location here; final enforcement below uses displayFlags.
    // Keep education/occupation/maritalStatus visible in discover as before.
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
    // If age is enabled but missing, compute from DOB (server-side convenience for UI)
    if (displayFlags.age) {
      try {
        if ((obj.age === undefined || obj.age === null) && obj.dateOfBirth) {
          const d = new Date(obj.dateOfBirth);
          if (!isNaN(d.getTime())) {
            const today = new Date();
            let age = today.getFullYear() - d.getFullYear();
            const m = today.getMonth() - d.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
            if (age >= 0 && age < 130) obj.age = age;
          }
        }
      } catch {}
    }
    
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
    const UserModel = (await import('../models/User.js')).default;
    
    // Fetch all chats the user participates in (includes pending)
    const chats = await Chat.find({ users: req.user._id })
      .sort({ updatedAt: -1 })
      .lean();

    const friendsData = await Promise.all(chats.map(async (chat) => {
      // Find the other participant
      const otherUserId = String(chat.users.find(u => String(u) !== String(req.user._id)));
      const friend = await UserModel.findById(otherUserId).select('name profilePhoto about age location');
      if (!friend) return null;

      // Unread count for current user (ignore deleted/forEveryone)
      const unreadCount = (chat.messages || []).filter(m => 
        String(m.sender) !== String(req.user._id) &&
        !(m.deletedFor || []).some(id => String(id) === String(req.user._id)) &&
        !m.deletedForEveryone &&
        !(m.seenBy || []).some(id => String(id) === String(req.user._id))
      ).length;

      // Last message preview
      const lastMessage = (chat.messages || []).length ? chat.messages[chat.messages.length - 1] : null;

      // If pending, check if current user is recipient of a pending chat request to enable accept/reject buttons
      let pendingRequestId = null;
      if (chat.isPending) {
        const pendingReq = await Request.findOne({ type: 'chat', from: otherUserId, to: req.user._id, status: 'pending' }).select('_id');
        pendingRequestId = pendingReq?._id || null;
      }

      return {
        _id: friend._id,
        name: friend.name,
        profilePhoto: friend.profilePhoto,
        about: friend.about,
        age: friend.age,
        location: friend.location,
        unreadCount,
        isBlocked: !!chat.isBlocked,
        blockedBy: chat.blockedBy ? String(chat.blockedBy) : null,
        chatId: chat._id,
        isPending: !!chat.isPending,
        pendingRequestId,
        lastMessage: lastMessage ? {
          text: lastMessage.text,
          messageType: lastMessage.messageType,
          sentAt: lastMessage.sentAt,
          sender: String(lastMessage.sender)
        } : null
      };
    }));

    // Filter nulls and respond
    res.json({ friends: friendsData.filter(Boolean) });
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
  const targetIsPublic = !!target.isPublic;
  
  // Load viewer premium plan and advanced permissions (for all tiers)
  const viewingUser = await User.findById(req.user._id).populate('premiumPlan');
  const viewerTier = String(viewingUser?.premiumTier || '').toLowerCase();
  const isPremiumViewerRaw = !!viewingUser?.isPremium;
  const isPremiumActive = isPremiumViewerRaw && viewingUser?.premiumExpiresAt && new Date(viewingUser.premiumExpiresAt) > new Date();
  let planFeatures = null;
  if (isPremiumActive) {
    if (viewingUser?.premiumPlan?.advancedFeatures) {
      planFeatures = viewingUser.premiumPlan.advancedFeatures;
    } else if (viewerTier) {
      try {
        const PremiumPlan = (await import('../models/PremiumPlan.js')).default;
        const tierPlan = await PremiumPlan.findOne({ tier: viewerTier }).select('advancedFeatures');
        if (tierPlan?.advancedFeatures) planFeatures = tierPlan.advancedFeatures;
      } catch {}
    }
  }
  
  console.log('Profile View Debug:', {
    viewingUserId: req.user._id,
    viewingUserTier: viewingUser?.premiumTier,
    isPremium: viewingUser?.isPremium,
    isDiamond: viewerTier === 'diamond',
    hasAdvancedFeatures: !!planFeatures,
    targetIsPublic,
    targetId: target._id
  });
  
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
  
  // Privacy: if profile is public, allow viewing details/photos without connection.
  // Diamond users with permissions can see private profiles based on admin settings
  // Otherwise (private), hide details until chat connected; hide photos until chat connected AND photo permission
  if (!isOwnProfile && !isAdmin) {
    const canViewPrivate = !!(planFeatures && planFeatures.viewAllUsers);
    const canViewPhotos = !!(planFeatures && planFeatures.viewAllPhotos);

    // Base privacy for non-diamond or diamond without private access
    if (!targetIsPublic && !connection && !canViewPrivate) {
      data.age = undefined;
      data.location = undefined;
      data.education = undefined;
      data.occupation = undefined;
      data.fatherName = undefined;
      data.motherName = undefined;
      data.dateOfBirth = undefined;
      data.maritalStatus = undefined;
      data.disability = undefined;
      data.countryOfOrigin = undefined;
      data.state = undefined;
      data.district = undefined;
      data.city = undefined;
      data.area = undefined;
      data.languagesKnown = undefined;
      data.numberOfSiblings = undefined;
      data.about = undefined;
      data.lookingFor = undefined;
    }

    // Photos privacy
    if (!targetIsPublic && !(connection && photoPermission) && !canViewPhotos) {
      data.profilePhoto = undefined;
      data.galleryImages = undefined;
    }

    // ALWAYS apply field-level restrictions if premium viewer and canViewFields present,
    // irrespective of public/private status, so admin controls exactly what premium sees.
    if (isPremiumActive && planFeatures?.canViewFields) {
      const fields = planFeatures.canViewFields;
      if (!fields.name) data.name = undefined;
      if (!fields.age) data.age = undefined;
      if (!fields.dateOfBirth) data.dateOfBirth = undefined;
      if (!fields.fatherName) data.fatherName = undefined;
      if (!fields.motherName) data.motherName = undefined;
      if (!fields.gender) data.gender = undefined;
      if (!fields.maritalStatus) data.maritalStatus = undefined;
      if (!fields.disability) data.disability = undefined;
      if (!fields.countryOfOrigin) data.countryOfOrigin = undefined;
      if (!fields.state) data.state = undefined;
      if (!fields.district) data.district = undefined;
      if (!fields.city) data.city = undefined;
      if (!fields.area) data.area = undefined;
      if (!fields.education) data.education = undefined;
      if (!fields.occupation) data.occupation = undefined;
      if (!fields.languagesKnown) data.languagesKnown = undefined;
      if (!fields.numberOfSiblings) data.numberOfSiblings = undefined;
      if (!fields.about) data.about = undefined;
      if (!fields.lookingFor) data.lookingFor = undefined;
      // Photos also follow admin field flags in addition to canViewPhotos
      if (!fields.profilePhoto) data.profilePhoto = undefined;
      if (!fields.galleryImages) data.galleryImages = undefined;
    }
  }
  
  // Common flags
  data.isConnected = !!connection;
  // Public profiles expose photos; otherwise require photo permission (or premium plan with permissions)
  data.isPhotoAccessible = targetIsPublic || !!photoPermission || !!(planFeatures && planFeatures.viewAllPhotos);
  data.isBlockedByMe = isBlockedByMe;
  data.isBlockedByThem = isBlockedByThem;
  // New generic viewer flags
  data.viewerIsPremium = isPremiumActive;
  data.viewerTier = viewerTier;
  data.viewerHasPrivateAccess = !!(planFeatures && planFeatures.viewAllUsers);
  data.viewerCanSeePhotos = !!(planFeatures && planFeatures.viewAllPhotos);
  data.viewerCanMessageWithoutFollow = !!(planFeatures && planFeatures.canMessageWithoutFollow);
  // Backwards compatible flags for existing client usage
  data.viewerIsDiamond = viewerTier === 'diamond';
  data.viewerHasDiamondAccess = !!(planFeatures && (planFeatures.viewAllUsers || planFeatures.viewAllPhotos));

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
