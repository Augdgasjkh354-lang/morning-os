const router=require('express').Router(); const { requireAuth } = require('../middleware/auth'); const { getUserSettings } = require('../lib/userData'); const { verifyLogic } = require('../lib/logicVerifier');
router.post('/',requireAuth,async(req,res)=>{const items=(req.body&&req.body.items)||[]; res.json(await verifyLogic(items.slice(0,20), await getUserSettings(req.user.userId)));});
module.exports=router;
