const express = require('express');
const Joi = require('joi');
const Order = require('../models/Order');
const { generateSN } = require('../utils/generateSN');
const { normalizePhone } = require('../utils/phone');
const router = express.Router();
router.post('/', async (req,res,next)=>{
  try{
    const phone = normalizePhone(req.body.clientPhone);
    if(!phone) return res.status(400).json({message:'invalid client phone'});
    const sn = generateSN();
    const order = await Order.create({...req.body, sn, clientPhone:phone, status:'قيد المراجعة'});
    res.status(201).json({sn:order.sn, id:order._id});
  }catch(e){next(e);}
});
router.get('/by-sn/:sn', async (req,res,next)=>{
  try{
    const o = await Order.findOne({sn:req.params.sn});
    if(!o) return res.status(404).json({message:'not found'});
    res.json(o);
  }catch(e){next(e);}
});
module.exports = router;
