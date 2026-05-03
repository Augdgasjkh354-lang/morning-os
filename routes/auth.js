const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getUsers, saveUsers, getInvites, saveInvites, getJwtSecret, genUserId } = require('../lib/users');
const { ensureDir, getUserDataPath } = require('../lib/userData');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

router.post('/register', async (req, res) => { const { username, password, invite_code } = req.body || {}; const i = await getInvites(); const inv = i.invites.find(x => x.code === invite_code && !x.is_used); if (!inv) return res.status(400).json({ error: '邀请码无效' }); const u = await getUsers(); if (u.users.some(x => x.username === username)) return res.status(400).json({ error: '用户名已存在' }); const id = genUserId(); u.users.push({ id, username, password_hash: await bcrypt.hash(password, 10), role: inv.type, invite_quota: 3, invites_used: 0, invited_by: inv.created_by, created_at: new Date().toISOString(), last_login_at: '', is_active: true }); inv.is_used = true; inv.used_by = id; inv.used_at = new Date().toISOString(); await saveUsers(u); await saveInvites(i); const d = getUserDataPath(id); await ensureDir(d); await fs.copyFile(path.join(__dirname, '..', 'settings.example.json'), path.join(d, 'settings.json')).catch(() => {}); res.json({ success: true, message: '注册成功，请登录' }); });
router.post('/login', async (req, res) => { const { username, password } = req.body || {}; const u = await getUsers(); const user = u.users.find(x => x.username === username && x.is_active); if (!user || !(await bcrypt.compare(password || '', user.password_hash))) return res.status(401).json({ error: '用户名或密码错误' }); const token = jwt.sign({ userId: user.id, username: user.username, role: user.role }, await getJwtSecret(), { expiresIn: '7d' }); res.json({ success: true, token, user: { id: user.id, username: user.username, role: user.role } }); });
module.exports = router;
