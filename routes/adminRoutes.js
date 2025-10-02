import { Router } from 'express';
import { authRequired } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';
import { listUsers, approveUser, deleteUser, listChats } from '../controllers/adminController.js';
import { listPlans, createPlan, updatePlan } from '../controllers/paymentController.js';

const router = Router();
router.use(authRequired, adminOnly);

router.get('/users', listUsers);
router.post('/approve', approveUser);
router.delete('/delete', deleteUser);
router.get('/chats', listChats);

router.get('/plans', listPlans);
router.post('/plan', createPlan);
router.put('/plan/:planId', updatePlan);

export default router;
