'use strict';

const express = require('express');
const mongoose = require('mongoose');
const Complaint = require('../models/Complaint');
const Order = require('../models/Order');

const router = express.Router();

function normalizeDigits(value) {
  return String(value || '')
    .replace(/[٠-٩]/g, digit =>
      String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
    )
    .replace(/[۰-۹]/g, digit =>
      String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))
    );
}

function containsPhoneNumber(value) {
  const normalized = normalizeDigits(value);
  const chunks = normalized.match(
    /\d(?:[\s().+\-_/\\،,؛:]*\d){8,15}/g
  ) || [];

  return chunks.some(chunk => {
    const digits = chunk.replace(/\D/g, '');

    return /01[0125]\d{8}/.test(digits)
      || /201[0125]\d{8}/.test(digits)
      || /00201[0125]\d{8}/.test(digits);
  });
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

// توحيد الاسم لتقليل اختلافات الكتابة والمسافات والتشكيل.
function normalizeName(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// GET /api/complaints/track
// متابعة شكوى باستخدام كود الطلب والاسم المسجل.
// لا يتم إرسال الملاحظات الداخلية للأدمن للعميل.
router.get('/track', async (req, res) => {
  try {
    const sn = cleanText(req.query?.sn, 20).toUpperCase();
    const submittedName = cleanText(req.query?.clientName, 50);

    if (!/^SN\d{6}$/.test(sn)) {
      return res.status(400).json({
        ok: false,
        message: 'كود الطلب غير صحيح.'
      });
    }

    if (submittedName.length < 2 || containsPhoneNumber(submittedName)) {
      return res.status(400).json({
        ok: false,
        message: 'اكتب الاسم المسجل مع الطلب بشكل صحيح.'
      });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        ok: false,
        message: 'خدمة متابعة الشكاوى غير متاحة مؤقتًا. حاول مرة أخرى.'
      });
    }

    const order = await Order.findOne({ sn })
      .select('_id sn clientName')
      .lean();

    if (!order) {
      return res.status(404).json({
        ok: false,
        message: 'كود الطلب غير موجود. راجعه وحاول مرة أخرى.'
      });
    }

    const registeredName = cleanText(order.clientName, 50);

    if (
      registeredName.length < 2
      || normalizeName(registeredName) === normalizeName('عميل')
    ) {
      return res.status(400).json({
        ok: false,
        message: 'بيانات اسم صاحب الطلب غير مكتملة. تواصل مع الإدارة للمساعدة.'
      });
    }

    if (normalizeName(submittedName) !== normalizeName(registeredName)) {
      return res.status(403).json({
        ok: false,
        message: 'الاسم غير مطابق للاسم المسجل مع الطلب.'
      });
    }

    const complaints = await Complaint.find({
      sn,
      clientName: registeredName
    })
      .select('sn status adminResponse createdAt updatedAt reviewedAt')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    if (!complaints.length) {
      return res.status(404).json({
        ok: false,
        message: 'لم يتم العثور على شكوى لهذا الطلب.'
      });
    }

    return res.json({
      ok: true,
      complaints: complaints.map(complaint => ({
        sn: complaint.sn,
        status: complaint.status || 'جديدة',
        adminResponse: complaint.adminResponse || '',
        createdAt: complaint.createdAt || null,
        updatedAt: complaint.updatedAt || complaint.createdAt || null,
        reviewedAt: complaint.reviewedAt || null
      }))
    });
  } catch (error) {
    console.error('Track complaint error:', error);

    return res.status(500).json({
      ok: false,
      message: 'تعذر متابعة الشكوى حاليًا. حاول مرة أخرى.'
    });
  }
});

// POST /api/complaints
// إرسال شكوى مرتبطة بطلب موجود.
router.post('/', async (req, res) => {
  try {
    const sn = cleanText(req.body?.sn, 20).toUpperCase();
    const submittedName = cleanText(req.body?.clientName, 50);
    const complaintText = cleanText(
      req.body?.text ?? req.body?.complaintText,
      1000
    );

    if (!/^SN\d{6}$/.test(sn)) {
      return res.status(400).json({
        ok: false,
        message: 'كود الطلب غير صحيح.'
      });
    }

    if (
      submittedName.length < 2
      || containsPhoneNumber(submittedName)
    ) {
      return res.status(400).json({
        ok: false,
        message: 'اكتب اسم العميل بشكل صحيح، بدون أرقام تليفونات.'
      });
    }

    if (
      complaintText.length < 10
      || containsPhoneNumber(complaintText)
    ) {
      return res.status(400).json({
        ok: false,
        message: 'اكتب تفاصيل الشكوى من 10 أحرف على الأقل، بدون أرقام تليفونات.'
      });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        ok: false,
        message: 'الخدمة غير متاحة مؤقتًا. حاول مرة أخرى.'
      });
    }

    const order = await Order.findOne({ sn })
      .select('_id sn clientName')
      .lean();

    if (!order) {
      return res.status(404).json({
        ok: false,
        message: 'كود الطلب غير موجود. راجعه وحاول مرة أخرى.'
      });
    }

    const registeredName = cleanText(order.clientName, 50);

    if (
      registeredName.length < 2
      || normalizeName(registeredName) === normalizeName('عميل')
    ) {
      return res.status(400).json({
        ok: false,
        message: 'بيانات اسم صاحب الطلب غير مكتملة. تواصل مع الإدارة للمساعدة.'
      });
    }

    if (normalizeName(submittedName) !== normalizeName(registeredName)) {
      return res.status(403).json({
        ok: false,
        message: 'اسم العميل غير مطابق للاسم المسجل مع الطلب.'
      });
    }

    const complaint = await Complaint.create({
      order: order._id,
      sn: order.sn,
      clientName: registeredName,
      text: complaintText
    });

    return res.status(201).json({
      ok: true,
      message: 'تم إرسال الشكوى بنجاح.',
      complaint: {
        id: complaint._id,
        sn: complaint.sn,
        clientName: complaint.clientName,
        text: complaint.text,
        status: complaint.status,
        createdAt: complaint.createdAt
      }
    });
  } catch (error) {
    console.error('Create complaint error:', error);

    return res.status(500).json({
      ok: false,
      message: 'حصل خطأ أثناء إرسال الشكوى. حاول مرة أخرى.'
    });
  }
});

module.exports = router;