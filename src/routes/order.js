'use strict';

const express = require('express');
const Joi = require('joi');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const Order = require('../models/Order');
const { auth } = require('../middleware/auth');
const { generateSN } = require('../utils/generateSN');
const { normalizePhone } = require('../utils/phone');

const router = express.Router();

// الطلب لا يصبح متاحًا للفنيين إلا بعد نشره من الإدارة.
const ACTIVE_STATUSES = ['تم النشر', 'وصلتك عروض'];
const ORDER_EXPIRY_HOURS = 48;

// مطابقة أرقام الموبايل المصرية، سواء محلية أو بمفتاح الدولة.
const EGYPT_PHONE_PATTERN =
  /(?:\+?20|0020)?[\s().-]*0?1[0125](?:[\s().-]*[0-9٠-٩]){8}/g;

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function toWesternDigits(value) {
  return String(value).replace(/[٠-٩]/g, digit =>
    String(ARABIC_DIGITS.indexOf(digit))
  );
}

// إخفاء الأرقام داخل النصوص المعادة فقط، دون تعديل البيانات المخزنة.
function sanitizeText(value) {
  if (typeof value !== 'string') return value;

  return toWesternDigits(value).replace(
    EGYPT_PHONE_PATTERN,
    '[رقم تواصل مخفي]'
  );
}

function sanitizeOffer(offer) {
  const safeOffer = typeof offer.toObject === 'function'
    ? offer.toObject()
    : { ...offer };

  // لا نعيد بيانات الاتصال أو المعرّفات الداخلية للفني للعميل.
  delete safeOffer.fanniPhone;
  delete safeOffer.phone;
  delete safeOffer.fanniId;
  delete safeOffer.fanni;

  if (typeof safeOffer.message === 'string') {
    safeOffer.message = sanitizeText(safeOffer.message);
  }

  return safeOffer;
}

function publicOrder(order) {
  const data = typeof order.toObject === 'function'
    ? order.toObject()
    : { ...order };

  // حماية بيانات العميل في الاستجابات العامة.
  delete data.clientPhone;
  delete data.phone;

  // لا نكشف المعرّف الداخلي للفني المعيّن.
  delete data.assignedFanni;

  if (typeof data.description === 'string') {
    data.description = sanitizeText(data.description);
  }

  if (typeof data.desc === 'string') {
    data.desc = sanitizeText(data.desc);
  }

  if (Array.isArray(data.offers)) {
    data.offers = data.offers.map(sanitizeOffer);
  }

  return data;
}

const createSchema = Joi.object({
  service: Joi.string().trim().min(2).max(100).required(),
  area: Joi.string().trim().min(2).max(250),
  address: Joi.string().trim().min(2).max(250),
  phone: Joi.string().trim().required(),
  clientPhone: Joi.string().trim(),
  clientName: Joi.string().trim().max(50).allow(''),
  description: Joi.string().trim().min(10).max(1000),
  desc: Joi.string().trim().min(10).max(1000).allow('')
}).unknown(false);

function validSN(sn) {
  return /^SN\d{6}$/i.test(String(sn || ''));
}

function clientTokenFrom(req) {
  const authHeader = req.headers.authorization || '';

  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  return String(req.body?.clientToken || req.query?.clientToken || '');
}

function verifyClientToken(req, order) {
  const token = clientTokenFrom(req);

  if (!token || !process.env.JWT_SECRET) return false;

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    return payload.purpose === 'client-order'
      && String(payload.orderId) === String(order._id)
      && String(payload.sn).toUpperCase() === String(order.sn).toUpperCase();
  } catch {
    return false;
  }
}

