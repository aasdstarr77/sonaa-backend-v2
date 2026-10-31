/* Extracted page functions; classic-script globals are preserved. */
'use strict';

function toggleDashboardSpecialties(){dashboardSpecialtiesCollapsed=!dashboardSpecialtiesCollapsed;render();}

function isApproved(){
 return String(currentUser?.status||'').trim()==='معتمد';
}

function isPending(){
 const status=String(currentUser?.status||'').trim().toLowerCase();
 return ['قيد المراجعة','قيد المراجعه','pending','under_review','معلق'].includes(status);
}

function extractList(data,keys){
 if(Array.isArray(data))return data;
 for(const key of keys){
  if(Array.isArray(data?.[key]))return data[key];
 }
 if(Array.isArray(data?.data))return data.data;
 if(Array.isArray(data?.data?.[keys[0]]))return data.data[keys[0]];
 return [];
}

function extractUser(data){
 return data?.user||data?.fanni||data?.data?.user||data?.data?.fanni||null;
}

function extractToken(data){
 return data?.token||data?.accessToken||data?.data?.token||data?.data?.accessToken||'';
}

function goClient(){
 location.href=location.origin+'/';
}

function goBack(){
 if(currentUser||getToken()){showLogoutConfirmation('back');return;}
 if(window.history.length>1){window.history.back();return;}
 window.location.href='/';
}

function showLogoutConfirmation(action='logout'){
 if(document.getElementById('logoutConfirmOverlay'))return;
 const overlay=document.createElement('div');
 overlay.id='logoutConfirmOverlay';
 overlay.className='logout-confirm-overlay';
 overlay.setAttribute('role','dialog');
 overlay.setAttribute('aria-modal','true');
 overlay.setAttribute('aria-labelledby','logoutConfirmTitle');
 overlay.innerHTML='<div class="logout-confirm-card"><div class="logout-confirm-icon" aria-hidden="true">↪</div><h2 id="logoutConfirmTitle" class="text-xl font-black text-slate-900">تأكيد تسجيل الخروج</h2><p class="mt-3 text-sm leading-6 font-bold text-slate-600">متأكد إنك عايز تسجّل خروج من حسابك؟</p><div class="mt-6 grid grid-cols-2 gap-3"><button type="button" class="logout-confirm-btn logout-confirm-cancel" data-logout-action="cancel">لا، خليك معايا</button><button type="button" class="logout-confirm-btn logout-confirm-yes" data-logout-action="confirm">أيوه، خروج</button></div></div>';
 document.body.appendChild(overlay);
 overlay.addEventListener('click',function(e){
  if(e.target===overlay||e.target.closest('[data-logout-action="cancel"]')){overlay.remove();return;}
  if(e.target.closest('[data-logout-action="confirm"]')){
   overlay.remove();
   performFanniLogout();
   if(action==='back'){
    if(window.history.length>1)window.history.back();
    else window.location.href='/';
   }
  }
 });
 overlay.querySelector('[data-logout-action="cancel"]').focus();
}

function logout(){showLogoutConfirmation();}

function performFanniLogout(){
 clearAuth();
 currentUser=null;
 Object.assign(state,{
  tab:'login',orders:[],filteredOrders:[],myOffers:[],
  walletHistory:[],walletBalance:0,error:'',success:'',
  pendingMsg:'',offerModal:null,loading:false
 });
 render();
 toast('تم تسجيل الخروج');
}

function setTab(tab){
 state.tab=tab;
 state.error='';
 state.success='';
 state.pendingMsg='';
 render();

 if(tab==='available')loadOrders();
if(tab==='myOffers'||tab==='completed')loadMyOffers();
 if(tab==='wallet'){loadWalletHistory();loadWalletTransferNumbers();}
 if(tab==='profile')loadProfile();
}

function toggleSpecialtyCategory(label){
 state.openSpecialtyCategory=state.openSpecialtyCategory===label?'':label;
 render();
}

function toggleSpecialty(s){
 if(state.regSpecialties.includes(s)){
  state.regSpecialties=state.regSpecialties.filter(x=>x!==s);
 }else if(state.regSpecialties.length<20){
  state.regSpecialties.push(s);
 }else{
  toast('يمكنك اختيار 20 تخصصًا كحد أقصى','error');
 }

 render();
}

