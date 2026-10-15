const mongoose = require('mongoose');
const settingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  value: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String },
  updatedById: { type: mongoose.Schema.Types.ObjectId, ref: 'Fanni' }
}, { timestamps: false });
settingsSchema.index({ key: 1 }, { unique: true });
module.exports = mongoose.model('Settings', settingsSchema);
