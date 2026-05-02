const axios = require('axios');
async function sendBark(token, title, body = '', url = '') {
  if (!token) return;
  const safeTitle = encodeURIComponent(title || '提醒');
  const safeBody = encodeURIComponent(body || '');
  let api = `https://api.day.app/${token}/${safeTitle}`;
  if (body) api += `/${safeBody}`;
  const params = [];
  if (url) params.push(`url=${encodeURIComponent(url)}`);
  if (params.length) api += `?${params.join('&')}`;
  await axios.get(api).catch(() => {});
}
module.exports = { sendBark };
