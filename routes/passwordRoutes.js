import { Router } from 'express';
import { requestPasswordReset, verifyOTPAndResetPassword } from '../controllers/passwordController.js';

const router = Router();

router.post('/request-reset', requestPasswordReset);
router.post('/reset', verifyOTPAndResetPassword);

export default router;
