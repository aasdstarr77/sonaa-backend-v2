/* Extracted page functions; classic-script globals are preserved. */
'use strict';

function showFanniLoading(message){let overlay=document.getElementById('fanniLoadingOverlay');if(!overlay){overlay=document.createElement('div');overlay.id='fanniLoadingOverlay';overlay.className='fanni-loading-overlay';overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');overlay.innerHTML='<main class="account-gate min-h-screen px-4 py-8 flex items-center justify-center"><div class="w-full max-w-[440px] text-center"><div class="account-brand mx-auto mb-5 flex items-center justify-center"><img src="/images/LOGO_UPLOAD_HERE/logo.png" alt="صُنّاع" class="sonaa-logo-svg account-loading-logo"></div><h1 class="text-2xl font-black">صُنّاع</h1><p class="account-slogan mt-1 text-base font-extrabold">كل خدمة تبدأ بخطوة</p><div class="mt-7 inline-flex items-center gap-3 rounded-2xl border border-blue-200 bg-white/90 px-5 py-4 font-extrabold text-blue-900 shadow-xl"><span class="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></span><span id="fanniLoadingMessage">جاري تحميل البيانات...</span></div></div></main>';document.body.appendChild(overlay);}const label=document.getElementById('fanniLoadingMessage');if(label)label.textContent=message||'جاري تحميل البيانات...';overlay.classList.remove('is-hidden');clearTimeout(fanniLoadingSafetyTimer);fanniLoadingSafetyTimer=setTimeout(hideFanniLoading,9000);}

function hideFanniLoading(){clearTimeout(fanniLoadingSafetyTimer);const overlay=document.getElementById('fanniLoadingOverlay');if(overlay)overlay.classList.add('is-hidden');}

async function refreshTechnicianPage(){showFanniLoading(getToken()?'جاري تحميل البيانات...':'جاري تحميل البيانات...');try{await Promise.allSettled([loadServices(),loadAreas()]);if(getToken())await Promise.allSettled([loadProfile(),loadOrders(),loadMyOffers(),loadWalletHistory(),loadNotifications()]);toast('تم تحديث بيانات الفني');}finally{hideFanniLoading();}}

async function start(){
 showFanniLoading('جاري تحميل البيانات...');
 try{
  render();
  await Promise.allSettled([loadServices(),loadAreas()]);
  render();
  if(!getToken())return;
  state.checkingSession=true;
  await loadProfile();
  if(!getToken())return;
  await Promise.allSettled([loadOrders(),loadMyOffers(),loadWalletHistory(),loadNotifications()]);
 }catch(error){
  console.error('Technician page initialization failed:',error);
  const detail=String(error?.message||'خطأ غير معروف').slice(0,180);
  toast('حصل خطأ أثناء فتح صفحة الفني: '+detail,'error');
 }finally{
  state.checkingSession=false;
  hideFanniLoading();
  try{render();}catch(error){
   console.error('Technician page render failed:',error);
   const detail=String(error?.message||'خطأ غير معروف').slice(0,180);
   toast('تعذر عرض صفحة الفني: '+detail,'error');
  }
 }
}

function renderFanniChatMessages(messages,accepted){return (Array.isArray(messages)?messages:[]).map(function(m){return '<div class="rounded-lg p-2 '+(m.senderRole==='fanni'?'bg-blue-50':'bg-emerald-50')+'"><p class="text-[10px] font-bold">'+(m.senderRole==='fanni'?'أنت':'العميل')+'</p><p class="text-[12px] '+(accepted?'whitespace-pre-wrap break-words':'')+'">'+esc(m.text||'')+'</p></div>';}).join('');}

function liveFanniCanRender(){return !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);}

async function refreshFanniChatsSilently(){
 if(!getToken()||document.hidden||fanniChatPollInFlight)return;
 fanniChatPollInFlight=true;
 try{
  const beforeOffers=JSON.stringify((state.myOffers||[]).map(o=>({id:String(o._id||''),accepted:!!o.accepted,status:o.orderStatus||'',completed:!!o.completed,price:o.priceNum??o.price??null})));
  const beforeCompleted=JSON.stringify((state.completedOffers||[]).map(o=>String(o._id||'')));
  const beforeOrders=JSON.stringify((state.orders||[]).map(o=>({sn:String(o.sn||o.orderSn||''),status:o.status||o.orderStatus||'',offersCount:(o.offers||[]).length})));
  const [availableResult,offersResult,notificationsResult]=await Promise.allSettled([API.available(),API.myOffers(),API.notifications()]);
  if(availableResult.status==='fulfilled')state.orders=extractList(availableResult.value,['orders','requests','items']);
  let newlyAccepted=false;
  if(offersResult.status==='fulfilled'){
   const allOffers=extractList(offersResult.value,['offers','items','requests']);
   const nextActive=allOffers.filter(o=>!(o.completed===true||o.orderStatus==='تم الانتهاء'));
   const nextCompleted=allOffers.filter(o=>o.completed===true||o.orderStatus==='تم الانتهاء');
   const wasAccepted=new Map((state.myOffers||[]).map(o=>[String(o._id||''),o.accepted===true&&o.orderStatus==='تم اختيار فني']));
   newlyAccepted=nextActive.some(o=>o.accepted===true&&o.orderStatus==='تم اختيار فني'&&!wasAccepted.get(String(o._id||'')));
   state.myOffers=nextActive;state.completedOffers=nextCompleted;
  }
  if(notificationsResult.status==='fulfilled'){
   const data=notificationsResult.value;state.notifications=Array.isArray(data.notifications)?data.notifications:[];state.notificationsUnread=Number(data.unreadCount||0);
   const badge=document.getElementById('notificationBadge');if(badge)badge.textContent=state.notificationsUnread?(state.notificationsUnread>99?'99+':String(state.notificationsUnread)):'';
   if(state.notificationsOpen)fanniLiveRenderPending=true;
  }
  applyFilter();
  const afterOffers=JSON.stringify((state.myOffers||[]).map(o=>({id:String(o._id||''),accepted:!!o.accepted,status:o.orderStatus||'',completed:!!o.completed,price:o.priceNum??o.price??null})));
  const afterCompleted=JSON.stringify((state.completedOffers||[]).map(o=>String(o._id||'')));
  const afterOrders=JSON.stringify((state.orders||[]).map(o=>({sn:String(o.sn||o.orderSn||''),status:o.status||o.orderStatus||'',offersCount:(o.offers||[]).length})));
  const listChanged=beforeOffers!==afterOffers||beforeCompleted!==afterCompleted||beforeOrders!==afterOrders;
  if(newlyAccepted||(listChanged&&['available','myOffers','completed'].includes(state.tab)))fanniLiveRenderPending=true;
  if(fanniLiveRenderPending&&liveFanniCanRender()){
   fanniLiveRenderPending=false;const scrollY=window.scrollY||window.pageYOffset||0;render();window.scrollTo({top:scrollY,left:0,behavior:'instant'});
  }
  if(newlyAccepted){const accepted=state.myOffers.find(o=>o.accepted===true&&o.orderStatus==='تم اختيار فني');if(accepted)setTimeout(()=>document.getElementById('fanni-accepted-chat-'+String(accepted.orderSn||accepted.sn||'').toUpperCase())?.scrollIntoView({behavior:'smooth',block:'center'}),80);}}catch(_){/* Preserve the last successful state during temporary network failures. */}
 finally{fanniChatPollInFlight=false;}
}

async function refreshFanniChatMessagesSilently(){
 if(!getToken()||document.hidden||fanniMessagesPollInFlight||state.tab!=='myOffers')return;
 fanniMessagesPollInFlight=true;
 try{
  await Promise.allSettled((state.myOffers||[]).map(async function(offer){
   const sn=String(offer.orderSn||offer.sn||offer.order?.sn||'').toUpperCase();
   if(!/^SN\d{6}$/.test(sn))return;
   const offerId=String(offer._id||'');
   const accepted=offer.accepted===true;
   const targetId=accepted?'fanni-accepted-chat-'+sn:'fanni-prechat-chat-'+sn+'-'+offerId;
   if(!document.getElementById(targetId))return;
   const data=await API.chat(sn),messages=Array.isArray(data.messages)?data.messages:[];
   offer.chatMessages=messages;
   const box=document.getElementById(targetId);
   if(box)box.innerHTML=renderFanniChatMessages(messages,accepted);
  }));
 }catch(_){/* Keep the last successful chat visible during temporary network failures. */}
 finally{fanniMessagesPollInFlight=false;}
}
