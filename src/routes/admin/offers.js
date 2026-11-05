'use strict';

const express = require('express');

function createAdminOffersRouter({ auth, Order, Fanni, adminName, writeAdminAudit }) {
  const router = express.Router();

  router.get('/orders/:sn/offers', auth('admin'), async (req, res, next) => {
    try {
      const sn = String(req.params.sn||'').trim().toUpperCase();
      if (!/^SN\d{6}$/.test(sn)) return res.status(400).json({ message: 'رقم الطلب يجب أن يكون SN + 6 أرقام' });
      const order = await Order.findOne({ sn }).populate('offers.fanni', 'name phone').lean();
      if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
      return res.json({ sn: order.sn, status: order.status, offers: order.offers || [], count: (order.offers||[]).length });
    } catch(e){ next(e); }
  });
  
  router.delete('/offers/:sn/:idx', auth('admin'), async (req, res, next) => {
    try {
      const sn = String(req.params.sn||'').trim().toUpperCase();
      const idx = Number(req.params.idx);
      if (!/^SN\d{6}$/.test(sn)) return res.status(400).json({ message: 'رقم الطلب غير صالح' });
      if (!Number.isInteger(idx) || idx < 0) return res.status(400).json({ message: 'رقم العرض غير صالح' });
      const order = await Order.findOne({ sn });
      if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
      if (order.commissionCharged) return res.status(409).json({ message: 'لا يمكن حذف عرض بعد خصم العمولة' });
      if (['تم اختيار فني','تم الانتهاء'].includes(order.status)) return res.status(409).json({ message: 'الطلب في حالة محمية لا يمكن حذف عروضه' });
      if (!Array.isArray(order.offers) || idx >= order.offers.length) return res.status(404).json({ message: 'العرض غير موجود' });
      const removed = order.offers[idx];
      order.offers.splice(idx,1);
      // لو العرض المحذوف هو المعين، الغي التعيين
      if (order.acceptedOfferId && String(order.acceptedOfferId) === String(removed._id)) {
        order.assignedFanni = null;
        order.assignedFanniName = '';
        order.acceptedOfferId = null;
        order.acceptedOfferPrice = null;
        if (order.status === 'تم اختيار فني') order.status = 'وصلتك عروض';
      }
      await order.save();
      await writeAdminAudit(req, 'حذف عرض فني', 'offers', `${sn}:${idx}`, JSON.stringify({ fanniId: String(removed.fanni || ''), price: removed.price, status: order.status }));
      return res.json({ message: 'تمت إزالة العرض', removed, offers: order.offers });
    } catch(e){ next(e); }
  });
  
  router.post('/offers/:sn/:idx/reject', auth('admin'), async (req, res, next) => {
    try {
      const sn = String(req.params.sn||'').trim().toUpperCase();
      const idx = Number(req.params.idx);
      const reason = String(req.body.reason||'غير مناسب').slice(0,500);
      if (!/^SN\d{6}$/.test(sn)) return res.status(400).json({ message: 'رقم الطلب غير صالح' });
      if (!Number.isInteger(idx) || idx < 0) return res.status(400).json({ message: 'رقم العرض غير صالح' });
      const order = await Order.findOne({ sn });
      if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
      if (order.commissionCharged) return res.status(409).json({ message: 'لا يمكن رفض عرض بعد خصم العمولة' });
      if (!Array.isArray(order.offers) || idx >= order.offers.length) return res.status(404).json({ message: 'العرض غير موجود' });
      const offer = order.offers[idx];
      // نعتبر الرفض = حذف مع تسجيل سبب في قرار لو الفني موجود
      if (offer.fanni) {
        const fanni = await Fanni.findById(offer.fanni);
        if (fanni) {
          fanni.decisions.push({ action: 'رفض', reason: `رفض عرض على ${sn}: ${reason}`, date: new Date(), by: adminName(req), byId: req.user?._id, meta: { sn, offerId: offer._id } });
          await fanni.save();
        }
      }
      order.offers.splice(idx,1);
      if (order.acceptedOfferId && String(order.acceptedOfferId) === String(offer._id)) {
        order.assignedFanni = null;
        order.acceptedOfferId = null;
        order.acceptedOfferPrice = null;
        if (order.status === 'تم اختيار فني') order.status = 'وصلتك عروض';
      }
      await order.save();
      await writeAdminAudit(req, 'رفض عرض فني', 'offers', `${sn}:${idx}`, JSON.stringify({ fanniId: String(offer.fanni || ''), price: offer.price, reason }));
      return res.json({ message: 'تم رفض العرض وإزالته', reason, offers: order.offers });
    } catch(e){ next(e); }
  });

  return router;
}

module.exports = createAdminOffersRouter;
