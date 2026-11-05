'use strict';

const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  orderSn: { type: String, required: true, trim: true, uppercase: true, index: true },
  clientPhone: { type: String, required: true, trim: true, index: true },
  fanniId: { type: mongoose.Schema.Types.ObjectId, ref: 'Fanni', required: true, index: true },
  reviewerRole: { type: String, enum: ['client', 'fanni'], required: true },
  reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Fanni', default: null },
  stars: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, trim: true, maxlength: 500, default: '' },
  blockFuture: { type: Boolean, default: false }
}, { timestamps: true });

ratingSchema.index({ orderId: 1, reviewerRole: 1 }, { unique: true });
ratingSchema.index({ clientPhone: 1, fanniId: 1, blockFuture: 1 });
ratingSchema.index({ reviewerId: 1, clientPhone: 1, blockFuture: 1 });

module.exports = mongoose.model('Rating', ratingSchema);
