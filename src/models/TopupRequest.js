const mongoose = require('mongoose');
const topupSchema = new mongoose.Schema({
  fanni: { type: mongoose.Schema.Types.ObjectId, ref: 'Fanni', required: true, index: true },
  fanniName: String, fanniPhone: String,
  amount: { type: Number, required: true, min: 10, max: 10000 },
  senderNumber: { type: String, required: true },
  method: { type: String, enum: ['vodafone_cash','orange_cash','etisalat_cash','we_cash'], default: 'vodafone_cash', index: true },
  referenceNumber: { type: String, maxlength: 50, trim: true },
  proofUrl: String,
  status: { type: String, enum: ['قيد المراجعة','مقبول','مرفوض'], default: 'قيد المراجعة', index: true },
  isCredited: { type: Boolean, default: false, index: true },
  reviewReason: { type: String, maxlength: 500 },
  reviewedAt: Date, reviewedBy: String,
  idempotencyKey: { type: String, unique: true, sparse: true }
}, { timestamps: true });
module.exports = mongoose.model('TopupRequest', topupSchema);
