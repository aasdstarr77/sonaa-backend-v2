/* Extracted page functions; classic-script globals are preserved. */
'use strict';

function renderFannis(){
  return `
  <div class="mt-4 space-y-4">
    <div class="premium-panel p-3 space-y-2"><div class="flex items-center justify-between gap-2"><label class="text-[11px] font-black"><input type="checkbox" onchange="toggleAllBulkSelection('fannis',state.filtered.map(f=>f._id),this.checked)"> تحديد كل الفنيين الظاهرين</label><span class="text-[10px] text-slate-500">المحدد: ${(state.selectedBulkFanniIds||[]).length}</span></div><div class="flex flex-wrap gap-2"><button onclick="runBulkAction('fannis','approve')" class="pill-btn primary-pill">قبول المحدد</button><button onclick="runBulkAction('fannis','reject')" class="pill-btn soft-btn">رفض المحدد</button><button onclick="runBulkAction('fannis','disable')" class="pill-btn danger-pill">تعليق المحدد</button><button onclick="runBulkAction('fannis','enable')" class="pill-btn soft-btn">إعادة تفعيل المحدد</button><button onclick="runBulkAction('fannis','freeze')" class="pill-btn danger-pill">تجميد محافظ المحدد</button><button onclick="runBulkAction('fannis','unfreeze')" class="pill-btn soft-btn">إلغاء تجميد المحافظ</button></div></div>
    ${state.errors.fannis?`<div class="bg-red-50 border border-red-200 rounded-[16px] p-4 text-[12px] font-bold text-red-700">${escHtml(state.errors.fannis)}</div>`:''}
    ${state.filtered.length===0&&!state.loading&&!state.errors.fannis?`<div class="premium-panel p-10 text-center text-[13px] font-bold text-slate-400">لا يوجد فنيون</div>`:''}
    ${state.filtered.map(f=>{
      const id=String(f._id||'');
      const menuKey='fanni:'+id;
      const pending = state.pendingActions[menuKey];
      const isMenuOpen = !!state.dropdowns[menuKey];
      const level = f.level||f.experience||'مبتدئ';
      const badge = f.isTrusted?'موثوق':''; 
      return `
        
<article class="premium-card p-4 animate-fade ${isMenuOpen?'menu-active':''}">
          <label class="text-[10px] font-bold"><input type="checkbox" ${((state.selectedBulkFanniIds||[]).includes(id))?'checked':''} onchange="toggleBulkSelection('fannis','${id}',this.checked)"> تحديد</label>
          <div class="flex justify-between items-start gap-3">
            <div class="flex items-center gap-3 min-w-0 flex-1">
              <div class="h-10 w-10 rounded-full bg-gradient-to-br from-slate-800 to-slate-600 text-white flex items-center justify-center font-black">${escHtml((f.name||'؟').slice(0,1))}</div>
              <div class="min-w-0 flex-1">
                <p class="font-black text-[13.5px] truncate">${escHtml(f.name||'بدون اسم')} ${badge?`<span class="text-[9px] bg-blue-600 text-white px-2 py-0.5 rounded-full mr-1">✓ ${badge}</span>`:''}</p>
                <div class="flex items-center gap-2 mt-1 flex-wrap">
                  <span dir="ltr" class="text-[11px] bg-slate-900 text-white px-2.5 py-1 rounded-full font-bold">📞 ${escHtml(f.phone||'')}</span>
                  <span class="text-[10px] px-2.5 py-1 rounded-full border font-black ${statusClass(f.isDisabled?'disabled':f.isApproved?'approved':f.status||'pending')}">${f.isDisabled?'معطل':f.isApproved?'معتمد':statusLabel(f.status)}</span>
                  <span class="text-[10px] bg-amber-50 border border-amber-200 text-amber-800 px-2 py-1 rounded-full font-black">${escHtml(level)}</span>
                </div>
                <div class="mt-2 flex flex-wrap gap-1.5 text-[10px] font-extrabold"><span class="rounded-full border border-amber-200 bg-amber-50 text-amber-800 px-2 py-1">★ ${Number(f.ratingAverage||0).toFixed(1)} (${Number(f.ratingCount||0)} تقييم)</span><span class="rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 px-2 py-1">✓ ${Number(f.completedJobs||0)} عمل مكتمل</span></div>
              </div>
            </div>
            <div class="action-wrap">
              <button onclick="event.stopPropagation();toggleMenu('${menuKey}')" class="pill-btn soft-btn flex items-center gap-1.5">
                <span>${f.isApproved?'معتمد':f.isDisabled?'معطل':'إجراء'}</span>
                <span class="text-[12px]">${isMenuOpen?'▲':'▼'}</span>
              </button>
              ${isMenuOpen?`
                <div class="dropdown-menu">
                  ${!f.isApproved&&!f.isDisabled?`<button onclick="event.stopPropagation();setPendingAction('${menuKey}','approve','قبول الفني')" class="dropdown-item">✓ قبول الفني</button><button onclick="event.stopPropagation();setPendingAction('${menuKey}','reject','رفض الفني')" class="dropdown-item">✕ رفض الفني</button>`:''}
                  ${!f.isDisabled?`<button onclick="event.stopPropagation();setPendingAction('${menuKey}','disable','تعطيل الفني')" class="dropdown-item">⛔ تعطيل</button>`: `<button onclick="event.stopPropagation();setPendingAction('${menuKey}','enable','استعادة الفني')" class="dropdown-item">♻️ استعادة</button>`}
                  <div class="h-px bg-slate-100 my-1"></div>
                  <div class="p-2 space-y-2 border-y border-slate-100 my-1">
                    <label class="block text-[10px] font-black text-slate-500">المستوى المهني</label>
                    <select id="level-${id}" onclick="event.stopPropagation()" class="field w-full text-[11px]">
                      ${['مبتدئ','ممارس','محترف','خبير مبتدئ','خبير','خبير أول','استشاري فني','نخبة','أسطوري'].map(l=>`<option value="${escHtml(l)}" ${level===l?'selected':''}>${escHtml(l)}</option>`).join('')}
                    </select>
                    <button onclick="event.stopPropagation();updateFanniLevel('${id}',document.getElementById('level-${id}').value)" class="dropdown-item">حفظ المستوى المهني</button>
                  </div>
                  <button onclick="event.stopPropagation();setPendingAction('${menuKey}','badge_trust','منح شارة موثوق')" class="dropdown-item">🛡️ منح موثوق</button>
                  <div class="h-px bg-slate-100 my-1"></div>
                  <button onclick="event.stopPropagation();changeAccountPassword('fanni','${id}')" class="dropdown-item">🔐 تغيير كلمة السر</button>
                  <button onclick="event.stopPropagation();setPendingAction('${menuKey}','delete','حذف نهائي')" class="dropdown-item text-red-600">🗑️ حذف نهائي</button>
                </div>
              `:''}
            </div>
          </div>
          ${pending?`
            <div class="confirm-bar">
              <span>تأكيد ${escHtml(pending.label)}؟</span>
              <div class="flex gap-2">
                <button onclick="clearPending('${menuKey}')" class="h-7 px-3 rounded-full bg-white/20 text-[10px] font-black">إلغاء</button>
                <button onclick="confirmPending('${menuKey}')" class="h-7 px-4 rounded-full bg-white text-slate-900 text-[10px] font-black">تأكيد ✓</button>
              </div>
            </div>
          `:''}
          <div class="mt-4 grid grid-cols-2 gap-2">
            <div class="rounded-[14px] bg-slate-50 border p-3"><p class="text-[10px] font-black text-slate-400">كل التخصصات</p><p class="text-[11.5px] font-black mt-1 leading-6 whitespace-pre-wrap break-words">${escHtml((Array.isArray(f.specialties)&&f.specialties.length?f.specialties:(f.skill||f.service?[f.skill||f.service]:[])).join('، ')||'غير محدد')}</p></div>
            <div class="rounded-[14px] bg-emerald-50 border border-emerald-100 p-3"><p class="text-[10px] font-black text-emerald-700">الرصيد</p><p class="text-[13px] font-black text-emerald-700 mt-1">${escHtml(String(f.balance??f.walletBalance??0))} ج</p></div>
          </div>
          <div class="mt-2 rounded-[14px] border border-blue-100 bg-blue-50/60 p-3">
            <p class="text-[11px] font-black text-blue-900 mb-2">📍 مناطق العمل المسجلة</p>
            <p class="text-[11px] font-bold leading-6 whitespace-pre-wrap break-words">${escHtml(Array.isArray(f.areas)&&f.areas.length?f.areas.join('، '):'لم يحدد مناطق عمل')}</p>
          </div>
          ${Array.isArray(f.works)&&f.works.length?'<div class="mt-2 rounded-[14px] border bg-white p-3"><p class="text-[11px] font-black mb-2">الأعمال والخدمات المسجلة</p><p class="text-[11px] font-bold leading-6 whitespace-pre-wrap break-words">'+escHtml(f.works.join('، '))+'</p></div>':''}
          ${f.prices&&Object.keys(f.prices).length?'<div class="mt-2 rounded-[14px] border bg-white p-3"><p class="text-[11px] font-black mb-2">الأسعار/تفاصيل الأعمال المسجلة</p><div class="space-y-2">'+Object.entries(f.prices instanceof Map?Object.fromEntries(f.prices):f.prices).map(([key,value])=>'<div class="border-b last:border-0 pb-2 last:pb-0"><p class="text-[10px] font-black">'+escHtml(key)+'</p><p class="text-[10px] leading-5">'+escHtml([value?.from,value?.desc].filter(Boolean).join(' — ')||String(value??''))+'</p></div>').join('')+'</div></div>':''}
          <div class="mt-2 text-[10px] text-slate-500 font-bold">تاريخ التسجيل: ${escHtml(f.createdAt?new Date(f.createdAt).toLocaleString('ar-EG',{timeZone:'Africa/Cairo'}):'غير متاح')}</div>
          <details class="mt-4 rounded-[16px] border overflow-hidden">
            <summary class="cursor-pointer bg-slate-50 hover:bg-blue-50 px-4 py-3 text-[11px] font-black">💰 تسوية الرصيد • سجل النشاط • ملاحظات</summary>
            <div class="p-4 bg-white space-y-3">
              <div class="flex gap-2"><input id="bal-${escHtml(id)}" type="number" placeholder="المبلغ" class="field flex-1"><button onclick="setBalance('${escHtml(id)}')" class="h-[46px] px-4 rounded-full bg-slate-900 text-white text-[11px] font-black">تعيين</button><button onclick="addBalance('${escHtml(id)}')" class="h-[46px] px-4 rounded-full bg-emerald-600 text-white text-[11px] font-black">إضافة</button></div>
              <div class="rounded-[12px] bg-slate-50 border p-3"><p class="text-[10px] font-black text-slate-500">ملاحظات داخلية</p><textarea id="note-${escHtml(id)}" rows="2" placeholder="ملاحظة لا يراها الفني" class="field mt-2">${escHtml(f.adminNote||'')}</textarea><button onclick="saveFanniNote('${escHtml(id)}')" class="mt-2 pill-btn soft-btn w-full">حفظ الملاحظة</button></div>
              <div class="rounded-xl border p-3 space-y-2"><p class="text-[10px] font-black text-slate-700">حدود استقبال العروض (تُطبق فعليًا)</p><label class="block text-[10px] font-bold">أقصى عدد عروض نشطة</label><input id="limit-${escHtml(id)}" type="number" min="0" max="1000" value="${Number(f.limits?.maxOffers??50)}" class="field"><label class="block text-[10px] font-bold">أقصى عدد عروض خلال آخر 24 ساعة</label><input id="daily-limit-${escHtml(id)}" type="number" min="0" max="100" value="${Number(f.limits?.dailyLimit??10)}" class="field"><label class="flex items-center gap-2 text-[10px] font-bold"><input id="limit-block-${escHtml(id)}" type="checkbox" ${f.limits?.isLimited?'checked':''}> إيقاف استقبال العروض بالكامل</label><button onclick="saveFanniLimit('${escHtml(id)}')" class="pill-btn soft-btn w-full">حفظ حدود الاستقبال</button></div>
              <div class="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 space-y-2"><p class="text-[10px] font-black text-indigo-900">الثقة والتحقق والظهور</p><label class="block text-[10px] font-bold">درجة الثقة الداخلية (0–100)</label><input id="trust-score-${escHtml(id)}" type="number" min="0" max="100" value="${Number(f.trustScore??50)}" class="field"><label class="flex items-center gap-2 text-[10px] font-bold"><input id="verified-${escHtml(id)}" type="checkbox" ${(f.isVerified||Array.isArray(f.badges)&&f.badges.includes('verified'))?'checked':''}> بيانات الفني تم التحقق منها</label><label class="flex items-center gap-2 text-[10px] font-bold"><input id="featured-${escHtml(id)}" type="checkbox" ${f.isFeatured?'checked':''}> إظهار شارة «فني مميز» في العروض الجديدة</label><label class="block text-[10px] font-bold">انتهاء التمييز (اختياري)</label><input id="featured-until-${escHtml(id)}" type="date" value="${f.featuredUntil?String(f.featuredUntil).slice(0,10):''}" class="field"><button onclick="saveFanniProfileControls('${escHtml(id)}')" class="pill-btn primary-pill w-full">حفظ بيانات الثقة والظهور</button></div>
            </div>
          </details>
        </article>
      `;
    }).join('')}
  </div>`;
}

