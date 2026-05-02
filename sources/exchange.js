const axios = require('axios');
module.exports = async function fetchExchange(settings) {
  try {
    const r = (await axios.get(`https://v6.exchangerate-api.com/v6/${settings.exchangerate_api_key}/latest/USD`)).data?.conversion_rates || {};
    return { name: 'exchange', success: true, data: { CNY: r.CNY, EUR: r.EUR, JPY: r.JPY } };
  } catch (e) {
    return { name: 'exchange', success: false, error: e.message, data: null };
  }
};
