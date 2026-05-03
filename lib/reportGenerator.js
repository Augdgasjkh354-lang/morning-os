const CONSTITUTION = `【系统宪法】
- 优先保证准确与可解释性
- 只基于可用数据回答
- 不确定时说明不确定性

【工具调用原则】
- 只在无法保证信息准确性或时效性时才调用外部数据源
- 只在用户明确表达行动承诺时才自主添加任务
- 只在判断信息具有长期价值时才自主添加记忆，默认保守
- 自主添加的记忆和任务必须标记 needs_review=true，不绕过用户确认
- 不过度调用工具，每次对话最多执行3轮工具调用
- 不主动干涉用户的决策和行为，只提供信息支撑`;
const { readUserData, writeUserData, getUserReportsPath, getUserConversationPath, ensureDir } = require('./userData');
const { readTasks } = require('./tasksManager');
const { fetchAllData } = require('./dataFetcher');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
async function callDeepSeek(settings, messages) { const r = await axios.post('https://api.deepseek.com/v1/chat/completions', { model: 'deepseek-chat', messages }, { headers: { Authorization: `Bearer ${settings.deepseek_api_key}` } }); return r.data?.choices?.[0]?.message?.content || ''; }
async function runDailyJob(userId) { console.log(`开始执行晨报任务，用户：${userId}`); const settings = await readUserData(userId, 'settings.json'); const latestData = await fetchAllData(userId); await writeUserData(userId, 'latest-data.json', latestData); const content = await callDeepSeek(settings, [{ role: 'user', content: JSON.stringify(latestData) }]).catch(() => '<h1>今日晨报生成失败</h1>'); const reportsDir = getUserReportsPath(userId); await ensureDir(reportsDir); const day = new Date().toISOString().slice(0,10); await fs.writeFile(path.join(reportsDir, `${day}.html`), `<!doctype html><html lang='zh-CN'><meta charset='utf-8'><body>${content}</body></html>`); console.log(`晨报任务执行结束，用户：${userId}`); }
module.exports = { callDeepSeek, runDailyJob, CONSTITUTION };
