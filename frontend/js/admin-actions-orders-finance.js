/* Extracted page functions; classic-script globals are preserved. */
'use strict';

async function assignOrder(sn){
  const order=state.orders.find(o=>String(o.sn||'').toUpperCase()===String(sn||'').toUpperCase());
  const offers=Array.isArray(order?.offers)?order.offers:[];
  if(!order||!offers.length)return showToast('لا توجد عروض فنيين على الطلب لتعيين أحدهم','error');
  const choices=offers.map((o,i)=>(i+1)+') '+String(o.fanniName||'فني')+' — '+String(o.price||'')+' جنيه').join('\n');
  const raw=prompt('اختار رقم العرض لتعيين الفني. سيتم خصم عمولة المنصة من محفظته بعد التأكيد:\n'+choices,'1');
  if(raw===null)return;
  const choice=Number(raw);
  if(!Number.isInteger(choice)||choice<1||choice>offers.length)return showToast('رقم العرض غير صحيح','error');
  const offer=offers[choice-1];
  if(!offer._id)return showToast('معرّف العرض غير متاح؛ حدّث الطلب وحاول مرة أخرى','error');
  const reason=prompt('سبب التعيين الإداري (مطلوب):','تعيين إداري بعد مراجعة العروض');
  if(reason===null)return;
  if(reason.trim().length<3)return showToast('اكتب سببًا واضحًا للتعيين','error');
  if(!confirm('تأكيد تعيين '+String(offer.fanniName||'الفني')+' على الطلب '+sn+'؟ سيتم تسجيل عمولة المنصة من محفظة الفني.'))return;
  try{
    const data=await tryApi(['/api/admin/orders/'+encodeURIComponent(sn)+'/assign'],{method:'POST',body:JSON.stringify({offerId:String(offer._id),reason:reason.trim()})});
    showToast(data.message||'تم تعيين الفني');
    await loadOrders();await loadAll();
  }catch(e){showToast(e.message||'تعذر تعيين الفني','error');}
}

async function saveOrderCorrection(sn){
  sn=String(sn||'').trim().toUpperCase();
  const getValue=(field)=>{const el=document.getElementById('edit-order-'+field+'-'+sn);return el?String(el.value||'').trim():'';};
  const payload={clientName:getValue('name'),clientPhone:getValue('phone'),service:getValue('service'),area:getValue('area'),address:getValue('address'),description:getValue('description'),budget:getValue('budget')};
  if(!payload.clientPhone||!payload.service||!payload.area){showToast('رقم العميل والخدمة والمنطقة حقول مطلوبة','error');return;}
  if(!/^01[0-9]{9}$/.test(normalizePhoneInput(payload.clientPhone))){showToast('رقم الموبايل غير صحيح؛ اكتب رقمًا مصريًا من 11 رقمًا','error');return;}
  try{
    const result=await tryApi([`/api/admin/orders/${encodeURIComponent(sn)}/correct`],{method:'PATCH',body:JSON.stringify(payload)});
    showToast(result.message||'تم حفظ تصحيح البيانات');
    delete state.pendingActions['order:'+sn];
    await loadOrders();
  }catch(e){showToast(e.message||'تعذر حفظ التصحيح','error');}
}

async function publishOrder(sn){sn=String(sn||'').trim().toUpperCase(); if(!/^SN\d{6}$/.test(sn)){showToast('كود الطلب غير صحيح','error');return;} if(state.publishingOrders.includes(sn))return; const order=state.orders.find(o=>String(o.sn||'').toUpperCase()===sn); if(!order){showToast('لم يتم العثور على الطلب','error');return;} if(order.status!=='قيد المراجعة'){showToast('الطلب ليس قيد المراجعة','warning');return;} if(!confirm(`هل تريد نشر الطلب ${sn} للفنيين؟`))return; state.publishingOrders.push(sn); render(); try{const result=await tryApi([`/api/orders/admin/${encodeURIComponent(sn)}/publish`],{method:'POST',body:JSON.stringify({})}); showToast(result.message||'تم نشر الطلب'); await loadOrders();}catch(e){showToast(e.message||'تعذر نشر الطلب','error');}finally{state.publishingOrders=state.publishingOrders.filter(item=>item!==sn); if(state.tab==='orders')render();}}

async function cancelOrder(sn){
  sn=String(sn||'').trim().toUpperCase();
  if(!/^SN\d{6}$/.test(sn)){showToast('كود الطلب غير صحيح','error');return;}
  const reason=prompt('سبب إلغاء الطلب (اختياري):','إلغاء إداري');
  if(reason===null)return;
  if(!confirm(`تأكيد إلغاء الطلب ${sn}؟`))return;
  try{
    const result=await tryApi([`/api/admin/orders/${encodeURIComponent(sn)}/cancel`],{method:'POST',body:JSON.stringify({reason:reason.trim()})});
    showToast(result.message||'تم إلغاء الطلب');
    await loadOrders();
  }catch(e){showToast(e.message||'تعذر إلغاء الطلب','error');}
}

