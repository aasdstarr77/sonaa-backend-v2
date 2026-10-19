'use strict';

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipientRole: { type: String, enum: ['client', 'fanni'], required: true, index: true },
  recipientId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  type: { type: String, required: true, maxlength: 50 },
  title: { type: String, required: true, trim: true, maxlength: 100 },
  message: { type: String, required: true, trim: true, maxlength: 300 },
  link: { type: String, trim: true, maxlength: 200, default: '' },
  readAt: { type: Date, default: null, index: true },
  dedupeKey: { type: String, trim: true, maxlength: 200, default: undefined }
}, { timestamps: true });

notificationSchema.index({ recipientRole: 1, recipientId: 1, createdAt: -1 });
notificationSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Notification', notificationSchema);
