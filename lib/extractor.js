const fs = require('fs').promises;
const path = require('path');
const { randomUUID } = require('crypto');
const { callDeepSeek } = require('./reportGenerator');
const { writeMemoryLatest, recalcTokens } = require('./memoryManager');
const { writeTasksLatest } = require('./tasksManager');
const { getUserConversationPath, getUserSettings, getUserDataPath, ensureDir } = require('./userData');

const PROMPT = `你是信息提取助手。分析以下内容，提取记忆、任务和跟进事项。\n严格只返回JSON，不输出任何其他内容：...`;
function parseResult(raw) { try { return JSON.parse(raw); } catch { return { memories: [], tasks: [], followups: [] }; } }
function normalize(result, meta = {}) { const now = new Date().toISOString();
 const memories=(result.memories||[]).map((m)=>({id:`mem_${randomUUID()}`,type:['identity','knowledge','inference'].includes(m.type)?m.type:'knowledge',title:m.title||'未命名',content:m.content||'',tags:m.tags||[],source_type:m.source_type||'ai_inferred',source_conversation_id:meta.conversation_id||null,source_message_ids:[],confidence:Number(m.confidence||0),stability:m.stability||'medium',needs_review:!!m.needs_review,date_created:now,date_updated:now}));
 const tasks=(result.tasks||[]).map((t)=>({id:`task_${randomUUID().slice(0,8)}`,title:t.title||'未命名任务',description:t.description||'',status:t.is_explicit&&Number(t.confidence||0)>=0.7?'todo':'inbox',priority:Number(t.priority||3),due_at:t.due_at||null,source_type:meta.source_type||'conversation',source_conversation_id:meta.conversation_id||null,source_message_ids:[],source_report_date:null,related_memory_ids:[],tags:t.tags||[],confidence:Number(t.confidence||0),needs_review:!t.is_explicit||Number(t.confidence||0)<0.7||!!t.needs_review,checklist:[],created_at:now,updated_at:now,is_explicit:!!t.is_explicit}));
 const followups=(result.followups||[]).map((f)=>({id:`task_${randomUUID().slice(0,8)}`,title:f.title||'未命名观察项',description:f.description||'',status:'watch',priority:3,due_at:null,source_type:meta.source_type||'conversation',source_conversation_id:meta.conversation_id||null,source_message_ids:[],source_report_date:null,related_memory_ids:[],tags:f.tags||[],confidence:1,needs_review:false,checklist:[],created_at:now,updated_at:now}));
 return { memories,tasks,followups }; }
async function extractFromText(settings,text,meta={}){ try{ const raw=await callDeepSeek(settings,[{role:'system',content:PROMPT},{role:'user',content:String(text||'')}]); return normalize(parseResult(raw),meta);}catch(e){console.log('提取器执行失败：',e.message);return {memories:[],tasks:[],followups:[]};}}
async function extractFromConversation(settings,messages,meta={}){ return extractFromText(settings, JSON.stringify(messages||[]), { ...meta, source_type: 'conversation' }); }

async function summarizeConversation(userId, conversationId) {
  const settings = await getUserSettings(userId);
  if (!settings.deepseek_api_key) {
    return { status: 'pending', message: '请先配置DeepSeek API Key' };
  }

  const userRoot = getUserDataPath(userId);
  const convPath = path.join(getUserConversationPath(userId), `${conversationId}.json`);
  const memoryPath = path.join(userRoot, 'memory.json');
  const tasksPath = path.join(userRoot, 'tasks.json');

  const readJson = async (filePath, fallback = {}) => {
    try { return JSON.parse(await fs.readFile(filePath, 'utf8')); } catch (e) { return fallback; }
  };
  const writeJson = async (filePath, data) => {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  };

  const conv = await readJson(convPath, null);
  if (!conv) throw new Error('对话不存在');

  const extracted = await extractFromConversation(settings, conv.messages || [], { conversation_id: conversationId, source_type: 'conversation', userId });
  const nowIso = new Date().toISOString();

  await writeMemoryLatest(memoryPath, readJson, writeJson, 'Asia/Shanghai', async (m) => {
    for (const item of extracted.memories || []) {
      (m[item.type] || []).push({ ...item, importance: 8, decay_score: 10, use_count: 0, last_used_at: null, expires_at: null, conflict: false, history: [] });
    }
    recalcTokens(m);
    return m;
  });

  await writeTasksLatest(tasksPath, readJson, writeJson, async (t) => {
    for (const item of extracted.tasks || []) {
      if (item.status === 'todo') t.tasks.push(item);
      else t.inbox.push(item);
    }
    for (const f of extracted.followups || []) t.watch.push(f);
    return t;
  });

  conv.memory_summary_pending = false;
  conv.memory_summary_count = (conv.memory_summary_count || 0) + 1;
  conv.last_summarized_at = nowIso;
  conv.last_summarized_message_count = (conv.messages || []).length;
  conv.last_summarized_user_count = (conv.messages || []).filter((m) => m.role === 'user').length;
  await writeJson(convPath, conv);

  return { status: 'done', added: (extracted.memories || []).length, merged: 0, conflicts: 0, tasks_added: (extracted.tasks || []).length + (extracted.followups || []).length };
}
module.exports = { extractFromConversation, extractFromText, summarizeConversation };
