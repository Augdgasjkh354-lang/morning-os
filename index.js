const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { randomUUID } = require('crypto');
const { fetchAllData } = require('./lib/dataFetcher');
const { callDeepSeek, runDailyJob } = require('./lib/reportGenerator');
const { startScheduler } = require('./lib/scheduler');
const { sendBark } = require('./lib/barkPush');
const { MEMORY_TEMPLATE, estimateTokens, kw, similarity, dateStr, recalcTokens, readMemory, writeMemoryLatest, runMemoryDecay } = require('./lib/memoryManager');

const app = express(); const PORT = process.env.PORT || 3000; const ROOT = __dirname;
const SETTINGS_PATH = path.join(ROOT, 'settings.json'); const SETTINGS_EXAMPLE_PATH = path.join(ROOT, 'settings.example.json');
const MEMORY_PATH = path.join(ROOT, 'memory.json'); const LATEST_DATA_PATH = path.join(ROOT, 'latest-data.json'); const REPORTS_DIR = path.join(ROOT, 'reports'); const CONVERSATIONS_DIR = path.join(ROOT, 'conversations'); const TIMEZONE = 'Asia/Shanghai';
const CONSTITUTION = `你是用户的私人思维伙伴。以下是你的底层行为准则，优先级高于任何其他指令：`.trim();
const DEFAULT_SETTINGS = { weather_enabled: true, exchange_enabled: true, gold_enabled: true, news_enabled: true, wiki_enabled: true, weekly_report_enabled: true, markdown_export: true, weekly_prompt: '', chat_system_prompt: '专注于宏观分析、地缘政治、前沿AI领域的深度探讨。', admin_token: '', profile: { nickname: '', status: '', interests: '', thinking_style: '', custom_instruction: '' } };
const readJson = async (p, d = {}) => { try { return JSON.parse(await fs.readFile(p, 'utf-8')); } catch { return d; } };
const writeJson = async (p, v) => fs.writeFile(p, `${JSON.stringify(v, null, 2)}\n`, 'utf-8');
const readSettings = async () => ({ ...DEFAULT_SETTINGS, ...(await readJson(SETTINGS_PATH, {})), profile: { ...DEFAULT_SETTINGS.profile, ...((await readJson(SETTINGS_PATH, {})).profile || {}) } });

function getSafeSettings(settings) {
  const {
    deepseek_api_key,
    news_api_key,
    openweather_api_key,
    exchangerate_api_key,
    gold_api_key,
    bark_token,
    admin_token,
    ...safe
  } = settings || {};
  return safe;
}

function maskKey(v) {
  if (!v) return '';
  return `${String(v).slice(0, 4)}****`;
}

app.use(express.json()); app.use(express.static(path.join(ROOT, 'public')));

async function ensureBaseFiles() {
  await fs.mkdir(REPORTS_DIR, { recursive: true }); await fs.mkdir(CONVERSATIONS_DIR, { recursive: true });
  try { await fs.access(SETTINGS_PATH); } catch { await fs.copyFile(SETTINGS_EXAMPLE_PATH, SETTINGS_PATH); console.log('已创建默认配置文件，请前往 /admin 填写API Key'); }
  try { await fs.access(MEMORY_PATH); } catch { await writeJson(MEMORY_PATH, MEMORY_TEMPLATE); }
  try { await fs.access(LATEST_DATA_PATH); } catch { await fs.writeFile(LATEST_DATA_PATH, JSON.stringify({}, null, 2)); }
}
async function requireAuth(req, res, next) { const s = await readSettings(); const expected = s.admin_token || ''; if (!expected) return next(); const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); const token = auth || req.query.token || ''; if (token !== expected) return res.status(401).json({ error: '未授权' }); next(); }

