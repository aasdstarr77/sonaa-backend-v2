'use strict';

function getCat(service){return CATEGORIES.find(c=>c.services.includes(service))||null;}
function captureScrollPosition(){
  const list=document.getElementById('serviceList');
  return {pageY:window.scrollY||window.pageYOffset||0,listTop:list?list.scrollTop:0};
}
function restoreScrollPosition(position){
  if(!position)return;
  const list=document.getElementById('serviceList');
  if(list)list.scrollTop=position.listTop;
  window.scrollTo({top:position.pageY,left:0,behavior:'instant'});
}
function ratingSkipKey(role,sn){return 'sonaa_rating_skipped_'+role+'_'+String(sn||'').toUpperCase();}
function isRatingSkipped(role,sn){try{return localStorage.getItem(ratingSkipKey(role,sn))==='1';}catch{return false;}}
function skipClientRating(sn){try{localStorage.setItem(ratingSkipKey('client',sn),'1');}catch{}render();showToast('تم تخطي التقييم لهذا الطلب.','success');}
function focusClientPostAction(){if(!state.tracked)return;const sn=String(state.tracked.sn||'').toUpperCase();if(state.tracked.status==='تم الانتهاء'&&state.tracked.canRate&&!isRatingSkipped('client',sn)){document.getElementById('client-rating-'+sn)?.scrollIntoView({behavior:'smooth',block:'center'});return;}if(state.tracked.status==='تم اختيار فني'){document.getElementById('client-accepted-chat-'+sn)?.scrollIntoView({behavior:'smooth',block:'center'});}}
function showToast(message,type='error'){
  const el=document.getElementById('toast');
  if(!el)return;
  const color=type==='success'?'bg-emerald-600':'bg-[#0b1b3a]';
  el.innerHTML=`<div class="pointer-events-auto mx-auto max-w-[480px] rounded-[14px] ${color} text-white text-[13px] font-bold px-4 py-3 shadow-2xl flex justify-between items-center gap-3">
    <span class="leading-6">${escHtml(message)}</span>
    <button onclick="this.parentElement.remove()" class="shrink-0 h-7 px-3 rounded-full bg-white/20">إغلاق</button>
  </div>`;
  setTimeout(()=>{if(el)el.innerHTML='';},4500);
}
function goBack(){if(window.history.length>1){window.history.back();return;}window.location.href='/';}
function showLogoutConfirmation(){if(document.getElementById('logoutConfirmOverlay'))return;const overlay=document.createElement('div');overlay.id='logoutConfirmOverlay';overlay.className='logout-confirm-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','logoutConfirmTitle');overlay.innerHTML='<div class="logout-confirm-card"><div class="logout-confirm-icon" aria-hidden="true">↪</div><h2 id="logoutConfirmTitle" class="text-xl font-black text-slate-900">تأكيد تسجيل الخروج</h2><p class="mt-3 text-sm leading-6 font-bold text-slate-600">متأكد إنك عايز تسجّل خروج من حسابك؟</p><div class="mt-6 grid grid-cols-2 gap-3"><button type="button" class="logout-confirm-btn logout-confirm-cancel" data-logout-action="cancel">لا، خليك معايا</button><button type="button" class="logout-confirm-btn logout-confirm-yes" data-logout-action="confirm">أيوه، خروج</button></div></div>';document.body.appendChild(overlay);overlay.addEventListener('click',function(e){if(e.target===overlay||e.target.closest('[data-logout-action="cancel"]')){overlay.remove();return;}if(e.target.closest('[data-logout-action="confirm"]')){overlay.remove();performClientLogout();}});overlay.querySelector('[data-logout-action="cancel"]').focus();}
function performClientLogout(){try{localStorage.removeItem('sonaa_client_account_token');}catch(e){}state.accountToken='';state.account=null;state.notifications=[];state.notificationsUnread=0;state.notificationsOpen=false;state.myOrders=[];state.tracked=null;state.tab='new';state.accountError='';render();}
function logoutClient(){showLogoutConfirmation();}
function renderAccountGate(){
  var reg=state.accountAuthMode==='register';
  document.title=reg?'تسجيل عميل جديد | صُنّاع':'تسجيل دخول العميل | صُنّاع';
  var h='<main class="account-gate min-h-screen px-4 py-8 flex items-center justify-center"><div class="w-full max-w-[440px]"><nav dir="rtl" class="account-top-nav mb-5 flex items-center justify-start gap-2"><a href="/" aria-label="القائمة الرئيسية" title="القائمة الرئيسية" class="account-nav-btn account-home-btn h-10 px-4 rounded-xl inline-flex items-center justify-center text-xs font-black">⌂ القائمة الرئيسية</a><a href="https://aasdstarr77.github.io/sonaa-download/" aria-label="تحميل تطبيق صُنّاع" title="تحميل تطبيق صُنّاع" class="account-nav-btn account-download-btn h-10 px-4 rounded-xl inline-flex items-center justify-center text-xs font-black">⬇ تحميل التطبيق</a><button type="button" onclick="goBack()" class="account-nav-btn h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-extrabold">← رجوع</button></nav><div class="text-center mb-6"><div class="account-brand brand-mark mx-auto h-24 w-24 rounded-2xl flex items-center justify-center"><img class="sonaa-logo-svg" src="/images/LOGO_UPLOAD_HERE/logo.png" alt="شعار صُنّاع" width="144" height="144" decoding="async"></div><h1 class="mt-4 text-2xl font-black">'+(reg?'تسجيل عميل جديد':'تسجيل دخول العميل')+'</h1><p class="account-slogan mt-1 text-sm">صُنّاع كل خدمة تبدأ بخطوة</p><p class="mt-2 text-sm leading-6 text-slate-600">'+(reg?'أنشئ حساب عميل جديد علشان تطلب الخدمات وتتابع طلباتك.':'سجّل دخولك علشان تطلب خدمة وتتابع طلباتك من حسابك.')+'</p></div><div class="panel account-panel p-5"><div class="account-tabs grid grid-cols-1 gap-2"><button type="button" onclick="setAccountAuthMode(this.dataset.next)" data-next="'+(reg?'login':'register')+'" class="account-switch-link"  aria-label="'+(reg?'تسجيل الدخول':'تسجيل عميل جديد')+'"><span>'+(reg?'لتسجيل الدخول':'لتسجيل عميل جديد')+'</span><small>اضغط هنا</small></button></div><form class="mt-5 space-y-4" onkeydown="if(state.accountAuthMode===\'login\'&&event.key===\'Enter\'){event.preventDefault();if(event.target&&event.target.id===\'accountPassword\'){window.__sonaaClientLoginIntent=true;submitClientAccount(event);}else{document.getElementById(\'accountPassword\').focus();}}" onsubmit="if(state.accountAuthMode===\'login\'&&!window.__sonaaClientLoginIntent){event.preventDefault();return false;}window.__sonaaClientLoginIntent=false;submitClientAccount(event)">';
  if(reg)h+='<div><label class="block mb-1.5 text-xs font-extrabold">الاسم بالكامل</label><input id="accountName" required minlength="2" maxlength="50" autocomplete="name" class="field h-12 px-3 text-sm" placeholder="اكتب اسمك"></div>';
  h+='<div><label class="block mb-1.5 text-xs font-extrabold">رقم الموبايل</label><input id="accountPhone" required type="tel" inputmode="tel" autocomplete="tel" maxlength="20" class="field h-12 px-3 text-sm" placeholder="01012345678" dir="ltr"></div><div><label class="block mb-1.5 text-xs font-extrabold">كلمة السر</label><input id="accountPassword" required type="password" minlength="'+(reg?8:1)+'" maxlength="128" autocomplete="'+(reg?'new-password':'current-password')+'" class="field h-12 px-3 text-sm" placeholder="'+(reg?'8 أحرف على الأقل':'اكتب كلمة السر')+'"></div>';
  if(!reg)h+='<p class="mt-2 text-left"><a class="text-xs font-bold text-blue-700" href="password.html?role=client&mode=recovery">نسيت كلمة المرور؟</a></p>';if(reg)h+='<div><label class="block mb-1.5 text-xs font-extrabold">تأكيد كلمة السر</label><input id="accountConfirmPassword" required type="password" minlength="8" maxlength="128" autocomplete="new-password" class="field h-12 px-3 text-sm" placeholder="أعد كتابة كلمة السر"></div>';
  if(state.accountError)h+='<p class="rounded-xl bg-red-50 border border-red-200 p-3 text-xs leading-6 font-bold text-red-700">'+escHtml(state.accountError)+'</p>';
  h+='<button type="submit" '+(state.accountLoading?'disabled':'')+' onclick="window.__sonaaClientLoginIntent=true" class="account-submit w-full h-12 rounded-xl blue-btn font-extrabold text-sm">'+(state.accountLoading?'جاري التنفيذ...':reg?'إنشاء حساب العميل':'دخول إلى حسابي')+'</button></form><p class="mt-4 text-center text-[10px] leading-5 text-slate-500">كلمة السر لا تُشارك مع أي شخص.</p></div></div></main>';
  document.getElementById('app').innerHTML=h+renderPublicContent()+`<a href="support.html?role=client" aria-label="خدمة العملاء" title="خدمة العملاء" class="support-float prelogin-floating"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="12" width="4" height="7" rx="2"/><rect x="17" y="12" width="4" height="7" rx="2"/><path d="M17 19a5 5 0 0 1-5 2h-1"/></svg></a><button id="global-refresh" type="button" onclick="handleGlobalRefresh()" aria-label="تحديث البيانات" title="تحديث البيانات" class="global-refresh global-refresh-float prelogin-floating ${globalRefreshInProgress?'is-refreshing':''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 17 5l3 7M4 12l3 7a7 7 0 0 0 11.4-2"/></svg></button>`;
}
function renderPublicContent(){
  const c=state.publicContent||{announcement:'',faqs:[]};
  const faqs=Array.isArray(c.faqs)?c.faqs:[];
  if(!c.maintenance&&!String(c.announcement||'').trim()&&!faqs.length)return '';
  return '<section class="mx-auto mt-3 w-full max-w-[640px] px-3 sm:px-4 space-y-2">'+
    (c.maintenance?'<div class="panel border-amber-300 bg-amber-50 p-3 text-[12px] font-extrabold leading-6 text-amber-900">النظام في وضع الصيانة: '+escHtml(c.maintenanceMessage||'الخدمة متوقفة مؤقتًا. حاول لاحقًا.')+'</div>':'')+
    (String(c.announcement||'').trim()?'<div class="panel border-blue-200 bg-blue-50 p-3 text-[12px] font-bold leading-6">'+escHtml(c.announcement)+'</div>':'')+
    (faqs.length?'<details class="panel p-3"><summary class="cursor-pointer text-[12px] font-extrabold">الأسئلة الشائعة</summary><div class="mt-3 space-y-3">'+faqs.map(f=>'<div class="border-t pt-2"><p class="text-[11px] font-extrabold">'+escHtml(f.question)+'</p><p class="mt-1 text-[11px] leading-5 text-slate-600">'+escHtml(f.answer)+'</p></div>').join('')+'</div></details>':'')+
    '</section>';
}
async function loadPublicContent(){
  try{const data=await API.request('/api/content',{method:'GET'});state.publicContent={siteName:String(data.siteName||'صُنّاع'),maintenance:!!data.maintenance,maintenanceMessage:String(data.maintenanceMessage||''),announcement:String(data.announcement||''),faqs:Array.isArray(data.faqs)?data.faqs:[]};document.title=state.account?'صُنّاع - طلباتي':(state.accountAuthMode==='register'?'تسجيل عميل جديد | صُنّاع':'تسجيل دخول العميل | صُنّاع');render();}catch(error){log('تعذر تحميل محتوى الواجهة:',error);}
}
function setAccountAuthMode(mode){state.accountAuthMode=mode==='register'?'register':'login';state.accountError='';render();}
async function submitClientAccount(e){
  e.preventDefault();if(state.accountLoading)return;
  var reg=state.accountAuthMode==='register',name=String(document.getElementById('accountName')?.value||'').trim();
  var phone=normalizeDigits(String(document.getElementById('accountPhone')?.value||'')).replace(/\D/g,'');
  var password=String(document.getElementById('accountPassword')?.value||''),confirmPassword=String(document.getElementById('accountConfirmPassword')?.value||'');
  if(!VALIDATORS.phone(phone)){state.accountError='رقم الموبايل غير صحيح؛ اكتب 11 رقمًا يبدأ بـ 01.';render();return;}
  if(reg&&(!VALIDATORS.name(name)||containsPhoneNumber(name))){state.accountError='اكتب اسمك بشكل صحيح من غير أرقام موبايلات.';render();return;}
  if(reg&&password.length<8){state.accountError='كلمة السر لازم تكون 8 أحرف على الأقل.';render();return;}
  if(reg&&password!==confirmPassword){state.accountError='كلمة السر وتأكيدها مش متطابقين.';render();return;}
  state.accountLoading=true;state.accountError='';render();
  try{
    var d=reg?await API.registerClient({name:name,phone:phone,password:password,confirmPassword:confirmPassword}):await API.loginClient({phone:phone,password:password});
    if(!d.token||!d.client)throw new Error('تعذر إتمام تسجيل الدخول. تحقق من بياناتك وحاول مرة أخرى.');
    state.accountToken=window.IS_EDITOR_PREVIEW?'':d.token;state.account=window.IS_EDITOR_PREVIEW?null:d.client;if(!window.IS_EDITOR_PREVIEW){try{localStorage.setItem('sonaa_client_account_token',d.token);}catch(e){}}
    state.clientName=d.client.name||name;state.phone=d.client.phone||phone;state.tab='new';state.accountError='';showToast(d.message||'تم تسجيل الدخول بنجاح','success');await loadMyOrders(false);await loadNotifications();
  }catch(error){state.accountError=error.message||'تعذر إتمام العملية.';}
  finally{state.accountLoading=false;render();}
}
async function initializeClientAccount(){
  if(!state.accountToken){render();return;}
  /* Keep the login form hidden while a saved session is being verified. */
  state.accountInitializing=true;
  render();
  try{
    var d=await API.getClientMe(state.accountToken);
    state.account=d.client||null;
    if(state.account){
      state.clientName=state.account.name||'';
      state.phone=state.account.phone||'';
      state.tab='new';
      await Promise.allSettled([loadMyOrders(false),loadNotifications()]);
    }else{
      state.accountToken='';
      try{localStorage.removeItem('sonaa_client_account_token');}catch(e){}
    }
  }catch(error){
    state.accountToken='';
    state.account=null;
    try{localStorage.removeItem('sonaa_client_account_token');}catch(e){}
  }finally{
    state.accountInitializing=false;
    render();
  }
}

