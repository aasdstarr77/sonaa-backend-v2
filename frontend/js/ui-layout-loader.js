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
    style.textContent = '.sonaa-pos-layer{position:relative;translate:var(--sonaa-x,0) var(--sonaa-y,0);width:var(--sonaa-w,auto);height:var(--sonaa-h,auto);max-width:100%;box-sizing:border-box;z-index:var(--sonaa-z,auto)}.sonaa-effect-layer{transform-style:preserve-3d;min-width:0;min-height:0}';
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
      // Reapply the editor's saved visual styles on live pages as well as in preview.
      // Keep the editor's structured layout format; do not replace it with raw CSS selectors.
      if (cfg.fontFamily) el.style.fontFamily = '"' + String(cfg.fontFamily).replace(/["\\\\]/g, '') + '"';
      if (cfg.fontSize !== undefined) el.style.fontSize = Number(cfg.fontSize) + 'px';
      if (cfg.fontWeight) el.style.fontWeight = String(cfg.fontWeight);
      if (cfg.textAlign) el.style.textAlign = String(cfg.textAlign);
      if (cfg.color) el.style.color = String(cfg.color);
      if (cfg.buttonTextColor && /^(BUTTON|A)$/.test(el.tagName)) el.style.color = String(cfg.buttonTextColor);
      if (cfg.buttonBg) {
        var bg = String(cfg.buttonBg).replace('#', '');
        var alpha = Math.max(0, Math.min(100, Number(cfg.buttonBgAlpha === undefined ? 100 : cfg.buttonBgAlpha))) / 100;
        if (/^[0-9a-fA-F]{6}$/.test(bg)) el.style.backgroundColor = 'rgba(' + parseInt(bg.slice(0,2),16) + ',' + parseInt(bg.slice(2,4),16) + ',' + parseInt(bg.slice(4,6),16) + ',' + alpha + ')';
        else el.style.backgroundColor = String(cfg.buttonBg);
      }
      if (cfg.elementBg) el.style.backgroundColor = String(cfg.elementBg);
      if (cfg.radius !== undefined) el.style.borderRadius = Math.max(0, Number(cfg.radius) || 0) + 'px';
      if (cfg.opacity !== undefined) el.style.opacity = String(Math.max(0, Math.min(100, Number(cfg.opacity))) / 100);
      if (cfg.buttonSize && /^(BUTTON|A)$/.test(el.tagName)) {
        el.style.padding = cfg.buttonSize === 'small' ? '6px 10px' : cfg.buttonSize === 'large' ? '14px 22px' : '10px 16px';
      }
      if (cfg.buttonHeight !== undefined && /^(BUTTON|A)$/.test(el.tagName)) el.style.minHeight = (36 * Math.max(50, Math.min(180, Number(cfg.buttonHeight))) / 100) + 'px';
      if (cfg.useSectionBg && cfg.sectionBg && el.parentElement) el.parentElement.style.backgroundColor = String(cfg.sectionBg);
      if (cfg.useGradient) el.style.backgroundImage = 'linear-gradient(' + (cfg.gradientDirection || '135deg') + ',' + (cfg.gradientStart || '#0d9488') + ',' + (cfg.gradientEnd || '#2563eb') + ')';
      if (cfg.backgroundImage) {
        var imageAlpha = 1 - Math.max(0, Math.min(100, Number(cfg.imageOpacity === undefined ? 100 : cfg.imageOpacity))) / 100;
        el.style.backgroundImage = 'linear-gradient(rgba(0,0,0,' + imageAlpha + '),rgba(0,0,0,' + imageAlpha + ')),url("' + String(cfg.backgroundImage).replace(/["\\\\]/g, '') + '")';
      }
      if (cfg.threeD === false) {
        el.style.scale = '1'; el.style.transform = 'none';
        if (cfg.shadowEnabled === false) el.style.boxShadow = 'none';
      } else {
        if (cfg.scale !== undefined) el.style.scale = String(Math.max(0.5, Math.min(1.5, Number(cfg.scale) || 1)));
        if (cfg.rotateY !== undefined) el.style.transform = 'perspective(800px) rotateY(' + (Number(cfg.rotateY) || 0) + 'deg)';
        if (cfg.shadowEnabled === false) el.style.boxShadow = 'none';
        else if (cfg.shadowDepth !== undefined || cfg.shadowColor) {
          var depth = Math.max(0, Number(cfg.shadowDepth) || 0);
          var shadowColor = /^#[0-9a-fA-F]{6}$/.test(String(cfg.shadowColor || '')) ? String(cfg.shadowColor) + '66' : '#0a234266';
          el.style.boxShadow = '0 ' + depth + 'px ' + (depth * 2) + 'px ' + shadowColor + ',inset 0 1px 0 #ffffff88';
        }
      }
      if (cfg.buttonHover || cfg.hoverTextColor) {
        var hoverStyleId = 'sonaa-layout-hover-style';
        var hoverStyle = document.getElementById(hoverStyleId);
        if (!hoverStyle) { hoverStyle = document.createElement('style'); hoverStyle.id = hoverStyleId; document.head.appendChild(hoverStyle); }
        var hoverSelector = '[data-editor-id="' + String(key).replace(/["\\]/g, '\\$&') + '"]';
        hoverStyle.textContent += hoverSelector + ':hover{' + (cfg.buttonHover ? 'background-color:' + String(cfg.buttonHover) + '!important;' : '') + (cfg.hoverTextColor ? 'color:' + String(cfg.hoverTextColor) + '!important;' : '') + '}';
      }
      var container = getContainer(cfg.containerId, el);
      // Keep edited elements in normal document/Flex flow; never apply absolute positioning.
      el.classList.remove('sonaa-pos-layer');
      el.classList.add('sonaa-effect-layer');
      el.style.position = 'relative';
      el.style.removeProperty('left'); el.style.removeProperty('right');
      el.style.removeProperty('top'); el.style.removeProperty('bottom');
      el.style.removeProperty('margin');
      // New editor saves pixel offsets. Preserve legacy percentage offsets when loading old layouts.
      if (cfg.translateX !== undefined || cfg.translateY !== undefined) {
        var tx = Number(cfg.translateX) || 0, ty = Number(cfg.translateY) || 0;
        el.style.translate = tx + 'px ' + ty + 'px';
      } else if (cfg.xPercent !== undefined || cfg.yPercent !== undefined) {
        var oldX = Number(cfg.xPercent) || 0, oldY = Number(cfg.yPercent) || 0;
        el.style.translate = oldX + '% ' + oldY + '%';
      }
      if (cfg.wPercent !== undefined && Number.isFinite(Number(cfg.wPercent))) {
        el.style.width = Math.max(1, Math.min(100, Number(cfg.wPercent))) + '%';
        el.style.maxWidth = '100%'; el.style.boxSizing = 'border-box';
      }
      if (cfg.buttonWidth !== undefined && /^(BUTTON|A)$/.test(el.tagName)) {
        el.style.width = Math.max(20, Math.min(100, Number(cfg.buttonWidth))) + '%';
        el.style.maxWidth = '100%'; el.style.minWidth = '80px';
        el.style.boxSizing = 'border-box'; el.style.flex = '0 1 auto';
        if (container && ['flex','inline-flex'].indexOf(getComputedStyle(container).display) !== -1) {
          container.style.flexWrap = 'wrap';
          if (!container.style.gap) container.style.gap = '8px';
        }
      }
      // Apply an explicitly saved inline width safely (legacy layouts may omit it).
      if (cfg.width !== undefined && /^(BUTTON|A)$/.test(el.tagName)) {
        var savedWidth = String(cfg.width).trim();
        var widthMatch = savedWidth.match(/^(\d+(?:\.\d+)?)(px|%)$/);
        if (widthMatch) {
          var widthNumber = Number(widthMatch[1]);
          if (Number.isFinite(widthNumber) && widthNumber > 0) {
            if (widthMatch[2] === 'px') el.style.width = Math.min(500, widthNumber) + 'px';
            else el.style.width = Math.min(100, widthNumber) + '%';
            el.style.maxWidth = '100%';
            el.style.boxSizing = 'border-box';
            el.style.flex = '0 1 auto';
            if (container && ['flex','inline-flex'].indexOf(getComputedStyle(container).display) !== -1) {
              container.style.flexWrap = 'wrap';
              if (!container.style.gap) container.style.gap = '8px';
            }
          }
        }
      }
      if (cfg.hPercent !== undefined && Number.isFinite(Number(cfg.hPercent))) {
        el.style.height = Math.max(1, Math.min(100, Number(cfg.hPercent))) + '%';
      }
      if (cfg.zIndex !== undefined) el.style.zIndex = String(cfg.zIndex);
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