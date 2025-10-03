import User from '../models/User.js';
import Chat from '../models/Chat.js';
import PremiumPlan from '../models/PremiumPlan.js';
import Settings from '../models/Settings.js';
import PaymentTransaction from '../models/PaymentTransaction.js';

export async function listUsers(req, res) {
  const users = await User.find().select('-passwordHash');
  res.json(users);
}

// Payments & Premium stats for admin dashboard
export async function getPaymentStats(req, res) {
  try {
    const [paidCount, premiumUsersAgg, payments] = await Promise.all([
      PaymentTransaction.countDocuments({ status: 'paid' }),
      User.countDocuments({ isPremium: true }),
      PaymentTransaction.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ])
    const totalAmount = payments.length > 0 ? payments[0].total : 0
    res.json({ paidCount, totalAmount, premiumUsers: premiumUsersAgg })
  } catch (e) {
    res.status(400).json({ message: e.message })
  }
}

export async function approveUser(req, res) {
  const { userId } = req.body;
  const user = await User.findByIdAndUpdate(userId, { status: 'approved' }, { new: true });
  if (!user) return res.status(404).json({ message: 'Not found' });
  res.json({ ok: true });
}

export async function deleteUser(req, res) {
  const { userId } = req.body;
  await User.findByIdAndDelete(userId);
  res.json({ ok: true });
}

export async function listChats(req, res) {
  const chats = await Chat.find().populate('users', 'name');
  res.json(chats);
}

export async function searchUsers(req, res) {
  try {
    const query = req.query.q;
    if (!query) return res.json([]);

    const users = await User.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
        { contact: { $regex: query, $options: 'i' } }
      ]
    }).select('-passwordHash -resetPasswordToken').limit(20);

    res.json(users);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
}

export async function getSpammers(req, res) {
  try {
    // Find all chats and count how many times each user is blocked
    const chats = await Chat.find({ isBlocked: true });
    
    const blockedCount = {};
    chats.forEach(chat => {
      const blockedUserId = String(chat.blockedBy);
      // Find the other user (the one who got blocked)
      const blockedUser = chat.users.find(u => String(u) !== blockedUserId);
      if (blockedUser) {
        const userId = String(blockedUser);
        blockedCount[userId] = (blockedCount[userId] || 0) + 1;
      }
    });

    // Filter users blocked by 8 or more people
    const spammerIds = Object.keys(blockedCount).filter(userId => blockedCount[userId] >= 8);
    
    if (spammerIds.length === 0) {
      return res.json([]);
    }

    // Get user details
    const spammers = await User.find({ _id: { $in: spammerIds } })
      .select('-passwordHash -resetPasswordToken');
    
    // Add block count to each spammer
    const spammersWithCount = spammers.map(user => ({
      ...user.toObject(),
      blockedByCount: blockedCount[String(user._id)]
    }));

    res.json(spammersWithCount);
  } catch (e) {
    console.error('Get spammers error:', e);
    res.status(400).json({ message: e.message });
  }
}

export async function getUserChatHistory(req, res) {
  try {
    const { userId } = req.params;
    
    // Find all chats involving this user
    const chats = await Chat.find({ users: userId })
      .populate('users', 'name profilePhoto email contact')
      .lean();
    
    // Format chat history with full messages
    const chatHistory = chats.map(chat => {
      // Get the other user (not the target user)
      const otherUser = chat.users.find(u => String(u._id) !== String(userId));
      
      // Get last message
      const lastMessage = chat.messages.length > 0 
        ? chat.messages[chat.messages.length - 1]
        : null;
      
      // Format all messages with sender info
      const messages = chat.messages.map(msg => ({
        _id: msg._id,
        text: msg.text,
        messageType: msg.messageType,
        sentAt: msg.sentAt,
        sender: msg.sender,
        senderName: String(msg.sender) === String(userId) ? 'Target User' : otherUser.name,
        status: msg.status
      }));
      
      return {
        chatId: chat._id,
        otherUser: {
          _id: otherUser._id,
          name: otherUser.name,
          profilePhoto: otherUser.profilePhoto,
          email: otherUser.email,
          contact: otherUser.contact
        },
        messageCount: chat.messages.length,
        messages: messages, // Include all messages
        lastMessage: lastMessage ? {
          text: lastMessage.text || `[${lastMessage.messageType}]`,
          sentAt: lastMessage.sentAt,
          sender: lastMessage.sender
        } : null,
        isBlocked: chat.isBlocked,
        blockedBy: chat.blockedBy,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt
      };
    });
    
    res.json(chatHistory);
  } catch (e) {
    console.error('Get user chat history error:', e);
    res.status(400).json({ message: e.message });
  }
}

