'use strict';

const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
  key: { type: String, required: true, maxlength: 50 },
  before: { type: mongoose.Schema.Types.Mixed },
  after: { type: mongoose.Schema.Types.Mixed },
  by: { type: String, default: 'الإدارة', maxlength: 120 },
  byId: { type: String, default: '', maxlength: 120 },
  reason: { type: String, default: '', maxlength: 500 },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const adminConfigSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'main', required: true },
  pricing: {
    check: { type: Number, min: 0, max: 100000, default: 0 },
    commission: { type: Number, min: 0, max: 100, default: 10 },
    minOffer: { type: Number, min: 1, max: 1000000, default: 1 },
    maxOffer: { type: Number, min: 1, max: 1000000, default: 1000000 }
  },
  settings: {
    siteName: { type: String, trim: true, maxlength: 100, default: 'صُنّاع' },
    maintenance: { type: Boolean, default: false },
    maintenanceMessage: { type: String, trim: true, maxlength: 500, default: '' },
    maxFanniSignupAttempts: { type: Number, min: 1, max: 100, default: 5 },
    walletPhone1: { type: String, trim: true, maxlength: 20, default: '' },
    walletPhone2: { type: String, trim: true, maxlength: 20, default: '' }
  },
  content: {
    announcement: { type: String, trim: true, maxlength: 1000, default: '' },
    faqs: [{
      question: { type: String, trim: true, maxlength: 250, required: true },
      answer: { type: String, trim: true, maxlength: 1000, required: true },
      active: { type: Boolean, default: true },
      createdAt: { type: Date, default: Date.now }
    }]
  },
  adminUiLayout: { type: Object, default: {} },
  clientUiLayout: { type: Object, default: {} },
  fanniUiLayout: { type: Object, default: {} },
  passwordUiLayout: { type: Object, default: {} },
  supportUiLayout: { type: Object, default: {} },
  history: { type: [historySchema], default: [] }

}, { timestamps: true, versionKey: false });

module.exports = mongoose.models.AdminConfig || mongoose.model('AdminConfig', adminConfigSchema);
