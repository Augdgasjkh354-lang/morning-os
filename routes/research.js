const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const { randomUUID } = require('crypto');
const { requireAuth } = require('../middleware/auth');
const { getUserResearch, saveUserResearch, getUserMemory } = require('../lib/userData');
const router = express.Router();
const now = () => new Date().toISOString();
const gid = (p) => `${p}_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
const readResearch = async (u) => await getUserResearch(u);
const writeResearch = async (u, d) => saveUserResearch(u, d);

  async function fetchUrlMeta(url) {
    try {
      const res = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      const $ = cheerio.load(res.data);
      const title = $('title').text().trim() || url;
      const description = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || $('body').text().slice(0, 200).trim();
      return { title, summary: description, url };
    } catch {
      return { title: url, summary: '', url };
    }
  }

  router.use(requireAuth);
  router.get('/', async (req, res) => {
    const data = await readResearch(req.user.userId);
    res.json({ topics: (data.topics || []).map(t => ({ ...t, materials: undefined, journal: undefined, materials_count: (t.materials || []).length, journal_count: (t.journal || []).length })) });
  });
  router.get('/:id', async (req, res) => {
    const d = await readResearch(req.user.userId); const t = (d.topics || []).find(x => x.id === req.params.id); if (!t) return res.status(404).json({ error: '主题不存在' }); res.json(t);
  });
  router.post('/', async (req, res) => {
    const { title, description, tags, linked_memory_ids } = req.body || {};
    const d = await readResearch(req.user.userId); const time = now();
    const t = { id: gid('topic'), title: title || '未命名主题', description: description || '', status: 'active', tags: tags || [], linked_memory_ids: linked_memory_ids || [], linked_task_ids: [], current_conclusion: '', pending_questions: [], viewpoints: [], materials: [], journal: [], auto_generated: false, created_at: time, updated_at: time };
    d.topics = d.topics || []; d.topics.unshift(t); await writeResearch(req.user.userId, d); res.json(t);
  });
  router.put('/:id', async (req, res) => { const d = await readResearch(req.user.userId); const t = (d.topics || []).find(x => x.id === req.params.id); if (!t) return res.status(404).json({ error: '主题不存在' }); ['title', 'description', 'status', 'current_conclusion', 'pending_questions'].forEach(k => { if (req.body?.[k] !== undefined) t[k] = req.body[k]; }); t.updated_at = now(); await writeResearch(req.user.userId, d); res.json(t); });
  router.delete('/:id', async (req, res) => { const d = await readResearch(req.user.userId); d.topics = (d.topics || []).filter(x => x.id !== req.params.id); await writeResearch(req.user.userId, d); res.json({ success: true }); });
  router.post('/:id/viewpoints', async (req, res) => { const d = await readResearch(req.user.userId); const t = d.topics.find(x => x.id === req.params.id); if (!t) return res.status(404).json({ error: '主题不存在' }); const time = now(); const vp = { id: gid('vp'), content: req.body?.content || '', status: 'pending', evidence: req.body?.evidence || '', created_at: time, updated_at: time }; t.viewpoints.push(vp); t.journal.push({ id: gid('journal'), content: `新增观点：${vp.content.slice(0, 60)}`, type: 'viewpoint_added', related_ids: [vp.id], created_at: time }); t.updated_at = time; await writeResearch(req.user.userId, d); res.json(vp); });
  router.put('/:id/viewpoints/:vpId', async (req, res) => { const d = await readResearch(req.user.userId); const t = d.topics.find(x => x.id === req.params.id); const vp = t?.viewpoints?.find(x => x.id === req.params.vpId); if (!vp) return res.status(404).json({ error: '观点不存在' }); ['status', 'content', 'evidence'].forEach(k => req.body?.[k] !== undefined && (vp[k] = req.body[k])); vp.updated_at = now(); t.updated_at = vp.updated_at; await writeResearch(req.user.userId, d); res.json(vp); });
  router.delete('/:id/viewpoints/:vpId', async (req, res) => { const d = await readResearch(req.user.userId); const t = d.topics.find(x => x.id === req.params.id); if (!t) return res.status(404).json({ error: '主题不存在' }); t.viewpoints = (t.viewpoints || []).filter(x => x.id !== req.params.vpId); t.updated_at = now(); await writeResearch(req.user.userId, d); res.json({ success: true }); });
  router.post('/:id/materials/fetch-url', async (req, res) => { const { url } = req.body || {}; if (!url) return res.status(400).json({ success: false, error: '缺少URL' }); try { const r = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }); const $ = cheerio.load(r.data); const title = $('title').text().trim() || url; const summary = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || $('body').text().slice(0, 200).trim(); res.json({ success: true, title, summary, url }); } catch (e) { res.json({ success: false, error: e.message }); } });
  router.post('/:id/materials', async (req, res) => { const d = await readResearch(req.user.userId); const t = d.topics.find(x => x.id === req.params.id); if (!t) return res.status(404).json({ error: '主题不存在' }); let { url, title, summary, source_type, source_date, tags } = req.body || {}; if (url && !title && !summary) { const meta = await fetchUrlMeta(url); title = meta.title; summary = meta.summary; } const time = now(); const mat = { id: gid('mat'), title: title || url || '未命名资料', url: url || '', summary: summary || '', source_type: source_type || 'manual', source_date: source_date || time.slice(0, 10), tags: tags || [], created_at: time }; t.materials.push(mat); t.journal.push({ id: gid('journal'), content: `新增资料：${mat.title}`, type: 'material_added', related_ids: [mat.id], created_at: time }); t.updated_at = time; await writeResearch(req.user.userId, d); res.json(mat); });
  router.delete('/:id/materials/:matId', async (req, res) => { const d = await readResearch(req.user.userId); const t = d.topics.find(x => x.id === req.params.id); if (!t) return res.status(404).json({ error: '主题不存在' }); t.materials = (t.materials || []).filter(x => x.id !== req.params.matId); t.updated_at = now(); await writeResearch(req.user.userId, d); res.json({ success: true }); });
  router.post('/:id/journal', async (req, res) => { const d = await readResearch(req.user.userId); const t = d.topics.find(x => x.id === req.params.id); if (!t) return res.status(404).json({ error: '主题不存在' }); const j = { id: gid('journal'), content: req.body?.content || '', type: req.body?.type || 'insight', related_ids: req.body?.related_ids || [], created_at: now() }; t.journal.push(j); t.updated_at = now(); await writeResearch(req.user.userId, d); res.json(j); });
  router.post('/:id/link-memory', async (req, res) => { const d = await readResearch(req.user.userId); const t = d.topics.find(x => x.id === req.params.id); if (!t) return res.status(404).json({ error: '主题不存在' }); const id = req.body?.memory_id; if (!id) return res.status(400).json({ error: '缺少memory_id' }); t.linked_memory_ids = [...new Set([...(t.linked_memory_ids || []), id])]; t.updated_at = now(); await writeResearch(req.user.userId, d); res.json({ success: true, linked_memory_ids: t.linked_memory_ids }); });
  router.delete('/:id/link-memory/:memoryId', async (req, res) => { const d = await readResearch(req.user.userId); const t = d.topics.find(x => x.id === req.params.id); if (!t) return res.status(404).json({ error: '主题不存在' }); t.linked_memory_ids = (t.linked_memory_ids || []).filter(x => x !== req.params.memoryId); t.updated_at = now(); await writeResearch(req.user.userId, d); res.json({ success: true }); });
  router.post('/auto-generate', async (req, res) => { const d = await readResearch(req.user.userId); const mem = await getUserMemory(req.user.userId); const items = [...(mem.identity || []), ...(mem.knowledge || []), ...(mem.inference || []), ...(mem.archive || [])]; const freq = {}; items.forEach(i => (i.tags || []).forEach(t => freq[t] = (freq[t] || 0) + 1)); const hot = Object.entries(freq).filter(([, c]) => c >= 3).map(([t]) => t); const existing = new Set((d.topics || []).map(t => t.title)); const created = []; for (const tag of hot) { if (existing.has(tag)) continue; const related = items.filter(i => (i.tags || []).includes(tag)).map(i => i.id); const time = now(); const topic = { id: gid('topic'), title: tag, description: '从记忆库自动聚合', status: 'active', tags: [tag], linked_memory_ids: related, linked_task_ids: [], current_conclusion: '', pending_questions: [], viewpoints: [], materials: [], journal: [], auto_generated: true, created_at: time, updated_at: time }; d.topics.push(topic); created.push(topic); } await writeResearch(req.user.userId, d); res.json({ topics: created }); });

module.exports = router;
