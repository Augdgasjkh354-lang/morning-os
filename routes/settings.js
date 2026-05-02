const express = require('express');
module.exports = function createSettingsRoutes({ requireAuth, readSettings, writeJson, SETTINGS_PATH, getSafeSettings, maskKey }) {
  const router = express.Router();
  router.get('/api/settings', requireAuth, async (req, res) => { const settings = await readSettings(); const safe = getSafeSettings(settings); res.json({ ...safe, deepseek_api_key: maskKey(settings.deepseek_api_key), news_api_key: maskKey(settings.news_api_key), openweather_api_key: maskKey(settings.openweather_api_key), exchangerate_api_key: maskKey(settings.exchangerate_api_key), gold_api_key: maskKey(settings.gold_api_key), bark_token: maskKey(settings.bark_token) }); });
  router.post('/api/settings', requireAuth, async (req, res) => { const current = await readSettings(); const incoming = { ...(req.body || {}) }; delete incoming.admin_token; await writeJson(SETTINGS_PATH, { ...current, ...incoming, admin_token: current.admin_token || '', profile: { ...current.profile, ...((incoming || {}).profile || {}) } }); res.json({ success: true }); });
  router.post('/api/admin-token', requireAuth, async (req, res) => { const current = await readSettings(); const token = String((req.body || {}).token || ''); await writeJson(SETTINGS_PATH, { ...current, admin_token: token, profile: { ...current.profile } }); res.json({ success: true }); });
  return router;
};
