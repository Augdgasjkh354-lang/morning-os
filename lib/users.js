const { query } = require('./db');
const bcrypt = require('bcryptjs');
const { randomUUID, randomBytes } = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || randomBytes(16).toString('hex');

async function findUserByUsername(username) { try { const r = await query('SELECT * FROM users WHERE username = $1', [username]); return r.rows[0] || null; } catch (e) { console.error('查询用户失败', e.message); return null; } }
async function findUserById(userId) { try { const r = await query('SELECT * FROM users WHERE id = $1', [userId]); return r.rows[0] || null; } catch (e) { console.error('查询用户失败', e.message); return null; } }
async function createUser({ username, password, role, inviteQuota, invitedBy }) { const id = `user_${randomUUID().replace(/-/g, '').slice(0, 8)}`; const hash = await bcrypt.hash(password, 10); await query('INSERT INTO users (id, username, password_hash, role, invite_quota, invites_used, invited_by, created_at) VALUES ($1,$2,$3,$4,$5,0,$6,NOW())', [id, username, hash, role || 'user', inviteQuota || 3, invitedBy || null]); return id; }
async function updateUserLastLogin(userId) { try { await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [userId]); } catch (e) { console.error('更新登录时间失败', e.message); } }
async function getAllUsers() { const r = await query('SELECT id,username,role,invite_quota,invites_used,invited_by,is_active,created_at,last_login_at,password_hash FROM users ORDER BY created_at ASC'); return r.rows; }
async function updateUser(userId, fields) { const allowed = ['role', 'invite_quota', 'is_active']; const updates = Object.entries(fields).filter(([k]) => allowed.includes(k)); if (!updates.length) return; const sets = updates.map(([k], i) => `${k} = $${i + 2}`).join(', '); const vals = updates.map(([, v]) => v); await query(`UPDATE users SET ${sets} WHERE id = $1`, [userId, ...vals]); }
async function initAdminUser() { if (process.env.NODE_ENV === 'production' && (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD)) { console.error('生产环境必须设置 ADMIN_USERNAME 和 ADMIN_PASSWORD'); process.exit(1); } const username = process.env.ADMIN_USERNAME || '999999'; const password = process.env.ADMIN_PASSWORD || '999999111111'; const existing = await findUserByUsername(username); if (!existing) { await createUser({ username, password, role: 'admin', inviteQuota: 999999, invitedBy: null }); console.log(`管理员账号已创建：${username}`); } }
async function createInvite({ type, createdBy }) { const id = `inv_${randomUUID().replace(/-/g, '').slice(0, 8)}`; const code = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase(); await query('INSERT INTO invites (id, code, type, created_by, is_used, created_at) VALUES ($1,$2,$3,$4,false,NOW())', [id, code, type || 'user', createdBy]); await query('UPDATE users SET invites_used = invites_used + 1 WHERE id = $1', [createdBy]); return code; }
async function findInviteByCode(code) { const r = await query('SELECT * FROM invites WHERE code = $1', [code]); return r.rows[0] || null; }
async function useInvite(code, usedBy) { await query('UPDATE invites SET is_used=true, used_by=$1, used_at=NOW() WHERE code=$2', [usedBy, code]); }
async function getInvitesByUser(userId) { const r = await query('SELECT * FROM invites WHERE created_by = $1 ORDER BY created_at DESC', [userId]); return r.rows; }
async function getAllInvites() { const r = await query('SELECT * FROM invites ORDER BY created_at DESC'); return r.rows; }

async function getUsers() { return { users: await getAllUsers() }; }
async function saveUsers(data) { for (const u of (data.users || [])) { await query('UPDATE users SET role=$2, invite_quota=$3, invites_used=$4, is_active=$5 WHERE id=$1', [u.id, u.role, u.invite_quota, u.invites_used, u.is_active]); } }
async function getInvites() { return { invites: await getAllInvites() }; }
async function saveInvites(data) { for (const i of (data.invites || [])) { await query('UPDATE invites SET is_used=$2, used_by=$3, used_at=$4 WHERE id=$1', [i.id, i.is_used, i.used_by, i.used_at]); } }
async function getJwtSecret() { return JWT_SECRET; }
function genUserId() { return `user_${randomUUID().replace(/-/g, '').slice(0, 8)}`; }
function genInviteId() { return `inv_${randomUUID().replace(/-/g, '').slice(0, 8)}`; }

module.exports = { findUserByUsername, findUserById, createUser, updateUserLastLogin, getAllUsers, updateUser, initAdminUser, createInvite, findInviteByCode, useInvite, getInvitesByUser, getAllInvites, getUsers, saveUsers, getInvites, saveInvites, getJwtSecret, genUserId, genInviteId };
