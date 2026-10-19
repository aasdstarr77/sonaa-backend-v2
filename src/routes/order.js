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
const { ALL_SERVICES } = require('../config/professions');

const router = express.Router();

const ACTIVE_STATUSES = ['تم النشر', 'وصلتك عروض'];
const ORDER_EXPIRY_HOURS = 48;
const COMMISSION_RATE = 10;

/*
 * أسماء المناطق التي تستخدمها واجهة العميل، مع الاحتفاظ بالأسماء
 * القديمة المقبولة سابقًا لتجنب كسر الطلبات أو أي تكاملات موجودة.
 */
const AREA_OPTIONS = [
  // الأسماء الظاهرة في صفحة العميل frontend/client.html
  'القاهرة - وسط البلد',
  'القاهرة - العباسية',
  'القاهرة - مدينة نصر',
  'القاهرة - مصر الجديدة',
  'القاهرة - عين شمس',
  'القاهرة - المطرية',
  'القاهرة - المرج',
  'القاهرة - شبرا',
  'القاهرة - الساحل',
  'القاهرة - روض الفرج',
  'القاهرة - الزيتون',
  'القاهرة - حدائق القبة',
  'القاهرة - الوايلي',
  'القاهرة - منشية ناصر',
  'القاهرة - المعادي',
  'القاهرة - زهراء المعادي',
  'القاهرة - طرة',
  'القاهرة - حلوان',
  'القاهرة - التبين',
  'القاهرة - دار السلام',
  'القاهرة - البساتين',
  'القاهرة - المقطم',
  'القاهرة - الخليفة',
  'القاهرة - السيدة زينب',
  'القاهرة - مصر القديمة',
  'القاهرة - التجمع الأول',
  'القاهرة - التجمع الثالث',
  'القاهرة - التجمع الخامس',
  'القاهرة - الرحاب',
  'القاهرة - مدينتي',
  'القاهرة - الشروق',
  'القاهرة - بدر',
  'القاهرة - العاصمة الإدارية',
  'الجيزة - الدقي',
  'الجيزة - المهندسين',
  'الجيزة - العجوزة',
  'الجيزة - إمبابة',
  'الجيزة - الوراق',
  'الجيزة - بولاق الدكرور',
  'الجيزة - فيصل',
  'الجيزة - الهرم',
  'الجيزة - الطالبية',
  'الجيزة - العمرانية',
  'الجيزة - الجيزة',
  'الجيزة - المنيل',
  'الجيزة - حدائق الأهرام',
  'الجيزة - حدائق أكتوبر',
  'الجيزة - 6 أكتوبر',
  'الجيزة - الشيخ زايد',
  'الجيزة - الحوامدية',
  'الجيزة - أبو النمرس',
  'الجيزة - كرداسة',
  'الجيزة - أوسيم',
  'الجيزة - منشأة القناطر',
  'الجيزة - الصف',
  'الجيزة - أطفيح',
  'القليوبية - شبرا الخيمة',
  'القليوبية - الخصوص',
  'القليوبية - قليوب',
  'القليوبية - القناطر الخيرية',
  'القليوبية - العبور',
  'القليوبية - الخانكة',
  'القليوبية - بنها',
  'منطقة أخرى داخل القاهرة الكبرى',

  // الأسماء القديمة المدعومة سابقًا
  'وسط البلد',
  'جاردن سيتي',
  'الزمالك',
  'قصر النيل',
  'عابدين',
  'باب اللوق',
  'السيدة زينب',
  'المنيرة',
  'الفجالة',
  'رمسيس',
  'العباسية',
  'الظاهر',
  'غمرة',
  'شبرا',
  'روض الفرج',
  'الساحل',
  'الشرابية',
  'حدائق القبة',
  'الزيتون',
  'الأميرية',
  'المطرية',
  'عين شمس',
  'عين شمس الشرقية',
  'عين شمس الغربية',
  'المرج',
  'عزبة النخل',
  'مدينة نصر',
  'الحي الأول بمدينة نصر',
  'الحي السادس بمدينة نصر',
  'الحي السابع بمدينة نصر',
  'الحي الثامن بمدينة نصر',
  'الحي العاشر بمدينة نصر',
  'زهراء مدينة نصر',
  'مصر الجديدة',
  'الكوربة',
  'روكسي',
  'أرض الجولف',
  'النزهة',
  'جسر السويس',
  'ألف مسكن',
  'الحرفيين',
  'السلام',
  'النهضة',
  'المقطم',
  'الهضبة الوسطى',
  'المعادي',
  'زهراء المعادي',
  'حدائق المعادي',
  'دار السلام',
  'البساتين',
  'طرة',
  'حلوان',
  'المعصرة',
  '15 مايو',
  'التجمع الأول',
  'التجمع الثالث',
  'التجمع الخامس',
  'النرجس',
  'اللوتس',
  'بيت الوطن',
  'الرحاب',
  'مدينتي',
  'الشروق',
  'بدر',
  'العاصمة الإدارية الجديدة',
  'الدقي',
  'المهندسين',
  'العجوزة',
  'بولاق الدكرور',
  'فيصل',
  'الهرم',
  'حدائق الأهرام',
  'الطالبية',
  'العمرانية',
  'الجيزة',
  'إمبابة',
  'الوراق',
  'المنيرة الغربية',
  'أرض اللواء',
  'بين السرايات',
  'جامعة الدول العربية',
  'كفر طهرمس',
  'صفط اللبن',
  'ترسا',
  'المريوطية',
  'اللبيني',
  'المنصورية',
  'كرداسة',
  'أوسيم',
  'أبو رواش',
  'مدينة 6 أكتوبر',
  'الحي الأول بأكتوبر',
  'الحي الثاني بأكتوبر',
  'الحي الثالث بأكتوبر',
  'الحي الرابع بأكتوبر',
  'الحي الخامس بأكتوبر',
  'الحي السادس بأكتوبر',
  'الحي المتميز بأكتوبر',
  'الحصري',
  'غرب سوميد',
  'جنوب الأحياء بأكتوبر',
  'حدائق أكتوبر',
  'أكتوبر الجديدة',
  'مدينة الشيخ زايد',
  'القاهرة الجديدة',
  'القطامية',
  'التجمعات السكنية بالقاهرة الجديدة',
  'العبور',
  'الخصوص',
  'شبرا الخيمة',
  'بهتيم',
  'مسطرد',
  'القناطر الخيرية',
  'الوايلي',
  'منشية ناصر',
  'الخليفة',
  'مصر القديمة',
  'المنيل',
  'العاصمة الإدارية',
  'أكتوبر',
  '6 أكتوبر',
  'الشيخ زايد',
  'الحوامدية',
  'أبو النمرس',
  'منشأة القناطر',
  'الصف',
  'أطفيح',
  'بنها',
  'قليوب',
  'الخانكة'
];

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function toWesternDigits(value) {
  return String(value).replace(/[٠-٩۰-۹]/g, digit => {
    const arabicIndex = ARABIC_DIGITS.indexOf(digit);
    if (arabicIndex !== -1) return String(arabicIndex);
    return String(PERSIAN_DIGITS.indexOf(digit));
  });
}

