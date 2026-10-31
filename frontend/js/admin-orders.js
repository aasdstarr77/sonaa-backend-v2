'use strict';

function renderOrders(){
  return `
  <section class="mt-4 space-y-4">
    <div class="rounded-[18px] bg-gradient-to-r from-slate-900 to-slate-800 p-4 text-white flex gap-3"><div class="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center">📦</div><div><p class="text-[12px] font-black">إدارة الطلبات والشغلانات</p><p class="text-[10px] text-slate-300 mt-1 font-bold">نشر • تعيين فني • إلغاء • أرشفة</p></div></div>
    <div class="premium-panel p-4 space-y-3">
      <div class="flex gap-2"><input id="delete-client-phone" type="tel" placeholder="01xxxxxxxxx" class="field flex-1" dir="ltr"><button onclick="deleteClient()" class="pill-btn danger-pill">حذف طلبات العميل</button></div>
      <div class="border-t pt-3 flex flex-wrap items-center justify-between gap-3">
        <label class="flex items-center gap-2 text-[11px] font-black"><input type="checkbox" onchange="toggleAllVisibleOrders(this.checked)" ${(state.filteredOrders||[]).length>0&&(state.filteredOrders||[]).every(o=>(state.selectedOrderSNs||[]).includes(String(o.sn||'').toUpperCase()))?'checked':''}> تحديد كل الطلبات المعروضة</label>
        <div class="flex items-center gap-2 flex-wrap"><span class="text-[10px] font-bold text-slate-500">المحدد: ${(state.selectedOrderSNs||[]).length}</span>${canPublishOrders()?'<button onclick="bulkPublishOrders()" class="pill-btn primary-pill">🚀 نشر المحدد</button>':''}<button onclick="bulkDeleteOrders()" ${(state.selectedOrderSNs||[]).length?'':'disabled'} class="pill-btn danger-pill">🗑️ حذف المحدد</button></div>
      </div>
      <p class="text-[10px] text-slate-500">الحذف الجماعي يقبل الطلبات غير المنشورة فقط. الطلبات النشطة أو المرتبطة بعروض أو فنيين أو حركات مالية تُتجاوز تلقائيًا.</p>
    </div>
    ${state.errors.orders?`<div class="bg-red-50 border border-red-200 rounded-[16px] p-4 text-[12px] font-bold text-red-700">${escHtml(state.errors.orders)}</div>`:''}
    ${state.loadingOrders?`<div class="premium-panel p-10 text-center"><div class="h-8 w-8 rounded-full border-[3px] border-slate-200 border-t-blue-600 animate-spin mx-auto"></div></div>`:''}
    ${state.filteredOrders.length===0&&!state.loadingOrders?`<div class="premium-panel p-10 text-center text-[12px] font-bold text-slate-400">لا توجد طلبات</div>`:''}
    ${state.filteredOrders.map(o=>{
      const sn=String(o.sn||''); const menuKey='order:'+sn; const pending=state.pendingActions[menuKey]; const isMenuOpen=!!state.dropdowns[menuKey];
      const offers=Array.isArray(o.offers)?o.offers:[];
      return `
        <article class="premium-card p-4 ${isMenuOpen?'menu-active':''}">
          <div class="flex items-start gap-2 mb-3"><input type="checkbox" aria-label="تحديد الطلب ${escHtml(sn)}" onchange="toggleOrderSelection('${escHtml(sn)}',this.checked)" ${(state.selectedOrderSNs||[]).includes(sn.toUpperCase())?'checked':''} class="mt-1"><span class="text-[10px] text-slate-500 font-bold">تحديد للإجراء الجماعي</span></div>
          <div class="flex justify-between items-start gap-3">
            <div class="min-w-0 flex-1"><p class="font-black text-[14px]">${escHtml(o.service||'طلب')}</p><p class="text-[11px] font-bold text-slate-500 mt-1">كود: <span class="font-mono bg-blue-50 px-2 py-0.5 rounded-full text-blue-800">${escHtml(sn)}</span></p></div>
            <div class="flex items-center gap-2">
              <span class="text-[10px] px-3 py-1.5 rounded-full border font-black ${statusClass(o.status)}">${escHtml(statusLabel(o.status))}</span>
              <div class="action-wrap">
                <button onclick="event.stopPropagation();toggleMenu('${menuKey}')" class="pill-btn soft-btn">إجراء ▾</button>
                ${isMenuOpen?`<div class="dropdown-menu">
                  ${o.status==='قيد المراجعة'&&canPublishOrders()?`<button onclick="event.stopPropagation();setPendingAction('${menuKey}','publish','نشر الطلب')" class="dropdown-item">🚀 نشر للفنيين</button>`:''}
                  ${canAssignOrders()?`<button onclick="event.stopPropagation();setPendingAction('${menuKey}','assign','تعيين فني')" class="dropdown-item">👷 تعيين فني</button>`:''}
                  ${o.status==='قيد المراجعة'&&!offers.length&&!o.assignedFanni?`<button onclick="event.stopPropagation();setPendingAction('${menuKey}','edit','تصحيح البيانات')" class="dropdown-item">✏️ تصحيح</button>`:''}
                  <button onclick="event.stopPropagation();setPendingAction('${menuKey}','cancel','إلغاء الطلب')" class="dropdown-item">❌ إلغاء</button>
                  <button onclick="event.stopPropagation();setPendingAction('${menuKey}','archive','أرشفة')" class="dropdown-item">📦 أرشفة</button>
                  <div class="h-px bg-slate-100 my-1"></div>
                  <button onclick="event.stopPropagation();setPendingAction('${menuKey}','delete','حذف نهائي')" class="dropdown-item text-red-600">🗑️ حذف</button>
                </div>`:''}
              </div>
            </div>
          </div>
          ${pending?.action==='edit'?`<div class="mt-4 rounded-[16px] border border-blue-200 bg-blue-50/60 p-3 space-y-3">
            <p class="text-[12px] font-black text-blue-900">تصحيح بيانات الطلب قبل النشر</p>
            <div><label class="block text-[10px] font-bold mb-1">اسم العميل</label><input id="edit-order-name-${escHtml(sn)}" maxlength="50" value="${escHtml(o.clientName||'')}" class="field w-full"></div>
            <div><label class="block text-[10px] font-bold mb-1">رقم تليفون العميل</label><input id="edit-order-phone-${escHtml(sn)}" type="tel" inputmode="tel" maxlength="20" value="${escHtml(o.clientPhone||'')}" class="field w-full" dir="ltr"></div>
            <div><label class="block text-[10px] font-bold mb-1">الخدمة</label><input id="edit-order-service-${escHtml(sn)}" maxlength="100" value="${escHtml(o.service||'')}" class="field w-full"></div>
            <div><label class="block text-[10px] font-bold mb-1">المنطقة / الحي</label><input id="edit-order-area-${escHtml(sn)}" maxlength="250" value="${escHtml(o.area||o.city||'')}" class="field w-full"></div>
            <div><label class="block text-[10px] font-bold mb-1">العنوان التفصيلي</label><input id="edit-order-address-${escHtml(sn)}" maxlength="250" value="${escHtml(o.address||'')}" class="field w-full"></div>
            <div><label class="block text-[10px] font-bold mb-1">وصف الطلب</label><textarea id="edit-order-description-${escHtml(sn)}" maxlength="1000" rows="3" class="field w-full">${escHtml(o.description||'')}</textarea></div>
            <div><label class="block text-[10px] font-bold mb-1">الميزانية</label><input id="edit-order-budget-${escHtml(sn)}" maxlength="50" value="${escHtml(o.budget||'')}" class="field w-full"></div>
            <div class="flex gap-2"><button onclick="saveOrderCorrection('${escHtml(sn)}')" class="pill-btn primary-pill flex-1">حفظ التصحيح</button><button onclick="clearPending('${menuKey}')" class="pill-btn soft-btn">إلغاء</button></div>
            <p class="text-[10px] text-slate-500">لن يتم نشر الطلب تلقائيًا بعد الحفظ؛ راجع البيانات ثم اضغط «نشر للفنيين».</p>
          </div>`:pending?`<div class="confirm-bar"><span>تأكيد ${escHtml(pending.label)}؟</span><div class="flex gap-2"><button onclick="clearPending('${menuKey}')" class="h-7 px-3 rounded-full bg-white/20 text-[10px]">إلغاء</button><button onclick="confirmPending('${menuKey}')" class="h-7 px-4 rounded-full bg-white text-slate-900 text-[10px] font-black">تأكيد</button></div></div>`:''}
          <div class="grid grid-cols-2 gap-2.5 mt-4"><div class="rounded-[14px] bg-slate-50 border p-3"><p class="text-[10px] font-black text-slate-400">العميل</p><p class="text-[11px] font-black mt-1">${escHtml(o.clientName||'غير مسجل')}</p></div><div class="rounded-[14px] bg-slate-50 border p-3"><p class="text-[10px] font-black text-slate-400">الهاتف</p><p class="text-[11px] font-black mt-1" dir="ltr">${escHtml(o.clientPhone||'')}</p></div><div class="rounded-[14px] bg-slate-50 border p-3"><p class="text-[10px] font-black text-slate-400">المنطقة</p><p class="text-[11px] font-black mt-1">${escHtml(o.area||o.city||'')}</p></div><div class="rounded-[14px] bg-blue-50 border border-blue-100 p-3"><p class="text-[10px] font-black text-blue-600">الميزانية</p><p class="text-[11px] font-black mt-1">${escHtml(o.budget?String(o.budget)+' ج':'لم تحدد')}</p></div></div>
          <div class="mt-3 rounded-[14px] bg-slate-50 border p-3"><p class="text-[10px] font-black text-slate-400">وصف الطلب</p><p class="text-[11px] font-bold mt-2 leading-6 whitespace-pre-wrap">${escHtml(o.description||'لا يوجد وصف')}</p></div>
          ${o.hasVoiceRecording&&canReadVoiceReview()?`<div class="mt-3 rounded-[14px] border ${o.voiceReviewedAt?'border-emerald-200 bg-emerald-50':'border-amber-300 bg-amber-50'} p-2 space-y-1.5">
            <div class="flex items-center justify-between gap-2"><p class="text-[12px] font-black">🎙️ التسجيل الصوتي للطلب</p><span class="text-[10px] font-black">${o.voiceReviewedAt?'تمت المراجعة':'مطلوب الاستماع قبل النشر'}</span></div>
            
            ${state.voiceReviewAudioUrls?.[sn]?`<audio controls preload="metadata" playsinline src="${escHtml(state.voiceReviewAudioUrls[sn])}" class="w-full" style="min-height:38px" onended="window.adminVoicePlaybackEnded('${escHtml(sn)}')"></audio>${!o.voiceReviewedAt&&state.voiceReviewAudioPlayed?.[sn]&&canWriteVoiceReview()?`<button onclick="window.adminMarkVoiceReviewed('${escHtml(sn)}')" class="pill-btn primary-pill w-full">✓ تأكيد الاستماع ومراجعة التسجيل</button>`:''}`:`<button onclick="window.adminLoadVoice('${escHtml(sn)}')" class="pill-btn primary-pill w-full">${state.voiceReviewAudioLoading?.[sn]?'جارٍ تحميل التسجيل…':'▶ تحميل التسجيل والاستماع'}</button>`}
            ${o.voiceReviewedAt?`<p class="text-[10px] text-emerald-800 font-bold">تم تأكيد المراجعة ${escHtml(o.voiceReviewedBy||'')} • ${escHtml(new Date(o.voiceReviewedAt).toLocaleString('ar-EG',{timeZone:'Africa/Cairo'}))}</p>`:''}
          </div>`:''}
          <details class="mt-3 rounded-[16px] border overflow-hidden"><summary class="bg-slate-50 px-4 py-3 text-[11px] font-black">عروض الفنيين (${offers.length})</summary><div class="p-3 space-y-2 bg-white"><div class="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-[11px] space-y-1"><p><b>الميزانية الأصلية:</b> ${escHtml(o.budget||'غير محددة')} جنيه</p><p><b>سعر العرض المقبول/التنفيذ:</b> ${o.acceptedOfferPrice!=null?escHtml(String(o.acceptedOfferPrice))+' جنيه':'لم يُقبل عرض بعد'}</p><p><b>الفني المنفذ:</b> ${escHtml(o.assignedFanniName||'لم يُعيّن بعد')}</p><p><b>نسبة العمولة:</b> ${o.commissionRate!=null?escHtml(String(o.commissionRate))+'%':'غير متاحة'}</p><p><b>قيمة العمولة الفعلية:</b> ${o.commissionAmount!=null?escHtml(String(o.commissionAmount))+' جنيه':'غير محسوبة'} ${o.commissionCharged?'(تم تسجيل الخصم)':'(لم يُسجل الخصم)'}</p></div>
${offers.map((off,i)=>`<div class="rounded-[12px] bg-slate-50 border p-3 text-[11px]"><p class="font-black">العرض ${i+1}: ${escHtml(off.fanniName||'فني')} - ${escHtml(off.price||'')} ج</p><p class="text-[10px] mt-1">${escHtml(off.message||'')}</p><div class="mt-2 flex gap-2"><button onclick="removeOffer('${escHtml(sn)}','${i}')" class="pill-btn soft-btn text-[10px]">إزالة العرض</button></div></div>`).join('')||'<p class="text-[10px] text-slate-400">لا توجد عروض</p>'}</div></details>
        </article>`;
    }).join('')}
  </section>`;
}

