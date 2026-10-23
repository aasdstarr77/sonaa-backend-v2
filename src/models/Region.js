'use strict';

const mongoose = require('mongoose');

function normalizeRegionName(value) {
  return String(value || '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('ar-EG');
}

const regionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100,
    set: value => typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/g, ' ') : value
  },
  normalizedName: { type: String, required: true, unique: true, select: false },
  isActive: { type: Boolean, default: true, index: true },
  createdBy: { type: String, trim: true, maxlength: 120, default: '' }
}, { timestamps: true, versionKey: false });

regionSchema.pre('validate', function () {
  if (typeof this.name === 'string') {
    this.name = this.name.normalize('NFC').trim().replace(/\s+/g, ' ');
    this.normalizedName = normalizeRegionName(this.name);
  }
});

module.exports = mongoose.models.Region || mongoose.model('Region', regionSchema);
