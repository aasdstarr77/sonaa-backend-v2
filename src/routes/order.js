
'use strict';

const express = require('express');
const Joi = require('joi');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const Order = require('../models/Order');
const Fanni = require('../models/Fanni');
const WalletTransaction = require('../models/WalletTransaction');
const { auth } = require('../middleware/auth');
const { generateSN } = require('../utils/generateSN');
const { normalizePhone } = require('../utils/phone');

const router = express.Router();

const ACTIVE_STATUSES = ['تم النشر', 'وصلتك عروض'];
const ORDER_EXPIRY_HOURS = 48;
const COMMISSION_RATE = 10;

const EGYPT_PHONE_PATTERN =
  /(?:\+?20|0020)?[\s().-]*0?1[0125](?:[\s().-]*[0-9٠-٩]){8}/g;

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function toWesternDigits(value) {
  return String(value).replace(/[٠-٩]/g, digit =>
    String(ARABIC_DIGITS.indexOf(digit))
  );
}

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

  delete safeOffer.fanniPhone;
  delete safeOffer.phone;
  delete safeOffer.fanniId;
  delete safeOffer.fanni;

  if (typeof safeOffer.message === 'string') {
    safeOffer.message = sanitizeText(safeOffer.message);
  }

  return safeOffer;
}

/*
 * بيانات الاتصال لا تظهر في الاستجابة العامة.
 * assignedFanniPhone لا يظهر إلا لصاحب الطلب بعد قبول العرض.
 */
function publicOrder(order, options = {}) {
  const {
    includeAddress = true,
    includeAssignedFanniPhone = false
  } = options;

  const data = typeof order.toObject === 'function'
    ? order.toObject()
    : { ...order };

  if (!includeAddress) {
    delete data.address;
  }

  delete data.clientPhone;
  delete data.phone;
  delete data.assignedFanni;
  delete data.assignedFanniPhone;

  if (
    includeAssignedFanniPhone
    && data.status === 'تم اختيار فني'
    && data.assignedFanni
  ) {
    const acceptedOffer = Array.isArray(data.offers)
      ? data.offers.find(offer =>
          String(offer._id) === String(data.acceptedOfferId)
          || (
            !data.acceptedOfferId
            && String(offer.fanni) === String(data.assignedFanni)
          )
        )
      : null;

    if (acceptedOffer && acceptedOffer.fanniPhone) {
      data.assignedFanniPhone = acceptedOffer.fanniPhone;
    }
  }

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
  area: Joi.string().trim().min(2).max(250).required(),
  address: Joi.string().trim().min(2).max(250).allow('').optional(),
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

  return String(
    req.body?.clientToken || req.query?.clientToken || ''
  );
}

function verifyClientToken(req, order) {
  const token = clientTokenFrom(req);

  if (!token || !process.env.JWT_SECRET) {
    return false;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    return payload.purpose === 'client-order'
      && String(payload.orderId) === String(order._id)
      && String(payload.sn).toUpperCase()
        === String(order.sn).toUpperCase();
  } catch {
    return false;
  }
}

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function getAcceptedOffer(order, offerId) {
  return order.offers.id(offerId);
}

