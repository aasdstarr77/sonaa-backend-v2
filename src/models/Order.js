
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

  priceNum: Number,

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

  // المنطقة العامة أو الحي، ويظهر للفني لتحديد نطاق الخدمة.
  // أبقيناه مطلوبًا للتوافق مع الطلبات الحالية.
  area: {
    type: String,
    required: true,
    trim: true,
    maxlength: 250
  },

  // العنوان التفصيلي للعميل.
  // اختياري للتوافق مع الطلبات القديمة التي لا تحتوي عليه.
  // إخفاؤه عن الفني قبل قبول العرض يجب تطبيقه في مسارات الـ API أيضًا.
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
