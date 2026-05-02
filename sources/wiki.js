const axios = require('axios');
module.exports = async function fetchWiki(settings) {
  try {
    const data = (await axios.get(`https://zh.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(settings.wiki_topic || '人工智能')}`)).data;
    return { name: 'wiki', success: true, data };
  } catch (e) {
    return { name: 'wiki', success: false, error: e.message, data: null };
  }
};
