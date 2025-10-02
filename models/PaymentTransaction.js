import mongoose from 'mongoose';

const paymentTxnSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  provider: { type: String, default: 'razorpay' },
  orderId: String,
  paymentId: String,
  signature: String,
  amount: Number,
  status: { type: String, enum: ['created', 'paid', 'failed'], default: 'created' }
}, { timestamps: true });

export default mongoose.model('PaymentTransaction', paymentTxnSchema);