function containsEgyptianMobile(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const normalized = toWesternDigits(value);
  const chunks = normalized.match(/\d(?:[\s().+\-_/\\،,؛:]*\d){9,15}/g) || [];
  return chunks.some(chunk => {
    const digits = chunk.replace(/\D/g, '');
    return /01[0125]\d{8}/.test(digits) || /201[0125]\d{8}/.test(digits) || /00201[0125]\d{8}/.test(digits);
  });
}

function sanitizeText(value) {
  if (typeof value !== 'string') return value;
  if (containsEgyptianMobile(value)) return '[تم إخفاء التفاصيل لاحتوائها على رقم تواصل]';
  return value;
}

function findPhoneContainingField(fields) {
  for (const [fieldName, value] of Object.entries(fields)) {
    if (typeof value === 'string' && containsEgyptianMobile(value)) return fieldName;
  }
  return null;
}

function sanitizeOffer(offer) {
  const safeOffer = typeof offer.toObject === 'function' ? offer.toObject() : { ...offer };
  delete safeOffer.fanniPhone;
  delete safeOffer.phone;
  delete safeOffer.fanniId;
  delete safeOffer.fanni;
  if (typeof safeOffer.message === 'string') safeOffer.message = sanitizeText(safeOffer.message);
  return safeOffer;
}