function renderLevels(){
  return `
  <section class="mt-4 space-y-4">
    <div class="rounded-[18px] bg-gradient-to-r from-amber-500 to-orange-600 p-4 text-white"><p class="text-[12px] font-black">مستويات الخبرة والثقة</p><p class="text-[10px] font-bold text-amber-100 mt-1">مبتدئ • محترف • خبير • موثوق</p></div>
    <div class="premium-panel p-4">
      <h3 class="text-[12px] font-black mb-3">تعريف المستويات</h3>
      <div class="space-y-2">
        <div class="flex justify-between items-center p-2.5 rounded-[12px] bg-slate-50 border"><span class="text-[11px] font-black">🌱 فني مبتدئ</span><span class="text-[10px] text-slate-500">0-4 أعمال</span></div>
        <div class="flex justify-between items-center p-2.5 rounded-[12px] bg-slate-50 border"><span class="text-[11px] font-black">🧰 فني ممارس</span><span class="text-[10px] text-slate-500">5-9 أعمال</span></div>
        <div class="flex justify-between items-center p-2.5 rounded-[12px] bg-blue-50 border border-blue-100"><span class="text-[11px] font-black">🔧 فني محترف</span><span class="text-[10px] text-blue-700">10-19 عملًا</span></div>
        <div class="flex justify-between items-center p-2.5 rounded-[12px] bg-indigo-50 border border-indigo-100"><span class="text-[11px] font-black">⭐ خبير مبتدئ</span><span class="text-[10px] text-indigo-700">20-29 عملًا</span></div>
        <div class="flex justify-between items-center p-2.5 rounded-[12px] bg-amber-50 border border-amber-100"><span class="text-[11px] font-black">🏅 خبير</span><span class="text-[10px] text-amber-700">30-44 عملًا</span></div>
        <div class="flex justify-between items-center p-2.5 rounded-[12px] bg-amber-50 border border-amber-200"><span class="text-[11px] font-black">🥇 خبير أول</span><span class="text-[10px] text-amber-700">45-59 عملًا</span></div>
        <div class="flex justify-between items-center p-2.5 rounded-[12px] bg-purple-50 border border-purple-100"><span class="text-[11px] font-black">🎓 استشاري فني</span><span class="text-[10px] text-purple-700">60-74 عملًا</span></div>
        <div class="flex justify-between items-center p-2.5 rounded-[12px] bg-emerald-50 border border-emerald-100"><span class="text-[11px] font-black">💎 نخبة</span><span class="text-[10px] text-emerald-700">75-99 عملًا</span></div>
        <div class="flex justify-between items-center p-2.5 rounded-[12px] bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200"><span class="text-[11px] font-black">👑 أسطوري</span><span class="text-[10px] text-amber-700">100+ عمل</span></div>
        <p class="text-[10px] text-slate-500">عدد الأعمال إرشادي؛ التقييم والثقة واعتماد الإدارة عوامل مؤثرة في الترقية.</p>
      </div>
    </div>
    ${renderFannis()}
  </section>`;
}

