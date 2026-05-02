const express = require('express');
module.exports = function ({ fs, path, REPORTS_DIR, LATEST_DATA_PATH, readJson, getSafeSettings, runDailyJob, readSettings, fetchAllData, writeJson, CONVERSATIONS_DIR, dateStr, TIMEZONE, CONSTITUTION, readTasks, TASKS_PATH }) { const router=express.Router();
router.get('/api/latest-data', async (req,res)=>{ try{ const latest=await readJson(LATEST_DATA_PATH,{}); if(latest.settings) latest.settings=getSafeSettings(latest.settings); res.json(latest);}catch{res.json({empty:true});}});
router.get('/report', async (req,res)=>{ const files=(await fs.readdir(REPORTS_DIR).catch(()=>[])).filter((f)=>f.endsWith('.html')).sort(); if(!files.length) return res.send('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body>暂无报告，将在今日09:00自动生成</body></html>'); res.send(await fs.readFile(path.join(REPORTS_DIR,files.at(-1)),'utf-8'));});
router.get('/trigger', async (req,res)=>{ runDailyJob({ readSettings, fetchAllData, writeJson, latestDataPath: LATEST_DATA_PATH, conversationsDir: CONVERSATIONS_DIR, reportsDir: REPORTS_DIR, dateStr: () => dateStr(TIMEZONE), CONSTITUTION, readTasks: () => readTasks(TASKS_PATH, readJson) }).catch((e)=>console.log('手动触发失败：',e.message)); res.json({success:true,message:'报告生成中，请稍后访问 /report 查看'});});
router.get('/weekly', async (req,res)=>res.redirect('/report'));
return router; };
