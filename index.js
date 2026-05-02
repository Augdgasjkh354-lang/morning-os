const express = require('express');
const cron = require('node-cron');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SETTINGS_PATH = path.join(__dirname, 'settings.json');
const REPORTS_DIR = path.join(__dirname, 'reports');
const TIMEZONE = 'Asia/Shanghai';

app.use(express.json());

async function ensureBaseFiles() {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  const gitkeepPath = path.join(REPORTS_DIR, '.gitkeep');
  try {
    await fs.access(gitkeepPath);
  } catch {
    await fs.writeFile(gitkeepPath, '');
  }
}

async function readSettings() {
  const content = await fs.readFile(SETTINGS_PATH, 'utf-8');
  return JSON.parse(content);
}

async function writeSettings(settings) {
  await fs.writeFile(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8');
}

function maskKey(value) {
  if (!value || typeof value !== 'string') return '';
  return `${value.slice(0, 4)}****`;
}

function getTodayDateInShanghai() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

async function fetchNews(settings) {
  try {
    const response = await axios.get('https://newsapi.org/v2/top-headlines', {
      params: {
        category: settings.news_category,
        language: 'en',
        pageSize: 10,
        apiKey: settings.news_api_key,
      },
      timeout: 15000,
    });
    const articles = response.data?.articles || [];
    return {
      success: true,
      data: articles.map((item) => ({
        title: item.title,
        description: item.description,
        source: item.source?.name,
        url: item.url,
      })),
    };
  } catch (error) {
    console.log('新闻数据获取失败：', error.message);
    return { success: false, error: '数据获取失败，请检查API Key' };
  }
}

async function fetchWeather(settings) {
  try {
    const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
      params: {
        lat: settings.city_lat,
        lon: settings.city_lon,
        units: 'metric',
        lang: 'zh_cn',
        appid: settings.openweather_api_key,
      },
      timeout: 15000,
    });
    return { success: true, data: response.data };
  } catch (error) {
    console.log('天气数据获取失败：', error.message);
    return { success: false, error: '数据获取失败，请检查API Key' };
  }
}

async function fetchExchangeRates(settings) {
  try {
    const response = await axios.get(
      `https://v6.exchangerate-api.com/v6/${settings.exchangerate_api_key}/latest/USD`,
      { timeout: 15000 },
    );
    const rates = response.data?.conversion_rates || {};
    return {
      success: true,
      data: {
        CNY: rates.CNY,
        EUR: rates.EUR,
        JPY: rates.JPY,
        HKD: rates.HKD,
        GBP: rates.GBP,
      },
    };
  } catch (error) {
    console.log('汇率数据获取失败：', error.message);
    return { success: false, error: '数据获取失败，请检查API Key' };
  }
}

async function fetchGoldSilver(settings) {
  const headers = { 'x-access-token': settings.gold_api_key };
  try {
    const [gold, silver] = await Promise.all([
      axios.get('https://www.goldapi.io/api/XAU/USD', { headers, timeout: 15000 }),
      axios.get('https://www.goldapi.io/api/XAG/USD', { headers, timeout: 15000 }),
    ]);
    return {
      success: true,
      data: {
        gold: gold.data,
        silver: silver.data,
      },
    };
  } catch (error) {
    console.log('贵金属数据获取失败：', error.message);
    return { success: false, error: '数据获取失败，请检查API Key' };
  }
}

async function fetchWiki(settings) {
  try {
    const topic = encodeURIComponent(settings.wiki_topic || '人工智能');
    const response = await axios.get(`https://zh.wikipedia.org/api/rest_v1/page/summary/${topic}`, {
      timeout: 15000,
    });
    return { success: true, data: response.data };
  } catch (error) {
    console.log('维基数据获取失败：', error.message);
    return { success: false, error: '数据获取失败，请检查API Key' };
  }
}

function buildInputText(data) {
  return [
    `城市：${data.settings.city_name}`,
    `报告风格：${data.settings.report_style}`,
    `天气数据：${JSON.stringify(data.weather)}`,
    `汇率数据：${JSON.stringify(data.exchangeRates)}`,
    `贵金属数据：${JSON.stringify(data.metals)}`,
    `新闻数据：${JSON.stringify(data.news)}`,
    `维基数据：${JSON.stringify(data.wiki)}`,
  ].join('\n\n');
}

async function generateHtmlReport(settings, payload) {
  try {
    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: settings.system_prompt },
          { role: 'user', content: buildInputText(payload) },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${settings.deepseek_api_key}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      },
    );
    const html = response.data?.choices?.[0]?.message?.content;
    if (!html) throw new Error('DeepSeek返回内容为空');
    return html;
  } catch (error) {
    console.log('DeepSeek生成报告失败：', error.message);
    return `<section style="font-family:Arial,sans-serif;padding:24px;color:#eee;background:#111;border-radius:12px;"><h1>今日晨报生成失败</h1><p>数据获取失败，请检查API Key</p></section>`;
  }
}