export async function adminBlockUser(req, res) {
  try {
    const { userId } = req.body;
    
    // Update user status to indicate admin block
    const user = await User.findByIdAndUpdate(
      userId,
      { status: 'blocked' },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({ ok: true, message: 'User blocked by admin' });
  } catch (e) {
    console.error('Admin block user error:', e);
    res.status(400).json({ message: e.message });
  }
}

export async function adminUnblockUser(req, res) {
  try {
    const { userId } = req.body;
    
    // Restore user to approved status
    const user = await User.findByIdAndUpdate(
      userId,
      { status: 'approved' },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({ ok: true, message: 'User unblocked by admin' });
  } catch (e) {
    console.error('Admin unblock user error:', e);
    res.status(400).json({ message: e.message });
  }
}

// Settings Management
export async function getSettings(req, res) {
  try {
    const settings = await Settings.find();
    const settingsObj = {};
    settings.forEach(setting => {
      settingsObj[setting.key] = setting.value;
    });
    
    // Default settings if not found
    const defaults = {
      freeUserRequestLimit: 2,
      premiumUserRequestLimit: 20
    };
    
    res.json({ ...defaults, ...settingsObj });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
}

export async function updateSettings(req, res) {
  try {
    const { freeUserRequestLimit, premiumUserRequestLimit } = req.body;
    
    await Settings.findOneAndUpdate(
      { key: 'freeUserRequestLimit' },
      { key: 'freeUserRequestLimit', value: freeUserRequestLimit, description: 'Daily request limit for free users' },
      { upsert: true }
    );
    
    await Settings.findOneAndUpdate(
      { key: 'premiumUserRequestLimit' },
      { key: 'premiumUserRequestLimit', value: premiumUserRequestLimit, description: 'Daily request limit for premium users' },
      { upsert: true }
    );
    
    res.json({ ok: true, message: 'Settings updated successfully' });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
}

// Premium Plans Management
export async function getPremiumPlans(req, res) {
  try {
    const plans = await PremiumPlan.find({ isActive: true }).sort({ duration: 1 });
    res.json(plans);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
}

export async function createPremiumPlan(req, res) {
  try {
    const { name, duration, price, discount, requestLimit, features } = req.body;
    
    const plan = new PremiumPlan({
      name,
      duration,
      price,
      discount: discount || 0,
      requestLimit,
      features: features || []
    });
    
    await plan.save();
    res.json({ ok: true, plan });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
}

export async function updatePremiumPlan(req, res) {
  try {
    const { planId } = req.params;
    const { name, duration, price, discount, requestLimit, features, isActive } = req.body;
    
    const plan = await PremiumPlan.findByIdAndUpdate(
      planId,
      { name, duration, price, discount, requestLimit, features, isActive },
      { new: true }
    );
    
    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }
    
    res.json({ ok: true, plan });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
}

export async function deletePremiumPlan(req, res) {
  try {
    const { planId } = req.params;
    
    await PremiumPlan.findByIdAndUpdate(planId, { isActive: false });
    res.json({ ok: true, message: 'Plan deactivated successfully' });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
}

export async function initializeDefaultData(req, res) {
  try {
    const defaultPlans = [
      {
        name: '1 Month Premium',
        duration: 1,
        price: 9.99,
        discount: 0,
        requestLimit: 50,
        features: [
          'Send up to 50 follow requests per day',
          'Priority customer support',
          'Advanced search filters',
          'See who viewed your profile'
        ]
      },
      {
        name: '3 Month Premium',
        duration: 3,
        price: 24.99,
        discount: 15,
        requestLimit: 75,
        features: [
          'Send up to 75 follow requests per day',
          'Priority customer support',
          'Advanced search filters',
          'See who viewed your profile',
          'Unlimited message storage',
          'Profile boost feature'
        ]
      },
      {
        name: '6 Month Premium',
        duration: 6,
        price: 44.99,
        discount: 25,
        requestLimit: 100,
        features: [
          'Send up to 100 follow requests per day',
          'Priority customer support',
          'Advanced search filters',
          'See who viewed your profile',
          'Unlimited message storage',
          'Profile boost feature',
          'Exclusive premium badge',
          'Early access to new features'
        ]
      }
    ];

    const defaultSettings = [
      {
        key: 'freeUserRequestLimit',
        value: 2,
        description: 'Daily request limit for free users'
      },
      {
        key: 'premiumUserRequestLimit',
        value: 20,
        description: 'Daily request limit for premium users (fallback)'
      }
    ];

    // Initialize default settings
    for (const setting of defaultSettings) {
      await Settings.findOneAndUpdate(
        { key: setting.key },
        setting,
        { upsert: true }
      );
    }

    // Initialize default premium plans
    let createdPlans = 0;
    for (const plan of defaultPlans) {
      const existing = await PremiumPlan.findOne({ name: plan.name });
      if (!existing) {
        await PremiumPlan.create(plan);
        createdPlans++;
      }
    }

    res.json({ 
      ok: true, 
      message: `Initialization complete! Created ${createdPlans} new plans and updated settings.`,
      settingsInitialized: defaultSettings.length,
      plansCreated: createdPlans
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
}
