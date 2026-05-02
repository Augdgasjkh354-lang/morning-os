const fs = require('fs').promises;
const { randomUUID } = require('crypto');

const MEMORY_TEMPLATE = { meta: { total_tokens: 0, soft_limit: 40000, hard_limit: 50000, last_pruned: null }, identity: [], knowledge: [], inference: [], archive: [] };
const estimateTokens = (text = '') => Math.floor(String(text).length / 2);
const kw = (t = '') => [...new Set(String(t).toLowerCase().split(/[\s,.;!?，。！？；：、“”"'（）()\[\]{}]+/).filter((x) => x.length > 1 && !['我', '你', '他', '她', '它', '这个', '那个', '我们', '他们', '就是', '然后', '但是', '所以'].includes(x)))];
const similarity = (a, b) => { const A = kw(`${a.title} ${a.content}`); const B = kw(`${b.title} ${b.content}`); const inter = A.filter((x) => B.includes(x)).length; return inter / Math.max(1, Math.min(A.length, B.length)); };
const dateStr = (timezone, d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const recalcTokens = (m) => { m.meta.total_tokens = [...m.knowledge, ...m.inference].filter((x) => !x.conflict).reduce((s, x) => s + (x.tokens || 0), 0); };

function normalizeMemory(memory, timezone) { if (memory.memories) { const k = memory.memories.map((i) => ({ id: i.id || randomUUID(), title: i.title || '未命名', content: i.content || '', source: i.source || '手动', tags: i.tags || [], date_created: (i.date || new Date().toISOString()).slice(0, 10), date_updated: dateStr(timezone), importance: i.importance || 5, tokens: estimateTokens(i.content || ''), decay_score: 10, related_ids: [], history: [], conflict: false })); return { ...MEMORY_TEMPLATE, knowledge: k, meta: { ...MEMORY_TEMPLATE.meta, total_tokens: k.reduce((a, b) => a + (b.tokens || 0), 0) } }; } return { ...MEMORY_TEMPLATE, ...memory, meta: { ...MEMORY_TEMPLATE.meta, ...(memory.meta || {}) }, identity: memory.identity || [], knowledge: memory.knowledge || [], inference: memory.inference || [], archive: memory.archive || [] }; }
async function readMemory(memoryPath, readJson, timezone) { return normalizeMemory(await readJson(memoryPath, MEMORY_TEMPLATE), timezone); }
async function writeMemoryLatest(memoryPath, readJson, writeJson, timezone, mutator) { const latest = await readMemory(memoryPath, readJson, timezone); const out = await mutator(latest); await writeJson(memoryPath, out); return out; }
module.exports = { MEMORY_TEMPLATE, estimateTokens, kw, similarity, dateStr, recalcTokens, readMemory, writeMemoryLatest };
