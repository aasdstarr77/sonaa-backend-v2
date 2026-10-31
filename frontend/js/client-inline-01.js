(function(){
  const params=new URLSearchParams(window.location.search);
  const isPreviewMode=params.has('preview') || window.self !== window.top;
  window.IS_EDITOR_PREVIEW=isPreviewMode;
  window.SONAA_SKIP_AUTH_REDIRECT=isPreviewMode;
  if(!isPreviewMode)return;
  const requested=params.get('section') || params.get('page') || '';
  const pageToTab={
    'new':'new','new-order':'new','طلب جديد':'new',
    'orders':'orders','my-orders':'orders','طلباتي':'orders',
    'complaint':'complaint','complaint-form':'complaint','شكوى':'complaint',
    'track-complaint':'complaint','track':'complaint',
    'profile':'orders','الملف الشخصي':'orders',
    'login':'login','client-login':'login','client':'login','تسجيل الدخول':'login',
    'register':'register','client-register':'register','تسجيل جديد':'register'
  };
  const key=String(requested).trim().toLowerCase();
  window.PREVIEW_REQUESTED_TAB=pageToTab[key] || pageToTab[String(requested).trim()] || 'login';
  console.log('Preview mode - requested section:',requested,'tab:',window.PREVIEW_REQUESTED_TAB);
  window.SONAA_FORCE_PREVIEW_TAB=true;
})();