async function archiveOrder(sn){
  sn=String(sn||'').trim().toUpperCase();
  if(!/^SN\d{6}$/.test(sn)){showToast('كود الطلب غير صحيح','error');return;}
  const reason=prompt('ملاحظة الأرشفة (اختياري):','أرشفة إدارية');
  if(reason===null)return;
  if(!confirm(`تأكيد أرشفة الطلب ${sn}؟`))return;
  try{
    const result=await tryApi([`/api/admin/orders/${encodeURIComponent(sn)}/archive`],{method:'POST',body:JSON.stringify({reason:reason.trim()})});
    showToast(result.message||'تمت أرشفة الطلب');
    await loadOrders();
  }catch(e){showToast(e.message||'تعذرت أرشفة الطلب','error');}
}

async function deleteOrder(sn){sn=String(sn||'').trim().toUpperCase(); if(!/^SN\d{6}$/.test(sn)){showToast('كود الطلب غير صحيح','error');return;} if(state.deletingItems.includes('order:'+sn))return; const order=state.orders.find(item=>String(item.sn||'').trim().toUpperCase()===sn); if(!order){showToast('لم يتم العثور على الطلب','error');return;} if(!confirm(`تأكيد حذف الطلب ${sn} نهائي؟`))return; state.deletingItems.push('order:'+sn); render(); try{const result=await tryApi([`/api/admin/orders/${encodeURIComponent(sn)}`],{method:'DELETE'}); showToast(result.message||'تم حذف الطلب'); await loadOrders();}catch(e){showToast(e.message||'تعذر حذف الطلب','error');}finally{state.deletingItems=state.deletingItems.filter(item=>item!=='order:'+sn); if(state.tab==='orders')render();}}

async function deleteClient(){const input=document.getElementById('delete-client-phone'); if(!input){showToast('خانة رقم الهاتف غير موجودة','error');return;} const rawPhone=String(input.value||'').trim(); const phone=normalizePhoneInput(rawPhone); if(!phone){showToast('اكتب رقم الموبايل','error');return;} if(!/^01[0-9]{9}$/.test(phone)){showToast('رقم الموبايل غير صحيح','error');return;} const deleteKey='client:'+phone; if(state.deletingItems.includes(deleteKey))return; if(!confirm(`حذف طلبات الرقم ${phone}؟`))return; state.deletingItems.push(deleteKey); try{const result=await tryApi([`/api/admin/clients/${encodeURIComponent(phone)}`],{method:'DELETE'}); showToast(result.message||'تم تنفيذ الحذف'); if(document.getElementById('delete-client-phone'))document.getElementById('delete-client-phone').value=''; await loadOrders();}catch(e){showToast(e.message||'تعذر الحذف','error');}finally{state.deletingItems=state.deletingItems.filter(item=>item!==deleteKey); if(state.tab==='orders')render();}}

async function removeOffer(sn,idx){if(!confirm('هل تريد إزالة هذا العرض؟'))return; try{await tryApi([`/api/admin/offers/${encodeURIComponent(sn)}/${idx}`],{method:'DELETE'}); showToast('تمت إزالة العرض'); await loadOrders();}catch(e){showToast(e.message);}}

async function rejectOffer(sn,idx){if(!confirm('رفض هذا العرض مع سبب؟'))return; try{await tryApi([`/api/admin/offers/${encodeURIComponent(sn)}/${idx}/reject`],{method:'POST',body:JSON.stringify({reason:'غير مناسب'})}); showToast('تم رفض العرض'); await loadOrders();}catch(e){showToast(e.message);}}

async function setBalance(id){const input=document.getElementById('bal-'+id); if(!input)return showToast('خانة الرصيد غير موجودة','error'); const amount=input.value; if(amount===''||!Number.isFinite(Number(amount))||Number(amount)<0){return showToast('اكتب مبلغًا صحيحًا','error');} if(!confirm(`تعيين رصيد الفني إلى ${amount} جنيه؟`))return; try{const res=await tryApi([`/api/admin/fannis/${encodeURIComponent(id)}/set-balance`],{method:'POST',body:JSON.stringify({amount:Number(amount)})}); showToast(res.message||`تم تعيين الرصيد`); await loadAll();}catch(e){showToast(e.message,'error')}}

async function addBalance(id){const input=document.getElementById('bal-'+id); if(!input)return showToast('خانة الرصيد غير موجودة','error'); const amount=input.value; if(amount===''||!Number.isFinite(Number(amount))||Number(amount)<=0){return showToast('اكتب مبلغًا صحيحًا','error');} if(!confirm(`إضافة ${amount} جنيه؟`))return; try{const res=await tryApi([`/api/admin/fannis/${encodeURIComponent(id)}/add-balance`],{method:'POST',body:JSON.stringify({amount:Number(amount)})}); showToast(res.message||'تمت الإضافة'); await loadAll();}catch(e){showToast(e.message,'error')}}

async function approveTopup(id){if(!confirm('تأكيد قبول طلب الشحن؟'))return; try{const res=await tryApi([`/api/admin/topup-requests/${encodeURIComponent(id)}/approve`],{method:'POST',body:JSON.stringify({})}); showToast(res.message||'تم قبول الشحن'); await loadAll();}catch(e){showToast(e.message,'error')}}

