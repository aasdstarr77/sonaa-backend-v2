'use strict';

const mongoose = require('mongoose');

const adminAuditLogSchema = new mongoose.Schema({
  action: { type: String, required: true, trim: true, maxlength: 100 },
  target: { type: String, default: '', trim: true, maxlength: 200 },
  details: { type: String, default: '', trim: true, maxlength: 1000 },
  adminName: { type: String, default: 'الإدارة', trim: true, maxlength: 120 },
  adminId: { type: String, default: '', maxlength: 120 },
  category: { type: String, default: 'admin', maxlength: 50 },
  ip: { type: String, default: '', maxlength: 80 },
  createdAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });

adminAuditLogSchema.index({ createdAt: -1, category: 1 });

module.exports = mongoose.models.AdminAuditLog || mongoose.model('AdminAuditLog', adminAuditLogSchema);
