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
const { notifyAdmins } = require('../utils/notifications');

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
    .required(),
  guidelinesAccepted: Joi.boolean().valid(true).required()
});

const profileUpdateSchema = Joi.object({
  phone: Joi.string().trim().required(),
  specialties: Joi.array()
    .items(Joi.string().trim().min(1).max(100))
    .max(20)
    .optional(),
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
  method: Joi.string().valid('vodafone_cash','orange_cash','etisalat_cash','we_cash').default('vodafone_cash'),
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
        areas: req.body.areas || [],
        technicianGuidelinesAcceptedAt: new Date(),
        technicianGuidelinesVersion: TECHNICIAN_GUIDELINES_VERSION,
        status: 'قيد المراجعة',
        role: 'fanni'
      });

      await notifyAdmins({ type: 'admin_new_technician', title: 'فني جديد يحتاج مراجعة', message: `سجّل فني جديد باسم ${fanni.name} ورقم ${fanni.phone}.`, link: '/admin?tab=fannis', dedupeKey: 'admin-new-technician:' + String(fanni._id) });
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
const TECHNICIAN_GUIDELINES_VERSION = '2026-10-20-v1';
router.post('/guidelines/accept', auth(), requireFanni, requireApprovedFanni, async (req, res, next) => {
  try {
    if (req.body?.accepted !== true || req.body?.version !== TECHNICIAN_GUIDELINES_VERSION) return res.status(400).json({ message: 'اقرأ التعليمات وحدد الموافقة لتأكيد الالتزام بها.' });
    const fanni = await Fanni.findOneAndUpdate({ _id: req.userId, role: 'fanni', status: 'معتمد' }, { $set: { technicianGuidelinesAcceptedAt: new Date(), technicianGuidelinesVersion: TECHNICIAN_GUIDELINES_VERSION } }, { new: true, runValidators: true });
    if (!fanni) return res.status(403).json({ message: 'حساب الفني غير معتمد.' });
    return res.json({ message: 'تم تسجيل موافقتك على ميثاق صُنّاع.', acceptedAt: fanni.technicianGuidelinesAcceptedAt, version: fanni.technicianGuidelinesVersion });
  } catch (err) { next(err); }
});

router.get('/me', auth(), requireFanni, async (req, res) => {
  return res.json(req.user.toSafeJSON());
});

router.patch('/me', auth(), requireFanni, validate(profileUpdateSchema), async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body.phone);
    if (!phone || !/^01[0-9]{9}$/.test(phone)) return res.status(400).json({ message: 'رقم الهاتف غير صحيح' });
    if (req.user.pendingProfileChange?.requestedAt) return res.status(409).json({ message: 'لديك طلب تعديل بيانات قيد مراجعة الإدارة. انتظر القرار قبل إرسال طلب جديد.' });
    const duplicate = await Fanni.findOne({ phone, _id: { $ne: req.user._id } }).select('_id');
    if (duplicate) return res.status(409).json({ message: 'رقم الهاتف مسجل بالفعل في حساب آخر' });
    const requestedSpecialties = Array.isArray(req.body.specialties) ? req.body.specialties : [];
    const normalizedSpecialties = [...new Set(requestedSpecialties.map(value => String(value).trim()).filter(Boolean))];
    // التخصصات اختيارية عند تعديل الملف؛ إذا لم يحدد الفني تخصصات جديدة، احتفظ بالتخصصات الحالية.
    const specialties = normalizedSpecialties.length ? normalizedSpecialties : [...(req.user.specialties || [])];
    const areas = [...new Set(req.body.areas.map(value => String(value).trim()).filter(value => value.length >= 2))];
    if (!areas.length) return res.status(400).json({ message: 'اكتب منطقة عمل واحدة على الأقل' });
    req.user.pendingProfileChange = { phone, specialties, areas, requestedAt: new Date() };
    req.user.decisions.push({ action: 'طلب تعديل بيانات', reason: 'طلب الفني تغيير بيانات حسابه', date: new Date(), by: String(req.user.name || 'الفني'), byId: req.user._id, meta: { phone, specialties, areas } });
    await req.user.save();
    return res.set('Cache-Control', 'no-store').json({ message: 'تم إرسال طلب تعديل بياناتك للإدارة. بيانات حسابك الحالية ستظل كما هي لحين الموافقة.', user: req.user.toSafeJSON(), pendingProfileChange: req.user.pendingProfileChange });
  } catch (err) {
    if (err && err.code === 11000) return res.status(409).json({ message: 'رقم الهاتف مسجل بالفعل في حساب آخر' });
    next(err);
  }
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
        method: req.body.method || 'vodafone_cash',
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
          method: request.method || 'vodafone_cash',
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
          'amount senderNumber method referenceNumber status isCredited reviewReason reviewedAt createdAt updatedAt'
        )
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

      const safeRequests = requests.map(request => ({
        id: String(request._id),
        amount: request.amount,
        senderNumber: request.senderNumber,
        method: request.method || 'vodafone_cash',
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