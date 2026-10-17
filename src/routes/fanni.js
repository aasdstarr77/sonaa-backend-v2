'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const crypto = require('crypto');

const Fanni = require('../models/Fanni');
const TopupRequest = require('../models/TopupRequest');

const { auth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { normalizePhone } = require('../utils/phone');

const router = express.Router();

const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(50).required(),
  phone: Joi.string().trim().required(),
  password: Joi.string().min(6).max(128).required(),
  specialties: Joi.array()
    .items(Joi.string().trim().min(1).max(100))
    .min(1)
    .max(20)
    .required(),
  areas: Joi.array()
    .items(Joi.string().trim().min(2).max(60))
    .min(1)
    .max(30)
    .required()
});

const loginSchema = Joi.object({
  phone: Joi.string().trim().required(),
  password: Joi.string().required()
});

const topupSchema = Joi.object({
  fromPhone: Joi.string().trim().required(),
  phone: Joi.string().trim().optional(),
  amount: Joi.number().strict().integer().min(10).max(10000).required(),
  reference: Joi.string().trim().max(50).allow('').optional(),
  referenceCode: Joi.string().trim().max(50).allow('').optional(),
  method: Joi.string().valid('vodafone_cash').default('vodafone_cash'),
  note: Joi.string().max(200).allow('').optional()
});

/*
 * التحقق من أن الحساب تابع لفني، وليس حساب إدارة.
 */
function requireFanni(req, res, next) {
  if (!req.user || req.user.role !== 'fanni') {
    return res.status(403).json({
      message: 'هذه الخدمة متاحة لحسابات الفنيين فقط'
    });
  }

  next();
}

/*
 * منع استخدام خدمات المحفظة قبل اعتماد حساب الفني.
 */
function requireApprovedFanni(req, res, next) {
  if (req.user.status !== 'معتمد') {
    return res.status(403).json({
      message: 'حساب الفني قيد مراجعة الإدارة. ستتاح المحفظة بعد اعتماد الحساب',
      status: req.user.status
    });
  }

  next();
}

/*
 * POST /api/fanni/register
 */
router.post(
  '/register',
  validate(registerSchema),
  async (req, res, next) => {
    try {
      const phone = normalizePhone(req.body.phone);

      if (!phone || !/^01[0-9]{9}$/.test(phone)) {
        return res.status(400).json({
          message: 'رقم الهاتف غير صحيح'
        });
      }

      const existing = await Fanni.findOne({ phone }).select('_id');

      if (existing) {
        return res.status(409).json({
          message: 'رقم الهاتف مسجل بالفعل. جرّب تسجيل الدخول.'
        });
      }

      const passwordHash = await bcrypt.hash(req.body.password, 10);

      const fanni = await Fanni.create({
        name: req.body.name,
        phone,
        passwordHash,
        specialties: req.body.specialties,
        areas: req.body.areas,
        status: 'قيد المراجعة',
        role: 'fanni'
      });

      return res.status(201).json({
        message: 'تم إنشاء الحساب بنجاح. الحساب قيد مراجعة الإدارة.',
        id: String(fanni._id),
        status: fanni.status
      });
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(409).json({
          message: 'رقم الهاتف مسجل بالفعل. جرّب تسجيل الدخول.'
        });
      }

      next(err);
    }
  }
);

/*
 * POST /api/fanni/login
 *
 * يمكن للفني تسجيل الدخول أثناء المراجعة، لكن صلاحياته
 * تظل محدودة حتى اعتماد الحساب.
 */
