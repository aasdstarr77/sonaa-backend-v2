const mongoose = require('mongoose');
const txSchema = new mongoose.Schema({
  fanni: { type: mongoose.Schema.Types.ObjectId, ref: 'Fanni', required: true, index: true },
  fanniName: String, fanniPhone: String,
  type: { type: String, enum: ['إضافة رصيد','خصم عمولة','تسوية إدارية','استرداد'], required: true, index: true },
  amount: { type: Number, required: true },
  balanceAfter: { type: Number, required: true, min: 0 },
  relatedTopup: { type: mongoose.Schema.Types.ObjectId, ref: 'TopupRequest', index: true },
  relatedOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  reason: { type: String, required: true, maxlength: 500 },
  by: { type: String, required: true },
  idempotencyKey: { type: String, required: true, unique: true, index: true },
  createdAt: { type: Date, default: Date.now, index: true }
}, { timestamps: false });
module.exports = mongoose.model('WalletTx', txSchema);
