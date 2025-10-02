import Plan from '../models/Plan.js';
import PaymentTransaction from '../models/PaymentTransaction.js';
import { createOrder, verifySignature } from '../utils/razorpayUtil.js';

export async function listPlans(req, res) {
  const plans = await Plan.find();
  res.json(plans);
}

export async function createPlan(req, res) {
  const plan = await Plan.create(req.body);
  res.json(plan);
}

export async function updatePlan(req, res) {
  const plan = await Plan.findByIdAndUpdate(req.params.planId, req.body, { new: true });
  res.json(plan);
}

export async function subscribe(req, res) {
  const { planId, paymentDetails } = req.body;
  const plan = await Plan.findById(planId);
  if (!plan) return res.status(404).json({ message: 'Plan not found' });
  const order = await createOrder(plan.price * 100);
  // Mock immediate verification
  const ok = await verifySignature(paymentDetails || {});
  if (!ok) return res.status(400).json({ message: 'Payment not verified' });
  const txn = await PaymentTransaction.create({ user: req.user._id, plan: plan._id, orderId: order.id, amount: plan.price, status: 'paid' });
  req.user.isPremium = true;
  const now = new Date();
  req.user.premiumExpiresAt = new Date(now.getTime() + plan.durationDays * 86400000);
  await req.user.save();
  res.json({ ok: true, txnId: txn._id, isPremium: true });
}
