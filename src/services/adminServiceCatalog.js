'use strict';

// Service-catalog helpers used by the admin routes.
// Database access is injected so the normalization/validation logic stays
// independent from Express while preserving the existing Service model behavior.

function normalizeForCompare(value) {
  return String(value || '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/ريسيفر/g, 'رسيفر');
}

function normalizeBrokenWallScreenServiceName(value) {
  return normalizeForCompare(value)
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

function parseBooleanStrict(value) {
  if (typeof value === 'boolean') return { ok: true, value };
  if (value === 'true' || value === 'false') {
    return { ok: false, reason: 'قيمة isActive يجب أن تكون Boolean حقيقي true/false وليس نص "' + value + '"' };
  }
  if (typeof value === 'string') {
    const low = value.trim().toLowerCase();
    if (low === 'true' || low === 'false') {
      return { ok: false, reason: 'قيمة isActive يجب أن تكون Boolean حقيقي وليس نص' };
    }
  }
  return { ok: false, reason: 'قيمة isActive يجب أن تكون true أو false فقط' };
}

function validateNameField(name) {
  if (typeof name !== 'string') return 'اسم الخدمة يجب أن يكون نص';
  const t = name.trim().replace(/\s+/g, ' ');
  if (t.length < 1) return 'اسم الخدمة لا يمكن أن يكون فارغاً';
  if (t.length > 100) return 'اسم الخدمة طويل جداً (الحد 100 حرف)';
  return null;
}

function validateCategoryField(cat) {
  if (typeof cat !== 'string') return 'اسم القسم يجب أن يكون نص';
  const t = cat.trim().replace(/\s+/g, ' ');
  if (t.length < 1) return 'اسم القسم لا يمكن أن يكون فارغاً';
  if (t.length > 100) return 'اسم القسم طويل جداً';
  return null;
}

function validateSortOrder(val) {
  if (val === undefined || val === null || val === '') return null;
  const num = Number(val);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0 || num > 100000) {
    return 'sortOrder يجب أن يكون رقم صحيح بين 0 و 100000';
  }
  return null;
}

function createAdminServiceCatalog({ Service, CATEGORIES, findCategoryByService, findCategoryByLabel }) {
  if (!Service || !Array.isArray(CATEGORIES) || typeof findCategoryByService !== 'function' || typeof findCategoryByLabel !== 'function') {
    throw new TypeError('Admin service catalog dependencies are incomplete');
  }

  function buildAdminCategoriesMap(savedServices) {
    const map = new Map();
    // Legacy services are seeded below, so an inactive database tombstone must
    // suppress the seed itself; merely skipping the DB row leaves the old item visible.
    const hiddenLegacyKeys = new Set(savedServices
      .filter(saved => saved.isActive === false)
      .filter(saved => CATEGORIES.some(cat =>
        normalizeForCompare(cat.label) === normalizeForCompare(saved.category) &&
        cat.services.some(name => normalizeForCompare(name) === normalizeForCompare(saved.name))
      ))
      .map(saved => normalizeForCompare(saved.category) + '|' + normalizeForCompare(saved.name)));
    for (const [categoryIndex, cat] of CATEGORIES.entries()) {
      const key = normalizeForCompare(cat.label);
      map.set(key, {
        label: cat.label,
        emoji: cat.emoji,
        categorySortOrder: (categoryIndex + 1) * 10,
        services: cat.services.map((name, index) => ({
          name,
          normalizedName: normalizeForCompare(name),
          emoji: cat.emoji,
          isActive: true,
          source: 'legacy',
          category: cat.label,
          dbId: null,
          sortOrder: (index + 1) * 10
        })).filter(service => !hiddenLegacyKeys.has(key + '|' + service.normalizedName))
      });
    }
    for (const saved of savedServices) {
      const catKey = normalizeForCompare(saved.category);
      const isInactiveLegacyTombstone = saved.isActive === false && CATEGORIES.some(cat =>
        normalizeForCompare(cat.label) === catKey &&
        cat.services.some(name => normalizeForCompare(name) === normalizeForCompare(saved.name))
      );
      if (isInactiveLegacyTombstone) continue;
      if (!map.has(catKey)) {
        map.set(catKey, {
          label: saved.category,
          emoji: saved.emoji || '🔧',
          categorySortOrder: Number.isFinite(Number(saved.categorySortOrder)) && Number(saved.categorySortOrder) > 0 ? Number(saved.categorySortOrder) : 100000,
          services: []
        });
      }
      const category = map.get(catKey);
      if (Number.isFinite(Number(saved.categorySortOrder)) && Number(saved.categorySortOrder) > 0) category.categorySortOrder = Number(saved.categorySortOrder);
      const serviceKey = normalizeForCompare(saved.name);
      const existingIdx = category.services.findIndex(s => normalizeForCompare(s.name) === serviceKey);
      const dbItem = {
        name: saved.name,
        normalizedName: normalizeForCompare(saved.name),
        emoji: saved.emoji || category.emoji || '🔧',
        isActive: saved.isActive,
        source: 'database',
        category: saved.category,
        isCustom: !(findCategoryByService(saved.name) && normalizeForCompare(findCategoryByService(saved.name).label) === normalizeForCompare(saved.category)),
        dbId: String(saved._id),
        sortOrder: Number.isFinite(Number(saved.sortOrder)) ? Number(saved.sortOrder) : 0,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt
      };
      if (existingIdx !== -1) {
        category.services.splice(existingIdx, 1, dbItem);
      } else {
        category.services.push(dbItem);
      }
    }
    for (const category of map.values()) category.services.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ar'));
    return new Map(Array.from(map.entries()).sort((a, b) => a[1].categorySortOrder - b[1].categorySortOrder || a[1].label.localeCompare(b[1].label, 'ar')));
  }

  async function findServicesByName(rawName) {
    const norm = normalizeForCompare(rawName);
    if (!norm) return [];
    // الموديل الجديد فيه normalizedName - نستخدمه مباشرة للأداء
    const found = await Service.find({ normalizedName: norm }).lean();
    if (found.length > 0) return found;
    // fallback للتوافق: لو normalizedName مش موجود (بيانات قديمة) نفلتر يدوياً
    const all = await Service.find({}).lean();
    return all.filter(s => normalizeForCompare(s.name) === norm);
  }

  async function ensureHiddenLegacy(oldName, oldCategoryLabel) {
    const normOld = normalizeForCompare(oldName);
    if (!normOld) throw new Error('اسم الخدمة القديم غير صالح للإخفاء');
    const existing = await Service.findOne({ normalizedName: normOld, category: oldCategoryLabel });
    if (existing) {
      if (existing.isActive) {
        existing.isActive = false;
        await existing.save();
      }
      return existing;
    }
    const legacyCat = findCategoryByService(oldName) || findCategoryByLabel(oldCategoryLabel);
    const emoji = legacyCat ? legacyCat.emoji : '🔧';
    try {
      const hidden = await Service.create({
        name: oldName,
        category: oldCategoryLabel,
        emoji,
        isActive: false,
        sortOrder: 9999
      });
      return hidden;
    } catch (e) {
      if (e.code === 11000) {
        const dup = await Service.findOne({ normalizedName: normOld, category: oldCategoryLabel });
        if (dup) {
          if (dup.isActive) {
            dup.isActive = false;
            await dup.save();
          }
          return dup;
        }
        throw e;
      }
      throw e;
    }
  }

  return { buildAdminCategoriesMap, findServicesByName, ensureHiddenLegacy };
}

module.exports = {
  normalizeForCompare,
  normalizeBrokenWallScreenServiceName,
  BROKEN_WALL_SCREEN_SERVICE_NAMES,
  isBrokenWallScreenService,
  parseBooleanStrict,
  validateNameField,
  validateCategoryField,
  validateSortOrder,
  createAdminServiceCatalog
};
