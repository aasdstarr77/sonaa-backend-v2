'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const mongoose = require('mongoose');
const crypto = require('crypto');

const Fanni = require('../models/Fanni');
const Client = require('../models/Client');
const Notification = require('../models/Notification');
const TopupRequest = require('../models/TopupRequest');
const Order = require('../models/Order');
const Rating = require('../models/Rating');
const Complaint = require('../models/Complaint');
const WalletTransaction = require('../models/WalletTransaction');
const { createNotification } = require('../utils/notifications');
const Service = require('../models/Service');
const Region = require('../models/Region');
const AdminConfig = require('../models/AdminConfig');
const AdminAuditLog = require('../models/AdminAuditLog');
const { createAdminAuditWriter } = require('../services/auditLogService');
const PageVisit = require('../models/PageVisit');

const {
  CATEGORIES,
  ALL_SERVICES,
  normalizeServiceName,
  findCategoryByService,
  findCategoryByLabel
} = require('../config/professions');

const { auth, defaultAdminPermissions, ADMIN_PERMISSION_KEYS } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { normalizePhone } = require('../utils/phone');
const router = express.Router();

const ADMIN_TOKEN_EXPIRY = '1d';
const MAX_LIST_LIMIT = 500;

const loginSchema = Joi.object({
  phone: Joi.string().trim().optional(),
  email: Joi.string().trim().email().optional(),
  password: Joi.string().min(1).required()
}).or('phone', 'email');

const amountSchema = Joi.number()
  .strict()
  .min(0)
  .max(100000000)
  .required();

const reasonSchema = Joi.string().trim().max(500).allow('');

const complaintStatusSchema = Joi.string().valid(
  'جديدة',
  'قيد المراجعة',
  'تم الحل',
  'مرفوضة'
);

function publicFanni(fanni) {
  const item = typeof fanni.toObject === 'function'
    ? fanni.toObject()
    : { ...fanni };
  delete item.passwordHash;
  delete item.__v;
  const statusMap = {
    'معتمد': 'approved',
    'قيد المراجعة': 'pending',
    'مرفوض': 'rejected',
    'معلق': 'disabled'
  };
  return {
    ...item,
    status: statusMap[item.status] || 'pending',
    actualStatus: item.status,
    isApproved: item.status === 'معتمد',
    isDisabled: item.status === 'معلق',
    balance: Number(item.walletBalance || 0),
    skill: Array.isArray(item.specialties) ? item.specialties.join('، ') : '',
    service: Array.isArray(item.specialties) ? item.specialties.join('، ') : ''
  };
}

function publicTopup(request) {
  const item = typeof request.toObject === 'function' ? request.toObject() : { ...request };
  const statusMap = { 'قيد المراجعة': 'pending', 'مقبول': 'approved', 'مرفوض': 'rejected' };
  return {
    ...item,
    status: statusMap[item.status] || 'pending',
    actualStatus: item.status,
    fromPhone: item.senderNumber || '',
    phone: item.fanniPhone || ''
  };
}

function adminName(req) { return String(req.user?.name || 'الإدارة').slice(0, 50); }
function decision(req, action, reason = '') {
  return { action, reason: String(reason || '').trim().slice(0, 500), date: new Date(), by: adminName(req), byId: req.user?._id };
}
function validId(value) { return mongoose.isValidObjectId(value); }
function sendBadId(res) { return res.status(400).json({ message: 'معرّف غير صالح' }); }
function getLoginPhone(body) {
  const raw = String(body.phone || body.email || '').trim();
  if (raw.includes('@')) {
    const configuredEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const configuredPhone = String(process.env.ADMIN_PHONE || '').trim();
    if (!configuredEmail || !configuredPhone || raw.toLowerCase() !== configuredEmail) { return null; }
    return normalizePhone(configuredPhone);
  }
  return normalizePhone(raw);
}

























































































const VALID_LEVELS = ['مبتدئ', 'ممارس', 'محترف', 'خبير مبتدئ', 'خبير', 'خبير أول', 'استشاري فني', 'نخبة', 'أسطوري'];
const VALID_BADGES = ['trusted', 'top_rated', 'verified', 'fast_response', 'premium', 'gold'];

