import PremiumPlan from '../models/PremiumPlan.js';
import PaymentTransaction from '../models/PaymentTransaction.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { createOrder, verifySignature, getRazorpayKeyId } from '../utils/razorpayUtil.js';

export async function listPlans(req, res) {
  const plans = await PremiumPlan.find({ isActive: true }).sort({ duration: 1 });
  res.json(plans);
}

export async function createPlan(req, res) {
  const plan = await PremiumPlan.create(req.body);
  res.json(plan);
}

export async function updatePlan(req, res) {
  const plan = await PremiumPlan.findByIdAndUpdate(req.params.planId, req.body, { new: true });
  res.json(plan);
}

// Create order for payment (public endpoint for non-authenticated users to see plans)
export async function createOrderEndpoint(req, res) {
  try {
    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({ message: 'Plan ID is required' });
    }

    const plan = await PremiumPlan.findById(planId);
    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    // Apply discount to compute payable amount
    const discountPct = Number(plan.discount || 0);
    const rawPrice = Number(plan.price || 0);
    const finalPrice = Math.max(0, rawPrice - (rawPrice * discountPct / 100));
    // Create Razorpay order with discounted amount (in paise)
    const order = await createOrder(Math.round(finalPrice * 100));

    res.json({
      orderId: order.id,
      amount: order.amount, // in paise, already discounted
      currency: order.currency,
      key: getRazorpayKeyId(),
      plan: {
        id: plan._id,
        name: plan.name,
        price: rawPrice,
        discount: discountPct,
        finalPrice,
        duration: plan.duration
      }
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ message: 'Failed to create order' });
  }
}

// Verify payment and activate premium
export async function verifyPayment(req, res) {
  try {
    const { orderId, paymentId, signature, planId } = req.body;

    if (!orderId || !paymentId || !signature || !planId) {
      return res.status(400).json({ message: 'Missing required payment details' });
    }

    // Verify payment signature
    const isValid = await verifySignature({ orderId, paymentId, signature });
    if (!isValid) {
      return res.status(400).json({ message: 'Payment verification failed' });
    }

    const plan = await PremiumPlan.findById(planId);
    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    // Create payment transaction record
    const discountPct = Number(plan.discount || 0);
    const rawPrice = Number(plan.price || 0);
    const finalPrice = Math.max(0, rawPrice - (rawPrice * discountPct / 100));
    const txn = await PaymentTransaction.create({
      user: req.user._id,
      plan: plan._id,
      orderId,
      paymentId,
      amount: finalPrice,
      status: 'paid'
    });

    // Update user to premium
    // Interpret plan.duration as days
    const now = new Date();
    const expires = new Date(now);
    expires.setDate(expires.getDate() + (Number(plan.duration) || 0));

    await User.findByIdAndUpdate(req.user._id, {
      isPremium: true,
      premiumExpiresAt: expires,
      premiumPlan: plan._id,
      premiumTier: plan.tier || undefined,
      // Reset daily request counters upon (re)activation so user gets full quota immediately
      requestsToday: 0,
      requestsTodayAt: new Date()
    });

    // Create a system notification for the user (congrats)
    try {
      await Notification.create({
        userId: req.user._id,
        type: 'system',
        title: '🎉 Premium Activated',
        message: `Congratulations! Your ${String(plan.tier || 'premium').toUpperCase()} plan is active for ${plan.duration} day(s).`,
        read: false,
        data: { kind: 'premium:activated', planId: plan._id, tier: plan.tier, duration: plan.duration }
      });
    } catch {}

    // Emit socket events: to user and to admins
    try {
      if (req.io) {
        // Notify the user channel
        req.io.emit(`user:${req.user._id}`, { kind: 'premium:activated', tier: String(plan.tier || '').toLowerCase(), duration: plan.duration });
        // Notify admins about purchase
        const admins = await User.find({ isAdmin: true }).select('_id');
        admins.forEach(a => {
          req.io.emit('adminPayment', { userId: String(req.user._id), name: req.user.name, tier: String(plan.tier || '').toLowerCase() });
        });
      }
    } catch {}

    // Create a system notification for the user (congrats)
    try {
      await Notification.create({
        userId: req.user._id,
        type: 'system',
        title: '🎉 Premium Activated',
        message: `Congratulations! Your ${String(plan.tier || 'premium').toUpperCase()} plan is active for ${plan.duration} day(s).`,
        read: false,
        data: { kind: 'premium:activated', planId: plan._id, tier: plan.tier, duration: plan.duration }
      });
    } catch {}

    // Emit socket events: to user and to admins
    try {
      if (req.io) {
        // Notify the user channel
        req.io.emit(`user:${req.user._id}`, { kind: 'premium:activated', tier: String(plan.tier || '').toLowerCase(), duration: plan.duration });
        // Notify admins about purchase
        const admins = await User.find({ isAdmin: true }).select('_id');
        admins.forEach(a => {
          req.io.emit('adminPayment', { userId: String(req.user._id), name: req.user.name, tier: String(plan.tier || '').toLowerCase() });
        });
      }
    } catch {}

    res.json({
      success: true,
      message: 'Payment verified and premium activated',
      txnId: txn._id,
      premiumExpiresAt: expires
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ message: 'Payment verification failed' });
  }
}

// Legacy subscribe method (kept for backward compatibility)
export async function subscribe(req, res) {
  try {
    const { planId, paymentDetails } = req.body;

    if (!planId) {
      return res.status(400).json({ message: 'Plan ID is required' });
    }

    const plan = await PremiumPlan.findById(planId);
    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    // For backward compatibility, treat this as a successful mock payment
    const txn = await PaymentTransaction.create({
      user: req.user._id,
      plan: plan._id,
      orderId: `legacy_${Date.now()}`,
      amount: plan.price,
      status: 'paid'
    });

    // Activate premium for the user
    // Interpret plan.duration as days
    const now = new Date();
    const expires = new Date(now);
    expires.setDate(expires.getDate() + (Number(plan.duration) || 0));

    await User.findByIdAndUpdate(req.user._id, {
      isPremium: true,
      premiumExpiresAt: expires,
      premiumPlan: plan._id,
      premiumTier: plan.tier || undefined
    });

    res.json({
      ok: true,
      txnId: txn._id,
      isPremium: true,
      premiumExpiresAt: expires
    });
  } catch (error) {
    console.error('Error in legacy subscribe:', error);
    res.status(500).json({ message: 'Subscription failed' });
  }
}
