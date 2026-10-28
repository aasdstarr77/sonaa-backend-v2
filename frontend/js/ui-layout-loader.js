/* Sonaa shared UI layout loader — editor-v2 */
(function () {
  'use strict';
  var pageMap = {
    '/admin.html': 'admin', '/client.html': 'client', '/fanni.html': 'fanni',
    '/password.html': 'password', '/support.html': 'support'
  };
  var page = pageMap[location.pathname.replace(/\/+$/, '')] || location.pathname.split('/').pop().replace(/\.html$/, '');
  if (!/^(admin|client|fanni|password|support)$/.test(page)) return;
  var styleId = 'sonaa-ui-layout-style';
  function getToken() {
    var keys = ['admin_token_v3', 'adminToken', 'token', 'authToken'];
    for (var i = 0; i < keys.length; i++) { try { var v = localStorage.getItem(keys[i]); if (v) return v; } catch (_) {} }
    return '';
  }
  function ensureStyle() {
    if (document.getElementById(styleId)) return;
    var style = document.createElement('style'); style.id = styleId;
    style.textContent = '.sonaa-pos-layer{position:relative;translate:var(--sonaa-x,0) var(--sonaa-y,0);width:var(--sonaa-w,auto);height:var(--sonaa-h,auto);z-index:var(--sonaa-z,auto)}.sonaa-effect-layer{transform-style:preserve-3d;min-width:0;min-height:0}';
    document.head.appendChild(style);
  }
  function setPct(el, prop, value) {
    if (value === undefined || value === null || value === '') return;
    var n = Number(value); if (!Number.isFinite(n)) return;
    el.style.setProperty(prop, n + '%');
  }
  function getContainer(id, el) {
    if (id) { var c = document.getElementById(id); if (c && c !== el && c.contains(el)) return c; }
    return el.parentElement || document.body;
  }
  function apply(layout) {
    ensureStyle();
    var elements = layout && (layout.elements || layout.items || layout.layout || layout);
    if (!elements || typeof elements !== 'object') return;
    Object.keys(elements).forEach(function (key) {
      var item = elements[key]; if (!item || typeof item !== 'object') return;
      var el = document.querySelector('[data-editor-id="' + CSS.escape(key) + '"]') ||
               document.getElementById(key);
      if (!el) return;
      if (!el.hasAttribute('data-editor-id')) el.setAttribute('data-editor-id', key);
      var mobile = window.matchMedia('(max-width: 767px)').matches;
      var ov = mobile && (item.mobile || item.mobileOverride || item.mobileOverrides) || {};
      var cfg = Object.assign({}, item, ov);
      var container = getContainer(cfg.containerId, el);
      if (cfg.containerId && container && container !== document.body && getComputedStyle(container).position === 'static') container.style.position = 'relative';
      el.classList.add('sonaa-pos-layer', 'sonaa-effect-layer');
      var anchor = String(cfg.anchor || 'top-left').toLowerCase();
      el.style.position = 'absolute';
      el.style.margin = '0';
      el.style.right = 'auto'; el.style.bottom = 'auto';
      if (anchor.indexOf('right') !== -1) { el.style.left = 'auto'; el.style.right = '0'; }
      else { el.style.right = 'auto'; el.style.left = '0'; }
      if (anchor.indexOf('bottom') !== -1) { el.style.top = 'auto'; el.style.bottom = '0'; }
      else { el.style.bottom = 'auto'; el.style.top = '0'; }
      setPct(el, '--sonaa-x', cfg.xPercent);
      setPct(el, '--sonaa-y', cfg.yPercent);
      if (cfg.wPercent !== undefined) setPct(el, '--sonaa-w', cfg.wPercent);
      if (cfg.hPercent !== undefined) setPct(el, '--sonaa-h', cfg.hPercent);
      if (cfg.zIndex !== undefined) el.style.setProperty('--sonaa-z', String(cfg.zIndex));
    });
  }
  function load() {
    fetch('/api/admin/ui-layout/' + encodeURIComponent(page), {
      method: 'GET', credentials: 'same-origin',
      headers: getToken() ? { Authorization: 'Bearer ' + getToken() } : {}
    }).then(function (r) { if (!r.ok) throw new Error('layout HTTP ' + r.status); return r.json(); })
      .then(function (data) { apply(data.layout || data.uiLayout || data); })
      .catch(function (err) { console.warn('[Sonaa UI layout] Could not load layout for ' + page, err); });
  }
  function openSection(section) {
    if (typeof section !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(section)) return;
    var target = document.getElementById(section) ||
      document.querySelector('[data-section="' + CSS.escape(section) + '"], [data-tab="' + CSS.escape(section) + '"], [data-page="' + CSS.escape(section) + '"]');
    if (target) {
      var trigger = target.matches('button,a,[role="tab"],[data-tab]') ? target :
        document.querySelector('[data-target="#' + CSS.escape(section) + '"], [href="#' + CSS.escape(section) + '"], [aria-controls="' + CSS.escape(section) + '"]');
      if (trigger && typeof trigger.click === 'function') trigger.click();
      else { target.hidden = false; target.classList.remove('hidden','d-none'); target.scrollIntoView({behavior:'smooth',block:'start'}); }
      return;
    }
    var slug = section.toLowerCase();
    var triggers = document.querySelectorAll('button,a,[role="tab"],[data-tab],[data-section]');
    for (var i = 0; i < triggers.length; i++) {
      var t = triggers[i], val = [t.id,t.getAttribute('data-tab'),t.getAttribute('data-section'),t.getAttribute('data-target'),t.getAttribute('aria-controls')].join(' ').toLowerCase();
      if (val.split(/[^a-z0-9_-]+/).indexOf(slug) !== -1) { t.click(); return; }
    }
    console.warn('[Sonaa editor] Section not found:', section);
  }
  function assignEditorIds() {
    var prefix = page + '-';
    document.querySelectorAll('[id]').forEach(function (el) {
      if (!el.hasAttribute('data-editor-id')) el.setAttribute('data-editor-id', prefix + el.id);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { assignEditorIds(); load(); });
  else { assignEditorIds(); load(); }
  window.addEventListener('resize', function () { /* Layout is reloaded to apply responsive overrides. */ load(); }, { passive: true });
})();