/* Extracted page functions; classic-script globals are preserved. */
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
