const mongoose = require('mongoose');

const decisionSchema = new mongoose.Schema({
  action: {
    type: String,
    enum: [
      'تسجيل',
      'موافقة',
      'رفض',
      'تعليق',
      'إعادة تفعيل',
      'إعادة للمراجعة',
      'تسوية إدارية',
      // الإجراءات الجديدة للوحة الإدارة الفخمة
      'ترقية مستوى',
      'إضافة شارة',
      'إزالة شارة',
      'تعديل ملاحظة',
      'تعديل حد',
      'تجميد محفظة',
      'إلغاء تجميد',
      'تعديل ثقة',
      'ترقية إداري',
      'تغيير منصب إداري',
      'سحب صلاحية إدارية'
    ],
    required: true
  },
  reason: { type: String, maxlength: 1000 },
  date: { type: Date, default: Date.now },
  by: { type: String, default: 'النظام' },
  byId: { type: mongoose.Schema.Types.ObjectId, ref: 'Fanni' },
  meta: { type: mongoose.Schema.Types.Mixed }
}, { _id: false });

const levelHistorySchema = new mongoose.Schema({
  from: { type: String },
  to: { type: String, required: true },
  date: { type: Date, default: Date.now },
  by: { type: String },
  byId: { type: mongoose.Schema.Types.ObjectId },
  reason: { type: String, maxlength: 500 }
}, { _id: false });

const fanniSchema = new mongoose.Schema({
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
    index: true,
    validate: {
      validator: v => /^01[0-9]{9}$/.test(v),
      message: 'رقم الهاتف يجب أن يكون 01xxxxxxxxx'
    }
  },
  passwordHash: {
    type: String,
    required: true,
    select: false
  },
  specialties: {
    type: [String],
    validate: [arr => arr.length > 0, 'التخصص مطلوب']
  },
  areas: {
    type: [String],
    validate: [arr => arr.length > 0, 'المنطقة مطلوبة']
  },
  works: [String],
  prices: {
    type: Map,
    of: new mongoose.Schema({
      from: String,
      desc: String
    }, { _id: false })
  },
  status: {
    type: String,
    enum: ['قيد المراجعة', 'معتمد', 'مرفوض', 'معلق'],
    default: 'قيد المراجعة',
    index: true
  },
  rejectionReason: { type: String, maxlength: 500 },
  suspensionReason: { type: String, maxlength: 500 },
  suspendedAt: Date,
  walletBalance: { type: Number, default: 0, min: 0 },
  decisions: [decisionSchema],
  role: {
    type: String,
    enum: ['fanni', 'admin'],
    default: 'fanni'
  },
  // صلاحية إدارية إضافية للفني دون تغيير حسابه أو تعطيل عمله كفني
  adminRole: {
    type: String,
    enum: ['مشرف', 'مشرف أول', 'مدير', 'قراءة فقط'],
    default: null,
    index: true
  },

  // ========== الحقول الجديدة للوحة الإدارة الفخمة - 22 قسم ==========
  
  // 1. نظام المستويات
  level: {
    type: String,
    enum: ['مبتدئ', 'ممارس', 'محترف', 'خبير مبتدئ', 'خبير', 'خبير أول', 'استشاري فني', 'نخبة', 'أسطوري'],
    default: 'مبتدئ',
    index: true
  },
  levelHistory: [levelHistorySchema],
  // auto: يُحسب المستوى من الإنجازات؛ manual: يحافظ على اختيار الإدارة حتى تعيد تفعيل التلقائي.
  levelMode: {
    type: String,
    enum: ['auto', 'manual'],
    default: 'auto',
    index: true
  },
  
  // 2. شارات الثقة والتميز
  badges: {
    type: [String],
    enum: ['trusted', 'top_rated', 'verified', 'fast_response', 'premium', 'gold'],
    default: []
  },
  badgesGrantedAt: {
    type: Map,
    of: Date
  },

  // 3. الملاحظات الداخلية للإدارة
  adminNote: {
    type: String,
    maxlength: 2000,
    default: ''
  },
  adminNotesHistory: [{
    note: { type: String, maxlength: 2000 },
    date: { type: Date, default: Date.now },
    by: { type: String },
    byId: { type: mongoose.Schema.Types.ObjectId }
  }],

  // 4. حدود الاستقبال
  limits: {
    maxOrders: { type: Number, default: 20, min: 0, max: 1000 },
    maxOffers: { type: Number, default: 50, min: 0, max: 1000 },
    dailyLimit: { type: Number, default: 10, min: 0, max: 100 },
    isLimited: { type: Boolean, default: false },
    reason: { type: String, maxlength: 500 }
  },

  // 5. تجميد المحفظة
  isFrozen: { type: Boolean, default: false, index: true },
  frozenAt: { type: Date },
  frozenReason: { type: String, maxlength: 500 },
  frozenBy: { type: String },

  // 6. درجة الثقة والتقييم
  trustScore: {
    type: Number,
    default: 50,
    min: 0,
    max: 100,
    index: true
  },
  rating: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0, min: 0 }
  },
  stats: {
    completedJobs: { type: Number, default: 0 },
    cancelledJobs: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    responseTime: { type: Number, default: 0 }, // بالدقائق
    lastActiveAt: { type: Date }
  },

  // 7. إعدادات إضافية
  isVerified: { type: Boolean, default: false },
  isFeatured: { type: Boolean, default: false },
  featuredUntil: { type: Date }

}, { timestamps: true });

fanniSchema.index({ phone: 1 }, { unique: true });

// فهارس منفصلة لتجنب جمع مصفوفتين في فهرس مركب واحد
fanniSchema.index({ status: 1, specialties: 1 });
fanniSchema.index({ status: 1, areas: 1 });

// فهارس جديدة للأداء
fanniSchema.index({ level: 1, status: 1 });
fanniSchema.index({ trustScore: -1 });
fanniSchema.index({ badges: 1 });
fanniSchema.index({ isFrozen: 1 });
fanniSchema.index({ createdAt: -1 });

fanniSchema.methods.toSafeJSON = function() {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

// دالة مساعدة لحساب المستوى تلقائياً حسب الإنجاز
fanniSchema.methods.calculateLevel = function() {
  const jobs = this.stats?.completedJobs || 0;
  const rating = this.rating?.average || 0;
  const score = this.trustScore || 50;

  if (jobs >= 100 && rating >= 4.8 && score >= 90) return 'أسطوري';
  if (jobs >= 75 && rating >= 4.7 && score >= 85) return 'نخبة';
  if (jobs >= 60 && rating >= 4.6 && score >= 80) return 'استشاري فني';
  if (jobs >= 45 && rating >= 4.5 && score >= 75) return 'خبير أول';
  if (jobs >= 30 && rating >= 4.4 && score >= 70) return 'خبير';
  if (jobs >= 20 && rating >= 4.2) return 'خبير مبتدئ';
  if (jobs >= 10 && rating >= 4.0) return 'محترف';
  if (jobs >= 5) return 'ممارس';
  return 'مبتدئ';
};

module.exports = mongoose.model('Fanni', fanniSchema);
