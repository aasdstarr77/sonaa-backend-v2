'use strict';

function renderServices(){
  let html='<section class="mt-4 space-y-4"><div class="rounded-[18px] bg-gradient-to-r from-indigo-600 to-blue-600 p-4 text-white"><p class="text-[12px] font-black">إدارة الخدمات والمهن والتخصصات</p><p class="text-[10px] text-blue-100 mt-1">إضافة • تعديل • حذف • ترتيب الأقسام والخدمات • مصدر موحد</p></div>';
  html+='<div class="premium-panel p-4"><div class="flex gap-2"><input id="new-service-name" placeholder="اسم خدمة جديدة" class="field flex-1"><input id="new-service-category" placeholder="القسم (اختياري)" class="field flex-1"><input id="new-service-emoji" placeholder="🔧" class="field !w-[60px]"><button onclick="addService()" class="pill-btn primary-pill">إضافة</button></div></div>';
  if(state.servicesLoading) html+='<div class="premium-panel p-10 text-center"><div class="h-8 w-8 rounded-full border-[3px] border-slate-200 border-t-blue-600 animate-spin mx-auto"></div></div>';
  if(state.filteredServices.length===0&&!state.servicesLoading) html+='<div class="premium-panel p-10 text-center text-[12px] font-bold text-slate-400">لا توجد خدمات</div>';
  state.filteredServices.forEach((cat, idx)=>{
    const label=String(cat.label||cat.name||'قسم'); const emoji=String(cat.emoji||'🔧'); const displayServices=Array.isArray(cat._displayServices)?cat._displayServices:cat.services||[]; const isOpen=state.openServices[idx]!==false;
    const categoryIndex=state.services.findIndex(item=>String(item.label||item.name)===label); const categoryMoveButtons=`<div class="flex gap-1 px-3 py-2 bg-slate-50 border-t"><button onclick="moveCategoryByIndex(${categoryIndex},-1)" ${categoryIndex<=0?'disabled':''} class="h-7 px-3 rounded-full bg-blue-50 border text-[10px] font-black disabled:opacity-30">ترتيب القسم ↑</button><button onclick="moveCategoryByIndex(${categoryIndex},1)" ${categoryIndex<0||categoryIndex>=state.services.length-1?'disabled':''} class="h-7 px-3 rounded-full bg-blue-50 border text-[10px] font-black disabled:opacity-30">ترتيب القسم ↓</button></div>`;
    html+=`<article class="premium-card overflow-hidden"><button onclick="toggleServiceCat(${idx})" class="w-full flex items-center justify-between p-4 bg-white text-right"><div class="flex items-center gap-3"><span class="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center">${escHtml(emoji)}</span><div class="text-right"><p class="font-black text-[13px]">${escHtml(label)}</p><p class="text-[10px] text-slate-500">${displayServices.length} خدمة</p></div></div><span class="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center text-[12px] ${isOpen?'rotate-180':''}">▼</span></button>${categoryMoveButtons}`;
    if(isOpen){
      html+='<div class="border-t divide-y bg-slate-50/50">';
      displayServices.forEach(srv=>{
        const s=String(srv||'');
        const detail=(Array.isArray(cat._detailed)?cat._detailed:[]).find(item=>String(item.name||'')===s);
        const isActive=detail?detail.isActive!==false:true;
        const serviceKey=String(detail&&detail.dbId?detail.dbId:s);
        const visibilityButton=isActive
          ? `<button onclick="hideService('${escHtml(serviceKey)}','${escHtml(s)}','${escHtml(label)}')" class="h-7 px-3 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-black">إخفاء</button>`
          : `<button onclick="showService('${escHtml(serviceKey)}','${escHtml(s)}','${escHtml(label)}')" class="h-7 px-3 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-black">إظهار</button>`;
        const detailIndex=(Array.isArray(cat._detailed)?cat._detailed:[]).findIndex(item=>String(item.name||'')===s);
        const moveButtons=`<button onclick="moveService('${escHtml(label)}','${escHtml(serviceKey)}',-1)" ${detailIndex<=0?'disabled':''} class="h-7 px-2 rounded-full bg-blue-50 border text-[10px] font-black disabled:opacity-30" title="تحريك لأعلى">↑</button><button onclick="moveService('${escHtml(label)}','${escHtml(serviceKey)}',1)" ${detailIndex<0||detailIndex>=cat._detailed.length-1?'disabled':''} class="h-7 px-2 rounded-full bg-blue-50 border text-[10px] font-black disabled:opacity-30" title="تحريك لأسفل">↓</button>`;
        const deleteButton=`<button onclick="deleteService('${escHtml(detail&&detail.dbId?detail.dbId:'')}','${escHtml(s)}','${escHtml(label)}')" class="h-7 px-2 rounded-full bg-red-50 border border-red-200 text-red-700 text-[10px] font-black">حذف</button>`;
        html+=`<div class="p-3.5 flex items-center justify-between gap-2 bg-white"><div class="flex items-center gap-2.5 min-w-0"><span class="h-2 w-2 shrink-0 rounded-full ${isActive?'bg-blue-600':'bg-slate-400'}"></span><span class="text-[12px] font-bold">${escHtml(s)}</span><span class="text-[9px] font-bold ${isActive?'text-emerald-700':'text-slate-500'}">${isActive?'ظاهرة':'مخفية'}</span></div><div class="flex flex-wrap justify-end gap-1 shrink-0">${moveButtons}<button onclick="editService('${escHtml(label)}','${escHtml(serviceKey)}','${escHtml(s)}')" class="h-7 px-2 rounded-full bg-slate-50 border text-[10px] font-black">تعديل</button>${visibilityButton}${deleteButton}</div></div>`;
      });
      html+='</div>';
    }
    html+='</article>';
  });
  return html+'</section>';
}