function getDefaultAdminPermissions(role){
  const keys=ADMIN_PERMISSION_SECTIONS.map(([key])=>key);
  const writes={
    'قراءة فقط':[],
    'مشرف':['orders','complaints','support','offers'],
    'مشرف أول':['fannis','orders','complaints','services','clients','topups','wallet','support','regions','offers','notifications','clientsData'],
    'مدير':keys
  };
  const readOnly=role==='قراءة فقط';
  const readAll=role==='مدير'||role==='مشرف أول'||readOnly;
  const writeSet=new Set(writes[role]||[]);
  const readSet=new Set(readAll?keys:['dashboard','fannis','orders','voiceReview','passwordRecovery','complaints','services','clients','topups','wallet','pricing','content','support','regions','offers','notifications','clientsData']);
  return Object.fromEntries(keys.map(key=>[key,{read:readSet.has(key)||writeSet.has(key),write:writeSet.has(key)}]));
}

function getEffectiveAdminPermissions(user){
  const result=getDefaultAdminPermissions(user.adminRole|| (user.role==='admin'?'مشرف':''));
  const stored=user.adminPermissions||{};
  if(stored.__customOverrides===true){
    for(const [key] of ADMIN_PERMISSION_SECTIONS){
      if(stored[key]&&typeof stored[key]==='object') result[key]={...result[key],...stored[key]};
    }
  }
  return result;
}