function fanniCanHandleServiceFrontend(specialties, serviceName) {
 if (!Array.isArray(specialties) || !serviceName) return false;

 const normalize = value => String(value || '')
  .trim()
  .replace(/\s+/g, ' ');

 const service = normalize(serviceName);
 const selected = specialties.map(normalize).filter(Boolean);

 if (selected.includes(service)) return true;

 const category = CATEGORIES.find(cat =>
  Array.isArray(cat.services) &&
  cat.services.some(item => normalize(item) === service)
 );

 if (!category) return false;

 return selected.includes(normalize(category.label));
}

function hasSubmittedOffer(sn){
 const target=String(sn||'').trim().toUpperCase();
 if(!target)return false;

 return [...state.myOffers,...state.completedOffers].some(offer=>{
  const offerSn=String(offer?.orderSn||offer?.sn||offer?.order?.sn||'').trim().toUpperCase();
  return offerSn===target;
 });
}

function applyFilter() {
 const specialties = Array.isArray(currentUser?.specialties)
  ? currentUser.specialties
  : [];

 const acceptedSn = new Set(
  state.myOffers
   .filter(o => o?.accepted === true)
   .map(o => String(o.orderSn || o.sn || o.order?.sn || '').trim().toUpperCase())
   .filter(Boolean)
 );

 let list = [...state.orders].filter(o => {
  const sn = String(o.sn || o.orderSn || o.order?.sn || '')
   .trim()
   .toUpperCase();

  return !sn || !acceptedSn.has(sn);
 });

 if (specialties.length) {
  list = list.filter(o => {
   const service = o.service || o.specialty || o.order?.service || '';
   return fanniCanHandleServiceFrontend(specialties, service);
  });
 } else {
  list = [];
 }

 if (state.filterSkill !== 'الكل') {
  list = list.filter(o =>
   String(o.service || o.specialty || o.order?.service || '') === state.filterSkill
  );
 }

 if (state.search) {
  const q = state.search.toLowerCase();

  list = list.filter(o =>
   [o.sn, o.area, o.service, o.specialty, o.order?.service]
    .some(x => String(x || '').toLowerCase().includes(q))
  );
 }

 state.filteredOrders = list;
}

function onSearch(v){
 state.search=clean(v,50);
 applyFilter();
 render();
}

function onFilterSkill(v){
 state.filterSkill=v;
 applyFilter();
 render();
}

function isRatingSkipped(role,sn){try{return localStorage.getItem('sonaa_rating_skipped_'+role+'_'+String(sn||'').toUpperCase())==='1';}catch{return false;}}

function dismissRatingPrompt(sn){const code=String(sn||'').toUpperCase();dismissedFanniRatings.add(code);try{localStorage.setItem('sonaa_rating_skipped_fanni_'+code,'1');}catch{}render();toast('تم تخطي تقييم العميل لهذا الطلب.','success');}

function focusRatingPrompt(sn){const target=document.getElementById('fanni-rating-'+String(sn||'').toUpperCase());if(target)target.scrollIntoView({behavior:'smooth',block:'center'});}

