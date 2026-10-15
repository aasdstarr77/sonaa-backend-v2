const mongoose = require('mongoose');
const decisionSchema = new mongoose.Schema({
  action: { type: String, enum: ['تسجيل','موافقة','رفض','تعليق','إعادة تفعيل','إعادة للمراجعة','تسوية إدارية'], required: true },
  reason: { type: String, maxlength: 500 },
  date: { type: Date, default: Date.now },
  by: { type: String, default: 'النظام' },
  byId: { type: mongoose.Schema.Types.ObjectId, ref: 'Fanni' }
}, { _id: false });
const fanniSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },
  phone: { type: String, required: true, unique: true, index: true, validate: { validator: v => /^01[0-9]{9}$/.test(v), message: 'رقم الهاتف يجب أن يكون 01xxxxxxxxx' } },
  passwordHash: { type: String, required: true, select: false },
  specialties: { type: [String], validate: [arr => arr.length > 0, 'التخصص مطلوب'] },
  areas: { type: [String], validate: [arr => arr.length > 0, 'المنطقة مطلوبة'] },
  works: [String],
  prices: { type: Map, of: new mongoose.Schema({ from: String, desc: String }, {_id:false}) },
  status: { type: String, enum: ['قيد المراجعة','معتمد','مرفوض','معلق'], default: 'قيد المراجعة', index: true },
  rejectionReason: { type: String, maxlength: 500 },
  suspensionReason: { type: String, maxlength: 500 },
  suspendedAt: Date,
  walletBalance: { type: Number, default: 0, min: 0 },
  decisions: [decisionSchema],
  role: { type: String, enum: ['fanni','admin'], default: 'fanni' }
}, { timestamps: true });
fanniSchema.index({ phone: 1 }, { unique: true });
fanniSchema.index({ status: 1, specialties: 1, areas: 1 });
fanniSchema.methods.toSafeJSON = function() { const obj = this.toObject(); delete obj.passwordHash; return obj; };
module.exports = mongoose.model('Fanni', fanniSchema);
