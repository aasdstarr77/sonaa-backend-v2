'use strict';

module.exports = function registerAdminTechnicians(router, context) {
  const { express, bcrypt, jwt, Joi, mongoose, crypto, Fanni, Client, Notification, TopupRequest, Order, Rating, Complaint, WalletTransaction, createNotification, Service, Region, AdminConfig, AdminAuditLog, createAdminAuditWriter, PageVisit, CATEGORIES, ALL_SERVICES, normalizeServiceName, findCategoryByService, findCategoryByLabel, auth, defaultAdminPermissions, ADMIN_PERMISSION_KEYS, validate, normalizePhone, ADMIN_TOKEN_EXPIRY, MAX_LIST_LIMIT, loginSchema, amountSchema, reasonSchema, complaintStatusSchema, VALID_LEVELS, VALID_BADGES, ADMIN_ROLES, writeAdminAudit, ADMIN_LAYOUT_SECTIONS, ADMIN_LAYOUT_TABS, UI_LAYOUT_FIELDS, uiLayoutPageSchema, BROKEN_WALL_SCREEN_SERVICE_NAMES, publicFanni, publicTopup, adminName, decision, validId, sendBadId, getLoginPhone, notImplemented, isRootAdmin, requireRootAdmin, publicAdminUser, getAdminConfig, sanitizeAdminUiLayout, normalizeForCompare, normalizeBrokenWallScreenServiceName, isBrokenWallScreenService, parseBooleanStrict, validateNameField, validateCategoryField, validateSortOrder, buildAdminCategoriesMap, findServicesByName, ensureHiddenLegacy } = context;

router.post('/fannis/:id/approve', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni) { return res.status(404).json({ message: 'الفني غير موجود' }); }
    if (fanni.status === 'معلق') { return res.status(409).json({ message: 'الفني معلق. أعد تفعيله أولاً قبل القبول' }); }
    if (fanni.status === 'معتمد') { return res.json({ message: 'الفني معتمد بالفعل', fanni: publicFanni(fanni) }); }
    fanni.status = 'معتمد'; fanni.rejectionReason = undefined; fanni.suspensionReason = undefined; fanni.suspendedAt = undefined;
    fanni.decisions.push(decision(req, 'موافقة')); await fanni.save();
    await writeAdminAudit(req, 'اعتماد حساب فني', 'fannis', String(fanni._id), `name=${fanni.name}`);
    await createNotification({
      recipientRole: 'fanni', recipientId: fanni._id, type: 'account_approved',
      title: 'تم اعتماد حسابك', message: 'مبروك، الإدارة اعتمدت حسابك وأصبحت تقدر تستخدم خدمات الفني المعتمدة.',
      link: '/fanni', dedupeKey: 'fanni-approved:' + String(fanni._id)
    });
    return res.json({ message: 'تم اعتماد الفني بنجاح', fanni: publicFanni(fanni) });
  } catch (err) { next(err); }
});

router.post('/fannis/:id/reject', auth('admin'), validate(Joi.object({ reason: reasonSchema.optional() })), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni) { return res.status(404).json({ message: 'الفني غير موجود' }); }
    if (fanni.status === 'معلق') { return res.status(409).json({ message: 'لا يمكن رفض حساب معلق. أعده للمراجعة أولاً' }); }
    if (fanni.status === 'مرفوض') { return res.json({ message: 'الفني مرفوض بالفعل', fanni: publicFanni(fanni) }); }
    const reason = String(req.body.reason || '').trim();
    fanni.status = 'مرفوض'; fanni.rejectionReason = reason || undefined; fanni.decisions.push(decision(req, 'رفض', reason)); await fanni.save();
    await writeAdminAudit(req, 'رفض حساب فني', 'fannis', String(fanni._id), `name=${fanni.name}; reason=${reason}`);
    return res.json({ message: 'تم رفض الفني', fanni: publicFanni(fanni) });
  } catch (err) { next(err); }
});

router.post('/fannis/:id/disable', auth('admin'), validate(Joi.object({ reason: reasonSchema.optional() })), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni) { return res.status(404).json({ message: 'الفني غير موجود' }); }
    if (fanni.status === 'معلق') { return res.json({ message: 'حساب الفني معلق بالفعل', fanni: publicFanni(fanni) }); }
    const reason = String(req.body.reason || '').trim();
    fanni.status = 'معلق'; fanni.suspensionReason = reason || undefined; fanni.suspendedAt = new Date(); fanni.decisions.push(decision(req, 'تعليق', reason)); await fanni.save();
    await writeAdminAudit(req, 'تعليق حساب فني', 'fannis', String(fanni._id), `reason=${reason}`);
    return res.json({ message: 'تم تعليق حساب الفني', fanni: publicFanni(fanni) });
  } catch (err) { next(err); }
});

