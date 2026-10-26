'use strict';

const express = require('express');
const Joi = require('joi');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const Order = require('../models/Order');
const { createNotification, notifyAdmins } = require('../utils/notifications');
const Fanni = require('../models/Fanni');
const Rating = require('../models/Rating');
const WalletTransaction = require('../models/WalletTransaction');
const AdminConfig = require('../models/AdminConfig');
const { auth } = require('../middleware/auth');
const { clientAuth } = require('../middleware/clientAuth');
const { generateSN } = require('../utils/generateSN');
const { normalizePhone } = require('../utils/phone');
const {
  ALL_SERVICES,
  CATEGORIES,
  normalizeServiceName
} = require('../config/professions');

const router = express.Router();

const ACTIVE_STATUSES = ['تم النشر', 'وصلتك عروض'];
const ORDER_EXPIRY_HOURS = 48;
const DEFAULT_COMMISSION_RATE = 10;

/*
 * أسماء المناطق التي تستخدمها واجهة العميل،
 * مع الاحتفاظ بالأسماء القديمة المقبولة سابقًا.
 */


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
  const chunks =
    normalized.match(/\d(?:[\s().+-_/\،,؛:]*\d){9,15}/g) || [];

  return chunks.some(chunk => {
    const digits = chunk.replace(/\D/g, '');
    return (
      /01[0125]\d{8}/.test(digits) ||
      /201[0125]\d{8}/.test(digits) ||
      /00201[0125]\d{8}/.test(digits)
    );
  });
}

function sanitizeText(value) {
  if (typeof value !== 'string') return value;
  if (containsEgyptianMobile(value)) {
    return '[تم إخفاء التفاصيل لاحتوائها على رقم تواصل]';
  }
  return value;
}

function findPhoneContainingField(fields) {
  for (const [fieldName, value] of Object.entries(fields)) {
    if (
      typeof value === 'string' &&
      containsEgyptianMobile(value)
    ) {
      return fieldName;
    }
  }
  return null;
}