function renderRegions(){
  return `
  <section class="mt-4 space-y-4">
    <div class="rounded-[18px] bg-gradient-to-r from-teal-600 to-cyan-600 p-4 text-white"><p class="text-[12px] font-black">إدارة مناطق الخدمة</p><p class="text-[10px] text-teal-100 mt-1">إضافة وتعديل وتفعيل وتعطيل وحذف المناطق التي تظهر للعميل عند إنشاء الطلب</p></div>
    <div class="premium-panel p-4">
      <div class="flex gap-2"><input id="new-region" maxlength="100" placeholder="اسم المنطقة الجديدة" class="field flex-1"><button id="add-region-btn" onclick="addRegion()" class="pill-btn primary-pill">إضافة</button></div>
      <p class="mt-2 text-[10px] leading-5 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">المناطق النشطة هنا تُضاف إلى قائمة المناطق في نموذج طلب العميل. المناطق الأساسية ومناطق الفنيين المعتمدين تظل متاحة من مصادرها الحالية.</p>
      <div id="regions-list" class="mt-4 space-y-2">${state.regionsLoading?'<p class="text-center p-4 text-[11px] text-slate-500">جاري تحميل المناطق...</p>':renderRegionItems()}</div>
    </div>
  </section>`;
}
function renderRegionItems(){
  if(state.regionsError)return '<p class="p-3 text-[11px] font-bold text-red-600">'+escHtml(state.regionsError)+'</p>';
  if(!state.regions.length)return '<p class="p-4 text-center text-[11px] text-slate-500">لا توجد مناطق مضافة من الإدارة حتى الآن.</p>';
  return state.regions.map(r=>'<div class="flex flex-wrap justify-between items-center gap-3 p-3 rounded-xl bg-slate-50 border"><div class="min-w-0 flex-1"><span class="block text-[11px] font-black">'+escHtml(r.name||'')+'</span><span class="text-[10px] font-bold '+(r.isActive?'text-emerald-700':'text-slate-500')+'">'+(r.isActive?'نشطة — تظهر للعميل':'معطلة — لا تظهر للعميل')+'</span></div><div class="flex flex-wrap gap-1"><button onclick="editRegion(\''+escHtml(r._id)+'\')" class="pill-btn soft-btn">تعديل</button><button onclick="toggleRegion(\''+escHtml(r._id)+'\','+(r.isActive?'true':'false')+')" class="pill-btn soft-btn">'+(r.isActive?'تعطيل':'تفعيل')+'</button><button onclick="deleteRegion(\''+escHtml(r._id)+'\')" class="pill-btn danger-pill">حذف</button></div></div>').join('');
}
function renderNotifications(){
  return `
  <section class="mt-4 space-y-4">
    <div class="rounded-[18px] bg-gradient-to-r from-violet-600 to-purple-600 p-4 text-white"><p class="text-[12px] font-black">الإشعارات والرسائل</p><p class="text-[10px] text-violet-100 mt-1">إرسال فردي أو جماعي حسب نوع الحساب وحالته</p></div>
    <div class="premium-panel p-4 space-y-3">
      <label class="block text-[11px] font-black">طريقة الإرسال<select id="notification-mode" onchange="updateNotificationMode()" class="field mt-2 w-full"><option value="single">إشعار لفرد محدد</option><option value="group">إشعار جماعي لفئة</option></select></label>
      <label class="block text-[11px] font-black">نوع الحساب<select id="notification-recipient-role" onchange="updateNotificationAudience()" class="field mt-2 w-full"><option value="fanni">الفنيون</option><option value="client">العملاء</option></select></label>
      <div id="notification-phone-wrap"><label class="block text-[11px] font-black">رقم هاتف المستلم<input id="notification-recipient-phone" type="tel" inputmode="tel" autocomplete="off" maxlength="20" placeholder="رقم هاتف الفني أو العميل" class="field mt-2 w-full" /></label></div>
      <div id="notification-audience-wrap" class="hidden"><label class="block text-[11px] font-black">الفئة المستهدفة<select id="notification-audience" class="field mt-2 w-full"><option value="all">جميع الفنيين</option><option value="approved">الفنيون المعتمدون</option><option value="disabled">الفنيون المعطلون (معلقون)</option></select></label><p class="mt-1 text-[10px] text-slate-500">الإرسال الجماعي يرسل إشعارًا داخل التطبيق لكل حساب مطابق للاختيار.</p></div>
      <input id="notification-title" maxlength="100" placeholder="عنوان الإشعار..." class="field" />
      <textarea id="notification-message" rows="3" maxlength="300" placeholder="نص الرسالة (حتى 300 حرف)..." class="field"></textarea>
      <button id="send-notification-btn" onclick="sendNotification()" class="pill-btn primary-pill w-full">إرسال الإشعار 🔔</button>
      <div class="rounded-[12px] bg-slate-50 border p-3 text-[10px] font-bold text-slate-500">الإرسال داخل التطبيق فقط، وليس SMS. ستظهر رسالة تأكيد قبل الإرسال الجماعي.</div>
    </div>
    <div class="premium-panel p-4 space-y-3">
      <div class="flex items-center justify-between gap-3"><div><p class="text-[12px] font-black">سجل الإشعارات الإدارية</p><p class="mt-1 text-[10px] text-slate-500">الحذف هنا يزيل الإشعار من جميع الحسابات التي أُرسل إليها.</p></div><button type="button" onclick="loadNotificationHistory()" class="pill-btn soft-btn shrink-0">تحديث</button></div>
      <div id="notification-history-list" class="space-y-2">${renderNotificationHistory()}</div>
    </div>
  </section>`;
}
function updateNotificationMode(){const mode=document.getElementById('notification-mode')?.value||'single';const phoneWrap=document.getElementById('notification-phone-wrap');const audienceWrap=document.getElementById('notification-audience-wrap');if(phoneWrap)phoneWrap.classList.toggle('hidden',mode!=='single');if(audienceWrap)audienceWrap.classList.toggle('hidden',mode!=='group');updateNotificationAudience();}
function updateNotificationAudience(){const role=document.getElementById('notification-recipient-role')?.value||'fanni';const select=document.getElementById('notification-audience');if(!select)return;const current=select.value;const options=role==='fanni'?[['all','جميع الفنيين'],['approved','الفنيون المعتمدون'],['disabled','الفنيون المعطلون (معلقون)']]:[['all','جميع العملاء'],['active','العملاء النشطون'],['disabled','العملاء المعطلون (معلقون)']];select.innerHTML=options.map(([value,label])=>'<option value="'+value+'">'+label+'</option>').join('');if(options.some(option=>option[0]===current))select.value=current;}