// ترقية مستوى الفني - موثوق مع تاريخ



// شارة الثقة - إضافة / إزالة



// ملاحظة داخلية



// حدود الاستقبال






// ===== عروض الطلبات - بناء على Order.js الجديد =====









function notImplemented(msg){ return (req,res)=>res.status(501).json({message: msg}); }

const ADMIN_ROLES = ['مشرف', 'مشرف أول', 'مدير', 'قراءة فقط'];
function isRootAdmin(user) {
  const configuredPhone = normalizePhone(String(process.env.ADMIN_PHONE || ''));
  return Boolean(user && user.role === 'admin' && configuredPhone && normalizePhone(String(user.phone || '')) === configuredPhone);
}
function requireRootAdmin(req, res) {
  if (!isRootAdmin(req.user)) {
    res.status(403).json({ message: 'إدارة المناصب محصورة في المدير العام' });
    return false;
  }
  return true;
}
function publicAdminUser(user) {
  return { id: String(user._id), name: user.name, phone: user.phone, role: user.role, isRootAdmin: isRootAdmin(user), adminRole: user.adminRole || (isRootAdmin(user) ? 'مدير عام' : (user.role === 'admin' ? 'مشرف' : null)), status: user.status, adminPermissions: user.adminPermissions || {} };
}













async function getAdminConfig() {
  let config = await AdminConfig.findOne({ key: 'main' });
  if (!config) config = await AdminConfig.create({ key: 'main' });
  return config;
}
const writeAdminAudit = createAdminAuditWriter(adminName);












// تجميد المحفظة - يستخدم حقول isFrozen من Fanni.js الجديد
































