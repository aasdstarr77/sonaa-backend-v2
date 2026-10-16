
const express = require('express');
const Joi = require('joi');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const Order = require('../models/Order');
const { auth } = require('../middleware/auth');
const { generateSN } = require('../utils/generateSN');
const { normalizePhone } = require('../utils/phone');

const router = express.Router();

const ACTIVE_STATUSES = ['قيد المراجعة', 'تم النشر', 'وصلتك عروض'];

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

function publicOrder(order, revealContacts = false) {
  const data = typeof order.toObject === 'function'
    ? order.toObject()
    : { ...order };

  if (!revealContacts) {
    delete data.clientPhone;
    delete data.phone;

    data.offers = (data.offers || []).map(offer => {
      const safeOffer = { ...offer };
      delete safeOffer.fanniPhone;
      delete safeOffer.phone;
      delete safeOffer.fanniId;
      delete safeOffer.fanni;
      return safeOffer;
    });
  }

  return data;
}

// إنشاء طلب جديد للعميل
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
      return res.status(400).json({ message: 'العنوان مطلوب' });
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
      return res.status(500).json({ message: 'تعذر إنشاء الطلب' });
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

    return res.status(201).json({
      message: 'تم إنشاء الطلب بنجاح',
      sn: order.sn,
      id: order._id,
      clientToken,
      order: publicOrder(order),
      data: publicOrder(order)
    });
  } catch (err) {
    next(err);
  }
});

// الطلبات المتاحة للفني المعتمد
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
      .select('-clientPhone')
      .sort({ createdAt: -1 })
      .lean();

    const safeOrders = orders.map(order => ({
      ...order,
      offers: (order.offers || []).map(offer => {
        const safeOffer = { ...offer };
        delete safeOffer.fanniPhone;
        return safeOffer;
      })
    }));

    return res.json({ orders: safeOrders, data: safeOrders });
  } catch (err) {
    next(err);
  }
});

// العروض التي أرسلها الفني الحالي
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
            orderSn: order.sn,
            orderStatus: order.status
          });
        }
      }
    }

    return res.json({ offers, data: offers });
  } catch (err) {
    next(err);
  }
});

// إرسال عرض من فني معتمد
router.post('/:sn/offer', auth(), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.status !== 'معتمد') {
      return res.status(403).json({
        message: 'حساب الفني لم يتم اعتماده بعد'
      });
    }

    const sn = String(req.params.sn || '').toUpperCase();

    if (!validSN(sn)) {
      return res.status(400).json({ message: 'كود الطلب غير صحيح' });
    }

    const schema = Joi.object({
      price: Joi.number().positive().max(1000000).required(),
      message: Joi.string().trim().min(5).max(500).required()
    });

    const result = schema.validate(req.body, { abortEarly: false });

    if (result.error) {
      return res.status(400).json({
        message: 'السعر والرسالة مطلوبان بشكل صحيح'
      });
    }

    const order = await Order.findOne({ sn });

    if (!order) {
      return res.status(404).json({ message: 'الطلب غير موجود' });
    }

    if (!ACTIVE_STATUSES.includes(order.status)) {
      return res.status(409).json({
        message: 'الطلب لم يعد متاحًا للعروض'
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
        const safeOffer = offer.toObject();
        delete safeOffer.fanniPhone;
        return safeOffer;
      })
    });
  } catch (err) {
    next(err);
  }
});

// قبول عرض: يتطلب توكن العميل الصادر عند إنشاء الطلب
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
      return res.status(404).json({ message: 'الطلب غير موجود' });
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

    const offer = order.offers.id(offerId);

    if (!offer) {
      return res.status(404).json({ message: 'العرض غير موجود' });
    }

    // تحديث مشروط بالحالة الحالية لمنع قبول عرضين متزامنين
    const updated = await Order.findOneAndUpdate(
      {
        _id: order._id,
        status: { $in: ACTIVE_STATUSES },
        'offers._id': offerId
      },
      {
        $set: {
          assignedFanni: offer.fanni,
          assignedFanniName: offer.fanniName,
          status: 'تم اختيار فني'
        }
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(409).json({
        message: 'تم اختيار فني بالفعل، حدّث حالة الطلب'
      });
    }

    return res.json({
      message: 'تم قبول العرض بنجاح',
      order: publicOrder(updated, true)
    });
  } catch (err) {
    next(err);
  }
});

// عرض عام آمن لتتبع الطلب
async function trackOrder(req, res, next) {
  try {
    const sn = String(req.params.sn || '').toUpperCase();

    if (!validSN(sn)) {
      return res.status(400).json({ message: 'كود الطلب غير صحيح' });
    }

    const order = await Order.findOne({ sn });

    if (!order) {
      return res.status(404).json({ message: 'الطلب غير موجود' });
    }

    const authorized = verifyClientToken(req, order);
    const safe = publicOrder(order, authorized);

    return res.json({ order: safe, data: safe });
  } catch (err) {
    next(err);
  }
}

router.get('/by-sn/:sn', trackOrder);
router.get('/:sn', trackOrder);

module.exports = router;
