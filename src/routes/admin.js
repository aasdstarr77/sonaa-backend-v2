const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const Fanni = require('../models/Fanni');
const { auth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { normalizePhone } = require('../utils/phone');
const router = express.Router();
router.post('/login', validate(Joi.object({phone:Joi.string().required(), password:Joi.string().required()})), async (req,res,next)=>{
  try{
    const phone = normalizePhone(req.body.phone);
    const admin = await Fanni.findOne({phone, role:'admin'}).select('+passwordHash');
    if(!admin) return res.status(401).json({message:'not admin'});
    if(!await bcrypt.compare(req.body.password, admin.passwordHash)) return res.status(401).json({message:'wrong'});
    const token = jwt.sign({id:admin._id, role:'admin'}, process.env.JWT_SECRET, {expiresIn:'1d'});
    res.json({token});
  }catch(e){next(e);}
});
router.get('/fannis', auth('admin'), async (req,res,next)=>{
  try{ const list = await Fanni.find({role:'fanni'}).limit(50); res.json(list); }catch(e){next(e);}
});
module.exports = router;
