'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const mongoose = require('mongoose');
const crypto = require('crypto');

const Fanni = require('../models/Fanni');
const TopupRequest = require('../models/TopupRequest');
const Order = require('../models/Order');
const Complaint = require('../models/Complaint');
const WalletTransaction = require('../models/WalletTransaction');

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

const amountSchema = Joi.number()
  .strict()
  .min(0)
  .max(100000000)
  .required();

const reasonSchema = Joi.string().trim().max(500).allow('');

const complaintStatusSchema = Joi.string().valid(
  'جديدة',
  'قيد المراجعة',
  'تم الحل',
  'مرفوضة'
);

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
 * إنشاء أول حساب إدارة فقط.
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

/* =========================================================
 * إدارة الشكاوى
 * جميع المسارات التالية تتطلب صلاحية الأدمن.
 * ========================================================= */

/*
 * GET /api/admin/complaints
 * عرض الشكاوى للأدمن، مع إمكانية التصفية بالحالة.
 */
router.get(
  '/complaints',
  auth('admin'),
  async (req, res, next) => {
    try {
      const filter = {};
      const status = String(req.query.status || '').trim();

      if (status) {
        const { error } = complaintStatusSchema.validate(status);

        if (error) {
          return res.status(400).json({
            message: 'حالة الشكوى المطلوبة غير صحيحة'
          });
        }

        filter.status = status;
      }

      const parsedLimit = Number.parseInt(req.query.limit, 10);
      const limit = Number.isInteger(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, MAX_LIST_LIMIT)
        : MAX_LIST_LIMIT;

      const complaints = await Complaint.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      return res.json({
        complaints,
        data: complaints,
        total: complaints.length
      });
    } catch (err) {
      next(err);
    }
  }
);

/*
 * GET /api/admin/complaints/:id
 * عرض شكوى واحدة للأدمن.
 */
router.get(
  '/complaints/:id',
  auth('admin'),
  async (req, res, next) => {
    try {
      if (!validId(req.params.id)) {
        return sendBadId(res);
      }

      const complaint = await Complaint.findById(req.params.id).lean();

      if (!complaint) {
        return res.status(404).json({
          message: 'الشكوى غير موجودة'
        });
      }

      return res.json({
        complaint,
        data: complaint
      });
    } catch (err) {
      next(err);
    }
  }
);

/*
 * PATCH /api/admin/complaints/:id
 * تحديث حالة الشكوى وملاحظات الإدارة وردها.
 */
