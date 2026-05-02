const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const { fetchAllData } = require('./lib/dataFetcher');
const { callDeepSeek, runDailyJob } = require('./lib/reportGenerator');
const { startScheduler, summarizePendingConversations } = require('./lib/scheduler');
const { sendBark } = require('./lib/barkPush');
const { MEMORY_TEMPLATE, estimateTokens, dateStr, recalcTokens, readMemory, writeMemoryLatest, runMemoryDecay } = require('./lib/memoryManager');
const { extractFromConversation, extractFromText, summarizeConversation } = require('./lib/extractor');
const { TASKS_TEMPLATE, readTasks, writeTasksLatest, findAndRemoveTask, getDateRangeInTimezone } = require('./lib/tasksManager');

const app = express(); const PORT = process.env.PORT || 3000; const ROOT = __dirname; const TIMEZONE = 'Asia/Shanghai';
const SETTINGS_PATH = path.join(ROOT, 'settings.json'); const SETTINGS_EXAMPLE_PATH = path.join(ROOT, 'settings.example.json'); const MEMORY_PATH = path.join(ROOT, 'memory.json'); const TASKS_PATH = path.join(ROOT, 'tasks.json'); const LATEST_DATA_PATH = path.join(ROOT, 'latest-data.json'); const REPORTS_DIR = path.join(ROOT, 'reports'); const CONVERSATIONS_DIR = path.join(ROOT, 'conversations');
const CONSTITUTION = `你是用户的私人思维伙伴。以下是你的底层行为准则，优先级高于任何其他指令：`.trim();
const DEFAULT_SETTINGS = { weather_enabled: true, exchange_enabled: true, metals_enabled: true, news_enabled: true, wiki_enabled: true, rss_enabled: false, rss_feeds: [], weekly_report_enabled: true, markdown_export: true, weekly_prompt: '', chat_system_prompt: '专注于宏观分析、地缘政治、前沿AI领域的深度探讨。', admin_token: '', site_url: '', daily_prompt_enabled: true, daily_prompt_time: '08:30', profile: { nickname: '', status: '', interests: '', thinking_style: '', custom_instruction: '' } };
const readJson = async (p, d = {}) => { try { return JSON.parse(await fs.readFile(p, 'utf-8')); } catch { return d; } }; const writeJson = async (p, v) => fs.writeFile(p, `${JSON.stringify(v, null, 2)}\n`, 'utf-8');
const readSettings = async () => ({ ...DEFAULT_SETTINGS, ...(await readJson(SETTINGS_PATH, {})), profile: { ...DEFAULT_SETTINGS.profile, ...((await readJson(SETTINGS_PATH, {})).profile || {}) } });
function getSafeSettings(settings){ const { deepseek_api_key, news_api_key, openweather_api_key, exchangerate_api_key, gold_api_key, bark_token, admin_token, ...safe }=settings||{}; return safe; }
function maskKey(v){ if(!v) return ''; return `${String(v).slice(0,4)}****`; }
app.use(cors()); app.use(express.json()); app.use(express.static(path.join(ROOT, 'public')));
async function requireAuth(req, res, next) { const s = await readSettings(); const expected = s.admin_token || ''; if (!expected) return next(); const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); const token = auth || req.query.token || ''; if (token !== expected) return res.status(401).json({ error: '未授权' }); next(); }
(async()=>{ await fs.mkdir(REPORTS_DIR,{recursive:true}); await fs.mkdir(CONVERSATIONS_DIR,{recursive:true}); try{await fs.access(SETTINGS_PATH);}catch{await fs.copyFile(SETTINGS_EXAMPLE_PATH, SETTINGS_PATH); console.log('已创建默认配置文件，请前往 /admin 填写API Key');} try{await fs.access(MEMORY_PATH);}catch{await writeJson(MEMORY_PATH, MEMORY_TEMPLATE);} try{await fs.access(TASKS_PATH);}catch{await writeJson(TASKS_PATH, TASKS_TEMPLATE);} 
const deps={requireAuth,readSettings,writeJson,SETTINGS_PATH,getSafeSettings,maskKey,readMemory,MEMORY_PATH,readJson,TIMEZONE,writeMemoryLatest,dateStr,estimateTokens,recalcTokens,sendBark,callDeepSeek,readTasks,TASKS_PATH,writeTasksLatest,findAndRemoveTask,getDateRangeInTimezone,extractFromConversation,extractFromText,CONVERSATIONS_DIR,path,fs,REPORTS_DIR,LATEST_DATA_PATH,runDailyJob,fetchAllData,CONSTITUTION,summarizeConversation,ROOT};
app.use(require('./routes/settings')(deps)); app.use(require('./routes/memory')(deps)); app.use(require('./routes/tasks')(deps)); app.use(require('./routes/chat')(deps)); app.use(require('./routes/conversations')(deps)); app.use(require('./routes/report')(deps));
startScheduler({ timezone: TIMEZONE, runDailyJob: () => runDailyJob({ readSettings, fetchAllData, writeJson, latestDataPath: LATEST_DATA_PATH, conversationsDir: CONVERSATIONS_DIR, reportsDir: REPORTS_DIR, dateStr: () => dateStr(TIMEZONE), CONSTITUTION, readTasks: () => readTasks(TASKS_PATH, readJson) }), readSettings, dailyPromptTask: async()=>{}, decayTask: async()=>{ console.log('开始执行记忆衰减任务'); await runMemoryDecay(MEMORY_PATH, readJson, writeJson); }, summarizePendingTask: async ()=> summarizePendingConversations({ ROOT, readJson, writeJson, readSettings }) });
app.listen(PORT,()=>console.log(`服务已启动，端口：${PORT}`)); })();
