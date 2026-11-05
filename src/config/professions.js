
'use strict';

// المصدر الموحد لخدمات مشروع صُنّاع.
// نحافظ على أسماء الخدمات وترتيب الأقسام والتوافق مع الملفات القديمة.

const CATEGORIES = [
  {
    label: 'دش وكاميرات وشاشات',
    emoji: '📡',
    services: [
      'تركيب دش',
      'صيانة دش',
      'تركيب كاميرات مراقبة',
      'صيانة كاميرات مراقبة',
      'تركيب رسيفر',
      'صيانة رسيفر',
      'صيانة شاشة تلفزيون',
      'تركيب شبكة إنترنت منزلية',
      'صيانة أجهزة استقبال'
    ]
  },
  {
    label: 'التنظيف',
    emoji: '🧹',
    services: [
      'تنظيف شقق',
      'تنظيف منازل',
      'تنظيف مكاتب',
      'تنظيف بعد التشطيب',
      'تنظيف سجاد وموكيت',
      'تنظيف كنب وانتريهات',
      'تنظيف زجاج وواجهات',
      'تنظيف مطابخ',
      'تنظيف حمامات',
      'تنظيف خزانات مياه',
      'تنظيف مراتب',
      'تنظيف واجهات مباني',
      'مكافحة حشرات'
    ]
  },
  {
    label: 'الكهرباء',
    emoji: '⚡',
    services: [
      'كهربائي منازل',
      'تأسيس كهرباء',
      'إصلاح أعطال الكهرباء',
      'تركيب نجف وإضاءة',
      'تركيب مفاتيح وبرايز',
      'تركيب مراوح سقف',
      'تركيب قواطع كهربائية',
      'صيانة لوحة الكهرباء',
      'كهربائي سيارات'
    ]
  },
  {
    label: 'السباكة',
    emoji: '🚿',
    services: [
      'سباك منازل',
      'إصلاح تسريب مياه',
      'تسليك صرف صحي',
      'تغيير حوض',
      'تركيب خلاطات',
      'تغيير خلاطات',
      'تركيب أطقم حمامات',
      'تركيب مواسير',
      'صيانة سخان مياه',
      'تركيب مواتير مياه',
      'صيانة خزانات مياه',
      'تركيب قاعدة حمام',
      'إصلاح سيفون'
    ]
  },
  {
    label: 'التكييف والتبريد',
    emoji: '❄️',
    services: [
      'تركيب تكييف',
      'صيانة تكييف',
      'تنظيف تكييف',
      'شحن فريون تكييف',
      'صيانة ثلاجات',
      'صيانة ديب فريزر',
      'صيانة مبرد مياه'
    ]
  },
  {
    label: 'الأجهزة المنزلية',
    emoji: '🧺',
    services: [
      'صيانة غسالات',
      'صيانة غسالات أطباق',
      'صيانة بوتاجازات',
      'صيانة أفران',
      'صيانة ميكروويف',
      'صيانة سخانات كهرباء',
      'صيانة أجهزة منزلية أخرى'
    ]
  },
  {
    label: 'النجارة والأثاث',
    emoji: '🪚',
    services: [
      'نجار موبيليا',
      'نجار أبواب وشبابيك',
      'تصليح أثاث',
      'تركيب أثاث',
      'تركيب مطابخ',
      'صيانة دواليب',
      'تغيير كالون باب',
      'تركيب أقفال',
      'إصلاح مفصلات الأبواب'
    ]
  },
  {
    label: 'النقاشة والديكور',
    emoji: '🎨',
    services: [
      'نقاش ودهانات',
      'دهانات شقق',
      'جبس بورد',
      'فني ديكور',
      'ورق حائط',
      'معالجة شروخ الحوائط',
      'ترميمات منزلية'
    ]
  },
  {
    label: 'الألوميتال والزجاج',
    emoji: '🪟',
    services: [
      'فني ألوميتال',
      'صيانة شبابيك ألوميتال',
      'تركيب زجاج',
      'تصليح أبواب ألوميتال',
      'تركيب سلك شبابيك'
    ]
  },
  {
    label: 'البناء والتشطيبات',
    emoji: '🧱',
    services: [
      'مبلط سيراميك',
      'فني رخام',
      'محارة وبياض',
      'عامل بناء',
      'تركيب أرضيات',
      'عزل أسطح وحمامات',
      'صيانة أبواب وشبابيك',
      'تركيب حجر',
      'تركيب وزر'
    ]
  },
  {
    label: 'الكمبيوتر والإنترنت',
    emoji: '💻',
    services: [
      'فني كمبيوتر',
      'صيانة لابتوب',
      'صيانة طابعات',
      'تركيب راوتر',
      'إصلاح أعطال الإنترنت',
      'صيانة موبايلات',
      'تركيب شبكات داخلية'
    ]
  },
  {
    label: 'النقل والتركيب',
    emoji: '🚚',
    services: [
      'نقل أثاث',
      'فك وتركيب أثاث',
      'نقل أجهزة منزلية',
      'تركيب ستائر',
      'تركيب رفوف',
      'تركيب مرايات'
    ]
  },
  {
    label: 'خدمات أخرى',
    emoji: '🛠️',
    services: [
      'فني غاز',
      'صيانة أقفال',
      'تركيب أبواب',
      'فني لحام',
      'صيانة مواتير',
      'فني مضخات',
      'تركيب سخانات',
      'خدمة صيانة منزلية أخرى'
    ]
  }
];

