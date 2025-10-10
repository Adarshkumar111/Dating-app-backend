import { Router } from 'express';
import { authRequired } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';
import { 
  listUsers, approveUser, deleteUser, listChats, searchUsers, getSpammers, 
  getUserChatHistory, adminBlockUser, adminUnblockUser, getSettings, updateSettings, 
  getPremiumPlans, createPremiumPlan, updatePremiumPlan, deletePremiumPlan, 
  initializeDefaultData, getPaymentStats,
  listPremiumUsers, cancelUserPremium,
  // NEW IMPORTS
  createPermanentBlock, listPermanentBlocks, removePermanentBlock,
  getUserActivityLogs, getInactiveUsers,
  getPendingProfileEdits, approveProfileEdit, rejectProfileEdit,
  getAppSettings, updateAppSettings,
  sendBulkEmail, notifyInactiveUsers, setUserPriority, sendAdminNotification,
  uploadPreAuthBanner, uploadOnboardingSlides
} from '../controllers/adminController.js';
import { upload } from '../utils/imageUtil.js';

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

// Settings (old)
router.get('/settings', getSettings);
router.post('/settings', updateSettings);

// Premium Plans
router.get('/premium-plans', getPremiumPlans);
router.post('/premium-plans', createPremiumPlan);
router.put('/premium-plans/:planId', updatePremiumPlan);
router.delete('/premium-plans/:planId', deletePremiumPlan);

// Initialize default data
router.post('/initialize', initializeDefaultData);

// Payments stats
router.get('/payments/stats', getPaymentStats);
// Premium users management
router.get('/payments/premium-users', listPremiumUsers);
router.post('/payments/cancel-premium', cancelUserPremium);

// NEW ROUTES
// Permanent Blocks
router.get('/permanent-blocks', listPermanentBlocks);
router.post('/permanent-blocks', createPermanentBlock);
router.delete('/permanent-blocks/:blockId', removePermanentBlock);

// User Activity Logs
router.get('/user/:userId/activity', getUserActivityLogs);
router.get('/inactive-users', getInactiveUsers);

// Profile Edit Approval
router.get('/pending-edits', getPendingProfileEdits);
router.post('/approve-edit', approveProfileEdit);
router.post('/reject-edit', rejectProfileEdit);

// App Settings (comprehensive)
router.get('/app-settings', getAppSettings);
router.put('/app-settings', updateAppSettings);

// Email Notifications
router.post('/send-email', sendBulkEmail);
router.post('/notify-inactive', notifyInactiveUsers);

// User Priority
router.post('/user-priority', setUserPriority);

// Admin Notifications
router.post('/send-notification', sendAdminNotification);

// Pre-auth banner upload
router.post('/preauth-banner', upload.single('image'), uploadPreAuthBanner);

// Onboarding slides upload (multiple images)
router.post('/onboarding-slides', upload.array('images', 6), uploadOnboardingSlides);

export default router;