router.patch(
  '/complaints/:id',
  auth('admin'),
  validate(Joi.object({
    status: complaintStatusSchema.optional(),
    adminNote: Joi.string().trim().max(1000).allow('').optional(),
    adminResponse: Joi.string().trim().max(1000).allow('').optional()
  }).min(1)),
  async (req, res, next) => {
    try {
      if (!validId(req.params.id)) {
        return sendBadId(res);
      }

      const updates = {};
      const hasStatus = Object.prototype.hasOwnProperty.call(
        req.body,
        'status'
      );

      if (hasStatus) {
        updates.status = req.body.status;
      }

      if (
        Object.prototype.hasOwnProperty.call(req.body, 'adminNote')
      ) {
        updates.adminNote = req.body.adminNote;
      }

      if (
        Object.prototype.hasOwnProperty.call(req.body, 'adminResponse')
      ) {
        updates.adminResponse = req.body.adminResponse;
      }

      if (hasStatus) {
        updates.reviewedAt = new Date();
        updates.reviewedBy = adminName(req);
      }

      updates.updatedAt = new Date();

      const complaint = await Complaint.findByIdAndUpdate(
        req.params.id,
        { $set: updates },
        {
          new: true,
          runValidators: true
        }
      ).lean();

      if (!complaint) {
        return res.status(404).json({
          message: 'الشكوى غير موجودة'
        });
      }

      return res.json({
        message: 'تم تحديث الشكوى بنجاح',
        complaint,
        data: complaint
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
 * تعيين رصيد المحفظة مع تسجيل فرق التسوية في دفتر الحركات.
 */
router.post(
  '/fannis/:id/set-balance',
  auth('admin'),
  validate(Joi.object({
    amount: amountSchema,
    reason: reasonSchema.optional()
  })),
  async (req, res, next) => {
    if (!validId(req.params.id)) return sendBadId(res);

    let session;
    try {
      session = await mongoose.startSession();
      let outcome = null;

      await session.withTransaction(async () => {
        const fanni = await Fanni.findOne({
          _id: req.params.id,
          role: 'fanni'
        }).session(session);

        if (!fanni) {
          outcome = null;
          return;
        }

        const amount = Number(req.body.amount);
        const previous = Number(fanni.walletBalance || 0);
        const reason = String(req.body.reason || '').trim();
        const difference = amount - previous;

        const updatedFanni = await Fanni.findOneAndUpdate(
          { _id: fanni._id, role: 'fanni' },
          {
            $set: { walletBalance: amount },
            $push: {
              decisions: decision(
                req,
                'تسوية إدارية',
                `تعيين الرصيد من ${previous} إلى ${amount}. ${reason}`.trim()
              )
            }
          },
          { new: true, session, runValidators: true }
        );

        if (!updatedFanni) {
          throw new Error('SETTLEMENT_FANNI_NOT_FOUND');
        }

        if (difference !== 0) {
          const transaction = new WalletTransaction({
            fanni: fanni._id,
            type: 'admin_adjustment',
            amount: difference,
            balanceBefore: previous,
            balanceAfter: amount,
            description: `تسوية إدارية: من ${previous} إلى ${amount}. ${reason}`.trim().slice(0, 500),
            idempotencyKey: `admin-set-balance:${String(fanni._id)}:${crypto.randomBytes(16).toString('hex')}`
          });

          await transaction.save({ session });
        }

        outcome = {
          fanni: updatedFanni,
          balance: Number(updatedFanni.walletBalance)
        };
      });

      if (!outcome) {
        return res.status(404).json({ message: 'الفني غير موجود' });
      }

      return res.json({
        message: 'تم تحديث رصيد المحفظة وتسجيل التسوية',
        balance: outcome.balance,
        fanni: publicFanni(outcome.fanni)
      });
    } catch (err) {
      next(err);
    } finally {
      if (session) await session.endSession();
    }
  }
);

/*
 * إضافة مبلغ إلى رصيد المحفظة مع تسجيل الحركة المالية.
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
    if (!validId(req.params.id)) return sendBadId(res);

    let session;
    try {
      session = await mongoose.startSession();
      let outcome = null;
      const amount = Number(req.body.amount);
      const reason = String(req.body.reason || '').trim();

      await session.withTransaction(async () => {
        const beforeFanni = await Fanni.findOne({
          _id: req.params.id,
          role: 'fanni'
        }).session(session);

        if (!beforeFanni) {
          outcome = null;
          return;
        }

        const balanceBefore = Number(beforeFanni.walletBalance || 0);
        const fanni = await Fanni.findOneAndUpdate(
          { _id: beforeFanni._id, role: 'fanni' },
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
          { new: true, session, runValidators: true }
        );

        if (!fanni) throw new Error('ADD_BALANCE_FANNI_NOT_FOUND');

        const transaction = new WalletTransaction({
          fanni: fanni._id,
          type: 'admin_adjustment',
          amount,
          balanceBefore,
          balanceAfter: Number(fanni.walletBalance),
          description: `إضافة إدارية بمبلغ ${amount}. ${reason}`.trim().slice(0, 500),
          idempotencyKey: `admin-add-balance:${String(fanni._id)}:${crypto.randomBytes(16).toString('hex')}`
        });

        await transaction.save({ session });
        outcome = {
          fanni,
          balance: Number(fanni.walletBalance)
        };
      });

      if (!outcome) {
        return res.status(404).json({ message: 'الفني غير موجود' });
      }

      return res.json({
        message: 'تمت إضافة الرصيد وتسجيل الحركة المالية',
        balance: outcome.balance,
        fanni: publicFanni(outcome.fanni)
      });
    } catch (err) {
      next(err);
    } finally {
      if (session) await session.endSession();
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

        const balanceAfter = Number(updatedFanni.walletBalance);
        const balanceBefore = balanceAfter - Number(topup.amount);

        const transaction = new WalletTransaction({
          fanni: updatedFanni._id,
          type: 'topup',
          amount: Number(topup.amount),
          balanceBefore,
          balanceAfter,
          description: `شحن محفظة بمبلغ ${topup.amount} جنيه لطلب ${topup._id}`,
          idempotencyKey: `topup:${String(topup._id)}`
        });

        await transaction.save({ session });

        outcome = {
          kind: 'approved',
          topup,
          balance: balanceAfter
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

/* =========================================================
 * عمليات الحذف الإدارية
 * كل المسارات التالية تتطلب صلاحية الأدمن.
 * ========================================================= */

/*
 * DELETE /api/admin/orders/:sn
 * حذف الطلب بعد تأكيد الأدمن، حتى لو كان مرتبطًا بفني أو بعملية مالية.
 * نعيد ملخص الارتباطات للتدقيق، ونحتفظ بسجلات الحركات المالية وطلبات الشحن.
 */
router.delete(
  '/orders/:sn',
  auth('admin'),
  async (req, res, next) => {
    try {
      const sn = String(req.params.sn || '').trim();

      if (!/^[A-Za-z0-9_-]{3,30}$/.test(sn)) {
        return res.status(400).json({
          message: 'رقم الطلب غير صالح'
        });
      }

      const order = await Order.findOne({ sn });

      if (!order) {
        return res.status(404).json({
          message: 'الطلب غير موجود'
        });
      }

      const hasCommissionTransaction = await WalletTransaction.exists({
        order: order._id,
        type: 'commission'
      });

      const hasAssignedFanni = Boolean(order.assignedFanni);
      const hasOffers = Array.isArray(order.offers) && order.offers.length > 0;
      const hasCommission =
        order.commissionCharged === true ||
        Boolean(hasCommissionTransaction);

      const protectedStatuses = [
        'تم اختيار فني',
        'تم الانتهاء'
      ];

      const hasProtectedStatus = protectedStatuses.includes(order.status);

      const summary = {
        status: String(order.status || ''),
        hasAssignedFanni,
        offersCount: Array.isArray(order.offers)
          ? order.offers.length
          : 0,
        commissionCharged: order.commissionCharged === true,
        hasCommissionTransaction: Boolean(hasCommissionTransaction),
        hasFinancialOrTechnicianLinks:
          hasAssignedFanni ||
          hasOffers ||
          hasCommission ||
          hasProtectedStatus
      };

      const deleted = await Order.deleteOne({ _id: order._id });

      if (deleted.deletedCount !== 1) {
        return res.status(409).json({
          message: 'لم يتم حذف الطلب. حدّث القائمة وحاول مرة أخرى.'
        });
      }

      return res.json({
        message: summary.hasFinancialOrTechnicianLinks
          ? 'تم حذف الطلب بعد التأكيد. احتُفظ بسجلات الحركات المالية وطلبات الشحن.'
          : 'تم حذف الطلب بنجاح.',
        deleted: 1,
        sn: order.sn,
        summary
      });
    } catch (err) {
      next(err);
    }
  }
);

/*
 * DELETE /api/admin/clients/:phone
 * حذف طلبات العميل المرتبطة برقم هاتفه.
 */
router.delete(
  '/clients/:phone',
  auth('admin'),
  async (req, res, next) => {
    try {
      const rawPhone = String(req.params.phone || '').trim();
      const phone = normalizePhone(rawPhone);

      if (!phone || !/^01[0-9]{9}$/.test(phone)) {
        return res.status(400).json({
          message: 'رقم هاتف العميل غير صالح. أدخل رقم موبايل مصري صحيحًا.'
        });
      }

      const orders = await Order.find({
        clientPhone: phone
      }).select(
        '_id sn status assignedFanni commissionCharged'
      ).lean();

      if (orders.length === 0) {
        return res.status(404).json({
          message: 'لا توجد طلبات مسجلة برقم الهاتف ده'
        });
      }

      const orderIds = orders.map(order => order._id);

      const hasCommissionTransaction = await WalletTransaction.exists({
        order: { $in: orderIds },
        type: 'commission'
      });

      const protectedStatuses = [
        'تم اختيار فني',
        'تم الانتهاء'
      ];

      const hasProtectedOrder = orders.some(order =>
        order.commissionCharged === true ||
        Boolean(order.assignedFanni) ||
        protectedStatuses.includes(order.status)
      );

      if (hasProtectedOrder || hasCommissionTransaction) {
        return res.status(409).json({
          message: 'لا يمكن حذف العميل لأن عنده طلبًا مرتبطًا بفني أو بعملية مالية. لم يتم حذف أي طلب.'
        });
      }

      const result = await Order.deleteMany({
        _id: { $in: orderIds },
        clientPhone: phone,
        commissionCharged: { $ne: true },
        assignedFanni: { $in: [null, undefined] },
        status: { $nin: protectedStatuses }
      });

      if (result.deletedCount !== orders.length) {
        return res.status(409).json({
          message: 'لم يتم حذف كل الطلبات المتوقعة؛ قد تكون بيانات تغيرت أثناء العملية. راجع الطلبات قبل إعادة المحاولة.',
          deleted: result.deletedCount
        });
      }

      return res.json({
        message: 'تم حذف طلبات العميل التجريبية بنجاح',
        deleted: result.deletedCount,
        phone
      });
    } catch (err) {
      next(err);
    }
  }
);

/*
 * DELETE /api/admin/fannis/:id
 * حذف الفني مع الاحتفاظ بسجلات الطلبات والشحنات والحركات المالية.
 */
router.delete(
  '/fannis/:id',
  auth('admin'),
  async (req, res, next) => {
    try {
      if (!validId(req.params.id)) {
        return sendBadId(res);
      }

      const fanni = await Fanni.findOne({
        _id: req.params.id,
        role: 'fanni'
      });

      if (!fanni) {
        return res.status(404).json({
          message: 'الفني غير موجود'
        });
      }

      const fanniId = fanni._id;

      const [
        topupCount,
        pendingTopupCount,
        transactionCount,
        relatedOrderCount,
        activeOrderCount
      ] = await Promise.all([
        TopupRequest.countDocuments({ fanni: fanniId }),

        TopupRequest.countDocuments({
          fanni: fanniId,
          status: 'قيد المراجعة'
        }),

        WalletTransaction.countDocuments({ fanni: fanniId }),

        Order.countDocuments({
          $or: [
            { assignedFanni: fanniId },
            { 'offers.fanni': fanniId }
          ]
        }),

        Order.countDocuments({
          status: {
            $in: [
              'قيد المراجعة',
              'تم النشر',
              'وصلتك عروض',
              'تم اختيار فني'
            ]
          },
          $or: [
            { assignedFanni: fanniId },
            { 'offers.fanni': fanniId }
          ]
        })
      ]);

      const summary = {
        balance: Number(fanni.walletBalance || 0),
        topupCount,
        pendingTopupCount,
        transactionCount,
        relatedOrderCount,
        activeOrderCount
      };

      const deleted = await Fanni.deleteOne({
        _id: fanniId,
        role: 'fanni'
      });

      if (deleted.deletedCount !== 1) {
        return res.status(409).json({
          message: 'لم يتم حذف حساب الفني. حدّث القائمة وحاول مرة أخرى.'
        });
      }

      return res.json({
        message: 'تم حذف حساب الفني. احتُفظ بسجلات الطلبات والشحنات والحركات المالية.',
        deleted: 1,
        fanniId: String(fanniId),
        summary
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;