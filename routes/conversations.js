const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const { getUserConversationPath, ensureDir } = require('../lib/userData');
const router = express.Router(); router.use(requireAuth);
router.get('/', async (req,res)=>{ const dir=getUserConversationPath(req.user.userId); await ensureDir(dir); const files=(await fs.readdir(dir).catch(()=>[])).filter(f=>f.endsWith('.json')); const list=[]; for(const f of files){const c=JSON.parse(await fs.readFile(path.join(dir,f),'utf-8')); list.push({id:f.replace('.json',''),updated_at:c.updated_at||''});} res.json(list.sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at)));});
router.get('/:id', async(req,res)=>{ const p=path.join(getUserConversationPath(req.user.userId),`${req.params.id}.json`); try{res.json(JSON.parse(await fs.readFile(p,'utf-8')));}catch{res.status(404).json({error:'对话不存在'});} });
module.exports=router;
