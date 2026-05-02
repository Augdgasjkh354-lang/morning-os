const express = require('express');
const cron = require('node-cron');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const SETTINGS_PATH = path.join(ROOT, 'settings.json');
const MEMORY_PATH = path.join(ROOT, 'memory.json');
const LATEST_DATA_PATH = path.join(ROOT, 'latest-data.json');
const REPORTS_DIR = path.join(ROOT, 'reports');
const WEEKLY_DIR = path.join(REPORTS_DIR, 'weekly');
const MARKDOWN_DIR = path.join(REPORTS_DIR, 'markdown');
const CONVERSATIONS_DIR = path.join(ROOT, 'conversations');
const TIMEZONE = 'Asia/Shanghai';

app.use(express.json());
app.use(express.static(path.join(ROOT, 'public')));

const DEFAULT_SETTINGS = {
  weather_enabled: true, exchange_enabled: true, gold_enabled: true, news_enabled: true, wiki_enabled: true,
  weekly_report_enabled: true, markdown_export: true,
  weekly_prompt: '你是一位宏观分析师，请对过去一周的晨报内容做横向分析，提炼本周核心趋势、值得关注的变化和下周展望，语言简练，带有分析视角。'
};

async function ensureBaseFiles() {
  for (const dir of [REPORTS_DIR, WEEKLY_DIR, MARKDOWN_DIR, CONVERSATIONS_DIR]) {
    await fs.mkdir(dir, { recursive: true });
    const keep = path.join(dir, '.gitkeep');
    try { await fs.access(keep); } catch { await fs.writeFile(keep, ''); }
  }
  try { await fs.access(MEMORY_PATH); } catch { await fs.writeFile(MEMORY_PATH, JSON.stringify({ memories: [] }, null, 2)); }
  try { await fs.access(LATEST_DATA_PATH); } catch { await fs.writeFile(LATEST_DATA_PATH, JSON.stringify({}, null, 2)); }
}
const readJson = async (p, d={}) => { try { return JSON.parse(await fs.readFile(p, 'utf-8')); } catch { return d; } };
const writeJson = async (p, v) => fs.writeFile(p, `${JSON.stringify(v, null, 2)}\n`, 'utf-8');
const readSettings = async () => ({ ...DEFAULT_SETTINGS, ...(await readJson(SETTINGS_PATH, {})) });
const dateStr = (d = new Date()) => new Intl.DateTimeFormat('en-CA',{timeZone:TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);

async function safeFetch(enabled, fn, fallback) { if (!enabled) return { success: false, disabled: true, data: fallback }; try { return await fn(); } catch (e) { console.log('模块执行失败：', e.message); return { success:false, error:e.message, data:fallback }; } }

async function fetchAllData(settings) {
  const [weather, exchangeRates, metals, news, wiki] = await Promise.all([
    safeFetch(settings.weather_enabled, async()=>({success:true,data:(await axios.get('https://api.openweathermap.org/data/2.5/weather',{params:{lat:settings.city_lat,lon:settings.city_lon,units:'metric',lang:'zh_cn',appid:settings.openweather_api_key}})).data}), {}),
    safeFetch(settings.exchange_enabled, async()=>{const r=(await axios.get(`https://v6.exchangerate-api.com/v6/${settings.exchangerate_api_key}/latest/USD`)).data?.conversion_rates||{}; return {success:true,data:{CNY:r.CNY,EUR:r.EUR,JPY:r.JPY}};}, {}),
    safeFetch(settings.gold_enabled, async()=>{const h={'x-access-token':settings.gold_api_key}; const [g,s]=await Promise.all([axios.get('https://www.goldapi.io/api/XAU/USD',{headers:h}),axios.get('https://www.goldapi.io/api/XAG/USD',{headers:h})]); return {success:true,data:{gold:g.data,silver:s.data}};}, {}),
    safeFetch(settings.news_enabled, async()=>{const a=(await axios.get('https://newsapi.org/v2/top-headlines',{params:{category:settings.news_category,language:'en',pageSize:10,apiKey:settings.news_api_key}})).data?.articles||[]; return {success:true,data:a.map(i=>({title:i.title,description:i.description}))};}, []),
    safeFetch(settings.wiki_enabled, async()=>({success:true,data:(await axios.get(`https://zh.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(settings.wiki_topic||'人工智能')}`)).data}), {}),
  ]);
  return { updated_at:new Date().toISOString(), weather, exchangeRates, metals, news, wiki, settings: { ...settings, deepseek_api_key: undefined } };
}

async function callDeepSeek(settings, messages) {
  const r = await axios.post('https://api.deepseek.com/v1/chat/completions', { model: 'deepseek-chat', messages }, { headers: { Authorization: `Bearer ${settings.deepseek_api_key}` } });
  return r.data?.choices?.[0]?.message?.content || '';
}

async function runDailyJob() {
  console.log('开始执行晨报任务');
  const settings = await readSettings();
  const latestData = await fetchAllData(settings);
  await writeJson(LATEST_DATA_PATH, latestData);
  const content = await callDeepSeek(settings, [{ role: 'system', content: settings.system_prompt }, { role: 'user', content: JSON.stringify(latestData) }]).catch(()=>'<h1>今日晨报生成失败</h1>');
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body style="background:#0b1020;color:#fff;padding:24px">${content}</body></html>`;
  const f = `${dateStr()}.html`; await fs.writeFile(path.join(REPORTS_DIR, f), html, 'utf-8');
  if (settings.markdown_export) await fs.writeFile(path.join(MARKDOWN_DIR, `${dateStr()}.md`), content.replace(/<[^>]+>/g, ''), 'utf-8');
  if (settings.bark_token) axios.get(`https://api.day.app/${settings.bark_token}/今日晨报已生成/点击查看完整报告`).catch(()=>{});
  console.log('晨报任务执行结束');
}

app.get('/', (req,res)=>res.redirect('/index.html'));
app.get('/report', async (req,res)=>{ const files=(await fs.readdir(REPORTS_DIR)).filter(n=>/^\d{4}-\d{2}-\d{2}\.html$/.test(n)).sort(); if(!files.length) return res.send('暂无报告'); res.type('html').send(await fs.readFile(path.join(REPORTS_DIR, files.at(-1)),'utf-8')); });
app.get('/weekly', async (req,res)=>{ const files=(await fs.readdir(WEEKLY_DIR)).filter(n=>n.endsWith('.html')).sort(); if(!files.length) return res.send('暂无周报'); res.type('html').send(await fs.readFile(path.join(WEEKLY_DIR, files.at(-1)),'utf-8')); });
app.get('/trigger', async (req,res)=>{ runDailyJob().catch(e=>console.log('手动触发失败：',e.message)); res.json({success:true,message:'报告生成中，请稍后查看'}); });

app.get('/api/latest-data', async (req,res)=>res.json(await readJson(LATEST_DATA_PATH, {})));
app.get('/api/settings', async (req,res)=>res.json(await readSettings()));
app.post('/api/settings', async (req,res)=>{ await writeJson(SETTINGS_PATH, { ...(await readSettings()), ...(req.body||{}) }); res.json({success:true}); });
app.get('/api/search-city', async (req,res)=>{ const q=req.query.q; if(!q)return res.status(400).json({success:false,message:'请提供城市名'}); const s=await readSettings(); const d=(await axios.get('http://api.openweathermap.org/geo/1.0/direct',{params:{q,limit:5,appid:s.openweather_api_key}})).data||[]; res.json({success:true,cities:d.map(i=>({name:i.name,country:i.country,lat:i.lat,lon:i.lon}))}); });

app.get('/api/conversations', async (req,res)=>{ const files=(await fs.readdir(CONVERSATIONS_DIR)).filter(f=>f.endsWith('.json')); const list=[]; for(const f of files){const c=await readJson(path.join(CONVERSATIONS_DIR,f),{messages:[]}); const first=c.messages.find(m=>m.role==='user'); list.push({id:f.replace('.json',''),title:(first?.content||'新对话').slice(0,20),updated_at:c.updated_at||''});} res.json(list.sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)))); });
app.get('/api/conversations/:id', async (req,res)=>res.json(await readJson(path.join(CONVERSATIONS_DIR,`${req.params.id}.json`),{id:req.params.id,messages:[]})));
app.post('/api/chat', async (req,res)=>{ const { message, conversation_id }=req.body||{}; const id=conversation_id||randomUUID(); const cpath=path.join(CONVERSATIONS_DIR,`${id}.json`); const conv=await readJson(cpath,{id,messages:[]}); const mem=(await readJson(MEMORY_PATH,{memories:[]})).memories.sort((a,b)=>(b.importance||0)-(a.importance||0)).slice(0,10); conv.messages.push({role:'user',content:message,created_at:new Date().toISOString()}); const ai=await callDeepSeek(await readSettings(),[{role:'system',content:`请参考以下记忆：${JSON.stringify(mem)}`},...conv.messages.map(m=>({role:m.role,content:m.content}))]); conv.messages.push({role:'assistant',content:ai,created_at:new Date().toISOString()}); conv.messages=conv.messages.slice(-50); conv.updated_at=new Date().toISOString(); await writeJson(cpath,conv); res.json({conversation_id:id,reply:ai}); });
app.post('/api/chat/summarize', async (req,res)=>{ const {conversation_id}=req.body||{}; const conv=await readJson(path.join(CONVERSATIONS_DIR,`${conversation_id}.json`),{messages:[]}); const s=await readSettings(); const out=await callDeepSeek(s,[{role:'system',content:'提炼为记忆JSON：{"title":"","content":"","tags":[],"importance":1}，仅输出JSON'},{role:'user',content:JSON.stringify(conv.messages)}]); let item; try{ item=JSON.parse(out);}catch{ item={title:'对话摘要',content:out,tags:['对话'],importance:6}; } const memory=await readJson(MEMORY_PATH,{memories:[]}); memory.memories.push({id:randomUUID(),source:'对话',date:new Date().toISOString(),...item}); if(memory.memories.length>100)return res.status(400).json({success:false,message:'记忆库已超过100条，请先进行AI修剪'}); await writeJson(MEMORY_PATH,memory); res.json({success:true,memory:item}); });

