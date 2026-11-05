'use strict';

const mongoose = require('mongoose');

const supportPasswordSchema = new mongoose.Schema({
  ownerRole: { type: String, enum: ['client', 'fanni'], required: true, index: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  encryptedPassword: { type: String, required: true, select: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Fanni', required: true },
  createdAt: { type: Date, default: Date.now, required: true },
  usedAt: { type: Date, default: null },
  usedIp: { type: String, default: '', maxlength: 64 },
  usedUserAgent: { type: String, default: '', maxlength: 300 },
  revokedAt: { type: Date, default: null },
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Fanni', default: null }
}, { versionKey: false });

supportPasswordSchema.index({ ownerRole: 1, accountId: 1, usedAt: 1, revokedAt: 1 });
supportPasswordSchema.index({ createdAt: -1 });

module.exports = mongoose.models.SupportPassword || mongoose.model('SupportPassword', supportPasswordSchema);