// إنشاء طلب جديد للعميل؛ يظل قيد المراجعة إلى أن تنشره الإدارة.
router.post('/', async (req, res, next) => {
  try {
    const body = {
      ...req.body,
      area: req.body.area || req.body.address,
      phone: req.body.clientPhone || req.body.phone,
      description: req.body.description || req.body.desc
    };

    const { error, value } = createSchema.validate(body, {
      abortEarly: false,
      stripUnknown: false
    });

    if (error) {
      return res.status(400).json({
        message: 'بيانات الطلب غير مكتملة أو غير صحيحة',
        details: error.details.map(item => item.message)
      });
    }

    const clientPhone = normalizePhone(value.phone);

    if (!clientPhone) {
      return res.status(400).json({
        message: 'رقم هاتف العميل غير صحيح'
      });
    }

    const area = value.area || value.address;

    if (!area) {
      return res.status(400).json({
        message: 'العنوان مطلوب'
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(503).json({
        message: 'إنشاء الطلب غير متاح بسبب إعدادات الخادم'
      });
    }

    let order = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        order = await Order.create({
          sn: generateSN(),
          service: value.service,
          area,
          clientName: value.clientName || 'عميل',
          clientPhone,
          description: value.description,
          status: 'قيد المراجعة'
        });

        break;
      } catch (err) {
        if (err.code !== 11000 || attempt === 2) throw err;
      }
    }

    if (!order) {
      return res.status(500).json({
        message: 'تعذر إنشاء الطلب'
      });
    }

    const clientToken = jwt.sign(
      {
        purpose: 'client-order',
        orderId: String(order._id),
        sn: order.sn
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    const safeOrder = publicOrder(order);

    return res.status(201).json({
      message: 'تم إنشاء الطلب بنجاح، وسيتم مراجعته من الإدارة',
      sn: order.sn,
      id: order._id,
      clientToken,
      order: safeOrder,
      data: safeOrder
    });
  } catch (err) {
    next(err);
  }
});

/*
 * نشر طلب من لوحة الإدارة.
 *
 * المسار:
 * POST /api/orders/admin/:sn/publish
 *
 * يتطلب توكن إدارة صالحًا.
 * لا يسمح بنشر طلب تم اختياره أو إنهاؤه أو نشره مسبقًا.
 */
router.post(
  '/admin/:sn/publish',
  auth('admin'),
  async (req, res, next) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          message: 'هذه العملية متاحة للإدارة فقط'
        });
      }

      const sn = String(req.params.sn || '').toUpperCase();

      if (!validSN(sn)) {
        return res.status(400).json({
          message: 'كود الطلب غير صحيح'
        });
      }

      // تحديث مشروط يمنع نشر الطلب مرتين بالتزامن.
      const order = await Order.findOneAndUpdate(
        {
          sn,
          status: 'قيد المراجعة'
        },
        {
          $set: {
            status: 'تم النشر',
            expiresAt: new Date(
              Date.now() + ORDER_EXPIRY_HOURS * 60 * 60 * 1000
            )
          }
        },
        {
          new: true,
          runValidators: true
        }
      );

      if (!order) {
        const existing = await Order.findOne({ sn }).select('status').lean();

        if (!existing) {
          return res.status(404).json({
            message: 'الطلب غير موجود'
          });
        }

        return res.status(409).json({
          message: 'الطلب ليس قيد المراجعة، لذلك لم يتم نشره',
          status: existing.status
        });
      }

      return res.json({
        message: 'تم نشر الطلب للفنيين المعتمدين بنجاح',
        order: publicOrder(order),
        data: publicOrder(order)
      });
    } catch (err) {
      next(err);
    }
  }
);

/*
 * الطلبات المتاحة للفني المعتمد.
 * الطلبات قيد المراجعة لا تظهر هنا.
 */
router.get('/available', auth(), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.status !== 'معتمد') {
      return res.status(403).json({
        message: 'حساب الفني لم يتم اعتماده بعد'
      });
    }

    const orders = await Order.find({
      status: { $in: ACTIVE_STATUSES },
      expiresAt: { $gt: new Date() }
    })
      .select('-clientPhone -phone')
      .sort({ createdAt: -1 })
      .lean();

    const safeOrders = orders.map(order => publicOrder(order));

    return res.json({
      orders: safeOrders,
      data: safeOrders
    });
  } catch (err) {
    next(err);
  }
});

// العروض التي أرسلها الفني الحالي.
router.get('/my-offers', auth(), async (req, res, next) => {
  try {
    const orders = await Order.find({
      'offers.fanni': req.userId
    })
      .select('sn status offers')
      .lean();

    const offers = [];

    for (const order of orders) {
      for (const offer of order.offers || []) {
        if (String(offer.fanni) === String(req.userId)) {
          offers.push({
            ...offer,
            message: sanitizeText(offer.message),
            orderSn: order.sn,
            orderStatus: order.status
          });
        }
      }
    }

    return res.json({
      offers,
      data: offers
    });
  } catch (err) {
    next(err);
  }
});