function renderNotificationHistory(){
  if(state.notificationHistoryLoading)return '<p class="p-4 text-center text-[11px] text-slate-500">جاري تحميل سجل الإشعارات...</p>';
  if(!state.notificationHistory.length)return '<p class="p-4 text-center text-[11px] text-slate-500">لا توجد إشعارات إدارية محفوظة.</p>';
  return state.notificationHistory.map(item => '<div class="rounded-xl border border-slate-200 p-3 space-y-2"><div class="flex items-start justify-between gap-3"><div class="min-w-0"><p class="text-[11px] font-black break-words">'+escHtml(item.title||'إشعار بدون عنوان')+'</p><p class="mt-1 text-[10px] leading-5 text-slate-600 break-words">'+escHtml(item.message||'')+'</p></div><button type="button" data-id="'+escHtml(item.id)+'" onclick="deleteNotificationCampaign(this.dataset.id)" class="shrink-0 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[10px] font-black text-red-700">حذف</button></div><div class="flex flex-wrap items-center gap-2 text-[9px] text-slate-500"><span class="rounded-full bg-slate-100 px-2 py-1">'+(item.recipientRole==='client'?'العملاء':'الفنيون')+'</span><span class="rounded-full bg-blue-50 px-2 py-1 text-blue-700">عدد المستلمين: '+Number(item.count||0)+'</span><span>'+escHtml(item.createdAt?new Date(item.createdAt).toLocaleString('ar-EG'):'')+'</span></div></div>').join('');
}
async function loadNotificationHistory(){
  const root=document.getElementById('notification-history-list');
  state.notificationHistoryLoading=true;
  if(root)root.innerHTML=renderNotificationHistory();
  try{const data=await tryApi(['/api/admin/notifications/direct'],{method:'GET'});state.notificationHistory=extractList(data,['notifications']);}
  catch(e){state.notificationHistory=[];showToast(e.message||'تعذر تحميل سجل الإشعارات','error');}
  finally{state.notificationHistoryLoading=false;const target=document.getElementById('notification-history-list');if(target)target.innerHTML=renderNotificationHistory();}
}
async function deleteNotificationCampaign(id){
  const item=state.notificationHistory.find(entry=>String(entry.id)===String(id));
  if(!item)return showToast('الإشعار غير موجود في القائمة؛ حدّث السجل','error');
  if(!confirm('تأكيد حذف الإشعار «'+String(item.title||'').slice(0,100)+'» من '+Number(item.count||0)+' حساب؟ لا يمكن التراجع عن الحذف.'))return;
  try{const data=await tryApi(['/api/admin/notifications/direct/'+encodeURIComponent(id)],{method:'DELETE'});showToast((data.message||'تم حذف الإشعار')+' — المحذوف: '+Number(data.deleted||0));await loadNotificationHistory();}
  catch(e){showToast(e.message||'تعذر حذف الإشعار','error');}
}