function publicOrder(order, options = {}) {
  const { includeAddress = true, includeAssignedFanniPhone = false, includeClientName = true } = options;
  if (!order) return null;
  const data = typeof order.toObject === 'function' ? order.toObject() : { ...order };
  const assignedFanniId = data.assignedFanni;
  if (!includeAddress) delete data.address;
  if (!includeClientName) delete data.clientName;
  delete data.clientPhone;
  delete data.phone;
  delete data.assignedFanni;
  delete data.assignedFanniPhone;
  if (includeAssignedFanniPhone && data.status === 'تم اختيار فني' && assignedFanniId) {
    const acceptedOffer = Array.isArray(data.offers) ? data.offers.find(offer => (data.acceptedOfferId && String(offer._id) === String(data.acceptedOfferId)) || (!data.acceptedOfferId && String(offer.fanni) === String(assignedFanniId))) : null;
    if (acceptedOffer && typeof acceptedOffer.fanniPhone === 'string' && acceptedOffer.fanniPhone.trim()) {
      data.assignedFanniPhone = acceptedOffer.fanniPhone;
    }
  }
  if (typeof data.description === 'string') data.description = sanitizeText(data.description);
  if (typeof data.desc === 'string') data.desc = sanitizeText(data.desc);
  if (Array.isArray(data.offers)) data.offers = data.offers.map(sanitizeOffer);
  return data;
}

const createSchema = Joi.object({
  service: Joi.string().trim().valid(...ALL_SERVICES).required().messages({
    'any.only': 'الخدمة المطلوبة غير موجودة في قائمة الخدمات المتاحة',
    'any.required': 'الخدمة مطلوبة'
  }),
  area: Joi.string().trim().valid(...AREA_OPTIONS).required(),
  address: Joi.string().trim().min(2).max(250).allow('').optional(),
  phone: Joi.string().trim().required(),
  clientPhone: Joi.string().trim(),
  clientName: Joi.string().trim().max(50).allow(''),
  budget: Joi.string().trim().max(50).allow('').optional(),
  description: Joi.string().trim().min(10).max(1000),
  desc: Joi.string().trim().min(10).max(1000).allow('')
}).unknown(false);

function validSN(sn) {
  return /^SN\d{6}$/i.test(String(sn || ''));
}

function clientTokenFrom(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim();
  return String(req.body?.clientToken || req.query?.clientToken || '');
}

function verifyClientToken(req, order) {
  const token = clientTokenFrom(req);
  if (!token || !process.env.JWT_SECRET) return false;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return payload.purpose === 'client-order' && String(payload.orderId) === String(order._id) && String(payload.sn).toUpperCase() === String(order.sn).toUpperCase();
  } catch { return false; }
}

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function getAcceptedOffer(order, offerId) {
  return order.offers.id(offerId);
}

router.post('/', async (req, res, next) => {
  try {
    const body = {
      ...req.body,
      phone: req.body.clientPhone || req.body.phone,
      description: req.body.description || req.body.desc
    };
    const { error, value } = createSchema.validate(body, { abortEarly: false, stripUnknown: false });
    if (error) {
      return res.status(400).json({
        message: 'بيانات الطلب غير مكتملة أو غير صحيحة',
        details: error.details.map(item => item.message)
      });
    }
    const phoneInField = findPhoneContainingField({
      service: value.service,
      area: value.area,
      address: value.address || '',
      clientName: value.clientName || '',
      budget: value.budget || '',
      description: value.description || '',
      desc: value.desc || ''
    });
    if (phoneInField) {
      return res.status(400).json({
        message: 'ممنوع كتابة رقم موبايل داخل الاسم أو المنطقة أو العنوان أو وصف الطلب أو الميزانية. استخدم خانة رقم الهاتف المخصصة.'
      });
    }
    const clientPhone = normalizePhone(value.phone);
    if (!clientPhone) return res.status(400).json({ message: 'رقم هاتف العميل غير صحيح' });
    const area = String(value.area || '').trim();
    const address = String(value.address || '').trim();
    if (!AREA_OPTIONS.includes(area)) return res.status(400).json({ message: 'اختار المنطقة من القائمة المتاحة' });
    if (address.length < 2) return res.status(400).json({ message: 'العنوان التفصيلي مطلوب' });
    if (!process.env.JWT_SECRET) return res.status(503).json({ message: 'إنشاء الطلب غير متاح بسبب إعدادات الخادم' });
    const safeDescription = sanitizeText(String(value.description || '').trim());
    const safeClientName = sanitizeText(String(value.clientName || 'عميل').trim());
    let order = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        order = await Order.create({
          sn: generateSN(),
          service: value.service,
          area,
          address,
          clientName: safeClientName || 'عميل',
          clientPhone,
          budget: value.budget || '',
          description: safeDescription,
          status: 'قيد المراجعة'
        });
        break;
      } catch (err) {
        if (err.code !== 11000 || attempt === 2) throw err;
      }
    }
    if (!order) return res.status(500).json({ message: 'تعذر إنشاء الطلب' });
    const clientToken = jwt.sign({ purpose: 'client-order', orderId: String(order._id), sn: order.sn }, process.env.JWT_SECRET, { expiresIn: '30d' });
    const safeOrder = publicOrder(order);
    return res.status(201).json({
      message: 'تم إنشاء الطلب بنجاح، وسيتم مراجعته من الإدارة',
      sn: order.sn,
      id: order._id,
      clientToken,
      order: safeOrder,
      data: safeOrder
    });
  } catch (err) { next(err); }
});

