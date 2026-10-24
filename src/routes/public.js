
'use strict';

const express = require('express');
const Settings = require('../models/Settings');
const AdminConfig = require('../models/AdminConfig');
const Service = require('../models/Service');
const Fanni = require('../models/Fanni');
const Region = require('../models/Region');
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
    const [technicians, adminRegions] = await Promise.all([
      Fanni.find({ status: 'معتمد', role: 'fanni' }).select('areas').lean(),
      Region.find({ isActive: true }).select('name').lean()
    ]);
    const byNormalizedName = new Map();
    for (const area of AREA_OPTIONS) byNormalizedName.set(normalizeArea(area), area);
    for (const item of adminRegions) {
      const area = String(item.name || '').trim().normalize('NFC').replace(/\s+/g, ' ');
      const key = normalizeArea(area);
      if (area.length >= 2 && area.length <= 100 && key !== normalizeArea(ALL_AREAS_LABEL) && !byNormalizedName.has(key)) byNormalizedName.set(key, area);
    }
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
    for (const [categoryIndex, category] of CATEGORIES.entries()) {
      const categoryKey = normalize(category.label);

      categoriesMap.set(categoryKey, {
        label: category.label,
        emoji: category.emoji,
        categorySortOrder: (categoryIndex + 1) * 10,
        services: []
      });

      for (const [index, name] of category.services.entries()) {
        categoriesMap.get(categoryKey).services.push({ name, emoji: category.emoji, isActive: true, source: 'legacy', sortOrder: (index + 1) * 10 });
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
          categorySortOrder: Number.isFinite(Number(saved.categorySortOrder)) && Number(saved.categorySortOrder) > 0 ? Number(saved.categorySortOrder) : 100000,
          services: []
        });
      }

      const category = categoriesMap.get(categoryKey);
      if (Number.isFinite(Number(saved.categorySortOrder)) && Number(saved.categorySortOrder) > 0) category.categorySortOrder = Number(saved.categorySortOrder);

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
          sortOrder: Number.isFinite(Number(saved.sortOrder)) ? Number(saved.sortOrder) : 0
        });
      }
    }

    const categories = Array.from(categoriesMap.values())
      .sort((a, b) => a.categorySortOrder - b.categorySortOrder || a.label.localeCompare(b.label, 'ar'))
      .map(category => {
        category.services.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ar'));
        return { label: category.label, emoji: category.emoji, services: category.services.map(item => item.name) };
      })
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
    const config = await AdminConfig.findOne({ key: 'main' }).select('content settings.siteName settings.maintenance settings.maintenanceMessage').lean();
    const content = config?.content || { announcement: '', faqs: [] };
    return res.set('Cache-Control', 'no-store').json({
      siteName: String(config?.settings?.siteName || 'صُنّاع'),
      maintenance: Boolean(config?.settings?.maintenance),
      maintenanceMessage: String(config?.settings?.maintenanceMessage || ''),
      announcement: String(content.announcement || ''),
      faqs: (Array.isArray(content.faqs) ? content.faqs : []).filter(item => item.active !== false).map(item => ({
        question: String(item.question || ''),
        answer: String(item.answer || '')
      }))
    });
  } catch (err) { next(err); }
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
