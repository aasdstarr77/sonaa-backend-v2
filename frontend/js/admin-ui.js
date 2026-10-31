/* Extracted page functions; classic-script globals are preserved. */
'use strict';

function showToast(msg,type='success'){
  const el=document.getElementById('toast'); if(!el)return;
  const bg=type==='success'?'background:linear-gradient(135deg,#10b981,#059669)':type==='error'?'background:linear-gradient(135deg,#ef4444,#dc2626)':'background:linear-gradient(135deg,#f59e0b,#d97706)';
  el.innerHTML=`<div style="${bg}" class="pointer-events-auto mx-auto max-w-[640px] rounded-[16px] text-white text-[12px] font-bold px-4 py-3.5 shadow-2xl animate-fade flex items-center justify-between gap-3"><span>${escHtml(msg)}</span><button onclick="this.parentElement.remove()" class="shrink-0 h-8 px-3 bg-white/20 rounded-full text-[11px]">إغلاق</button></div>`;
  setTimeout(()=>{if(el.firstElementChild)el.innerHTML=''},4200);
}

function statusLabel(s){const m={'قيد المراجعة':'قيد المراجعة','تم النشر':'تم النشر','وصلتك عروض':'وصلت عروض','تم اختيار فني':'تم اختيار فني','تم الانتهاء':'تم الانتهاء',pending:'قيد المراجعة',approved:'مقبول',rejected:'مرفوض',disabled:'معطل'};return m[String(s||'')]||String(s||'غير محدد');}

function statusClass(s){const t=String(s||''); if(['تم الانتهاء','منتهي','تم اختيار فني','approved','مقبول'].includes(t))return 'bg-emerald-50 border-emerald-200 text-emerald-700'; if(['مرفوض','rejected','اعتذار','معطل','disabled'].includes(t))return 'bg-red-50 border-red-200 text-red-700'; if(['تم النشر','وصلتك عروض'].includes(t))return 'bg-blue-50 border-blue-200 text-blue-700'; return 'bg-amber-50 border-amber-200 text-amber-800';}

function orderSearchMatch(o,s){const haystack=[o.sn,o.clientName,o.clientPhone,o.service,o.area,o.city,o.description].map(v=>String(v||'').toLowerCase()).join(' '); return haystack.includes(s.toLowerCase());}

function toggleMenu(key){
  const isOpen = !!state.dropdowns[key];
  state.dropdowns = {};
  if(!isOpen) state.dropdowns[key]=true;
  render();
}

function closeAllMenus(){ state.dropdowns={}; render(); }

function setPendingAction(key, action, label){
  state.pendingActions[key]={action,label};
  state.dropdowns={};
  render();
}

function clearPending(key){ delete state.pendingActions[key]; render(); }

function confirmPending(key){
  const p = state.pendingActions[key];
  if(!p) return;
  const [type,id] = key.split(':');
  // route to actual function
  if(type==='fanni'){
    if(p.action==='approve') approveFanni(id);
    else if(p.action==='reject') rejectFanni(id);
    else if(p.action==='disable') disableFanni(id);
    else if(p.action==='enable') enableFanni(id);
    else if(p.action==='delete') deleteFanni(id,'');
    else if(p.action==='level_up') updateFanniLevel(id,'خبير');
    else if(p.action==='badge_trust') toggleTrustBadge(id);
    else showToast('تم اختيار: '+p.label);
  } else if(type==='order'){
     if(p.action==='publish') publishOrder(id);
     else if(p.action==='cancel') cancelOrder(id);
     else if(p.action==='archive') archiveOrder(id);
     else if(p.action==='delete') deleteOrder(id);
     else if(p.action==='assign') assignOrder(id);
     else showToast('هذا الإجراء غير مربوط بعد؛ لم يتم تغيير الطلب','error');
  } else if(type==='topup'){
    if(p.action==='approve') approveTopup(id);
    else if(p.action==='reject') rejectTopup(id);
  } else if(type==='complaint'){
    showToast('تم اختيار: '+p.label);
  }
  delete state.pendingActions[key];
  render();
}

