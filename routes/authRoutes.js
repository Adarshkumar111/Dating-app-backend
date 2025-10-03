import { Router } from 'express';
import { signup, login, requestLoginOtp, verifyLoginOtp, verifyEmailOtp, resendEmailOtp } from '../controllers/authController.js';
import { upload } from '../utils/imageUtil.js';

const router = Router();

const uploadFields = upload.fields([
  { name: 'itCardPhoto', maxCount: 1 },
  { name: 'profilePhoto', maxCount: 1 }
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

export default router;