// إرسال عرض من فني معتمد على طلب منشور وغير منتهٍ.
router.post('/:sn/offer', auth(), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.status !== 'معتمد') {
      return res.status(403).json({
        message: 'حساب الفني لم يتم اعتماده بعد'
      });
    }

    const sn = String(req.params.sn || '').toUpperCase();

    if (!validSN(sn)) {
      return res.status(400).json({
        message: 'كود الطلب غير صحيح'
      });
    }

    const schema = Joi.object({
      price: Joi.number().positive().max(1000000).required(),
      message: Joi.string().trim().min(5).max(500).required()
    });

    const result = schema.validate(req.body, {
      abortEarly: false
    });

    if (result.error) {
      return res.status(400).json({
        message: 'السعر والرسالة مطلوبان بشكل صحيح'
      });
    }

    const order = await Order.findOne({ sn });

    if (!order) {
      return res.status(404).json({
        message: 'الطلب غير موجود'
      });
    }

    // لا تقبل عروض على طلب لم تنشره الإدارة.
    if (!ACTIVE_STATUSES.includes(order.status)) {
      return res.status(409).json({
        message: 'الطلب غير منشور أو لم يعد متاحًا للعروض'
      });
    }

    if (order.expiresAt && order.expiresAt <= new Date()) {
      return res.status(409).json({
        message: 'انتهت مدة استقبال العروض لهذا الطلب'
      });
    }

    const alreadySent = order.offers.some(
      offer => String(offer.fanni) === String(req.userId)
    );

    if (alreadySent) {
      return res.status(409).json({
        message: 'سبق أن أرسلت عرضًا لهذا الطلب'
      });
    }

    order.offers.push({
      fanni: req.userId,
      fanniId: String(req.userId),
      fanniName: req.user.name,
      fanniPhone: req.user.phone,
      price: String(result.value.price),
      priceNum: result.value.price,
      message: result.value.message
    });

    order.status = 'وصلتك عروض';

    await order.save();

    return res.status(201).json({
      message: 'تم إرسال العرض بنجاح',
      orderSn: order.sn,
      offers: order.offers.map(offer => {
        const safeOffer = typeof offer.toObject === 'function'
          ? offer.toObject()
          : { ...offer };

        delete safeOffer.fanniPhone;
        delete safeOffer.phone;

        return safeOffer;
      })
    });
  } catch (err) {
    next(err);
  }
});

// قبول عرض: يتطلب توكن العميل الصادر عند إنشاء الطلب.
router.post('/:sn/accept', async (req, res, next) => {
  try {
    const sn = String(req.params.sn || '').toUpperCase();
    const offerId = String(req.body.offerId || '');

    if (!validSN(sn) || !mongoose.isValidObjectId(offerId)) {
      return res.status(400).json({
        message: 'كود الطلب أو العرض غير صحيح'
      });
    }

    const order = await Order.findOne({ sn });

    if (!order) {
      return res.status(404).json({
        message: 'الطلب غير موجود'
      });
    }

    if (!verifyClientToken(req, order)) {
      return res.status(403).json({
        message: 'لازم تستخدم رابط أو جلسة العميل صاحب الطلب لقبول العرض'
      });
    }

    if (!ACTIVE_STATUSES.includes(order.status)) {
      return res.status(409).json({
        message: 'تم اختيار فني بالفعل أو لم يعد الطلب متاحًا'
      });
    }

    if (order.expiresAt && order.expiresAt <= new Date()) {
      return res.status(409).json({
        message: 'انتهت مدة استقبال العروض لهذا الطلب'
      });
    }

    const offer = order.offers.id(offerId);

    if (!offer) {
      return res.status(404).json({
        message: 'العرض غير موجود'
      });
    }

    // تحديث مشروط بالحالة الحالية لمنع قبول عرضين متزامنين.
    const updated = await Order.findOneAndUpdate(
      {
        _id: order._id,
        status: { $in: ACTIVE_STATUSES },
        expiresAt: { $gt: new Date() },
        'offers._id': offerId
      },
      {
        $set: {
          assignedFanni: offer.fanni,
          assignedFanniName: offer.fanniName,
          status: 'تم اختيار فني'
        }
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!updated) {
      return res.status(409).json({
        message: 'تم اختيار فني بالفعل أو انتهت صلاحية الطلب؛ حدّث حالة الطلب'
      });
    }

    return res.json({
      message: 'تم قبول العرض بنجاح',
      order: publicOrder(updated)
    });
  } catch (err) {
    next(err);
  }
});

// عرض آمن لتتبع الطلب.
async function trackOrder(req, res, next) {
  try {
    const sn = String(req.params.sn || '').toUpperCase();

    if (!validSN(sn)) {
      return res.status(400).json({
        message: 'كود الطلب غير صحيح'
      });
    }

    const order = await Order.findOne({ sn });

    if (!order) {
      return res.status(404).json({
        message: 'الطلب غير موجود'
      });
    }

    // التحقق من التوكن متاح للتوسعة مستقبلًا؛ الاستجابة العامة لا تكشف الهاتف.
    verifyClientToken(req, order);

    const safe = publicOrder(order);

    return res.json({
      order: safe,
      data: safe
    });
  } catch (err) {
    next(err);
  }
}

router.get('/by-sn/:sn', trackOrder);
router.get('/:sn', trackOrder);

module.exports = router;