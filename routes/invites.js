const router = require('express').Router();
const { getUsers, saveUsers, getInvites, saveInvites, genInviteId } = require('../lib/users');
const { requireAuth } = require('../middleware/auth');

const code = () => Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

router.use(requireAuth);

router.post('/generate', async (req, res) => {
  const { type } = req.body || {};
  if (!['developer', 'user'].includes(type)) return res.status(400).json({ error: '类型错误' });
  if (type === 'developer' && req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  const u = await getUsers();
  const me = u.users.find((x) => x.id === req.user.userId);
  if (req.user.role !== 'admin' && me.invites_used >= me.invite_quota) return res.status(403).json({ error: '邀请码配额已用完' });
  const inv = await getInvites();
  const item = { id: genInviteId(), code: code(), type, created_by: req.user.userId, used_by: null, used_at: null, is_used: false, created_at: new Date().toISOString() };
  inv.invites.push(item);
  if (req.user.role !== 'admin') me.invites_used += 1;
  await saveInvites(inv);
  await saveUsers(u);
  res.json({ success: true, code: item.code, type });
});

router.get('/my', async (req, res) => {
  const inv = await getInvites();
  res.json({ invites: inv.invites.filter((x) => x.created_by === req.user.userId) });
});

module.exports = router;
