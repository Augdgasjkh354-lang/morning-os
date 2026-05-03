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
router.post('/archive/:id', requireAuth, async (req, res) => { const m = await getUserMemory(req.user.userId); m.archive = m.archive || []; let moved = null; for (const t of ['identity', 'knowledge', 'inference']) { const idx = (m[t] || []).findIndex((x) => x.id === req.params.id); if (idx >= 0) { moved = m[t][idx]; m[t].splice(idx, 1); break; } } if (moved) { m.archive.push(moved); m.meta = m.meta || {}; m.meta.total_tokens = Math.max(0, (m.meta.total_tokens || 0) - (moved.tokens || 0)); } await saveUserMemory(req.user.userId, m); res.json({ success: true }); });
router.post('/restore/:id', requireAuth, async (req, res) => { const m = await getUserMemory(req.user.userId); m.archive = m.archive || []; const idx = m.archive.findIndex((x) => x.id === req.params.id); if (idx >= 0) { const item = m.archive[idx]; m.archive.splice(idx, 1); const type = ['identity', 'knowledge', 'inference'].includes(item.type) ? item.type : 'knowledge'; m[type] = m[type] || []; m[type].push(item); m.meta = m.meta || {}; m.meta.total_tokens = (m.meta.total_tokens || 0) + (item.tokens || 0); } await saveUserMemory(req.user.userId, m); res.json({ success: true }); });
router.post('/resolve-conflict', requireAuth, async (req, res) => { const { id, action } = req.body || {}; const m = await getUserMemory(req.user.userId); for (const t of ['identity', 'knowledge', 'inference', 'archive']) { m[t] = (m[t] || []).map((item) => { if (item.id !== id) return item; if (action === 'keep_new') return { ...item, conflict: false, date_updated: dateStr(TIMEZONE) }; if (action === 'keep_old') { const oldContent = item.history?.length ? item.history[item.history.length - 1]?.content : item.content; return { ...item, content: oldContent || item.content, conflict: false, date_updated: dateStr(TIMEZONE) }; } if (action === 'merge') { const oldContent = item.history?.length ? item.history[item.history.length - 1]?.content : ''; const merged = oldContent ? `${item.content}\n${oldContent}` : item.content; return { ...item, content: merged, conflict: false, date_updated: dateStr(TIMEZONE) }; } return item; }); } recalcTokens(m); await saveUserMemory(req.user.userId, m); res.json({ success: true }); });
router.post('/prune', requireAuth, async (req, res) => { const settings = await getUserSettings(req.user.userId); if (!settings.deepseek_api_key) { return res.json({ status: 'pending', message: 'AI修剪功能需要配置DeepSeek API Key', suggestions: [] }); } res.json({ status: 'done', suggestions: [] }); });
router.post('/feedback', requireAuth, async (req, res) => { const { id, action } = req.body || {}; const m = await getUserMemory(req.user.userId); for (const t of ['identity', 'knowledge', 'inference', 'archive']) { m[t] = (m[t] || []).map((item) => { if (item.id !== id) return item; if (action === 'irrelevant') return { ...item, importance: Math.max(1, Number(item.importance || 5) - 1), date_updated: dateStr(TIMEZONE) }; if (action === 'downvote') return { ...item, importance: Math.max(1, Number(item.importance || 5) - 2), date_updated: dateStr(TIMEZONE) }; if (action === 'upvote') return { ...item, importance: Math.min(10, Number(item.importance || 5) + 1), confidence: Math.min(1, Number(item.confidence || 0) + 0.05), date_updated: dateStr(TIMEZONE) }; return item; }); } await saveUserMemory(req.user.userId, m); res.json({ success: true }); });
router.get('/import-report', requireAuth, async (req, res) => res.json({ success: true }));

module.exports = router;
