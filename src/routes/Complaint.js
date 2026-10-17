
'use strict';

const express = require('express');
const mongoose = require('mongoose');
const Complaint = require('../models/Complaint');
const Order = require('../models/Order');

const router = express.Router();

function normalizeDigits(value) {
  return String(value || '')
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

function containsPhoneNumber(value) {
  const normalized = normalizeDigits(value);
  const chunks = normalized.match(
    /\d(?:[\s().+\-_/\\،,؛:]*\d){9,15}/g
  ) || [];

  return chunks.some(chunk => {
    const digits = chunk.replace(/\D/g, '');
    return /01[0125]\d{8}/.test(digits)
      || /201[0125]\d{8}/.test(digits)
      || /00201[0125]\d{8}/.test(digits);
  });
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

// إرسال شكوى باستخدام كود الطلب واسم العميل وتفاصيل الشكوى.
router.post('/', async (req, res) => {
  try {
    const sn = cleanText(req.body?.sn, 20).toUpperCase();
    const clientName = cleanText(req.body?.clientName, 50);
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

    if (clientName.length < 2 || containsPhoneNumber(clientName)) {
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

    const order = await Order.findOne({ sn }).select('_id sn clientName');

    if (!order) {
      return res.status(404).json({
        ok: false,
        message: 'كود الطلب غير موجود. راجعه وحاول مرة أخرى.'
      });
    }

    // لا نعرض بيانات الطلب؛ نحفظ الشكوى فقط.
    const complaint = await Complaint.create({
      order: order._id,
      sn: order.sn,
      clientName,
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
