const axios = require('axios');
module.exports = async function fetchMetals(settings) {
  try {
    const h = { 'x-access-token': settings.gold_api_key };
    const [g, s] = await Promise.all([axios.get('https://www.goldapi.io/api/XAU/USD', { headers: h }), axios.get('https://www.goldapi.io/api/XAG/USD', { headers: h })]);
    return { name: 'metals', success: true, data: { gold: g.data, silver: s.data } };
  } catch (e) {
    return { name: 'metals', success: false, error: e.message, data: null };
  }
};
