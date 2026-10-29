/* Sonaa shared UI layout loader — editor-v2 */
(function () {
  'use strict';
  var pageMap = {
    '/admin.html': 'admin', '/client.html': 'client', '/fanni.html': 'fanni',
    '/password.html': 'password', '/support.html': 'support'
  };
  var page = pageMap[location.pathname.replace(/\/+$/, '')] || location.pathname.split('/').pop().replace(/\.html$/, '');
  if (!/^(admin|client|fanni|password|support)$/.test(page)) return;
  // Do not hide the document while fetching layout: the page's animated loading splash
  // must remain visible during refresh, even if the layout API is slow or unavailable.
  var styleId = 'sonaa-ui-layout-style';
  function safeId(value) { return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100); }
  // Keep this algorithm in sync with frontend/editor.html so saved keys match in preview and live pages.
  function stablePath(el) {
    if (el.id) return 'id-' + safeId(el.id);
    var parts = [], node = el;
    while (node && node.nodeType === 1 && node !== node.ownerDocument.body) {
      var part = node.tagName.toLowerCase();
      if (node.classList && node.classList.length) part += '.' + Array.from(node.classList).slice(0, 2).map(safeId).join('.');
      var parent = node.parentElement;
      if (parent) {
        var same = Array.from(parent.children).filter(function (child) { return child.tagName === node.tagName; });
        if (same.length > 1) part += '-' + (same.indexOf(node) + 1);
      }
      parts.unshift(part); node = parent;
      if (parts.length > 8) break;
    }
    return 'auto-' + safeId(parts.join('_')).slice(0, 94);
  }
  function assignEditorIds(root) {
    var nodes = [];
    if (root && root.nodeType === 1) nodes.push(root);
    if (root && root.querySelectorAll) nodes = nodes.concat(Array.from(root.querySelectorAll('*')));
    nodes.forEach(function (el) {
      if (['SCRIPT','STYLE','LINK','META','NOSCRIPT','SVG','PATH'].indexOf(el.tagName) !== -1) return;
      if (!el.hasAttribute('data-editor-id')) el.setAttribute('data-editor-id', stablePath(el));
    });
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
  function isLayoutContainer(el) {
    if (!el || el.nodeType !== 1) return false;
    return el.matches('main, .container, .main-box, .login-box, body > div, #app, form, .form-container, .card') ||
      (el.children && el.children.length > 5 && /container|wrapper|content|layout|login|form|card|main/i.test(String(el.className || '') + ' ' + String(el.id || '')));
  }
  function apply(layout) {
    ensureStyle(); assignEditorIds(document.body);
    var elements = layout && (layout.elements || layout.items || layout.layout || layout);
    if (!elements || typeof elements !== 'object') return;
    Object.keys(elements).forEach(function (key) {
      var item = elements[key]; if (!item || typeof item !== 'object') return;
      var escaped = window.CSS && CSS.escape ? CSS.escape(key) : key.replace(/["\\]/g, '\\$&');
      var el = document.querySelector('[data-editor-id="' + escaped + '"]') || document.getElementById(key);
      if (!el) return;
      if (!el.hasAttribute('data-editor-id')) el.setAttribute('data-editor-id', key);
      var mobile = window.matchMedia('(max-width: 767px)').matches;
      var ov = mobile && (item.mobile || item.mobileOverride || item.mobileOverrides) || {};
      var cfg = Object.assign({}, item, ov);
      var isContainer = isLayoutContainer(el);
      // A saved editor position must never pull a page/form container out of normal flow.
      if (isContainer) {
        el.classList.remove('sonaa-pos-layer');
        el.style.removeProperty('position');
        el.style.removeProperty('left');
        el.style.removeProperty('right');
        el.style.removeProperty('top');
        el.style.removeProperty('bottom');
        el.style.removeProperty('translate');
        el.style.removeProperty('--sonaa-x');
        el.style.removeProperty('--sonaa-y');
        el.style.removeProperty('--sonaa-w');
        el.style.removeProperty('--sonaa-h');
        if (cfg.wPercent !== undefined && Number.isFinite(Number(cfg.wPercent))) {
          var containerWidth = Math.max(0, Math.min(100, Number(cfg.wPercent)));
          el.style.width = containerWidth + '%';
          el.style.maxWidth = '100%';
        }
        if (cfg.hidden) el.style.display = 'none';
        if (cfg.threeD === false) { el.style.boxShadow = 'none'; el.style.scale = '1'; }
        else if (cfg.threeD === true) { el.style.scale = String(cfg.scale || 1); el.style.boxShadow = '0 7px 16px rgba(10,35,66,.22),inset 0 1px 0 rgba(255,255,255,.65)'; }
        return;
      }
      var container = getContainer(cfg.containerId, el);
      if (container && container !== document.body && !isLayoutContainer(container) && getComputedStyle(container).position === 'static') container.style.position = 'relative';
      el.classList.add('sonaa-pos-layer', 'sonaa-effect-layer');
      var anchor = String(cfg.anchor || 'top-left').toLowerCase();
      el.style.position = 'absolute'; el.style.margin = '0';
      el.style.right = 'auto'; el.style.bottom = 'auto';
      if (anchor.indexOf('right') !== -1) { el.style.left = 'auto'; el.style.right = '0'; }
      else { el.style.right = 'auto'; el.style.left = '0'; }
      if (anchor.indexOf('bottom') !== -1) { el.style.top = 'auto'; el.style.bottom = '0'; }
      else { el.style.bottom = 'auto'; el.style.top = '0'; }
      setPct(el, '--sonaa-x', cfg.xPercent); setPct(el, '--sonaa-y', cfg.yPercent);
      if (cfg.wPercent !== undefined) setPct(el, '--sonaa-w', mobile ? Math.min(100, Number(cfg.wPercent)) : cfg.wPercent);
      if (cfg.hPercent !== undefined) setPct(el, '--sonaa-h', cfg.hPercent);
      if (mobile) { el.style.maxWidth = '100%'; el.style.boxSizing = 'border-box'; }
      if (cfg.zIndex !== undefined) el.style.setProperty('--sonaa-z', String(cfg.zIndex));
      if (cfg.hidden) el.style.display = 'none';
      if (cfg.threeD === false) { el.style.boxShadow = 'none'; el.style.scale = '1'; }
      else if (cfg.threeD === true) { el.style.scale = String(cfg.scale || 1); el.style.boxShadow = '0 7px 16px rgba(10,35,66,.22),inset 0 1px 0 rgba(255,255,255,.65)'; }
    });
  }
  function goTab(tab) {
    if (typeof window.setTab === 'function') { window.setTab(tab); return true; }
    return false;
  }
  function openSection(section) {
    if (typeof section !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(section)) return;
    var aliases = {
      client: { 'my-orders':'orders', 'new-order':'new', 'complaint-form':'complaint' },
      fanni: { 'my-orders':'myOffers', 'notifications':'notifications' },
      admin: { 'technicians':'fannis', 'clients':'clients', 'password-recovery':'__passwordRecovery' },
      password: { 'change-password':'changePassword', 'profile':'profile', 'my-cases':'adminQueue', 'new-case':'recovery' },
      support: { 'my-cases':'main', 'new-case':'new-title' }
    };
    var actual = aliases[page] && aliases[page][section] || section;
    if (page === 'client' && ['new','orders','track','complaint'].indexOf(actual) !== -1 && goTab(actual)) return;
    if (page === 'fanni' && ['available','myOffers','completed','wallet','profile','notifications','login','register'].indexOf(actual) !== -1 && goTab(actual)) return;
    if (page === 'admin' && ['dashboard','stats','clients','orders','fannis','pending','profileEdits','disabled','levels','offers','wallets','topups','services','regions','complaints','support','notifications','content','pricing','reports','pageVisits','security','settings','roles'].indexOf(actual) !== -1 && goTab(actual)) return;
    if (page === 'admin' && actual === '__passwordRecovery') { location.href = '/password.html?role=admin&mode=support'; return; }
    if (page === 'client' && ['login','register','profile'].indexOf(actual) !== -1) {
      if (actual === 'profile') { location.href = '/password.html?role=client&mode=account'; return; }
      var textNeedle = actual === 'login' ? /تسجيل الدخول|دخول العميل|دخول إلى حسابي/ : /تسجيل عميل جديد|إنشاء حساب/;
      var buttons = document.querySelectorAll('button,a,[role="tab"]');
      for (var bi=0; bi<buttons.length; bi++) if (textNeedle.test(buttons[bi].textContent || buttons[bi].getAttribute('aria-label') || '')) { buttons[bi].click(); return; }
    }
    if (page === 'fanni' && actual === 'profile') { location.href = '/password.html?role=fanni&mode=account'; return; }
    if (page === 'password' && actual === 'changePassword') { var change=document.getElementById('changePassword'); if(change){document.querySelectorAll('#profile,#recovery,#adminQueue').forEach(function(n){n.classList.add('hidden')});change.classList.remove('hidden');change.scrollIntoView({behavior:'smooth',block:'start'});return;} }
    var target = document.getElementById(actual) ||
      document.querySelector('[data-section="' + actual + '"], [data-tab="' + actual + '"], [data-page="' + actual + '"]');
    if (target) {
      var trigger = target.matches('button,a,[role="tab"],[data-tab]') ? target :
        document.querySelector('[data-target="#' + actual + '"], [href="#' + actual + '"], [aria-controls="' + actual + '"]');
      if (trigger && typeof trigger.click === 'function') trigger.click();
      else { target.hidden = false; target.classList.remove('hidden','d-none'); target.scrollIntoView({behavior:'smooth',block:'start'}); }
      return;
    }
    var triggers = document.querySelectorAll('button,a,[role="tab"],[data-tab],[data-section]');
    for (var i = 0; i < triggers.length; i++) {
      var t = triggers[i], val = [t.id,t.getAttribute('data-tab'),t.getAttribute('data-section'),t.getAttribute('data-target'),t.getAttribute('aria-controls'),t.textContent].join(' ').toLowerCase();
      if (val.split(/[^a-z0-9_-]+/).indexOf(actual.toLowerCase()) !== -1) { t.click(); return; }
    }
    console.warn('[Sonaa editor] Section not found on ' + page + ':', section);
  }
  function load() {
    return fetch('/api/admin/ui-layout/' + encodeURIComponent(page), {
      method: 'GET', credentials: 'same-origin',
      headers: getToken() ? { Authorization: 'Bearer ' + getToken() } : {}
    }).then(function (r) { if (!r.ok) throw new Error('layout HTTP ' + r.status); return r.json(); })
      .then(function (data) { apply(data.layout || data.uiLayout || data); })
      .catch(function (err) { console.warn('[Sonaa UI layout] Could not load layout for ' + page, err); })
      .finally(function () {});
  }
  function getToken() {
    var keys = ['admin_token_v3', 'adminToken', 'token', 'authToken'];
    for (var i = 0; i < keys.length; i++) { try { var v = localStorage.getItem(keys[i]); if (v) return v; } catch (_) {} }
    return '';
  }
  function handleMessage(event) {
    var data = event.data;
    if (data && data.action === 'openSection') openSection(data.section);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { assignEditorIds(document.body); load(); });
  else { assignEditorIds(document.body); load(); }
  if (window.MutationObserver) {
    var observer = new MutationObserver(function (records) {
      records.forEach(function (record) { record.addedNodes.forEach(function (node) { if (node.nodeType === 1) assignEditorIds(node); }); });
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  }
  window.addEventListener('message', handleMessage);
  window.addEventListener('resize', function () { load(); }, { passive: true });
})();