function renderOffers(){
  const allOffers = state.orders.flatMap(o=>(o.offers||[]).map((off,idx)=>({orderSn:o.sn,orderService:o.service,order:o,offer:off,idx})));
  const filter=state.offerFilter||'all';
  const visible=allOffers.filter(item=>{
    const accepted=!!item.order.acceptedOfferId&&String(item.order.acceptedOfferId)===String(item.offer._id);
    const expired=!!item.order.expiresAt&&new Date(item.order.expiresAt).getTime()<=Date.now()&&!accepted;
    if(filter==='accepted')return accepted;
    if(filter==='pending')return !accepted&&!expired;
    if(filter==='expired')return expired;
    return true;
  });
  return `
  <section class="mt-4 space-y-4">
    <div class="rounded-[18px] bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white"><p class="text-[12px] font-black">عروض الفنيين على الطلبات</p><p class="text-[10px] text-blue-100 mt-1">تصفية حسب حالة العرض الحقيقية المحسوبة من الطلب.</p></div>
    <div class="premium-panel p-4 space-y-3"><label class="text-[11px] font-black"><input type="checkbox" onchange="toggleAllBulkSelection(\'offers\',visible.filter(item=>!(item.order.acceptedOfferId&&String(item.order.acceptedOfferId)===String(item.offer._id))).map(item=>String(item.orderSn)+'|'+String(item.idx)),this.checked)"> تحديد العروض غير المقبولة الظاهرة</label><button onclick="runBulkAction(\'offers\',\'reject\')" class="pill-btn danger-pill">رفض العروض المحددة</button><div class="flex gap-2"><select id="offer-filter" onchange="state.offerFilter=this.value;render()" class="field flex-1"><option value="all" ${filter==='all'?'selected':''}>كل العروض</option><option value="accepted" ${filter==='accepted'?'selected':''}>العروض المقبولة</option><option value="pending" ${filter==='pending'?'selected':''}>غير المقبولة وغير المنتهية</option><option value="expired" ${filter==='expired'?'selected':''}>منتهية</option></select></div></div>
    ${visible.length===0?`<div class="premium-panel p-10 text-center text-[12px] font-bold text-slate-400">لا توجد عروض مطابقة للتصفية.</div>`:''}
    ${visible.slice(0,200).map(item=>{
      const accepted=!!item.order.acceptedOfferId&&String(item.order.acceptedOfferId)===String(item.offer._id);
      const expired=!!item.order.expiresAt&&new Date(item.order.expiresAt).getTime()<=Date.now()&&!accepted;
      const status=accepted?'مقبول':expired?'منتهي':'قيد الانتظار';
      return `
      <article class="premium-card p-4">
        <label class="text-[10px] font-bold"><input type="checkbox" ${((state.selectedBulkOfferKeys||[]).includes(String(item.orderSn)+'|'+String(item.idx))&&!accepted)?'checked':''} ${accepted?'disabled':''} onchange="toggleBulkSelection('offers','${escHtml(String(item.orderSn)+'|'+String(item.idx))}',this.checked)"> تحديد العرض</label>
        <div class="flex justify-between gap-2"><p class="font-black text-[12px]">طلب ${escHtml(item.orderSn)} - ${escHtml(item.orderService||'')}</p><span class="text-[10px] bg-blue-50 border border-blue-100 px-2 py-1 rounded-full font-black">${status}</span></div>
        <p class="text-[11px] font-bold mt-3">الفني: ${escHtml(item.offer.fanniName||'')} • ${escHtml(item.offer.price||'')} ج</p>
        <p class="text-[10px] text-slate-500 mt-1 leading-5">${escHtml(item.offer.message||'')}</p>
        <div class="mt-3 flex gap-2"><button onclick="rejectOffer('${escHtml(item.orderSn)}','${item.idx}')" class="pill-btn soft-btn flex-1" ${accepted?'disabled':''}>رفض العرض</button><button onclick="removeOffer('${escHtml(item.orderSn)}','${item.idx}')" class="pill-btn danger-pill flex-1" ${accepted?'disabled':''}>إزالة</button></div>
      </article>`;
    }).join('')}
    ${visible.length>200?'<p class="text-center text-[10px] text-slate-500">يُعرض أول 200 عرض مطابق. استخدم التصفية لتضييق النتائج.</p>':''}
  </section>`;
}

