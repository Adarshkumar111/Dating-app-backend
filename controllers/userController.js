import User from '../models/User.js';
import Request from '../models/Request.js';

export async function me(req, res) {
  const u = req.user.toObject();
  delete u.passwordHash;
  delete u.resetPasswordToken;
  // User can see their own contact and email
  res.json(u);
}

// Instagram-style feed with rejected users excluded
export async function list(req, res) {
  const gender = req.user.gender === 'male' ? 'female' : 'male';
  const page = parseInt(req.query.page || '1');
  const pageSize = 10;
  
  // Exclude rejected users and self
  const excludeIds = [...(req.user.rejectedUsers || []), req.user._id];
  
  const [items, total] = await Promise.all([
    User.find({ 
      gender, 
      status: 'approved',
      _id: { $nin: excludeIds }
    })
    .select('name age location about profilePhoto')
    .skip((page-1)*pageSize)
    .limit(pageSize),
    User.countDocuments({ 
      gender, 
      status: 'approved',
      _id: { $nin: excludeIds }
    })
  ]);
  
  // For each user, check request status
  const itemsWithStatus = await Promise.all(items.map(async (item) => {
    const request = await Request.findOne({
      $or: [
        { from: req.user._id, to: item._id },
        { from: item._id, to: req.user._id }
      ]
    });
    
    const obj = item.toObject();
    
    // Always hide contact and email from feed
    obj.contact = undefined;
    obj.email = undefined;
    obj.itCardPhoto = undefined;
    
    // Hide details until connected
    if (!request || request.status !== 'accepted') {
      obj.name = obj.name ? obj.name.charAt(0).toUpperCase() : 'U';
      obj.profilePhoto = undefined;
      obj.galleryImages = undefined;
      obj.age = undefined;
      obj.location = undefined;
      obj.education = undefined;
      obj.occupation = undefined;
      // Keep 'about' visible
    }
    
    obj.requestStatus = request ? request.status : 'none';
    obj.requestDirection = request ? (String(request.from) === String(req.user._id) ? 'sent' : 'received') : null;
    
    return obj;
  }));
  
  res.json({ items: itemsWithStatus, total, page, pageSize });
}

export async function getProfile(req, res) {
  const target = await User.findById(req.params.id).select('-passwordHash -resetPasswordToken');
  if (!target) return res.status(404).json({ message: 'Not found' });
  
  // Check if connected
  const connection = await Request.findOne({
    $or: [
      { from: req.user._id, to: target._id, status: 'accepted' },
      { from: target._id, to: req.user._id, status: 'accepted' }
    ]
  });
  
  const data = target.toObject();
  const isOwnProfile = String(req.user._id) === String(target._id);
  const isAdmin = req.user.isAdmin;
  
  // Always hide sensitive fields from other users
  if (!isOwnProfile && !isAdmin) {
    data.contact = undefined;
    data.email = undefined;
    data.itCardPhoto = undefined;
  }
  
  // Privacy: hide additional data until connected
  if (!connection && !isOwnProfile && !isAdmin) {
    data.name = data.name ? data.name.charAt(0).toUpperCase() : 'U';
    data.profilePhoto = undefined;
    data.galleryImages = undefined;
    data.age = undefined;
    data.location = undefined;
    data.education = undefined;
    data.occupation = undefined;
    // Keep 'about' visible for notifications
  }
  
  // Admin can see everything
  if (isAdmin) {
    data.isConnected = !!connection;
    return res.json(data);
  }
  
  data.isConnected = !!connection;
  
  res.json(data);
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
