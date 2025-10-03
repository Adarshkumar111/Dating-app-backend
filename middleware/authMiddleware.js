import jwt from 'jsonwebtoken';
import { env } from '../config/envConfig.js';
import User from '../models/User.js';

export async function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.substring(7) : null;
    if (!token) return res.status(401).json({ message: 'No token' });
    const payload = jwt.verify(token, env.JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ message: 'Invalid token user' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

export function approvedOnly(req, res, next) {
  // Allow admins to bypass approval check
  if (req.user.isAdmin) {
    return next();
  }
  
  if (req.user.status !== 'approved') {
    return res.status(403).json({ message: 'Waiting for admin approval' });
  }
  next();
}
