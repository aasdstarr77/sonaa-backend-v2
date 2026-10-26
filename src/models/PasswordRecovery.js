'use strict';

const mongoose = require('mongoose');

const recoveryMessageSchema = new mongoose.Schema({
  senderRole: { type: String, enum: ['user', 'admin'], required: true },
  senderId: { type: String, default: '' },
  text: { type: String, required: true, trim: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now }
}, { _id: true, versionKey: false });

const passwordRecoverySchema = new mongoose.Schema({
  ownerRole: { type: String, enum: ['client', 'fanni', 'admin'], required: true, index: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  accountName: { type: String, trim: true, maxlength: 100, default: '' },
  phone: { type: String, trim: true, maxlength: 30, required: true },
  subject: { type: String, trim: true, maxlength: 120, default: 'استعادة كلمة المرور' },
  accessTokenHash: { type: String, required: true, select: false },
  accessTokenEncrypted: { type: String, default: '', select: false },
  status: { type: String, enum: ['بانتظار الدعم', 'قيد التحقق', 'بانتظار رد المستخدم', 'تم التحقق', 'تمت الاستعادة', 'مرفوضة', 'منتهية'], default: 'بانتظار الدعم', index: true },
  verifiedBy: { type: String, default: '' },
  verifiedAt: { type: Date, default: null },
  codeHash: { type: String, default: '', select: false },
  codeExpiresAt: { type: Date, default: null },
  codeAttempts: { type: Number, default: 0 },
  codeUsedAt: { type: Date, default: null },
  messages: { type: [recoveryMessageSchema], default: [] },
  lastMessageAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, required: true, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

passwordRecoverySchema.index({ status: 1, lastMessageAt: -1 });
passwordRecoverySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

passwordRecoverySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  if (this.messages?.length) this.lastMessageAt = this.messages[this.messages.length - 1].createdAt || new Date();
  next();
});

module.exports = mongoose.models.PasswordRecovery || mongoose.model('PasswordRecovery', passwordRecoverySchema);