// إنشاء طلب جديد للعميل.
router.post('/', async (req, res, next) => {
  try {
    const body = {
      ...req.body,
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

    const area = String(value.area || '').trim();
    const address = String(value.address || '').trim();

    if (area.length < 2) {
      return res.status(400).json({
        message: 'المنطقة أو الحي مطلوب'
      });
    }

    if (address.length < 2) {
      return res.status(400).json({
        message: 'العنوان التفصيلي مطلوب'
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
          address,
          clientName: value.clientName || 'عميل',
          clientPhone,
          description: value.description,
          status: 'قيد المراجعة'
        });

        break;
      } catch (err) {
        if (err.code !== 11000 || attempt === 2) {
          throw err;
        }
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
 * POST /api/orders/admin/:sn/publish
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
        const existing = await Order.findOne({ sn })
          .select('status')
          .lean();

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
 * الطلبات المتاحة للفنيين المعتمدين.
 * لا يظهر العنوان التفصيلي أو رقم العميل هنا.
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

    const safeOrders = orders.map(order => publicOrder(order, {
      includeAddress: false
    }));

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
            ...sanitizeOffer(offer),
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

/*
 * قبول عرض وخصم عمولة المنصة.
 * الخصم وتحديث الطلب وتسجيل الحركة المالية داخل معاملة MongoDB واحدة.
 */
router.post('/:sn/accept', async (req, res, next) => {
  const session = await mongoose.startSession();
  let responsePayload = null;
  let responseStatus = 200;

  try {
    const sn = String(req.params.sn || '').toUpperCase();
    const offerId = String(req.body.offerId || '');

    if (!validSN(sn) || !mongoose.isValidObjectId(offerId)) {
      return res.status(400).json({
        message: 'كود الطلب أو العرض غير صحيح'
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(503).json({
        message: 'الخدمة غير متاحة بسبب إعدادات الخادم'
      });
    }

    await session.startTransaction();

    const order = await Order.findOne({ sn }).session(session);

    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({
        message: 'الطلب غير موجود'
      });
    }

    if (!verifyClientToken(req, order)) {
      await session.abortTransaction();
      return res.status(403).json({
        message: 'لازم تستخدم رابط أو جلسة العميل صاحب الطلب لقبول العرض'
      });
    }

    if (!ACTIVE_STATUSES.includes(order.status)) {
      await session.abortTransaction();
      return res.status(409).json({
        message: 'تم اختيار فني بالفعل أو لم يعد الطلب متاحًا'
      });
    }

    if (order.expiresAt && order.expiresAt <= new Date()) {
      await session.abortTransaction();
      return res.status(409).json({
        message: 'انتهت مدة استقبال العروض لهذا الطلب'
      });
    }

    if (order.commissionCharged === true) {
      await session.abortTransaction();
      return res.status(409).json({
        message: 'تم تسجيل عمولة هذا الطلب بالفعل'
      });
    }

    const offer = getAcceptedOffer(order, offerId);

    if (!offer) {
      await session.abortTransaction();
      return res.status(404).json({
        message: 'العرض غير موجود'
      });
    }

    const price = Number(offer.priceNum);

    if (!Number.isFinite(price) || price <= 0) {
      await session.abortTransaction();
      return res.status(400).json({
        message: 'سعر العرض غير صالح، اطلب من الفني إرسال عرض صحيح'
      });
    }

    const commissionRate = COMMISSION_RATE;
    const commissionAmount = money(price * commissionRate / 100);

    if (!Number.isFinite(commissionAmount) || commissionAmount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({
        message: 'تعذر حساب عمولة الطلب بشكل صحيح'
      });
    }

    const fanniId = offer.fanni;

    const fanniBefore = await Fanni.findOne({
      _id: fanniId,
      role: 'fanni',
      status: 'معتمد'
    }).session(session);

    if (!fanniBefore) {
      await session.abortTransaction();
      return res.status(409).json({
        message: 'الفني صاحب العرض لم يعد حسابه معتمدًا'
      });
    }

    const balanceBefore = Number(fanniBefore.walletBalance || 0);

    if (!Number.isFinite(balanceBefore) || balanceBefore < commissionAmount) {
      await session.abortTransaction();
      return res.status(409).json({
        message: 'رصيد محفظة الفني غير كافٍ لسداد عمولة المنصة',
        requiredCommission: commissionAmount,
        walletBalance: Number.isFinite(balanceBefore) ? balanceBefore : 0
      });
    }

    /*
     * تحديث شرطي للرصيد يمنع تحوله إلى قيمة سالبة.
     * شرط commissionCharged:false على الطلب يمنع تكرار الخصم.
     */
    const fanniAfter = await Fanni.findOneAndUpdate(
      {
        _id: fanniId,
        role: 'fanni',
        status: 'معتمد',
        walletBalance: { $gte: commissionAmount }
      },
      {
        $inc: { walletBalance: -commissionAmount }
      },
      {
        new: true,
        session,
        runValidators: true
      }
    );

    if (!fanniAfter) {
      await session.abortTransaction();
      return res.status(409).json({
        message: 'الرصيد تغيّر أو أصبح غير كافٍ؛ لم يتم قبول العرض أو خصم العمولة'
      });
    }

    const balanceAfter = Number(fanniAfter.walletBalance);

    /*
     * نحدّث الطلب داخل نفس المعاملة.
     * إذا لم ينجح أي جزء من المعاملة، تتراجع جميع التغييرات.
     */
    const updateResult = await Order.updateOne(
      {
        _id: order._id,
        status: { $in: ACTIVE_STATUSES },
        commissionCharged: { $ne: true },
        expiresAt: { $gt: new Date() },
        'offers._id': offerId
      },
      {
        $set: {
          assignedFanni: fanniId,
          assignedFanniName: offer.fanniName,
          acceptedOfferId: offer._id,
          acceptedOfferPrice: price,
          commissionRate,
          commissionAmount,
          commissionCharged: true,
          commissionChargedAt: new Date(),
          status: 'تم اختيار فني'
        }
      },
      {
        session,
        runValidators: true
      }
    );

    if (updateResult.modifiedCount !== 1) {
      await session.abortTransaction();
      return res.status(409).json({
        message: 'الطلب لم يعد متاحًا؛ لم يتم تثبيت الخصم'
      });
    }

    /*
     * سجل مالي مستقل للعمولة.
     * المفتاح الفريد يمنع إنشاء حركة ثانية لنفس الطلب.
     */
    const transaction = new WalletTransaction({
      fanni: fanniId,
      order: order._id,
      orderSN: order.sn,
      type: 'commission',
      amount: -commissionAmount,
      balanceBefore,
      balanceAfter,
      description: `عمولة منصة صُنّاع بنسبة ${commissionRate}% للطلب ${order.sn}`,
      idempotencyKey: `commission:${String(order._id)}`
    });

    await transaction.save({ session });

    await session.commitTransaction();

    const updatedOrder = await Order.findById(order._id);

    responsePayload = {
      message: 'تم قبول العرض وخصم عمولة المنصة بنجاح',
      commission: {
        rate: commissionRate,
        amount: commissionAmount
      },
      order: publicOrder(updatedOrder, {
        includeAddress: true,
        includeAssignedFanniPhone: true
      })
    };
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    if (err && err.code === 11000) {
      responseStatus = 409;
      responsePayload = {
        message: 'توجد حركة مالية مسجلة لهذا الطلب بالفعل؛ لم يتم تكرار الخصم'
      };
    } else {
      next(err);
      return;
    }
  } finally {
    await session.endSession();
  }

  if (responsePayload) {
    return res.status(responseStatus).json(responsePayload);
  }
});

/*
 * تفاصيل العميل للفني المعيّن فقط.
 * GET /api/orders/:sn/assigned-details
 *
 * يتطلب توكن الفني الحالي، وحالة الطلب يجب أن تكون بعد القبول.
 */
router.get('/:sn/assigned-details', auth(), async (req, res, next) => {
  try {
    const sn = String(req.params.sn || '').toUpperCase();

    if (!validSN(sn)) {
      return res.status(400).json({
        message: 'كود الطلب غير صحيح'
      });
    }

    const order = await Order.findOne({ sn }).lean();

    if (!order) {
      return res.status(404).json({
        message: 'الطلب غير موجود'
      });
    }

    if (
      order.status !== 'تم اختيار فني'
      || !order.assignedFanni
      || String(order.assignedFanni) !== String(req.userId)
      || req.user.role !== 'fanni'
    ) {
      return res.status(403).json({
        message: 'تفاصيل العميل متاحة للفني المعيّن لهذا الطلب بعد قبول العرض فقط'
      });
    }

    return res.json({
      message: 'تم جلب تفاصيل الطلب المعيّن لك',
      order: {
        sn: order.sn,
        service: order.service,
        area: order.area,
        address: order.address,
        clientName: order.clientName,
        clientPhone: order.clientPhone,
        description: order.description,
        status: order.status,
        acceptedOfferPrice: order.acceptedOfferPrice,
        commissionAmount: order.commissionAmount,
        commissionCharged: order.commissionCharged
      }
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

    const isOrderOwner = verifyClientToken(req, order);

    const safe = publicOrder(order, {
      includeAddress: isOrderOwner,
      includeAssignedFanniPhone: isOrderOwner
    });

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