router.post('/admin/:sn/publish', auth('admin'), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'هذه العملية متاحة للإدارة فقط' });
    const sn = String(req.params.sn || '').toUpperCase();
    if (!validSN(sn)) return res.status(400).json({ message: 'كود الطلب غير صحيح' });
    const order = await Order.findOneAndUpdate({ sn, status: 'قيد المراجعة' }, { $set: { status: 'تم النشر', expiresAt: new Date(Date.now() + ORDER_EXPIRY_HOURS * 60 * 60 * 1000) } }, { new: true, runValidators: true });
    if (!order) {
      const existing = await Order.findOne({ sn }).select('status').lean();
      if (!existing) return res.status(404).json({ message: 'الطلب غير موجود' });
      return res.status(409).json({ message: 'الطلب ليس قيد المراجعة، لذلك لم يتم نشره', status: existing.status });
    }
    const safeOrder = publicOrder(order);
    return res.json({ message: 'تم نشر الطلب للفنيين المعتمدين بنجاح', order: safeOrder, data: safeOrder });
  } catch (err) { next(err); }
});

router.get('/available', auth(), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.status !== 'معتمد') return res.status(403).json({ message: 'حساب الفني لم يتم اعتماده بعد' });
    const orders = await Order.find({ status: { $in: ACTIVE_STATUSES }, expiresAt: { $gt: new Date() } }).select('-clientPhone -phone -address -clientName').sort({ createdAt: -1 }).lean();
    const safeOrders = orders.map(order => publicOrder(order, { includeAddress: false, includeClientName: false }));
    return res.json({ orders: safeOrders, data: safeOrders });
  } catch (err) { next(err); }
});

router.get('/my-offers', auth(), async (req, res, next) => {
  try {
    if (req.user.role !== 'fanni') return res.status(403).json({ message: 'هذه الخدمة متاحة لحسابات الفنيين فقط' });
    const orders = await Order.find({ 'offers.fanni': req.userId }).select('sn service area address clientName clientPhone description budget status offers assignedFanni acceptedOfferId acceptedOfferPrice commissionAmount commissionCharged').lean();
    const offers = [];
    for (const order of orders) {
      for (const offer of order.offers || []) {
        if (String(offer.fanni) !== String(req.userId)) continue;
        
        const isAssignedToThisFanni =
          String(order.assignedFanni || '') === String(req.userId) &&
          String(order.acceptedOfferId || '') === String(offer._id);

        const isAcceptedByThisFanni =
          order.status === 'تم اختيار فني' && isAssignedToThisFanni;

        const isCompletedByThisFanni =
          order.status === 'تم الانتهاء' && isAssignedToThisFanni;

        const safeOffer = {
          ...sanitizeOffer(offer),
          orderSn: order.sn,
          orderStatus: order.status,
          service: order.service,
          accepted: isAssignedToThisFanni &&
            ['تم اختيار فني', 'تم الانتهاء'].includes(order.status),
          completed: isCompletedByThisFanni
        };

        if (
          isAssignedToThisFanni &&
          ['تم اختيار فني', 'تم الانتهاء'].includes(order.status)
        ) {
          safeOffer.client = {
            name: sanitizeText(order.clientName || ''),
            phone: order.clientPhone || '',
            area: order.area || '',
            address: order.address || '',
            description: sanitizeText(order.description || ''),
            budget: order.budget || '',
            acceptedOfferPrice: order.acceptedOfferPrice,
            commissionAmount: order.commissionAmount,
            commissionCharged: Boolean(order.commissionCharged)
          }

        }
        offers.push(safeOffer);
      }
    }
    return res.json({ offers, data: offers });
  } catch (err) { next(err); }
});

