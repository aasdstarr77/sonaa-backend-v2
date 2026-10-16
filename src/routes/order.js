
const express = require('express');
const Joi = require('joi');
const mongoose = require('mongoose');

const Order = require('../models/Order');
const { auth } = require('../middleware/auth');
const { generateSN } = require('../utils/generateSN');
const { normalizePhone } = require('../utils/phone');

const router = express.Router();

const createSchema = Joi.object({
  service: Joi.string().trim().min(2).max(100).required(),
  area: Joi.string().trim().min(2).max(250),
  address: Joi.string().trim().min(2).max(250),
  phone: Joi.string().required(),
  clientPhone: Joi.string(),
  clientName: Joi.string().trim().max(50).allow(''),
  description: Joi.string().trim().min(10).max(1000).required(),
  desc: Joi.string().allow('')
}).unknown(false);

function validSN(sn) {
  return /^SN\d{6}$/.test(String(sn || '').toUpperCase());
}

// إنشاء طلب عميل
router.post('/', async (req, res, next) => {
  try {
    const body = {
      ...req.body,
      area: req.body.area || req.body.address,
      phone: req.body.clientPhone || req.body.phone,
      description: req.body.description || req.body.desc
    };

    const { error, value } = createSchema.validate(body);
    if (error) {
      return res.status(400).json({
        message: 'بيانات الطلب غير مكتملة أو غير صحيحة',
        details: error.details.map(d => d.message)
      });
    }

    const clientPhone = normalizePhone(value.phone);
    if (!clientPhone) {
      return res.status(400).json({ message: 'رقم هاتف العميل غير صحيح' });
    }

    const area = value.area || value.address;
    if (!area) {
      return res.status(400).json({ message: 'العنوان مطلوب' });
    }

    let order;
    // إعادة المحاولة إذا صادفنا رقم طلب موجودًا بالفعل
    for (let i = 0; i < 3; i++) {
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
        if (err.code !== 11000 || i === 2) throw err;
      }
    }

    return res.status(201).json({
      sn: order.sn,
      id: order._id,
      order,
      data: order
    });
  } catch (err) {
    next(err);
  }
});

// الطلبات المتاحة للفني المعتمد
router.get('/available', auth(), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.status !== 'معتمد') {
      return res.status(403).json({ message: 'حساب الفني لم يتم اعتماده بعد' });
    }

    const orders = await Order.find({
      status: { $in: ['قيد المراجعة', 'تم النشر', 'وصلتك عروض'] },
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 }).lean();

    res.json({ orders, data: orders });
  } catch (err) {
    next(err);
  }
});

// عروض الفني الحالي
router.get('/my-offers', auth(), async (req, res, next) => {
  try {
    const orders = await Order.find({
      'offers.fanni': req.userId
    }).select('sn offers').lean();

    const offers = [];
    for (const order of orders) {
      for (const offer of order.offers || []) {
        if (String(offer.fanni) === String(req.userId)) {
          offers.push({
            ...offer,
            orderSn: order.sn,
            status: 'بانتظار موافقة العميل'
          });
        }
      }
    }

    res.json({ offers, data: offers });
  } catch (err) {
    next(err);
  }
});

// إرسال عرض على طلب
router.post('/:sn/offer', auth(), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.status !== 'معتمد') {
      return res.status(403).json({ message: 'حساب الفني لم يتم اعتماده بعد' });
    }

    const sn = String(req.params.sn || '').toUpperCase();
    if (!validSN(sn)) {
      return res.status(400).json({ message: 'كود الطلب غير صحيح' });
    }

    const schema = Joi.object({
      price: Joi.number().positive().max(1000000).required(),
      message: Joi.string().trim().min(5).max(500).required()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: 'السعر والرسالة مطلوبان بشكل صحيح' });
    }

    const order = await Order.findOne({ sn });
    if (!order) {
      return res.status(404).json({ message: 'الطلب غير موجود' });
    }

    if (!['قيد المراجعة', 'تم النشر', 'وصلتك عروض'].includes(order.status)) {
      return res.status(409).json({ message: 'الطلب لم يعد متاحًا للعروض' });
    }

    if (order.expiresAt && order.expiresAt <= new Date()) {
      return res.status(409).json({ message: 'انتهت مدة استقبال العروض لهذا الطلب' });
    }

    const alreadySent = order.offers.some(
      offer => String(offer.fanni) === String(req.userId)
    );
    if (alreadySent) {
      return res.status(409).json({ message: 'سبق أن أرسلت عرضًا لهذا الطلب' });
    }

    order.offers.push({
      fanni: req.userId,
      fanniId: String(req.userId),
      fanniName: req.user.name,
      fanniPhone: req.user.phone,
      price: String(value.price),
      priceNum: value.price,
      message: value.message
    });

    order.status = 'وصلتك عروض';
    await order.save();

    res.status(201).json({
      message: 'تم إرسال العرض',
      orderSn: order.sn,
      offers: order.offers
    });
  } catch (err) {
    next(err);
  }
});

// قبول عرض من العميل
router.post('/:sn/accept', async (req, res, next) => {
  try {
    const sn = String(req.params.sn || '').toUpperCase();
    const offerId = String(req.body.offerId || '');

    if (!validSN(sn) || !mongoose.isValidObjectId(offerId)) {
      return res.status(400).json({ message: 'كود الطلب أو العرض غير صحيح' });
    }

    const order = await Order.findOne({ sn });
    if (!order) {
      return res.status(404).json({ message: 'الطلب غير موجود' });
    }

    if (!['قيد المراجعة', 'تم النشر', 'وصلتك عروض'].includes(order.status)) {
      return res.status(409).json({ message: 'لا يمكن قبول عرض لهذا الطلب حاليًا' });
    }

    const offer = order.offers.id(offerId);
    if (!offer) {
      return res.status(404).json({ message: 'العرض غير موجود' });
    }

    order.assignedFanni = offer.fanni;
    order.assignedFanniName = offer.fanniName;
    order.status = 'تم اختيار فني';

    await order.save();

    res.json({
      message: 'تم قبول العرض',
      order
    });
  } catch (err) {
    next(err);
  }
});

// تتبع الطلب برقم SN
router.get('/by-sn/:sn', async (req, res, next) => {
  try {
    const sn = String(req.params.sn || '').toUpperCase();
    if (!validSN(sn)) {
      return res.status(400).json({ message: 'كود الطلب غير صحيح' });
    }

    const order = await Order.findOne({ sn }).lean();
    if (!order) {
      return res.status(404).json({ message: 'الطلب غير موجود' });
    }

    res.json({ order, data: order });
  } catch (err) {
    next(err);
  }
});

// مسار التتبع المختصر
router.get('/:sn', async (req, res, next) => {
  try {
    const sn = String(req.params.sn || '').toUpperCase();
    if (!validSN(sn)) {
      return res.status(400).json({ message: 'كود الطلب غير صحيح' });
    }

    const order = await Order.findOne({ sn }).lean();
    if (!order) {
      return res.status(404).json({ message: 'الطلب غير موجود' });
    }

    res.json({ order, data: order });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```
