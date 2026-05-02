const express = require('express');
const cron = require('node-cron');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const SETTINGS_PATH = path.join(ROOT, 'settings.json');
const MEMORY_PATH = path.join(ROOT, 'memory.json');
const LATEST_DATA_PATH = path.join(ROOT, 'latest-data.json');
const REPORTS_DIR = path.join(ROOT, 'reports');
const WEEKLY_DIR = path.join(REPORTS_DIR, 'weekly');
const MARKDOWN_DIR = path.join(REPORTS_DIR, 'markdown');
const CONVERSATIONS_DIR = path.join(ROOT, 'conversations');
const TIMEZONE = 'Asia/Shanghai';

app.use(express.json());
app.use(express.static(path.join(ROOT, 'public')));

const DEFAULT_SETTINGS = { weather_enabled: true, exchange_enabled: true, gold_enabled: true, news_enabled: true, wiki_enabled: true, weekly_report_enabled: true, markdown_export: true, weekly_prompt: '你是一位宏观分析师，请对过去一周的晨报内容做横向分析，提炼本周核心趋势、值得关注的变化和下周展望，语言简练，带有分析视角。', profile: { nickname: '', status: '', interests: '', thinking_style: '', custom_instruction: '' } };
const MEMORY_TEMPLATE = { meta: { total_tokens: 0, soft_limit: 40000, hard_limit: 50000, last_pruned: null }, identity: [], knowledge: [], inference: [], archive: [] };

const readJson = async (p, d = {}) => { try { return JSON.parse(await fs.readFile(p, 'utf-8')); } catch { return d; } };
const writeJson = async (p, v) => fs.writeFile(p, `${JSON.stringify(v, null, 2)}\n`, 'utf-8');
const readSettings = async () => ({ ...DEFAULT_SETTINGS, ...(await readJson(SETTINGS_PATH, {})), profile: { ...DEFAULT_SETTINGS.profile, ...((await readJson(SETTINGS_PATH, {})).profile || {}) } });
const dateStr = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const estimateTokens = (text = '') => Math.floor(String(text).length / 2);

function normalizeMemory(memory) {
  if (memory.memories) {
    const k = memory.memories.map((i) => ({ id: i.id || randomUUID(), title: i.title || '未命名', content: i.content || '', source: i.source || '手动', tags: i.tags || [], date_created: (i.date || new Date().toISOString()).slice(0, 10), date_updated: dateStr(), importance: i.importance || 5, tokens: estimateTokens(i.content || ''), decay_score: 10, related_ids: [], history: [], conflict: false }));
    return { ...MEMORY_TEMPLATE, knowledge: k, meta: { ...MEMORY_TEMPLATE.meta, total_tokens: k.reduce((a, b) => a + (b.tokens || 0), 0) } };
  }
  return { ...MEMORY_TEMPLATE, ...memory, meta: { ...MEMORY_TEMPLATE.meta, ...(memory.meta || {}) }, identity: memory.identity || [], knowledge: memory.knowledge || [], inference: memory.inference || [], archive: memory.archive || [] };
}

async function readMemory() { return normalizeMemory(await readJson(MEMORY_PATH, MEMORY_TEMPLATE)); }
async function writeMemoryLatest(mutator) { const latest = await readMemory(); const out = await mutator(latest); await writeJson(MEMORY_PATH, out); return out; }
function recalcTokens(m) { m.meta.total_tokens = [...m.knowledge, ...m.inference].filter((x) => !x.conflict).reduce((s, x) => s + (x.tokens || 0), 0); }

async function ensureBaseFiles() {
  for (const dir of [REPORTS_DIR, WEEKLY_DIR, MARKDOWN_DIR, CONVERSATIONS_DIR]) { await fs.mkdir(dir, { recursive: true }); const keep = path.join(dir, '.gitkeep'); try { await fs.access(keep); } catch { await fs.writeFile(keep, ''); } }
  try { await fs.access(MEMORY_PATH); } catch { await writeJson(MEMORY_PATH, MEMORY_TEMPLATE); }
  await writeJson(MEMORY_PATH, await readMemory());
  try { await fs.access(LATEST_DATA_PATH); } catch { await fs.writeFile(LATEST_DATA_PATH, JSON.stringify({}, null, 2)); }
}