async function cleanupOldReports() {
  const entries = await fs.readdir(REPORTS_DIR);
  const htmlFiles = entries.filter((name) => /^\d{4}-\d{2}-\d{2}\.html$/.test(name)).sort();
  if (htmlFiles.length <= 30) return;
  const toDelete = htmlFiles.slice(0, htmlFiles.length - 30);
  await Promise.all(toDelete.map((file) => fs.unlink(path.join(REPORTS_DIR, file))));
  console.log(`已清理旧报告数量：${toDelete.length}`);
}

async function sendBarkNotification(token) {
  if (!token) {
    console.log('Bark Token为空，跳过推送');
    return;
  }
  try {
    await axios.get(`https://api.day.app/${token}/今日晨报已生成/点击查看完整报告`, { timeout: 10000 });
    console.log('Bark推送成功');
  } catch (error) {
    console.log('Bark推送失败：', error.message);
  }
}

async function runDailyJob() {
  console.log('开始执行晨报任务');
  const settings = await readSettings();
  const [news, weather, exchangeRates, metals, wiki] = await Promise.all([
    fetchNews(settings),
    fetchWeather(settings),
    fetchExchangeRates(settings),
    fetchGoldSilver(settings),
    fetchWiki(settings),
  ]);

  const payload = {
    settings,
    news,
    weather,
    exchangeRates,
    metals,
    wiki,
  };

  const reportHtmlFragment = await generateHtmlReport(settings, payload);
  const fullHtml = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>今日晨报</title><style>body{margin:0;padding:24px;background:#0b1020;color:#fff;}a{color:#7dcfff;}</style></head><body>${reportHtmlFragment}</body></html>`;

  const filename = `${getTodayDateInShanghai()}.html`;
  await fs.writeFile(path.join(REPORTS_DIR, filename), fullHtml, 'utf-8');
  console.log(`报告已保存：${filename}`);

  await cleanupOldReports();
  await sendBarkNotification(settings.bark_token);
  console.log('晨报任务执行结束');
}

async function getLatestReportFile() {
  const entries = await fs.readdir(REPORTS_DIR);
  const htmlFiles = entries.filter((name) => /^\d{4}-\d{2}-\d{2}\.html$/.test(name)).sort();
  if (!htmlFiles.length) return null;
  return htmlFiles[htmlFiles.length - 1];
}

app.get('/', (req, res) => {
  res.redirect('/report');
});

app.get('/report', async (req, res) => {
  try {
    const latestFile = await getLatestReportFile();
    if (!latestFile) {
      res.send('暂无报告，将在今日09:00自动生成');
      return;
    }
    const content = await fs.readFile(path.join(REPORTS_DIR, latestFile), 'utf-8');
    res.type('html').send(content);
  } catch (error) {
    console.log('读取报告失败：', error.message);
    res.status(500).send('读取报告失败');
  }
});

app.get('/trigger', async (req, res) => {
  runDailyJob().catch((error) => console.log('手动触发任务失败：', error.message));
  res.json({ success: true, message: '报告生成中，请稍后访问 /report 查看' });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/settings', async (req, res) => {
  try {
    const settings = await readSettings();
    const masked = {
      ...settings,
      deepseek_api_key: maskKey(settings.deepseek_api_key),
      news_api_key: maskKey(settings.news_api_key),
      openweather_api_key: maskKey(settings.openweather_api_key),
      exchangerate_api_key: maskKey(settings.exchangerate_api_key),
      gold_api_key: maskKey(settings.gold_api_key),
      bark_token: maskKey(settings.bark_token),
    };
    res.json(masked);
  } catch (error) {
    console.log('读取设置失败：', error.message);
    res.status(500).json({ success: false, message: '读取设置失败' });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const current = await readSettings();
    const incoming = req.body || {};
    const next = { ...current, ...incoming };
    await writeSettings(next);
    res.json({ success: true });
  } catch (error) {
    console.log('保存设置失败：', error.message);
    res.status(500).json({ success: false, message: '保存设置失败' });
  }
});

app.get('/api/search-city', async (req, res) => {
  const q = req.query.q;
  if (!q) {
    res.status(400).json({ success: false, message: '请提供城市名' });
    return;
  }

  try {
    const settings = await readSettings();
    const response = await axios.get('http://api.openweathermap.org/geo/1.0/direct', {
      params: {
        q,
        limit: 5,
        appid: settings.openweather_api_key,
      },
      timeout: 15000,
    });
    const cities = (response.data || []).map((item) => ({
      name: item.name,
      country: item.country,
      lat: item.lat,
      lon: item.lon,
    }));
    res.json({ success: true, cities });
  } catch (error) {
    console.log('城市搜索失败：', error.message);
    res.status(500).json({ success: false, message: '城市搜索失败，请检查API Key' });
  }
});

cron.schedule(
  '0 9 * * *',
  () => {
    runDailyJob().catch((error) => console.log('定时任务执行失败：', error.message));
  },
  { timezone: TIMEZONE },
);

ensureBaseFiles().then(() => {
  app.listen(PORT, () => {
    console.log(`服务已启动，端口：${PORT}`);
    console.log('定时任务已启动：每天09:00（Asia/Shanghai）执行');
  });
});
