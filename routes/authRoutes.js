import { Router } from 'express';
import { signup, login, requestLoginOtp, verifyLoginOtp, verifyEmailOtp, resendEmailOtp, signupStep1, signupStep2, signupStep3, signupStep4, signupStep5, getSignupStatus } from '../controllers/authController.js';
import { upload } from '../utils/imageUtil.js';

const router = Router();

const uploadFields = upload.fields([
  { name: 'itCardPhoto', maxCount: 1 },
  { name: 'profilePhoto', maxCount: 1 }
]);

// Step-specific uploaders
const step2Upload = upload.fields([
  { name: 'profilePhoto', maxCount: 1 }
]);
const step4Upload = upload.fields([
  { name: 'galleryImages', maxCount: 8 }
]);

// Wrap upload middleware with error handler
router.post('/signup', (req, res, next) => {
  uploadFields(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }
    next();
  });
}, signup);

router.post('/login', login);
router.post('/request-login-otp', requestLoginOtp);
router.post('/verify-login-otp', verifyLoginOtp);
router.post('/verify-email-otp', verifyEmailOtp);
router.post('/resend-email-otp', resendEmailOtp);

// ===== Multi-step signup APIs =====
router.post('/signup/step-1', signupStep1);
router.get('/signup/status', getSignupStatus);
router.post('/signup/step-2', (req, res, next) => {
  step2Upload(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
}, signupStep2);
router.post('/signup/step-3', signupStep3);
router.post('/signup/step-4', (req, res, next) => {
  step4Upload(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
}, signupStep4);
router.post('/signup/step-5', signupStep5);

export default router;
