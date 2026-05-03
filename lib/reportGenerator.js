const { readUserData, writeUserData, getUserReportsPath, getUserConversationPath, ensureDir } = require('./userData');
const { readTasks } = require('./tasksManager');
const { fetchAllData } = require('./dataFetcher');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
async function callDeepSeek(settings, messages) { const r = await axios.post('https://api.deepseek.com/v1/chat/completions', { model: 'deepseek-chat', messages }, { headers: { Authorization: `Bearer ${settings.deepseek_api_key}` } }); return r.data?.choices?.[0]?.message?.content || ''; }
async function runDailyJob(userId) { console.log(`开始执行晨报任务，用户：${userId}`); const settings = await readUserData(userId, 'settings.json'); const latestData = await fetchAllData(userId); await writeUserData(userId, 'latest-data.json', latestData); const content = await callDeepSeek(settings, [{ role: 'user', content: JSON.stringify(latestData) }]).catch(() => '<h1>今日晨报生成失败</h1>'); const reportsDir = getUserReportsPath(userId); await ensureDir(reportsDir); const day = new Date().toISOString().slice(0,10); await fs.writeFile(path.join(reportsDir, `${day}.html`), `<!doctype html><html lang='zh-CN'><meta charset='utf-8'><body>${content}</body></html>`); console.log(`晨报任务执行结束，用户：${userId}`); }
module.exports = { callDeepSeek, runDailyJob };
