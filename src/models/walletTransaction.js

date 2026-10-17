
'use strict';

const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
  fanni: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Fanni',
    required: true,
    index: true
  },

  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null,
    index: true
  },

  orderSN: {
    type: String,
    trim: true,
    maxlength: 20,
    default: ''
  },

  type: {
    type: String,
    enum: ['commission', 'topup', 'admin_adjustment', 'refund'],
    required: true,
    index: true
  },

  amount: {
    type: Number,
    required: true,
    validate: {
      validator: Number.isFinite,
      message: 'قيمة الحركة يجب أن تكون رقمًا صحيحًا'
    }
  },

  balanceBefore: {
    type: Number,
    required: true,
    min: 0
  },

  balanceAfter: {
    type: Number,
    required: true,
    min: 0
  },

  description: {
    type: String,
    trim: true,
    maxlength: 500,
    required: true
  },

  // يمنع تسجيل نفس الخصم مرتين.
  idempotencyKey: {
    type: String,
    required: true,
    unique: true,
    index: true,
    maxlength: 150
  },

  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  versionKey: false
});

walletTransactionSchema.index({
  fanni: 1,
  createdAt: -1
});

walletTransactionSchema.index({
  order: 1,
  type: 1
});

module.exports = mongoose.model(
  'WalletTransaction',
  walletTransactionSchema
);
