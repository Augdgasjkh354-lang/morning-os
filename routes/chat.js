const router = require('express').Router();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { randomUUID } = require('crypto');
const { requireAuth } = require('../middleware/auth');
const { getUserMemory, saveUserMemory, getUserSettings, getUserConversationPath } = require('../lib/userData');
const { summarizeConversation } = require('../lib/extractor');
const { CONSTITUTION } = require('../lib/reportGenerator');

function extractKeywords(text = '') {
  return [...new Set(String(text).toLowerCase().split(/[\s,.;!?，。！？；：、“”"'（）()\[\]{}]+/).filter((x) => x.length > 1))];
}

router.post('/', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const { message, conversation_id } = req.body || {};
  const settings = await getUserSettings(userId);
  const memory = await getUserMemory(userId);
  const convId = conversation_id || `conv_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const keywords = extractKeywords(message);
  const allMemories = [...(memory.identity || []), ...(memory.knowledge || []), ...(memory.inference || [])];
  const matched = allMemories.filter((m) => keywords.some((k) => (m.title || '').includes(k) || (m.content || '').includes(k))).sort((a, b) => (b.importance || 0) - (a.importance || 0)).slice(0, 8);
  const identity = memory.identity || [];
  const profile = settings.profile || {};
  const profileSection = profile.nickname ? `【用户背景】\n昵称：${profile.nickname}\n当前状态：${profile.status || ''}\n核心兴趣：${profile.interests || ''}\n思维偏好：${profile.thinking_style || ''}\n${profile.custom_instruction || ''}` : '';
  const memorySection = [...identity, ...matched].length > 0 ? `【相关记忆】\n${[...identity, ...matched].map((m) => `[${m.type === 'identity' ? '身份' : m.type === 'knowledge' ? '知识' : '推断'}] ${m.title}：${m.content}`).join('\n')}` : '';
  const systemPrompt = [CONSTITUTION, profileSection, memorySection, settings.chat_system_prompt || ''].filter(Boolean).join('\n\n');
  const convPath = path.join(getUserConversationPath(userId), `${convId}.json`);
  let conv = { messages: [] };
  try { conv = JSON.parse(await fs.readFile(convPath, 'utf8')); } catch (e) {}
  const messages = [...(conv.messages || []), { role: 'user', content: message, created_at: new Date().toISOString() }];
  const response = await axios.post('https://api.deepseek.com/v1/chat/completions', { model: 'deepseek-chat', max_tokens: 1000, messages: [{ role: 'system', content: systemPrompt }, ...messages.map((m) => ({ role: m.role, content: m.content }))] }, { headers: { Authorization: `Bearer ${settings.deepseek_api_key}`, 'Content-Type': 'application/json' } });
  const reply = response.data.choices[0].message.content;
  const usedMemoryIds = [...identity, ...matched].map((m) => m.id);
  for (const m of [...identity, ...matched]) { m.use_count = (m.use_count || 0) + 1; m.last_used_at = new Date().toISOString().split('T')[0]; }
  await saveUserMemory(userId, memory);
  messages.push({ role: 'assistant', content: reply, used_memory_ids: usedMemoryIds, created_at: new Date().toISOString() });
  conv.messages = messages.slice(-50);
  conv.updated_at = new Date().toISOString();
  if (!conv.id) conv.id = convId;
  await fs.mkdir(getUserConversationPath(userId), { recursive: true });
  await fs.writeFile(convPath, JSON.stringify(conv, null, 2));
  const userMsgCount = messages.filter((m) => m.role === 'user').length;
  const newSinceLast = messages.length - (conv.last_summarized_message_count || 0);
  const userSinceLast = userMsgCount - (conv.last_summarized_user_count || 0);
  if (newSinceLast >= 8 && userSinceLast >= 3 && (conv.memory_summary_count || 0) < 3) {
    conv.memory_summary_pending = true;
    await fs.writeFile(convPath, JSON.stringify(conv, null, 2));
  }
  res.json({ conversation_id: convId, reply, used_memories: [...identity, ...matched].map((m) => ({ id: m.id, title: m.title, type: m.type, relevance_score: 1.0 })) });
});

router.post('/summarize', requireAuth, async (req, res) => {
  const { conversation_id } = req.body;
  if (!conversation_id) {
    return res.status(400).json({ error: '缺少 conversation_id' });
  }
  const result = await summarizeConversation(req.user.userId, conversation_id);
  res.json(result);
});

module.exports = router;