const ADMIN_LAYOUT_SECTIONS = {
  dashboard: ['dashboard', 'stats'],
  clients: ['clients', 'orders'],
  technicians: ['fannis', 'pending', 'profileEdits', 'disabled', 'levels', 'offers', 'wallets', 'topups'],
  'service-management': ['services', 'regions'],
  'customer-operations': ['complaints', 'support', 'notifications', 'content'],
  'platform-admin': ['pricing', 'reports', 'pageVisits', 'security', 'settings', 'roles']
};
const ADMIN_LAYOUT_TABS = Object.values(ADMIN_LAYOUT_SECTIONS).flat();
function sanitizeAdminUiLayout(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const sectionOrder = Array.isArray(source.sectionOrder)
    ? [...new Set(source.sectionOrder.filter(id => Object.prototype.hasOwnProperty.call(ADMIN_LAYOUT_SECTIONS, id)))].slice(0, 6)
    : [];
  const tabOrder = {};
  for (const [sectionId, allowed] of Object.entries(ADMIN_LAYOUT_SECTIONS)) {
    const proposed = Array.isArray(source.tabOrder?.[sectionId]) ? source.tabOrder[sectionId] : [];
    tabOrder[sectionId] = [...new Set(proposed.filter(id => ADMIN_LAYOUT_TABS.includes(id)))].slice(0, ADMIN_LAYOUT_TABS.length);
  }
  const tabGroups = {};
  if (source.tabGroups && typeof source.tabGroups === 'object' && !Array.isArray(source.tabGroups)) {
    for (const tabId of ADMIN_LAYOUT_TABS) {
      const group = source.tabGroups[tabId];
      if (Object.prototype.hasOwnProperty.call(ADMIN_LAYOUT_SECTIONS, group)) tabGroups[tabId] = group;
    }
  }
  const sizes = {};
  if (source.sizes && typeof source.sizes === 'object' && !Array.isArray(source.sizes)) {
    for (const tabId of ADMIN_LAYOUT_TABS) {
      if (['small', 'medium', 'large'].includes(source.sizes[tabId])) sizes[tabId] = source.sizes[tabId];
    }
  }
  const elements = {};
  if (source.elements && typeof source.elements === 'object' && !Array.isArray(source.elements)) {
    for (const [key, value] of Object.entries(source.elements).slice(0, 500)) {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(key) || !value || typeof value !== 'object' || Array.isArray(value)) continue;
      const item = {};
      if (Number.isFinite(value.x) && value.x >= -2000 && value.x <= 2000) item.x = value.x;
      if (Number.isFinite(value.y) && value.y >= -2000 && value.y <= 2000) item.y = value.y;
      if (typeof value.containerId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value.containerId)) item.containerId = value.containerId;
      if (['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'].includes(value.anchor)) item.anchor = value.anchor;
      if (Number.isFinite(value.xPercent) && value.xPercent >= -200 && value.xPercent <= 200) item.xPercent = value.xPercent;
      if (Number.isFinite(value.yPercent) && value.yPercent >= -200 && value.yPercent <= 200) item.yPercent = value.yPercent;
      if (Number.isFinite(value.wPercent) && value.wPercent >= 0 && value.wPercent <= 100) item.wPercent = value.wPercent;
      if (Number.isFinite(value.hPercent) && value.hPercent >= 0 && value.hPercent <= 100) item.hPercent = value.hPercent;
      if (Number.isInteger(value.zIndex) && value.zIndex >= 0 && value.zIndex <= 999999) item.zIndex = value.zIndex;
      if (Number.isFinite(value.fontSize) && value.fontSize >= 10 && value.fontSize <= 72) item.fontSize = value.fontSize;
      // Preserve the editor's explicit CSS width ("29%", "240px") and legacy numeric percentages.
      // Normalize whitespace before validation so the value survives the same sanitizer on PUT and GET.
      const widthValue = typeof value.width === 'string' ? value.width.trim() : value.width;
      if (typeof widthValue === 'string') {
        const widthMatch = widthValue.match(/^(\d+(?:\.\d{1,2})?)(px|%)$/);
        if (widthMatch) {
          const widthNumber = Number(widthMatch[1]);
          if (Number.isFinite(widthNumber) && widthNumber > 0 &&
              widthNumber <= (widthMatch[2] === 'px' ? 2000 : 100)) {
            item.width = widthValue;
          }
        }
      } else if (Number.isFinite(widthValue) && widthValue >= 1 && widthValue <= 100) {
        item.width = widthValue;
      }
      if (Number.isFinite(value.buttonWidth) && value.buttonWidth >= 20 && value.buttonWidth <= 100) item.buttonWidth = value.buttonWidth;
      if (Number.isFinite(value.buttonHeight) && value.buttonHeight >= 50 && value.buttonHeight <= 180) item.buttonHeight = value.buttonHeight;
      if (Number.isFinite(value.translateX) && value.translateX >= -2000 && value.translateX <= 2000) item.translateX = value.translateX;
      if (Number.isFinite(value.translateY) && value.translateY >= -2000 && value.translateY <= 2000) item.translateY = value.translateY;
      if (Number.isFinite(value.rotateY) && value.rotateY >= -45 && value.rotateY <= 45) item.rotateY = value.rotateY;
      if (Number.isFinite(value.opacity) && value.opacity >= 0 && value.opacity <= 100) item.opacity = value.opacity;
      if (Number.isFinite(value.shadowDepth) && value.shadowDepth >= 0 && value.shadowDepth <= 30) item.shadowDepth = value.shadowDepth;
      if (typeof value.shadowEnabled === 'boolean') item.shadowEnabled = value.shadowEnabled;
      if (typeof value.hideDesktop === 'boolean') item.hideDesktop = value.hideDesktop;
      if (typeof value.hideMobile === 'boolean') item.hideMobile = value.hideMobile;
      if (['none', 'zoom', 'slide'].includes(value.entrance)) item.entrance = value.entrance;
      if (typeof value.background === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.background)) item.background = value.background;
      if (['solid', 'glossy'].includes(value.backgroundFinish)) item.backgroundFinish = value.backgroundFinish;
      if (typeof value.activeBackground === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.activeBackground)) item.activeBackground = value.activeBackground;
      if (typeof value.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.color)) item.color = value.color;
      if (typeof value.buttonBg === 'string' && (/^#[0-9a-fA-F]{6}$/.test(value.buttonBg) || /^rgba?\([0-9.,%\s]+\)$/.test(value.buttonBg))) item.buttonBg = value.buttonBg;
      if (typeof value.buttonTextColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.buttonTextColor)) item.buttonTextColor = value.buttonTextColor;
      if (typeof value.buttonHover === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.buttonHover)) item.buttonHover = value.buttonHover;
      if (typeof value.hoverTextColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.hoverTextColor)) item.hoverTextColor = value.hoverTextColor;
      if (typeof value.elementBg === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.elementBg)) item.elementBg = value.elementBg;
      if (typeof value.sectionBg === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.sectionBg)) item.sectionBg = value.sectionBg;
      if (typeof value.gradientStart === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.gradientStart)) item.gradientStart = value.gradientStart;
      if (typeof value.gradientEnd === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.gradientEnd)) item.gradientEnd = value.gradientEnd;
      if (['135deg', '90deg', '180deg'].includes(value.gradientDirection)) item.gradientDirection = value.gradientDirection;
      if (typeof value.useGradient === 'boolean') item.useGradient = value.useGradient;
      if (typeof value.useSectionBg === 'boolean') item.useSectionBg = value.useSectionBg;
      if (Number.isFinite(value.imageOpacity) && value.imageOpacity >= 0 && value.imageOpacity <= 100) item.imageOpacity = value.imageOpacity;
      if (Number.isFinite(value.buttonBgAlpha) && value.buttonBgAlpha >= 0 && value.buttonBgAlpha <= 100) item.buttonBgAlpha = value.buttonBgAlpha;
      if (['small', 'medium', 'large'].includes(value.buttonSize)) item.buttonSize = value.buttonSize;
      if (typeof value.fontFamily === 'string') item.fontFamily = value.fontFamily.replace(/[^a-zA-Z0-9 ,_-]/g, '').slice(0, 80);
      if (['normal', 'bold', '400', '500', '600', '700', '800', '900'].includes(String(value.fontWeight))) item.fontWeight = String(value.fontWeight);
      if (['left', 'center', 'right', 'justify', 'start', 'end'].includes(value.textAlign)) item.textAlign = value.textAlign;
      if (typeof value.radius === 'number' && Number.isFinite(value.radius) && value.radius >= 0 && value.radius <= 50) item.radius = value.radius;
      if (typeof value.text === 'string') item.text = value.text.slice(0, 200);
      if (typeof value.hidden === 'boolean') item.hidden = value.hidden;
      if (typeof value.threeD === 'boolean') item.threeD = value.threeD;
      if (Number.isFinite(value.scale) && value.scale >= 0.5 && value.scale <= 2) item.scale = value.scale;
      if (typeof value.shadowColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.shadowColor)) item.shadowColor = value.shadowColor;
      if (typeof value.backgroundImage === 'string' && value.backgroundImage.length <= 2000000 && /^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(value.backgroundImage)) item.backgroundImage = value.backgroundImage;
      const mobile = {};
      if (value.mobile && typeof value.mobile === 'object' && !Array.isArray(value.mobile)) {
        if (Number.isFinite(value.mobile.x) && value.mobile.x >= -2000 && value.mobile.x <= 2000) mobile.x = value.mobile.x;
        if (Number.isFinite(value.mobile.y) && value.mobile.y >= -2000 && value.mobile.y <= 2000) mobile.y = value.mobile.y;
        if (typeof value.mobile.containerId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value.mobile.containerId)) mobile.containerId = value.mobile.containerId;
        if (['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'].includes(value.mobile.anchor)) mobile.anchor = value.mobile.anchor;
        if (Number.isFinite(value.mobile.xPercent) && value.mobile.xPercent >= -200 && value.mobile.xPercent <= 200) mobile.xPercent = value.mobile.xPercent;
        if (Number.isFinite(value.mobile.yPercent) && value.mobile.yPercent >= -200 && value.mobile.yPercent <= 200) mobile.yPercent = value.mobile.yPercent;
        if (Number.isFinite(value.mobile.wPercent) && value.mobile.wPercent >= 0 && value.mobile.wPercent <= 100) mobile.wPercent = value.mobile.wPercent;
        if (Number.isFinite(value.mobile.hPercent) && value.mobile.hPercent >= 0 && value.mobile.hPercent <= 100) mobile.hPercent = value.mobile.hPercent;
        if (Number.isInteger(value.mobile.zIndex) && value.mobile.zIndex >= 0 && value.mobile.zIndex <= 999999) mobile.zIndex = value.mobile.zIndex;
        if (Number.isFinite(value.mobile.fontSize) && value.mobile.fontSize >= 10 && value.mobile.fontSize <= 36) mobile.fontSize = value.mobile.fontSize;
        if (Number.isFinite(value.mobile.width) && value.mobile.width >= 30 && value.mobile.width <= 100) mobile.width = value.mobile.width;
        if (typeof value.mobile.background === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.mobile.background)) mobile.background = value.mobile.background;
        if (typeof value.mobile.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.mobile.color)) mobile.color = value.mobile.color;
        if (Number.isFinite(value.mobile.radius) && value.mobile.radius >= 0 && value.mobile.radius <= 40) mobile.radius = value.mobile.radius;
        if (typeof value.mobile.text === 'string') mobile.text = value.mobile.text.slice(0, 200);
        if (typeof value.mobile.hidden === 'boolean') mobile.hidden = value.mobile.hidden;
        if (typeof value.mobile.threeD === 'boolean') mobile.threeD = value.mobile.threeD;
        if (Number.isFinite(value.mobile.scale) && value.mobile.scale >= 0.5 && value.mobile.scale <= 2) mobile.scale = value.mobile.scale;
      }
      if (Object.keys(mobile).length) item.mobile = mobile;
      if (Object.keys(item).length) elements[key] = item;
    }
  }
  const version = Number.isInteger(source.version) && source.version >= 1 && source.version <= 10
    ? source.version
    : 3;
  return { version, sectionOrder, tabOrder, tabGroups, sizes, elements };
}
const UI_LAYOUT_FIELDS = {
  admin: 'adminUiLayout',
  client: 'clientUiLayout',
  fanni: 'fanniUiLayout',
  password: 'passwordUiLayout',
  support: 'supportUiLayout'
};
const uiLayoutPageSchema = Joi.string().valid('admin', 'client', 'fanni', 'password', 'support');




































