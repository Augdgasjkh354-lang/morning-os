const axios = require('axios');
const { readUserData } = require('./userData');
async function sendBark(userId, title, body = '', url = '') {
  const settings = await readUserData(userId, 'settings.json');
  const token = settings.bark_token;
  if (!token) return;
  const safeTitle = encodeURIComponent(title || '提醒');
  const safeBody = encodeURIComponent(body || '');
  let api = `https://api.day.app/${token}/${safeTitle}`;
  if (body) api += `/${safeBody}`;
  if (url) api += `?url=${encodeURIComponent(url)}`;
  await axios.get(api).catch(() => {});
}
module.exports = { sendBark };