function render(){
  if(!getToken()){renderLogin();return;}
  if(!canReadTab(state.tab)){const first=ADMIN_SECTIONS.flatMap(section=>section.tabs).find(item=>canReadTab(item.id));state.tab=first?.id||'dashboard';}
  const visibleSections=ADMIN_SECTIONS.filter(section=>section.tabs.some(item=>canReadTab(item.id)));
  const isAuth=true;
  const pendingCount=state.fannis.filter(f=>!f.isApproved&&!f.isDisabled&&f.status!=='rejected').length;
  const disabledCount=state.fannis.filter(f=>f.isDisabled).length;

  document.getElementById('app').innerHTML=`
  <header class="sticky top-0 z-40 glass-header text-white shadow-[0_6px_18px_rgba(11,27,58,.20)]"><div class="mx-auto max-w-[800px] px-3 py-1 grid grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)] items-center gap-1 min-h-[64px]">
      <div class="admin-header-title min-w-0 text-right self-start">
        <h1 class="font-black text-[14px] leading-5">صُنّاع | لوحة الإدارة</h1>
        ${isAuth&&currentAdminRoleLabel()?'<div class="mt-0.5 text-[10px] text-blue-100 font-bold"><span>المنصب الإداري:</span><span>'+escHtml(currentAdminRoleLabel())+'</span></div>':''}
        <button type="button" onclick="goBack()" class="mt-1 h-6 px-3 rounded-lg border border-white/20 bg-white/10 text-white text-[11px] font-extrabold">← رجوع</button>
      </div>
      <div class="admin-logo-frame h-[84px] w-[84px] justify-self-center rounded-2xl bg-[#F8FAFC] border-2 border-[#14B8A6] flex items-center justify-center shadow-lg overflow-hidden">
        <img class="sonaa-logo-svg admin-header-logo h-full w-full object-contain" src="/images/LOGO_UPLOAD_HERE/logo.png" alt="شعار صُنّاع" width="120" height="120" decoding="async">
      </div>
      <div class="admin-header-actions grid grid-cols-2 gap-1 shrink-0 items-center justify-self-end w-auto max-w-[210px]">
        ${isAuth?'<a href="/frontend/editor.html" target="_blank" id="visualEditorLink" style="background:#7C3AED;color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none;margin-right:10px;display:inline-block;">🎨 تحرير الواجهة</a>':''}
        
        <a href="password.html?role=admin&amp;mode=account" class="h-8 w-full rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-[10px] font-black text-white inline-flex items-center justify-center gap-1 no-underline leading-none"><span aria-hidden="true">👤</span><span>حسابي</span></a>
        
        <a href="/" aria-label="القائمة الرئيسية" title="القائمة الرئيسية" class="h-8 w-full rounded-lg bg-white/10 hover:bg-white/15 text-white text-[10px] font-black inline-flex items-center justify-center text-center leading-none">⌂ القائمة الرئيسية</a>
        ${isAuth?'<button onclick="logout()" class="h-8 w-full rounded-lg bg-white/10 flex items-center justify-center text-[11px]">⎋ خروج</button>':''}
      </div>
    </div>
  </header>
  
  <main class="mx-auto max-w-[800px] px-3 pb-28">
    ${isAuth?`<section class="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2" aria-label="إحصائيات سريعة"><div class="premium-panel p-3"><p class="text-[10px] font-bold text-slate-500">الطلبات</p><p class="text-[19px] font-black text-slate-900">${state.orders.length}</p></div><div class="premium-panel p-3"><p class="text-[10px] font-bold text-slate-500">الفنيون</p><p class="text-[19px] font-black text-slate-900">${state.accountCounts.technicians}</p></div><div class="premium-panel p-3"><p class="text-[10px] font-bold text-slate-500">العملاء</p><p class="text-[19px] font-black text-slate-900">${state.accountCounts.clients}</p></div><div class="premium-panel p-3"><p class="text-[10px] font-bold text-slate-500">الشكاوى الجديدة</p><p class="text-[19px] font-black text-slate-900">${state.complaints.filter(c=>c.status==='جديدة').length}</p></div></section>

`:''}
    
    ${!isAuth?`
      <section class="mt-8 max-w-[420px] mx-auto premium-panel p-6 sm:p-7 animate-fade">
        <div class="flex items-center gap-3.5">
          <div class="h-12 w-12 rounded-[14px] bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-black">🔐</div>
          <div><h2 class="font-black text-[18px]">دخول الأدمن</h2><p class="text-[11px] text-slate-500 font-bold">إدارة مشروع صُنّاع</p></div>
        </div>
        <form onsubmit="event.preventDefault();doLogin();" class="mt-5 space-y-4">
          <label class="block"><span class="block text-[11px] font-black text-slate-700 mb-2">البريد الإلكتروني</span><input type="email" value="${escHtml(state.adminEmail)}" oninput="state.adminEmail=this.value" required placeholder="admin@sonaa.com" class="field"></label>
          <label class="block"><span class="block text-[11px] font-black text-slate-700 mb-2">كلمة المرور</span><input type="password" value="${escHtml(state.adminPass)}" oninput="state.adminPass=this.value" required placeholder="••••••••" class="field"></label>
          <button type="submit" ${state.loading?'disabled':''} class="w-full h-[48px] rounded-full bg-gradient-to-r from-[#0b1b3a] to-[#1e3a8a] text-white text-[13px] font-black shadow-lg">${state.loading?'جاري...':'تسجيل الدخول ✨'}</button>
          ${state.error?`<p class="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-[14px] p-3.5 font-bold">${escHtml(state.error)}</p>`:''}
        </form>
      </section>
    `:`
      ${state.pageMode==='home'?`<section class="mt-4 premium-panel p-3 space-y-3">
        <div class="flex items-center justify-between px-1">
          <h2 class="text-[12px] font-black text-slate-700">مركز التحكم</h2>
          <span class="text-[10px] text-slate-500">6 أقسام رئيسية</span>
        </div>
        
        <div class="section-nav" aria-label="كل أدوات لوحة الإدارة">
          ${ADMIN_SECTIONS.filter(section=>section.tabs.some(item=>canReadTab(item.id))).map(section=>`
            <section class="section-nav-group">
              <h3 class="section-nav-heading"><span class="section-nav-icon">${section.icon}</span><span>${escHtml(section.label)}</span></h3>
              <div class="section-nav-items">
                ${section.tabs.map(item=>`
                  <div>
                    <button type="button" onclick="setTab('${item.id}')" class="section-nav-btn ${state.tab===item.id?'active':''}">
                      <span class="section-nav-label">${escHtml(item.label)}</span>${renderSectionCount(item)}
                    </button>
                    
                  </div>
                `).join('')}
                ${section.id==='customer-operations'?'<a href="password.html?role=admin&amp;mode=support" class="section-nav-btn inline-flex items-center justify-center gap-2 no-underline"><span aria-hidden="true">🔐</span><span class="section-nav-label">طلبات استعادة كلمة المرور</span><span id="sonaa-recovery-count" class="section-nav-count" aria-label="عدد طلبات استعادة كلمة المرور">!</span></a>':''}
              </div>
            </section>
          `).join('')}
        </div>
      </section>`:''}
      ${state.pageMode==='section'?`<div class="mt-3 premium-panel p-3 flex flex-col gap-2.5">
        <div class="relative">
          <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input value="${escHtml(state.search)}" oninput="onSearch(this.value)" placeholder="بحث شامل..." class="field !pr-10">
        </div>
        ${state.tab==='orders'?`
          <select onchange="onFilterOrder(this.value)" class="field"><option value="الكل">كل الحالات</option><option value="قيد المراجعة">قيد المراجعة</option><option value="تم النشر">تم النشر</option><option value="وصلتك عروض">وصلت عروض</option><option value="تم اختيار فني">تم اختيار فني</option><option value="تم الانتهاء">تم الانتهاء</option></select>
        `:state.tab==='fannis'||state.tab==='pending'||state.tab==='disabled'||state.tab==='levels'?`
          <select onchange="onFilter(this.value)" class="field"><option value="الكل">كل الحالات</option><option value="pending">قيد المراجعة</option><option value="approved">معتمد</option><option value="rejected">مرفوض</option><option value="disabled">معطل</option></select>
        `:''}
      </div>`:''}

      ${state.pageMode==='section'&&state.loading?`<div class="mt-4 premium-panel p-10 text-center"><div class="h-10 w-10 rounded-full border-[3px] border-slate-200 border-t-blue-600 animate-spin mx-auto"></div><p class="mt-3 text-[12px] font-black text-slate-500">جاري التحميل...</p></div>`:''}

      ${state.pageMode==='section'?`<div id="admin-tab-content" class="scroll-mt-24">
        ${renderCurrentTab()}
      </div>`:''}
    `}
  </main>
  <div onclick="closeAllMenus()" id="menu-backdrop" class="${Object.keys(state.dropdowns).length?'fixed inset-0 z-30 bg-black/5':''}"></div>
  `;
}

function renderCurrentTab(){
  if(!canReadTab(state.tab))return '<div class="premium-panel mt-4 p-5 text-center text-[12px] font-bold text-slate-600">هذا القسم غير متاح ضمن صلاحيات حسابك.</div>';
  switch(state.tab){
    case 'dashboard': return renderDashboard();
    case 'profileEdits': return renderFanniProfileEdits();
    case 'fannis': case 'pending': case 'disabled': return renderFannis();
    case 'levels': return renderLevels();
    case 'roles': return renderRoles();
    case 'orders': return renderOrders();
    case 'offers': return renderOffers();
    case 'pricing': return renderPricing();
    case 'wallets': return renderWallets();
    case 'topups': return renderTopups();
    case 'complaints': return renderComplaints();
    case 'services': return renderServices();
    case 'regions': return renderRegions();
    case 'notifications': return renderNotifications();
    case 'settings': return renderSettings();
    case 'security': return renderSecurity();
    case 'reports': return renderReports();
    case 'pageVisits': return renderPageVisits();
    case 'support': return renderSupport();
    case 'content': return renderContent();
    case 'clients': return renderClients();
    case 'stats': return renderStats();
    default: return renderFannis();
  }
}
