const express = require('express');
const { randomUUID } = require('crypto');
module.exports = function createTasksRoutes({ requireAuth, readTasks, TASKS_PATH, readJson, writeTasksLatest, writeJson, findAndRemoveTask, getDateRangeInTimezone, TIMEZONE, readSettings, extractFromConversation, extractFromText, CONVERSATIONS_DIR, path }) {
 const router = express.Router();
 router.get('/api/tasks', requireAuth, async (req, res) => res.json(await readTasks(TASKS_PATH, readJson)));
 router.get('/api/tasks/today', requireAuth, async (req,res)=>{ const data=await readTasks(TASKS_PATH, readJson); const {start,end}=getDateRangeInTimezone(TIMEZONE); const task=data.tasks.find((x)=>x.source_type==='daily_prompt'&&x.due_at&&new Date(x.due_at)>=start&&new Date(x.due_at)<=end)||null; res.json({task}); });
 router.post('/api/tasks', requireAuth, async (req,res)=>{const body=req.body||{}; if(!body.title) return res.status(400).json({error:'缺少title'}); const now=new Date().toISOString(); const task={id:`task_${randomUUID().slice(0,8)}`,title:body.title,description:body.description||'',status:'todo',priority:body.priority||3,due_at:body.due_at||null,source_type:body.source_type||'manual',source_conversation_id:null,source_message_ids:[],source_report_date:null,related_memory_ids:[],tags:body.tags||[],confidence:1,needs_review:false,checklist:body.checklist||[],created_at:now,updated_at:now}; await writeTasksLatest(TASKS_PATH, readJson, writeJson, async(t)=>{t.tasks.push(task);return t;}); res.json({success:true,task});});
 return router;
};
