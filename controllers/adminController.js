import User from '../models/User.js';
import Chat from '../models/Chat.js';

export async function listUsers(req, res) {
  const users = await User.find().select('-passwordHash');
  res.json(users);
}

export async function approveUser(req, res) {
  const { userId } = req.body;
  const user = await User.findByIdAndUpdate(userId, { status: 'approved' }, { new: true });
  if (!user) return res.status(404).json({ message: 'Not found' });
  res.json({ ok: true });
}

export async function deleteUser(req, res) {
  const { userId } = req.body;
  await User.findByIdAndDelete(userId);
  res.json({ ok: true });
}

export async function listChats(req, res) {
  const chats = await Chat.find().populate('users', 'name');
  res.json(chats);
}
