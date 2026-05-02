const express = require('express');
module.exports = function ({ requireAuth, fs, path, CONVERSATIONS_DIR, readJson }) { const router=express.Router();
router.get('/api/conversations', requireAuth, async (req,res)=>{ const files=(await fs.readdir(CONVERSATIONS_DIR).catch(()=>[])).filter((f)=>f.endsWith('.json')); const list=[]; for(const f of files){ const c=await readJson(path.join(CONVERSATIONS_DIR,f),{}); const um=(c.messages||[]).find((x)=>x.role==='user'); list.push({id:f.replace('.json',''),title:String(um?.content||'未命名对话').slice(0,20),updated_at:c.updated_at||''}); } list.sort((a,b)=>new Date(b.updated_at||0)-new Date(a.updated_at||0)); res.json(list);});
router.get('/api/conversations/:id', requireAuth, async (req,res)=>{ const p=path.join(CONVERSATIONS_DIR, `${req.params.id}.json`); try{ await fs.access(p); res.json(await readJson(p,{})); }catch{ res.status(404).json({error:'对话不存在'});} });
return router; };
