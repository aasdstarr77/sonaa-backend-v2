'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');

const Client = require('../models/Client');
const Order = require('../models/Order');
const { clientAuth } = require('../middleware/clientAuth');
const { normalizePhone } = require('../utils/phone');

const router = express.Router();

const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(50).required(),
  phone: Joi.string().trim().required(),
  password: Joi.string().min(8).max(128).required(),
  confirmPassword: Joi.string().valid(Joi.ref('password')).required()
}).unknown(false);

const loginSchema = Joi.object({
  phone: Joi.string().trim().required(),
  password: Joi.string().min(1).max(128).required()
}).unknown(false);

function issueToken(client) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET_MISSING');
  return jwt.sign(
    { id: String(client._id), role: 'client' },
    process.env.JWT_SECRET,
    { expiresIn: '7d', issuer: 'sonaa-backend-v2', audience: 'sonaa-client' }
  );
}

function safeOrder(order) {
  const data = typeof order.toObject === 'function' ? order.toObject() : { ...order };
  const acceptedOffer = Array.isArray(data.offers)
    ? data.offers.find(offer => String(offer._id) === String(data.acceptedOfferId))
    : null;

  return {
    _id: data._id,
    sn: data.sn,
    service: data.service,
    area: data.area,
    description: data.description || '',
    budget: data.budget || '',
    status: data.status,
    createdAt: data.createdAt,
    expiresAt: data.expiresAt,
    assignedFanniName: data.status === 'تم اختيار فني' ? (data.assignedFanniName || '') : '',
    assignedFanniPhone: data.status === 'تم اختيار فني' && acceptedOffer ? (acceptedOffer.fanniPhone || '') : '',
    acceptedOfferId: data.acceptedOfferId || null,
    acceptedOfferPrice: data.acceptedOfferPrice ?? null,
    offers: (Array.isArray(data.offers) ? data.offers : []).map(offer => ({
      _id: offer._id,
      fanniName: offer.fanniName || 'فني',
      fanniLevel: offer.fanniLevel || 'مبتدئ',
      fanniBadges: Array.isArray(offer.fanniBadges) ? offer.fanniBadges : [],
      price: offer.price,
      priceNum: offer.priceNum,
      message: offer.message || '',
      date: offer.date
    }))
  };
}

router.post('/register', async (req, res, next) => {
  try {
    const { error, value } = registerSchema.validate(req.body || {}, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        message: 'راجع بيانات التسجيل. الاسم ورقم الموبايل وكلمة السر وتأكيدها مطلوبة، وكلمة السر 8 أحرف على الأقل.',
        details: error.details.map(item => item.message)
      });
    }

    const phone = normalizePhone(value.phone);
    if (!phone) return res.status(400).json({ message: 'رقم الموبايل غير صحيح؛ اكتب رقمًا مصريًا يبدأ بـ 01 ويتكون من 11 رقمًا' });

    if (!process.env.JWT_SECRET) {
      return res.status(503).json({ message: 'التسجيل غير متاح بسبب إعدادات الخادم' });
    }

    const existing = await Client.findOne({ phone }).select('_id');
    if (existing) return res.status(409).json({ message: 'رقم الموبايل مسجل بالفعل. سجّل الدخول بدل إنشاء حساب جديد.' });

    const passwordHash = await bcrypt.hash(value.password, 12);
    const client = await Client.create({ name: value.name, phone, passwordHash });
    const token = issueToken(client);

    return res.status(201).json({
      message: 'تم إنشاء حسابك بنجاح',
      token,
      client: { id: String(client._id), name: client.name, phone: client.phone, status: client.status }
    });
  } catch (error) {
    if (error && error.code === 11000) return res.status(409).json({ message: 'رقم الموبايل مسجل بالفعل. سجّل الدخول.' });
    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { error, value } = loginSchema.validate(req.body || {}, { abortEarly: false });
    if (error) return res.status(400).json({ message: 'اكتب رقم الموبايل وكلمة السر بشكل صحيح' });
    if (!process.env.JWT_SECRET) return res.status(503).json({ message: 'تسجيل الدخول غير متاح بسبب إعدادات الخادم' });

    const phone = normalizePhone(value.phone);
    const client = phone ? await Client.findOne({ phone }).select('+passwordHash') : null;
    if (!client || !client.passwordHash || !(await bcrypt.compare(value.password, client.passwordHash))) {
      return res.status(401).json({ message: 'رقم الموبايل أو كلمة السر غير صحيحة' });
    }
    if (client.status !== 'نشط') return res.status(403).json({ message: 'حساب العميل موقوف مؤقتًا' });

    return res.json({
      message: 'تم تسجيل الدخول بنجاح',
      token: issueToken(client),
      client: { id: String(client._id), name: client.name, phone: client.phone, status: client.status }
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', clientAuth, (req, res) => {
  return res.json({
    client: { id: String(req.client._id), name: req.client.name, phone: req.client.phone, status: req.client.status }
  });
});

router.get('/orders', clientAuth, async (req, res, next) => {
  try {
    const orders = await Order.find({ clientAccount: req.clientId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return res.json({ orders: orders.map(safeOrder), count: orders.length });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