function renderAcceptedClient(o){
 if(o?.accepted!==true){
  return '<div class="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">بيانات العميل مخفية لحين قبول العميل للعرض.</div>';
 }

 const client=o?.client;

 if(!client||typeof client!=='object'){
  return '<div class="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-6 text-amber-800">تم قبول العرض، لكن تعذر عرض بيانات العميل حاليًا. حدّث العروض وحاول مرة أخرى.</div>';
 }

 return `<section class="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
  <div class="flex items-center gap-2">
   <span class="text-xl">🔓</span>
   <div><h4 class="text-[13px] font-extrabold text-emerald-900">بيانات العميل — تم قبول عرضك</h4><p class="text-[10px] text-emerald-800 mt-1">استخدم البيانات للتواصل بشأن تنفيذ الخدمة.</p></div>
  </div>
  <div class="rounded-xl bg-white border border-emerald-100 p-3"><div class="text-[10px] text-slate-500 mb-1">اسم العميل</div><b class="text-[12px]">${esc(client.name||'غير متاح')}</b></div>
  <div class="rounded-xl bg-white border border-emerald-100 p-3"><div class="text-[10px] text-slate-500 mb-1">سجل العميل</div><div class="mt-1 flex flex-wrap gap-2"><span class="rounded-full bg-amber-50 border border-amber-200 px-2 py-1 text-[10px] font-extrabold text-amber-800">★ ${Number(client.ratingAverage||0).toFixed(1)} (${Number(client.ratingCount||0)} تقييم)</span><span class="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-1 text-[10px] font-extrabold text-emerald-800">✓ ${Number(client.completedJobs||0)} عمل مكتمل</span></div></div>
  <div class="rounded-xl bg-white border border-emerald-100 p-3">
   <div class="text-[10px] text-slate-500 mb-1">رقم العميل</div>
   <b class="text-[13px]" dir="ltr">${esc(client.phone||'غير متاح')}</b>
   ${client.phone?`<a class="inline-block mr-2 mt-2 rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-extrabold text-white" href="tel:${encodeURIComponent(String(client.phone))}">اتصال بالعميل</a>`:''}
  </div>
  <div class="rounded-xl bg-white border border-emerald-100 p-3"><div class="text-[10px] text-slate-500 mb-1">منطقة الخدمة</div><b class="text-[12px]">${esc(client.area||'غير متاحة')}</b></div>
  <div class="rounded-xl bg-white border border-emerald-100 p-3"><div class="text-[10px] text-slate-500 mb-1">العنوان التفصيلي</div><b class="text-[12px] leading-6 break-words">${esc(client.address||'غير متاح')}</b></div>
  ${client.description?`<div class="rounded-xl bg-white border border-emerald-100 p-3"><div class="text-[10px] text-slate-500 mb-1">وصف الطلب</div><p class="text-[12px] leading-6 break-words">${esc(client.description)}</p></div>`:''}
  ${o.hasVoiceRecording?`<div class="rounded-xl border border-teal-200 bg-white p-3"><div class="mb-2 text-[12px] font-extrabold text-teal-900">🎙️ تسجيل صوتي من العميل</div><p class="mb-3 text-[11px] leading-5 text-slate-600">استمع لشرح العميل للمشكلة قبل تنفيذ الخدمة.</p><button type="button" onclick="playOrderVoice('${esc(o.orderSn||'')}',this)" class="w-full rounded-xl bg-teal-700 px-4 py-3 text-[12px] font-extrabold text-white">▶️ تشغيل تسجيل العميل</button></div>`:''}
  ${String(client.budget??'').trim()?`<div class="rounded-xl bg-white border border-emerald-100 p-3"><div class="text-[10px] text-slate-500 mb-1">ميزانية العميل</div><b class="text-[12px]">${esc(client.budget)} جنيه</b></div>`:''}
 </section>`;
}

async function loadNotifications(){if(!getToken())return;try{const data=await API.notifications();state.notifications=Array.isArray(data.notifications)?data.notifications:[];state.notificationsUnread=Number(data.unreadCount||0);var badge=document.getElementById('notificationBadge');if(badge)badge.textContent=state.notificationsUnread?(state.notificationsUnread>99?'99+':String(state.notificationsUnread)):'';if(state.notificationsOpen)render();}catch(e){log('تعذر تحميل الإشعارات',e.message);}}

async function toggleNotifications(){state.notificationsOpen=!state.notificationsOpen;if(state.notificationsOpen)await loadNotifications();render();}

async function openNotification(id){const selected=state.notifications.find(n=>n.id===id);try{if(selected&&!selected.read)await API.readNotification(id);}catch(e){}state.notifications=state.notifications.map(n=>n.id===id?Object.assign({},n,{read:true}):n);if(selected&&!selected.read)state.notificationsUnread=Math.max(0,state.notificationsUnread-1);state.notificationsOpen=false;if(selected&&['topup_approved','topup_rejected'].includes(selected.type))state.tab='wallet';else if(selected&&selected.type==='offer_accepted')state.tab='myOffers';else if(selected&&selected.type==='new_opportunity')state.tab='available';render();if(state.tab==='wallet')loadWalletHistory();else if(state.tab==='myOffers')loadMyOffers();else if(state.tab==='available')loadOrders();}

async function markAllNotificationsRead(){try{await API.readAllNotifications();state.notifications=state.notifications.map(n=>Object.assign({},n,{read:true}));state.notificationsUnread=0;render();}catch(e){toast(e.message||'تعذر تحديث الإشعارات','error');}}

function notificationBadge(){return '<span id="notificationBadge" class="absolute -right-1 -top-1 min-w-[17px] rounded-full bg-red-600 px-1 text-[9px] font-black text-white">'+(state.notificationsUnread?(state.notificationsUnread>99?'99+':state.notificationsUnread):'')+'</span>';}

