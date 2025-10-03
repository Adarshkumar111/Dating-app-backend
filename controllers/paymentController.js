import PremiumPlan from '../models/PremiumPlan.js';
import PaymentTransaction from '../models/PaymentTransaction.js';
import User from '../models/User.js';
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

    // Create Razorpay order
    const order = await createOrder(Math.round(plan.price * 100)); // Convert to paise

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: getRazorpayKeyId(),
      plan: {
        id: plan._id,
        name: plan.name,
        price: plan.price,
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
    const txn = await PaymentTransaction.create({
      user: req.user._id,
      plan: plan._id,
      orderId,
      paymentId,
      amount: plan.price,
      status: 'paid'
    });

    // Update user to premium
    const now = new Date();
    const expires = new Date(now);
    expires.setMonth(expires.getMonth() + plan.duration);

    await User.findByIdAndUpdate(req.user._id, {
      isPremium: true,
      premiumExpiresAt: expires
    });

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
    const now = new Date();
    const expires = new Date(now);
    expires.setMonth(expires.getMonth() + plan.duration);

    await User.findByIdAndUpdate(req.user._id, {
      isPremium: true,
      premiumExpiresAt: expires
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
