import { Router } from 'express';
import { authRequired } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';
import { listUsers, approveUser, deleteUser, listChats, searchUsers, getSpammers, getUserChatHistory, adminBlockUser, adminUnblockUser, getSettings, updateSettings, getPremiumPlans, createPremiumPlan, updatePremiumPlan, deletePremiumPlan } from '../controllers/adminController.js';

const router = Router();
router.use(authRequired, adminOnly);

router.get('/users', listUsers);
router.get('/search', searchUsers);
router.get('/spammers', getSpammers);
router.get('/user/:userId/chats', getUserChatHistory);
router.post('/approve', approveUser);
router.post('/delete', deleteUser);
router.post('/block-user', adminBlockUser);
router.post('/unblock-user', adminUnblockUser);
router.get('/chats', listChats);

// Settings
router.get('/settings', getSettings);
router.post('/settings', updateSettings);

// Premium Plans
router.get('/premium-plans', getPremiumPlans);
router.post('/premium-plans', createPremiumPlan);
router.put('/premium-plans/:planId', updatePremiumPlan);
router.delete('/premium-plans/:planId', deletePremiumPlan);

export default router;
