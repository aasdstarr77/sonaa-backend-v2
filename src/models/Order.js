
'use strict';

const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  fanni: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Fanni',
    required: true
  },

  fanniId: String,
  fanniName: String,
  fanniPhone: String,

  price: {
    type: String,
    required: true
  },

  priceNum: {
    type: Number,
    min: 0
  },

  message: {
    type: String,
    maxlength: 500
  },

  date: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const orderSchema = new mongoose.Schema({
  sn: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  service: {
    type: String,
    required: true,
    index: true
  },

  // المنطقة العامة أو الحي.
  area: {
    type: String,
    required: true,
    trim: true,
    maxlength: 250
  },

  // العنوان التفصيلي للعميل.
  // إظهاره للفني يجب أن يكون بعد قبول العرض
  // ومن خلال مسار API يتحقق من هوية الفني المعيّن.
  address: {
    type: String,
    trim: true,
    maxlength: 250,
    default: ''
  },

  city: {
    type: String,
    trim: true,
    maxlength: 100
  },

  clientName: {
    type: String,
    trim: true,
    maxlength: 50
  },

  clientPhone: {
    type: String,
    required: true,
    trim: true
  },

  description: {
    type: String,
    maxlength: 1000
  },

  budget: String,

  status: {
    type: String,
    enum: [
      'قيد المراجعة',
      'تم النشر',
      'وصلتك عروض',
      'تم اختيار فني',
      'تم الانتهاء',
      'منتهي',
      'اعتذار',
      'منتهي - اعتذار'
    ],
    default: 'قيد المراجعة',
    index: true
  },

  offers: [offerSchema],

  assignedFanni: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Fanni'
  },

  assignedFanniName: String,

  // بيانات العرض الذي وافق عليه العميل.
  // نحتفظ بها لتحديد السعر الصحيح الذي تُحسب منه العمولة.
  acceptedOfferId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },

  acceptedOfferPrice: {
    type: Number,
    min: 0,
    default: null
  },

  // حقول تتبّع عمولة المنصة.
  // تفعيل الخصم الفعلي يتم في مسار قبول العرض،
  // وليس بمجرد إنشاء الطلب أو إرسال العرض.
  commissionRate: {
    type: Number,
    min: 0,
    max: 100,
    default: 10
  },

  commissionAmount: {
    type: Number,
    min: 0,
    default: 0
  },

  commissionCharged: {
    type: Boolean,
    default: false,
    index: true
  },

  commissionChargedAt: {
    type: Date,
    default: null
  },

  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 48 * 60 * 60 * 1000),
    index: true
  },

  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: false
});

module.exports = mongoose.model('Order', orderSchema);