router.post('/:sn/offer', auth(), async (req, res, next) => {
  try {
    if (req.user.role !== 'fanni') return res.status(403).json({ message: 'تقديم العروض متاح للفنيين فقط' });
    if (req.user.status !== 'معتمد') return res.status(403).json({ message: 'حساب الفني لم يتم اعتماده بعد' });
    const sn = String(req.params.sn || '').toUpperCase();
    if (!validSN(sn)) return res.status(400).json({ message: 'كود الطلب غير صحيح' });
    const schema = Joi.object({ price: Joi.number().positive().max(1000000).required(), message: Joi.string().trim().min(5).max(500).required() });
    const result = schema.validate(req.body, { abortEarly: false });
    if (result.error) return res.status(400).json({ message: 'السعر والرسالة مطلوبان بشكل صحيح' });
    const phoneInMessage = findPhoneContainingField({ message: result.value.message });
    if (phoneInMessage) return res.status(400).json({ message: 'ممنوع كتابة رقم موبايل داخل رسالة العرض.' });
    const price = money(result.value.price);
    const commissionAmount = money(price * COMMISSION_RATE / 100);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(commissionAmount) || commissionAmount <= 0) return res.status(400).json({ message: 'سعر العرض غير صالح' });
    const order = await Order.findOne({ sn });
    if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
    if (!ACTIVE_STATUSES.includes(order.status)) return res.status(409).json({ message: 'الطلب غير منشور أو لم يعد متاحًا للعروض' });
    if (order.expiresAt && order.expiresAt <= new Date()) return res.status(409).json({ message: 'انتهت مدة استقبال العروض لهذا الطلب' });
    const alreadySent = order.offers.some(offer => String(offer.fanni) === String(req.userId));
    if (alreadySent) return res.status(409).json({ message: 'سبق أن أرسلت عرضًا لهذا الطلب' });
    const fanni = await Fanni.findOne({ _id: req.userId, role: 'fanni', status: 'معتمد' }).select('walletBalance');
    if (!fanni) return res.status(403).json({ message: 'حساب الفني غير موجود أو غير معتمد' });
    const walletBalance = Number(fanni.walletBalance || 0);
    if (!Number.isFinite(walletBalance) || walletBalance < commissionAmount) {
      return res.status(409).json({ message: 'رصيد محفظتك لا يكفي لعمولة 10% من قيمة هذا العرض', offerPrice: price, requiredCommission: commissionAmount, walletBalance: Number.isFinite(walletBalance) ? walletBalance : 0 });
    }
    order.offers.push({ fanni: req.userId, fanniId: String(req.userId), fanniName: req.user.name, fanniPhone: req.user.phone, price: String(price), priceNum: price, message: sanitizeText(result.value.message) });
    order.status = 'وصلتك عروض';
    await order.save();
    return res.status(201).json({
      message: 'تم إرسال العرض بنجاح. لم يتم خصم أي مبلغ من محفظتك.',
      orderSn: order.sn,
      requiredCommission: commissionAmount,
      walletBalance,
      offers: order.offers.map(offer => { const safeOffer = typeof offer.toObject === 'function' ? offer.toObject() : { ...offer }; delete safeOffer.fanniPhone; delete safeOffer.phone; if (typeof safeOffer.message === 'string') safeOffer.message = sanitizeText(safeOffer.message); return safeOffer; })
    });
  } catch (err) { next(err); }
});

