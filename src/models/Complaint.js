
'use strict';

const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  // كود الطلب الذي يكتبه العميل.
  sn: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    match: /^SN\d{6}$/,
    index: true
  },

  // اسم العميل الذي قدم الشكوى.
  clientName: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 50
  },

  // تفاصيل الشكوى.
  text: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 1000
  },

  // حالة الشكوى في لوحة الأدمن.
  status: {
    type: String,
    enum: [
      'جديدة',
      'قيد المراجعة',
      'تم الحل',
      'مرفوضة'
    ],
    default: 'جديدة',
    index: true
  },

  // ملاحظات داخلية للأدمن.
  adminNote: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: ''
  },

  // رد الأدمن على الشكوى، عند الحاجة.
  adminResponse: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: ''
  },

  // وقت مراجعة الشكوى.
  reviewedAt: {
    type: Date,
    default: null
  },

  // معرّف الأدمن الذي راجع الشكوى، إن توفر.
  reviewedBy: {
    type: String,
    trim: true,
    default: ''
  },

  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false,
  versionKey: false
});

// ترتيب الشكاوى حسب الحالة والأحدث.
complaintSchema.index({
  status: 1,
  createdAt: -1
});

// البحث عن شكاوى طلب معين.
complaintSchema.index({
  sn: 1,
  createdAt: -1
});

// تحديث وقت التعديل قبل الحفظ.
complaintSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Complaint', complaintSchema);
