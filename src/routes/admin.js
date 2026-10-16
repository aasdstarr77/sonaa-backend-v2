
'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const mongoose = require('mongoose');
const crypto = require('crypto');

const Fanni = require('../models/Fanni');
const TopupRequest = require('../models/TopupRequest');

const { auth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { normalizePhone } = require('../utils/phone');

const router = express.Router();

const ADMIN_TOKEN_EXPIRY = '1d';
const MAX_LIST_LIMIT = 500;

const loginSchema = Joi.object({
  phone: Joi.string().trim().optional(),
  email: Joi.string().trim().email().optional(),
  password: Joi.string().min(1).required()
}).or('phone', 'email');

const idSchema = Joi.string().custom((value, helpers) => {
  if (!mongoose.isValidObjectId(value)) {
    return helpers.error('any.invalid');
  }
  return value;
});

const amountSchema = Joi.number()
  .strict()
  .min(0)
  .max(100000000)
  .required();

const reasonSchema = Joi.string().trim().max(500).allow('');

function publicFanni(fanni) {
  const item = typeof fanni.toObject === 'function'
    ? fanni.toObject()
    : { ...fanni };

  delete item.passwordHash;
  delete item.__v;

  const statusMap = {
    'معتمد': 'approved',
    'قيد المراجعة': 'pending',
    'مرفوض': 'rejected',
    'معلق': 'disabled'
  };

  return {
    ...item,
    status: statusMap[item.status] || 'pending',
    actualStatus: item.status,
    isApproved: item.status === 'معتمد',
    isDisabled: item.status === 'معلق',
    balance: Number(item.walletBalance || 0),
    skill: Array.isArray(item.specialties)
      ? item.specialties.join('، ')
      : '',
    service: Array.isArray(item.specialties)
      ? item.specialties.join('، ')
      : ''
  };
}

function publicTopup(request) {
  const item = typeof request.toObject === 'function'
    ? request.toObject()
    : { ...request };

  const statusMap = {
    'قيد المراجعة': 'pending',
    'مقبول': 'approved',
    'مرفوض': 'rejected'
  };

  return {
    ...item,
    status: statusMap[item.status] || 'pending',
    actualStatus: item.status,
    fromPhone: item.senderNumber || '',
    phone: item.fanniPhone || '',
    walletNumber: process.env.VODAFONE_CASH_NUMBER || ''
  };
}

function adminName(req) {
  return String(req.user?.name || 'الإدارة').slice(0, 50);
}

function decision(req, action, reason = '') {
  return {
    action,
    reason: String(reason || '').trim().slice(0, 500),
    date: new Date(),
    by: adminName(req),
    byId: req.user?._id
  };
}

function validId(value) {
  return mongoose.isValidObjectId(value);
}

function sendBadId(res) {
  return res.status(400).json({ message: 'معرّف غير صالح' });
}

function getLoginPhone(body) {
  const raw = String(body.phone || body.email || '').trim();

  if (raw.includes('@')) {
    const configuredEmail = String(process.env.ADMIN_EMAIL || '')
      .trim()
      .toLowerCase();
    const configuredPhone = String(process.env.ADMIN_PHONE || '').trim();

    if (
      !configuredEmail ||
      !configuredPhone ||
      raw.toLowerCase() !== configuredEmail
    ) {
      return null;
    }

    return normalizePhone(configuredPhone);
  }

  return normalizePhone(raw);
}

/*
 * POST /api/admin/bootstrap
 *
 * إنشاء أول حساب إدارة فقط.
 * يتطلب ADMIN_SETUP_SECRET وبيانات الأدمن في إعدادات الخادم.
 * لا يسمح بإنشاء حساب إدارة جديد إذا كان حساب إدارة موجودًا.
 */
router.post('/bootstrap', async (req, res, next) => {
  try {
    const configuredSecret = String(
      process.env.ADMIN_SETUP_SECRET || ''
    );

    const suppliedSecret = typeof req.body?.secret === 'string'
      ? req.body.secret
      : '';

    if (
      configuredSecret.length < 32 ||
      suppliedSecret.length < 32
    ) {
      return res.status(503).json({
        message: 'إعداد إنشاء حساب الإدارة غير مكتمل'
      });
    }

    const expected = Buffer.from(configuredSecret, 'utf8');
    const supplied = Buffer.from(suppliedSecret, 'utf8');

    if (
      expected.length !== supplied.length ||
      !crypto.timingSafeEqual(expected, supplied)
    ) {
      return res.status(403).json({
        message: 'المفتاح السري غير صحيح'
      });
    }

    const adminCount = await Fanni.countDocuments({
      role: 'admin'
    });

    if (adminCount > 0) {
      return res.status(409).json({
        message: 'يوجد حساب إدارة بالفعل. تم إيقاف إنشاء الحساب الأول.'
      });
    }

    const email = String(process.env.ADMIN_EMAIL || '')
      .trim()
      .toLowerCase();

    const configuredPhone = String(process.env.ADMIN_PHONE || '').trim();
    const password = String(process.env.ADMIN_PASSWORD || '');
    const name = String(process.env.ADMIN_NAME || 'إدارة صناع').trim();

    if (
      !email ||
      !Joi.string().email().validate(email).value ||
      !configuredPhone ||
      password.length < 12 ||
      name.length < 2 ||
      name.length > 50
    ) {
      return res.status(503).json({
        message: 'راجع إعدادات ADMIN_EMAIL وADMIN_PHONE وADMIN_PASSWORD وADMIN_NAME على الخادم'
      });
    }

    const phone = normalizePhone(configuredPhone);

    if (!phone || !/^01[0-9]{9}$/.test(phone)) {
      return res.status(503).json({
        message: 'رقم الإدارة الموجود في إعدادات الخادم غير صالح'
      });
    }

    const existingPhone = await Fanni.findOne({ phone }).select('_id');

    if (existingPhone) {
      return res.status(409).json({
        message: 'رقم الإدارة مستخدم بالفعل في حساب موجود. لم يتم تغيير أي حساب.'
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(503).json({
        message: 'إعداد JWT_SECRET غير موجود على الخادم'
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const admin = await Fanni.create({
      name,
      phone,
      passwordHash,
      specialties: ['إدارة'],
      areas: ['الإدارة'],
      status: 'معتمد',
      role: 'admin',
      decisions: [{
        action: 'تسجيل',
        reason: 'إنشاء أول حساب إدارة',
        date: new Date(),
        by: 'النظام'
      }]
    });

    return res.status(201).json({
      message: 'تم إنشاء أول حساب إدارة بنجاح. احتفظ ببيانات الدخول في مكان آمن.',
      user: {
        id: String(admin._id),
        name: admin.name,
        phone: admin.phone,
        role: admin.role
      }
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({
        message: 'الحساب أو رقم الهاتف موجود بالفعل. لم يتم إنشاء حساب مكرر.'
      });
    }

    next(err);
  }
});

/*
 * POST /api/admin/login
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

      const phone = getLoginPhone(req.body);

      if (!phone) {
        return res.status(401).json({
          message: 'بيانات الدخول غير صحيحة'
        });
      }

      const admin = await Fanni.findOne({
        phone,
        role: 'admin'
      }).select('+passwordHash');

      if (
        !admin ||
        !admin.passwordHash ||
        !(await bcrypt.compare(req.body.password, admin.passwordHash))
      ) {
        return res.status(401).json({
          message: 'بيانات الدخول غير صحيحة'
        });
      }

      if (admin.status === 'معلق' || admin.status === 'مرفوض') {
        return res.status(403).json({
          message: 'حساب الإدارة غير مسموح له بالدخول'
        });
      }

      const token = jwt.sign(
        { id: admin._id, role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: ADMIN_TOKEN_EXPIRY }
      );

      return res.json({
        token,
        user: {
          id: String(admin._id),
          name: admin.name,
          phone: admin.phone,
          role: admin.role
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

/*
 * GET /api/admin/fannis
 */
router.get('/fannis', auth('admin'), async (req, res, next) => {
  try {
    const list = await Fanni.find({ role: 'fanni' })
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .limit(MAX_LIST_LIMIT)
      .lean();

    const fannis = list.map(publicFanni);

    return res.json({ fannis, data: fannis });
  } catch (err) {
    next(err);
  }
});

/*
 * قبول فني.
 */
router.post(
  '/fannis/:id/approve',
  auth('admin'),
  async (req, res, next) => {
    try {
      if (!validId(req.params.id)) return sendBadId(res);

      const fanni = await Fanni.findOne({
        _id: req.params.id,
        role: 'fanni'
      });

      if (!fanni) {
        return res.status(404).json({ message: 'الفني غير موجود' });
      }

      if (fanni.status === 'معلق') {
        return res.status(409).json({
          message: 'الفني معلق. أعد تفعيله أولاً قبل القبول'
        });
      }

      if (fanni.status === 'معتمد') {
        return res.json({
          message: 'الفني معتمد بالفعل',
          fanni: publicFanni(fanni)
        });
      }

      fanni.status = 'معتمد';
      fanni.rejectionReason = undefined;
      fanni.suspensionReason = undefined;
      fanni.suspendedAt = undefined;
      fanni.decisions.push(decision(req, 'موافقة'));

      await fanni.save();

      return res.json({
        message: 'تم اعتماد الفني بنجاح',
        fanni: publicFanni(fanni)
      });
    } catch (err) {
      next(err);
    }
  }
);

/*
 * رفض فني.
 */
router.post(
  '/fannis/:id/reject',
  auth('admin'),
  validate(Joi.object({
    reason: reasonSchema.optional()
  })),
  async (req, res, next) => {
    try {
      if (!validId(req.params.id)) return sendBadId(res);

      const fanni = await Fanni.findOne({
        _id: req.params.id,
        role: 'fanni'
      });

      if (!fanni) {
        return res.status(404).json({ message: 'الفني غير موجود' });
      }

      if (fanni.status === 'معلق') {
        return res.status(409).json({
          message: 'لا يمكن رفض حساب معلق. أعده للمراجعة أولاً'
        });
      }

      if (fanni.status === 'مرفوض') {
        return res.json({
          message: 'الفني مرفوض بالفعل',
          fanni: publicFanni(fanni)
        });
      }

      const reason = String(req.body.reason || '').trim();

      fanni.status = 'مرفوض';
      fanni.rejectionReason = reason || undefined;
      fanni.decisions.push(decision(req, 'رفض', reason));

      await fanni.save();

      return res.json({
        message: 'تم رفض الفني',
        fanni: publicFanni(fanni)
      });
    } catch (err) {
      next(err);
    }
  }
);

/*
 * تعليق حساب فني.
 */
router.post(
  '/fannis/:id/disable',
  auth('admin'),
  validate(Joi.object({
    reason: reasonSchema.optional()
  })),
  async (req, res, next) => {
    try {
      if (!validId(req.params.id)) return sendBadId(res);

      const fanni = await Fanni.findOne({
        _id: req.params.id,
        role: 'fanni'
      });

      if (!fanni) {
        return res.status(404).json({ message: 'الفني غير موجود' });
      }

      if (fanni.status === 'معلق') {
        return res.json({
          message: 'حساب الفني معلق بالفعل',
          fanni: publicFanni(fanni)
        });
      }

      const reason = String(req.body.reason || '').trim();

      fanni.status = 'معلق';
      fanni.suspensionReason = reason || undefined;
      fanni.suspendedAt = new Date();
      fanni.decisions.push(decision(req, 'تعليق', reason));

      await fanni.save();

      return res.json({
        message: 'تم تعليق حساب الفني',
        fanni: publicFanni(fanni)
      });
    } catch (err) {
      next(err);
    }
  }
);

/*
 * إعادة تفعيل حساب معلق.
 */
router.post(
  '/fannis/:id/enable',
  auth('admin'),
  async (req, res, next) => {
    try {
      if (!validId(req.params.id)) return sendBadId(res);

      const fanni = await Fanni.findOne({
        _id: req.params.id,
        role: 'fanni'
      });

      if (!fanni) {
        return res.status(404).json({ message: 'الفني غير موجود' });
      }

      if (fanni.status !== 'معلق') {
        return res.json({
          message: 'حساب الفني غير معلق',
          fanni: publicFanni(fanni)
        });
      }

      const previousDecision = [...(fanni.decisions || [])]
        .reverse()
        .find(item => !['تعليق', 'إعادة تفعيل'].includes(item.action));

      if (previousDecision?.action === 'موافقة') {
        fanni.status = 'معتمد';
      } else if (previousDecision?.action === 'رفض') {
        fanni.status = 'مرفوض';
      } else {
        fanni.status = 'قيد المراجعة';
      }

      fanni.suspensionReason = undefined;
      fanni.suspendedAt = undefined;
      fanni.decisions.push(decision(req, 'إعادة تفعيل'));

      await fanni.save();

      return res.json({
        message: 'تمت إعادة تفعيل الحساب',
        fanni: publicFanni(fanni)
      });
    } catch (err) {
      next(err);
    }
  }
);

/*
 * تعيين رصيد المحفظة.
 */
router.post(
  '/fannis/:id/set-balance',
  auth('admin'),
  validate(Joi.object({
    amount: amountSchema,
    reason: reasonSchema.optional()
  })),
  async (req, res, next) => {
    try {
      if (!validId(req.params.id)) return sendBadId(res);

      const fanni = await Fanni.findOne({
        _id: req.params.id,
        role: 'fanni'
      });

      if (!fanni) {
        return res.status(404).json({ message: 'الفني غير موجود' });
      }

      const amount = Number(req.body.amount);
      const previous = Number(fanni.walletBalance || 0);
      const reason = String(req.body.reason || '').trim();

      fanni.walletBalance = amount;
      fanni.decisions.push(
        decision(
          req,
          'تسوية إدارية',
          `تعيين الرصيد من ${previous} إلى ${amount}. ${reason}`.trim()
        )
      );

      await fanni.save();

      return res.json({
        message: 'تم تحديث رصيد المحفظة',
        balance: Number(fanni.walletBalance),
        fanni: publicFanni(fanni)
      });
    } catch (err) {
      next(err);
    }
  }
);

/*
 * إضافة مبلغ إلى رصيد المحفظة.
 */
router.post(
  '/fannis/:id/add-balance',
  auth('admin'),
  validate(Joi.object({
    amount: Joi.number()
      .strict()
      .positive()
      .max(100000000)
      .required(),
    reason: reasonSchema.optional()
  })),
  async (req, res, next) => {
    try {
      if (!validId(req.params.id)) return sendBadId(res);

      const amount = Number(req.body.amount);
      const reason = String(req.body.reason || '').trim();

      const fanni = await Fanni.findOneAndUpdate(
        { _id: req.params.id, role: 'fanni' },
        {
          $inc: { walletBalance: amount },
          $push: {
            decisions: decision(
              req,
              'تسوية إدارية',
              `إضافة ${amount} إلى المحفظة. ${reason}`.trim()
            )
          }
        },
        { new: true, runValidators: true }
      );

      if (!fanni) {
        return res.status(404).json({ message: 'الفني غير موجود' });
      }

      return res.json({
        message: 'تمت إضافة الرصيد',
        balance: Number(fanni.walletBalance),
        fanni: publicFanni(fanni)
      });
    } catch (err) {
      next(err);
    }
  }
);

/*
 * GET /api/admin/topup-requests
 */
router.get(
  '/topup-requests',
  auth('admin'),
  async (req, res, next) => {
    try {
      const list = await TopupRequest.find({})
        .sort({ createdAt: -1 })
        .limit(MAX_LIST_LIMIT)
        .lean();

      const requests = list.map(publicTopup);

      return res.json({ requests, data: requests });
    } catch (err) {
      next(err);
    }
  }
);

/*
 * قبول طلب الشحن.
 * يستخدم معاملة MongoDB لمنع تكرار إضافة الرصيد.
 */
router.post(
  '/topup-requests/:id/approve',
  auth('admin'),
  async (req, res, next) => {
    if (!validId(req.params.id)) return sendBadId(res);

    let session;

    try {
      session = await mongoose.startSession();

      let outcome = null;

      await session.withTransaction(async () => {
        const topup = await TopupRequest.findOneAndUpdate(
          {
            _id: req.params.id,
            status: 'قيد المراجعة',
            isCredited: false
          },
          {
            $set: {
              status: 'مقبول',
              isCredited: true,
              reviewedAt: new Date(),
              reviewedBy: adminName(req),
              reviewReason: ''
            }
          },
          { new: true, session }
        );

        if (!topup) {
          outcome = { kind: 'not-pending' };
          return;
        }

        const updatedFanni = await Fanni.findOneAndUpdate(
          { _id: topup.fanni, role: 'fanni' },
          {
            $inc: { walletBalance: topup.amount },
            $push: {
              decisions: decision(
                req,
                'تسوية إدارية',
                `شحن محفظة بمبلغ ${topup.amount} جنيه لطلب ${topup._id}`
              )
            }
          },
          { new: true, session, runValidators: true }
        );

        if (!updatedFanni) {
          throw new Error('TOPUP_FANNI_NOT_FOUND');
        }

        outcome = {
          kind: 'approved',
          topup,
          balance: Number(updatedFanni.walletBalance)
        };
      });

      if (outcome?.kind !== 'approved') {
        const current = await TopupRequest.findById(req.params.id).lean();

        if (!current) {
          return res.status(404).json({
            message: 'طلب الشحن غير موجود'
          });
        }

        return res.status(409).json({
          message: 'تمت معالجة طلب الشحن بالفعل أو أنه غير متاح للمراجعة',
          status: current.status,
          isCredited: Boolean(current.isCredited)
        });
      }

      return res.json({
        message: 'تم قبول طلب الشحن وإضافة الرصيد مرة واحدة',
        request: publicTopup(outcome.topup),
        balance: outcome.balance
      });
    } catch (err) {
      if (err.message === 'TOPUP_FANNI_NOT_FOUND') {
        return res.status(409).json({
          message: 'الفني المرتبط بطلب الشحن غير موجود. لم يتم اعتماد العملية'
        });
      }

      next(err);
    } finally {
      if (session) await session.endSession();
    }
  }
);

/*
 * رفض طلب الشحن دون إضافة رصيد.
 */
router.post(
  '/topup-requests/:id/reject',
  auth('admin'),
  validate(Joi.object({
    reason: reasonSchema.optional()
  })),
  async (req, res, next) => {
    try {
      if (!validId(req.params.id)) return sendBadId(res);

      const reason = String(req.body.reason || '').trim();

      const request = await TopupRequest.findOneAndUpdate(
        {
          _id: req.params.id,
          status: 'قيد المراجعة',
          isCredited: false
        },
        {
          $set: {
            status: 'مرفوض',
            isCredited: false,
            reviewedAt: new Date(),
            reviewedBy: adminName(req),
            reviewReason: reason
          }
        },
        { new: true, runValidators: true }
      );

      if (!request) {
        const current = await TopupRequest.findById(req.params.id).lean();

        if (!current) {
          return res.status(404).json({
            message: 'طلب الشحن غير موجود'
          });
        }

        return res.status(409).json({
          message: 'تمت معالجة طلب الشحن بالفعل أو أنه غير متاح للمراجعة',
          status: current.status
        });
      }

      return res.json({
        message: 'تم رفض طلب الشحن',
        request: publicTopup(request)
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
