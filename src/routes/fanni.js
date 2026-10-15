const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const Fanni = require('../models/Fanni');
const { auth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { normalizePhone } = require('../utils/phone');
const router = express.Router();
router.post('/register', validate(Joi.object({
  name: Joi.string().min(2).max(50).required(),
  phone: Joi.string().required(),
  password: Joi.string().min(6).required(),
  specialties: Joi.array().items(Joi.string()).min(1).required(),
  areas: Joi.array().items(Joi.string()).min(1).required(),
})), async (req,res,next)=>{
  try{
    const phone = normalizePhone(req.body.phone);
    if(!phone) return res.status(400).json({message:'invalid phone'});
    if(await Fanni.findOne({phone})) return res.status(409).json({message:'phone exists'});
    const hash = await bcrypt.hash(req.body.password,10);
    const f = await Fanni.create({name:req.body.name, phone, passwordHash:hash, specialties:req.body.specialties, areas:req.body.areas, status:'قيد المراجعة'});
    res.status(201).json({id:f._id});
  }catch(e){next(e);}
});
router.post('/login', validate(Joi.object({phone:Joi.string().required(), password:Joi.string().required()})), async (req,res,next)=>{
  try{
    const phone = normalizePhone(req.body.phone);
    const f = await Fanni.findOne({phone}).select('+passwordHash');
    if(!f) return res.status(401).json({message:'wrong credentials'});
    if(!await bcrypt.compare(req.body.password,f.passwordHash)) return res.status(401).json({message:'wrong credentials'});
    const token = jwt.sign({id:f._id, role:f.role}, process.env.JWT_SECRET, {expiresIn:'30d'});
    res.json({token, user:f.toSafeJSON()});
  }catch(e){next(e);}
});
router.get('/me', auth(), async (req,res)=>{ res.json(req.user.toSafeJSON()); });
module.exports = router;
