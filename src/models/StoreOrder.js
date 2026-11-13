'use strict';

const mongoose = require('mongoose');

const storeOrderSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'StoreProduct', required: true, index: true },
  productName: { type: String, required: true, trim: true, maxlength: 120 },
  unitPrice: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, min: 1, max: 1000 },
  total: { type: Number, required: true, min: 0 },
  buyerRole: { type: String, enum: ['client', 'fanni'], required: true, index: true },
  buyerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  buyerName: { type: String, required: true, trim: true, maxlength: 100 },
  buyerPhone: { type: String, required: true, trim: true, maxlength: 20 },
  buyerNote: { type: String, trim: true, maxlength: 1000, default: '' },
  status: { type: String, enum: ['جديد', 'تم التواصل', 'قيد التجهيز', 'مكتمل', 'ملغي'], default: 'جديد', index: true },
  adminNote: { type: String, trim: true, maxlength: 1000, default: '' },
  statusHistory: [{ status: String, note: String, by: String, at: { type: Date, default: Date.now } }]
}, { timestamps: true });

storeOrderSchema.index({ createdAt: -1 });
storeOrderSchema.index({ buyerRole: 1, buyerId: 1, createdAt: -1 });
module.exports = mongoose.model('StoreOrder', storeOrderSchema);
