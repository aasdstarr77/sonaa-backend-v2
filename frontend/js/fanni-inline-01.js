(function(){
 const params=new URLSearchParams(window.location.search);
 const isPreview=params.has('preview')||window.self!==window.top;
 window.IS_EDITOR_PREVIEW=isPreview;
 if(!isPreview)return;
 const requested=params.get('section')||params.get('page')||'';
 const tabs={
  'available':'available','fanni-dashboard':'available','الطلبات المتاحة':'available',
  'myOffers':'myOffers','my':'myOffers','fanni-orders':'myOffers','طلباتي':'myOffers',
  'wallet':'wallet','المحفظة':'wallet',
  'profile':'profile','حسابي':'profile',
  'completed':'completed','المهام المكتملة':'completed',
  'login':'login','fanni-login':'login','fanni':'login','تسجيل دخول الفني':'login',
  'register':'register','fanni-register':'register','تسجيل جديد':'register'
 };
 window.PREVIEW_REQUESTED_TAB=tabs[requested]||tabs[requested.toLowerCase()]||'login';
 window.SONAA_FORCE_PREVIEW_TAB=true;
 console.log('Fanni Preview - will show tab:',window.PREVIEW_REQUESTED_TAB);
})();