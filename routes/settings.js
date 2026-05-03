const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { getUserSettings, saveUserSettings } = require('../lib/userData');

function getSafeSettings(settings = {}) {
  const { deepseek_api_key, news_api_key, openweather_api_key, exchangerate_api_key, gold_api_key, bark_token, admin_token, ...safe } = settings;
  return safe;
}

router.get('/', requireAuth, async (req, res) => {
  const s = await getUserSettings(req.user.userId);
  res.json(getSafeSettings(s));
});

router.post('/', requireAuth, async (req, res) => {
  const current = await getUserSettings(req.user.userId);
  const incoming = req.body || {};
  delete incoming.admin_token;
  await saveUserSettings(req.user.userId, { ...current, ...incoming, profile: { ...(current.profile || {}), ...((incoming || {}).profile || {}) } });
  res.json({ success: true });
});

router.post('/admin-token', requireAuth, async (req, res) => {
  res.status(410).json({ error: '多用户系统不再支持管理令牌设置' });
});

router.get('/search-city', requireAuth, async (req, res) => {
  res.json({ success: true, cities: [] });
});

module.exports = router;