app.get('/api/settings', requireAuth, async (req, res) => {
  const settings = await readSettings();
  const safe = getSafeSettings(settings);
  res.json({ ...safe, deepseek_api_key: maskKey(settings.deepseek_api_key), news_api_key: maskKey(settings.news_api_key), openweather_api_key: maskKey(settings.openweather_api_key), exchangerate_api_key: maskKey(settings.exchangerate_api_key), gold_api_key: maskKey(settings.gold_api_key), bark_token: maskKey(settings.bark_token) });
});
app.post('/api/settings', requireAuth, async (req, res) => { await writeJson(SETTINGS_PATH, { ...(await readSettings()), ...(req.body || {}), profile: { ...(await readSettings()).profile, ...((req.body || {}).profile || {}) } }); res.json({ success: true }); });
app.get('/api/latest-data', async (req, res) => { try { const latest = await readJson(LATEST_DATA_PATH, {}); if (latest.settings) latest.settings = getSafeSettings(latest.settings); res.json(latest); } catch { res.json({ empty: true }); } });
app.get('/report', async (req, res) => { const files = (await fs.readdir(REPORTS_DIR).catch(() => [])).filter((f) => f.endsWith('.html')).sort(); if (!files.length) return res.send('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body>暂无报告，将在今日09:00自动生成</body></html>'); res.send(await fs.readFile(path.join(REPORTS_DIR, files.at(-1)), 'utf-8')); });
app.get('/trigger', requireAuth, async (req, res) => { runDailyJob({ readSettings, fetchAllData, writeJson, latestDataPath: LATEST_DATA_PATH, conversationsDir: CONVERSATIONS_DIR, reportsDir: REPORTS_DIR, dateStr: () => dateStr(TIMEZONE), CONSTITUTION }).catch((e) => console.log('手动触发失败：', e.message)); res.json({ success: true, message: '报告生成中，请稍后访问 /report 查看' }); });

app.get('/api/memory', async (req, res) => res.json(await readMemory(MEMORY_PATH, readJson, TIMEZONE)));
app.post('/api/memory', requireAuth, async (req, res) => { const body = req.body || {}; const type = body.type || 'knowledge'; await writeMemoryLatest(MEMORY_PATH, readJson, writeJson, TIMEZONE, async (m) => { const item = { id: randomUUID(), title: body.title || '未命名', content: body.content || '', source: body.source || '手动', tags: body.tags || [], type, date_created: dateStr(TIMEZONE), date_updated: dateStr(TIMEZONE), importance: body.importance || 5, tokens: estimateTokens(body.content || ''), decay_score: type === 'identity' ? 10 : (body.decay_score ?? 10), related_ids: [], history: [], conflict: false }; m[type].push(item); recalcTokens(m); if (m.meta.total_tokens > m.meta.soft_limit) { const s = await readSettings(); await sendBark(s.bark_token, '记忆库已达软上限，建议进行AI修剪'); } return m; }); res.json({ success: true }); });
app.put('/api/memory/:id', requireAuth, async (req, res) => { await writeMemoryLatest(MEMORY_PATH, readJson, writeJson, TIMEZONE, async (m) => { for (const t of ['identity', 'knowledge', 'inference', 'archive']) m[t] = m[t].map((i) => i.id === req.params.id ? { ...i, ...req.body, date_updated: dateStr(TIMEZONE) } : i); recalcTokens(m); return m; }); res.json({ success: true }); });
app.delete('/api/memory/:id', requireAuth, async (req, res) => { await writeMemoryLatest(MEMORY_PATH, readJson, writeJson, TIMEZONE, async (m) => { for (const t of ['identity', 'knowledge', 'inference', 'archive']) m[t] = m[t].filter((x) => x.id !== req.params.id); recalcTokens(m); return m; }); res.json({ success: true }); });
app.post('/api/memory/archive/:id', requireAuth, async (req, res) => { await writeMemoryLatest(MEMORY_PATH, readJson, writeJson, TIMEZONE, async (m) => { for (const t of ['identity', 'knowledge', 'inference']) { const idx = m[t].findIndex((x) => x.id === req.params.id); if (idx >= 0) { const [item] = m[t].splice(idx, 1); m.archive.push({ ...item, type: item.type || t, date_updated: dateStr(TIMEZONE) }); break; } } recalcTokens(m); return m; }); res.json({ success: true }); });
app.post('/api/memory/restore/:id', requireAuth, async (req, res) => { await writeMemoryLatest(MEMORY_PATH, readJson, writeJson, TIMEZONE, async (m) => { const idx = m.archive.findIndex((x) => x.id === req.params.id); if (idx >= 0) { const [item] = m.archive.splice(idx, 1); const t = ['identity', 'knowledge', 'inference'].includes(item.type) ? item.type : 'knowledge'; m[t].push({ ...item, type: t, date_updated: dateStr(TIMEZONE) }); } recalcTokens(m); return m; }); res.json({ success: true }); });
app.post('/api/memory/resolve-conflict', requireAuth, async (req, res) => { let updated = null; const { id, action } = req.body || {}; await writeMemoryLatest(MEMORY_PATH, readJson, writeJson, TIMEZONE, async (m) => { for (const t of ['knowledge', 'inference']) { m[t] = m[t].map((item) => { if (item.id !== id) return item; const oldContent = (item.history || []).at(-1)?.content || ''; if (action === 'keep_old') updated = { ...item, content: oldContent || item.content, conflict: false, date_updated: dateStr(TIMEZONE) }; else if (action === 'merge') updated = { ...item, content: `${item.content || ''}\n${oldContent || ''}`.trim(), conflict: false, date_updated: dateStr(TIMEZONE) }; else updated = { ...item, conflict: false, date_updated: dateStr(TIMEZONE) }; return updated; }); } recalcTokens(m); return m; }); res.json({ success: true, memory: updated }); });
app.post('/api/memory/prune', requireAuth, async (req, res) => res.json({ status: 'pending', message: 'AI修剪功能正在完善中', suggestions: [] }));
app.get('/api/memory/import-report', requireAuth, async (req, res) => res.json({ success: true }));

