const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const { summarizeConversation } = require('./extractor');

function startScheduler({ timezone, runDailyJob, decayTask, summarizePendingTask, dailyPromptTask, readSettings }) {
  cron.schedule('0 2 * * *', () => decayTask().catch((e) => console.log('记忆衰减任务失败：', e.message)), { timezone });
  cron.schedule('5 0 * * *', () => summarizePendingTask().catch((e) => console.log('记忆提炼补偿任务失败：', e.message)), { timezone });
  cron.schedule('0 9 * * *', () => runDailyJob().catch((e) => console.log('定时任务执行失败：', e.message)), { timezone });
  cron.schedule('30 8 * * *', async () => { try { const s = await readSettings(); if (s.daily_prompt_enabled === false) return; await dailyPromptTask(s); } catch (e) { console.log('每日一问推送失败：', e.message); } }, { timezone });
}

async function summarizePendingConversations({ ROOT, readJson, writeJson, readSettings }) {
  const conversationsDir = path.join(ROOT, 'conversations');
  const files = (await fs.readdir(conversationsDir).catch(() => [])).filter((f) => f.endsWith('.json'));
  let ok = 0; let fail = 0;
  for (const f of files) {
    const id = f.replace('.json', '');
    const conv = await readJson(path.join(conversationsDir, f), {});
    if (!conv.memory_summary_pending) continue;
    try { await summarizeConversation(id, { ROOT, readJson, writeJson, readSettings }); ok += 1; } catch (e) { fail += 1; console.log(`补偿提炼失败：${id}，原因：${e.message}`); }
  }
  console.log(`补偿提炼完成：成功 ${ok} 条，失败 ${fail} 条`);
}

module.exports = { startScheduler, summarizePendingConversations };