async function loadMyOrders(showLoading=true){
  if(!state.accountToken||!state.account)return;
  if(showLoading){state.accountOrdersLoading=true;render();}
  try{var d=await API.getMyOrders();state.myOrders=Array.isArray(d.orders)?d.orders:[];}
  catch(error){showToast(error.message||'تعذر تحميل طلباتك.');}
  finally{state.accountOrdersLoading=false;if(showLoading)render();}
}
async function openAccountOrder(sn,jumpToChat=false){
  state.trackInput=sn;state.trackLoading=true;state.trackError='';state.tracked=null;state.tab='track';render();
  try{state.tracked=await API.getOrder(sn);}catch(error){state.trackError=error.message||'تعذر تحميل تفاصيل الطلب.';}
  finally{state.trackLoading=false;render();if(jumpToChat){const chat=document.getElementById('client-accepted-chat-'+String(sn).replace(/[^a-zA-Z0-9_-]/g,''));if(chat)chat.scrollIntoView({behavior:'smooth',block:'center'});else showToast('المحادثة تظهر بعد قبول العرض.');}}
}
function renderOrders(){
  var h='<div class="client-orders-content mt-4 space-y-3"><div class="client-orders-summary panel p-4 flex items-center justify-between gap-3"><div><h3 class="font-extrabold text-[15px]">طلباتي</h3><p class="mt-1 text-[11px] text-slate-500">تابع كل طلباتك من هنا.</p></div></div>';
  const closedStatuses=['تم الانتهاء','منتهي','ملغي','مؤرشف','منتهي - اعتذار'];
  const currentOrders=state.myOrders.filter(o=>!closedStatuses.includes(String(o.status||'')));
  const previousOrders=state.myOrders.filter(o=>closedStatuses.includes(String(o.status||'')));
  const visibleOrders=state.accountOrdersTab==='previous'?previousOrders:currentOrders;
  h+='<div class="client-orders-status-tabs grid grid-cols-2 gap-2 p-1 rounded-xl"><button type="button" onclick="state.accountOrdersTab=\'current\';render()" class="client-orders-status-tab h-10 rounded-lg text-xs font-extrabold '+(state.accountOrdersTab==='current'?'tab-active':'tab-idle')+'">طلبات جارية ('+currentOrders.length+')</button><button type="button" onclick="state.accountOrdersTab=\'previous\';render()" class="client-orders-status-tab h-10 rounded-lg text-xs font-extrabold '+(state.accountOrdersTab==='previous'?'tab-active':'tab-idle')+'">طلبات سابقة ('+previousOrders.length+')</button></div>';
  if(state.accountOrdersLoading)return h+'<div class="panel p-8 text-center text-sm font-bold text-slate-500">جاري تحميل طلباتك...</div></div>';
  if(!visibleOrders.length)return h+'<div class="panel p-8 text-center"><div class="text-3xl">📝</div><p class="mt-3 font-extrabold text-sm">'+(state.accountOrdersTab==='previous'?'لا توجد طلبات سابقة.':'لا توجد طلبات جارية.')+'</p><button type="button" onclick="setTab(\'new\')" class="mt-4 h-11 px-5 rounded-xl blue-btn text-xs font-extrabold">إنشاء طلب جديد</button></div></div>';
  h+='<div class="space-y-3">';
  visibleOrders.forEach(function(o){
    h+='<div class="panel p-4"><div class="flex items-start justify-between gap-3"><div class="min-w-0"><p class="text-[10px] text-slate-500">رقم الطلب</p><h4 class="mt-1 font-extrabold text-sm">'+escHtml(o.sn||'طلب')+'</h4><p class="mt-2 text-sm font-extrabold">'+escHtml(o.service||'')+'</p><p class="mt-1 text-[11px] text-slate-500">'+escHtml(o.area||'')+'</p></div><span class="shrink-0 rounded-full bg-blue-50 border border-blue-100 px-3 py-1.5 text-[10px] font-extrabold text-blue-800">'+escHtml(o.status||'قيد المراجعة')+'</span></div><p class="mt-3 text-xs leading-6 text-slate-600">'+escHtml(maskPhoneNumbers(o.description||''))+'</p>';
    const pendingPriceRequests=(o.priceChangeRequests||[]).filter(r=>r.status==='قيد الموافقة');
    if(o.status==='تم اختيار فني'&&pendingPriceRequests.length){h+=pendingPriceRequests.map(r=>'<div class="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3"><p class="text-xs font-extrabold text-amber-900">طلب زيادة السعر إلى '+escHtml(String(r.newPrice))+' جنيه</p><p class="mt-1 text-[11px] leading-5 text-amber-900">'+escHtml(r.reason||'')+'</p><div class="mt-2 flex gap-2"><button type="button" onclick="decideClientPrice(\''+escAttr(o.sn)+'\',\''+escAttr(r._id)+'\',true)" class="flex-1 rounded-lg bg-emerald-600 p-2 text-white text-xs font-bold">موافقة</button><button type="button" onclick="decideClientPrice(\''+escAttr(o.sn)+'\',\''+escAttr(r._id)+'\',false)" class="flex-1 rounded-lg bg-red-600 p-2 text-white text-xs font-bold">رفض</button></div></div>').join('');}
    if(Array.isArray(o.offers)&&o.offers.length){h+='<p class="mt-3 text-xs font-extrabold">عروض الفنيين ('+o.offers.length+')</p>';o.offers.forEach(function(v){h+='<div class="mt-2 rounded-xl bg-slate-50 border border-slate-100 p-3"><div class="flex justify-between gap-2"><span class="text-xs font-extrabold">'+escHtml(v.fanniName||'فني')+'</span><span class="text-sm font-black text-blue-700">'+escHtml(v.price==null?'':String(v.price))+' جنيه</span></div><div class="mt-2 flex flex-wrap gap-2 text-[10px] font-extrabold"><span class="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">★ '+Number(v.fanniRatingAverage||0).toFixed(1)+' ('+Number(v.fanniRatingCount||0)+' تقييم)</span><span class="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-800">✓ '+Number(v.fanniCompletedJobs||0)+' عمل مكتمل</span></div><p class="mt-1 text-[11px] leading-5 text-slate-600">'+escHtml(maskPhoneNumbers(v.message||''))+'</p>';if(o.status==='تم اختيار فني')h+='<p class="mt-2 text-[11px] font-extrabold text-emerald-700">تم اختيار فني</p>';else if(!['تم الانتهاء','منتهي','اعتذار','منتهي - اعتذار','ملغي','مؤرشف'].includes(o.status))h+='<button type="button" onclick="acceptAccountOffer(\''+escAttr(o.sn)+'\',\''+escAttr(String(v._id||''))+'\')" class="mt-2 w-full h-10 rounded-lg blue-btn text-xs font-extrabold">قبول العرض</button>';h+='</div>';});}
    else h+='<p class="mt-3 text-[11px] text-slate-500">لا توجد عروض حتى الآن.</p>';
    h+='<button type="button" onclick="openAccountOrder(\''+escAttr(o.sn)+'\')" class="mt-3 w-full h-10 rounded-xl bg-slate-100 text-slate-800 text-xs font-extrabold">تفاصيل الطلب</button>';
    if(o.status==='تم اختيار فني')h+='<button type="button" onclick="openAccountOrder(\''+escAttr(o.sn)+'\',true)" class="mt-2 w-full h-10 rounded-xl blue-btn text-xs font-extrabold">الدخول إلى المحادثة</button>';
    if(!['تم اختيار فني','تم الانتهاء','ملغي','مؤرشف','منتهي','منتهي - اعتذار'].includes(String(o.status||'')))h+='<button type="button" onclick="cancelAccountOrder(\''+escAttr(o.sn)+'\')" class="mt-2 w-full h-10 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-extrabold">إلغاء الطلب</button>';
    h+='</div>';
  });
  return h+'</div></div>';
}

