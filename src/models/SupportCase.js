'use strict';

const mongoose = require('mongoose');

const supportMessageSchema = new mongoose.Schema({
  senderRole: { type: String, enum: ['client', 'fanni', 'admin', 'assistant'], required: true },
  senderId: { type: String, default: '' },
  text: { type: String, required: true, trim: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now }
}, { _id: true, versionKey: false });

const supportCaseSchema = new mongoose.Schema({
  ownerRole: { type: String, enum: ['client', 'fanni'], required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  ownerName: { type: String, trim: true, maxlength: 100, default: '' },
  subject: { type: String, trim: true, maxlength: 120, default: 'استفسار عام' },
  status: {
    type: String,
    enum: ['جديدة', 'بانتظار الدعم', 'قيد المعالجة', 'بانتظار رد المستخدم', 'تم الحل', 'مغلقة'],
    default: 'جديدة',
    index: true
  },
  needsHuman: { type: Boolean, default: false, index: true },
  messages: { type: [supportMessageSchema], default: [] },
  lastMessageAt: { type: Date, default: Date.now, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: false, versionKey: false });

supportCaseSchema.index({ status: 1, needsHuman: 1, lastMessageAt: -1 });
supportCaseSchema.index({ ownerRole: 1, ownerId: 1, lastMessageAt: -1 });

supportCaseSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  if (this.messages?.length) this.lastMessageAt = this.messages[this.messages.length - 1].createdAt || new Date();
  next();
});

module.exports = mongoose.models.SupportCase || mongoose.model('SupportCase', supportCaseSchema);
