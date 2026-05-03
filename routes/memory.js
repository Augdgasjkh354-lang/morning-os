const router = require('express').Router();
const { randomUUID } = require('crypto');
const { requireAuth } = require('../middleware/auth');
const { getUserMemory, saveUserMemory, getUserSettings } = require('../lib/userData');
const { dateStr, estimateTokens, recalcTokens } = require('../lib/memoryManager');
const { sendBark } = require('../lib/barkPush');

const TIMEZONE = 'Asia/Shanghai';

router.get('/', requireAuth, async (req, res) => res.json(await getUserMemory(req.user.userId)));
router.post('/', requireAuth, async (req, res) => {
  const body = req.body || {};
  const type = body.type || 'knowledge';
  const m = await getUserMemory(req.user.userId);
  const item = { id: `mem_${randomUUID().replace(/-/g, '').slice(0, 8)}`, title: body.title || '未命名', content: body.content || '', source: body.source || '手动', tags: body.tags || [], type, date_created: dateStr(TIMEZONE), date_updated: dateStr(TIMEZONE), importance: body.importance || 5, tokens: estimateTokens(body.content || ''), decay_score: type === 'identity' ? 10 : (body.decay_score ?? 10), related_ids: [], history: [], conflict: false };
  m[type] = m[type] || [];
  m[type].push(item);
  recalcTokens(m);
  if ((m.meta?.total_tokens || 0) > (m.meta?.soft_limit || 40000)) {
    const s = await getUserSettings(req.user.userId);
    await sendBark(s.bark_token, '记忆库已达软上限，建议进行AI修剪');
  }
  await saveUserMemory(req.user.userId, m);
  res.json({ success: true });
});
router.put('/:id', requireAuth, async (req, res) => { const m = await getUserMemory(req.user.userId); for (const t of ['identity', 'knowledge', 'inference', 'archive']) m[t] = (m[t] || []).map((i) => i.id === req.params.id ? { ...i, ...req.body, date_updated: dateStr(TIMEZONE) } : i); recalcTokens(m); await saveUserMemory(req.user.userId, m); res.json({ success: true }); });
router.delete('/:id', requireAuth, async (req, res) => { const m = await getUserMemory(req.user.userId); for (const t of ['identity', 'knowledge', 'inference', 'archive']) m[t] = (m[t] || []).filter((x) => x.id !== req.params.id); recalcTokens(m); await saveUserMemory(req.user.userId, m); res.json({ success: true }); });
router.post('/archive/:id', requireAuth, async (req, res) => res.json({ success: true }));
router.post('/restore/:id', requireAuth, async (req, res) => res.json({ success: true }));
router.post('/resolve-conflict', requireAuth, async (req, res) => res.json({ success: true }));
router.post('/prune', requireAuth, async (req, res) => res.json({ status: 'done', suggestions: [] }));
router.post('/feedback', requireAuth, async (req, res) => res.json({ success: true }));
router.get('/import-report', requireAuth, async (req, res) => res.json({ success: true }));

module.exports = router;
