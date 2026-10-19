
'use strict';

const express = require('express');
const Settings = require('../models/Settings');
const AdminConfig = require('../models/AdminConfig');
const Service = require('../models/Service');
const Fanni = require('../models/Fanni');
const { AREA_OPTIONS, ALL_AREAS_LABEL, normalizeArea } = require('../config/areas');

const {
  CATEGORIES,
  ALL_SERVICES,
  normalizeServiceName
} = require('../config/professions');

const router = express.Router();

function normalize(value) {
  return String(value || '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '');
}


/* القائمة الموحدة لمناطق الخدمة: القائمة الأساسية + المناطق التي يضيفها الفنيون المعتمدون. */
router.get('/areas', async (req, res, next) => {
  try {
    const technicians = await Fanni.find({ status: 'معتمد', role: 'fanni' }).select('areas').lean();
    const byNormalizedName = new Map();
    for (const area of AREA_OPTIONS) byNormalizedName.set(normalizeArea(area), area);
    for (const technician of technicians) {
      for (const rawArea of Array.isArray(technician.areas) ? technician.areas : []) {
        const area = String(rawArea || '').trim().normalize('NFC').replace(/\s+/g, ' ');
        const key = normalizeArea(area);
        if (area.length >= 2 && area.length <= 60 && key !== normalizeArea(ALL_AREAS_LABEL) && !byNormalizedName.has(key)) byNormalizedName.set(key, area);
      }
    }
    return res.json({ ok: true, areas: Array.from(byNormalizedName.values()).sort((a, b) => a.localeCompare(b, 'ar')) });
  } catch (err) { next(err); }
});

/*
 * GET /api/services
 * القائمة الموحدة للخدمات القديمة والجديدة.
 */
router.get('/services', async (req, res, next) => {
  try {
    const savedServices = await Service.find({})
      .select('+normalizedName +normalizedCategory')
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    const categoriesMap = new Map();

    // نبدأ بالخدمات الحالية حتى لا نفقد القائمة الموجودة.
    for (const category of CATEGORIES) {
      const categoryKey = normalize(category.label);

      categoriesMap.set(categoryKey, {
        label: category.label,
        emoji: category.emoji,
        services: []
      });

      for (const name of category.services) {
        categoriesMap.get(categoryKey).services.push({
          name,
          emoji: category.emoji,
          isActive: true,
          source: 'legacy'
        });
      }
    }

    // سجلات قاعدة البيانات تتحكم في الإضافة والتعديل والإخفاء.
    for (const saved of savedServices) {
      const categoryKey = normalize(saved.category);
      const serviceKey = normalize(saved.name);

      if (!categoriesMap.has(categoryKey)) {
        categoriesMap.set(categoryKey, {
          label: saved.category,
          emoji: saved.emoji || '🔧',
          services: []
        });
      }

      const category = categoriesMap.get(categoryKey);

      // إذا كانت الخدمة موجودة من القائمة القديمة، نستبدلها بسجل DB.
      const existingIndex = category.services.findIndex(
        item => normalize(item.name) === serviceKey
      );

      if (existingIndex !== -1) {
        category.services.splice(existingIndex, 1);
      }

      // الخدمة المخفية لا تظهر في القائمة العامة.
      if (saved.isActive) {
        category.services.push({
          name: saved.name,
          emoji: saved.emoji || category.emoji || '🔧',
          isActive: true,
          source: 'database',
          sortOrder: saved.sortOrder || 0
        });
      }
    }

    const categories = Array.from(categoriesMap.values())
      .map(category => ({
        label: category.label,
        emoji: category.emoji,
        services: category.services.map(item => item.name)
      }))
      .filter(category => category.services.length > 0);

    const services = [
      ...new Set(categories.flatMap(category => category.services))
    ];

    return res.json({
      ok: true,
      categories,
      services
    });
  } catch (err) {
    next(err);
  }
});

router.get('/content', async (req, res, next) => {
  try {
    const config = await AdminConfig.findOne({ key: 'main' }).select('content settings.siteName').lean();
    const content = config?.content || { announcement: '', faqs: [] };
    return res.set('Cache-Control', 'no-store').json({
      siteName: String(config?.settings?.siteName || 'صُنّاع'),
      announcement: String(content.announcement || ''),
      faqs: (Array.isArray(content.faqs) ? content.faqs : []).filter(item => item.active !== false).map(item => ({
        question: String(item.question || ''),
        answer: String(item.answer || '')
      }))
    });
  } catch (err) { next(err); }
});

/*
 * GET /api/vodafone-cash
 */
router.get('/vodafone-cash', async (req, res, next) => {
  try {
    const setting = await Settings.findOne({
      key: 'vodafone_cash_number'
    });

    return res.json({
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
 */
router.get('/health', (req, res) => {
  return res.json({
    ok: true,
    time: new Date().toISOString()
  });
});

module.exports = router;