// ===================== إدارة الخدمات - مصحح نهائي متوافق مع public.js و Service.js =====================
function normalizeForCompare(value) {
  return String(value || '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/ريسيفر/g, 'رسيفر');
}

function normalizeBrokenWallScreenServiceName(value) {
  return normalizeForCompare(value)
    .replace(/^[^ء-ي]+/, '')
    .replace(/ة/g, 'ه');
}

const BROKEN_WALL_SCREEN_SERVICE_NAMES = [
  normalizeBrokenWallScreenServiceName('تعليق شاشة حائط'),
  normalizeBrokenWallScreenServiceName('تركيب شاشة حائط')
];

function isBrokenWallScreenService(value) {
  return BROKEN_WALL_SCREEN_SERVICE_NAMES.includes(normalizeBrokenWallScreenServiceName(value));
}

function parseBooleanStrict(value) {
  if (typeof value === 'boolean') return { ok: true, value };
  if (value === 'true' || value === 'false') {
    return { ok: false, reason: 'قيمة isActive يجب أن تكون Boolean حقيقي true/false وليس نص "' + value + '"' };
  }
  if (typeof value === 'string') {
    const low = value.trim().toLowerCase();
    if (low === 'true' || low === 'false') {
      return { ok: false, reason: 'قيمة isActive يجب أن تكون Boolean حقيقي وليس نص' };
    }
  }
  return { ok: false, reason: 'قيمة isActive يجب أن تكون true أو false فقط' };
}

function validateNameField(name) {
  if (typeof name !== 'string') return 'اسم الخدمة يجب أن يكون نص';
  const t = name.trim().replace(/\s+/g, ' ');
  if (t.length < 1) return 'اسم الخدمة لا يمكن أن يكون فارغاً';
  if (t.length > 100) return 'اسم الخدمة طويل جداً (الحد 100 حرف)';
  return null;
}

function validateCategoryField(cat) {
  if (typeof cat !== 'string') return 'اسم القسم يجب أن يكون نص';
  const t = cat.trim().replace(/\s+/g, ' ');
  if (t.length < 1) return 'اسم القسم لا يمكن أن يكون فارغاً';
  if (t.length > 100) return 'اسم القسم طويل جداً';
  return null;
}

function validateSortOrder(val) {
  if (val === undefined || val === null || val === '') return null;
  const num = Number(val);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0 || num > 100000) {
    return 'sortOrder يجب أن يكون رقم صحيح بين 0 و 100000';
  }
  return null;
}