function renderSettings(){
  const v=state.settings||{siteName:'صُنّاع',maintenance:false,maintenanceMessage:'',maxFanniSignupAttempts:5};
  return `
  <section class="mt-4 space-y-4">
    <div class="rounded-[18px] bg-gradient-to-r from-slate-800 to-slate-600 p-4 text-white"><p class="text-[12px] font-black">إعدادات النظام العامة</p><p class="text-[10px] text-slate-300 mt-1">يتم حفظ القيم في قاعدة البيانات؛ بعض الإعدادات تحتاج ربطًا تشغيليًا إضافيًا.</p></div>
    <div class="premium-panel p-4 space-y-4">
      <label class="block"><span class="text-[11px] font-black">اسم المنصة</span><input id="setting-site-name" maxlength="100" value="${escHtml(v.siteName||'صُنّاع')}" class="field mt-2"></label>
      <label class="block"><span class="text-[11px] font-black">رسالة وضع الصيانة</span><textarea id="setting-maintenance-message" rows="2" maxlength="500" class="field mt-2">${escHtml(v.maintenanceMessage||'')}</textarea></label>
      <div class="flex items-center justify-between p-3 rounded-[12px] bg-amber-50 border border-amber-200"><span class="text-[11px] font-black">وضع الصيانة (يوقف طلبات العملاء والفنيين مؤقتًا)</span><label class="relative inline-flex items-center cursor-pointer"><input id="setting-maintenance" type="checkbox" class="sr-only peer" ${v.maintenance?'checked':''}><div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-blue-600"></div></label></div>
      <label class="block"><span class="text-[11px] font-black">الحد الأقصى لمحاولات تسجيل الفني من نفس عنوان IP خلال 15 دقيقة</span><input id="setting-signup-attempts" type="number" min="1" max="100" value="${Number(v.maxFanniSignupAttempts||5)}" class="field mt-2"></label>
      <div class="border-t pt-4 space-y-3">
        <p class="text-[12px] font-black">أرقام تحويل محفظة الفني</p>
        <p class="text-[10px] text-slate-500">الأرقام دي هتتربط بواجهة الفني على الموقع والتطبيق في الخطوات التالية. اترك أي خانة فارغة لو الرقم غير متاح.</p>
        <label class="block"><span class="text-[11px] font-black">رقم المحفظة الأول</span><input id="setting-wallet-phone-1" type="tel" inputmode="tel" maxlength="20" value="${escHtml(v.walletPhone1||'')}" placeholder="اكتب رقم المحفظة الأول" class="field mt-2"></label>
        <label class="block"><span class="text-[11px] font-black">رقم المحفظة الثاني</span><input id="setting-wallet-phone-2" type="tel" inputmode="tel" maxlength="20" value="${escHtml(v.walletPhone2||'')}" placeholder="اكتب رقم المحفظة الثاني أو اتركه فارغًا" class="field mt-2"></label>
      </div>
      <button id="save-settings-btn" onclick="saveSettings()" class="w-full h-11 rounded-full bg-slate-900 text-white font-black text-[11px]">حفظ الإعدادات</button>
    </div>
  </section>`;
}

function renderSecurity(){
  return `
  <section class="mt-4 space-y-4">
    <div class="rounded-[18px] bg-gradient-to-r from-red-600 to-orange-600 p-4 text-white"><p class="text-[12px] font-black">الأمان وسجل التدقيق</p><p class="text-[10px] text-red-100 mt-1">سجل حقيقي للأحداث المسجلة من أدوات الإدارة المدعومة، وليس سجلًا كاملًا لكل أحداث النظام حتى الآن.</p></div>
    <div class="premium-panel p-4">
      <div class="flex gap-2"><input id="audit-date" type="date" value="${escHtml(state.auditDate||"")}" oninput="state.auditDate=this.value" class="field flex-1"><button id="audit-filter-btn" onclick="loadAuditLogs()" class="pill-btn soft-btn">تصفية</button></div>
      <div class="mt-4 space-y-2 text-[11px] font-bold">
        ${state.auditLogs?.length?state.auditLogs.map(log=>`<div class="p-3 rounded-[12px] ${log.category==='support'?'bg-amber-50 border border-amber-100':'bg-slate-50 border'}"><p>${escHtml(log.action||'إجراء إداري')} — ${escHtml(log.target||'')}</p><p class="text-[10px] text-slate-500 mt-1">${escHtml(log.adminName||'الإدارة')} • ${escHtml(log.createdAt?new Date(log.createdAt).toLocaleString('ar-EG-u-ca-gregory',{calendar:'gregory',timeZone:'Africa/Cairo'}):'')} • ${escHtml(log.details||'')}</p></div>`).join(''):'<p class="p-4 text-center text-slate-500">لا توجد سجلات مسجلة للفترة المحددة.</p>'}
      </div>
    </div>
  </section>`;
}