function renderRoles(){
  const eligible=state.fannis.filter(f=>f.role==='fanni'&&f.status==='approved'&&!f.adminRole);
  return `
  <section class="mt-4 space-y-4">
    <div class="rounded-[18px] bg-gradient-to-r from-indigo-600 to-purple-600 p-4 text-white"><p class="text-[12px] font-black">المناصب الإدارية وصلاحيات المشرفين</p><p class="text-[10px] text-indigo-100 mt-1">لكل منصب صلاحيات افتراضية مناسبة، وتقدر تضيف أو تلغي صلاحية لأي حساب بشكل فردي</p></div>
    <div class="premium-panel p-4 space-y-3">
      <h3 class="text-[12px] font-black">ترقية فني إلى منصب إداري</h3>
      ${eligible.length?`<select id="new-admin-fanni" class="field"><option value="">اختر فنيًا معتمدًا</option>${eligible.map(f=>`<option value="${escHtml(f._id||f.id)}">${escHtml(f.name)} — ${escHtml(f.phone)}</option>`).join('')}</select>`:`<p class="text-[11px] text-slate-500">لا يوجد فني معتمد متاح للترقية. حدّث قائمة الفنيين أو تأكد من اعتماد الحساب.</p>`}
      <div class="flex gap-2"><select id="new-admin-role" class="field flex-1"><option value="مشرف">مشرف</option><option value="مشرف أول">مشرف أول</option><option value="مدير">مدير</option><option value="قراءة فقط">قراءة فقط</option></select><button onclick="createAdminUser()" ${eligible.length?'':'disabled'} class="pill-btn primary-pill">ترقية الفني</button></div>
      <p class="text-[10px] text-slate-500">تُطبّق صلاحيات المنصب تلقائيًا. أي تعديل فردي أدناه يغيّر الصلاحية المحددة فقط دون إلغاء باقي صلاحيات المنصب.</p>
    </div>
    <div class="premium-panel p-4">
      <div class="flex items-center justify-between mb-3"><h3 class="text-[12px] font-black">المناصب الإدارية الحالية والصلاحيات المخصصة</h3></div>
      ${state.adminUsersLoading?`<p class="text-[11px] text-slate-500 py-4 text-center">جاري تحميل المناصب...</p>`:state.adminUsers.length?state.adminUsers.map(u=>`<div class="p-3 rounded-[12px] bg-slate-50 border mb-4"><div class="flex justify-between items-start gap-2"><div class="min-w-0"><p class="text-[11px] font-black">${escHtml(u.name||'بدون اسم')}</p><p class="text-[10px] text-slate-500" dir="ltr">${escHtml(u.phone||'')}</p></div><span class="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full">${escHtml(u.adminRole||'مدير عام')}</span></div>${u.isRootAdmin?`<p class="text-[10px] text-slate-500 mt-2">حساب المدير العام الأساسي — صلاحياته كاملة ولا يمكن تعديلها من هذه الشاشة.</p>`:`<div class="flex gap-2 mt-3"><select id="admin-role-${escHtml(u.id)}" class="field flex-1"><option value="مشرف" ${u.adminRole==='مشرف'?'selected':''}>مشرف</option><option value="مشرف أول" ${u.adminRole==='مشرف أول'?'selected':''}>مشرف أول</option><option value="مدير" ${u.adminRole==='مدير'?'selected':''}>مدير</option><option value="قراءة فقط" ${u.adminRole==='قراءة فقط'?'selected':''}>قراءة فقط</option></select><button onclick="changeAdminRole('${escHtml(u.id)}')" class="pill-btn soft-btn">تغيير المنصب</button><button onclick="revokeAdminRole('${escHtml(u.id)}')" class="pill-btn danger-pill">سحب</button></div>
      <div class="mt-3 rounded-xl border bg-white p-3"><p class="text-[11px] font-black mb-2">اختر صلاحيات هذا الحساب</p><p class="text-[10px] text-slate-500 mb-3">القراءة تسمح بالعرض فقط. التنفيذ يسمح بإجراء التعديلات داخل القسم. عند اختيار التنفيذ يتم تفعيل القراءة أيضًا.</p>
      <div class="space-y-2">${ADMIN_PERMISSION_SECTIONS.map(([key,label])=>{const p=getEffectiveAdminPermissions(u)[key]||{};return `<div class="flex items-center justify-between gap-2 border-b last:border-0 py-2"><span class="text-[10px] font-bold">${label}</span><div class="flex gap-3 shrink-0"><label class="flex items-center gap-1 text-[10px]"><input type="checkbox" data-admin-permission="${key}" data-mode="read" data-user="${escHtml(u.id)}" ${p.read?'checked':''}> قراءة</label><label class="flex items-center gap-1 text-[10px]"><input type="checkbox" data-admin-permission="${key}" data-mode="write" data-user="${escHtml(u.id)}" ${p.write?'checked':''}> تنفيذ</label></div></div>`;}).join('')}</div>
      <button onclick="saveAdminPermissions('${escHtml(u.id)}')" class="pill-btn primary-pill w-full mt-3">حفظ صلاحيات ${escHtml(u.name||'المشرف')}</button>
      </div>`}</div>`).join(''):`<p class="text-[11px] text-slate-500 py-4 text-center">لا توجد مناصب إدارية إضافية حتى الآن.</p>`}
    </div>
    <div class="premium-panel p-3 text-[10px] text-slate-600">الأدمن الرئيسي وحده يحدد الصلاحيات. أي قسم لم تمنحه قراءة أو تنفيذ يظل محجوبًا عن الحساب الإداري الفرعي حتى لو عرف رابط الـ API.</div>
  </section>`;
}

