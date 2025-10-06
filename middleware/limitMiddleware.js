import { getTodayKey } from '../utils/dateUtil.js';

export function requestLimitMiddleware(getLimit) {
  return async (req, res, next) => {
    try {
      const user = req.user;
      // Do not apply limit to photo requests
      if (req.body?.type === 'photo') {
        return next();
      }
      const todayKey = getTodayKey();
      const lastKey = user.requestsTodayAt ? getTodayKey(user.requestsTodayAt) : null;
      if (todayKey !== lastKey) {
        user.requestsToday = 0;
        user.requestsTodayAt = new Date();
        await user.save();
      }
      const limit = getLimit(user);
      if (user.requestsToday >= limit) {
        return res.status(429).json({ message: 'Daily request limit reached' });
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}