function renderReports(){
  return `
  <section class="mt-4 space-y-4">
    <div class="rounded-[18px] bg-gradient-to-r from-indigo-600 to-blue-600 p-4 text-white"><p class="text-[12px] font-black">التقارير والتحليلات</p><p class="text-[10px] text-indigo-100 mt-1">طلبات • فنيون • عملاء • مالي • تصدير</p></div>
    <div class="premium-panel p-4">
      <div class="grid grid-cols-2 gap-2"><label class="text-[10px] font-bold">من تاريخ<input id="report-start-date" type="date" class="field mt-1"></label><label class="text-[10px] font-bold">إلى تاريخ<input id="report-end-date" type="date" class="field mt-1"></label><input id="report-service" maxlength="100" placeholder="اسم الخدمة (اختياري)" class="field"><input id="report-area" maxlength="250" placeholder="المنطقة (اختياري)" class="field"></div>
      <button id="generate-report-btn" onclick="generateReport()" class="mt-3 w-full h-11 rounded-full bg-slate-900 text-white font-black text-[11px]">إنشاء التقرير 📊</button>
      <button onclick="exportReport()" class="mt-2 w-full h-11 rounded-full bg-white border font-black text-[11px]">تصدير التقرير CSV لفتحه في Excel</button>
      <p id="report-status" class="text-[10px] font-bold text-slate-500 mt-2">أنشئ التقرير أولًا لعرض بيانات قاعدة البيانات.</p>
    </div>
    <div id="report-results" class="grid grid-cols-2 gap-3">
      <div class="premium-panel p-4 col-span-2 text-[11px] text-slate-500">لا توجد بيانات تقرير معروضة. اضغط «إنشاء التقرير» لجلب الأرقام الفعلية.</div>
    </div>
  </section>`;
}

let pageVisitsData={summary:[],recent:[],total:0,filter:''};
async function loadPageVisits(){try{const q=pageVisitsData.filter?'?pageKey='+encodeURIComponent(pageVisitsData.filter):'';const data=await tryApi(['/api/admin/page-visits'+q],{method:'GET'});pageVisitsData={...pageVisitsData,summary:Array.isArray(data.summary)?data.summary:[],recent:Array.isArray(data.recent)?data.recent:[],total:Number(data.total||0)};}catch(e){showToast(e.message||'تعذر تحميل سجل الزيارات','error');}if(state.tab==='pageVisits')render();}
function renderPageVisits(){const pages=pageVisitsData.summary||[],rows=pageVisitsData.recent||[],esc=v=>escHtml(String(v??''));return `<section class="mt-4 space-y-4"><div class="premium-panel p-4"><div class="flex items-center justify-between gap-3"><div><h2 class="font-black text-sm">سجل زيارات الموقع</h2><p class="text-[10px] text-slate-500 mt-1">تسجيل تلقائي من صفحات المشروع</p></div><button onclick="loadPageVisits()" class="rounded-xl px-4 py-2 bg-slate-900 text-white font-black text-[11px]">↻ تحديث</button></div><div class="grid grid-cols-2 gap-3 mt-4"><div class="stat-card"><p class="text-2xl font-black">${Number(pageVisitsData.total||0).toLocaleString('ar-EG')}</p><p class="text-[10px] font-bold text-slate-500">إجمالي الزيارات</p></div><div class="stat-card"><p class="text-2xl font-black">${pages.length.toLocaleString('ar-EG')}</p><p class="text-[10px] font-bold text-slate-500">صفحات مسجلة</p></div></div><label class="block mt-4 text-[11px] font-bold">فلترة حسب الصفحة<select class="field mt-1" onchange="filterPageVisits(this.value)"><option value="">كل الصفحات</option>${pages.map(p=>`<option value="${esc(p.pageKey)}" ${pageVisitsData.filter===p.pageKey?'selected':''}>${esc(p.pageName)}</option>`).join('')}</select></label></div><div class="premium-panel p-4"><h3 class="font-black text-[12px] mb-3">إحصائيات كل صفحة</h3>${pages.length?pages.map(p=>`<div class="flex items-center justify-between gap-3 border-b border-slate-100 py-3"><div><p class="font-black text-[11px]">${esc(p.pageName)}</p><p class="text-[10px] text-slate-500">${esc(p.pageKey)}</p></div><div class="text-left"><p class="font-black text-lg">${Number(p.visits||0).toLocaleString('ar-EG')}</p><p class="text-[9px] text-slate-500">زيارة</p></div></div>`).join(''):'<p class="text-[11px] text-slate-500">لا توجد زيارات مسجلة حتى الآن.</p>'}</div><div class="premium-panel p-4"><h3 class="font-black text-[12px] mb-3">أحدث الزيارات</h3>${rows.length?rows.map(v=>`<div class="border-b border-slate-100 py-3"><div class="flex justify-between gap-3"><p class="font-black text-[11px]">${esc(v.pageName)}</p><p class="text-[10px] text-slate-500 shrink-0">${v.visitedAt?new Date(v.visitedAt).toLocaleString('ar-EG',{timeZone:'Africa/Cairo'}):'—'}</p></div><p class="text-[10px] text-slate-500 mt-1 break-all">${esc(v.path)}</p></div>`).join(''):'<p class="text-[11px] text-slate-500">لا توجد زيارات مسجلة حتى الآن.</p>'}</div></section>`;}
function filterPageVisits(value){pageVisitsData.filter=String(value||'');loadPageVisits();}