function renderPricing(){
  const p=state.pricing||{check:0,commission:10,minOffer:1,maxOffer:1000000};
  const history=Array.isArray(state.pricingHistory)?state.pricingHistory:[];
  return `
  <section class="mt-4 space-y-4">
    <div class="rounded-[18px] bg-gradient-to-r from-emerald-600 to-teal-600 p-4 text-white"><p class="text-[12px] font-black">الأسعار والعمولات ورسوم الفرص</p><p class="text-[10px] text-emerald-100 mt-1">تُطبّق عمولة المنصة وحدود سعر العرض الجديدة على العروض الجديدة فقط.</p></div>
    <div class="premium-panel p-4 space-y-4">
      <label class="block"><span class="text-[11px] font-black">رسوم الفرصة (check) — محفوظة فقط وغير مخصومة تلقائيًا حاليًا</span><input id="price-check" type="number" min="0" max="100000" value="${Number(p.check||0)}" class="field mt-2"></label>
      <label class="block"><span class="text-[11px] font-black">عمولة المنصة %</span><input id="price-commission" type="number" min="0" max="100" step="0.01" value="${Number(p.commission??10)}" class="field mt-2"></label>
      <label class="block"><span class="text-[11px] font-black">الحد الأدنى لسعر العرض</span><input id="price-min" type="number" min="1" max="1000000" value="${Number(p.minOffer||1)}" class="field mt-2"></label>
      <label class="block"><span class="text-[11px] font-black">الحد الأقصى لسعر العرض</span><input id="price-max" type="number" min="1" max="1000000" value="${Number(p.maxOffer||1000000)}" class="field mt-2"></label>
      <p class="text-[10px] text-slate-500">لا يُعاد حساب العمولات المسجلة على الطلبات القديمة.</p>
      <button id="save-pricing-btn" onclick="savePricing()" class="w-full h-11 rounded-full bg-slate-900 text-white font-black text-[11px]">حفظ الأسعار</button>
    </div>
    <div class="premium-panel p-4"><h3 class="text-[11px] font-black mb-3">سجل تغييرات الأسعار</h3>
      ${history.length?history.map(h=>`<div class="border-b last:border-0 py-3 text-[10px]"><p class="font-black">${escHtml(h.by||'الإدارة')} — ${escHtml(h.createdAt?new Date(h.createdAt).toLocaleString('ar-EG-u-ca-gregory',{calendar:'gregory',timeZone:'Africa/Cairo'}):'')}</p><p class="text-slate-500 mt-1">من ${escHtml(JSON.stringify(h.before||{}))} إلى ${escHtml(JSON.stringify(h.after||{}))}</p></div>`).join(''):'<p class="text-[10px] text-slate-500">لا توجد تغييرات مسجلة بعد.</p>'}
    </div>
  </section>`;
}

