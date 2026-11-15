import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { config } from '../config.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function credentials(body) {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  return { email, password };
}

router.post('/signup', async (req, res) => {
  const { email, password } = credentials(req.body);
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (config.inviteCode && String(req.body?.inviteCode || '').trim() !== config.inviteCode) {
    return res.status(403).json({ error: 'That invite code is not right. Ask whoever invited you for the code.' });
  }
  if (await User.exists({ email })) return res.status(409).json({ error: 'An account with that email already exists' });
  const user = await User.create({ email, passwordHash: await bcrypt.hash(password, 10) });
  res.status(201).json({ token: signToken(user), user: { id: user._id, email: user.email } });
});

router.post('/login', async (req, res) => {
  const { email, password } = credentials(req.body);
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  res.json({ token: signToken(user), user: { id: user._id, email: user.email } });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(401).json({ error: 'Account not found' });
  res.json({ user: { id: user._id, email: user.email } });
});

export default router;
