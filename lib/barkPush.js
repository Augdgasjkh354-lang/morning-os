const axios = require('axios');
async function sendBark(token, message) { if (!token) return; await axios.get(`https://api.day.app/${token}/${encodeURIComponent(message)}`).catch(() => {}); }
module.exports = { sendBark };