function renderSupport(){
 const result=state.supportResults||{orders:[],complaints:[]};
 return `
 <section class="mt-4 space-y-4">
 <div class="premium-panel p-4"><h3 class="font-black text-sm">محادثات خدمة العملاء</h3><p class="text-[11px] text-slate-500 mt-1 leading-6">افتح صندوق المحادثات لمتابعة رسائل العملاء والفنيين والرد عليهم وتغيير حالة كل محادثة.</p><div class="mt-3"><a href="support.html?role=admin" class="pill-btn primary-pill w-full inline-flex items-center justify-center no-underline">مركز مساعدة صُنّاع 🎧</a></div></div>
 <div class="premium-panel p-4"><div class="flex gap-2"><input id="support-query" value="${escHtml(state.supportQuery||'')}" placeholder="رقم طلب / كود تتبع / هاتف" class="field flex-1"><button onclick="searchSupport()" class="pill-btn primary-pill">بحث</button></div><button onclick="loadSupportViolations()" class="pill-btn soft-btn mt-3 w-full">سجل المخالفات / إجراءات الدعم</button></div>
 ${(result.orders||[]).map(o=>`<article class="premium-card p-3"><p class="font-black">طلب ${escHtml(o.sn)} — ${escHtml(o.clientName||'عميل')} — ${escHtml(o.clientPhone||'')}</p><p class="text-[10px] text-slate-500">${escHtml(o.service||'')} • ${escHtml(o.status||'')}</p><button onclick="markSupportReview('${escHtml(o.sn)}')" class="pill-btn soft-btn mt-2">وضع علامة مراجعة</button></article>`).join('')}
 ${(result.complaints||[]).map(c=>`<article class="premium-card p-3"><p class="font-black">شكوى ${escHtml(c.sn)} — ${escHtml(c.clientName||'')}</p><p class="text-[10px] text-slate-600">${escHtml(c.text||'')}</p><p class="text-[10px]">الحالة: ${escHtml(c.status||'')}</p><button onclick="markSupportReview('${escHtml(c.sn)}')" class="pill-btn soft-btn mt-2">وضع علامة مراجعة</button></article>`).join('')}
 ${state.supportViolations?.length?`<div class="premium-panel p-4"><h3 class="font-black mb-2">سجل إجراءات الدعم</h3>${state.supportViolations.map(v=>`<p class="border-b py-2 text-[10px]">${escHtml(v.action)} — ${escHtml(v.target)} • ${escHtml(v.createdAt?new Date(v.createdAt).toLocaleString('ar-EG-u-ca-gregory',{calendar:'gregory',timeZone:'Africa/Cairo'}):'')}</p>`).join('')}</div>`:''}
 </section>`;
}
function renderContent(){
 const c=state.content||{announcement:'',faqs:[]};
 return `
 <section class="mt-4 space-y-4">
 <div class="premium-panel p-4 space-y-3">
 <label class="block"><span class="text-[11px] font-black">رسالة إعلانية في واجهة العميل</span><textarea id="content-announcement" oninput="state.content.announcement=this.value" maxlength="1000" rows="3" class="field mt-2">${escHtml(c.announcement||'')}</textarea></label><div class="flex gap-2"><button onclick="saveAnnouncement()" class="pill-btn primary-pill flex-1">حفظ الإعلان فقط</button><button onclick="clearAnnouncement()" class="pill-btn soft-btn flex-1">مسح الإعلان</button></div>
 <div class="border-t pt-3"><h3 class="text-[11px] font-black mb-2">الأسئلة الشائعة</h3><input id="faq-question" maxlength="250" placeholder="السؤال الجديد" class="field mb-2"><textarea id="faq-answer" maxlength="1000" rows="2" placeholder="الإجابة" class="field mb-2"></textarea><button onclick="addFaq()" class="pill-btn primary-pill w-full">إضافة سؤال</button></div>
 <div class="space-y-2">${(c.faqs||[]).map((faq,i)=>`<div class="border rounded-xl p-3"><p class="font-black text-[11px]">${escHtml(faq.question)}</p><p class="text-[10px] mt-1">${escHtml(faq.answer)}</p><button onclick="removeFaq(${i})" class="pill-btn soft-btn mt-2">حذف السؤال</button></div>`).join('')||'<p class="text-[10px] text-slate-500">لم تتم إضافة أسئلة بعد.</p>'}</div>
 <p class="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">سيظهر الإعلان والأسئلة النشطة في واجهة العميل بعد الحفظ وتحديث الصفحة.</p>
 <button onclick="previewContent()" class="w-full h-10 rounded-full border bg-white font-black text-[11px]">معاينة قبل النشر</button>
 <button id="save-content-btn" onclick="saveContent()" class="w-full h-11 rounded-full bg-slate-900 text-white font-black text-[11px]">حفظ ونشر المحتوى</button>
 </div></section>`;
}
function renderClients(){
  const clients=Array.isArray(state.filteredClients)?state.filteredClients:[];
  return `
  <section class="mt-4 space-y-4">
    <div class="premium-panel p-4 space-y-3"><div class="flex items-center justify-between"><label class="text-[11px] font-black"><input type="checkbox" onchange="toggleAllBulkSelection('clients',state.filteredClients.filter(c=>c.registered).map(c=>c.phone),this.checked)"> تحديد الحسابات المسجلة الظاهرة</label><span class="text-[10px] text-slate-500">المحدد: ${(state.selectedBulkClientPhones||[]).length}</span></div><button onclick="runBulkAction('clients','delete')" class="pill-btn danger-pill">حذف الحسابات المحددة</button><div class="flex gap-2"><input id="client-search" value="${escHtml(state.clientSearch||'')}" placeholder="اسم / هاتف / كود الطلب" class="field flex-1"><button onclick="searchClients()" class="pill-btn primary-pill">بحث</button></div><label class="text-[10px] font-black text-slate-600">حالة حساب العميل</label><select onchange="setClientStatusFilter(this.value)" class="field"><option value="all" ${state.clientStatusFilter==='all'?'selected':''}>كل العملاء</option><option value="active" ${state.clientStatusFilter==='active'?'selected':''}>الحسابات النشطة</option><option value="suspended" ${state.clientStatusFilter==='suspended'?'selected':''}>العملاء الموقوفون</option></select></div>
    ${state.clientsLoading?'<p class="premium-panel p-4">جاري تحميل العملاء...</p>':''}
    ${clients.map(c=>`<article class="premium-card p-4 space-y-3"><div class="flex items-start justify-between gap-3"><div class="min-w-0"><p class="font-black">${escHtml(c.name||'عميل')}</p><p dir="ltr" class="text-sm text-slate-600">${escHtml(c.phone||'')}</p><p class="text-[10px] text-slate-500 mt-1">${c.registered?'حساب مسجل':'طلب بدون حساب'} • الطلبات: ${Number(c.orderCount||0)}</p><div class="mt-2 flex flex-wrap gap-1.5 text-[10px] font-extrabold"><span class="rounded-full border border-amber-200 bg-amber-50 text-amber-800 px-2 py-1">★ ${Number(c.ratingAverage||0).toFixed(1)} (${Number(c.ratingCount||0)} تقييم)</span><span class="rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 px-2 py-1">✓ ${Number(c.completedJobs||0)} عمل مكتمل</span></div></div><span class="text-[10px] rounded-full border px-2 py-1 font-black ${c.registered&&c.status==='معلق'?'border-red-200 bg-red-50 text-red-700':'border-slate-200 bg-slate-50 text-slate-600'}">${c.registered?(c.status==='معلق'?'موقوف':'نشط'):'بدون حساب'}</span></div><div class="flex gap-2 items-center"><button onclick="openClient('${escHtml(c.phone||'')}')" class="pill-btn primary-pill flex-1">التفاصيل</button><details class="relative" ontoggle="this.closest('article').classList.toggle('menu-active',this.open)"><summary class="pill-btn soft-btn list-none cursor-pointer">إجراءات أخرى ▾</summary><div class="absolute left-0 top-full z-20 mt-1 min-w-44 rounded-xl border border-slate-200 bg-white p-2 shadow-xl space-y-1"><button onclick="blockClient('${escHtml(c.phone||'')}')" ${c.registered&&c.status!=='معلق'?'':'disabled'} class="dropdown-item w-full text-right">تعليق الحساب</button><button onclick="unblockClient('${escHtml(c.phone||'')}')" ${c.registered&&c.status==='معلق'?'':'disabled'} class="dropdown-item w-full text-right">إعادة تفعيل الحساب</button><button onclick="noteClient('${escHtml(c.phone||'')}')" ${c.registered?'':'disabled'} class="dropdown-item w-full text-right">ملاحظة داخلية</button><button onclick="deleteRegisteredClient('${escHtml(c.phone||'')}')" ${c.registered?'':'disabled'} class="dropdown-item w-full text-right text-red-600">حذف الحساب</button><button onclick="changeAccountPassword('client','${escHtml(c.phone||'')}')" ${c.registered?'':'disabled'} class="dropdown-item w-full text-right">🔐 تغيير كلمة السر</button></div></details><label class="text-[10px] font-bold"><input type="checkbox" ${((state.selectedBulkClientPhones||[]).includes(String(c.phone||''))&&c.registered)?'checked':''} ${c.registered?'':'disabled'} onchange="toggleBulkSelection('clients','${escHtml(c.phone||'')}',this.checked)"> تحديد</label></div></article>`).join('')||'<div class="premium-panel p-8 text-center">لا توجد نتائج</div>'}
  </section>`;
}
function renderStats(){
  const monthlyStats=[];const now=new Date();for(let offset=11;offset>=0;offset--){const month=new Date(now.getFullYear(),now.getMonth()-offset,1);const label=new Intl.DateTimeFormat('ar-EG-u-ca-gregory',{month:'short',year:'numeric',timeZone:'Africa/Cairo'}).format(month);const created=state.orders.filter(o=>{const d=new Date(o.createdAt||0);return !Number.isNaN(d.getTime())&&d.getFullYear()===month.getFullYear()&&d.getMonth()===month.getMonth();}).length;const completed=state.orders.filter(o=>{if(!['تم الانتهاء','منتهي','مكتمل'].includes(String(o.status||'')))return false;const d=new Date(o.completedAt||o.updatedAt||o.createdAt||0);return !Number.isNaN(d.getTime())&&d.getFullYear()===month.getFullYear()&&d.getMonth()===month.getMonth();}).length;monthlyStats.push({label,created,completed});}const maxMonthly=Math.max(1,...monthlyStats.map(m=>Math.max(m.created,m.completed)));
  return `
  <section class="mt-4 space-y-3">
    <div class="grid grid-cols-2 gap-3">
      <div class="stat-card"><p class="text-[28px] font-black">${state.accountCounts.technicians}</p><p class="text-[11px] font-bold text-slate-500">إجمالي الفنيين</p></div>
      <div class="stat-card"><p class="text-[28px] font-black text-blue-700">${state.accountCounts.clients}</p><p class="text-[11px] font-bold text-slate-500">إجمالي العملاء المسجلين</p></div>
      <div class="stat-card"><p class="text-[28px] font-black text-emerald-600">${state.accountCounts.verifiedTechnicians}</p><p class="text-[11px] font-bold text-slate-500">إجمالي الفنيين المعتمدين</p></div>
      <div class="stat-card"><p class="text-[28px] font-black text-blue-700">${state.orders.length}</p><p class="text-[11px] font-bold text-slate-500">طلبات</p></div>
      <div class="stat-card"><p class="text-[28px] font-black">${state.topups.length}</p><p class="text-[11px] font-bold text-slate-500">شحن</p></div>
      <div class="stat-card col-span-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-0"><p class="text-[26px] font-black">${state.topups.filter(t=>t.status==='approved').reduce((s,t)=>s+Number(t.amount||0),0)} جنيه</p><p class="text-[11px] font-bold text-emerald-100">إجمالي الشحن المقبول</p></div>
    </div>
    <div class="premium-panel p-4"><p class="text-[12px] font-black mb-3">إحصائيات شهرية — التقويم الميلادي</p><p class="text-[10px] text-slate-500 mb-3">عدد الطلبات حسب تاريخ الإنشاء، والمكتملة حسب تاريخ الإكمال أو آخر تحديث. السجل المعروض محدود بالطلبات المحمّلة في اللوحة.</p><div class="space-y-3">${monthlyStats.map(m=>'<div><div class="flex justify-between gap-2 text-[10px] mb-1"><span>'+escHtml(m.label)+'</span><span>طلبات '+m.created+' • مكتملة '+m.completed+'</span></div><div class="h-2 rounded-full bg-slate-100 overflow-hidden flex"><div class="h-full bg-blue-600" style="width:'+(m.created/maxMonthly*100)+'%"></div><div class="h-full bg-emerald-500" style="width:'+(m.completed/maxMonthly*100)+'%"></div></div></div>').join('')}</div><div class="flex gap-4 mt-3 text-[10px]"><span class="text-blue-700 font-bold">■ الطلبات المنشأة</span><span class="text-emerald-700 font-bold">■ الطلبات المكتملة</span></div></div>
  </section>`;
  applyAdminPermissionGuards();
}

// --- Existing logic preserved ---