router.post('/:sn/accept', async (req, res, next) => {
  let session;
  let responsePayload = null;
  let responseStatus = 200;
  try {
    session = await mongoose.startSession();
    const sn = String(req.params.sn || '').toUpperCase();
    const offerId = String(req.body.offerId || '');
    if (!validSN(sn) || !mongoose.isValidObjectId(offerId)) return res.status(400).json({ message: 'كود الطلب أو العرض غير صحيح' });
    if (!process.env.JWT_SECRET) return res.status(503).json({ message: 'الخدمة غير متاحة بسبب إعدادات الخادم' });
    await session.startTransaction();
    const order = await Order.findOne({ sn }).session(session);
    if (!order) { await session.abortTransaction(); return res.status(404).json({ message: 'الطلب غير موجود' }); }
    if (!verifyClientToken(req, order)) { await session.abortTransaction(); return res.status(403).json({ message: 'لازم تستخدم رابط أو جلسة العميل صاحب الطلب لقبول العرض' }); }
    if (!ACTIVE_STATUSES.includes(order.status)) { await session.abortTransaction(); return res.status(409).json({ message: 'تم اختيار فني بالفعل أو لم يعد الطلب متاحًا' }); }
    if (order.expiresAt && order.expiresAt <= new Date()) { await session.abortTransaction(); return res.status(409).json({ message: 'انتهت مدة استقبال العروض لهذا الطلب' }); }
    if (order.commissionCharged === true) { await session.abortTransaction(); return res.status(409).json({ message: 'تم تسجيل عمولة هذا الطلب بالفعل' }); }
    const offer = getAcceptedOffer(order, offerId);
    if (!offer) { await session.abortTransaction(); return res.status(404).json({ message: 'العرض غير موجود' }); }
    const price = Number(offer.priceNum);
    if (!Number.isFinite(price) || price <= 0) { await session.abortTransaction(); return res.status(400).json({ message: 'سعر العرض غير صالح، اطلب من الفني إرسال عرض صحيح' }); }
    const commissionRate = COMMISSION_RATE;
    const commissionAmount = money(price * commissionRate / 100);
    if (!Number.isFinite(commissionAmount) || commissionAmount <= 0) { await session.abortTransaction(); return res.status(400).json({ message: 'تعذر حساب عمولة الطلب بشكل صحيح' }); }
    const fanniId = offer.fanni;
    const fanniBefore = await Fanni.findOne({ _id: fanniId, role: 'fanni', status: 'معتمد' }).session(session);
    if (!fanniBefore) { await session.abortTransaction(); return res.status(409).json({ message: 'الفني صاحب العرض لم يعد حسابه معتمدًا' }); }
    const balanceBefore = Number(fanniBefore.walletBalance || 0);
    if (!Number.isFinite(balanceBefore) || balanceBefore < commissionAmount) { await session.abortTransaction(); return res.status(409).json({ message: 'رصيد محفظة الفني غير كافٍ لسداد عمولة المنصة', requiredCommission: commissionAmount, walletBalance: Number.isFinite(balanceBefore) ? balanceBefore : 0 }); }
    const fanniAfter = await Fanni.findOneAndUpdate({ _id: fanniId, role: 'fanni', status: 'معتمد', walletBalance: { $gte: commissionAmount } }, { $inc: { walletBalance: -commissionAmount } }, { new: true, session, runValidators: true });
    if (!fanniAfter) { await session.abortTransaction(); return res.status(409).json({ message: 'الرصيد تغيّر أو أصبح غير كافٍ؛ لم يتم قبول العرض أو خصم العمولة' }); }
    const balanceAfter = Number(fanniAfter.walletBalance);
    const updateResult = await Order.updateOne({ _id: order._id, status: { $in: ACTIVE_STATUSES }, commissionCharged: { $ne: true }, expiresAt: { $gt: new Date() }, 'offers._id': offerId }, { $set: { assignedFanni: fanniId, assignedFanniName: offer.fanniName, acceptedOfferId: offer._id, acceptedOfferPrice: price, commissionRate, commissionAmount, commissionCharged: true, commissionChargedAt: new Date(), status: 'تم اختيار فني' } }, { session, runValidators: true });
    if (updateResult.modifiedCount !== 1) { await session.abortTransaction(); return res.status(409).json({ message: 'الطلب لم يعد متاحًا؛ لم يتم تثبيت الخصم' }); }
    const transaction = new WalletTransaction({ fanni: fanniId, order: order._id, orderSN: order.sn, type: 'commission', amount: -commissionAmount, balanceBefore, balanceAfter, description: `عمولة منصة صُنّاع بنسبة ${commissionRate}% للطلب ${order.sn}`, idempotencyKey: `commission:${String(order._id)}` });
    await transaction.save({ session });
    const updatedOrder = await Order.findById(order._id).session(session);
    if (!updatedOrder) throw new Error('ORDER_NOT_FOUND_AFTER_UPDATE');
    responsePayload = { message: 'تم قبول العرض وخصم عمولة المنصة بنجاح', commission: { rate: commissionRate, amount: commissionAmount }, order: publicOrder(updatedOrder, { includeAddress: true, includeAssignedFanniPhone: true }) };
    await session.commitTransaction();
  } catch (err) {
    if (session && session.inTransaction()) { try { await session.abortTransaction(); } catch (abortError) {} }
    if (err && err.code === 11000) { responseStatus = 409; responsePayload = { message: 'توجد حركة مالية مسجلة لهذا الطلب بالفعل؛ لم يتم تكرار الخصم' }; } else { return next(err); }
  } finally { if (session) await session.endSession(); }
  if (responsePayload) return res.status(responseStatus).json(responsePayload);
  return res.status(500).json({ message: 'تعذر إكمال عملية قبول العرض' });
});

