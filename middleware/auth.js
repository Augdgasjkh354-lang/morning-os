const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../lib/users');

function extractToken(req){
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return auth || req.query.token || '';
}
async function requireAuth(req,res,next){
  try{
    const token = extractToken(req); if(!token) return res.status(401).json({ error:'未授权，请登录' });
    req.user = jwt.verify(token, await getJwtSecret());
    next();
  } catch { res.status(401).json({ error:'未授权，请登录' }); }
}
async function requireAdmin(req,res,next){ await requireAuth(req,res,()=>{ if(req.user.role!=='admin') return res.status(403).json({ error:'需要管理员权限' }); next(); }); }
async function requireDeveloperOrAbove(req,res,next){ await requireAuth(req,res,()=>{ if(!['admin','developer'].includes(req.user.role)) return res.status(403).json({ error:'需要开发者权限' }); next(); }); }
module.exports = { requireAuth, requireAdmin, requireDeveloperOrAbove };
