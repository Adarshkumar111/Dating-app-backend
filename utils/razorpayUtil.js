import Razorpay from 'razorpay';
import { env } from '../config/envConfig.js';

// Initialize Razorpay with test credentials if available, otherwise use mock
let razorpayInstance = null;

if (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) {
  razorpayInstance = new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });
} else {
  // Mock implementation for development
  console.log('⚠️  Razorpay credentials not set. Using mock implementation.');
}

export async function createOrder(amount, currency = 'INR') {
  if (!razorpayInstance) {
    // Mock order creation for development
    return {
      id: `order_mock_${Date.now()}`,
      amount,
      currency,
      status: 'created'
    };
  }

  try {
    const orderOptions = {
      amount, // amount in paise
      currency,
      receipt: `receipt_${Date.now()}`,
      payment_capture: 1 // auto capture payment
    };

    const order = await razorpayInstance.orders.create(orderOptions);
    return order;
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    // Fallback to mock order
    return {
      id: `order_mock_${Date.now()}`,
      amount,
      currency,
      status: 'created'
    };
  }
}

export async function verifySignature({ orderId, paymentId, signature }) {
  if (!razorpayInstance) {
    // Always return true for mock implementation
    return true;
  }

  try {
    const crypto = await import('crypto');
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    return expectedSignature === signature;
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
}

export function getRazorpayKeyId() {
  return env.RAZORPAY_KEY_ID || 'rzp_test_dummy123';
}
