'use strict';

const express = require('express');

const ADMIN_LAYOUT_SECTIONS = {
  dashboard: ['dashboard', 'stats'],
  clients: ['clients', 'orders'],
  technicians: ['fannis', 'pending', 'profileEdits', 'disabled', 'levels', 'offers', 'wallets', 'topups'],
  'service-management': ['services', 'regions'],
  'customer-operations': ['complaints', 'support', 'notifications', 'content'],
  'platform-admin': ['pricing', 'reports', 'pageVisits', 'security', 'settings', 'roles']
};
const ADMIN_LAYOUT_TABS = Object.values(ADMIN_LAYOUT_SECTIONS).flat();

function createAdminUiLayoutRouter({ Joi, auth, getAdminConfig, adminName, writeAdminAudit }) {
  const router = express.Router();

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
  router.get('/ui-layout/:page', auth('admin'), async (req, res, next) => {
    try {
      const { error, value: page } = uiLayoutPageSchema.validate(String(req.params.page || '').trim());
      if (error) return res.status(400).json({ message: 'اسم الصفحة غير مسموح به' });
      const config = await getAdminConfig();
      const field = UI_LAYOUT_FIELDS[page];
      const layout = sanitizeAdminUiLayout(config.get(field) || {});
      return res.set('Cache-Control', 'no-store').json({ page, layout });
    } catch (err) { next(err); }
  });
  router.put('/ui-layout/:page', auth('admin'), async (req, res, next) => {
    try {
      const { error, value: page } = uiLayoutPageSchema.validate(String(req.params.page || '').trim());
      if (error) return res.status(400).json({ message: 'اسم الصفحة غير مسموح به' });
      const bodySchema = Joi.object({ layout: Joi.object().unknown(true).required() }).required();
      const checked = bodySchema.validate(req.body || {}, { abortEarly: false, stripUnknown: false });
      if (checked.error) return res.status(400).json({ message: 'بيانات تخطيط الصفحة غير صالحة' });
      const field = UI_LAYOUT_FIELDS[page];
      const config = await getAdminConfig();
      const before = sanitizeAdminUiLayout(config.get(field) || {});
      const layout = sanitizeAdminUiLayout(checked.value.layout);
      config.set(field, layout);
      config.history.push({
        key: field, before, after: layout, by: adminName(req),
        byId: String(req.user?._id || ''), reason: 'حفظ تخطيط واجهة ' + page, createdAt: new Date()
      });
      if (config.history.length > 200) config.history = config.history.slice(-200);
      await config.save();
      await writeAdminAudit(req, 'حفظ تخطيط واجهة', 'ui-layout', page, JSON.stringify({ elementCount: Object.keys(layout.elements || {}).length }));
      return res.set('Cache-Control', 'no-store').json({ message: 'تم حفظ تخطيط الصفحة', page, layout });
    } catch (err) { next(err); }
  });
  router.delete('/ui-layout/:page', auth('admin'), async (req, res, next) => {
    try {
      const { error, value: page } = uiLayoutPageSchema.validate(String(req.params.page || '').trim());
      if (error) return res.status(400).json({ message: 'اسم الصفحة غير مسموح به' });
      const field = UI_LAYOUT_FIELDS[page];
      const config = await getAdminConfig();
      const before = sanitizeAdminUiLayout(config.get(field) || {});
      const emptyLayout = sanitizeAdminUiLayout({});
      config.set(field, emptyLayout);
      config.history.push({
        key: field, before, after: emptyLayout, by: adminName(req),
        byId: String(req.user?._id || ''), reason: 'حذف تخطيط واجهة ' + page, createdAt: new Date()
      });
      if (config.history.length > 200) config.history = config.history.slice(-200);
      await config.save();
      await writeAdminAudit(req, 'حذف تخطيط واجهة', 'ui-layout', page, JSON.stringify({ previousElementCount: Object.keys(before.elements || {}).length }));
      return res.set('Cache-Control', 'no-store').json({ message: 'تم حذف تخطيط الصفحة وإعادة الإعدادات الافتراضية', page, layout: emptyLayout });
    } catch (err) { next(err); }
  });

  return router;
}

module.exports = createAdminUiLayoutRouter;