function sanitizeOffer(offer) {
  const safeOffer =
    typeof offer.toObject === 'function'
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

function publicOrder(order, options = {}) {
  const {
    includeAddress = true,
    includeAssignedFanniPhone = false,
    includeClientName = true
  } = options;

  if (!order) return null;

  const data =
    typeof order.toObject === 'function'
      ? order.toObject()
      : { ...order };

  const assignedFanniId = data.assignedFanni;
  data.hasVoiceRecording = Boolean(data.voiceRecordingData);
  delete data.voiceRecordingData;

  if (!includeAddress) delete data.address;
  if (!includeClientName) delete data.clientName;

  delete data.clientPhone;
  delete data.phone;
  delete data.clientAccount;
  delete data.assignedFanni;
  delete data.assignedFanniPhone;

  if (
    includeAssignedFanniPhone &&
    data.status === 'تم اختيار فني' &&
    assignedFanniId
  ) {
    const acceptedOffer = Array.isArray(data.offers)
      ? data.offers.find(
          offer =>
            (data.acceptedOfferId &&
              String(offer._id) === String(data.acceptedOfferId)) ||
            (!data.acceptedOfferId &&
              String(offer.fanni) === String(assignedFanniId))
        )
      : null;

    if (
      acceptedOffer &&
      typeof acceptedOffer.fanniPhone === 'string' &&
      acceptedOffer.fanniPhone.trim()
    ) {
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
    // A technician is allowed one offer per order. Hide historical duplicates
    // at the API boundary as well as preventing new concurrent duplicates.
    const seenTechnicians = new Set();
    const uniqueOffers = [];
    for (const offer of data.offers) {
      const technicianId = String(offer?.fanni?._id || offer?.fanni || offer?.fanniId || '').trim();
      const offerId = String(offer?._id || offer?.id || '').trim();
      const key = technicianId ? `fanni:${technicianId}` : offerId ? `offer:${offerId}` : '';
      if (key && seenTechnicians.has(key)) continue;
      if (key) seenTechnicians.add(key);
      uniqueOffers.push(offer);
    }
    data.offers = uniqueOffers.map(sanitizeOffer);
  }

  return data;
}

/*
 * التحقق من تخصص الفني في الباك إند.
 *
 * لو تخصص الفني اسم قسم كامل، مثل "دش وكاميرات وشاشات"،
 * يُسمح له بخدمات القسم.
 *
 * ولو تخصصه اسم خدمة محددة، مثل "تركيب دش"،
 * يُسمح له بالخدمة المحددة فقط.
 */
function fanniCanHandleService(specialties, serviceName) {
  if (!Array.isArray(specialties) || !serviceName) return false;

  const normalizedService = normalizeServiceName(serviceName);
  if (!normalizedService) return false;

  const normalizedSpecialties = specialties
    .filter(value => typeof value === 'string')
    .map(normalizeServiceName)
    .filter(Boolean);

  if (normalizedSpecialties.includes(normalizedService)) {
    return true;
  }

  const category = CATEGORIES.find(item =>
    item.services.some(
      service => normalizeServiceName(service) === normalizedService
    )
  );

  if (!category) return false;

  return normalizedSpecialties.includes(
    normalizeServiceName(category.label)
  );
}

const createSchema = Joi.object({
  service: Joi.string()
    .trim()
    .valid(...ALL_SERVICES)
    .required()
    .messages({
      'any.only': 'الخدمة المطلوبة غير موجودة في قائمة الخدمات المتاحة',
      'any.required': 'الخدمة مطلوبة'
    }),
  area: Joi.string().trim().min(2).max(100).required().messages({ 'any.required': 'اكتب المنطقة أو الحي' }),
  address: Joi.string().trim().min(2).max(250).allow('').optional(),
  phone: Joi.string().trim().required(),
  clientPhone: Joi.string().trim(),
  clientName: Joi.string().trim().max(50).allow(''),
  budget: Joi.string().trim().max(50).allow('').optional(),
  description: Joi.string().trim().max(1000).allow('').optional(),
  desc: Joi.string().trim().max(1000).allow('').optional(),
  voiceRecordingData: Joi.string().max(520000).pattern(/^data:audio\/(?:webm|ogg|mp4|mpeg|wav)(?:;codecs=[a-zA-Z0-9.-]+)?;base64,[A-Za-z0-9+/]+={0,2}$/).allow('').optional()
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

    if (payload.role === 'client') {
      return Boolean(order.clientAccount) &&
        String(payload.id) === String(order.clientAccount);
    }

    return (
      payload.purpose === 'client-order' &&
      String(payload.orderId) === String(order._id) &&
      String(payload.sn).toUpperCase() === String(order.sn).toUpperCase()
    );
  } catch {
    return false;
  }
}


function publicRatings(ratings) {
  return (ratings || []).map(rating => ({
    reviewerRole: rating.reviewerRole,
    stars: rating.stars,
    comment: rating.comment || '',
    createdAt: rating.createdAt
  }));
}

async function hasRatingBlock({ clientPhone, fanniId }) {
  const phone = normalizePhone(clientPhone);
  if (!phone || !fanniId) return false;
  return Rating.exists({
    clientPhone: phone,
    fanniId,
    blockFuture: true
  });
}

async function currentPricing() {
  const config = await AdminConfig.findOne({ key: 'main' }).select('pricing').lean();
  return config?.pricing || { check: 0, commission: DEFAULT_COMMISSION_RATE, minOffer: 1, maxOffer: 1000000 };
}

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

// ترقية آلية عند اكتمال المهام أو تحديث تقييم العميل.
// لا تخفّض المستوى الحالي تلقائيًا إذا انخفض التقييم لاحقًا.
const PROFESSIONAL_LEVEL_RANK = {
  'مبتدئ': 0, 'ممارس': 1, 'محترف': 2, 'خبير مبتدئ': 3,
  'خبير': 4, 'خبير أول': 5, 'استشاري فني': 6, 'نخبة': 7, 'أسطوري': 8
};

async function autoPromoteFanni(fanniId, reason) {
  if (!fanniId) return null;
  const fanni = await Fanni.findOne({ _id: fanniId, role: 'fanni' });
  if (!fanni || typeof fanni.calculateLevel !== 'function') return null;
  const currentLevel = fanni.level || 'مبتدئ';
  const calculatedLevel = fanni.calculateLevel();
  const currentRank = PROFESSIONAL_LEVEL_RANK[currentLevel] ?? 0;
  const calculatedRank = PROFESSIONAL_LEVEL_RANK[calculatedLevel] ?? 0;
  if (calculatedRank <= currentRank) return fanni;
  fanni.level = calculatedLevel;
  fanni.levelHistory.push({
    from: currentLevel, to: calculatedLevel, date: new Date(), by: 'النظام',
    reason: String(reason || 'ترقية آلية حسب الإنجاز').slice(0, 500)
  });
  fanni.decisions.push({
    action: 'ترقية مستوى',
    reason: 'ترقية آلية من ' + currentLevel + ' إلى ' + calculatedLevel + '. ' + String(reason || '').slice(0, 350),
    date: new Date(), by: 'النظام',
    meta: { from: currentLevel, to: calculatedLevel, automatic: true }
  });
  await fanni.save();
  return fanni;
}

function getAcceptedOffer(order, offerId) {
  return order.offers.id(offerId);
}

router.post('/', clientAuth, async (req, res, next) => {
  try {
    const body = {
      ...req.body,
      // الاسم ورقم الهاتف مصدرهما الحساب الموثّق، وليس حقولًا يرسلها المتصفح.
      clientName: req.client.name,
      phone: req.client.phone,
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
        message:
          'ممنوع كتابة رقم موبايل داخل الاسم أو المنطقة أو العنوان أو وصف الطلب أو الميزانية. استخدم خانة رقم الهاتف المخصصة.'
      });
    }

    const clientPhone = normalizePhone(value.phone);

    if (!clientPhone) {
      return res.status(400).json({
        message: 'رقم هاتف العميل غير صحيح'
      });
    }

    const address = String(value.address || '').trim();
    // المنطقة حقل مستقل يظهر للفني قبل قبول الطلب؛ العنوان التفصيلي يظل محميًا حتى القبول.
    const area = String(value.area || '').trim();

    if (area.length < 2 || area.length > 100) {
      return res.status(400).json({
        message: 'اكتب المنطقة أو الحي بشكل صحيح'
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

    const textDescription = String(value.description || value.desc || '').trim();
    const voiceRecordingData = String(value.voiceRecordingData || '').trim();
    if (textDescription.length < 10 && !voiceRecordingData) return res.status(400).json({ message: 'اكتب وصف المشكلة أو سجّل فويس يوضح المشكلة قبل إرسال الطلب.' });
    const safeDescription = sanitizeText(textDescription);

    const safeClientName = sanitizeText(
      String(value.clientName || 'عميل').trim()
    );

    let order = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        order = await Order.create({
          sn: generateSN(),
          clientAccount: req.clientId,
          service: value.service,
          area,
          address,
          clientName: safeClientName || 'عميل',
          clientPhone,
          budget: value.budget || '',
          description: safeDescription,
          ...(voiceRecordingData ? { voiceRecordingData } : {}),
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

    await notifyAdmins({ type: 'admin_new_order', title: 'طلب جديد يحتاج مراجعة', message: `وصل طلب جديد ${order.sn} لخدمة ${order.service}.`, link: '/admin?tab=orders', dedupeKey: 'admin-new-order:' + String(order._id) });
    await createNotification({
      recipientRole: 'client', recipientId: order.clientAccount, type: 'order_created',
      title: 'تم استلام طلبك', message: 'استلمنا طلبك ' + order.sn + ' وسيتم مراجعته من الإدارة.',
      link: '/?tab=orders', dedupeKey: 'order-created:' + String(order._id)
    });

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

router.post('/admin/:sn/publish', auth('admin'), async (req, res, next) => {
  try {
    // auth('admin') enforces the dedicated publishOrders permission for this route.
    const sn = String(req.params.sn || '').toUpperCase();

    if (!validSN(sn)) {
      return res.status(400).json({
        message: 'كود الطلب غير صحيح'
      });
    }

    const order = await Order.findOneAndUpdate(
      { sn, status: 'قيد المراجعة' },
      {
        $set: {
          status: 'تم النشر',
          expiresAt: new Date(
            Date.now() + ORDER_EXPIRY_HOURS * 60 * 60 * 1000
          )
        }
      },
      { new: true, runValidators: true }
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

    // Notify every approved technician whose specialties match; work area is informational only.
    const eligibleFannis = await Fanni.find({ role: 'fanni', status: 'معتمد' }).select('_id specialties').lean();
    for (const fanni of eligibleFannis) {
      if (fanniCanHandleService(fanni.specialties, order.service)) {
        await createNotification({
          recipientRole: 'fanni', recipientId: fanni._id, type: 'new_opportunity',
          title: 'فرصة عمل جديدة', message: 'طلب جديد يناسب تخصصك في ' + order.area + ' (' + order.service + ').',
          link: '/fanni', dedupeKey: 'new-opportunity:' + String(order._id) + ':' + String(fanni._id)
        });
      }
    }

    const safeOrder = publicOrder(order);

    return res.json({
      message: 'تم نشر الطلب للفنيين المعتمدين بنجاح',
      order: safeOrder,
      data: safeOrder
    });
  } catch (err) {
    next(err);
  }
});

/*
 * الطلبات المتاحة:
 * - الإدارة يمكنها الاطلاع على كل الطلبات النشطة.
 * - الفني المعتمد يرى الطلبات التي تطابق تخصصاته فقط.
 * - بيانات العميل الشخصية لا تُرسل في هذه المرحلة.
 */
async function hasAcceptedGuidelines(fanniId) {
  const fanni = await Fanni.findOne({ _id: fanniId, role: 'fanni', status: 'معتمد' }).select('technicianGuidelinesAcceptedAt technicianGuidelinesVersion').lean();
  return Boolean(fanni?.technicianGuidelinesAcceptedAt && fanni?.technicianGuidelinesVersion);
}
function hasContactDetails(text) { return containsEgyptianMobile(String(text || '')) || /(?:https?:\/\/|www\.|t\.me\/|wa\.me\/|bit\.ly\/)/i.test(String(text || '')); }

router.get('/available', auth(), async (req, res, next) => {
  try {
    let specialties = [];

    if (req.user.role !== 'admin') {
      if (
        req.user.role !== 'fanni' ||
        req.user.status !== 'معتمد'
      ) {
        return res.status(403).json({
          message: 'حساب الفني لم يتم اعتماده بعد'
        });
      }

      const fanni = await Fanni.findOne({
        _id: req.userId,
        role: 'fanni',
        status: 'معتمد'
      }).select('specialties technicianGuidelinesAcceptedAt technicianGuidelinesVersion').lean();
      if (!fanni?.technicianGuidelinesAcceptedAt || !fanni?.technicianGuidelinesVersion) return res.status(428).json({ code: 'TECHNICIAN_GUIDELINES_REQUIRED', message: 'يجب الموافقة على ميثاق التعامل المهني أولًا.' });

      if (!fanni) {
        return res.status(403).json({
          message: 'حساب الفني غير موجود أو غير معتمد'
        });
      }

      specialties = Array.isArray(fanni.specialties)
        ? fanni.specialties
        : [];

      if (specialties.length === 0) {
        return res.json({ orders: [], data: [] });
      }
    }

    const orders = await Order.find({
      status: { $in: ACTIVE_STATUSES },
      expiresAt: { $gt: new Date() }
    })
      .select('-phone -address -clientName +voiceRecordingData')
      .sort({ createdAt: -1 })
      .lean();

    let matchingOrders = orders;

    if (req.user.role !== 'admin') {
      matchingOrders = orders.filter(order =>
        fanniCanHandleService(specialties, order.service)
      );
    }

    if (req.user.role === 'fanni') {
      const blockedRatings = await Rating.find({
        fanniId: req.userId,
        blockFuture: true
      }).select('clientPhone').lean();
      const blockedPhones = new Set(
        blockedRatings.map(item => normalizePhone(item.clientPhone)).filter(Boolean)
      );
      matchingOrders = matchingOrders.filter(order =>
        !blockedPhones.has(normalizePhone(order.clientPhone))
      );
      // Also hide this technician from customers who blocked them.
      const clientBlocks = await Rating.find({
        reviewerRole: 'client',
        fanniId: req.userId,
        blockFuture: true
      }).select('clientPhone').lean();
      const clientBlockedPhones = new Set(
        clientBlocks.map(item => normalizePhone(item.clientPhone)).filter(Boolean)
      );
      matchingOrders = matchingOrders.filter(order =>
        !clientBlockedPhones.has(normalizePhone(order.clientPhone))
      );
    }

    let clientRatingsByPhone = new Map();
    let clientCompletedByPhone = new Map();
    if (req.user.role === 'fanni' && matchingOrders.length) {
      const phones = [...new Set(matchingOrders.map(order => normalizePhone(order.clientPhone || '')).filter(Boolean))];
      if (phones.length) {
        const [ratingStats, completedStats] = await Promise.all([
          Rating.aggregate([
            { $match: { clientPhone: { $in: phones }, reviewerRole: 'fanni' } },
            { $group: { _id: '$clientPhone', average: { $avg: '$stars' }, count: { $sum: 1 } } }
          ]),
          Order.aggregate([
            { $match: { clientPhone: { $in: phones }, status: 'تم الانتهاء' } },
            { $group: { _id: '$clientPhone', count: { $sum: 1 } } }
          ])
        ]);
        clientRatingsByPhone = new Map(ratingStats.map(item => [normalizePhone(item._id || ''), item]));
        clientCompletedByPhone = new Map(completedStats.map(item => [normalizePhone(item._id || ''), item.count]));
      }
    }
    const safeOrders = matchingOrders.map(order => {
      const safeOrder = publicOrder(order, {
        includeAddress: false,
        includeClientName: false
      });
      if (req.user.role === 'fanni') {
        const phone = normalizePhone(order.clientPhone || '');
        const rating = clientRatingsByPhone.get(phone);
        safeOrder.clientRatingAverage = rating ? Math.round(Number(rating.average || 0) * 100) / 100 : 0;
        safeOrder.clientRatingCount = rating?.count || 0;
        safeOrder.clientCompletedJobs = clientCompletedByPhone.get(phone) || 0;
      }
      return safeOrder;
    });

    return res.json({
      orders: safeOrders,
      data: safeOrders
    });
  } catch (err) {
    next(err);
  }
});

router.get('/my-offers', auth(), async (req, res, next) => {
  try {
    if (req.user.role !== 'fanni') {
      return res.status(403).json({
        message: 'هذه الخدمة متاحة لحسابات الفنيين فقط'
      });
    }
    if (!(await hasAcceptedGuidelines(req.userId))) return res.status(428).json({ code: 'TECHNICIAN_GUIDELINES_REQUIRED', message: 'يجب الموافقة على ميثاق التعامل المهني أولًا.' });

    const orders = await Order.find({
      'offers.fanni': req.userId
    })
      .select(
        'sn service area address clientName clientPhone description budget status offers assignedFanni acceptedOfferId acceptedOfferPrice commissionRate commissionAmount commissionCharged chatMessages priceChangeRequests'
      )
      .lean();

    const offers = [];

    for (const order of orders) {
      for (const offer of order.offers || []) {
        if (String(offer.fanni) !== String(req.userId)) continue;

        const isAssignedToThisFanni =
          String(order.assignedFanni || '') === String(req.userId) &&
          String(order.acceptedOfferId || '') === String(offer._id);

        const isCompletedByThisFanni =
          order.status === 'تم الانتهاء' &&
          isAssignedToThisFanni;

        const isAcceptedByThisFanni =
          isAssignedToThisFanni &&
          ['تم اختيار فني', 'تم الانتهاء'].includes(order.status);

        const safeOffer = {
          ...sanitizeOffer(offer),
          orderSn: order.sn,
          orderStatus: order.status,
          chatMessages: (order.chatMessages || []).filter(m => isAcceptedByThisFanni ? String(m.targetOfferId || '') === String(order.acceptedOfferId || '') : String(m.targetOfferId || '') === String(offer._id)).map(m => ({ senderRole: m.senderRole, text: m.text, targetOfferId: m.targetOfferId || '', createdAt: m.createdAt })),
          service: order.service,
          accepted: isAcceptedByThisFanni,
          completed: isCompletedByThisFanni
        };

        if (isCompletedByThisFanni) {
          const ratings = await Rating.find({ orderId: order._id }).sort({ createdAt: 1 }).lean();
          safeOffer.ratings = publicRatings(ratings);
          safeOffer.myRating = publicRatings(
            ratings.filter(rating => rating.reviewerRole === 'fanni')
          )[0] || null;
        }

        if (isAcceptedByThisFanni) {
          const clientPhone = normalizePhone(order.clientPhone || '');
          const [clientRatingStats, clientCompletedJobs] = clientPhone ? await Promise.all([
            Rating.aggregate([
              { $match: { clientPhone, reviewerRole: 'fanni' } },
              { $group: { _id: null, average: { $avg: '$stars' }, count: { $sum: 1 } } }
            ]),
            Order.countDocuments({ clientPhone, status: 'تم الانتهاء' })
          ]) : [[], 0];
          const clientRating = clientRatingStats[0] || { average: 0, count: 0 };
          safeOffer.client = {
            name: sanitizeText(order.clientName || ''),
            area: order.area || '',
            address: order.address || '',
            description: sanitizeText(order.description || ''),
            budget: order.budget || '',
            acceptedOfferPrice: order.acceptedOfferPrice,
            commissionAmount: order.commissionAmount,
            commissionCharged: Boolean(order.commissionCharged),
            ratingAverage: Math.round(Number(clientRating.average || 0) * 100) / 100,
            ratingCount: Number(clientRating.count || 0),
            completedJobs: Number(clientCompletedJobs || 0)
          };
          if (!isCompletedByThisFanni) safeOffer.client.phone = order.clientPhone || '';
        }

        offers.push(safeOffer);
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

router.post('/:sn/offer', auth(), async (req, res, next) => {
  try {
    if (req.user.role !== 'fanni') {
      return res.status(403).json({
        message: 'تقديم العروض متاح للفنيين فقط'
      });
    }

    if (req.user.status !== 'معتمد') {
      return res.status(403).json({
        message: 'حساب الفني لم يتم اعتماده بعد'
      });
    }
    if (!(await hasAcceptedGuidelines(req.userId))) return res.status(428).json({ code: 'TECHNICIAN_GUIDELINES_REQUIRED', message: 'يجب الموافقة على ميثاق التعامل المهني أولًا.' });

    const sn = String(req.params.sn || '').toUpperCase();

    if (!validSN(sn)) {
      return res.status(400).json({
        message: 'كود الطلب غير صحيح'
      });
    }

    const activeTask = await Order.exists({ assignedFanni: req.userId, status: 'تم اختيار فني' });
    if (activeTask) {
      return res.status(409).json({ message: 'لديك مهمة جارية حاليًا. برجاء إنهاء المهمة الحالية أولًا قبل التقدم لأي طلب جديد.' });
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

    const phoneInMessage = findPhoneContainingField({
      message: result.value.message
    });

    if (phoneInMessage) {
      return res.status(400).json({
        message: 'ممنوع كتابة رقم موبايل داخل رسالة العرض.'
      });
    }

    const price = money(result.value.price);
    const pricing = await currentPricing();
    if (price < Number(pricing.minOffer || 1) || price > Number(pricing.maxOffer || 1000000)) {
      return res.status(400).json({ message: `سعر العرض يجب أن يكون بين ${Number(pricing.minOffer || 1)} و${Number(pricing.maxOffer || 1000000)} جنيه` });
    }
    const commissionRate = Number.isFinite(Number(pricing.commission)) ? Number(pricing.commission) : DEFAULT_COMMISSION_RATE;
    const commissionAmount = money(price * commissionRate / 100);

    if (
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(commissionAmount) ||
      commissionAmount < 0
    ) {
      return res.status(400).json({
        message: 'سعر العرض غير صالح'
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

    /*
     * فحص التخصص هنا ضروري أيضًا:
     * لا نعتمد على إخفاء الطلب من الواجهة فقط،
     * لأن الفني قد يحاول إرسال عرض باستخدام رقم الطلب مباشرة.
     */
    const fanni = await Fanni.findOne({
      _id: req.userId,
      role: 'fanni',
      status: 'معتمد'
    }).select('specialties walletBalance level isFrozen limits badges isVerified isFeatured featuredUntil');

    if (!fanni) {
      return res.status(403).json({
        message: 'حساب الفني غير موجود أو غير معتمد'
      });
    }

    if (fanni.isFrozen === true) {
      return res.status(403).json({ message: 'محفظتك مجمدة مؤقتًا؛ تواصل مع الإدارة قبل تقديم عروض جديدة' });
    }
    if (fanni.limits?.isLimited === true) {
      return res.status(403).json({ message: 'حسابك عليه حدود استقبال تمنع تقديم عروض جديدة حاليًا' });
    }

    if (!fanniCanHandleService(fanni.specialties, order.service)) {
      return res.status(403).json({
        message: 'هذا الطلب خارج تخصصات حسابك المعتمدة'
      });
    }

    if (await hasRatingBlock({ clientPhone: order.clientPhone, fanniId: req.userId })) {
      return res.status(403).json({
        message: 'لا يمكنك تقديم عرض على هذا الطلب بناءً على إعدادات التقييم السابقة'
      });
    }

    const clientBlockedThisFanni = await Rating.exists({
      reviewerRole: 'client',
      fanniId: req.userId,
      clientPhone: normalizePhone(order.clientPhone),
      blockFuture: true
    });
    if (clientBlockedThisFanni) {
      return res.status(403).json({
        message: 'هذا العميل طلب عدم إظهار طلباته لك'
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

    const maxActiveOffers = Number.isInteger(Number(fanni.limits?.maxOffers)) ? Number(fanni.limits.maxOffers) : 50;
    if (maxActiveOffers <= 0) return res.status(403).json({ message: 'حد العروض النشطة المسموح به لحسابك يساوي صفرًا. راجع الإدارة.' });
    const activeOfferCount = await Order.countDocuments({ status: { $in: ACTIVE_STATUSES }, offers: { $elemMatch: { fanni: req.userId } } });
    if (activeOfferCount >= maxActiveOffers) return res.status(429).json({ message: `وصلت إلى الحد الأقصى للعروض النشطة (${maxActiveOffers}). انتظر انتهاء عرض قائم أو تواصل مع الإدارة.` });

    const dailyOfferLimit = Number.isInteger(Number(fanni.limits?.dailyLimit)) ? Number(fanni.limits.dailyLimit) : 10;
    if (dailyOfferLimit <= 0) return res.status(403).json({ message: 'حد العروض خلال آخر 24 ساعة يساوي صفرًا. راجع الإدارة.' });
    const sinceLast24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const offersLast24Hours = await Order.countDocuments({ offers: { $elemMatch: { fanni: req.userId, date: { $gte: sinceLast24Hours } } } });
    if (offersLast24Hours >= dailyOfferLimit) return res.status(429).json({ message: `وصلت إلى الحد الأقصى للعروض خلال آخر 24 ساعة (${dailyOfferLimit}). حاول لاحقًا.` });

    const walletBalance = Number(fanni.walletBalance || 0);

    if (
      !Number.isFinite(walletBalance) ||
      walletBalance < commissionAmount
    ) {
      return res.status(409).json({
        message: 'رصيد محفظتك لا يكفي لعمولة 10% من قيمة هذا العرض',
        offerPrice: price,
        requiredCommission: commissionAmount,
        walletBalance: Number.isFinite(walletBalance)
          ? walletBalance
          : 0
      });
    }

    const offerCreatedAt = new Date();
    const offerBadges = new Set(Array.isArray(fanni.badges) ? fanni.badges : []);
    if (fanni.isVerified === true) offerBadges.add('verified');
    if (fanni.isFeatured === true && (!fanni.featuredUntil || new Date(fanni.featuredUntil) > offerCreatedAt)) offerBadges.add('premium');
    const offerPayload = {
      fanni: req.userId,
      fanniId: String(req.userId),
      fanniName: req.user.name,
      fanniLevel: fanni.level || 'مبتدئ',
      fanniBadges: Array.from(offerBadges),
      fanniPhone: req.user.phone,
      price: String(price),
      priceNum: price,
      message: sanitizeText(result.value.message)
    };

    // Make the "one offer per technician per order" rule atomic. A read/check
    // followed by order.save() can race when two requests arrive together.
    const updatedOrder = await Order.findOneAndUpdate(
      {
        _id: order._id,
        status: { $in: ACTIVE_STATUSES },
        'offers.fanni': { $ne: req.userId },
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: offerCreatedAt } }
        ]
      },
      {
        $push: { offers: offerPayload },
        $set: { status: 'وصلتك عروض' }
      },
      { new: true, runValidators: true }
    );

    if (!updatedOrder) {
      const latestOrder = await Order.findById(order._id).select('status expiresAt offers.fanni').lean();
      if (latestOrder?.offers?.some(offer => String(offer.fanni) === String(req.userId))) {
        return res.status(409).json({ message: 'سبق أن أرسلت عرضًا لهذا الطلب' });
      }
      if (!latestOrder || !ACTIVE_STATUSES.includes(latestOrder.status)) {
        return res.status(409).json({ message: 'الطلب غير منشور أو لم يعد متاحًا للعروض' });
      }
      if (latestOrder.expiresAt && latestOrder.expiresAt <= new Date()) {
        return res.status(409).json({ message: 'انتهت مدة استقبال العروض لهذا الطلب' });
      }
      return res.status(409).json({ message: 'تعذر تسجيل العرض بسبب تحديث متزامن. حدّث الطلب وحاول مرة أخرى.' });
    }

    await createNotification({
      recipientRole: 'client', recipientId: order.clientAccount, type: 'new_offer',
      title: 'وصلك عرض جديد', message: 'فني أرسل عرضًا على طلبك ' + order.sn + '. افتح طلباتي لمراجعته.',
      link: '/?tab=orders', dedupeKey: 'new-offer:' + String(order._id) + ':' + String(req.userId)
    });

    return res.status(201).json({
      message: 'تم إرسال العرض بنجاح. لم يتم خصم أي مبلغ من محفظتك.',
      orderSn: order.sn,
      requiredCommission: commissionAmount,
      walletBalance,
      offers: updatedOrder.offers.map(offer => {
        const safeOffer =
          typeof offer.toObject === 'function'
            ? offer.toObject()
            : { ...offer };

        delete safeOffer.fanniPhone;
        delete safeOffer.phone;

        if (typeof safeOffer.message === 'string') {
          safeOffer.message = sanitizeText(safeOffer.message);
        }

        return safeOffer;
      })
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:sn/accept', async (req, res, next) => {
  let session;
  let responsePayload = null;
  let responseStatus = 200;
  let notificationFanniId = null;
  let notificationClientId = null;
  let notificationOrderId = null;

  try {
    session = await mongoose.startSession();

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

    const pricing = await currentPricing();
    const commissionRate = Number.isFinite(Number(pricing.commission)) ? Number(pricing.commission) : DEFAULT_COMMISSION_RATE;
    const commissionAmount = money(price * commissionRate / 100);

    if (
      !Number.isFinite(commissionAmount) ||
      commissionAmount < 0
    ) {
      await session.abortTransaction();
      return res.status(400).json({
        message: 'تعذر حساب عمولة الطلب بشكل صحيح'
      });
    }

    const fanniId = offer.fanni;

    const fanniBefore = await Fanni.findOne({
      _id: fanniId,
      role: 'fanni',
      status: 'معتمد',
      isFrozen: { $ne: true }
    }).session(session);

    if (!fanniBefore) {
      await session.abortTransaction();
      return res.status(409).json({
        message: 'الفني صاحب العرض لم يعد حسابه معتمدًا'
      });
    }

    const balanceBefore = Number(fanniBefore.walletBalance || 0);

    if (
      !Number.isFinite(balanceBefore) ||
      balanceBefore < commissionAmount
    ) {
      await session.abortTransaction();
      return res.status(409).json({
        message: 'رصيد محفظة الفني غير كافٍ لسداد عمولة المنصة',
        requiredCommission: commissionAmount,
        walletBalance: Number.isFinite(balanceBefore)
          ? balanceBefore
          : 0
      });
    }

    const fanniAfter = await Fanni.findOneAndUpdate(
      {
        _id: fanniId,
        role: 'fanni',
        status: 'معتمد',
        isFrozen: { $ne: true },
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

    const updatedOrder = await Order.findById(order._id).session(session);

    if (!updatedOrder) {
      throw new Error('ORDER_NOT_FOUND_AFTER_UPDATE');
    }

    notificationFanniId = fanniId;
    notificationClientId = updatedOrder.clientAccount || null;
    notificationOrderId = updatedOrder._id;

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

    await session.commitTransaction();
  } catch (err) {
    if (session && session.inTransaction()) {
      try {
        await session.abortTransaction();
      } catch (abortError) {}
    }

    if (err && err.code === 11000) {
      responseStatus = 409;
      responsePayload = {
        message: 'توجد حركة مالية مسجلة لهذا الطلب بالفعل؛ لم يتم تكرار الخصم'
      };
    } else {
      return next(err);
    }
  } finally {
    if (session) await session.endSession();
  }

  if (responsePayload && responseStatus === 200 && responsePayload.order) {
    const acceptedOrder = responsePayload.order;
    await createNotification({
      recipientRole: 'fanni',
      recipientId: notificationFanniId,
      type: 'commission_deducted',
      title: 'تم خصم عمولة المنصة',
      message: 'تم خصم عمولة قدرها ' + Number(responsePayload.commission?.amount || 0) + ' جنيه (' + Number(responsePayload.commission?.rate || 0) + '%) من محفظتك عند قبول الطلب ' + acceptedOrder.sn + '.',
      link: '/fanni',
      dedupeKey: 'commission-deducted:' + String(notificationOrderId || acceptedOrder.sn)
    });
    await createNotification({
      recipientRole: 'fanni', recipientId: notificationFanniId, type: 'offer_accepted',
      title: 'تم قبول عرضك', message: 'العميل قبل عرضك على الطلب ' + acceptedOrder.sn + '.',
      link: '/fanni', dedupeKey: 'offer-accepted:' + String(notificationOrderId || acceptedOrder.sn)
    });
    const clientAccountId = notificationClientId;
    if (clientAccountId) {
      await createNotification({
        recipientRole: 'client', recipientId: clientAccountId, type: 'offer_accepted',
        title: 'تم اختيار الفني', message: 'تم قبول العرض على طلبك ' + acceptedOrder.sn + '.',
        link: '/?tab=orders', dedupeKey: 'client-offer-accepted:' + String(notificationOrderId || acceptedOrder.sn)
      });
    }
  }

  if (responsePayload) {
    return res.status(responseStatus).json(responsePayload);
  }

  return res.status(500).json({
    message: 'تعذر إكمال عملية قبول العرض'
  });
});

router.post('/:sn/cancel', async (req, res, next) => {
  try {
    const sn = String(req.params.sn || '').toUpperCase();
    if (!validSN(sn)) return res.status(400).json({ message: 'كود الطلب غير صحيح.' });

    const order = await Order.findOne({ sn });
    if (!order) return res.status(404).json({ message: 'الطلب غير موجود.' });
    if (!verifyClientToken(req, order)) {
      return res.status(403).json({ message: 'لا يمكن إلغاء طلب لا يخص حسابك.' });
    }
    if (order.assignedFanni || ['تم اختيار فني', 'تم الانتهاء'].includes(order.status)) {
      return res.status(409).json({ message: 'لا يمكن إلغاء الطلب بعد اختيار الفني. تواصل مع الإدارة للمساعدة.' });
    }
    if (['ملغي', 'مؤرشف', 'منتهي', 'منتهي - اعتذار'].includes(order.status)) {
      return res.status(409).json({ message: 'الطلب ملغي أو مغلق بالفعل.' });
    }

    order.status = 'ملغي';
    await order.save();

    if (order.clientAccount) {
      await createNotification({
        recipientRole: 'client',
        recipientId: order.clientAccount,
        type: 'order_cancelled',
        title: 'تم إلغاء الطلب',
        message: 'تم إلغاء طلبك ' + order.sn + ' بناءً على طلبك.',
        link: '/?tab=orders',
        dedupeKey: 'client-order-cancelled:' + String(order._id)
      });
    }

    return res.json({ message: 'تم إلغاء الطلب بنجاح.', order: publicOrder(order) });
  } catch (err) {
    next(err);
  }
});

router.post('/:sn/complete', auth(), async (req, res, next) => {
  try {
    if (req.user.role !== 'fanni') {
      return res.status(403).json({
        message: 'إكمال المهمة متاح للفني المعيّن فقط'
      });
    }
    if (!(await hasAcceptedGuidelines(req.userId))) return res.status(428).json({ code: 'TECHNICIAN_GUIDELINES_REQUIRED', message: 'يجب الموافقة على ميثاق التعامل المهني أولًا.' });

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
        message:
          existing.status === 'تم الانتهاء'
            ? 'المهمة مكتملة بالفعل'
            : 'حالة الطلب لا تسمح بإكمال المهمة'
      });
    }

    // لا يتم احتساب المهمة إلا بعد انتقال الطلب بنجاح إلى حالة مكتملة.
    await Fanni.updateOne(
      { _id: req.userId, role: 'fanni' },
      { $inc: { 'stats.completedJobs': 1 } }
    );
    await autoPromoteFanni(req.userId, 'إكمال المهمة ' + order.sn);
    await createNotification({
      recipientRole: 'client',
      recipientId: order.clientAccount,
      type: 'order_completed',
      title: 'الفني أنهى المهمة',
      message: 'تم تسجيل اكتمال الطلب ' + order.sn + '. افتح الطلب لتقييم الفني.',
      link: '/?tab=orders',
      dedupeKey: 'order-completed:' + String(order._id)
    });

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
      order.status !== 'تم اختيار فني' ||
      !order.assignedFanni ||
      String(order.assignedFanni) !== String(req.userId) ||
      req.user.role !== 'fanni'
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
        clientName: sanitizeText(order.clientName || ''),
        clientPhone: order.clientPhone,
        description: sanitizeText(order.description || ''),
        hasVoiceRecording: Boolean(order.voiceRecordingData),
        budget: order.budget || '',
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


router.post('/:sn/rating', async (req, res, next) => {
  try {
    const sn = String(req.params.sn || '').toUpperCase();
    if (!validSN(sn)) {
      return res.status(400).json({ message: 'كود الطلب غير صحيح' });
    }

    const schema = Joi.object({
      stars: Joi.number().integer().min(1).max(5).required(),
      comment: Joi.string().trim().max(500).allow('').default(''),
      blockFuture: Joi.boolean().default(false),
      clientToken: Joi.string().allow('').optional()
    }).unknown(false);
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false });
    if (error) {
      return res.status(400).json({ message: 'اختار تقييمًا من نجمة إلى 5 نجوم، والتعليق اختياري بحد أقصى 500 حرف' });
    }
    if (value.blockFuture && value.stars !== 1) {
      return res.status(400).json({ message: 'إيقاف التعامل متاح فقط مع تقييم نجمة واحدة' });
    }

    const order = await Order.findOne({ sn });
    if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
    if (order.status !== 'تم الانتهاء' || !order.assignedFanni) {
      return res.status(409).json({ message: 'التقييم متاح بعد إكمال المهمة فعليًا فقط' });
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : String(value.clientToken || '');
    let reviewerRole = '';
    let reviewerId = null;

    if (verifyClientToken({ ...req, body: { ...(req.body || {}), clientToken: token }, headers: {} }, order)) {
      reviewerRole = 'client';
    } else {
      if (!token || !process.env.JWT_SECRET) {
        return res.status(401).json({ message: 'تعذر التحقق من ملكية الطلب أو حساب الفني' });
      }
      let payload;
      try { payload = jwt.verify(token, process.env.JWT_SECRET); }
      catch { return res.status(401).json({ message: 'جلسة غير صالحة أو منتهية' }); }
      if (!payload.id) {
        return res.status(403).json({ message: 'هذه الجلسة لا تسمح بتقييم المهمة' });
      }
      const fanni = await Fanni.findById(payload.id).select('_id role status name');
      if (!fanni || fanni.role !== 'fanni' || fanni.status !== 'معتمد' ||
          String(fanni._id) !== String(order.assignedFanni)) {
        return res.status(403).json({ message: 'التقييم متاح للفني المعيّن على هذه المهمة فقط' });
      }
      reviewerRole = 'fanni';
      reviewerId = fanni._id;
    }

    const existingRating = await Rating.exists({ orderId: order._id, reviewerRole });
    if (existingRating) {
      return res.status(409).json({ message: 'سبق أن قيّمت هذه المهمة' });
    }

    const rating = await Rating.create({
      orderId: order._id,
      orderSn: order.sn,
      clientPhone: normalizePhone(order.clientPhone),
      fanniId: order.assignedFanni,
      reviewerRole,
      reviewerId,
      stars: value.stars,
      comment: sanitizeText(value.comment || ''),
      blockFuture: Boolean(value.blockFuture)
    });

    if (reviewerRole === 'client') {
      const aggregate = await Rating.aggregate([
        { $match: { fanniId: order.assignedFanni, reviewerRole: 'client' } },
        { $group: { _id: null, average: { $avg: '$stars' }, count: { $sum: 1 } } }
      ]);
      const stats = aggregate[0] || { average: 0, count: 0 };
      await Fanni.updateOne(
        { _id: order.assignedFanni },
        { $set: { 'rating.average': Math.round(stats.average * 100) / 100, 'rating.count': stats.count } }
      );
      await autoPromoteFanni(order.assignedFanni, 'تحديث تقييمات العملاء');
    }

    await createNotification({
      recipientRole: reviewerRole === 'client' ? 'fanni' : 'client',
      recipientId: reviewerRole === 'client' ? order.assignedFanni : order.clientAccount,
      type: 'order_rated',
      title: reviewerRole === 'client' ? 'وصلك تقييم جديد' : 'قيّمك الفني',
      message: (reviewerRole === 'client' ? 'قيّمك العميل' : 'قيّمك الفني') + ' في الطلب ' + order.sn + ' (' + value.stars + '/5 نجوم).',
      link: reviewerRole === 'client' ? '/fanni' : '/?tab=orders',
      dedupeKey: 'order-rating:' + String(order._id) + ':' + reviewerRole
    });

    return res.status(201).json({
      message: 'تم حفظ تقييمك بنجاح، وأصبح ظاهرًا للطرفين',
      rating: {
        reviewerRole: rating.reviewerRole,
        stars: rating.stars,
        comment: rating.comment,
        blockFuture: rating.blockFuture,
        createdAt: rating.createdAt
      }
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'سبق أن قيّمت هذه المهمة' });
    }
    next(err);
  }
});

router.get('/:sn/chat', async (req, res, next) => {
  try {
    const sn = String(req.params.sn || '').toUpperCase();
    if (!validSN(sn)) return res.status(400).json({ message: 'كود الطلب غير صحيح' });
    const order = await Order.findOne({ sn });
    if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
    const isClient = verifyClientToken(req, order);
    const token = String(req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : '';
    let fanniId = null;
    if (token && process.env.JWT_SECRET) { try { const payload = jwt.verify(token, process.env.JWT_SECRET); if (payload.id) fanniId = payload.id; } catch (_) {} }
    const technicianOffer = fanniId && (order.offers || []).find(o => String(o.fanni) === String(fanniId));
    if (!isClient && !technicianOffer) return res.status(403).json({ message: 'غير مسموح بعرض محادثة هذا الطلب.' });
    if (!isClient && !(await hasAcceptedGuidelines(fanniId))) return res.status(428).json({ code: 'TECHNICIAN_GUIDELINES_REQUIRED', message: 'يجب الموافقة على ميثاق التعامل المهني أولًا.' });
    const accepted = ['تم اختيار فني', 'تم الانتهاء'].includes(order.status);
    if (!isClient && accepted && String(order.assignedFanni || '') !== String(fanniId)) return res.status(403).json({ message: 'المحادثة بعد القبول متاحة للفني المعيّن فقط.' });
    const requestedOfferId = String(req.query?.offerId || '').trim();
    const visibleMessages = (order.chatMessages || []).filter(m => {
      if (accepted) return isClient ? (!m.targetOfferId || String(m.targetOfferId) === String(order.acceptedOfferId || '')) : String(m.targetOfferId || '') === String(order.acceptedOfferId || '');
      if (isClient) return Boolean(m.targetOfferId) && (!requestedOfferId || String(m.targetOfferId) === requestedOfferId);
      return String(m.targetOfferId || '') === String(technicianOffer._id);
    }).map(m => ({ senderRole: m.senderRole, text: m.text, targetOfferId: m.targetOfferId || '', createdAt: m.createdAt }));
    return res.json({ messages: visibleMessages, priceChangeRequests: accepted ? (order.priceChangeRequests || []) : [] });
  } catch (err) { next(err); }
});
router.post('/:sn/chat', async (req, res, next) => {
  try {
    const sn = String(req.params.sn || '').toUpperCase();
    if (!validSN(sn)) return res.status(400).json({ message: 'كود الطلب غير صحيح' });
    const text = String(req.body?.text || req.body?.reply || '').trim().slice(0, 1000);
    if (!text) return res.status(400).json({ message: 'اكتب الرسالة أولًا.' });
    if (hasContactDetails(text)) return res.status(400).json({ message: 'ممنوع تبادل أرقام الهاتف أو الروابط داخل المحادثة.' });
    const order = await Order.findOne({ sn });
    if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
    const isClient = verifyClientToken(req, order);
    const token = String(req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : '';
    let payload = null;
    if (token && process.env.JWT_SECRET) { try { payload = jwt.verify(token, process.env.JWT_SECRET); } catch (_) {} }
    const fanniId = payload?.id;
    const ownOffer = fanniId && (order.offers || []).find(o => String(o.fanni) === String(fanniId));
    if (!isClient && !ownOffer) return res.status(403).json({ message: 'غير مسموح بإرسال رسالة لهذا الطلب.' });
    if (!isClient && !(await hasAcceptedGuidelines(fanniId))) return res.status(428).json({ code: 'TECHNICIAN_GUIDELINES_REQUIRED', message: 'يجب الموافقة على ميثاق التعامل المهني أولًا.' });
    if (order.status === 'تم الانتهاء') return res.status(409).json({ message: 'المهمة مكتملة؛ المحادثة للقراءة فقط.' });
    const accepted = order.status === 'تم اختيار فني';
    const targetOfferId = String(req.body?.offerId || (accepted ? order.acceptedOfferId || '' : '')).trim();
    if (accepted) {
      if (!order.acceptedOfferId || targetOfferId !== String(order.acceptedOfferId)) return res.status(409).json({ message: 'المحادثة متاحة للعرض المقبول فقط.' });
      if (!isClient && String(order.assignedFanni || '') !== String(fanniId || '')) return res.status(403).json({ message: 'المحادثة بعد القبول متاحة للفني المعيّن فقط.' });
    } else {
      if (!ACTIVE_STATUSES.includes(order.status)) return res.status(409).json({ message: 'المحادثة غير متاحة في حالة الطلب الحالية.' });
      if (!mongoose.isValidObjectId(targetOfferId)) return res.status(400).json({ message: 'حدد العرض الذي تخصه المحادثة.' });
      const targetOffer = (order.offers || []).find(o => String(o._id) === targetOfferId);
      if (!targetOffer) return res.status(404).json({ message: 'العرض غير موجود في هذا الطلب.' });
      if (!isClient && String(targetOffer.fanni) !== String(fanniId)) return res.status(403).json({ message: 'لا يمكنك الرد إلا على استفسارات العرض الخاص بك.' });
      if (isClient && !['هل السعر شامل؟', 'متى تقدر تيجي؟', 'هل في تكلفة إضافية؟'].includes(text)) return res.status(400).json({ message: 'قبل قبول العرض، استخدم أحد أزرار الاستفسارات السريعة.' });
      if (!isClient && !['نعم', 'لا', 'حسب الاتفاق'].includes(text)) return res.status(400).json({ message: 'قبل قبول العرض، ردود الفني المسموحة فقط: نعم، لا، حسب الاتفاق.' });
    }
    order.chatMessages.push({ senderRole: isClient ? 'client' : 'fanni', senderId: isClient ? String(order.clientAccount || order._id) : String(fanniId), targetOfferId, text, createdAt: new Date() });
    await order.save();

    // Notify the other participant for every newly sent order-chat message.
    // Before acceptance, a client message is routed only to the technician who owns that offer.
    const targetOffer = (order.offers || []).find(o => String(o._id) === targetOfferId);
    const recipientRole = isClient ? 'fanni' : 'client';
    const recipientId = isClient
      ? (accepted ? order.assignedFanni : targetOffer?.fanni)
      : order.clientAccount;
    if (recipientId) {
      await createNotification({
        recipientRole,
        recipientId,
        type: 'order_message',
        title: isClient ? 'رسالة جديدة من العميل' : 'رسالة جديدة من الفني',
        message: 'طلب ' + order.sn + ': ' + text.slice(0, 140),
        link: '/?tab=orders'
      });
    }

    return res.status(201).json({ message: 'تم إرسال الرسالة.', messages: order.chatMessages.filter(m => accepted ? (!m.targetOfferId || String(m.targetOfferId) === targetOfferId) : String(m.targetOfferId || '') === targetOfferId) });
  } catch (err) { next(err); }
});
router.post('/:sn/price-change', auth(), async (req, res, next) => {
  try {
    if (req.user.role !== 'fanni') return res.status(403).json({ message: 'طلب تعديل السعر متاح للفني المعيّن فقط.' });
    if (!(await hasAcceptedGuidelines(req.userId))) return res.status(428).json({ code: 'TECHNICIAN_GUIDELINES_REQUIRED', message: 'يجب الموافقة على ميثاق التعامل المهني أولًا.' });
    const sn = String(req.params.sn || '').toUpperCase(), newPrice = money(req.body?.newPrice), reason = String(req.body?.reason || '').trim().slice(0, 500);
    if (!validSN(sn) || !Number.isFinite(newPrice) || newPrice <= 0 || reason.length < 5) return res.status(400).json({ message: 'اكتب سعرًا جديدًا صحيحًا وسببًا واضحًا للتعديل.' });
    const order = await Order.findOne({ sn }); if (!order) return res.status(404).json({ message: 'الطلب غير موجود.' });
    if (order.status !== 'تم اختيار فني' || String(order.assignedFanni) !== String(req.userId) || !order.acceptedOfferPrice) return res.status(409).json({ message: 'لا يمكن طلب تعديل السعر إلا للطلب المسند إليك قبل إنهائه.' });
    const currentPrice = money(order.acceptedOfferPrice);
    if (newPrice <= currentPrice) return res.status(400).json({ message: 'السعر الجديد لازم يكون أعلى من السعر الحالي (' + currentPrice + ' جنيه). لا يمكن تخفيض السعر بعد قبول العرض.' });
    if ((order.priceChangeRequests || []).some(r => r.status === 'قيد الموافقة')) return res.status(409).json({ message: 'يوجد طلب تعديل سعر ينتظر موافقة العميل بالفعل.' });
    order.priceChangeRequests.push({ fanniId: req.userId, oldPrice: order.acceptedOfferPrice, newPrice, reason, status: 'قيد الموافقة', requestedAt: new Date() }); await order.save();
    await createNotification({
      recipientRole: 'client',
      recipientId: order.clientAccount,
      type: 'price_change_requested',
      title: 'الفني طلب زيادة السعر',
      message: 'طلب الفني تعديل سعر الطلب ' + order.sn + ' من ' + currentPrice + ' إلى ' + newPrice + ' جنيه. راجع السبب ووافق أو ارفض من المحادثة.',
      link: '/?tab=orders',
      dedupeKey: 'price-change-request:' + String(order._id) + ':' + String(order.priceChangeRequests[order.priceChangeRequests.length - 1]._id)
    });
    return res.status(201).json({ message: 'تم إرسال طلب تعديل السعر للعميل؛ لا تنفذ الزيادة قبل موافقته.', request: order.priceChangeRequests[order.priceChangeRequests.length - 1] });
  } catch (err) { next(err); }
});
router.post('/:sn/price-change/:requestId/decision', async (req, res, next) => {
  let session;
  try {
    const sn = String(req.params.sn || '').toUpperCase();
    if (!validSN(sn)) return res.status(400).json({ message: 'كود الطلب غير صحيح.' });
    session = await mongoose.startSession();
    await session.startTransaction();
    const order = await Order.findOne({ sn }).session(session);
    if (!order) { await session.abortTransaction(); return res.status(404).json({ message: 'الطلب غير موجود.' }); }
    if (!verifyClientToken(req, order)) { await session.abortTransaction(); return res.status(403).json({ message: 'غير مسموح بتعديل سعر هذا الطلب.' }); }
    if (order.status === 'تم الانتهاء') { await session.abortTransaction(); return res.status(409).json({ message: 'المهمة مكتملة؛ لا يمكن اتخاذ قرار جديد بشأن تعديل السعر.' }); }
    const request = order.priceChangeRequests.id(req.params.requestId);
    if (!request || request.status !== 'قيد الموافقة') { await session.abortTransaction(); return res.status(409).json({ message: 'طلب تعديل السعر غير متاح أو تم اتخاذ قرار بشأنه.' }); }
    const approved = req.body?.approved === true;
    if (approved) {
      if (!order.commissionCharged || !order.acceptedOfferPrice || !request.fanniId) { await session.abortTransaction(); return res.status(409).json({ message: 'تعذر اعتماد تعديل السعر قبل تثبيت العرض والعمولة.' }); }
      const rate = Number.isFinite(Number(order.commissionRate)) ? Number(order.commissionRate) : DEFAULT_COMMISSION_RATE;
      const oldCommission = money(Number(order.commissionAmount || 0));
      const newCommission = money(Number(request.newPrice) * rate / 100);
      const delta = money(newCommission - oldCommission);
      const fanni = await Fanni.findOne({ _id: request.fanniId, role: 'fanni' }).session(session);
      if (!fanni) { await session.abortTransaction(); return res.status(409).json({ message: 'تعذر العثور على محفظة الفني لتنفيذ تسوية العمولة.' }); }
      const balanceBefore = Number(fanni.walletBalance || 0);
      if (!Number.isFinite(balanceBefore) || balanceBefore < 0 || (delta > 0 && balanceBefore < delta)) { await session.abortTransaction(); return res.status(409).json({ message: 'رصيد الفني لا يكفي لتسوية عمولة السعر الجديد؛ لم يتم اعتماد التعديل.' }); }
      let balanceAfter = balanceBefore;
      if (delta !== 0) {
        const updatedFanni = await Fanni.findOneAndUpdate(
          { _id: fanni._id, role: 'fanni', ...(delta > 0 ? { walletBalance: { $gte: delta } } : {}) },
          { $inc: { walletBalance: -delta } },
          { new: true, session, runValidators: true }
        );
        if (!updatedFanni) { await session.abortTransaction(); return res.status(409).json({ message: 'تغير رصيد الفني؛ لم يتم اعتماد تعديل السعر.' }); }
        balanceAfter = Number(updatedFanni.walletBalance);
        const transaction = new WalletTransaction({
          fanni: fanni._id, order: order._id, orderSN: order.sn, type: 'commission',
          amount: -delta, balanceBefore, balanceAfter,
          description: 'تسوية عمولة بعد موافقة العميل على تعديل سعر الطلب ' + order.sn,
          idempotencyKey: 'commission-adjustment:' + String(order._id) + ':' + String(request._id)
        });
        await transaction.save({ session });
      }
      order.acceptedOfferPrice = Number(request.newPrice);
      order.commissionAmount = newCommission;
      order.commissionRate = rate;
    }
    request.status = approved ? 'مقبول' : 'مرفوض';
    request.decidedAt = new Date();
    request.decidedByRole = 'client';
    order.chatMessages.push({
      senderRole: 'client',
      senderId: String(order.clientAccount || order._id),
      targetOfferId: String(order.acceptedOfferId || ''),
      text: approved
        ? 'وافقت على زيادة العرض إلى ' + Number(request.newPrice) + ' جنيه.'
        : 'رفضت زيادة العرض؛ السعر السابق ' + Number(request.oldPrice) + ' جنيه ما زال ساريًا.',
      createdAt: new Date()
    });
    await order.save({ session });
    await session.commitTransaction();
    await createNotification({
      recipientRole: 'fanni',
      recipientId: request.fanniId,
      type: approved ? 'price_change_approved' : 'price_change_rejected',
      title: approved ? 'وافق العميل على زيادة السعر' : 'رفض العميل زيادة السعر',
      message: approved
        ? 'وافق العميل على تعديل سعر الطلب ' + order.sn + ' إلى ' + order.acceptedOfferPrice + ' جنيه.'
        : 'رفض العميل تعديل سعر الطلب ' + order.sn + '. يظل السعر السابق ساريًا.',
      link: '/fanni',
      dedupeKey: 'price-change-decision:' + String(order._id) + ':' + String(request._id)
    });
    return res.json({ message: approved ? 'تمت الموافقة على السعر الجديد وتسجيل تسوية العمولة.' : 'تم رفض تعديل السعر؛ يظل السعر السابق ساريًا.', acceptedOfferPrice: order.acceptedOfferPrice, commissionAmount: order.commissionAmount, commissionRate: order.commissionRate, request });
  } catch (err) {
    if (session && session.inTransaction()) { try { await session.abortTransaction(); } catch (_) {} }
    if (err && err.code === 11000) return res.status(409).json({ message: 'تمت معالجة تسوية العمولة بالفعل.' });
    next(err);
  } finally {
    if (session) await session.endSession();
  }
});

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
    if (!isOrderOwner) {
      return res.status(403).json({ message: 'سجّل الدخول بحسابك لمتابعة الطلب؛ رقم الطلب وحده لا يكفي لعرض بياناته.' });
    }

    // ملء مستوى وشارات الفني للعروض القديمة دون كشف رقم الهاتف أو بيانات الحساب.
    const fanniIds = [...new Set((order.offers || []).map(offer => String(offer.fanni || '')).filter(Boolean))];
    if (fanniIds.length) {
      const objectIds = fanniIds.filter(mongoose.isValidObjectId).map(id => new mongoose.Types.ObjectId(id));
      const [fannis, ratingStats, completedStats] = await Promise.all([
        Fanni.find({ _id: { $in: objectIds } }).select('_id level badges').lean(),
        Rating.aggregate([
          { $match: { fanniId: { $in: objectIds }, reviewerRole: 'client' } },
          { $group: { _id: '$fanniId', average: { $avg: '$stars' }, count: { $sum: 1 } } }
        ]),
        Order.aggregate([
          { $match: { assignedFanni: { $in: objectIds }, status: 'تم الانتهاء' } },
          { $group: { _id: '$assignedFanni', count: { $sum: 1 } } }
        ])
      ]);
      const fannisById = new Map(fannis.map(fanni => [String(fanni._id), fanni]));
      const ratingsById = new Map(ratingStats.map(item => [String(item._id), item]));
      const completedById = new Map(completedStats.map(item => [String(item._id), item.count]));
      for (const offer of order.offers || []) {
        const id = String(offer.fanni || '');
        const fanni = fannisById.get(id);
        const rating = ratingsById.get(id);
        offer.fanniLevel = fanni?.level || offer.fanniLevel || 'مبتدئ';
        offer.fanniBadges = Array.isArray(fanni?.badges) ? fanni.badges : (offer.fanniBadges || []);
        offer.fanniRatingAverage = rating ? Math.round(rating.average * 100) / 100 : 0;
        offer.fanniRatingCount = rating?.count || 0;
        offer.fanniCompletedJobs = completedById.get(id) || 0;
      }
    }

    const safe = publicOrder(order, {
      includeAddress: isOrderOwner,
      includeAssignedFanniPhone: isOrderOwner
    });
    safe.acceptedOfferId = order.acceptedOfferId ? String(order.acceptedOfferId) : null;
    safe.acceptedOfferPrice = order.acceptedOfferPrice ?? null;
    safe.commissionRate = order.commissionRate ?? null;
    safe.commissionAmount = order.commissionAmount ?? null;
    if (Array.isArray(safe.offers) && order.acceptedOfferId && ['تم اختيار فني', 'تم الانتهاء'].includes(order.status)) safe.offers = safe.offers.map(offer => ({ ...offer, offerStatus: String(offer._id) === String(order.acceptedOfferId) ? 'تم قبول العرض' : 'تم رفض العرض' }));
    safe.chatMessages = (order.chatMessages || []).map(m => ({ senderRole: m.senderRole, text: m.text, targetOfferId: m.targetOfferId || '', createdAt: m.createdAt }));
    safe.priceChangeRequests = (order.priceChangeRequests || []).map(r => ({ _id: String(r._id), oldPrice: r.oldPrice, newPrice: r.newPrice, reason: r.reason, status: r.status, requestedAt: r.requestedAt, decidedAt: r.decidedAt }));

    if (isOrderOwner && order.status === 'تم الانتهاء') {
      const ratings = await Rating.find({ orderId: order._id }).sort({ createdAt: 1 }).lean();
      safe.ratings = publicRatings(ratings);
      safe.myRating = publicRatings(ratings.filter(rating => rating.reviewerRole === 'client'))[0] || null;
      safe.canRate = !safe.myRating;
      safe.acceptedOfferPrice = order.acceptedOfferPrice ?? null;
      safe.assignedFanniName = order.assignedFanniName || safe.assignedFanniName || '';
    }

    return res.json({
      order: safe,
      data: safe
    });
  } catch (err) {
    next(err);
  }
}

router.get('/:sn/voice', auth(), async (req,res,next)=>{try{const sn=String(req.params.sn||'').toUpperCase();if(!validSN(sn))return res.status(400).json({message:'كود الطلب غير صحيح'});const order=await Order.findOne({sn}).select('+voiceRecordingData status service assignedFanni expiresAt').lean();if(!order||!order.voiceRecordingData)return res.status(404).json({message:'لا يوجد تسجيل صوتي لهذا الطلب.'});let permitted=req.user?.role==='admin';if(!permitted&&req.user?.role==='fanni'&&req.user?.status==='معتمد'){const fanni=await Fanni.findOne({_id:req.userId,role:'fanni',status:'معتمد'}).select('specialties technicianGuidelinesAcceptedAt technicianGuidelinesVersion').lean();const assigned=order.status==='تم اختيار فني'&&String(order.assignedFanni)===String(req.userId);const available=ACTIVE_STATUSES.includes(order.status)&&order.expiresAt&&new Date(order.expiresAt)>new Date()&&fanni?.technicianGuidelinesAcceptedAt&&fanni?.technicianGuidelinesVersion&&fanniCanHandleService(fanni?.specialties||[],order.service);permitted=Boolean(assigned||available)}if(!permitted)return res.status(403).json({message:'التسجيل الصوتي غير متاح لهذا الحساب.'});const match=/^data:(audio\/(?:webm|ogg|mp4|mpeg|wav)(?:;codecs=[a-zA-Z0-9.-]+)?);base64,([A-Za-z0-9+/]+={0,2})$/.exec(order.voiceRecordingData);if(!match)return res.status(415).json({message:'صيغة التسجيل الصوتي غير مدعومة.'});const audio=Buffer.from(match[2],'base64');res.set('Content-Type',match[1].split(';')[0]);res.set('Content-Length',String(audio.length));res.set('Cache-Control','private, no-store');return res.send(audio)}catch(err){return next(err)}});
router.get('/by-sn/:sn', trackOrder);
router.get('/:sn', trackOrder);

module.exports = router;