async function loadFanniProfileEdits(){try{const data=await tryApi(['/api/admin/fanni-profile-edits'],{method:'GET'});state.pendingProfileEdits=extractList(data,['requests','items']);}catch(e){state.pendingProfileEdits=[];showToast(e.message||'تعذر تحميل طلبات تعديل البيانات','error');}if(state.tab==='profileEdits')render();}

function renderFanniProfileEdits(){const rows=state.pendingProfileEdits||[];return `<section class="mt-4 space-y-3"><div class="premium-panel p-4"><h3 class="text-[13px] font-black">طلبات تعديل بيانات الفنيين</h3><p class="text-[11px] text-slate-500 mt-1">لن تتغير بيانات الفني إلا بعد الموافقة. راجع البيانات القديمة والجديدة قبل اتخاذ القرار.</p></div>${rows.length?rows.map(f=>{const p=f.pendingProfileChange||{};const id=escHtml(String(f._id||''));return `<article class="premium-card p-4 space-y-3"><div class="flex items-start justify-between gap-3"><div><h4 class="font-black text-[13px]">${escHtml(f.name||'فني')}</h4><p class="text-[11px] text-slate-500 mt-1">الحالي: ${escHtml(f.phone||'—')} · ${escHtml(f.status||'')}</p><p class="text-[10px] text-slate-400 mt-1">تاريخ الطلب: ${p.requestedAt?escHtml(new Date(p.requestedAt).toLocaleString('ar-EG',{timeZone:'Africa/Cairo'})):'—'}</p></div><span class="text-[10px] rounded-full border border-amber-200 bg-amber-50 text-amber-800 px-3 py-1">بانتظار المراجعة</span></div><div class="grid sm:grid-cols-2 gap-3"><div class="rounded-xl border p-3"><p class="font-black text-[11px] mb-2">البيانات الحالية</p><p class="text-[11px] leading-6">الهاتف: ${escHtml(f.phone||'—')}<br>التخصصات: ${escHtml((f.specialties||[]).join('، ')||'—')}<br>المناطق: ${escHtml((f.areas||[]).join('، ')||'—')}</p></div><div class="rounded-xl border border-blue-200 bg-blue-50/50 p-3"><p class="font-black text-[11px] mb-2">البيانات المطلوبة</p><p class="text-[11px] leading-6">الهاتف: ${escHtml(p.phone||'—')}<br>التخصصات: ${escHtml((p.specialties||[]).join('، ')||'—')}<br>المناطق: ${escHtml((p.areas||[]).join('، ')||'—')}</p></div></div><div class="grid grid-cols-2 gap-2"><button class="pill-btn primary-pill" onclick="reviewFanniProfileEdit('${id}','approve')">✓ موافقة واعتماد</button><button class="pill-btn danger-pill" onclick="reviewFanniProfileEdit('${id}','reject')">✕ رفض الطلب</button></div></article>`}).join(''):'<div class="premium-panel p-8 text-center text-[12px] text-slate-500">لا توجد طلبات تعديل بيانات معلّقة حاليًا.</div>'}<button class="pill-btn soft-btn w-full" onclick="loadFanniProfileEdits()">تحديث الطلبات</button></section>`;}

async function reviewFanniProfileEdit(id,action){if(!id||!['approve','reject'].includes(action))return;let reason='';if(action==='reject'){reason=prompt('سبب رفض طلب تعديل البيانات (اختياري):','الرجاء مراجعة البيانات وإعادة الإرسال');if(reason===null)return;}if(!confirm(action==='approve'?'اعتماد البيانات الجديدة لهذا الفني؟ لن يتم تغيير البيانات إلا الآن.':'تأكيد رفض الطلب والإبقاء على البيانات الحالية؟'))return;try{const data=await tryApi([`/api/admin/fanni-profile-edits/${encodeURIComponent(id)}/${action}`],{method:'POST',body:JSON.stringify({reason})});showToast(data.message||'تمت مراجعة الطلب');await Promise.all([loadFanniProfileEdits(),loadAll()]);}catch(e){showToast(e.message||'تعذرت مراجعة الطلب','error');}}