function buildAdminCategoriesMap(savedServices) {
  const map = new Map();
  // Legacy services are seeded below, so an inactive database tombstone must
  // suppress the seed itself; merely skipping the DB row leaves the old item visible.
  const hiddenLegacyKeys = new Set(savedServices
    .filter(saved => saved.isActive === false)
    .filter(saved => CATEGORIES.some(cat =>
      normalizeForCompare(cat.label) === normalizeForCompare(saved.category) &&
      cat.services.some(name => normalizeForCompare(name) === normalizeForCompare(saved.name))
    ))
    .map(saved => normalizeForCompare(saved.category) + '|' + normalizeForCompare(saved.name)));
  for (const [categoryIndex, cat] of CATEGORIES.entries()) {
    const key = normalizeForCompare(cat.label);
    map.set(key, {
      label: cat.label,
      emoji: cat.emoji,
      categorySortOrder: (categoryIndex + 1) * 10,
      services: cat.services.map((name, index) => ({
        name,
        normalizedName: normalizeForCompare(name),
        emoji: cat.emoji,
        isActive: true,
        source: 'legacy',
        category: cat.label,
        dbId: null,
        sortOrder: (index + 1) * 10
      })).filter(service => !hiddenLegacyKeys.has(key + '|' + service.normalizedName))
    });
  }
  for (const saved of savedServices) {
    const catKey = normalizeForCompare(saved.category);
    const isInactiveLegacyTombstone = saved.isActive === false && CATEGORIES.some(cat =>
      normalizeForCompare(cat.label) === catKey &&
      cat.services.some(name => normalizeForCompare(name) === normalizeForCompare(saved.name))
    );
    if (isInactiveLegacyTombstone) continue;
    if (!map.has(catKey)) {
      map.set(catKey, {
        label: saved.category,
        emoji: saved.emoji || '🔧',
        categorySortOrder: Number.isFinite(Number(saved.categorySortOrder)) && Number(saved.categorySortOrder) > 0 ? Number(saved.categorySortOrder) : 100000,
        services: []
      });
    }
    const category = map.get(catKey);
    if (Number.isFinite(Number(saved.categorySortOrder)) && Number(saved.categorySortOrder) > 0) category.categorySortOrder = Number(saved.categorySortOrder);
    const serviceKey = normalizeForCompare(saved.name);
    const existingIdx = category.services.findIndex(s => normalizeForCompare(s.name) === serviceKey);
    const dbItem = {
      name: saved.name,
      normalizedName: normalizeForCompare(saved.name),
      emoji: saved.emoji || category.emoji || '🔧',
      isActive: saved.isActive,
      source: 'database',
      category: saved.category,
      isCustom: !(findCategoryByService(saved.name) && normalizeForCompare(findCategoryByService(saved.name).label) === normalizeForCompare(saved.category)),
      dbId: String(saved._id),
      sortOrder: Number.isFinite(Number(saved.sortOrder)) ? Number(saved.sortOrder) : 0,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt
    };
    if (existingIdx !== -1) {
      category.services.splice(existingIdx, 1, dbItem);
    } else {
      category.services.push(dbItem);
    }
  }
  for (const category of map.values()) category.services.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ar'));
  return new Map(Array.from(map.entries()).sort((a, b) => a[1].categorySortOrder - b[1].categorySortOrder || a[1].label.localeCompare(b[1].label, 'ar')));
}