async function rejectTopup(id){if(!confirm('هل تريد رفض طلب الشحن؟'))return; try{await tryApi([`/api/admin/topup-requests/${encodeURIComponent(id)}/reject`],{method:'POST',body:JSON.stringify({})}); showToast('تم رفض الشحن'); await loadAll();}catch(e){showToast(e.message,'error');}}

async function loadPricing(){try{const data=await tryApi(['/api/admin/pricing'],{method:'GET'});state.pricing=data.pricing||{};state.pricingHistory=Array.isArray(data.history)?data.history:[];if(state.tab==='pricing')render();}catch(e){showToast(e.message||'تعذر تحميل الأسعار','error');}}

async function savePricing(){const raw={check:document.getElementById('price-check')?.value,commission:document.getElementById('price-commission')?.value,minOffer:document.getElementById('price-min')?.value,maxOffer:document.getElementById('price-max')?.value};const values={check:Number(raw.check),commission:Number(raw.commission),minOffer:Number(raw.minOffer),maxOffer:Number(raw.maxOffer)};if(Object.values(values).some(v=>!Number.isFinite(v))||values.check<0||values.commission<0||values.commission>100||values.minOffer<1||values.maxOffer<values.minOffer)return showToast('راجع القيم: العمولة 0–100 والحدود السعرية صحيحة','error');const btn=document.getElementById('save-pricing-btn');if(btn)btn.disabled=true;try{const data=await tryApi(['/api/admin/pricing'],{method:'PUT',body:JSON.stringify(values)});state.pricing=data.pricing||values;state.pricingHistory=Array.isArray(data.history)?data.history:state.pricingHistory;showToast(data.message||'تم حفظ الأسعار');render();}catch(e){showToast(e.message||'تعذر حفظ الأسعار','error');}finally{if(btn)btn.disabled=false;}}

async function loadWalletTransactions(){const fanniId=String(document.getElementById('wallet-fanni')?.value||state.walletSelectedFanniId||'');if(!fanniId)return showToast('اختار الفني الأول','error');state.walletSelectedFanniId=fanniId;state.walletLoading=true;state.walletTransactions=[];render();try{const data=await tryApi([`/api/admin/wallet/transactions/${encodeURIComponent(fanniId)}`],{method:'GET'});state.walletTransactions=extractList(data,['transactions','data','items']);showToast('تم تحميل كشف الحساب الحقيقي');}catch(e){state.walletTransactions=[];showToast(e.message||'تعذر تحميل كشف الحساب','error');}finally{state.walletLoading=false;if(state.tab==='wallets')render();}}

async function freezeWallet(){const fanniId=String(document.getElementById('wallet-fanni')?.value||state.walletSelectedFanniId||'');if(!fanniId)return showToast('اختار الفني الأول','error');const fanni=state.fannis.find(f=>String(f._id)===fanniId);const action=fanni?.isFrozen?'unfreeze':'freeze';const reason=prompt(action==='freeze'?'سبب تجميد المحفظة (مطلوب للتوثيق):':'سبب إلغاء تجميد المحفظة:','مراجعة إدارية');if(reason===null)return;if(!reason.trim())return showToast('اكتب سبب الإجراء','error');if(!confirm(action==='freeze'?'تأكيد تجميد محفظة هذا الفني؟':'تأكيد إلغاء تجميد المحفظة؟'))return;try{const data=await tryApi([`/api/admin/wallet/freeze/${encodeURIComponent(fanniId)}`],{method:'POST',body:JSON.stringify({action,reason:reason.trim()})});showToast(data.message||'تم تنفيذ الإجراء');await loadAll();await loadWalletTransactions();}catch(e){showToast(e.message||'تعذر تحديث حالة المحفظة','error');}}

async function adjustWallet(){const fanniId=String(document.getElementById('wallet-fanni')?.value||state.walletSelectedFanniId||'');if(!fanniId)return showToast('اختار الفني الأول','error');const fanni=state.fannis.find(f=>String(f._id)===fanniId);const current=Number(fanni?.walletBalance??fanni?.balance??0);const raw=prompt(`الرصيد الحالي ${current} جنيه. اكتب الرصيد الجديد بعد التسوية:` ,String(current));if(raw===null)return;const amount=Number(raw);if(raw.trim()===''||!Number.isFinite(amount)||amount<0)return showToast('اكتب رصيدًا صحيحًا غير سالب','error');const reason=prompt('سبب التسوية (مطلوب للتوثيق):','تسوية إدارية');if(reason===null)return;if(!reason.trim())return showToast('اكتب سبب التسوية','error');if(!confirm(`تأكيد تغيير الرصيد من ${current} إلى ${amount} جنيه؟`))return;try{const data=await tryApi([`/api/admin/fannis/${encodeURIComponent(fanniId)}/set-balance`],{method:'POST',body:JSON.stringify({amount,reason:reason.trim()})});showToast(data.message||'تمت التسوية وتسجيل الحركة المالية');await loadAll();await loadWalletTransactions();}catch(e){showToast(e.message||'تعذرت تسوية الرصيد','error');}}
