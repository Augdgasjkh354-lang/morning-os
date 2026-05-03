const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
const { getUsers, saveUsers, getInvites, saveInvites, genInviteId } = require('../lib/users');

const code = () => Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

router.use(requireAdmin);

router.get('/users', async (req, res) => {
  const u = await getUsers();
  res.json({ users: u.users.map(({ password_hash, ...x }) => x) });
});

router.put('/users/:id', async (req, res) => {
  const u = await getUsers();
  const x = u.users.find((a) => a.id === req.params.id);
  if (!x) return res.status(404).json({ error: '用户不存在' });
  ['role', 'invite_quota', 'is_active'].forEach((k) => req.body?.[k] !== undefined && (x[k] = req.body[k]));
  await saveUsers(u);
  res.json({ success: true });
});

router.delete('/users/:id', async (req, res) => {
  const u = await getUsers();
  const x = u.users.find((a) => a.id === req.params.id);
  if (!x) return res.status(404).json({ error: '用户不存在' });
  x.is_active = false;
  await saveUsers(u);
  res.json({ success: true });
});

router.get('/invites', async (req, res) => res.json(await getInvites()));

router.post('/invites/generate', async (req, res) => {
  const { type } = req.body || {};
  const i = await getInvites();
  const item = { id: genInviteId(), code: code(), type, created_by: req.user.userId, used_by: null, used_at: null, is_used: false, created_at: new Date().toISOString() };
  i.invites.push(item);
  await saveInvites(i);
  res.json({ success: true, code: item.code, type });
});

module.exports = router;
