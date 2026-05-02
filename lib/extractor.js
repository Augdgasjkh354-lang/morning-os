const { randomUUID } = require('crypto');
const { callDeepSeek } = require('./reportGenerator');

const PROMPT = `你是信息提取助手。分析以下内容，提取记忆、任务和跟进事项。
严格只返回JSON，不输出任何其他内容：
{
  'memories': [
    {
      'type': 'identity|knowledge|inference',
      'title': '',
      'content': '',
      'tags': [],
      'source_type': 'user_explicit|ai_inferred',
      'confidence': 0.0-1.0,
      'stability': 'high|medium|low',
      'needs_review': true/false
    }
  ],
  'tasks': [
    {
      'title': '',
      'description': '',
      'priority': 1-5,
      'due_at': null,
      'tags': [],
      'confidence': 0.0-1.0,
      'needs_review': true/false,
      'is_explicit': true/false
    }
  ],
  'followups': [
    {
      'title': '',
      'description': '',
      'tags': []
    }
  ]
}

判断原则：
- is_explicit=true：用户明确表达的承诺（如'明天我要...'、'提醒我...'）→ status=todo
- is_explicit=false：模糊意图（如'我应该找时间...'、'可以研究一下'）→ status=inbox, needs_review=true
- followups：观察项，不是任务（如'值得关注'、'持续追踪'）→ 进入watch
- 闲聊不提取
- 不要把所有提及的事情都变成任务`;

function parseResult(raw) { try { return JSON.parse(raw); } catch { return { memories: [], tasks: [], followups: [] }; } }

function normalize(result, meta = {}) {
  const now = new Date().toISOString();
  const memories = (result.memories || []).map((m) => ({
    id: `mem_${randomUUID()}`,
    type: ['identity', 'knowledge', 'inference'].includes(m.type) ? m.type : 'knowledge',
    title: m.title || '未命名',
    content: m.content || '',
    tags: m.tags || [],
    source_type: m.source_type || 'ai_inferred',
    source_conversation_id: meta.conversation_id || null,
    source_message_ids: [],
    confidence: Number(m.confidence || 0),
    stability: m.stability || 'medium',
    needs_review: !!m.needs_review,
    date_created: now,
    date_updated: now,
  }));
  const tasks = (result.tasks || []).map((t) => ({
    id: `task_${randomUUID().slice(0, 8)}`,
    title: t.title || '未命名任务',
    description: t.description || '',
    status: t.is_explicit && Number(t.confidence || 0) >= 0.7 ? 'todo' : 'inbox',
    priority: Number(t.priority || 3),
    due_at: t.due_at || null,
    source_type: meta.source_type || 'conversation',
    source_conversation_id: meta.conversation_id || null,
    source_message_ids: [],
    source_report_date: null,
    related_memory_ids: [],
    tags: t.tags || [],
    confidence: Number(t.confidence || 0),
    needs_review: !t.is_explicit || Number(t.confidence || 0) < 0.7 || !!t.needs_review,
    checklist: [],
    created_at: now,
    updated_at: now,
    is_explicit: !!t.is_explicit,
  }));
  const followups = (result.followups || []).map((f) => ({
    id: `task_${randomUUID().slice(0, 8)}`,
    title: f.title || '未命名观察项',
    description: f.description || '',
    status: 'watch',
    priority: 3,
    due_at: null,
    source_type: meta.source_type || 'conversation',
    source_conversation_id: meta.conversation_id || null,
    source_message_ids: [],
    source_report_date: null,
    related_memory_ids: [],
    tags: f.tags || [],
    confidence: 1,
    needs_review: false,
    checklist: [],
    created_at: now,
    updated_at: now,
  }));
  return { memories, tasks, followups };
}

async function extractFromText(settings, text, meta = {}) {
  try {
    const raw = await callDeepSeek(settings, [{ role: 'system', content: PROMPT }, { role: 'user', content: String(text || '') }]);
    return normalize(parseResult(raw), meta);
  } catch (e) {
    console.log('提取器执行失败：', e.message);
    return { memories: [], tasks: [], followups: [] };
  }
}

async function extractFromConversation(settings, messages, meta = {}) { return extractFromText(settings, JSON.stringify(messages || []), { ...meta, source_type: 'conversation' }); }

module.exports = { extractFromConversation, extractFromText };
