'use strict';

const express = require('express');
const Joi = require('joi');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const Order = require('../models/Order');
const { createNotification } = require('../utils/notifications');
const Fanni = require('../models/Fanni');
const Rating = require('../models/Rating');
const WalletTransaction = require('../models/WalletTransaction');
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
const COMMISSION_RATE = 10;

/*
 * أسماء المناطق التي تستخدمها واجهة العميل،
 * مع الاحتفاظ بالأسماء القديمة المقبولة سابقًا.
 */
const { AREA_OPTIONS, ALL_AREAS_LABEL, normalizeArea } = require('../config/areas');

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
    data.offers = data.offers.map(sanitizeOffer);
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
  area: Joi.string().trim().min(2).max(60).required(),
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

    const area = String(value.area || '').trim();
    const address = String(value.address || '').trim();

    if (!AREA_OPTIONS.includes(area)) {
      return res.status(400).json({
        message: 'اختار المنطقة من القائمة المتاحة'
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

    const safeDescription = sanitizeText(
      String(value.description || '').trim()
    );

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

    // Notify only approved technicians whose specialties and service areas match.
    const eligibleFannis = await Fanni.find({ role: 'fanni', status: 'معتمد' }).select('_id specialties areas').lean();
    for (const fanni of eligibleFannis) {
      const coversAllAreas = (fanni.areas || []).some(area => normalizeArea(area) === normalizeArea(ALL_AREAS_LABEL));
      const areas = new Set((fanni.areas || []).map(normalizeArea));
      if (fanniCanHandleService(fanni.specialties, order.service) &&
          (coversAllAreas || areas.has(normalizeArea(order.area)))) {
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
      }).select('specialties').lean();

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
      .select('-phone -address -clientName')
      .sort({ createdAt: -1 })
      .lean();

    let matchingOrders = orders;

    if (req.user.role !== 'admin') {
      const fanni = await Fanni.findById(req.userId).select('specialties areas').lean();
      const specialties = Array.isArray(fanni?.specialties) ? fanni.specialties : [];
      const areas = Array.isArray(fanni?.areas) ? fanni.areas : [];
      const coversAllAreas = areas.some(area => normalizeArea(area) === normalizeArea(ALL_AREAS_LABEL));
      const normalizedAreas = new Set(areas.map(normalizeArea));

      matchingOrders = orders.filter(order =>
        fanniCanHandleService(specialties, order.service) &&
        (coversAllAreas || normalizedAreas.has(normalizeArea(order.area)))
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

    const safeOrders = matchingOrders.map(order =>
      publicOrder(order, {
        includeAddress: false,
        includeClientName: false
      })
    );

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

    const orders = await Order.find({
      'offers.fanni': req.userId
    })
      .select(
        'sn service area address clientName clientPhone description budget status offers assignedFanni acceptedOfferId acceptedOfferPrice commissionAmount commissionCharged'
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
          safeOffer.client = {
            name: sanitizeText(order.clientName || ''),
            area: order.area || '',
            address: order.address || '',
            description: sanitizeText(order.description || ''),
            budget: order.budget || '',
            acceptedOfferPrice: order.acceptedOfferPrice,
            commissionAmount: order.commissionAmount,
            commissionCharged: Boolean(order.commissionCharged)
          };

          if (!isCompletedByThisFanni) {
            safeOffer.client.phone = order.clientPhone || '';
          }
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

    const phoneInMessage = findPhoneContainingField({
      message: result.value.message
    });

    if (phoneInMessage) {
      return res.status(400).json({
        message: 'ممنوع كتابة رقم موبايل داخل رسالة العرض.'
      });
    }

    const price = money(result.value.price);
    const commissionAmount = money(price * COMMISSION_RATE / 100);

    if (
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(commissionAmount) ||
      commissionAmount <= 0
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
    }).select('specialties walletBalance level');

    if (!fanni) {
      return res.status(403).json({
        message: 'حساب الفني غير موجود أو غير معتمد'
      });
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

    order.offers.push({
      fanni: req.userId,
      fanniId: String(req.userId),
      fanniName: req.user.name,
      fanniLevel: fanni.level || 'مبتدئ',
      fanniBadges: Array.isArray(fanni.badges) ? fanni.badges : [],
      fanniPhone: req.user.phone,
      price: String(price),
      priceNum: price,
      message: sanitizeText(result.value.message)
    });

    order.status = 'وصلتك عروض';
    await order.save();

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
      offers: order.offers.map(offer => {
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

    const commissionRate = COMMISSION_RATE;
    const commissionAmount = money(price * commissionRate / 100);

    if (
      !Number.isFinite(commissionAmount) ||
      commissionAmount <= 0
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
      status: 'معتمد'
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

  if (responsePayload) {
    return res.status(responseStatus).json(responsePayload);
  }

  return res.status(500).json({
    message: 'تعذر إكمال عملية قبول العرض'
  });
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
      const fannis = await Fanni.find({ _id: { $in: fanniIds } }).select('_id level badges').lean();
      const fannisById = new Map(fannis.map(fanni => [String(fanni._id), fanni]));
      for (const offer of order.offers || []) {
        const fanni = fannisById.get(String(offer.fanni || ''));
        offer.fanniLevel = fanni?.level || offer.fanniLevel || 'مبتدئ';
        offer.fanniBadges = Array.isArray(fanni?.badges) ? fanni.badges : (offer.fanniBadges || []);
      }
    }

    const safe = publicOrder(order, {
      includeAddress: isOrderOwner,
      includeAssignedFanniPhone: isOrderOwner
    });

    if (isOrderOwner && order.status === 'تم الانتهاء') {
      const ratings = await Rating.find({ orderId: order._id }).sort({ createdAt: 1 }).lean();
      safe.ratings = publicRatings(ratings);
      safe.myRating = publicRatings(ratings.filter(rating => rating.reviewerRole === 'client'))[0] || null;
      safe.canRate = !safe.myRating;
    }

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