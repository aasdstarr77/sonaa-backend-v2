
'use strict';

const express = require('express');
const Settings = require('../models/Settings');
const {
  CATEGORIES,
  ALL_SERVICES
} = require('../config/professions');

const router = express.Router();

/*
 * GET /api/services
 *
 * المصدر الموحد لأقسام الخدمات والخدمات المتاحة
 * لصفحة العميل وصفحة الفني وأي واجهة تحتاج القائمة.
 */
router.get('/services', (req, res) => {
  const categories = CATEGORIES.map(category => ({
    label: category.label,
    emoji: category.emoji,
    services: [...category.services]
  }));

  res.json({
    ok: true,
    categories,
    services: [...ALL_SERVICES]
  });
});

/*
 * GET /api/vodafone-cash
 *
 * رقم فودافون كاش المخصص لاستقبال التحويلات.
 */
router.get('/vodafone-cash', async (req, res, next) => {
  try {
    const setting = await Settings.findOne({
      key: 'vodafone_cash_number'
    });

    res.json({
      number: setting
        ? setting.value
        : process.env.VODAFONE_CASH_NUMBER
    });
  } catch (err) {
    next(err);
  }
});

/*
 * GET /api/health
 *
 * فحص بسيط لمسار الخدمات العامة.
 */
router.get('/health', (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString()
  });
});

module.exports = router;
