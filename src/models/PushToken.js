'use strict';

const mongoose = require('mongoose');

const pushTokenSchema = new mongoose.Schema({
  recipientRole: { type: String, enum: ['client', 'fanni', 'admin'], required: true, index: true },
  recipientId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  token: { type: String, required: true, unique: true, trim: true, maxlength: 200 },
  platform: { type: String, enum: ['android', 'ios'], default: 'android' }
}, { timestamps: true });

pushTokenSchema.index({ recipientRole: 1, recipientId: 1 });

module.exports = mongoose.model('PushToken', pushTokenSchema);