router.post('/:sn/complete', auth(), async (req, res, next) => {
  try {
    if (req.user.role !== 'fanni') {
      return res.status(403).json({
        message: 'إكمال المهمة متاح للفني المعيّن فقط'
      });
    }

    const sn = String(req.params.sn || '').toUpperCase();

    if (!/^SN\d{6}$/.test(sn)) {
      return res.status(400).json({
        message: 'كود الطلب غير صحيح'
      });
    }

    const order = await Order.findOneAndUpdate(
      {
        sn,
        status: 'تم اختيار فني',
        assignedFanni: req.userId
      },
      {
        $set: { status: 'تم الانتهاء' }
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!order) {
      const existing = await Order.findOne({ sn }).select(
        'sn status assignedFanni'
      );

      if (!existing) {
        return res.status(404).json({
          message: 'الطلب غير موجود'
        });
      }

      if (String(existing.assignedFanni || '') !== String(req.userId)) {
        return res.status(403).json({
          message: 'هذا الطلب غير مسند إليك'
        });
      }

      return res.status(409).json({
        message: existing.status === 'تم الانتهاء'
          ? 'المهمة مكتملة بالفعل'
          : 'حالة الطلب لا تسمح بإكمال المهمة'
      });
    }

    return res.json({
      message: 'تم إكمال المهمة بنجاح',
      order: {
        sn: order.sn,
        status: order.status
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:sn/assigned-details', auth(), async (req, res, next) => {
  try {
    const sn = String(req.params.sn || '').toUpperCase();
    if (!validSN(sn)) return res.status(400).json({ message: 'كود الطلب غير صحيح' });
    const order = await Order.findOne({ sn }).lean();
    if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
    if (order.status !== 'تم اختيار فني' || !order.assignedFanni || String(order.assignedFanni) !== String(req.userId) || req.user.role !== 'fanni') {
      return res.status(403).json({ message: 'تفاصيل العميل متاحة للفني المعيّن لهذا الطلب بعد قبول العرض فقط' });
    }
    return res.json({
      message: 'تم جلب تفاصيل الطلب المعيّن لك',
      order: { sn: order.sn, service: order.service, area: order.area, address: order.address, clientName: sanitizeText(order.clientName || ''), clientPhone: order.clientPhone, description: sanitizeText(order.description || ''), budget: order.budget || '', status: order.status, acceptedOfferPrice: order.acceptedOfferPrice, commissionAmount: order.commissionAmount, commissionCharged: order.commissionCharged }
    });
  } catch (err) { next(err); }
});

async function trackOrder(req, res, next) {
  try {
    const sn = String(req.params.sn || '').toUpperCase();
    if (!validSN(sn)) return res.status(400).json({ message: 'كود الطلب غير صحيح' });
    const order = await Order.findOne({ sn });
    if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
    const isOrderOwner = verifyClientToken(req, order);
    const safe = publicOrder(order, { includeAddress: isOrderOwner, includeAssignedFanniPhone: isOrderOwner });
    return res.json({ order: safe, data: safe });
  } catch (err) { next(err); }
}

router.get('/by-sn/:sn', trackOrder);
router.get('/:sn', trackOrder);

module.exports = router;