async function safeFetch(enabled, fn, fallback) { if (!enabled) return { success: false, disabled: true, data: fallback }; try { return await fn(); } catch (e) { console.log('模块执行失败：', e.message); return { success: false, error: e.message, data: fallback }; } }
async function fetchAllData(settings) { return { updated_at: new Date().toISOString(), weather: await safeFetch(settings.weather_enabled, async () => ({ success: true, data: (await axios.get('https://api.openweathermap.org/data/2.5/weather', { params: { lat: settings.city_lat, lon: settings.city_lon, units: 'metric', lang: 'zh_cn', appid: settings.openweather_api_key } })).data }), {}), exchangeRates: await safeFetch(settings.exchange_enabled, async () => { const r = (await axios.get(`https://v6.exchangerate-api.com/v6/${settings.exchangerate_api_key}/latest/USD`)).data?.conversion_rates || {}; return { success: true, data: { CNY: r.CNY, EUR: r.EUR, JPY: r.JPY } }; }, {}), metals: await safeFetch(settings.gold_enabled, async () => { const h = { 'x-access-token': settings.gold_api_key }; const [g, s] = await Promise.all([axios.get('https://www.goldapi.io/api/XAU/USD', { headers: h }), axios.get('https://www.goldapi.io/api/XAG/USD', { headers: h })]); return { success: true, data: { gold: g.data, silver: s.data } }; }, {}), news: await safeFetch(settings.news_enabled, async () => { const a = (await axios.get('https://newsapi.org/v2/top-headlines', { params: { category: settings.news_category, language: 'en', pageSize: 10, apiKey: settings.news_api_key } })).data?.articles || []; return { success: true, data: a.map((i) => ({ title: i.title, description: i.description })) }; }, []), wiki: await safeFetch(settings.wiki_enabled, async () => ({ success: true, data: (await axios.get(`https://zh.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(settings.wiki_topic || '人工智能')}`)).data }), {}), settings: { ...settings, deepseek_api_key: undefined } }; }

