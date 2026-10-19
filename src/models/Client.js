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
  status: {
    type: String,
    enum: ['نشط', 'معلق'],
    default: 'نشط',
    index: true
  }
}, {
  timestamps: true
});


clientSchema.methods.toSafeJSON = function () {
  const data = this.toObject();
  delete data.passwordHash;
  delete data.__v;
  return data;
};

module.exports = mongoose.model('Client', clientSchema);