function notificationPanel(){if(!state.notificationsOpen)return '';var html='<div class="fixed inset-0 z-[99]" onclick="state.notificationsOpen=false;render()"></div><div class="fixed left-3 right-3 top-[70px] z-[100] mx-auto max-w-[420px] overflow-hidden rounded-2xl border border-amber-200 bg-white text-slate-800 shadow-2xl"><div class="flex items-center justify-between gap-2 border-b p-3"><b class="text-[15px] font-extrabold">الإشعارات</b><div class="flex items-center gap-3"><button onclick="markAllNotificationsRead()" class="text-[12px] font-extrabold text-blue-700">تعليم الكل كمقروء</button><button type="button" aria-label="إغلاق الإشعارات" title="إغلاق" onclick="state.notificationsOpen=false;render()" class="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-2xl font-bold leading-none text-slate-700 hover:bg-slate-200">×</button></div></div><div class="max-h-[60vh] overflow-y-auto">';if(!state.notifications.length)html+='<p class="p-6 text-center text-[12px] text-slate-500">مفيش إشعارات لحد دلوقتي.</p>';state.notifications.forEach(n=>{html+='<button type="button" data-fanni-notification-id="'+esc(n.id)+'" class="block w-full border-b p-3 text-right '+(n.read?'bg-white':'bg-amber-50')+'"><b class="block text-[16px] font-bold text-slate-900">'+esc(n.title)+'</b><span class="mt-1 block text-[15px] font-semibold leading-7 text-slate-800">'+esc(n.message)+'</span><small class="mt-2 block text-[11px] font-medium text-slate-500">'+(n.createdAt?new Date(n.createdAt).toLocaleString('ar-EG'):'')+'</small></button>';});return html+'</div></div>';}

async function acceptTechnicianGuidelines(){try{const result=await API.acceptGuidelines();if(currentUser){currentUser.technicianGuidelinesAcceptedAt=result.acceptedAt||new Date().toISOString();currentUser.technicianGuidelinesVersion=result.version||'2026-10-20-v1';}toast(result.message||'تم تسجيل الموافقة.');render();}catch(e){toast(e.message||'تعذر تسجيل الموافقة.','error');}}

async function sendFanniQuickReply(sn,offerId,reply){try{await API.sendChat(sn,reply,offerId);await refreshFanniChatsSilently();toast('تم إرسال الرد.');}catch(e){toast(e.message||'تعذر إرسال الرد.','error');}}

async function sendFanniChat(sn,offerId){const el=document.getElementById('fanni-chat-'+sn);const text=String(el?.value||'').trim();if(!text)return toast('اكتب الرسالة أولًا.','error');try{await API.sendChat(sn,text,offerId);if(el)el.value='';await refreshFanniChatsSilently();toast('تم إرسال الرسالة.');}catch(e){toast(e.message||'تعذر إرسال الرسالة.','error');}}

async function requestFanniPriceChange(sn){const price=Number(document.getElementById('price-change-'+sn)?.value);const reason=String(document.getElementById('price-reason-'+sn)?.value||'').trim();const offer=[...state.myOffers,...state.completedOffers].find(o=>String(o.orderSn||o.sn||o.order?.sn||'').toUpperCase()===String(sn||'').toUpperCase());const currentPrice=Number(offer?.client?.acceptedOfferPrice??offer?.acceptedOfferPrice??offer?.priceNum??offer?.price);if(!Number.isFinite(currentPrice))return toast('تعذر تحديد السعر الحالي؛ حدّث البيانات وحاول مرة أخرى.','error');if(!Number.isFinite(price)||price<=currentPrice||price<=0)return toast('السعر الجديد لازم يكون أعلى من السعر الحالي ('+currentPrice+' جنيه).','error');if(reason.length<5)return toast('اكتب سببًا واضحًا للتعديل.','error');try{const r=await API.requestPriceChange(sn,price,reason);toast(r.message||'تم إرسال طلب تعديل السعر.');await loadMyOffers();}catch(e){toast(e.message||'تعذر طلب تعديل السعر.','error');}}

function errorBox(s){
 return `<p class="text-[12px] font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl p-3 leading-6">${esc(s)}</p>`;
}

function successBox(s){
 return `<p class="text-[12px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl p-3">${esc(s)}</p>`;
}
