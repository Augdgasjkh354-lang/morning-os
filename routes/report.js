const router = require('express').Router();
const fs = require('fs').promises;
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const { readUserData, getUserReportsPath, ensureDir, getUserSettings } = require('../lib/userData');
const { runDailyJob } = require('../lib/reportGenerator');
const { fetchAllData } = require('../lib/dataFetcher');

function safeSettings(settings = {}) {
  const { deepseek_api_key, news_api_key, openweather_api_key, exchangerate_api_key, gold_api_key, bark_token, admin_token, ...safe } = settings;
  return safe;
}

router.get('/report', async (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'report.html')));

router.get('/trigger', requireAuth, async (req, res) => {
  runDailyJob(req.user.userId, { fetchAllData }).catch((e) => console.log('手动触发失败：', e.message));
  res.json({ success: true, message: '报告生成中' });
});

router.get('/api/latest-data', requireAuth, async (req, res) => {
  const d = await readUserData(req.user.userId, 'latest-data.json');
  if (!d || Object.keys(d).length === 0) return res.json({ empty: true });
  const settings = await getUserSettings(req.user.userId);
  res.json({ ...d, settings: safeSettings(settings) });
});

router.get('/weekly', requireAuth, async (req, res) => {
  const dir = path.join(getUserReportsPath(req.user.userId), 'weekly');
  await ensureDir(dir);
  const files = (await fs.readdir(dir).catch(() => [])).filter((f) => f.endsWith('.html')).sort();
  if (!files.length) return res.send('暂无周报');
  res.send(await fs.readFile(path.join(dir, files.at(-1)), 'utf-8'));
});

router.get('/api/report-content', requireAuth, async (req, res) => {
  const dir = getUserReportsPath(req.user.userId);
  await ensureDir(dir);
  const files = (await fs.readdir(dir).catch(() => [])).filter((f) => f.endsWith('.html')).sort();
  if (!files.length) return res.json({ empty: true, message: '暂无报告' });
  const html = await fs.readFile(path.join(dir, files.at(-1)), 'utf-8');
  res.json({ empty: false, html });
});

module.exports = router;
