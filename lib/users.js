const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { DATA_DIR, USERS_DIR, ensureDir, getUserDataPath } = require('./userData');
const USERS_PATH = path.join(DATA_DIR, 'users.json');
const INVITES_PATH = path.join(DATA_DIR, 'invites.json');
const APP_CONFIG_PATH = path.join(DATA_DIR, 'app_config.json');
const SETTINGS_EXAMPLE_PATH = path.join(path.join(__dirname, '..'), 'settings.example.json');
const readJson = async (p,d)=>{ try{return JSON.parse(await fs.readFile(p,'utf-8'));}catch{return d;} };
const writeJson = async (p,v)=>{ await ensureDir(path.dirname(p)); await fs.writeFile(p, JSON.stringify(v,null,2)+'\n'); };
async function initSystem(){
  if (process.env.NODE_ENV === 'production' && (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD)) {
    console.error('生产环境必须设置 ADMIN_USERNAME 和 ADMIN_PASSWORD 环境变量');
    process.exit(1);
  }
  await ensureDir(USERS_DIR);
  const usersData = await readJson(USERS_PATH,{users:[]});
  await writeJson(USERS_PATH, usersData.users?usersData:{users:[]});
  await writeJson(INVITES_PATH, await readJson(INVITES_PATH,{invites:[]}));
  if(!(await readJson(APP_CONFIG_PATH,{})).jwt_secret){ await writeJson(APP_CONFIG_PATH,{jwt_secret:crypto.randomBytes(16).toString('hex')}); }
  const users = (await readJson(USERS_PATH,{users:[]})).users;
  if(!users.length){
    const adminUsername = process.env.ADMIN_USERNAME || '999999';
    const adminPassword = process.env.ADMIN_PASSWORD || '999999111111';
    const admin = {id:'user_admin',username:adminUsername,password_hash:await bcrypt.hash(adminPassword,10),role:'admin',invite_quota:999999,invites_used:0,invited_by:null,created_at:new Date().toISOString(),last_login_at:'',is_active:true};
    await writeJson(USERS_PATH,{users:[admin]});
    const dir=getUserDataPath('user_admin'); await ensureDir(dir);
    try{ await fs.copyFile(SETTINGS_EXAMPLE_PATH,path.join(dir,'settings.json')); }catch{ await writeJson(path.join(dir,'settings.json'),{}); }
  }
}
const getUsers=()=>readJson(USERS_PATH,{users:[]}); const saveUsers=(d)=>writeJson(USERS_PATH,d);
const getInvites=()=>readJson(INVITES_PATH,{invites:[]}); const saveInvites=(d)=>writeJson(INVITES_PATH,d);
const getJwtSecret=async()=> (await readJson(APP_CONFIG_PATH,{})).jwt_secret;
const genUserId = () => `user_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`; const genInviteId = () => `inv_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
module.exports={initSystem,getUsers,saveUsers,getInvites,saveInvites,getJwtSecret,genUserId,genInviteId,USERS_PATH,INVITES_PATH};
