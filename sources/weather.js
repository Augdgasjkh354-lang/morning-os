const axios = require('axios');
module.exports = async function fetchWeather(settings) {
  try {
    const data = (await axios.get('https://api.openweathermap.org/data/2.5/weather', { params: { lat: settings.city_lat, lon: settings.city_lon, units: 'metric', lang: 'zh_cn', appid: settings.openweather_api_key } })).data;
    return { name: 'weather', success: true, data };
  } catch (e) {
    return { name: 'weather', success: false, error: e.message, data: null };
  }
};