function renderWallets(){
  return `
  <section class="mt-4 space-y-4">
    <div class="rounded-[18px] bg-gradient-to-r from-slate-900 to-slate-700 p-4 text-white"><p class="text-[12px] font-black">المحافظ والأرصدة والمعاملات المالية</p><p class="text-[10px] text-slate-300 mt-1">كشف حساب • تجميد • مقارنة الأرصدة</p></div>
    <div class="grid grid-cols-2 gap-3">
      <div class="stat-card"><p class="text-[20px] font-black text-emerald-600">${state.fannis.reduce((s,f)=>s+Number(f.balance||0),0)} ج</p><p class="text-[10px] font-bold text-slate-500">إجمالي أرصدة الفنيين</p></div>
      <div class="stat-card"><p class="text-[20px] font-black text-amber-600">${state.topups.filter(t=>t.status==='pending').length}</p><p class="text-[10px] font-bold text-slate-500">معاملات معلقة</p></div>
    </div>
    <div class="premium-panel p-4">
      <h3 class="text-[11px] font-black mb-3">محفظة فني - كشف مفصل</h3>
      <div class="flex gap-2"><select id="wallet-fanni" class="field flex-1" onchange="state.walletSelectedFanniId=this.value"><option value="">اختر الفني</option>${state.fannis.map(f=>`<option value="${escHtml(f._id)}" ${String(f._id)===state.walletSelectedFanniId?'selected':''}>${escHtml(f.name)} - ${escHtml(f.phone)}</option>`).join('')}</select><button onclick="loadWalletTransactions()" class="pill-btn primary-pill">عرض</button></div>
      <div class="mt-4 space-y-2 text-[11px] font-bold">${state.walletLoading?'<p class="text-center text-slate-400 p-3">جاري تحميل المعاملات...</p>':state.walletTransactions.length?state.walletTransactions.map(t=>`<div class="flex justify-between gap-3 p-3 rounded-[10px] border ${Number(t.amount)<0?'bg-red-50':'bg-emerald-50'}"><div class="min-w-0"><p>${escHtml(({topup:'شحن محفظة',commission:'رسوم فرصة',admin_adjustment:'تسوية إدارية',refund:'استرداد'}[t.type]||t.type||'معاملة'))}${t.orderSN?' • '+escHtml(t.orderSN):''}</p><p class="text-[10px] text-slate-400 mt-1">${escHtml(t.description||'')} · ${escHtml(t.createdAt?new Date(t.createdAt).toLocaleString('ar-EG-u-ca-gregory',{calendar:'gregory',timeZone:'Africa/Cairo'}):'')}</p></div><span class="shrink-0">${Number(t.amount)>0?'+':''}${escHtml(String(t.amount??0))} ج</span></div>`).join(''):'<p class="text-center text-slate-400 p-3">اختر فنيًا واضغط عرض لقراءة سجل المعاملات الحقيقي</p>'}</div>
      <div class="mt-4 flex gap-2"><button onclick="freezeWallet()" class="pill-btn soft-btn flex-1">${state.fannis.find(f=>String(f._id)===state.walletSelectedFanniId)?.isFrozen?'إلغاء تجميد المحفظة':'تجميد مؤقت'}</button><button onclick="adjustWallet()" class="pill-btn danger-pill flex-1">تسوية الرصيد بسبب موثق</button></div>
    </div>
  </section>`;
}

