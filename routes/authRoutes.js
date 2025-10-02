import { Router } from 'express';
import { signup, login } from '../controllers/authController.js';
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

export default router;
