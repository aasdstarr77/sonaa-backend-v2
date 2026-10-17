
'use strict';

const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  // الطلب الأصلي المرتبطة به الشكوى.
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },

  // كود الطلب للبحث والمراجعة داخل لوحة الأدمن.
  sn: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    match: /^SN\d{6}$/,
    index: true
  },

  // نص الشكوى المرسل من العميل.
  text: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 1000
  },

  // حالة الشكوى داخل لوحة الأدمن.
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

  // ملاحظات الأدمن الداخلية، لا تظهر للعميل تلقائيًا.
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

  // وقت آخر مراجعة للشكوى.
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

// فهرس لمساعدة لوحة الأدمن في عرض الشكاوى الأحدث حسب الحالة.
complaintSchema.index({
  status: 1,
  createdAt: -1
});

// يسمح بوجود أكثر من شكوى للطلب نفسه.
complaintSchema.index({
  order: 1,
  createdAt: -1
});

// تحديث وقت التعديل قبل الحفظ.
complaintSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Complaint', complaintSchema);