app.get('/api/memory', async (req,res)=>res.json(await readJson(MEMORY_PATH,{memories:[]})));
app.post('/api/memory', async (req,res)=>{ const m=await readJson(MEMORY_PATH,{memories:[]}); if(m.memories.length>=100) return res.status(400).json({success:false,message:'记忆库已超过100条，请先进行AI修剪'}); m.memories.push({id:randomUUID(),date:new Date().toISOString(),...(req.body||{})}); await writeJson(MEMORY_PATH,m); res.json({success:true}); });
app.put('/api/memory/:id', async (req,res)=>{ const m=await readJson(MEMORY_PATH,{memories:[]}); m.memories=m.memories.map(i=>i.id===req.params.id?{...i,...req.body}:i); await writeJson(MEMORY_PATH,m); res.json({success:true}); });
app.delete('/api/memory/:id', async (req,res)=>{ const m=await readJson(MEMORY_PATH,{memories:[]}); m.memories=m.memories.filter(i=>i.id!==req.params.id); await writeJson(MEMORY_PATH,m); res.json({success:true}); });
app.post('/api/memory/prune', async (req,res)=>{ const m=await readJson(MEMORY_PATH,{memories:[]}); const s=await readSettings(); const out=await callDeepSeek(s,[{role:'system',content:'分析记忆并输出修剪建议JSON：{"suggestions":[{"id":"","action":"delete/merge","reason":"","merge_with":""}]}'},{role:'user',content:JSON.stringify(m.memories)}]); try{res.json(JSON.parse(out));}catch{res.json({suggestions:[]});} });
app.get('/api/memory/import-report', async (req,res)=>{ const files=(await fs.readdir(REPORTS_DIR)).filter(n=>/^\d{4}-\d{2}-\d{2}\.html$/.test(n)).sort(); if(!files.length)return res.status(404).json({success:false}); const html=await fs.readFile(path.join(REPORTS_DIR,files.at(-1)),'utf-8'); const m=await readJson(MEMORY_PATH,{memories:[]}); m.memories.push({id:randomUUID(),title:'最新报告摘要',content:html.replace(/<[^>]+>/g,'').slice(0,300),tags:['报告'],importance:7,source:'报告',date:new Date().toISOString()}); await writeJson(MEMORY_PATH,m); res.json({success:true}); });
app.get('/api/reports/markdown/:date', async (req,res)=>{ try{res.type('text/markdown').send(await fs.readFile(path.join(MARKDOWN_DIR,`${req.params.date}.md`),'utf-8'));}catch{res.status(404).send('未找到');} });

