'use strict';

const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 50
  },
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    match: /^01[0-9]{9}$/
  },
  passwordHash: {
    type: String,
    required: true,
    select: false
  },
  tokenVersion: { type: Number, default: 0, min: 0 },
  status: {
    type: String,
    enum: ['نشط', 'معلق'],
    default: 'نشط',
    index: true
  },
  adminNote: { type: String, trim: true, maxlength: 2000, default: '' },
  adminNotesHistory: [{
    note: { type: String, trim: true, maxlength: 2000, required: true },
    date: { type: Date, default: Date.now },
    by: { type: String, trim: true, maxlength: 50, default: 'الإدارة' },
    byId: { type: mongoose.Schema.Types.ObjectId, ref: 'Fanni' }
  }]
}, {
  timestamps: true
});


clientSchema.methods.toSafeJSON = function () {
  const data = this.toObject();
  delete data.passwordHash;
  delete data.tokenVersion;
  delete data.__v;
  return data;
};

module.exports = mongoose.model('Client', clientSchema);
