'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const mongoose = require('mongoose');

const Client = require('../models/Client');
const Order = require('../models/Order');
const Rating = require('../models/Rating');
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

function safeOrder(order, clientRating = null, ratingsByFanni = new Map(), completedByFanni = new Map()) {
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
    offers: (() => {
      const seenTechnicians = new Set();
      const uniqueOffers = (Array.isArray(data.offers) ? data.offers : []).filter(offer => {
        const id = String(offer?.fanni?._id || offer?.fanni || offer?.fanniId || '').trim();
        if (!id) return true;
        if (seenTechnicians.has(id)) return false;
        seenTechnicians.add(id);
        return true;
      });
      return uniqueOffers.map(offer => {
        const id = String(offer.fanni?._id || offer.fanni || offer.fanniId || '');
        const rating = ratingsByFanni.get(id);
        return {
          _id: offer._id,
          fanniName: offer.fanniName || 'فني',
          fanniLevel: offer.fanniLevel || 'مبتدئ',
          fanniBadges: Array.isArray(offer.fanniBadges) ? offer.fanniBadges : [],
          price: offer.price,
          priceNum: offer.priceNum,
          message: offer.message || '',
          date: offer.date,
          fanniRatingAverage: rating ? Math.round(Number(rating.average || 0) * 100) / 100 : 0,
          fanniRatingCount: rating?.count || 0,
          fanniCompletedJobs: completedByFanni.get(id) || 0
        };
      });
    })(),
    priceChangeRequests: (Array.isArray(data.priceChangeRequests) ? data.priceChangeRequests : []).map(request => ({
      _id: String(request._id),
      oldPrice: request.oldPrice,
      newPrice: request.newPrice,
      reason: request.reason,
      status: request.status,
      requestedAt: request.requestedAt,
      decidedAt: request.decidedAt
    })),
    myRating: clientRating ? {
      reviewerRole: clientRating.reviewerRole,
      stars: clientRating.stars,
      comment: clientRating.comment || '',
      createdAt: clientRating.createdAt
    } : null,
    canRate: !clientRating
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

router.post('/orders/claim', clientAuth, async (req, res, next) => {
  try {
    const sn = String(req.body?.sn || '').trim().toUpperCase();
    const oldToken = String(req.body?.clientToken || '').trim();
    if (!/^SN\\d{6}$/.test(sn) || !oldToken) {
      return res.status(400).json({ message: 'اكتب رقم الطلب القديم بشكل صحيح من الجهاز الذي أنشأته منه' });
    }

    let payload;
    try {
      payload = jwt.verify(oldToken, process.env.JWT_SECRET);
    } catch {
      return res.status(403).json({ message: 'تعذر إثبات ملكية الطلب القديم من هذا الجهاز' });
    }
    if (payload.purpose !== 'client-order' || String(payload.sn || '').toUpperCase() !== sn) {
      return res.status(403).json({ message: 'بيانات ملكية الطلب القديم غير صحيحة' });
    }

    const order = await Order.findOne({ _id: payload.orderId, sn });
    if (!order) return res.status(404).json({ message: 'الطلب القديم غير موجود أو بياناته غير مطابقة' });
    if (normalizePhone(order.clientPhone) !== req.client.phone) {
      return res.status(403).json({ message: 'رقم الموبايل في الطلب القديم لا يطابق حسابك. تواصل مع الإدارة لربطه بأمان.' });
    }
    if (order.clientAccount && String(order.clientAccount) !== String(req.clientId)) {
      return res.status(409).json({ message: 'الطلب مرتبط بالفعل بحساب عميل آخر' });
    }
    if (String(order.clientAccount || '') === String(req.clientId)) {
      return res.json({ message: 'الطلب مرتبط بحسابك بالفعل', order: safeOrder(order) });
    }

    const linked = await Order.findOneAndUpdate(
      { _id: order._id, $or: [{ clientAccount: null }, { clientAccount: { $exists: false } }] },
      { $set: { clientAccount: req.clientId } },
      { new: true, runValidators: true }
    );
    if (!linked) return res.status(409).json({ message: 'تعذر ربط الطلب؛ قد يكون مرتبطًا بحساب آخر بالفعل' });

    return res.json({ message: 'تم ربط الطلب القديم بحسابك بنجاح', order: safeOrder(linked) });
  } catch (error) {
    return next(error);
  }
});

router.get('/orders', clientAuth, async (req, res, next) => {
  try {
    const orders = await Order.find({ clientAccount: req.clientId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    const ratings = orders.length
      ? await Rating.find({
          orderId: { $in: orders.map(order => order._id) },
          reviewerRole: 'client'
        }).select('orderId reviewerRole stars comment createdAt').lean()
      : [];
    const ratingsByOrderId = new Map(ratings.map(rating => [String(rating.orderId), rating]));
    const fanniIds = [...new Set(orders.flatMap(order => (order.offers || []).map(offer => String(offer.fanni || '')).filter(Boolean)))];
    const objectIds = fanniIds.filter(id => /^[a-f0-9]{24}$/i.test(id));
    const [fanniRatingStats, fanniCompletedStats] = objectIds.length ? await Promise.all([
      Rating.aggregate([
        { $match: { fanniId: { $in: objectIds.map(id => new mongoose.Types.ObjectId(id)) }, reviewerRole: 'client' } },
        { $group: { _id: '$fanniId', average: { $avg: '$stars' }, count: { $sum: 1 } } }
      ]),
      Order.aggregate([
        { $match: { assignedFanni: { $in: objectIds.map(id => new mongoose.Types.ObjectId(id)) }, status: 'تم الانتهاء' } },
        { $group: { _id: '$assignedFanni', count: { $sum: 1 } } }
      ])
    ]) : [[], []];
    const ratingsByFanni = new Map(fanniRatingStats.map(item => [String(item._id), item]));
    const completedByFanni = new Map(fanniCompletedStats.map(item => [String(item._id), item.count]));
    return res.set('Cache-Control', 'no-store').json({
      orders: orders.map(order => safeOrder(order, ratingsByOrderId.get(String(order._id)) || null, ratingsByFanni, completedByFanni)),
      count: orders.length
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
