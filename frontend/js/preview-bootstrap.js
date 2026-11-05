'use strict';

(function () {
  const script = document.currentScript;
  const page = script && script.dataset.sonaaPage;
  if (!page) return;

  const params = new URLSearchParams(window.location.search);

  if (page === 'admin') {
    if (params.get('preview') === 'true') window.IS_EDITOR_PREVIEW = true;
    return;
  }

  if (page === 'password' || page === 'support') {
    if (params.has('preview') || window.self !== window.top) {
      window.IS_EDITOR_PREVIEW = true;
    }
    return;
  }

  if (page === 'client') {
    const isPreviewMode = params.has('preview') || window.self !== window.top;
    window.IS_EDITOR_PREVIEW = isPreviewMode;
    window.SONAA_SKIP_AUTH_REDIRECT = isPreviewMode;
    if (!isPreviewMode) return;

    const requested = params.get('section') || params.get('page') || '';
    const pageToTab = {
      'new': 'new', 'new-order': 'new', 'طلب جديد': 'new',
      'orders': 'orders', 'my-orders': 'orders', 'طلباتي': 'orders',
      'complaint': 'complaint', 'complaint-form': 'complaint', 'شكوى': 'complaint',
      'track-complaint': 'complaint', 'track': 'complaint',
      'profile': 'orders', 'الملف الشخصي': 'orders',
      'login': 'login', 'client-login': 'login', 'client': 'login', 'تسجيل الدخول': 'login',
      'register': 'register', 'client-register': 'register', 'تسجيل جديد': 'register'
    };
    const key = String(requested).trim().toLowerCase();
    window.PREVIEW_REQUESTED_TAB = pageToTab[key] || pageToTab[String(requested).trim()] || 'login';
    console.log('Preview mode - requested section:', requested, 'tab:', window.PREVIEW_REQUESTED_TAB);
    window.SONAA_FORCE_PREVIEW_TAB = true;
    return;
  }

  if (page === 'fanni') {
    const isPreview = params.has('preview') || window.self !== window.top;
    window.IS_EDITOR_PREVIEW = isPreview;
    if (!isPreview) return;

    const requested = params.get('section') || params.get('page') || '';
    const tabs = {
      'available': 'available', 'fanni-dashboard': 'available', 'الطلبات المتاحة': 'available',
      'myOffers': 'myOffers', 'my': 'myOffers', 'fanni-orders': 'myOffers', 'طلباتي': 'myOffers',
      'wallet': 'wallet', 'المحفظة': 'wallet',
      'profile': 'profile', 'حسابي': 'profile',
      'completed': 'completed', 'المهام المكتملة': 'completed',
      'login': 'login', 'fanni-login': 'login', 'fanni': 'login', 'تسجيل دخول الفني': 'login',
      'register': 'register', 'fanni-register': 'register', 'تسجيل جديد': 'register'
    };
    window.PREVIEW_REQUESTED_TAB = tabs[requested] || tabs[requested.toLowerCase()] || 'login';
    window.SONAA_FORCE_PREVIEW_TAB = true;
    console.log('Fanni Preview - will show tab:', window.PREVIEW_REQUESTED_TAB);
  }
})();