// توحيد المسافات فقط، مع الحفاظ على الاسم العربي كما هو.
function normalizeServiceName(value) {
  if (typeof value !== 'string') return '';

  return value.trim().replace(/\s+/g, ' ');
}

// استخراج جميع الخدمات ومنع تكرار الاسم بعد توحيد المسافات.
const ALL_SERVICES = [
  ...new Set(
    CATEGORIES.flatMap(category =>
      category.services.map(normalizeServiceName)
    )
  )
];

// التحقق من وجود خدمة في القائمة الموحدة.
function isValidService(serviceName) {
  const normalized = normalizeServiceName(serviceName);

  return normalized !== '' && ALL_SERVICES.includes(normalized);
}

// البحث عن القسم الذي تنتمي إليه الخدمة.
function findCategoryByService(serviceName) {
  const normalized = normalizeServiceName(serviceName);

  if (!normalized) return null;

  return CATEGORIES.find(category =>
    category.services.some(
      service => normalizeServiceName(service) === normalized
    )
  ) || null;
}

// البحث عن قسم باسمه.
function findCategoryByLabel(label) {
  const normalized = normalizeServiceName(label);

  if (!normalized) return null;

  return CATEGORIES.find(
    category =>
      normalizeServiceName(category.label) === normalized
  ) || null;
}

// إرجاع نسخة من خدمات قسم معين، حتى لا نعيد المصفوفة الأصلية مباشرة.
function getServicesByCategory(categoryLabel) {
  const category = findCategoryByLabel(categoryLabel);

  return category ? [...category.services] : [];
}

// التوافق مع الملفات القديمة التي تستخدم أسماء المهن.
const PROFESSIONS = CATEGORIES.map(category => ({
  name: category.label,
  emoji: category.emoji,
  services: [...category.services]
}));

const PROFESSION_NAMES = PROFESSIONS.map(
  profession => profession.name
);

// فحص القائمة واكتشاف أسماء الخدمات المكررة بين الأقسام.
function getCatalogIssues() {
  const issues = [];
  const categoryNames = new Set();
  const serviceLocations = new Map();

  for (const category of CATEGORIES) {
    const normalizedLabel = normalizeServiceName(category.label);

    if (!normalizedLabel) {
      issues.push('يوجد قسم بدون اسم.');
    } else if (categoryNames.has(normalizedLabel)) {
      issues.push(`اسم قسم مكرر: ${normalizedLabel}`);
    }

    categoryNames.add(normalizedLabel);

    if (!Array.isArray(category.services)) {
      issues.push(`قائمة الخدمات غير صحيحة في القسم: ${category.label}`);
      continue;
    }

    for (const service of category.services) {
      const normalizedService = normalizeServiceName(service);

      if (!normalizedService) {
        issues.push(`خدمة فارغة في القسم: ${category.label}`);
        continue;
      }

      if (serviceLocations.has(normalizedService)) {
        issues.push(
          `خدمة مكررة: ${normalizedService} — ` +
          `في القسمين "${serviceLocations.get(normalizedService)}" و"${category.label}"`
        );
      } else {
        serviceLocations.set(normalizedService, category.label);
      }
    }
  }

  return issues;
}

// الحفاظ على جميع التصديرات الحالية وإضافة الدوال الجديدة.
module.exports = {
  CATEGORIES,
  ALL_SERVICES,
  PROFESSIONS,
  PROFESSION_NAMES,
  normalizeServiceName,
  isValidService,
  findCategoryByService,
  findCategoryByLabel,
  getServicesByCategory,
  getCatalogIssues
};