cron.schedule('0 9 * * 0', async ()=>{ const s=await readSettings(); if(!s.weekly_report_enabled)return; const files=(await fs.readdir(REPORTS_DIR)).filter(n=>/^\d{4}-\d{2}-\d{2}\.html$/.test(n)).sort().slice(-7); const text=(await Promise.all(files.map(f=>fs.readFile(path.join(REPORTS_DIR,f),'utf-8')))).join('\n'); const body=await callDeepSeek(s,[{role:'system',content:s.weekly_prompt},{role:'user',content:text}]).catch(()=>'<h1>周报生成失败</h1>'); const fname=`weekly-${dateStr()}.html`; await fs.writeFile(path.join(WEEKLY_DIR,fname),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body style="background:#0b1020;color:#fff;padding:24px">${body}</body></html>`,'utf-8'); if(s.bark_token) axios.get(`https://api.day.app/${s.bark_token}/本周周报已生成/请及时查看`).catch(()=>{}); console.log('周报任务执行完成'); },{timezone:TIMEZONE});
cron.schedule('0 9 * * *', ()=>runDailyJob().catch(e=>console.log('定时任务执行失败：',e.message)), {timezone:TIMEZONE});

ensureBaseFiles().then(()=>app.listen(PORT,()=>console.log(`服务已启动，端口：${PORT}`)));