async function findServicesByName(rawName) {
  const norm = normalizeForCompare(rawName);
  if (!norm) return [];
  // الموديل الجديد فيه normalizedName - نستخدمه مباشرة للأداء
  const found = await Service.find({ normalizedName: norm }).lean();
  if (found.length > 0) return found;
  // fallback للتوافق: لو normalizedName مش موجود (بيانات قديمة) نفلتر يدوياً
  const all = await Service.find({}).lean();
  return all.filter(s => normalizeForCompare(s.name) === norm);
}

async function ensureHiddenLegacy(oldName, oldCategoryLabel) {
  const normOld = normalizeForCompare(oldName);
  if (!normOld) throw new Error('اسم الخدمة القديم غير صالح للإخفاء');
  const existing = await Service.findOne({ normalizedName: normOld, category: oldCategoryLabel });
  if (existing) {
    if (existing.isActive) {
      existing.isActive = false;
      await existing.save();
    }
    return existing;
  }
  const legacyCat = findCategoryByService(oldName) || findCategoryByLabel(oldCategoryLabel);
  const emoji = legacyCat ? legacyCat.emoji : '🔧';
  try {
    const hidden = await Service.create({
      name: oldName,
      category: oldCategoryLabel,
      emoji,
      isActive: false,
      sortOrder: 9999
    });
    return hidden;
  } catch (e) {
    if (e.code === 11000) {
      const dup = await Service.findOne({ normalizedName: normOld, category: oldCategoryLabel });
      if (dup) {
        if (dup.isActive) {
          dup.isActive = false;
          await dup.save();
        }
        return dup;
      }
      throw e;
    }
    throw e;
  }
}

































