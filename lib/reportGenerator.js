const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

async function callDeepSeek(settings, messages) { const r = await axios.post('https://api.deepseek.com/v1/chat/completions', { model: 'deepseek-chat', messages }, { headers: { Authorization: `Bearer ${settings.deepseek_api_key}` } }); return r.data?.choices?.[0]?.message?.content || ''; }
async function runDailyJob(ctx) {
  const { readSettings, fetchAllData, writeJson, latestDataPath, conversationsDir, reportsDir, dateStr, CONSTITUTION, readTasks } = ctx;
  console.log('开始执行晨报任务'); const settings = await readSettings(); const latestData = await fetchAllData(settings); await writeJson(latestDataPath, latestData);
  const content = await callDeepSeek(settings, [{ role: 'system', content: `${CONSTITUTION}\n\n${settings.system_prompt || ''}` }, { role: 'user', content: JSON.stringify(latestData) }]).catch(() => '<h1>今日晨报生成失败</h1>');
  const day = dateStr();
  const convFiles = (await fs.readdir(conversationsDir)).filter((f) => f.endsWith('.json'));
  const since = Date.now() - 24 * 3600 * 1000;
  let added = 0; let merged = 0; let conflicts = 0; const titles = [];
  for (const f of convFiles) { const c = JSON.parse(await fs.readFile(path.join(conversationsDir, f), 'utf-8')); if (c.memory_summary && new Date(c.updated_at || 0).getTime() > since) { added += (c.memory_summary.added || []).length; merged += (c.memory_summary.merged || []).length; conflicts += (c.memory_summary.conflicts || []).length; titles.push(...(c.memory_summary.added || []).map((x) => x.title)); } }
  const appendix = `<hr><h2>昨日记忆更新</h2><p>新增${added}条，合并${merged}条，冲突${conflicts}条</p><ul>${titles.map((t) => `<li>${t}</li>`).join('')}</ul>${conflicts ? `<p style="color:#ef4444">有${conflicts}条记忆存在冲突，请进入记忆库处理</p>` : ''}`;
  const tasksData = readTasks ? await readTasks() : { tasks: [], inbox: [], watch: [] };
  const todayMain = tasksData.tasks.find((x) => x.source_type === 'daily_prompt' && x.status !== 'done');
  const focus = tasksData.tasks.filter((x) => x.priority >= 4 && ['todo','doing'].includes(x.status)).slice(0,5);
  const watch = (tasksData.watch || []).slice(0,3);
  const action = `<hr><h2>今日行动</h2><h3>今日主任务</h3><p>${todayMain ? todayMain.title : '尚未设置，点击 /today 填写'}</p><h3>未完成重点任务</h3><ul>${focus.map((x)=>`<li>${x.title}</li>`).join('') || '<li>暂无</li>'}</ul><h3>任务收件箱提醒</h3><p>${(tasksData.inbox||[]).length ? `有${tasksData.inbox.length}项待确认任务，点击查看` : '暂无待确认任务'}</p><h3>观察项</h3><ul>${watch.map((x)=>`<li>${x.title}</li>`).join('') || '<li>暂无</li>'}</ul>`;
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body style="background:#0b1020;color:#fff;padding:24px">${content}${appendix}${action}</body></html>`;
  await fs.writeFile(path.join(reportsDir, `${day}.html`), html, 'utf-8');
  console.log('晨报任务执行结束');
}
module.exports = { callDeepSeek, runDailyJob };