router.post('/fannis/:id/enable', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni) { return res.status(404).json({ message: 'الفني غير موجود' }); }
    if (fanni.status !== 'معلق') { return res.json({ message: 'حساب الفني غير معلق', fanni: publicFanni(fanni) }); }
    const previousDecision = [...(fanni.decisions || [])].reverse().find(item => !['تعليق', 'إعادة تفعيل'].includes(item.action));
    if (previousDecision?.action === 'موافقة') { fanni.status = 'معتمد'; } else if (previousDecision?.action === 'رفض') { fanni.status = 'مرفوض'; } else { fanni.status = 'قيد المراجعة'; }
    fanni.suspensionReason = undefined; fanni.suspendedAt = undefined; fanni.decisions.push(decision(req, 'إعادة تفعيل')); await fanni.save();
    await writeAdminAudit(req, 'إعادة تفعيل حساب فني', 'fannis', String(fanni._id), `status=${fanni.status}`);
    return res.json({ message: 'تمت إعادة تفعيل الحساب', fanni: publicFanni(fanni) });
  } catch (err) { next(err); }
});

router.post('/fannis/:id/set-balance', auth('admin'), validate(Joi.object({ amount: amountSchema, reason: reasonSchema.optional() })), async (req, res, next) => {
  if (!validId(req.params.id)) return sendBadId(res);
  let session;
  try {
    session = await mongoose.startSession();
    let outcome = null;
    await session.withTransaction(async () => {
      const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' }).session(session);
      if (!fanni) { outcome = null; return; }
      const amount = Number(req.body.amount);
      const previous = Number(fanni.walletBalance || 0);
      const reason = String(req.body.reason || '').trim();
      const difference = amount - previous;
      const updatedFanni = await Fanni.findOneAndUpdate({ _id: fanni._id, role: 'fanni' }, { $set: { walletBalance: amount }, $push: { decisions: decision(req, 'تسوية إدارية', `تعيين الرصيد من ${previous} إلى ${amount}. ${reason}`.trim()) } }, { new: true, session, runValidators: true });
      if (!updatedFanni) { throw new Error('SETTLEMENT_FANNI_NOT_FOUND'); }
      if (difference !== 0) {
        const transaction = new WalletTransaction({ fanni: fanni._id, type: 'admin_adjustment', amount: difference, balanceBefore: previous, balanceAfter: amount, description: `تسوية إدارية: من ${previous} إلى ${amount}. ${reason}`.trim().slice(0, 500), idempotencyKey: `admin-set-balance:${String(fanni._id)}:${crypto.randomBytes(16).toString('hex')}` });
        await transaction.save({ session });
      }
      outcome = { fanni: updatedFanni, balance: Number(updatedFanni.walletBalance) };
    });
    if (!outcome) { return res.status(404).json({ message: 'الفني غير موجود' }); }
    await writeAdminAudit(req, 'تسوية رصيد محفظة فني', 'wallet', String(outcome.fanni._id), `balance=${outcome.balance}; reason=${String(req.body.reason || '').trim()}`);
    return res.json({ message: 'تم تحديث رصيد المحفظة وتسجيل التسوية', balance: outcome.balance, fanni: publicFanni(outcome.fanni) });
  } catch (err) { next(err); } finally { if (session) await session.endSession(); }
});

router.post('/fannis/:id/add-balance', auth('admin'), validate(Joi.object({ amount: Joi.number().strict().positive().max(100000000).required(), reason: reasonSchema.optional() })), async (req, res, next) => {
  if (!validId(req.params.id)) return sendBadId(res);
  let session;
  try {
    session = await mongoose.startSession();
    let outcome = null;
    const amount = Number(req.body.amount);
    const reason = String(req.body.reason || '').trim();
    await session.withTransaction(async () => {
      const beforeFanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' }).session(session);
      if (!beforeFanni) { outcome = null; return; }
      const balanceBefore = Number(beforeFanni.walletBalance || 0);
      const fanni = await Fanni.findOneAndUpdate({ _id: beforeFanni._id, role: 'fanni' }, { $inc: { walletBalance: amount }, $push: { decisions: decision(req, 'تسوية إدارية', `إضافة ${amount} إلى المحفظة. ${reason}`.trim()) } }, { new: true, session, runValidators: true });
      if (!fanni) throw new Error('ADD_BALANCE_FANNI_NOT_FOUND');
      const transaction = new WalletTransaction({ fanni: fanni._id, type: 'admin_adjustment', amount, balanceBefore, balanceAfter: Number(fanni.walletBalance), description: `إضافة إدارية بمبلغ ${amount}. ${reason}`.trim().slice(0, 500), idempotencyKey: `admin-add-balance:${String(fanni._id)}:${crypto.randomBytes(16).toString('hex')}` });
      await transaction.save({ session });
      outcome = { fanni, balance: Number(fanni.walletBalance) };
    });
    if (!outcome) { return res.status(404).json({ message: 'الفني غير موجود' }); }
    await writeAdminAudit(req, 'إضافة رصيد لمحفظة فني', 'wallet', String(outcome.fanni._id), `amount=${amount}; balance=${outcome.balance}; reason=${reason}`);
    return res.json({ message: 'تمت إضافة الرصيد وتسجيل الحركة المالية', balance: outcome.balance, fanni: publicFanni(outcome.fanni) });
  } catch (err) { next(err); } finally { if (session) await session.endSession(); }
});

