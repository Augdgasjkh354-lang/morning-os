const fs = require('fs').promises;
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCES_DIR = path.join(ROOT, 'sources');

function sourceEnabled(settings, name) {
  const key = `${name}_enabled`;
  return settings[key] !== false;
}

function safeSettings(settings = {}) {
  const {
    deepseek_api_key, news_api_key, openweather_api_key,
    exchangerate_api_key, gold_api_key, bark_token, admin_token,
    ...safe
  } = settings;
  return safe;
}

async function fetchAllData(userId) {
  const { readUserData } = require('./userData');
  const settings = await readUserData(userId, 'settings.json');
  const files = (await fs.readdir(SOURCES_DIR).catch(() => []))
    .filter((f) => f.endsWith('.js'));
  const tasks = files
    .map((file) => {
      const name = path.basename(file, '.js');
      if (!sourceEnabled(settings, name)) {
        return Promise.resolve({ status: 'fulfilled', value: { name, success: false, disabled: true, data: null } });
      }
      const mod = require(path.join(SOURCES_DIR, file));
      return Promise.resolve(mod(settings)).then((value) => ({ status: 'fulfilled', value })).catch((reason) => ({ status: 'rejected', reason }));
    });

  const settled = await Promise.allSettled(tasks);
  const out = { updated_at: new Date().toISOString(), settings: safeSettings(settings) };
  for (const wrap of settled) {
    if (wrap.status !== 'fulfilled') continue;
    const result = wrap.value;
    if (result.status === 'fulfilled') {
      out[result.value.name] = result.value;
    } else {
      const errorName = 'unknown';
      out[errorName] = { name: errorName, success: false, error: result.reason?.message || '未知错误', data: null };
      console.log('数据源执行失败：', result.reason?.message || '未知错误');
    }
  }
  return out;
}

module.exports = { fetchAllData };
