const axios = require('axios');
module.exports = async function fetchNews(settings) {
  try {
    const a = (await axios.get('https://newsapi.org/v2/top-headlines', { params: { category: settings.news_category, language: 'en', pageSize: 10, apiKey: settings.news_api_key } })).data?.articles || [];
    return { name: 'news', success: true, data: a.map((i) => ({ title: i.title, description: i.description })) };
  } catch (e) {
    return { name: 'news', success: false, error: e.message, data: null };
  }
};