router.post(
  '/login',
  validate(loginSchema),
  async (req, res, next) => {
    try {
      if (!process.env.JWT_SECRET) {
        return res.status(503).json({
          message: 'تسجيل الدخول غير متاح بسبب إعدادات الخادم'
        });
      }

      const phone = normalizePhone(req.body.phone);

      if (!phone) {
        return res.status(401).json({
          message: 'رقم الهاتف أو كلمة السر غير صحيحة'
        });
      }

      const fanni = await Fanni.findOne({
        phone,
        role: 'fanni'
      }).select('+passwordHash');

      if (
        !fanni ||
        !fanni.passwordHash ||
        !(await bcrypt.compare(req.body.password, fanni.passwordHash))
      ) {
        return res.status(401).json({
          message: 'رقم الهاتف أو كلمة السر غير صحيحة'
        });
      }

      if (fanni.status === 'معلق' || fanni.status === 'مرفوض') {
        return res.status(403).json({
          message: fanni.status === 'معلق'
            ? 'حساب الفني موقوف مؤقتًا. تواصل مع الإدارة.'
            : 'تم رفض طلب تسجيل الفني. تواصل مع الإدارة لمعرفة السبب.',
          status: fanni.status
        });
      }

      const token = jwt.sign(
        { id: fanni._id, role: 'fanni' },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      return res.json({
        token,
        user: fanni.toSafeJSON()
      });
    } catch (err) {
      next(err);
    }
  }
);

/*
 * GET /api/fanni/me
 */
router.get('/me', auth(), requireFanni, async (req, res) => {
  return res.json(req.user.toSafeJSON());
});

/*
 * POST /api/fanni/wallet/topup
 *
 * إنشاء طلب شحن للمراجعة فقط.
 * لا يتم تعديل رصيد الفني من هذا المسار.
 */
router.post(
  '/wallet/topup',
  auth(),
  requireFanni,
  requireApprovedFanni,
  validate(topupSchema),
  async (req, res, next) => {
    try {
      const senderNumber = normalizePhone(req.body.fromPhone);

      if (!senderNumber || !/^01[0-9]{9}$/.test(senderNumber)) {
        return res.status(400).json({
          message: 'رقم الهاتف المحول منه غير صحيح'
        });
      }

      const referenceNumber = String(
        req.body.reference || req.body.referenceCode || ''
      ).trim().slice(0, 50);

      const amount = Number(req.body.amount);

      /*
       * مفتاح فريد لكل طلب حتى لا تتكرر قيمة المفتاح
       * داخل قاعدة البيانات.
       */
      const idempotencyKey = crypto.randomUUID();

      const request = await TopupRequest.create({
        fanni: req.user._id,
        fanniName: req.user.name,
        fanniPhone: req.user.phone,
        amount,
        senderNumber,
        referenceNumber,
        status: 'قيد المراجعة',
        isCredited: false,
        idempotencyKey
      });

      return res.status(201).json({
        message: 'تم إرسال طلب الشحن بنجاح، وهو الآن قيد مراجعة الإدارة.',
        request: {
          id: String(request._id),
          amount: request.amount,
          senderNumber: request.senderNumber,
          referenceNumber: request.referenceNumber || '',
          status: request.status,
          createdAt: request.createdAt
        },
        balance: Number(req.user.walletBalance || 0),
        walletBalance: Number(req.user.walletBalance || 0)
      });
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(409).json({
          message: 'تعذر إنشاء طلب الشحن بسبب تكرار بيانات الطلب. حاول مرة أخرى.'
        });
      }

      next(err);
    }
  }
);

/*
 * GET /api/fanni/wallet/history
 *
 * يعرض طلبات الشحن الخاصة بالفني الحالي فقط.
 */
router.get(
  '/wallet/history',
  auth(),
  requireFanni,
  async (req, res, next) => {
    try {
      const requests = await TopupRequest.find({
        fanni: req.user._id
      })
        .select(
          'amount senderNumber referenceNumber status isCredited reviewReason reviewedAt createdAt updatedAt'
        )
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

      const safeRequests = requests.map(request => ({
        id: String(request._id),
        amount: request.amount,
        senderNumber: request.senderNumber,
        referenceNumber: request.referenceNumber || '',
        status: request.status,
        isCredited: Boolean(request.isCredited),
        reviewReason: request.reviewReason || '',
        reviewedAt: request.reviewedAt || null,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt
      }));

      const balance = Number(req.user.walletBalance || 0);

      return res.json({
        requests: safeRequests,
        data: safeRequests,
        history: safeRequests,
        balance,
        walletBalance: balance
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;