router.get('/topup-requests', auth('admin'), async (req, res, next) => {
  try {
    const list = await TopupRequest.find({}).sort({ createdAt: -1 }).limit(MAX_LIST_LIMIT).lean();
    const requests = list.map(publicTopup);
    return res.json({ requests, data: requests });
  } catch (err) { next(err); }
});

router.post('/topup-requests/:id/approve', auth('admin'), async (req, res, next) => {
  if (!validId(req.params.id)) return sendBadId(res);
  let session;
  try {
    session = await mongoose.startSession();
    let outcome = null;
    await session.withTransaction(async () => {
      const topup = await TopupRequest.findOneAndUpdate({ _id: req.params.id, status: 'قيد المراجعة', isCredited: false }, { $set: { status: 'مقبول', isCredited: true, reviewedAt: new Date(), reviewedBy: adminName(req), reviewReason: '' } }, { new: true, session });
      if (!topup) { outcome = { kind: 'not-pending' }; return; }
      const updatedFanni = await Fanni.findOneAndUpdate({ _id: topup.fanni, role: 'fanni' }, { $inc: { walletBalance: topup.amount }, $push: { decisions: decision(req, 'تسوية إدارية', `شحن محفظة بمبلغ ${topup.amount} جنيه لطلب ${topup._id}`) } }, { new: true, session, runValidators: true });
      if (!updatedFanni) { throw new Error('TOPUP_FANNI_NOT_FOUND'); }
      const balanceAfter = Number(updatedFanni.walletBalance);
      const balanceBefore = balanceAfter - Number(topup.amount);
      const transaction = new WalletTransaction({ fanni: updatedFanni._id, type: 'topup', amount: Number(topup.amount), balanceBefore, balanceAfter, description: `شحن محفظة بمبلغ ${topup.amount} جنيه لطلب ${topup._id}`, idempotencyKey: `topup:${String(topup._id)}` });
      await transaction.save({ session });
      outcome = { kind: 'approved', topup, balance: balanceAfter };
    });
    if (outcome?.kind !== 'approved') {
      const current = await TopupRequest.findById(req.params.id).lean();
      if (!current) { return res.status(404).json({ message: 'طلب الشحن غير موجود' }); }
      return res.status(409).json({ message: 'تمت معالجة طلب الشحن بالفعل أو أنه غير متاح للمراجعة', status: current.status, isCredited: Boolean(current.isCredited) });
    }
    await writeAdminAudit(req, 'اعتماد طلب شحن محفظة', 'topups', String(outcome.topup._id), `fanniId=${String(outcome.topup.fanni)}; amount=${Number(outcome.topup.amount)}; balance=${outcome.balance}`);
    await createNotification({
      recipientRole: 'fanni', recipientId: outcome.topup.fanni, type: 'topup_approved',
      title: 'تم شحن محفظتك', message: 'تم قبول طلب شحن المحفظة وإضافة ' + outcome.topup.amount + ' جنيه إلى رصيدك.',
      link: '/fanni', dedupeKey: 'topup-approved:' + String(outcome.topup._id)
    });
    return res.json({ message: 'تم قبول طلب الشحن وإضافة الرصيد مرة واحدة', request: publicTopup(outcome.topup), balance: outcome.balance });
  } catch (err) {
    if (err.message === 'TOPUP_FANNI_NOT_FOUND') { return res.status(409).json({ message: 'الفني المرتبط بطلب الشحن غير موجود. لم يتم اعتماد العملية' }); }
    next(err);
  } finally { if (session) await session.endSession(); }
});

router.post('/topup-requests/:id/reject', auth('admin'), validate(Joi.object({ reason: reasonSchema.optional() })), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const reason = String(req.body.reason || '').trim();
    const request = await TopupRequest.findOneAndUpdate({ _id: req.params.id, status: 'قيد المراجعة', isCredited: false }, { $set: { status: 'مرفوض', isCredited: false, reviewedAt: new Date(), reviewedBy: adminName(req), reviewReason: reason } }, { new: true, runValidators: true });
    if (!request) {
      const current = await TopupRequest.findById(req.params.id).lean();
      if (!current) { return res.status(404).json({ message: 'طلب الشحن غير موجود' }); }
      return res.status(409).json({ message: 'تمت معالجة طلب الشحن بالفعل أو أنه غير متاح للمراجعة', status: current.status });
    }
    await writeAdminAudit(req, 'رفض طلب شحن محفظة', 'topups', String(request._id), `fanniId=${String(request.fanni)}; amount=${Number(request.amount)}; reason=${reason}`);
    await createNotification({
      recipientRole: 'fanni', recipientId: request.fanni, type: 'topup_rejected',
      title: 'تم رفض طلب الشحن', message: 'تم رفض طلب شحن المحفظة. ' + String(request.reviewReason || '').slice(0, 180),
      link: '/fanni', dedupeKey: 'topup-rejected:' + String(request._id)
    });
    return res.json({ message: 'تم رفض طلب الشحن', request: publicTopup(request) });
  } catch (err) { next(err); }
});
};
