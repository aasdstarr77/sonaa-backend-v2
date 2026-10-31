'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const PageVisit = require('../models/PageVisit');

const router = express.Router();
const pageVisitLimiter = rateLimit({
  windowMs: 60000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/', pageVisitLimiter, async (req,res)=>{try{const pageKey=String(req.body?.pageKey||'').trim().slice(0,80),pageName=String(req.body?.pageName||'').trim().slice(0,160),rawPath=String(req.body?.path||'/').split('?')[0].slice(0,300),referrer=String(req.body?.referrer||'').slice(0,300),visitorId=String(req.body?.visitorId||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80);if(!TRACKABLE_PAGES.has(pageKey)||!pageName)return res.status(400).json({message:'بيانات الزيارة غير صالحة'});await PageVisit.create({pageKey,pageName,path:rawPath.startsWith('/')?rawPath:'/',referrer,visitorId});return res.status(202).json({ok:true});}catch(err){return res.status(202).json({ok:false});}});

module.exports = router;
