
'use strict';

const express = require('express');
const Settings = require('../models/Settings');
const AdminConfig = require('../models/AdminConfig');
const Service = require('../models/Service');
const Fanni = require('../models/Fanni');
const Region = require('../models/Region');
const { AREA_OPTIONS, normalizeArea, getEffectiveAreaOptions } = require('../config/areas');

const {
  CATEGORIES,
  ALL_SERVICES,
  normalizeServiceName
} = require('../config/professions');

const router = express.Router();

// Publicly expose only the two transfer numbers needed by technician wallets.
router.get('/wallet-settings', async (req, res, next) => {
  try {
    const config = await AdminConfig.findOne({ key: 'main' }).select('settings.walletPhone1 settings.walletPhone2').lean();
    res.set('Cache-Control', 'no-store');
    return res.json({
      walletPhone1: String(config?.settings?.walletPhone1 || '').trim(),
      walletPhone2: String(config?.settings?.walletPhone2 || '').trim()
    });
  } catch (err) { next(err); }
});

function normalize(value) {
  return String(value || '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/ريسيفر/g, 'رسيفر');
}

function normalizeBrokenWallScreenServiceName(value) {
  return normalize(value)
    .replace(/^[^ء-ي]+/, '')
    .replace(/ة/g, 'ه');
}

const BROKEN_WALL_SCREEN_SERVICE_NAMES = [
  normalizeBrokenWallScreenServiceName('تعليق شاشة حائط'),
  normalizeBrokenWallScreenServiceName('تركيب شاشة حائط')
];

function isBrokenWallScreenService(value) {
  return BROKEN_WALL_SCREEN_SERVICE_NAMES.includes(normalizeBrokenWallScreenServiceName(value));
}


/* قائمة مناطق الخدمة المعتمدة: القائمة الأساسية + المناطق النشطة التي تعتمدها الإدارة. */
router.get('/areas', async (req, res, next) => {
  try {
    const adminRegions=await Region.find({}).select('name isActive isDeleted isBase').lean();
    return res.set('Cache-Control','no-store').json({ok:true,areas:getEffectiveAreaOptions(adminRegions)});
  } catch (err) { next(err); }
});

/*
 * GET /api/services
 * القائمة الموحدة للخدمات القديمة والجديدة.
 */
router.get('/services', async (req, res, next) => {
  try {
    const [savedServices, approvedTechnicians, allRegions] = await Promise.all([
      Service.find({}).select('+normalizedName +normalizedCategory').sort({ sortOrder: 1, name: 1 }).lean(),
      Fanni.find({ status: 'معتمد', role: 'fanni' }).select('specialties areas').lean(),
      Region.find({}).select('name isActive isDeleted isBase').lean()
    ]);
    const technicianCounts = new Map();
    const normalizedSpecialties = approvedTechnicians.map(technician =>
      new Set((Array.isArray(technician.specialties) ? technician.specialties : []).map(normalize).filter(Boolean))
    );
    for (const specialties of normalizedSpecialties) {
      for (const specialty of specialties) technicianCounts.set(specialty, (technicianCounts.get(specialty) || 0) + 1);
    }
    const activeAreaNames = getEffectiveAreaOptions(allRegions);
    const areaCountsByName = new Map();
    for (const area of activeAreaNames) {
      const areaKey = normalizeArea(area);
      const counts = new Map();
      for (const technician of approvedTechnicians) {
        const technicianAreas = Array.isArray(technician.areas) ? technician.areas : [];
        const worksHere = technicianAreas.some(value =>
          normalizeArea(value) === areaKey
        );
        if (!worksHere) continue;
        const specialties = new Set((Array.isArray(technician.specialties) ? technician.specialties : []).map(normalize).filter(Boolean));
        for (const specialty of specialties) counts.set(specialty, (counts.get(specialty) || 0) + 1);
      }
      areaCountsByName.set(area, counts);
    }

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
        if (isBrokenWallScreenService(name)) continue;

        // A database row is authoritative for a legacy service. In particular,
        // an inactive row is a tombstone: do not re-add that service from CATEGORIES.
        const savedOverride = savedServices.some(saved =>
          normalize(saved.category) === categoryKey &&
          normalize(saved.name) === normalize(name)
        );
        if (savedOverride) continue;

        categoriesMap.get(categoryKey).services.push({
          name,
          emoji: category.emoji,
          isActive: true,
          source: 'legacy',
          sortOrder: (index + 1) * 10
        });
      }
    }

    // سجلات قاعدة البيانات تتحكم في الإضافة والتعديل والإخفاء.
    for (const saved of savedServices) {
      const categoryKey = normalize(saved.category);
      const serviceKey = normalize(saved.name);
      if (isBrokenWallScreenService(saved.name)) continue; // never expose either historical label of the broken service

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
        const names = category.services.map(item => item.name);
        const normalizedNames = new Set(names.map(normalize));
        const categoryTechnicianCount = normalizedSpecialties.filter(specialties =>
          Array.from(specialties).some(specialty => normalizedNames.has(specialty))
        ).length;
        const technicianCountByArea = Object.fromEntries(activeAreaNames.map(area => {
          const areaKey = normalizeArea(area);
          const count = approvedTechnicians.filter((technician, index) => {
            const technicianAreas = Array.isArray(technician.areas) ? technician.areas : [];
            const worksHere = technicianAreas.some(value =>
              normalizeArea(value) === areaKey
            );
            return worksHere && Array.from(normalizedSpecialties[index] || []).some(specialty => normalizedNames.has(specialty));
          }).length;
          return [area, count];
        }));
        const serviceTechnicianCountsByArea = Object.fromEntries(names.map(name => [
          name,
          Object.fromEntries(activeAreaNames.map(area => [
            area,
            areaCountsByName.get(area)?.get(normalize(name)) || 0
          ]))
        ]));
        return {
          label: category.label,
          emoji: category.emoji,
          services: names,
          technicianCount: categoryTechnicianCount,
          technicianCountByArea,
          serviceTechnicianCounts: Object.fromEntries(names.map(name => [name, technicianCounts.get(normalize(name)) || 0])),
          serviceTechnicianCountsByArea
        };
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
