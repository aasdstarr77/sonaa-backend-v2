/* Extracted page functions; classic-script globals are preserved. */
'use strict';

async function sendClientChat(sn){const el=document.getElementById('clientChatText');const text=String(el?.value||'').trim();if(!text)return showToast('اكتب الرسالة أولًا.');if(state.tracked?.status==='تم الانتهاء')return showToast('المهمة مكتملة؛ المحادثة للقراءة فقط.');try{await API.sendChat(sn,text,state.tracked?.acceptedOfferId||undefined);if(el)el.value='';state.trackInput=sn;await refreshTrackedSilently();showToast('تم إرسال الرسالة.','success');}catch(e){showToast(e.message||'تعذر إرسال الرسالة.');}}

async function sendClientOfferQuestion(sn,offerId,question){if(state.tracked?.status==='تم الانتهاء')return showToast('المهمة مكتملة؛ لا يمكن إرسال رسائل جديدة.');try{await API.sendChat(sn,question,offerId);state.trackInput=sn;await refreshTrackedSilently();showToast('تم إرسال استفسارك للفني.','success');}catch(e){showToast(e.message||'تعذر إرسال الاستفسار.');}}

function renderClientChatMessages(messages,mode){return (Array.isArray(messages)?messages:[]).map(function(m){const isClient=m.senderRole==='client';const color=mode==='accepted'?(isClient?'bg-blue-50':'bg-emerald-50'):(isClient?'bg-white':'bg-emerald-50');return '<div class="mt-2 rounded-lg p-2 '+color+'"><p class="text-[10px] font-bold">'+(isClient?'أنت':'الفني')+'</p><p class="text-[12px] '+(mode==='accepted'?'whitespace-pre-wrap break-words':'')+'">'+escHtml(m.text||'')+'</p></div>';}).join('');}

function updateClientChatDom(messages){if(!state.tracked)return;const sn=String(state.tracked.sn||state.trackInput||'').toUpperCase();const all=Array.isArray(messages)?messages:[];(state.tracked.offers||[]).forEach(function(offer){const offerId=String(offer._id||'');const box=document.getElementById('client-prechat-'+sn+'-'+offerId);if(box)box.innerHTML=renderClientChatMessages(all.filter(function(m){return String(m.targetOfferId||'')===offerId;}),'pre');});const accepted=document.getElementById('client-accepted-chat-'+sn);if(accepted)accepted.innerHTML=renderClientChatMessages(all,'accepted');}

async function decideClientPrice(sn,id,approved){try{await API.decidePrice(sn,id,approved);if(state.trackInput===sn&&state.tracked){await doTrack();}if(state.accountToken&&state.account)await loadMyOrders(false);render();showToast(approved?'تمت الموافقة على السعر الجديد.':'تم رفض تعديل السعر.','success');}catch(e){showToast(e.message||'تعذر تسجيل القرار.');}}

async function submitClientRating(sn){
  if(state.ratingSubmitting)return;
  const stars=Number(state.ratingStars);
  if(!Number.isInteger(stars)||stars<1||stars>5){showToast('اختار عدد النجوم.');return;}
  const blockFuture=stars===1&&Boolean(document.getElementById('clientRatingBlock')?.checked);
  const comment=String(state.ratingComment||'').trim().slice(0,500);
  state.ratingSubmitting=true;render();
  try{
    await API.rateOrder(sn,{stars,comment,blockFuture});
    state.ratingComment='';showToast('تم حفظ تقييمك بنجاح','success');state.trackInput=sn;await doTrack();
  }catch(error){showToast(error.message||'تعذر حفظ التقييم.');}
  finally{state.ratingSubmitting=false;render();}
}

async function refreshClientPage(){try{if(state.trackInput){const order=await API.getOrder(state.trackInput);state.tracked=order;render();}if(state.accountToken&&state.account)await Promise.allSettled([loadMyOrders(),loadNotifications()]);showToast('تم تحديث بيانات العميل.','success');}catch(error){showToast(error.message||'تعذر تحديث بيانات العميل.');}}

async function refreshTrackedSilently(){
 const input=String(state.trackInput||'').trim().toUpperCase();
 if(!VALIDATORS.sn(input)||clientChatPollInFlight||document.hidden)return;
 clientChatPollInFlight=true;
 try{
  const next=await API.getOrder(input);
  if(!state.tracked||String(state.tracked.sn||'').toUpperCase()!==input)return;
  const previous=state.tracked;
  const signature=o=>JSON.stringify({status:o?.status,acceptedOfferId:String(o?.acceptedOfferId||''),offers:(o?.offers||[]).map(x=>({id:String(x._id||''),status:x.offerStatus||x.status||'',accepted:!!x.accepted,price:x.priceNum??x.price??null})),priceChangeRequests:(o?.priceChangeRequests||[]).map(r=>({id:String(r._id||''),status:r.status||'',newPrice:r.newPrice??null,requestedAt:r.requestedAt||''})),canRate:o?.canRate,myRating:o?.myRating?String(o.myRating._id||o.myRating.createdAt||''):null});
  const orderChanged=signature(previous)!==signature(next);
  const messages=Array.isArray(next.chatMessages)?next.chatMessages:[];
  state.tracked=Object.assign({},next,{chatMessages:messages});
  if(Array.isArray(next.priceChangeRequests))state.tracked.priceChangeRequests=next.priceChangeRequests;
  updateClientChatDom(messages);
  if(orderChanged&&state.tab==='track'){
   if(!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){
    const scrollY=window.scrollY||window.pageYOffset||0;render();window.scrollTo({top:scrollY,left:0,behavior:'instant'});focusClientPostAction();clientLiveRenderPending=false;
   }else clientLiveRenderPending=true;
  }
 }catch(_){/* Keep the last successful order and conversation visible during temporary network failures. */}
 finally{clientChatPollInFlight=false;}
}

async function refreshTrackedChatSilently(){
 const input=String(state.trackInput||'').trim().toUpperCase();
 if(!VALIDATORS.sn(input)||!state.tracked||document.hidden||clientMessagesPollInFlight)return;
 clientMessagesPollInFlight=true;
 try{
  const data=await API.chat(input);
  if(!state.tracked||String(state.tracked.sn||'').toUpperCase()!==input)return;
  const previousRequests=JSON.stringify((state.tracked.priceChangeRequests||[]).map(r=>({id:String(r._id||''),status:r.status||'',newPrice:r.newPrice??null,requestedAt:r.requestedAt||''})));
  const nextRequests=Array.isArray(data.priceChangeRequests)?data.priceChangeRequests:state.tracked.priceChangeRequests||[];
  const nextMessages=Array.isArray(data.messages)?data.messages:[];
  state.tracked.chatMessages=nextMessages;
  state.tracked.priceChangeRequests=nextRequests;
  updateClientChatDom(nextMessages);
  const nextRequestSignature=JSON.stringify(nextRequests.map(r=>({id:String(r._id||''),status:r.status||'',newPrice:r.newPrice??null,requestedAt:r.requestedAt||''})));
  if(previousRequests!==nextRequestSignature&&['track','orders'].includes(state.tab)){
   if(!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){
    const scrollY=window.scrollY||window.pageYOffset||0;render();window.scrollTo({top:scrollY,left:0,behavior:'instant'});focusClientPostAction();
   }else clientLiveRenderPending=true;
  }
 }catch(_){/* Keep the last successful conversation visible during temporary network failures. */}
 finally{clientMessagesPollInFlight=false;}
}
