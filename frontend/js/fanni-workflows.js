'use strict';

async function loadOrders(){
 if(!getToken())return;

 state.loading=true;
 render();

 try{
  const [availableResult, offersResult]=await Promise.allSettled([
   API.available(),
   API.myOffers()
  ]);

  if(availableResult.status==='rejected')throw availableResult.reason;

  const data=availableResult.value;
  state.orders=extractList(data,['orders','requests','items']);

  // تحميل عروض الفني أيضًا حتى لا يظهر زر تقديم العرض مرة أخرى بعد تحديث الصفحة.
  if(offersResult.status==='fulfilled'){
   const allOffers=extractList(offersResult.value,['offers','items','requests']);
   state.completedOffers=allOffers.filter(o=>o.completed===true||o.orderStatus==='تم الانتهاء');
   state.myOffers=allOffers.filter(o=>!(o.completed===true||o.orderStatus==='تم الانتهاء'));
  }

  applyFilter();
  state.loading=false;
  render();
 }catch(e){
  state.loading=false;
  state.orders=[];
  state.filteredOrders=[];
  render();
  toast(e.message,'error');
 }
}

async function loadMyOffers(){
 if(!getToken())return;

 try{
  const data=await API.myOffers();
  const allOffers=extractList(data,['offers','items','requests']);
state.completedOffers=allOffers.filter(o=>o.completed===true||o.orderStatus==='تم الانتهاء');
state.myOffers=allOffers.filter(o=>!(o.completed===true||o.orderStatus==='تم الانتهاء'));
  applyFilter();
  render();
 }catch(e){
  log('my offers',e);

  if(e.status===401){
   toast('انتهت جلسة الدخول. سجل دخولك مرة أخرى.','error');
  }
 }
}
 
function toggleFanniRatingBlock(sn){
 const select=document.getElementById('rating-stars-'+sn);
 const wrap=document.getElementById('rating-block-wrap-'+sn);
 if(wrap)wrap.style.display=Number(select?.value)===1?'flex':'none';
 if(Number(select?.value)!==1){
  const checkbox=document.getElementById('rating-block-'+sn);
  if(checkbox)checkbox.checked=false;
 }
}
async function submitFanniRating(sn){
 const stars=Number(document.getElementById('rating-stars-'+sn)?.value);
 const comment=String(document.getElementById('rating-comment-'+sn)?.value||'').trim().slice(0,500);
 const blockFuture=Boolean(document.getElementById('rating-block-'+sn)?.checked);
 if(!Number.isInteger(stars)||stars<1||stars>5){toast('اختار عدد النجوم','error');return;}
 if(blockFuture&&stars!==1){toast('إيقاف التعامل متاح مع تقييم نجمة واحدة فقط','error');return;}
 try{await API.rateOrder(sn,{stars,comment,blockFuture});toast('تم حفظ تقييمك بنجاح');await loadMyOffers();}
 catch(e){toast(e.message||'تعذر حفظ التقييم','error');}
}
async function completeOrder(sn){
 const code=String(sn||'').trim().toUpperCase();
 if(!code){
  toast('كود الطلب غير موجود','error');
  return;
 }

 if(!confirm('هل تؤكد إنك أنهيت تنفيذ المهمة؟')) return;

 try{
  const result=await API.complete(code);
  toast(result?.message||'تم إكمال المهمة بنجاح');
  state.tab='completed';
  await loadMyOffers();
  setTimeout(()=>focusRatingPrompt(code),120);
 }catch(e){
  toast(e?.message||'تعذر إكمال المهمة','error');
 }
 }
 
async function loadWalletHistory(){
 if(!getToken())return;

 try{
  const data=await API.walletHistory();

  state.walletHistory=extractList(data,['history','requests','transactions','items']);

  state.walletBalance=data.balance
   ??data.walletBalance
   ??data.wallet?.balance
   ??currentUser?.walletBalance
   ??currentUser?.balance
   ??0;

  if(currentUser){
   currentUser.walletBalance=state.walletBalance;
   setAuth(getToken(),currentUser);
  }

  render();
 }catch(e){
  log('wallet history',e);

  if(e.status===401){
   toast('انتهت جلسة الدخول. سجل دخولك مرة أخرى.','error');
  }
 }
}