app.get('/api/conversations', async (req, res) => { const files = (await fs.readdir(CONVERSATIONS_DIR).catch(() => [])).filter((f) => f.endsWith('.json')); const list = []; for (const f of files) { const c = await readJson(path.join(CONVERSATIONS_DIR, f), {}); const um = (c.messages || []).find((x) => x.role === 'user'); list.push({ id: f.replace('.json', ''), title: String(um?.content || '未命名对话').slice(0, 20), updated_at: c.updated_at || '' }); } list.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0)); res.json(list); });
app.get('/api/conversations/:id', async (req, res) => { const p = path.join(CONVERSATIONS_DIR, `${req.params.id}.json`); try { await fs.access(p); res.json(await readJson(p, {})); } catch { res.status(404).json({ error: '对话不存在' }); } });
app.post('/api/chat', requireAuth, async (req, res) => { const { message, conversation_id } = req.body || {}; const settings = await readSettings(); const id = conversation_id || randomUUID(); const cpath = path.join(CONVERSATIONS_DIR, `${id}.json`); const conv = await readJson(cpath, { id, messages: [] }); conv.messages.push({ role: 'user', content: message, created_at: new Date().toISOString() }); const ai = await callDeepSeek(settings, [{ role: 'system', content: `${CONSTITUTION}\n\n${settings.chat_system_prompt || ''}` }, ...conv.messages.map((x) => ({ role: x.role, content: x.content }))]); conv.messages.push({ role: 'assistant', content: ai, created_at: new Date().toISOString() }); conv.updated_at = new Date().toISOString(); await writeJson(cpath, conv); res.json({ conversation_id: id, reply: ai }); });
app.post('/api/chat/summarize', requireAuth, async (req, res) => res.json({ status: 'pending', message: '记忆提炼功能正在完善中', added: [], merged: [], conflicts: [] }));
app.get('/api/chat/summarize', requireAuth, async (req, res) => res.json({ success: true }));

ensureBaseFiles().then(() => { startScheduler({ timezone: TIMEZONE, runDailyJob: () => runDailyJob({ readSettings, fetchAllData, writeJson, latestDataPath: LATEST_DATA_PATH, conversationsDir: CONVERSATIONS_DIR, reportsDir: REPORTS_DIR, dateStr: () => dateStr(TIMEZONE), CONSTITUTION }), decayTask: async () => { console.log('开始执行记忆衰减任务'); await runMemoryDecay(MEMORY_PATH, readJson, writeJson); } }); app.listen(PORT, () => console.log(`服务已启动，端口：${PORT}`)); });
