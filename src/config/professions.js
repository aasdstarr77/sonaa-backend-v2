here// 24 مهنة - محدث بقسم التنظيف والخدمات المنزلية
const PROFESSIONS = [
  // === فنيين (14) ===
  { id: 1,  name: "فني دش",             slug: "dish",          icon: "📡", cat: "فنيين" },
  { id: 2,  name: "فني كاميرات",         slug: "cameras",       icon: "📹", cat: "فنيين" },
  { id: 3,  name: "كهربائي",            slug: "electric",      icon: "💡", cat: "فنيين" },
  { id: 4,  name: "سباك",               slug: "plumber",       icon: "🚿", cat: "فنيين" },
  { id: 5,  name: "نجار",               slug: "carpenter",     icon: "🪚", cat: "فنيين" },
  { id: 6,  name: "نقاش",               slug: "painter",       icon: "🎨", cat: "فنيين" },
  { id: 7,  name: "فني تكييف",           slug: "ac",            icon: "❄️", cat: "فنيين" },
  { id: 8,  name: "فني ثلاجة وغسالة",    slug: "appliance",     icon: "🧊", cat: "فنيين" },
  { id: 9,  name: "فني ألوميتال",        slug: "aluminum",      icon: "🪟", cat: "فنيين" },
  { id: 10, name: "حداد",               slug: "blacksmith",    icon: "🔨", cat: "فنيين" },
  { id: 11, name: "ميكانيكي سيارات",    slug: "mechanic",      icon: "🚗", cat: "فنيين" },
  { id: 12, name: "ونش إنقاذ",           slug: "winch",         icon: "🚨", cat: "فنيين" },
  { id: 13, name: "فني مفاتيح",          slug: "keys",          icon: "🔑", cat: "فنيين" },
  { id: 14, name: "فني سيراميك",        slug: "ceramic",       icon: "🧱", cat: "فنيين" },

  // === خدمات أخرى - تنظيف (10) ===
  { id: 15, name: "تنظيف شقق",           slug: "clean-apartment",  icon: "🏠", cat: "خدمات أخرى" },
  { id: 16, name: "تنظيف فلل",           slug: "clean-villa",      icon: "🏡", cat: "خدمات أخرى" },
  { id: 17, name: "غسيل سجاد وموكيت",    slug: "carpet-clean",     icon: "🧶", cat: "خدمات أخرى" },
  { id: 18, name: "تنظيف خزانات",        slug: "tank-clean",       icon: "💧", cat: "خدمات أخرى" },
  { id: 19, name: "مكافحة حشرات",        slug: "pest",             icon: "🪳", cat: "خدمات أخرى" },
  { id: 20, name: "نقل عفش",             slug: "moving",           icon: "📦", cat: "خدمات أخرى" },
  { id: 21, name: "تنظيف واجهات",        slug: "facade-clean",     icon: "🏢", cat: "خدمات أخرى" },
  { id: 22, name: "خدمة شغالات",         slug: "maid-service",     icon: "👩‍🍳", cat: "خدمات أخرى" },
  { id: 23, name: "غسيل سيارات منزلي",   slug: "car-wash",         icon: "🚿", cat: "خدمات أخرى" },
  { id: 24, name: "جنايني وتنسيق حدائق", slug: "gardener",         icon: "🌳", cat: "خدمات أخرى" },
];

const PROFESSION_NAMES = PROFESSIONS.map(p => p.name);
module.exports = { PROFESSIONS, PROFESSION_NAMES };
