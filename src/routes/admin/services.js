'use strict';

const express = require('express');
const {
  normalizeForCompare,
  isBrokenWallScreenService,
  parseBooleanStrict,
  validateNameField,
  validateCategoryField,
  validateSortOrder,
  createAdminServiceCatalog
} = require('../../services/adminServiceCatalog');

function createAdminServicesRouter({
  Service,
  CATEGORIES,
  findCategoryByService,
  findCategoryByLabel,
  mongoose,
  Joi,
  auth,
  writeAdminAudit
}) {
  const router = express.Router();
  const {
    buildAdminCategoriesMap,
    findServicesByName,
    ensureHiddenLegacy
  } = createAdminServiceCatalog({
    Service,
    CATEGORIES,
    findCategoryByService,
    findCategoryByLabel
  });

  router.get('/services', auth('admin'), async (req, res, next) => {
    try {
      const savedServices = await Service.find({}).sort({ category: 1, sortOrder: 1, name: 1 }).lean();
      const visibleServices = savedServices.filter(item => !isBrokenWallScreenService(item.name));
      const map = buildAdminCategoriesMap(visibleServices);
      const categoriesDetailed = Array.from(map.values()).map(cat => ({
        label: cat.label,
        name: cat.label,
        emoji: cat.emoji,
        categorySortOrder: cat.categorySortOrder,
        services: cat.services.map(s => s.name),
        _displayServices: cat.services.map(s => s.name),
        _detailed: cat.services,
        count: cat.services.length,
        activeCount: cat.services.filter(s => s.isActive).length
      }));
      const allFlat = [];
      for (const cat of map.values()) {
        for (const s of cat.services) allFlat.push(s);
      }
      return res.json({
        ok: true,
        categories: categoriesDetailed,
        services: allFlat,
        data: categoriesDetailed,
        legacyCategories: CATEGORIES
      });
    } catch (e) { next(e); }
  });
  
  router.post('/services', auth('admin'), async (req, res, next) => {
    try {
      let { name, category, emoji, sortOrder } = req.body;
  
      const nameErr = validateNameField(name || '');
      if (nameErr) return res.status(400).json({ message: nameErr });
      name = String(name).trim().replace(/\s+/g, ' ');
      if (isBrokenWallScreenService(name)) return res.status(400).json({ message: 'الخدمة دي محذوفة نهائيًا ولا يمكن إضافتها مرة أخرى' });
  
      if (!category || !String(category).trim()) {
        const found = findCategoryByService(name);
        category = found ? found.label : 'خدمات أخرى';
      }
      const catErr = validateCategoryField(category);
      if (catErr) return res.status(400).json({ message: catErr });
      category = String(category).trim().replace(/\s+/g, ' ');
  
      const sortErr = validateSortOrder(sortOrder);
      if (sortErr) return res.status(400).json({ message: sortErr });
  
      if (emoji !== undefined && emoji !== null && emoji !== '') {
        if (typeof emoji !== 'string' || emoji.trim().length > 10) {
          return res.status(400).json({ message: 'الرمز التعبيري غير صالح' });
        }
      }
  
      const payload = {
        name,
        category,
        emoji: emoji ? String(emoji).trim() : (findCategoryByLabel(category)?.emoji || findCategoryByService(name)?.emoji || '🔧'),
        sortOrder: sortOrder !== undefined && sortOrder !== '' ? Number(sortOrder) : 0,
        categorySortOrder: (findCategoryByLabel(category) ? (CATEGORIES.findIndex(c => normalizeForCompare(c.label) === normalizeForCompare(category)) + 1) * 10 : 100000),
        isActive: true
      };
  
      const existingInCategory = (await Service.find({ category }).select('+normalizedName')).find(item =>
        normalizeForCompare(item.name) === normalizeForCompare(name)
      );
      if (existingInCategory) {
        if (existingInCategory.isActive) return res.status(409).json({ message: 'الخدمة موجودة بالفعل في نفس القسم' });
        existingInCategory.name = name;
        existingInCategory.category = category;
        existingInCategory.emoji = payload.emoji;
        existingInCategory.sortOrder = payload.sortOrder;
        existingInCategory.categorySortOrder = payload.categorySortOrder;
        existingInCategory.isActive = true;
        await existingInCategory.save();
        await writeAdminAudit(req, 'إعادة تفعيل خدمة', 'services', String(existingInCategory._id), JSON.stringify({ name: existingInCategory.name, category: existingInCategory.category }));
        return res.json({ ok: true, message: 'تمت إعادة إضافة الخدمة', service: existingInCategory, data: existingInCategory });
      }
      const service = await Service.create(payload);
      await writeAdminAudit(req, 'إضافة خدمة', 'services', String(service._id), JSON.stringify({ name: service.name, category: service.category, sortOrder: service.sortOrder }));
      return res.status(201).json({ ok: true, message: 'تمت إضافة الخدمة', service, data: service });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ message: 'الخدمة موجودة بالفعل في نفس القسم' });
      }
      next(err);
    }
  });
  
  
  router.patch('/services/categories/order', auth('admin'), async (req, res, next) => {
    try {
      const schema = Joi.object({ categories: Joi.array().min(1).max(200).items(Joi.string().trim().min(1).max(100)).required() }).required();
      const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
      if (error) return res.status(400).json({ message: 'قائمة ترتيب الأقسام غير صحيحة' });
      const seen = new Set(), labels = value.categories.map(label => label.replace(/\s+/g, ' '));
      for (const label of labels) { const key = normalizeForCompare(label); if (seen.has(key)) return res.status(400).json({ message: 'يوجد قسم مكرر في الترتيب' }); seen.add(key); const err = validateCategoryField(label); if (err) return res.status(400).json({ message: err }); }
      for (const [index, category] of labels.entries()) {
        const categoryOrder = (index + 1) * 10, legacy = findCategoryByLabel(category);
        if (legacy) for (const [serviceIndex, name] of legacy.services.entries()) {
          let service = await Service.findOne({ normalizedName: normalizeForCompare(name), category });
          if (!service) await Service.create({ name, category, emoji: legacy.emoji || '🔧', isActive: true, sortOrder: (serviceIndex + 1) * 10, categorySortOrder: categoryOrder });
          else { service.categorySortOrder = categoryOrder; await service.save(); }
        }
        await Service.updateMany({ category }, { $set: { categorySortOrder: categoryOrder } });
      }
      await writeAdminAudit(req, 'تغيير ترتيب الأقسام الأساسية', 'services', 'categories', JSON.stringify({ count: labels.length }));
      return res.json({ ok: true, message: 'تم حفظ ترتيب الأقسام', count: labels.length });
    } catch (err) { if (err.code === 11000) return res.status(409).json({ message: 'تعذر حفظ ترتيب الأقسام بسبب خدمة مكررة' }); next(err); }
  });
  
  router.patch('/services/order', auth('admin'), async (req, res, next) => {
    try {
      const schema = Joi.object({ category: Joi.string().trim().min(1).max(100).required(), items: Joi.array().min(1).max(500).items(Joi.object({
        name: Joi.string().trim().min(1).max(100).required(), sortOrder: Joi.number().integer().min(0).max(100000).required(),
        emoji: Joi.string().max(20).allow('').optional(), isActive: Joi.boolean().optional()
      }).required()).required() }).required();
      const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
      if (error) return res.status(400).json({ message: 'بيانات ترتيب الخدمات غير صحيحة' });
      const category = value.category.replace(/\s+/g, ' ');
      const categoryError = validateCategoryField(category);
      if (categoryError) return res.status(400).json({ message: categoryError });
      const seen = new Set();
      for (const item of value.items) { const key = normalizeForCompare(item.name); if (seen.has(key)) return res.status(400).json({ message: 'يوجد تكرار في قائمة ترتيب الخدمات' }); seen.add(key); }
      for (const item of value.items) {
        const normalizedName = normalizeForCompare(item.name);
        let service = await Service.findOne({ normalizedName, category });
        if (service) {
          service.sortOrder = item.sortOrder; if (item.emoji) service.emoji = item.emoji;
          if (item.isActive !== undefined) service.isActive = item.isActive;
          await service.save();
        } else {
          const legacyCategory = findCategoryByLabel(category), legacyService = findCategoryByService(item.name);
          await Service.create({ name: item.name, category, emoji: item.emoji || legacyService?.emoji || legacyCategory?.emoji || '🔧', isActive: item.isActive !== false, sortOrder: item.sortOrder });
        }
      }
      await writeAdminAudit(req, 'تغيير ترتيب الخدمات', 'services', category, JSON.stringify({ count: value.items.length }));
      return res.json({ ok: true, message: 'تم حفظ ترتيب الخدمات', count: value.items.length });
    } catch (err) { if (err.code === 11000) return res.status(409).json({ message: 'تعذر حفظ الترتيب بسبب خدمة مكررة في القسم' }); next(err); }
  });
  
  router.delete('/services/:id', auth('admin'), async (req, res, next) => {
    try {
      const rawId = String(req.params.id || '').trim(), requestedCategory = req.query.category ? String(req.query.category).trim().replace(/\s+/g, ' ') : '';
      // Treat both historical labels as the same broken service; old UI rows may
      // carry either name and stale IDs/categories.
      let requestedService = null;
      if (mongoose.isValidObjectId(rawId)) requestedService = await Service.findById(rawId).select('name').lean();
      if (isBrokenWallScreenService(rawId) || isBrokenWallScreenService(requestedService?.name)) {
        const allRows = await Service.find({}).select('_id name').lean();
        const matchingIds = allRows.filter(item => isBrokenWallScreenService(item.name)).map(item => item._id);
        if (matchingIds.length) await Service.deleteMany({ _id: { $in: matchingIds } });
        const remainingRows = await Service.find({}).select('name').lean();
        if (remainingRows.some(item => isBrokenWallScreenService(item.name))) {
          return res.status(409).json({ message: 'تعذر تأكيد حذف كل نسخ الخدمة. لم يتم الإبلاغ عن نجاح الحذف.' });
        }
        await writeAdminAudit(req, 'حذف نهائي لخدمة معطلة', 'services', 'تركيب شاشة حائط', JSON.stringify({ category: requestedCategory, removedCopies: matchingIds.length, historicalOrdersPreserved: true }));
        return res.json({ ok: true, deleted: true, message: 'تم حذف الخدمة المعطلة من كل الأقسام. الطلبات القديمة محفوظة.' });
      }
      let service = null;
      if (mongoose.isValidObjectId(rawId)) service = await Service.findById(rawId);
      else {
        const candidates = await findServicesByName(rawId), matches = requestedCategory ? candidates.filter(item => normalizeForCompare(item.category) === normalizeForCompare(requestedCategory)) : candidates;
        if (matches.length > 1) return res.status(409).json({ message: 'الخدمة موجودة في أكثر من قسم؛ حدّد القسم قبل الحذف', duplicates: matches.map(item => ({ name: item.name, category: item.category })) });
        service = matches[0] || null;
        if (!service && requestedCategory) { const legacy = findCategoryByLabel(requestedCategory), legacyName = legacy?.services.find(name => normalizeForCompare(name) === normalizeForCompare(rawId)); if (legacyName) service = await ensureHiddenLegacy(legacyName, legacy.label); }
      }
      if (!service) return res.status(404).json({ message: 'الخدمة غير موجودة في القسم المحدد' });
      const name = service.name, category = service.category;
      const normalizedName = normalizeForCompare(name);
      if (isBrokenWallScreenService(normalizedName)) {
        const allRows = await Service.find({}).select('_id name').lean();
        const matchingIds = allRows.filter(item => isBrokenWallScreenService(item.name)).map(item => item._id);
        if (matchingIds.length) await Service.deleteMany({ _id: { $in: matchingIds } });
        const remainingRows = await Service.find({}).select('name').lean();
        if (remainingRows.some(item => isBrokenWallScreenService(item.name))) {
          return res.status(409).json({ message: 'لم نتمكن من إزالة كل نسخ الخدمة؛ لم يتم تأكيد الحذف' });
        }
        await writeAdminAudit(req, 'حذف نهائي لخدمة معطلة', 'services', name, JSON.stringify({ category, removedCopies: matchingIds.length, historicalOrdersPreserved: true }));
        return res.json({ ok: true, deleted: true, message: 'تم حذف الخدمة المعطلة نهائيًا من كل الأقسام. الطلبات السابقة محفوظة.' });
      }
      if (requestedCategory && normalizeForCompare(category) !== normalizeForCompare(requestedCategory)) {
        return res.status(404).json({ message: 'الخدمة لا تنتمي إلى القسم المحدد؛ لم يتم حذف أي سجل' });
      }
      const isLegacyService = CATEGORIES.some(cat =>
        cat.services.some(item => normalizeForCompare(item) === normalizedName) &&
        normalizeForCompare(cat.label) === normalizeForCompare(category)
      );
      let deleted = false;
      if (isLegacyService) {
        // Some older built-in services exist in more than one legacy category.
        // Hide every matching legacy entry so it cannot reappear from another category,
        // while leaving historical orders untouched.
        const legacyCategories = CATEGORIES.filter(cat =>
          cat.services.some(item => normalizeForCompare(item) === normalizedName)
        );
        const allRows = await Service.find({}).select('_id name category isActive');
        for (const legacyCat of legacyCategories) {
          const legacyRows = allRows.filter(item =>
            normalizeForCompare(item.name) === normalizedName &&
            normalizeForCompare(item.category) === normalizeForCompare(legacyCat.label)
          );
          for (const row of legacyRows) {
            if (row.isActive) { row.isActive = false; await row.save(); }
          }
          if (!legacyRows.length) await ensureHiddenLegacy(name, legacyCat.label);
        }
        deleted = true;
      } else {
        const sameCategoryRows = await Service.find({ category }).select('_id name');
        const duplicateIds = sameCategoryRows.filter(item => normalizeForCompare(item.name) === normalizedName).map(item => item._id);
        if (!duplicateIds.length) return res.status(409).json({ message: 'لم يتم العثور على سجل الخدمة لحذفه؛ حدّث القائمة وحاول مرة أخرى' });
        const result = await Service.deleteMany({ _id: { $in: duplicateIds } });
        if (result.deletedCount !== duplicateIds.length) return res.status(409).json({ message: 'لم يتم حذف كل سجلات الخدمة المكررة؛ راجع القائمة وحاول مرة أخرى' });
        const remaining = await Service.find({ category }).select('name').lean();
        if (remaining.some(item => normalizeForCompare(item.name) === normalizedName)) return res.status(409).json({ message: 'ما زالت هناك نسخة من الخدمة في القسم؛ لم نؤكد اكتمال الحذف' });
        deleted = true;
      }
      await writeAdminAudit(req, 'حذف نهائي لخدمة', 'services', name, JSON.stringify({ category, deleted: true, legacyTombstone: isLegacyService }));
      return res.json({
        ok: true,
        deleted,
        message: 'تم حذف الخدمة من قائمة الخدمات. الطلبات السابقة محفوظة.'
      });
    } catch (err) { next(err); }
  });
  
  router.patch('/services/:name', auth('admin'), async (req, res, next) => {
    let createdNewService = null;
    let oldNameForRollback = null;
    let oldCategoryForRollback = null;
    try {
      const rawParam = String(req.params.name || '').trim();
      if (!rawParam) return res.status(400).json({ message: 'اسم الخدمة الأصلي مطلوب' });
  
      const { name: newNameRaw, category: newCategoryRaw, emoji, sortOrder, isActive } = req.body;
      const queryCategory = req.query.category ? String(req.query.category).trim() : null;
  
      if (newNameRaw !== undefined) {
        const err = validateNameField(newNameRaw);
        if (err) return res.status(400).json({ message: err });
      }
      if (newCategoryRaw !== undefined) {
        const err = validateCategoryField(newCategoryRaw);
        if (err) return res.status(400).json({ message: err });
      }
      if (sortOrder !== undefined) {
        const err = validateSortOrder(sortOrder);
        if (err) return res.status(400).json({ message: err });
      }
      if (emoji !== undefined && emoji !== null && emoji !== '') {
        if (typeof emoji !== 'string' || emoji.trim().length > 10) {
          return res.status(400).json({ message: 'الرمز التعبيري غير صالح' });
        }
      }
      if (isActive !== undefined) {
        const parsed = parseBooleanStrict(isActive);
        if (!parsed.ok) return res.status(400).json({ message: parsed.reason });
      }
  
      let candidates = [];
      if (mongoose.isValidObjectId(rawParam)) {
        const byId = await Service.findById(rawParam);
        if (byId) candidates = [byId];
      } else {
        candidates = await findServicesByName(rawParam);
      }
  
      if (candidates.length === 0) {
        const legacyCat = findCategoryByService(rawParam);
        if (!legacyCat) {
          return res.status(404).json({ message: 'الخدمة غير موجودة في قاعدة البيانات ولا في القائمة الأساسية' });
        }
        if (!newNameRaw || !String(newNameRaw).trim()) {
          return res.status(400).json({ message: 'خدمات القائمة الأساسية لا يمكن تعديلها مباشرة بدون اسم جديد. أضف خدمة جديدة ثم أخفِ القديمة عبر /hide' });
        }
        const newName = String(newNameRaw).trim().replace(/\s+/g, ' ');
        const targetCategory = newCategoryRaw ? String(newCategoryRaw).trim() : (queryCategory || legacyCat.label);
  
        try {
          createdNewService = await Service.create({
            name: newName,
            category: targetCategory,
            emoji: emoji ? String(emoji).trim() : (findCategoryByLabel(targetCategory)?.emoji || legacyCat.emoji),
            sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
            isActive: true
          });
          oldNameForRollback = rawParam;
          oldCategoryForRollback = legacyCat.label;
          await ensureHiddenLegacy(rawParam, legacyCat.label);
          return res.json({ ok: true, message: 'تم إنشاء الخدمة الجديدة وإخفاء القديمة الأساسية حتى لا تظهر مرة أخرى', service: createdNewService });
        } catch (e) {
          if (createdNewService) {
            try { await Service.deleteOne({ _id: createdNewService._id }); } catch {}
          }
          if (e.code === 11000) return res.status(409).json({ message: 'الاسم الجديد موجود بالفعل في نفس القسم' });
          throw e;
        }
      }
  
      if (candidates.length > 1) {
        const filterCat = queryCategory || (newCategoryRaw ? String(newCategoryRaw).trim() : null);
        if (!filterCat) {
          return res.status(409).json({
            message: 'اسم الخدمة موجود في أكثر من قسم، يجب تحديد القسم',
            duplicates: candidates.map(c => ({ id: String(c._id), name: c.name, category: c.category, isActive: c.isActive })),
            hint: 'أرسل ?category=اسم_القسم في الرابط أو category في body'
          });
        }
        const normFilter = normalizeForCompare(filterCat);
        const matched = candidates.filter(c => normalizeForCompare(c.category) === normFilter);
        if (matched.length === 0) {
          return res.status(404).json({ message: 'لم يتم العثور على الخدمة في القسم المحدد', duplicates: candidates.map(c => ({ name: c.name, category: c.category })) });
        }
        if (matched.length > 1) {
          return res.status(409).json({ message: 'يوجد أكثر من خدمة بنفس الاسم في نفس القسم المحدد - راجع البيانات', duplicates: matched.map(c => ({ id: String(c._id), name: c.name, category: c.category })) });
        }
        candidates = matched;
      }
  
      const serviceDoc = await Service.findById(candidates[0]._id);
      if (!serviceDoc) return res.status(404).json({ message: 'الخدمة غير موجودة' });
  
      const oldName = serviceDoc.name;
      const oldCategory = serviceDoc.category;
      const oldNormalized = serviceDoc.normalizedName;
  
      let willRename = false;
      let newNameForHideCheck = null;
  
      if (newNameRaw !== undefined) {
        const nn = String(newNameRaw).trim().replace(/\s+/g, ' ');
        if (normalizeForCompare(nn) !== normalizeForCompare(oldName)) {
          willRename = true;
          newNameForHideCheck = nn;
          serviceDoc.name = nn;
        }
      }
      if (newCategoryRaw !== undefined) {
        serviceDoc.category = String(newCategoryRaw).trim().replace(/\s+/g, ' ');
      }
      if (emoji !== undefined) serviceDoc.emoji = String(emoji).trim() || serviceDoc.emoji || '🔧';
      if (sortOrder !== undefined) serviceDoc.sortOrder = Number(sortOrder);
      if (isActive !== undefined) {
        serviceDoc.isActive = isActive;
      }
  
      try {
        await serviceDoc.save();
      } catch (e) {
        if (e.code === 11000) return res.status(409).json({ message: 'الاسم الجديد مكرر في نفس القسم' });
        throw e;
      }
  
      if (willRename) {
        const oldLegacy = findCategoryByService(oldName);
        if (oldLegacy) {
          try {
            await ensureHiddenLegacy(oldName, oldLegacy.label);
          } catch (hideErr) {
            try {
              serviceDoc.name = oldName;
              serviceDoc.category = oldCategory;
              await serviceDoc.save();
            } catch (rollbackErr) {
              return res.status(500).json({
                message: 'تم تغيير الاسم لكن فشل إخفاء الاسم القديم وفشل التراجع. يجب مراجعة البيانات يدوياً',
                error: hideErr.message,
                rollbackError: rollbackErr.message,
                service: serviceDoc
              });
            }
            return res.status(500).json({
              message: 'فشل إخفاء الاسم القديم، تم التراجع عن تغيير الاسم. حاول مرة أخرى',
              error: hideErr.message
            });
          }
        }
      }
  
      await writeAdminAudit(req, 'تعديل خدمة', 'services', String(serviceDoc._id), JSON.stringify({ before: { name: oldName, category: oldCategory }, after: { name: serviceDoc.name, category: serviceDoc.category, isActive: serviceDoc.isActive, sortOrder: serviceDoc.sortOrder } }));
      return res.json({ ok: true, message: 'تم تعديل الخدمة', service: serviceDoc, data: serviceDoc });
    } catch (err) {
      if (createdNewService && oldNameForRollback) {
        try { await Service.deleteOne({ _id: createdNewService._id }); } catch {}
      }
      next(err);
    }
  });
  
  router.post('/services/:name/hide', auth('admin'), async (req, res, next) => {
    try {
      const rawParam = String(req.params.name || '').trim();
      if (!rawParam) return res.status(400).json({ message: 'اسم الخدمة مطلوب' });
      const queryCategory = req.query.category ? String(req.query.category).trim() : null;
      const bodyCategory = req.body && req.body.category ? String(req.body.category).trim() : null;
      const filterCategory = queryCategory || bodyCategory;
  
      if (filterCategory) {
        const err = validateCategoryField(filterCategory);
        if (err) return res.status(400).json({ message: err });
      }
  
      let candidates = [];
      if (mongoose.isValidObjectId(rawParam)) {
        const byId = await Service.findById(rawParam);
        if (byId) candidates = [byId];
      } else {
        candidates = await findServicesByName(rawParam);
      }
  
      if (candidates.length > 1 && !filterCategory) {
        return res.status(409).json({
          message: 'اسم الخدمة موجود في أكثر من قسم، حدد القسم لإخفاء الخدمة الصحيحة',
          duplicates: candidates.map(c => ({ id: String(c._id), name: c.name, category: c.category, isActive: c.isActive }))
        });
      }
  
      let target = null;
      if (candidates.length === 1) {
        target = await Service.findById(candidates[0]._id);
      } else if (candidates.length > 1 && filterCategory) {
        const normFilter = normalizeForCompare(filterCategory);
        const matched = candidates.filter(c => normalizeForCompare(c.category) === normFilter);
        if (matched.length === 0) return res.status(404).json({ message: 'لم يتم العثور على الخدمة في القسم المحدد' });
        if (matched.length > 1) return res.status(409).json({ message: 'يوجد تكرار في نفس القسم، لا يمكن تحديد الخدمة', duplicates: matched.map(c => ({ id: String(c._id), name: c.name, category: c.category })) });
        target = await Service.findById(matched[0]._id);
      }
  
      if (target) {
        target.isActive = false;
        await target.save();
        await writeAdminAudit(req, 'إخفاء خدمة', 'services', String(target._id), JSON.stringify({ name: target.name, category: target.category }));
        return res.json({ ok: true, message: 'تم إخفاء الخدمة - لن تظهر للعملاء بسبب الدمج في public.js', service: target });
      }
  
      const legacyCat = findCategoryByService(rawParam);
      if (legacyCat) {
        const hidden = await ensureHiddenLegacy(rawParam, legacyCat.label);
        await writeAdminAudit(req, 'إخفاء خدمة أساسية', 'services', rawParam, JSON.stringify({ category: legacyCat.label }));
        return res.json({ ok: true, message: 'تم إخفاء الخدمة الأساسية - لن تظهر مرة أخرى في قائمة العميل لأن public.js يتحقق من isActive=false', service: hidden });
      }
  
      return res.status(404).json({ message: 'الخدمة غير موجودة في القائمة الأساسية أو قاعدة البيانات' });
    } catch (e) { next(e); }
  });
  
  router.post('/services/:name/show', auth('admin'), async (req, res, next) => {
    try {
      const rawParam = String(req.params.name || '').trim();
      if (!rawParam) return res.status(400).json({ message: 'اسم الخدمة مطلوب' });
      const queryCategory = req.query.category ? String(req.query.category).trim() : null;
      const bodyCategory = req.body && req.body.category ? String(req.body.category).trim() : null;
      const filterCategory = queryCategory || bodyCategory;
  
      if (filterCategory) {
        const err = validateCategoryField(filterCategory);
        if (err) return res.status(400).json({ message: err });
      }
  
      let candidates = [];
      if (mongoose.isValidObjectId(rawParam)) {
        const byId = await Service.findById(rawParam);
        if (byId) candidates = [byId];
      } else {
        candidates = await findServicesByName(rawParam);
      }
  
      if (candidates.length === 0) {
        return res.status(404).json({ message: 'الخدمة غير موجودة - لا يمكن إظهار خدمة لم يتم إخفاؤها مسبقاً' });
      }
  
      if (candidates.length > 1 && !filterCategory) {
        return res.status(409).json({
          message: 'اسم الخدمة موجود في أكثر من قسم، حدد القسم لإظهاره بدقة',
          duplicates: candidates.map(c => ({ id: String(c._id), name: c.name, category: c.category, isActive: c.isActive }))
        });
      }
  
      let target = null;
      if (candidates.length === 1) {
        target = await Service.findById(candidates[0]._id);
      } else if (candidates.length > 1 && filterCategory) {
        const normFilter = normalizeForCompare(filterCategory);
        const matched = candidates.filter(c => normalizeForCompare(c.category) === normFilter);
        if (matched.length === 0) return res.status(404).json({ message: 'لم يتم العثور على الخدمة في القسم المحدد' });
        if (matched.length > 1) {
          return res.status(409).json({
            message: 'يوجد أكثر من سجل لنفس الخدمة في نفس القسم - يجب تنظيف البيانات يدوياً',
            duplicates: matched.map(c => ({ id: String(c._id), name: c.name, category: c.category, isActive: c.isActive }))
          });
        }
        target = await Service.findById(matched[0]._id);
      }
  
      if (!target) return res.status(404).json({ message: 'الخدمة غير موجودة' });
  
      target.isActive = true;
      await target.save();
      await writeAdminAudit(req, 'إظهار خدمة', 'services', String(target._id), JSON.stringify({ name: target.name, category: target.category }));
      return res.json({ ok: true, message: 'تمت إعادة تفعيل الخدمة', service: target });
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = createAdminServicesRouter;
