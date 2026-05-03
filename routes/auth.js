const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getUsers, saveUsers, getInvites, saveInvites, getJwtSecret, genUserId } = require('../lib/users');
const { ensureDir, getUserDataPath } = require('../lib/userData');
const fs = require('fs').promises; const path = require('path');
module.exports=function(){const r=express.Router();
r.post('/api/auth/register', async(req,res)=>{const {username,password,invite_code}=req.body||{}; const i=await getInvites(); const inv=i.invites.find(x=>x.code===invite_code && !x.is_used); if(!inv) return res.status(400).json({error:'邀请码无效'}); if(!/^[A-Za-z0-9_]{3,20}$/.test(username||'')) return res.status(400).json({error:'用户名格式错误'}); if((password||'').length<8) return res.status(400).json({error:'密码长度至少8位'}); const u=await getUsers(); if(u.users.some(x=>x.username===username)) return res.status(400).json({error:'用户名已存在'}); const id=genUserId(); const role=inv.type; u.users.push({id,username,password_hash:await bcrypt.hash(password,10),role,invite_quota:role==='developer'?10:3,invites_used:0,invited_by:inv.created_by,created_at:new Date().toISOString(),last_login_at:'',is_active:true}); inv.is_used=true; inv.used_by=id; inv.used_at=new Date().toISOString(); await saveUsers(u); await saveInvites(i); const d=getUserDataPath(id); await ensureDir(d); await fs.copyFile(path.join(__dirname,'..','settings.example.json'),path.join(d,'settings.json')).catch(()=>{}); res.json({success:true,message:'注册成功，请登录'});});
r.post('/api/auth/login', async(req,res)=>{const {username,password}=req.body||{}; const u=await getUsers(); const user=u.users.find(x=>x.username===username && x.is_active); if(!user||!(await bcrypt.compare(password||'',user.password_hash))) return res.status(401).json({error:'用户名或密码错误'}); user.last_login_at=new Date().toISOString(); await saveUsers(u); const token=jwt.sign({userId:user.id,username:user.username,role:user.role},await getJwtSecret(),{expiresIn:'7d'}); res.json({success:true,token,user:{id:user.id,username:user.username,role:user.role}});});
r.post('/api/auth/logout', async(req,res)=>res.json({success:true}));
return r;}