async function callDeepSeek(settings, messages) { const r = await axios.post('https://api.deepseek.com/v1/chat/completions', { model: 'deepseek-chat', messages }, { headers: { Authorization: `Bearer ${settings.deepseek_api_key}` } }); return r.data?.choices?.[0]?.message?.content || ''; }
const kw = (t = '') => [...new Set(String(t).toLowerCase().split(/[\s,.;!?，。！？；：、“”"'（）()\[\]{}]+/).filter((x) => x.length > 1 && !['我', '你', '他', '她', '它', '这个', '那个', '我们', '他们', '就是', '然后', '但是', '所以'].includes(x)))];
const similarity = (a, b) => { const A = kw(`${a.title} ${a.content}`); const B = kw(`${b.title} ${b.content}`); const inter = A.filter((x) => B.includes(x)).length; return inter / Math.max(1, Math.min(A.length, B.length)); };

async function runDailyJob() {
  console.log('开始执行晨报任务'); const settings = await readSettings(); const latestData = await fetchAllData(settings); await writeJson(LATEST_DATA_PATH, latestData);
  const content = await callDeepSeek(settings, [{ role: 'system', content: settings.system_prompt }, { role: 'user', content: JSON.stringify(latestData) }]).catch(() => '<h1>今日晨报生成失败</h1>');
  const day = dateStr();
  const convFiles = (await fs.readdir(CONVERSATIONS_DIR)).filter((f) => f.endsWith('.json'));
  const since = Date.now() - 24 * 3600 * 1000;
  let added = 0; let merged = 0; let conflicts = 0; const titles = [];
  for (const f of convFiles) { const c = await readJson(path.join(CONVERSATIONS_DIR, f), {}); if (c.memory_summary && new Date(c.updated_at || 0).getTime() > since) { added += (c.memory_summary.added || []).length; merged += (c.memory_summary.merged || []).length; conflicts += (c.memory_summary.conflicts || []).length; titles.push(...(c.memory_summary.added || []).map((x) => x.title)); } }
  const appendix = `<hr><h2>昨日记忆更新</h2><p>新增${added}条，合并${merged}条，冲突${conflicts}条</p><ul>${titles.map((t) => `<li>${t}</li>`).join('')}</ul>${conflicts ? `<p style="color:#ef4444">有${conflicts}条记忆存在冲突，请进入记忆库处理</p>` : ''}`;
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body style="background:#0b1020;color:#fff;padding:24px">${content}${appendix}</body></html>`;
  await fs.writeFile(path.join(REPORTS_DIR, `${day}.html`), html, 'utf-8');
  console.log('晨报任务执行结束');
}

app.get('/api/settings', async (req, res) => res.json(await readSettings()));
app.post('/api/settings', async (req, res) => { await writeJson(SETTINGS_PATH, { ...(await readSettings()), ...(req.body || {}), profile: { ...(await readSettings()).profile, ...((req.body || {}).profile || {}) } }); res.json({ success: true }); });
app.get('/api/memory', async (req, res) => res.json(await readMemory()));
app.post('/api/memory', async (req, res) => { const body = req.body || {}; const type = body.type || 'knowledge'; await writeMemoryLatest(async (m) => { const item = { id: randomUUID(), title: body.title || '未命名', content: body.content || '', source: body.source || '手动', tags: body.tags || [], date_created: dateStr(), date_updated: dateStr(), importance: body.importance || 5, tokens: estimateTokens(body.content || ''), decay_score: type === 'identity' ? 10 : (body.decay_score ?? 10), related_ids: [], history: [], conflict: false }; m[type].push(item); recalcTokens(m); if (m.meta.total_tokens > m.meta.hard_limit) { const sorted = [...m.knowledge, ...m.inference].sort((a, b) => (a.decay_score || 0) - (b.decay_score || 0)).slice(0, 10).map((x) => x.id); m.archive.push(...m.knowledge.filter((x) => sorted.includes(x.id)), ...m.inference.filter((x) => sorted.includes(x.id))); m.knowledge = m.knowledge.filter((x) => !sorted.includes(x.id)); m.inference = m.inference.filter((x) => !sorted.includes(x.id)); m.meta.last_pruned = new Date().toISOString(); recalcTokens(m); }
if (m.meta.total_tokens > m.meta.soft_limit) { const s = await readSettings(); if (s.bark_token) axios.get(`https://api.day.app/${s.bark_token}/记忆库已达软上限，建议进行AI修剪`).catch(() => {}); }
return m; }); res.json({ success: true }); });
app.put('/api/memory/:id', async (req, res) => { await writeMemoryLatest(async (m) => { for (const t of ['identity', 'knowledge', 'inference', 'archive']) { m[t] = m[t].map((i) => i.id === req.params.id ? { ...i, history: [...(i.history || []), { content: i.content, date_updated: i.date_updated }], ...req.body, date_updated: dateStr(), tokens: estimateTokens((req.body.content ?? i.content) || '') } : i); } recalcTokens(m); return m; }); res.json({ success: true }); });
app.post('/api/memory/resolve-conflict', async (req, res) => { const { id, action, merged_content } = req.body || {}; await writeMemoryLatest(async (m) => { for (const t of ['knowledge', 'inference']) { const it = m[t].find((x) => x.id === id); if (!it) continue; if (action === 'keep_new') { it.conflict = false; } if (action === 'keep_old') { it.content = (it.history || []).at(-1)?.content || it.content; it.conflict = false; } if (action === 'merge') { it.content = merged_content || it.content; it.conflict = false; } it.tokens = estimateTokens(it.content); it.date_updated = dateStr(); }
recalcTokens(m); return m; }); res.json({ success: true }); });
app.post('/api/memory/restore/:id', async (req, res) => { await writeMemoryLatest(async (m) => { const x = m.archive.find((i) => i.id === req.params.id); if (!x) return m; m.archive = m.archive.filter((i) => i.id !== req.params.id); (m[x.type_hint || 'knowledge'] || m.knowledge).push(x); recalcTokens(m); return m; }); res.json({ success: true }); });

app.post('/api/chat', async (req, res) => {
  const { message, conversation_id } = req.body || {}; const settings = await readSettings(); const id = conversation_id || randomUUID(); const cpath = path.join(CONVERSATIONS_DIR, `${id}.json`); const conv = await readJson(cpath, { id, messages: [] }); const m = await readMemory(); const keys = kw(message);
  const matched = [...m.knowledge, ...m.inference].filter((x) => keys.some((k) => `${x.title} ${x.content}`.toLowerCase().includes(k))).sort((a, b) => (b.importance || 0) - (a.importance || 0)).slice(0, 8);
  const memPrompt = `【相关记忆】\n${m.identity.map((x) => `[身份] ${x.content}`).join('\n')}\n${matched.filter((x) => m.knowledge.find((k) => k.id === x.id)).map((x) => `[知识] ${x.title}：${x.content}`).join('\n')}\n${matched.filter((x) => m.inference.find((k) => k.id === x.id)).map((x) => `[推断] ${x.title}：${x.content}`).join('\n')}`;
  const p = settings.profile; const profilePrompt = `用户信息：昵称${p.nickname}，当前状态${p.status}，核心兴趣${p.interests}，思维偏好${p.thinking_style}。${p.custom_instruction}`;
  conv.messages.push({ role: 'user', content: message, created_at: new Date().toISOString() });
  const ai = await callDeepSeek(settings, [{ role: 'system', content: `${profilePrompt}\n${memPrompt}` }, ...conv.messages.map((x) => ({ role: x.role, content: x.content }))]);
  conv.messages.push({ role: 'assistant', content: ai, created_at: new Date().toISOString() }); conv.updated_at = new Date().toISOString(); conv.messages = conv.messages.slice(-50); await writeJson(cpath, conv); res.json({ conversation_id: id, reply: ai });
});

app.post('/api/chat/summarize', async (req, res) => {
  const { conversation_id } = req.body || {}; const convPath = path.join(CONVERSATIONS_DIR, `${conversation_id}.json`); const conv = await readJson(convPath, { messages: [] }); const s = await readSettings();
  const prompt = "你是一个记忆整理助手。请分析以下对话内容，提炼需要长期记住的信息，严格按照JSON格式返回，不要输出任何其他内容：{ 'identity': [{'title':'','content':'','tags':[],'importance':1-10}], 'knowledge': [{'title':'','content':'','tags':[],'importance':1-10}], 'inference': [{'title':'','content':'','tags':[],'importance':1-10}] }提炼原则：- identity：用户表达的个人信息、价值观、偏好、计划- knowledge：客观事实、数据、新闻事件- inference：用户的判断、观点、AI对用户思维模式的观察- 如果某类没有值得记录的内容，返回空数组- 不重要的闲聊不要提炼";
  let extracted = { identity: [], knowledge: [], inference: [] };
  try { extracted = JSON.parse(await callDeepSeek(s, [{ role: 'system', content: prompt }, { role: 'user', content: JSON.stringify(conv.messages) }])); } catch { console.log('提炼结果解析失败，使用空结果'); }
  const result = { added: [], merged: [], conflicts: [] };
  await writeMemoryLatest(async (m) => {
    for (const type of ['identity', 'knowledge', 'inference']) {
      for (const n of (extracted[type] || [])) {
        const item = { id: randomUUID(), title: n.title || '未命名', content: n.content || '', source: '对话', tags: n.tags || [], date_created: dateStr(), date_updated: dateStr(), importance: n.importance || 5, tokens: estimateTokens(n.content || ''), decay_score: 10, related_ids: [], history: [], conflict: false };
        const pool = m[type]; const found = pool.find((x) => similarity(x, item) > 0.6);
        if (found) {
          const contra = similarity(found, item) > 0.2 && found.content !== item.content && (found.content.includes('不') !== item.content.includes('不'));
          if (contra) { const conflict = { ...item, conflict: true, related_ids: [found.id] }; pool.push(conflict); result.conflicts.push(conflict); }
          else { found.history = [...(found.history || []), { content: found.content, date_updated: found.date_updated }]; found.content = `${found.content}\n${item.content}`; found.date_updated = dateStr(); found.tokens = estimateTokens(found.content); result.merged.push(found); }
        } else { pool.push(item); result.added.push(item); }
      }
    }
    recalcTokens(m); return m;
  });
  conv.memory_summary = result; conv.updated_at = new Date().toISOString(); await writeJson(convPath, conv);
  res.json(result);
});

cron.schedule('0 2 * * *', async () => { console.log('开始执行记忆衰减任务'); await writeMemoryLatest(async (m) => { const now = new Date(); for (const t of ['knowledge', 'inference']) { const step = t === 'knowledge' ? 7 : 14; for (const it of m[t]) { const days = Math.floor((now - new Date(it.date_updated || it.date_created || now)) / (24 * 3600 * 1000)); if (days >= step) it.decay_score = Math.max(0, (it.decay_score ?? 10) - 1); } const move = m[t].filter((x) => (x.decay_score || 0) <= 0); m.archive.push(...move.map((x) => ({ ...x, type_hint: t }))); m[t] = m[t].filter((x) => (x.decay_score || 0) > 0); }
recalcTokens(m); return m; }); console.log('记忆衰减任务完成'); }, { timezone: TIMEZONE });
cron.schedule('0 9 * * *', () => runDailyJob().catch((e) => console.log('定时任务执行失败：', e.message)), { timezone: TIMEZONE });

ensureBaseFiles().then(() => app.listen(PORT, () => console.log(`服务已启动，端口：${PORT}`)));