async function loadFanniProfileEdits(){try{const data=await tryApi(['/api/admin/fanni-profile-edits'],{method:'GET'});state.pendingProfileEdits=extractList(data,['requests','items']);}catch(e){state.pendingProfileEdits=[];showToast(e.message||'تعذر تحميل طلبات تعديل البيانات','error');}if(state.tab==='profileEdits')render();}
function renderFanniProfileEdits(){const rows=state.pendingProfileEdits||[];return `<section class="mt-4 space-y-3"><div class="premium-panel p-4"><h3 class="text-[13px] font-black">طلبات تعديل بيانات الفنيين</h3><p class="text-[11px] text-slate-500 mt-1">لن تتغير بيانات الفني إلا بعد الموافقة. راجع البيانات القديمة والجديدة قبل اتخاذ القرار.</p></div>${rows.length?rows.map(f=>{const p=f.pendingProfileChange||{};const id=escHtml(String(f._id||''));return `<article class="premium-card p-4 space-y-3"><div class="flex items-start justify-between gap-3"><div><h4 class="font-black text-[13px]">${escHtml(f.name||'فني')}</h4><p class="text-[11px] text-slate-500 mt-1">الحالي: ${escHtml(f.phone||'—')} · ${escHtml(f.status||'')}</p><p class="text-[10px] text-slate-400 mt-1">تاريخ الطلب: ${p.requestedAt?escHtml(new Date(p.requestedAt).toLocaleString('ar-EG',{timeZone:'Africa/Cairo'})):'—'}</p></div><span class="text-[10px] rounded-full border border-amber-200 bg-amber-50 text-amber-800 px-3 py-1">بانتظار المراجعة</span></div><div class="grid sm:grid-cols-2 gap-3"><div class="rounded-xl border p-3"><p class="font-black text-[11px] mb-2">البيانات الحالية</p><p class="text-[11px] leading-6">الهاتف: ${escHtml(f.phone||'—')}<br>التخصصات: ${escHtml((f.specialties||[]).join('، ')||'—')}<br>المناطق: ${escHtml((f.areas||[]).join('، ')||'—')}</p></div><div class="rounded-xl border border-blue-200 bg-blue-50/50 p-3"><p class="font-black text-[11px] mb-2">البيانات المطلوبة</p><p class="text-[11px] leading-6">الهاتف: ${escHtml(p.phone||'—')}<br>التخصصات: ${escHtml((p.specialties||[]).join('، ')||'—')}<br>المناطق: ${escHtml((p.areas||[]).join('، ')||'—')}</p></div></div><div class="grid grid-cols-2 gap-2"><button class="pill-btn primary-pill" onclick="reviewFanniProfileEdit('${id}','approve')">✓ موافقة واعتماد</button><button class="pill-btn danger-pill" onclick="reviewFanniProfileEdit('${id}','reject')">✕ رفض الطلب</button></div></article>`}).join(''):'<div class="premium-panel p-8 text-center text-[12px] text-slate-500">لا توجد طلبات تعديل بيانات معلّقة حاليًا.</div>'}<button class="pill-btn soft-btn w-full" onclick="loadFanniProfileEdits()">تحديث الطلبات</button></section>`;}
async function reviewFanniProfileEdit(id,action){if(!id||!['approve','reject'].includes(action))return;let reason='';if(action==='reject'){reason=prompt('سبب رفض طلب تعديل البيانات (اختياري):','الرجاء مراجعة البيانات وإعادة الإرسال');if(reason===null)return;}if(!confirm(action==='approve'?'اعتماد البيانات الجديدة لهذا الفني؟ لن يتم تغيير البيانات إلا الآن.':'تأكيد رفض الطلب والإبقاء على البيانات الحالية؟'))return;try{const data=await tryApi([`/api/admin/fanni-profile-edits/${encodeURIComponent(id)}/${action}`],{method:'POST',body:JSON.stringify({reason})});showToast(data.message||'تمت مراجعة الطلب');await Promise.all([loadFanniProfileEdits(),loadAll()]);}catch(e){showToast(e.message||'تعذرت مراجعة الطلب','error');}}
function renderTopups(){
  return `
  <section class="mt-4 space-y-4">
    <div class="premium-panel p-3 space-y-2"><div class="flex items-center justify-between"><label class="text-[11px] font-black"><input type="checkbox" onchange="toggleAllBulkSelection('topups',state.filteredTopups.map(t=>t._id),this.checked)"> تحديد طلبات الشحن الظاهرة</label><span class="text-[10px] text-slate-500">المحدد: ${(state.selectedBulkTopupIds||[]).length}</span></div><div class="flex gap-2"><button onclick="runBulkAction('topups','approve')" class="pill-btn primary-pill">قبول الشحن المحدد</button><button onclick="runBulkAction('topups','reject')" class="pill-btn danger-pill">رفض الشحن المحدد</button></div></div>
    <div class="rounded-[18px] bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white flex gap-3"><div class="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">💳</div><div><p class="text-[12px] font-black">طلبات شحن المحافظ</p><p class="text-[11px] text-blue-100">مراجعة طلبات التحويل</p></div></div>
    ${state.errors.topups?`<div class="bg-red-50 border border-red-200 rounded-[16px] p-4 text-[12px] font-bold text-red-700">${escHtml(state.errors.topups)}</div>`:''}
    <div class="space-y-3">
      ${state.filteredTopups.length===0?`<div class="premium-panel p-10 text-center tex
t-[12px] font-bold text-slate-400">لا توجد طلبات شحن</div>`:''}
      ${state.filteredTopups.map(t=>{
        const id=String(t._id||''); const menuKey='topup:'+id; const pending=state.pendingActions[menuKey]; const isOpen=!!state.dropdowns[menuKey];
        return `<article class="premium-card p-4 ${isOpen?'menu-active':''}"><label class="text-[10px] font-bold"><input type="checkbox" ${((state.selectedBulkTopupIds||[]).includes(id))?'checked':''} onchange="toggleBulkSelection('topups','${id}',this.checked)"> تحديد</label><div class="flex justify-between"><div><p class="font-black text-[18px]">${escHtml(String(t.amount||''))} <span class="text-[12px] text-slate-500">ج</span></p><p class="text-[11px] font-bold mt-1" dir="ltr">📱 ${escHtml(t.fromPhone||t.phone||'')}</p><p class="text-[10px] text-blue-700 font-bold">${escHtml(({vodafone_cash:'فودافون كاش',orange_cash:'أورنج كاش',etisalat_cash:'اتصالات كاش',we_cash:'WE Pay'})[t.method]||'فودافون كاش')}</p><p class="text-[10px] text-slate-400 mt-1">${escHtml(t.createdAt?new Date(t.createdAt).toLocaleString('ar-EG-u-ca-gregory',{calendar:'gregory',timeZone:'Africa/Cairo'}):'')}</p></div><div class="flex flex-col items-end gap-2"><span class="text-[10px] px-3 py-1.5 rounded-full border font-black ${statusClass(t.status)}">${escHtml(statusLabel(t.status))}</span><div class="action-wrap"><button onclick="event.stopPropagation();toggleMenu('${menuKey}')" class="pill-btn soft-btn">إجراء ▾</button>${isOpen?`<div class="dropdown-menu"><button onclick="event.stopPropagation();setPendingAction('${menuKey}','approve','قبول الشحن')" class="dropdown-item">✓ قبول وإضافة رصيد</button><button onclick="event.stopPropagation();setPendingAction('${menuKey}','reject','رفض الشحن')" class="dropdown-item text-red-600">✕ رفض</button></div>`:''}</div></div></div>${pending?`<div class="confirm-bar"><span>تأكيد ${pending.label}؟</span><div class="flex gap-2"><button onclick="clearPending('${menuKey}')" class="h-7 px-3 rounded-full bg-white/20 text-[10px]">إلغاء</button><button onclick="confirmPending('${menuKey}')" class="h-7 px-4 rounded-full bg-white text-slate-900 text-[10px] font-black">تأكيد</button></div></div>`:''}</article>`;
      }).join('')}
    </div>
  </section>`;
}

function renderComplaints(){
  let html='<section class="mt-4 space-y-4"><div class="rounded-[18px] bg-gradient-to-r from-slate-900 to-slate-800 p-4 text-white flex gap-3"><div class="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center">⚠️</div><div><p class="text-[12px] font-black">شكاوى العملاء والفنيين والنزاعات</p><p class="text-[10px] text-slate-300">رد رسمي • ملاحظة داخلية • ربط باسترداد</p></div></div>';
  html+='<div class="premium-panel p-3 space-y-2"><label class="text-[11px] font-black"><input type="checkbox" onchange="toggleAllBulkSelection(\'complaints\',state.filteredComplaints.map(c=>c._id||c.id),this.checked)"> تحديد كل الشكاوى الظاهرة</label><div class="flex flex-wrap gap-2"><button onclick="runBulkAction(\'complaints\',\'resolve\')" class="pill-btn primary-pill">حل المحدد</button><button onclick="runBulkAction(\'complaints\',\'reject\')" class="pill-btn danger-pill">رفض المحدد</button><button onclick="runBulkAction(\'complaints\',\'review\')" class="pill-btn soft-btn">قيد المراجعة</button></div></div>';
  if(state.errors.complaints) html+=`<div class="bg-red-50 border border-red-200 rounded-[16px] p-4 text-[12px] font-bold text-red-700">${escHtml(state.errors.complaints)}</div>`;
  if(state.loadingComplaints) html+=`<div class="premium-panel p-10 text-center"><div class="h-8 w-8 rounded-full border-[3px] border-slate-200 border-t-blue-600 animate-spin mx-auto"></div></div>`;
  if(state.filteredComplaints.length===0&&!state.loadingComplaints) html+=`<div class="premium-panel p-10 text-center text-[12px] font-bold text-slate-400">لا توجد شكاوى</div>`;
  state.filteredComplaints.forEach(c=>{
    const id=String(c._id||c.id||''); const sn=String(c.sn||''); const status=String(c.status||'جديدة');
    html+=`<article class="premium-card p-4"><label class="text-[10px] font-bold"><input type="checkbox" ${(state.selectedBulkComplaintIds||[]).includes(id)?'checked':''} onchange="toggleBulkSelection('complaints','${escHtml(id)}',this.checked)"> تحديد الشكوى</label><div class="flex justify-between gap-2"><div class="min-w-0"><p class="font-black text-[13px]">${escHtml(c.clientName||'عميل')}</p><p class="text-[11px] font-bold text-slate-500 mt-1">كود: <span class="bg-blue-50 px-2 py-0.5 rounded-full text-blue-800">${escHtml(sn)}</span> • ${escHtml(new Date(c.createdAt||Date.now()).toLocaleString('ar-EG-u-ca-gregory',{calendar:'gregory',timeZone:'Africa/Cairo'}))}</p></div><span class="text-[10px] px-3 py-1.5 rounded-full border font-black ${status==='تم الحل'?'bg-emerald-50 border-emerald-200 text-emerald-700':status==='مرفوضة'?'bg-red-50 border-red-200 text-red-700':'bg-amber-50 border-amber-200 text-amber-800'}">${escHtml(status)}</span></div><div class="mt-3 rounded-[14px] bg-slate-50 border p-3"><p class="text-[11px] font-bold leading-6 whitespace-pre-wrap">${escHtml(c.text||'')}</p></div><div class="mt-3 space-y-2"><select id="complaint-status-${escHtml(id)}" class="field"><option value="جديدة" ${status==='جديدة'?'selected':''}>جديدة</option><option value="قيد المراجعة" ${status==='قيد المراجعة'?'selected':''}>قيد المراجعة</option><option value="تم الحل" ${status==='تم الحل'?'selected':''}>تم الحل</option><option value="مرفوضة" ${status==='مرفوضة'?'selected':''}>مرفوضة</option></select><textarea id="complaint-note-${escHtml(id)}" rows="2" placeholder="ملاحظة داخلية" class="field">${escHtml(c.adminNote||'')}</textarea><textarea id="complaint-response-${escHtml(id)}" rows="2" placeholder="رد رسمي للعميل" class="field">${escHtml(c.adminResponse||'')}</textarea><button onclick="saveComplaint(\'${escHtml(id)}\')" class="w-full h-11 rounded-full bg-blue-600 text-white font-black text-[11px]">💾 حفظ التحديث</button></div></article>`;
  });
  return html+'</section>';
}