async function acceptAccountOffer(sn,id){if(!confirm('تأكيد قبول هذا العرض؟'))return;try{await API.acceptOffer(sn,id);showToast('تم قبول العرض بنجاح','success');await loadMyOrders(false);render();}catch(error){showToast(error.message||'تعذر قبول العرض.');}}
async function cancelAccountOrder(sn){
  const cleanSN=String(sn||'').trim().toUpperCase();
  if(!VALIDATORS.sn(cleanSN)){showToast('كود الطلب غير صحيح.');return;}
  if(!confirm('هل تريد إلغاء الطلب '+cleanSN+'؟ لن يمكن التراجع عن الإلغاء.'))return;
  try{
    const result=await API.cancelOrder(cleanSN);
    showToast(result.message||'تم إلغاء الطلب بنجاح.','success');
    await loadMyOrders(false);
    if(state.trackInput===cleanSN){state.tracked=null;state.trackError='';}
    render();
  }catch(error){showToast(error.message||'تعذر إلغاء الطلب.');}
}


async function loadNotifications(){
 if(!state.accountToken||!state.account)return;
 try{const data=await API.getNotifications();state.notifications=Array.isArray(data.notifications)?data.notifications:[];state.notificationsUnread=Number(data.unreadCount||0);var badge=document.getElementById('notificationBadge');if(badge)badge.textContent=state.notificationsUnread?(state.notificationsUnread>99?'99+':String(state.notificationsUnread)):'';if(state.notificationsOpen)render();}
 catch(error){log('تعذر تحميل الإشعارات:',error.message);}
}
async function toggleNotifications(){state.notificationsOpen=!state.notificationsOpen;if(state.notificationsOpen)await loadNotifications();render();}
async function openNotification(id){var previous=state.notifications.find(function(n){return n.id===id;});try{if(previous&&!previous.read)await API.readNotification(id);}catch(error){}state.notifications=state.notifications.map(function(n){return n.id===id?Object.assign({},n,{read:true}):n;});if(previous&&!previous.read)state.notificationsUnread=Math.max(0,state.notificationsUnread-1);state.notificationsOpen=false;if(previous&&previous.link&&previous.link.indexOf('tab=orders')>=0){state.tab='orders';await loadMyOrders(false);}else if(previous&&previous.link&&previous.link.indexOf('tab=complaint')>=0){state.tab='complaint';}render();}
async function markAllNotificationsRead(){try{await API.readAllNotifications();state.notifications=state.notifications.map(function(n){return Object.assign({},n,{read:true});});state.notificationsUnread=0;render();}catch(error){showToast(error.message||'تعذر تحديث الإشعارات.');}}
function notificationBadge(){return '<span id="notificationBadge" class="absolute -right-1 -top-1 min-w-[17px] rounded-full bg-red-600 px-1 text-[9px] font-black text-white">'+(state.notificationsUnread?(state.notificationsUnread>99?'99+':state.notificationsUnread):'')+'</span>';}
function notificationPanel(){
 if(!state.notificationsOpen)return '';
 var html='<div class="fixed inset-0 z-[99]" onclick="state.notificationsOpen=false;render()"></div><div class="fixed left-3 right-3 top-[70px] z-[100] mx-auto max-w-[420px] overflow-hidden rounded-2xl border border-amber-200 bg-white text-slate-800 shadow-2xl"><div class="flex items-center justify-between gap-2 border-b p-3"><b class="text-[15px] font-extrabold">الإشعارات</b><div class="flex items-center gap-3"><button onclick="markAllNotificationsRead()" class="text-[12px] font-extrabold text-blue-700">تعليم الكل كمقروء</button><button type="button" aria-label="إغلاق الإشعارات" title="إغلاق" onclick="state.notificationsOpen=false;render()" class="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-2xl font-bold leading-none text-slate-700 hover:bg-slate-200">×</button></div></div><div class="max-h-[60vh] overflow-y-auto">';
 if(!state.notifications.length)html+='<p class="p-6 text-center text-[12px] text-slate-500">مفيش إشعارات لحد دلوقتي.</p>';
 state.notifications.forEach(function(n){html+='<button type="button" data-notification-id="'+escAttr(n.id)+'" class="notification-item block w-full border-b p-3 text-right '+(n.read?'bg-white':'bg-amber-50')+'"><b class="block text-[16px] font-bold text-slate-900">'+escHtml(n.title)+'</b><span class="mt-1 block text-[15px] font-semibold leading-7 text-slate-800">'+escHtml(n.message)+'</span><small class="mt-2 block text-[11px] font-medium text-slate-500">'+(n.createdAt?new Date(n.createdAt).toLocaleString('ar-EG'):'')+'</small></button>';});
 return html+'</div></div>';
}
document.addEventListener('click',function(event){var item=event.target.closest('[data-notification-id]');if(item)openNotification(item.getAttribute('data-notification-id'));});
document.addEventListener('focusout',function(){if(!clientLiveRenderPending||!state.account||!['orders','track'].includes(state.tab))return;setTimeout(function(){if(clientLiveRenderPending&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){clientLiveRenderPending=false;const scrollY=window.scrollY||window.pageYOffset||0;render();window.scrollTo({top:scrollY,left:0,behavior:'instant'});focusClientPostAction();}},0);});