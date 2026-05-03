const router=require('express').Router(); const {requireAuth}=require('../middleware/auth'); const { readUserData, getUserSettings } = require('../lib/userData'); const { generatePortrait } = require('../lib/portraitManager');
router.get('/',requireAuth,async(req,res)=>{const d=await readUserData(req.user.userId,'portrait.json'); if(!d || Object.keys(d).length===0) return res.json({empty:true}); res.json(d);});
router.post('/generate',requireAuth,async(req,res)=>{const s=await getUserSettings(req.user.userId); res.json(await generatePortrait(req.user.userId,s));});
module.exports=router;
