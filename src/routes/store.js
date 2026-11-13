'use strict';

const express = require('express');
const Joi = require('joi');
const StoreProduct = require('../models/StoreProduct');
const StoreOrder = require('../models/StoreOrder');
const { auth } = require('../middleware/auth');
const { clientAuth } = require('../middleware/clientAuth');
const { notifyAdmins, createNotification } = require('../utils/notifications');

const router = express.Router();
const orderSchema = Joi.object({
  productId: Joi.string().hex().length(24).required(),
  quantity: Joi.number().integer().min(1).max(1000).default(1),
  note: Joi.string().trim().max(1000).allow('').default('')
}).unknown(false);

router.get('/products', async (req, res, next) => {
  try {
    const products = await StoreProduct.find({ isActive: true }).sort({ createdAt: -1 }).select('name description details price originalPrice offerText type subscriptionDuration imageUrl stock createdAt').lean();
    return res.set('Cache-Control', 'no-store').json({ products });
  } catch (error) { return next(error); }
});

async function submitOrder(req, res, next, role) {
  let reservedProductId = null;
  let reservedQuantity = 0;
  try {
    const { error, value } = orderSchema.validate(req.body || {}, { abortEarly: false });
    if (error) return res.status(400).json({ message: 'راجع بيانات طلب الشراء.' });
    if (role === 'fanni' && req.user?.role !== 'fanni') return res.status(403).json({ message: 'الشراء متاح لحسابات الفنيين فقط.' });
    const buyer = role === 'client' ? req.client : req.user;
    if (!buyer || !buyer._id) return res.status(401).json({ message: 'سجّل الدخول لإرسال طلب الشراء.' });
    const product = await StoreProduct.findOne({ _id: value.productId, isActive: true });
    if (!product) return res.status(404).json({ message: 'المنتج غير متاح حاليًا.' });
    if (product.stock !== null) {
      const reserved = await StoreProduct.findOneAndUpdate({ _id: product._id, isActive: true, stock: { $gte: value.quantity } }, { $inc: { stock: -value.quantity } }, { new: true });
      if (!reserved) return res.status(409).json({ message: 'الكمية المطلوبة غير متاحة حاليًا.' });
      reservedProductId = product._id;
      reservedQuantity = value.quantity;
    }
    const total = Math.round((Number(product.price) * value.quantity + Number.EPSILON) * 100) / 100;
    const order = await StoreOrder.create({
      product: product._id, productName: product.name, productType: product.type || 'product', subscriptionDuration: product.subscriptionDuration || '', unitPrice: product.price,
      quantity: value.quantity, stockReserved: Boolean(reservedProductId), total, buyerRole: role, buyerId: buyer._id,
      buyerName: buyer.name || 'مستخدم', buyerPhone: buyer.phone || '',
      buyerNote: value.note, statusHistory: [{ status: 'جديد', note: 'تم استلام طلب الشراء', by: buyer.name || 'المستخدم' }]
    });
    await notifyAdmins({
      type: 'admin_store_order', title: 'طلب شراء جديد',
      message: 'طلب ' + order.productName + ' من ' + order.buyerName + ' بإجمالي ' + order.total + ' جنيه.',
      link: '/admin?tab=storeOrders', dedupeKey: 'store-order:' + String(order._id)
    });
    return res.status(201).json({ message: 'تم إرسال طلب الشراء للإدارة. هنتواصل معاك لتأكيد الطلب وطريقة الدفع.', order: {
      id: String(order._id), productName: order.productName, quantity: order.quantity,
      total: order.total, status: order.status, createdAt: order.createdAt
    } });
  } catch (error) {
    if (reservedProductId && reservedQuantity) await StoreProduct.updateOne({ _id: reservedProductId }, { $inc: { stock: reservedQuantity } }).catch(() => {});
    return next(error);
  }
}

router.post('/client/orders', clientAuth, (req, res, next) => submitOrder(req, res, next, 'client'));
router.post('/fanni/orders', auth('fanni'), (req, res, next) => submitOrder(req, res, next, 'fanni'));

router.get('/client/orders', clientAuth, async (req, res, next) => {
  try {
    const orders = await StoreOrder.find({ buyerRole: 'client', buyerId: req.client._id }).sort({ createdAt: -1 }).limit(100).lean();
    return res.set('Cache-Control', 'no-store').json({ orders });
  } catch (error) { return next(error); }
});
router.get('/fanni/orders', auth('fanni'), async (req, res, next) => {
  try {
    const orders = await StoreOrder.find({ buyerRole: 'fanni', buyerId: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
    return res.set('Cache-Control', 'no-store').json({ orders });
  } catch (error) { return next(error); }
});

module.exports = router;
