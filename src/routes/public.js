const express = require('express');
const Settings = require('../models/Settings');
const router = express.Router();
router.get('/vodafone-cash', async (req,res)=>{
  const s = await Settings.findOne({key:'vodafone_cash_number'});
  res.json({number: s? s.value : process.env.VODAFONE_CASH_NUMBER});
});
router.get('/health', (req,res)=> res.json({ok:true, time:new Date().toISOString()}));
module.exports = router;
