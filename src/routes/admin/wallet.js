'use strict';

const express = require('express');
const crypto = require('crypto');

function createAdminWalletRouter({
  auth, validate, Joi, amountSchema, reasonSchema, validId, sendBadId,
  mongoose, Fanni, TopupRequest, Order, WalletTransaction,
  adminName, decision, publicFanni, publicTopup, writeAdminAudit,
  createNotification, MAX_LIST_LIMIT
}) {
  const router = express.Router();

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

router.get('/wallet/transactions/:fanniId', auth('admin'), async (req,res,next)=>{
  try{
    if(!validId(req.params.fanniId)) return sendBadId(res);
    const list = await WalletTransaction.find({fanni:req.params.fanniId}).sort({createdAt:-1}).limit(100).lean();
    return res.json({transactions:list, data:list});
  }catch(e){next(e);}
});

// تجميد المحفظة - يستخدم حقول isFrozen من Fanni.js الجديد
router.post('/wallet/freeze/:id', auth('admin'), async (req,res,next)=>{
  try{
    if(!validId(req.params.id)) return sendBadId(res);
    const schema = Joi.object({
      action: Joi.string().valid('freeze', 'unfreeze').default('freeze'),
      reason: Joi.string().trim().max(500).allow('').default('')
    }).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: 'إجراء تجميد المحفظة أو سبب الإجراء غير صالح' });
    const act = value.action;
    const r = value.reason;
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni) return res.status(404).json({ message: 'الفني غير موجود' });
    if (act === 'freeze') {
      if (fanni.isFrozen) return res.json({ message: 'المحفظة مجمدة بالفعل', fanni: publicFanni(fanni) });
      fanni.isFrozen = true;
      fanni.frozenAt = new Date();
      fanni.frozenReason = r;
      fanni.frozenBy = adminName(req);
      fanni.decisions.push({ action: 'تجميد محفظة', reason: r, date: new Date(), by: adminName(req), byId: req.user?._id });
    } else {
      if (!fanni.isFrozen) return res.json({ message: 'المحفظة غير مجمدة', fanni: publicFanni(fanni) });
      fanni.isFrozen = false;
      fanni.frozenAt = undefined;
      fanni.frozenReason = undefined;
      fanni.frozenBy = undefined;
      fanni.decisions.push({ action: 'إلغاء تجميد', reason: r, date: new Date(), by: adminName(req), byId: req.user?._id });
    }
    await fanni.save();
    await writeAdminAudit(req, act === 'freeze' ? 'تجميد محفظة فني' : 'إلغاء تجميد محفظة فني', 'wallet', String(fanni._id), `name=${fanni.name}; reason=${r}`);
    return res.json({ message: act==='freeze' ? 'تم تجميد المحفظة' : 'تم إلغاء تجميد المحفظة', fanni: publicFanni(fanni) });
  }catch(e){next(e);}
});

  return router;
}

module.exports = createAdminWalletRouter;