async function submitWallet(){
 if(state.walletLoading)return;

 if(!isApproved()){toast('شحن المحفظة متاح بعد اعتماد حسابك','error');return}
 if(!V.phone(state.walletFromPhone)){toast('رقم الهاتف المحول منه غير صحيح','error');return}
 if(!V.money(state.walletAmount,10,10000)){toast('المبلغ يجب أن يكون عددًا صحيحًا من 10 إلى 10000 جنيه','error');return}
 if(state.walletRef&&!V.text(state.walletRef,1,50)){toast('الكود المرجعي يجب ألا يتجاوز 50 حرفًا','error');return}

 state.walletLoading=true;
 state.error='';
 state.success='';
 render();

 try{
  const phone=state.walletFromPhone.replace(/\D/g,'');
  const reference=clean(state.walletRef,50);

  await API.topup({
   fromPhone:phone,
   phone,
   amount:Number(state.walletAmount),
   reference,
   referenceCode:reference,
   method:state.walletMethod,
   note:`تحويل من ${phone} بقيمة ${Number(state.walletAmount)} - كود: ${reference||'بدون'}`.slice(0,200)
  });

  state.walletLoading=false;
  state.success='تم إرسال طلب الشحن للمراجعة.';
  state.walletFromPhone='';
  state.walletAmount='';
  state.walletRef='';

  render();
  toast('تم إرسال طلب الشحن');
  await loadWalletHistory();
 }catch(e){
  state.walletLoading=false;
  state.error=e.message;
  render();
  toast(e.message,'error');
 }
}

function openOffer(sn){
 if(!isApproved()){toast('لا يمكن إرسال عرض قبل اعتماد الحساب','error');return}
 if(!V.sn(sn)){toast('كود الطلب غير صحيح','error');return}

 state.offerModal={sn};
 state.offerPrice='';
 state.offerMessage='';
 state.offerError='';
 state.error='';
 render();
}

function closeOffer(){
 if(state.offerSubmitting)return;

 state.offerModal=null;
 state.offerError='';
 render();
}

async function submitOffer(){
 if(!state.offerModal||state.offerSubmitting)return;

 if(!isApproved()){
  state.offerError='لا يمكن إرسال عرض قبل اعتماد الحساب.';
  render();
  return;
 }

 const sn=state.offerModal.sn;
 const price=Number(state.offerPrice);
 const message=clean(state.offerMessage,500);

 if(state.myOffers.some(o=>o?.accepted===true&&o?.orderStatus==='تم اختيار فني')){toast('لديك مهمة جارية حاليًا. برجاء إنهاء المهمة الحالية أولًا قبل التقدم لأي طلب جديد.','error');return;}

 if(!V.money(price,10,1000000)){
  state.offerError='السعر يجب أن يكون عددًا صحيحًا من 10 إلى مليون جنيه.';
  render();
  return;
 }

 if(!V.text(message,5,500)){
  state.offerError='اكتب رسالة من 5 إلى 500 حرف.';
  render();
  return;
 }

 state.offerSubmitting=true;
 state.offerError='';
 render();

 try{
  const result=await API.offer(sn,{price,message});

  state.offerSubmitting=false;
  state.offerModal=null;
  state.offerPrice='';
  state.offerMessage='';
  state.offerError='';

  render();
  toast(result?.message||'تم إرسال العرض بنجاح');

  await Promise.allSettled([loadMyOffers(),loadOrders()]);
 }catch(e){
  state.offerSubmitting=false;
  state.offerError=e?.message||'تعذر إرسال العرض. حاول مرة أخرى.';
  render();
  toast(state.offerError,'error');
 }
}

let fanniLoadingSafetyTimer=null;
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

let globalRefreshInProgress=false;
let fanniChatPollInFlight=false,fanniLiveRenderPending=false;
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
let fanniMessagesPollInFlight=false;
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
setInterval(refreshFanniChatsSilently,3000);
setInterval(refreshFanniChatMessagesSilently,2000);


start();
