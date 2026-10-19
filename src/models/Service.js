const mongoose = require('mongoose');

/**
 * موديل الخدمات في مشروع صُنّاع.
 *
 * - يحفظ الخدمات والأقسام في قاعدة البيانات.
 * - يمنع تكرار الخدمة داخل القسم نفسه.
 * - لا يحذف الخدمة عند إخفائها؛ يستخدم isActive = false.
 * - لا ينشئ بيانات تلقائياً ولا ينفذ أي ترحيل.
 */

function normalizeText(value) {
  if (typeof value !== 'string') return '';

  return value
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '');
}

const serviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'اسم الخدمة مطلوب'],
      trim: true,
      minlength: [1, 'اسم الخدمة لا يمكن أن يكون فارغاً'],
      maxlength: [100, 'اسم الخدمة طويل جداً'],
      set: function (value) {
        return typeof value === 'string'
          ? value.normalize('NFC').trim().replace(/\s+/g, ' ')
          : value;
      },
      validate: {
        validator: function (value) {
          return typeof value === 'string' && value.trim().length > 0;
        },
        message: 'اسم الخدمة لا يمكن أن يكون فارغاً'
      }
    },

    normalizedName: {
      type: String,
      required: true,
      select: false
    },

    category: {
      type: String,
      required: [true, 'اسم القسم مطلوب'],
      trim: true,
      minlength: [1, 'اسم القسم لا يمكن أن يكون فارغاً'],
      maxlength: [100, 'اسم القسم طويل جداً'],
      set: function (value) {
        return typeof value === 'string'
          ? value.normalize('NFC').trim().replace(/\s+/g, ' ')
          : value;
      },
      validate: {
        validator: function (value) {
          return typeof value === 'string' && value.trim().length > 0;
        },
        message: 'اسم القسم لا يمكن أن يكون فارغاً'
      }
    },

    normalizedCategory: {
      type: String,
      required: true,
      select: false
    },

    emoji: {
      type: String,
      trim: true,
      default: '🔧',
      maxlength: [20, 'رمز الخدمة طويل جداً']
    },

    isActive: {
      type: Boolean,
      default: true
    },

    sortOrder: {
      type: Number,
      default: 0,
      min: [0, 'ترتيب الخدمة لا يمكن أن يكون سالباً']
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

/**
 * إنشاء الأسماء الموحّدة تلقائياً عند التحقق من المستند.
 */
serviceSchema.pre('validate', function () {
  if (typeof this.name === 'string') {
    this.name = this.name.normalize('NFC').trim().replace(/\s+/g, ' ');
    this.normalizedName = normalizeText(this.name);
  }

  if (typeof this.category === 'string') {
    this.category = this.category.normalize('NFC').trim().replace(/\s+/g, ' ');
    this.normalizedCategory = normalizeText(this.category);
  }
});

/**
 * منع تكرار الخدمة داخل القسم نفسه.
 * الفهرس لا يعتمد على isActive؛ لذلك لا يسمح بإعادة إنشاء
 * الخدمة نفسها داخل القسم حتى لو كانت مخفية.
 */
serviceSchema.index(
  { normalizedCategory: 1, normalizedName: 1 },
  {
    unique: true,
    name: 'uniq_service_per_category'
  }
);

/**
 * فهرس يساعد في جلب الخدمات النشطة مرتبة داخل الأقسام.
 */
serviceSchema.index(
  { isActive: 1, normalizedCategory: 1, sortOrder: 1 },
  { name: 'active_services_order' }
);

/**
 * منع تسجيل الموديل أكثر من مرة عند إعادة تحميل الملفات.
 */
module.exports =
  mongoose.models.Service ||
  mongoose.model('Service', serviceSchema);
