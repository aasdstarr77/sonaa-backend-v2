'use strict';

const express = require('express');

function createAdminStoreRouter({ auth, Joi, StoreProduct, StoreOrder, notifyAdmins, createNotification, writeAdminAudit }) {
  const router = express.Router();
  const productSchema = Joi.object({
    name: Joi.string().trim().min(2).max(120).required(),
    description: Joi.string().trim().max(2000).allow('').default(''),
    details: Joi.string().trim().max(5000).allow('').default(''),
    price: Joi.number().min(0).max(100000000).required(),
    originalPrice: Joi.number().min(0).max(100000000).allow(null).default(null),
    offerText: Joi.string().trim().max(200).allow('').default(''),
    type: Joi.string().valid('product', 'subscription').default('product'),
    subscriptionDuration: Joi.string().trim().max(60).allow('').default(''),
    imageUrl: Joi.string().uri({ scheme: ['http', 'https'] }).max(1000).allow('').default(''),
    isActive: Joi.boolean().default(true),
    stock: Joi.number().integer().min(0).allow(null).default(null)
  }).unknown(false);
  const statusSchema = Joi.object({
    status: Joi.string().valid('تم التواصل', 'قيد التجهيز', 'مكتمل', 'ملغي').required(),
    adminNote: Joi.string().trim().max(1000).allow('').default(''),
    paymentMethod: Joi.string().valid('غير محدد', 'عند الاستلام', 'تحويل').default('غير محدد')
  }).unknown(false);

  router.get('/store/products', auth('admin'), async (req, res, next) => {
    try {
      const products = await StoreProduct.find({}).sort({ createdAt: -1 }).limit(500).lean();
      return res.set('Cache-Control', 'no-store').json({ products });
    } catch (error) { return next(error); }
  });
  router.post('/store/products', auth('admin'), async (req, res, next) => {
    try {
      const checked = productSchema.validate(req.body || {}, { abortEarly: false });
      if (checked.error) return res.status(400).json({ message: 'راجع اسم المنتج والسعر وباقي البيانات.' });
      const product = await StoreProduct.create(checked.value);
      await writeAdminAudit(req, 'إضافة منتج للمتجر', 'store', String(product._id), product.name);
      return res.status(201).json({ message: 'تمت إضافة المنتج للمتجر.', product });
    } catch (error) { return next(error); }
  });
  router.put('/store/products/:id', auth('admin'), async (req, res, next) => {
    try {
      if (!/^[a-f0-9]{24}$/i.test(String(req.params.id))) return res.status(400).json({ message: 'معرّف المنتج غير صالح.' });
      const checked = productSchema.validate(req.body || {}, { abortEarly: false });
      if (checked.error) return res.status(400).json({ message: 'راجع بيانات المنتج.' });
      const product = await StoreProduct.findByIdAndUpdate(req.params.id, { $set: checked.value }, { new: true, runValidators: true });
      if (!product) return res.status(404).json({ message: 'المنتج غير موجود.' });
      await writeAdminAudit(req, 'تعديل منتج المتجر', 'store', String(product._id), product.name);
      return res.json({ message: 'تم تحديث المنتج.', product });
    } catch (error) { return next(error); }
  });
  router.delete('/store/products/:id', auth('admin'), async (req, res, next) => {
    try {
      if (!/^[a-f0-9]{24}$/i.test(String(req.params.id))) return res.status(400).json({ message: 'معرّف المنتج غير صالح.' });
      const product = await StoreProduct.findByIdAndUpdate(req.params.id, { $set: { isActive: false } }, { new: true });
      if (!product) return res.status(404).json({ message: 'المنتج غير موجود.' });
      await writeAdminAudit(req, 'إخفاء منتج من المتجر', 'store', String(product._id), product.name);
      return res.json({ message: 'تم إخفاء المنتج مع الحفاظ على سجل الطلبات.' });
    } catch (error) { return next(error); }
  });
  router.get('/store/orders', auth('admin'), async (req, res, next) => {
    try {
      const orders = await StoreOrder.find({}).sort({ createdAt: -1 }).limit(500).lean();
      return res.set('Cache-Control', 'no-store').json({ orders });
    } catch (error) { return next(error); }
  });
  router.patch('/store/orders/:id', auth('admin'), async (req, res, next) => {
    try {
      if (!/^[a-f0-9]{24}$/i.test(String(req.params.id))) return res.status(400).json({ message: 'معرّف المعاملة غير صالح.' });
      const checked = statusSchema.validate(req.body || {}, { abortEarly: false });
      if (checked.error) return res.status(400).json({ message: 'حالة المعاملة غير صالحة.' });
      const order = await StoreOrder.findById(req.params.id);
      if (!order) return res.status(404).json({ message: 'المعاملة غير موجودة.' });
      if (order.status === 'ملغي' && checked.value.status !== 'ملغي') return res.status(409).json({ message: 'الطلب الملغي لا يمكن إعادة فتحه؛ سجّل طلبًا جديدًا عند الحاجة.' });
      if (checked.value.status === 'ملغي' && order.status !== 'ملغي' && order.stockReserved) {
        await StoreProduct.updateOne({ _id: order.product }, { $inc: { stock: order.quantity } });
        order.stockReserved = false;
      }
      order.status = checked.value.status;
      order.adminNote = checked.value.adminNote;
      order.paymentMethod = checked.value.paymentMethod;
      order.statusHistory.push({ status: order.status, note: order.adminNote, by: req.user?.name || 'الإدارة', at: new Date() });
      await order.save();
      await writeAdminAudit(req, 'تحديث حالة طلب متجر', 'store-orders', String(order._id), order.status);
      await createNotification({
        recipientRole: order.buyerRole, recipientId: order.buyerId,
        type: 'store_order_update', title: 'تحديث طلب المتجر',
        message: 'طلب ' + order.productName + ': ' + order.status + '، الدفع: ' + order.paymentMethod + (order.adminNote ? ' — ' + order.adminNote : ''),
        link: order.buyerRole === 'client' ? '/client?tab=store' : '/fanni?tab=store'
      });
      return res.json({ message: 'تم تحديث حالة الطلب وإرسال إشعار لصاحبه.', order });
    } catch (error) { return next(error); }
  });
  return router;
}

module.exports = createAdminStoreRouter;
