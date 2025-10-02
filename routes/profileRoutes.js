import { Router } from 'express';
import { authRequired, approvedOnly } from '../middleware/authMiddleware.js';
import { upload } from '../utils/imageUtil.js';
import { updateProfile, changePassword, deleteGalleryImage } from '../controllers/profileController.js';

const router = Router();
router.use(authRequired, approvedOnly);

const uploadFields = upload.fields([
  { name: 'profilePhoto', maxCount: 1 },
  { name: 'galleryImages', maxCount: 8 }
]);

router.put('/update', (req, res, next) => {
  uploadFields(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
}, updateProfile);

router.post('/change-password', changePassword);
router.delete('/gallery-image', deleteGalleryImage);

export default router;
