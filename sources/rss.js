const Parser = require('rss-parser');
const parser = new Parser();
module.exports = async function fetchRss(settings) {
  try {
    const feeds = Array.isArray(settings.rss_feeds) ? settings.rss_feeds.filter(Boolean) : [];
    const data = [];
    for (const feedUrl of feeds) {
      const feed = await parser.parseURL(feedUrl);
      (feed.items || []).slice(0, 3).forEach((item) => data.push({ title: item.title || '', summary: item.contentSnippet || item.content || '', link: item.link || '', source: feed.title || feedUrl }));
    }
    return { name: 'rss', success: true, data };
  } catch (e) {
    return { name: 'rss', success: false, error: e.message, data: null };
  }
};
