// Placeholder Razorpay util. Wire actual SDK later.
export async function createOrder(amount, currency = 'INR') {
  return { id: 'order_mock', amount, currency };
}
export async function verifySignature({ orderId, paymentId, signature }) {
  // TODO: verify using RAZORPAY_KEY_SECRET
  return true;
}
