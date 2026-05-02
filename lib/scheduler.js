const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');

function startScheduler({ timezone, runDailyJob, decayTask, summarizePendingTask, dailyPromptTask, readSettings }) {
  cron.schedule('0 2 * * *', () => decayTask().catch((e) => console.log('记忆衰减任务失败：', e.message)), { timezone });
  cron.schedule('5 0 * * *', () => summarizePendingTask().catch((e) => console.log('记忆提炼补偿任务失败：', e.message)), { timezone });
  cron.schedule('0 9 * * *', () => runDailyJob().catch((e) => console.log('定时任务执行失败：', e.message)), { timezone });
  cron.schedule('30 8 * * *', async () => { try { const s = await readSettings(); if (s.daily_prompt_enabled === false) return; await dailyPromptTask(s); } catch (e) { console.log('每日一问推送失败：', e.message); } }, { timezone });
}
module.exports = { startScheduler };