const routeContext = { express, bcrypt, jwt, Joi, mongoose, crypto, Fanni, Client, Notification, TopupRequest, Order, Rating, Complaint, WalletTransaction, createNotification, Service, Region, AdminConfig, AdminAuditLog, createAdminAuditWriter, PageVisit, CATEGORIES, ALL_SERVICES, normalizeServiceName, findCategoryByService, findCategoryByLabel, auth, defaultAdminPermissions, ADMIN_PERMISSION_KEYS, validate, normalizePhone, ADMIN_TOKEN_EXPIRY, MAX_LIST_LIMIT, loginSchema, amountSchema, reasonSchema, complaintStatusSchema, VALID_LEVELS, VALID_BADGES, ADMIN_ROLES, writeAdminAudit, ADMIN_LAYOUT_SECTIONS, ADMIN_LAYOUT_TABS, UI_LAYOUT_FIELDS, uiLayoutPageSchema, BROKEN_WALL_SCREEN_SERVICE_NAMES, publicFanni, publicTopup, adminName, decision, validId, sendBadId, getLoginPhone, notImplemented, isRootAdmin, requireRootAdmin, publicAdminUser, getAdminConfig, sanitizeAdminUiLayout, normalizeForCompare, normalizeBrokenWallScreenServiceName, isBrokenWallScreenService, parseBooleanStrict, validateNameField, validateCategoryField, validateSortOrder, buildAdminCategoriesMap, findServicesByName, ensureHiddenLegacy };

require('./admin/auth-and-overview')(router, routeContext);
require('./admin/technicians')(router, routeContext);
require('./admin/orders-and-accounts')(router, routeContext);
require('./admin/admin-users-and-finance')(router, routeContext);
require('./admin/clients-and-regions')(router, routeContext);
require('./admin/notifications-and-layout')(router, routeContext);
require('./admin/settings-and-support')(router, routeContext);
require('./admin/reports-services-visits')(router, routeContext);

module.exports = router;
