/* Extracted page functions; classic-script globals are preserved. */
'use strict';

function escHtml(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

function getToken(){if(window.IS_EDITOR_PREVIEW)return '';try{return localStorage.getItem(TOKEN_KEY)||''}catch{return ''}}

function currentAdminRoleLabel(){return String(state.currentAdminRoleLabel||'').trim();}

function canReadVoiceReview(){return currentAdminRoleLabel()==='أدمن رئيسي'||state.currentAdminPermissions?.voiceReview?.read===true;}

function canWriteVoiceReview(){return currentAdminRoleLabel()==='أدمن رئيسي'||state.currentAdminPermissions?.voiceReview?.write===true;}

function canPublishOrders(){const role=currentAdminRoleLabel();return role==='أدمن رئيسي'||state.currentAdminPermissions?.publishOrders?.write===true;}

function canAssignOrders(){return isRootAdminUI();}

function toggleOrderSelection(sn,checked){sn=String(sn||'').trim().toUpperCase();if(!/^SN\d{6}$/.test(sn))return;const selected=new Set(state.selectedOrderSNs||[]);if(checked)selected.add(sn);else selected.delete(sn);state.selectedOrderSNs=Array.from(selected);render();}

function toggleAllVisibleOrders(checked){const selected=new Set(state.selectedOrderSNs||[]);for(const order of (state.filteredOrders||[])){const sn=String(order.sn||'').trim().toUpperCase();if(!/^SN\d{6}$/.test(sn))continue;if(checked)selected.add(sn);else selected.delete(sn);}state.selectedOrderSNs=Array.from(selected);render();}

async function bulkPublishOrders(){if(!canPublishOrders())return showToast('نشر الطلبات متاح للمدير أو الأدمن الرئيسي فقط','error');const sns=Array.from(new Set((state.selectedOrderSNs||[]).map(x=>String(x||'').trim().toUpperCase()).filter(x=>/^SN\d{6}$/.test(x))));if(!sns.length)return showToast('حدد طلبات قيد المراجعة أولًا','error');if(sns.length>100)return showToast('حدد 100 طلب كحد أقصى','error');const eligible=sns.filter(sn=>state.orders.some(o=>String(o.sn||'').toUpperCase()===sn&&o.status==='قيد المراجعة'));if(!eligible.length)return showToast('لا توجد طلبات محددة قابلة للنشر','error');if(!confirm('تأكيد نشر '+eligible.length+' طلبًا للفنيين؟'))return;let ok=0,failed=0;for(const sn of eligible){try{await tryApi(['/api/orders/admin/'+encodeURIComponent(sn)+'/publish'],{method:'POST',body:JSON.stringify({})});ok++;}catch(_){failed++;}}state.selectedOrderSNs=[];showToast('تم نشر '+ok+' طلب — تعذر '+failed,failed?'error':'success');await loadOrders();}

async function bulkDeleteOrders(){const sns=Array.from(new Set((state.selectedOrderSNs||[]).map(x=>String(x||'').trim().toUpperCase()).filter(x=>/^SN\d{6}$/.test(x))));if(!sns.length)return showToast('حدد طلبًا واحدًا على الأقل','error');if(sns.length>100)return showToast('حدد 100 طلب كحد أقصى في المرة الواحدة','error');if(!confirm('تأكيد محاولة حذف '+sns.length+' طلبًا؟ الطلبات النشطة أو المرتبطة بعروض أو فنيين أو حركات مالية سيتم حمايتها تلقائيًا.'))return;try{const result=await tryApi(['/api/admin/orders/bulk-delete'],{method:'POST',body:JSON.stringify({sns})});const deleted=new Set(result.deletedSns||[]);state.selectedOrderSNs=state.selectedOrderSNs.filter(sn=>!deleted.has(sn));showToast(result.message||'انتهت العملية',deleted.size?'success':'warning');await loadOrders();}catch(e){showToast(e.message||'تعذر تنفيذ الحذف الجماعي','error');}}

function setToken(t){if(window.IS_EDITOR_PREVIEW)return;try{localStorage.setItem(TOKEN_KEY,t);localStorage.setItem('admin_token',t);localStorage.setItem('token',t);localStorage.setItem('auth_token',t)}catch{throw new Error('تعذر حفظ جلسة الدخول')}}

function clearToken(){try{for(const key of [TOKEN_KEY,'admin_token','token','auth_token'])localStorage.removeItem(key)}catch{}}

function buildUrl(p){const path=p.startsWith('/api')?p:'/api/'+p.replace(/^\/+/,''); if(location.hostname.includes('sonaa-backend-v2')&&location.hostname.endsWith('vercel.app')){return path;} return BASE_URL+path;}

async function api(path,opts={}){const token=getToken(); const headers={...(opts.headers||{})}; if(opts.body&&!headers['Content-Type']){headers['Content-Type']='application/json';} if(token)headers['Authorization']='Bearer '+token; try{const r=await fetch(buildUrl(path),{...opts,headers,mode:'cors',credentials:'omit'}); const txt=await r.text(); if(txt.trim().startsWith('<!DOCTYPE')||txt.includes('Cannot ')){return {ok:false,status:404,data:{message:'المسار غير موجود: '+path}};} let data; try{data=txt?JSON.parse(txt):{}}catch{data={raw:txt.slice(0,500),message:txt.slice(0,200)||'استجابة غير مفهومة'};} if(!r.ok&&!data.message)data.message='فشل الطلب (HTTP '+r.status+')'; return {ok:r.ok,status:r.status,data};}catch(e){return {ok:false,status:0,data:{message:e.message||'تعذر الاتصال'}};}}

async function tryApi(paths,opts={}){const method=String(opts.method||'GET').toUpperCase();const firstPath=Array.isArray(paths)?paths[0]:paths;const isReadLikeReport=method==='POST'&&String(firstPath||'').split('?')[0].startsWith('/api/admin/reports');if(!['GET','HEAD','OPTIONS'].includes(method)&&!isReadLikeReport&&currentAdminRoleLabel()&&!isRootAdminUI()){const key=permissionKeyForApiPath(firstPath);if(key==='__root')throw new Error('الإجراء متاح للمدير العام فقط');if(key&&state.currentAdminPermissions?.[key]?.write!==true)throw new Error('لا تملك صلاحية التنفيذ في هذا القسم');}let last={status:404,data:{message:'فشل الاتصال'}}; for(const p of paths){const res=await api(p,opts); if(res.ok)return res.data; last=res; if([400,401,403].includes(res.status))break;} const error=new Error(last.data?.message||'حدث خطأ'); error.status=last.status; throw error;}

function extractList(data,keys=[]){if(Array.isArray(data))return data; for(const key of keys){if(Array.isArray(data?.[key]))return data[key];} if(Array.isArray(data?.data))return data.data; return [];}

function normalizePhoneInput(value){return String(value??'').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[\s\-().]/g,'').replace(/^(\+?20)/,'0');}

function getPendingTechnicianCount(){return state.fannis.filter(f=>!f.isApproved&&!f.isDisabled&&!['rejected','مرفوض'].includes(String(f.status||''))).length;}

function getPendingOrderCount(){return state.orders.filter(o=>['قيد المراجعة','pending','مراجعة','بانتظار المراجعة'].includes(String(o.status||''))).length;}

function getPendingTopupCount(){return state.topups.filter(t=>['pending','قيد المراجعة','جديد','جديدة'].includes(String(t.status||''))).length;}

function getPendingComplaintCount(){return state.complaints.filter(c=>['جديدة','pending','open','قيد المراجعة'].includes(String(c.status||''))).length;}

function getPendingRecoveryCount(){return (state.recoveryRequests||[]).filter(item=>['بانتظار الدعم','قيد التحقق','جديدة','pending'].includes(String(item.status||''))).length;}

function getAdminSectionCountById(id){if(id==='dashboard')return getPendingTechnicianCount()+state.pendingProfileEdits.length+getPendingOrderCount()+getPendingTopupCount()+getPendingComplaintCount()+getPendingRecoveryCount();return 0;}

function renderSectionCount(item){
  if(typeof item.count!=='function')return '';
  const count=Math.max(0,Number(item.count())||0);
  return '<span class="section-nav-count'+(count>0?' has-pending':'')+'" aria-label="عدد الحالات التي تحتاج تدخل">'+escHtml(String(count))+'</span>';
}

function getAdminSectionCount(section){if(!section)return 0;if(section.id==='dashboard')return getAdminSectionCountById('dashboard');if(section.id==='clients')return getPendingOrderCount();if(section.id==='technicians')return getPendingTechnicianCount()+state.pendingProfileEdits.length+getPendingTopupCount();if(section.id==='customer-operations')return getPendingComplaintCount()+getPendingRecoveryCount();return 0;}

function isRootAdminUI(){return currentAdminRoleLabel()==='أدمن رئيسي';}

function permissionKeyForTab(tab){if(['dashboard','stats','reports','pageVisits'].includes(tab))return 'dashboard';if(['fannis','pending','profileEdits','disabled','levels'].includes(tab))return 'fannis';if(tab==='orders')return 'orders';if(tab==='offers')return 'offers';if(tab==='wallets')return 'wallet';if(tab==='topups')return 'topups';if(tab==='clients')return 'clients';if(tab==='pricing')return 'pricing';if(tab==='settings')return 'settings';if(tab==='services')return 'services';if(tab==='regions')return 'regions';if(tab==='complaints')return 'complaints';if(tab==='support')return 'support';if(tab==='notifications')return 'notifications';if(tab==='content')return 'content';return null;}

function canReadTab(tab){if(!currentAdminRoleLabel())return true;if(isRootAdminUI())return true;if(tab==='roles'||tab==='security')return false;const key=permissionKeyForTab(tab);return key?state.currentAdminPermissions?.[key]?.read===true:false;}

function canWriteTab(tab){if(!currentAdminRoleLabel()||isRootAdminUI())return true;const key=permissionKeyForTab(tab);return key?state.currentAdminPermissions?.[key]?.write===true:false;}

function applyAdminPermissionGuards(){const root=document.getElementById('admin-tab-content');if(!root)return;const writeActions=['confirmPending','runBulkAction','bulkDeleteOrders','bulkPublishOrders','approveFanni','rejectFanni','disableFanni','enableFanni','deleteFanni','approveTopup','rejectTopup','assignOrder','setBalance','addBalance','adjustWallet','saveFanniNote','saveFanniLimit','saveFanniProfileControls','updateFanniLevel','toggleTrustBadge','freezeWallet','saveOrderCorrection','publishOrder','cancelOrder','archiveOrder','deleteOrder','removeOffer','rejectOffer','deleteClient','deleteRegisteredClient','blockClient','unblockClient','noteClient','saveComplaint','markSupportReview','addService','editService','deleteService','hideService','showService','moveService','toggleServiceCat','addRegion','editRegion','toggleRegion','deleteRegion','sendNotification','deleteNotificationCampaign','saveContent','addFaq','removeFaq','savePricing','saveSettings','createAdminUser','changeAdminRole','revokeAdminRole','saveAdminPermissions'];root.querySelectorAll('button[onclick]').forEach(button=>{const handler=button.getAttribute('onclick')||'';const mutating=writeActions.some(name=>handler.includes(name+'('));const pendingMatch=handler.match(/confirmPending\('([^']+)'\)/);const pending=pendingMatch?state.pendingActions[pendingMatch[1]]:null;const actionMatch=handler.match(/setPendingAction\('([^']+)','([^']+)'/);const requestedAction=actionMatch?actionMatch[2]:'';const publishConfirmationAllowed=state.tab==='orders'&&pending?.action==='publish'&&canPublishOrders();const publishOnly=handler.includes('bulkPublishOrders(')||requestedAction==='publish';const rootOnly=(handler.includes('assignOrder(')||requestedAction==='assign')&&!canAssignOrders();const pendingWriteBlocked=Boolean(requestedAction&&requestedAction!=='publish'&&requestedAction!=='assign'&&!canWriteTab(state.tab));if((mutating&&!canWriteTab(state.tab)&&!publishConfirmationAllowed)||(publishOnly&&!canPublishOrders())||rootOnly||pendingWriteBlocked){button.disabled=true;button.setAttribute('aria-disabled','true');button.title='لا تملك صلاحية تنفيذ هذا الإجراء';button.classList.add('opacity-50','cursor-not-allowed');}});}

function permissionKeyForApiPath(path){const clean=String(path||'').split('?')[0];if(clean.startsWith('/api/orders/admin/')&&clean.endsWith('/publish'))return 'publishOrders';if(clean.startsWith('/api/support/admin/')||clean.startsWith('/api/password-recovery/admin/requests'))return 'support';if(clean.startsWith('/api/admin/admin-users')||clean.startsWith('/api/admin/audit-logs'))return '__root';if(clean.startsWith('/api/admin/wallet/')||clean.endsWith('/set-balance')||clean.endsWith('/add-balance'))return 'wallet';const prefix='/api/admin/';if(!clean.startsWith(prefix))return null;const segment=clean.slice(prefix.length).split('/')[0];const map={me:'dashboard',counts:'dashboard',fannis:'fannis','fanni-profile-edits':'fannis',orders:'orders',offers:'offers',complaints:'complaints','topup-requests':'topups',clients:'clients','client-accounts':'clientsData',pricing:'pricing',settings:'settings',content:'content',support:'support',regions:'regions',notifications:'notifications',services:'services',reports:'dashboard'};return map[segment]||null;}

function getAdminSectionForTab(tab){return ADMIN_SECTIONS.find(section=>section.tabs.some(item=>item.id===tab&&canReadTab(tab)))?.id||ADMIN_SECTIONS.find(section=>section.tabs.some(item=>canReadTab(item.id)))?.id||'dashboard';}

function setSection(sectionId){const section=ADMIN_SECTIONS.find(item=>item.id===sectionId);if(!section)return;const item=section.tabs.find(tab=>canReadTab(tab.id));if(item)setTab(item.id,'subnav');}

function setClientStatusFilter(value){state.clientStatusFilter=['all','active','suspended'].includes(value)?value:'all';applyClientFilter();}

function goBack(){if(state.pageMode==='section'){state.pageMode='home';state.dropdowns={};state.pendingActions={};render();return;}window.location.href='/';}

function goFanni(){window.location.href='/fanni';}

function logout(){clearToken(); state.pageMode='home'; state.fannis=[]; state.filtered=[]; state.topups=[]; state.filteredTopups=[]; state.orders=[]; state.filteredOrders=[]; state.complaints=[]; state.filteredComplaints=[]; state.services=[]; state.filteredServices=[]; state.clients=[]; state.filteredClients=[]; state.servicesLoading=false; state.servicesError=''; state.openServices={}; state.dropdowns={}; state.pendingActions={}; state.errors={fannis:'',topups:'',orders:'',complaints:'',services:'',clients:''}; state.error=''; state.loading=false; state.loadingOrders=false; state.publishingOrders=[]; state.deletingItems=[]; state.adminEmail=''; state.adminPass=''; state.search=''; state.tab='dashboard'; render();}

function renderLogin(){
  const app=document.getElementById('app');
  app.innerHTML=`<div class="min-h-screen flex items-center justify-center p-4" style="background:#f1f5fb"><div class="premium-card p-7 w-full max-w-[360px]"><h2 class="font-black text-[16px] text-center mb-4">🔐 دخول الإدارة</h2><input id="login-phone" placeholder="الإيميل أو الهاتف" class="field mb-3" dir="ltr"><input id="login-pass" type="password" placeholder="كلمة المرور" class="field mb-2" dir="ltr"><p class="mb-4 text-left"><a class="text-xs font-bold text-blue-700" href="password.html?role=admin&mode=recovery">نسيت كلمة المرور؟</a></p><button onclick="doLogin()" id="login-btn" class="w-full h-12 rounded-full bg-slate-900 text-white font-black">دخول</button><p id="login-error" class="text-[11px] font-bold text-red-600 mt-3 text-center hidden"></p>${window.IS_EDITOR_PREVIEW?'<p class="mt-3 text-center text-[10px] text-slate-500">معاينة مستقلة — لن يتم تغيير جلسة الإدارة</p>':'<button onclick="localStorage.clear(); location.reload()" class="w-full mt-3 h-10 rounded-full bg-slate-100 text-[11px] font-black">مسح الجلسة</button>'}</div></div>`;
}

async function doLogin(){
  if(window.IS_EDITOR_PREVIEW){const err=document.getElementById('login-error');if(err){err.textContent='تسجيل الدخول غير متاح داخل معاينة المحرر.';err.classList.remove('hidden');}return;}
  const p=(document.getElementById('login-phone')?.value||'').trim();
  const pw=(document.getElementById('login-pass')?.value||'').trim();
  const err=document.getElementById('login-error');
  if(err) err.classList.add('hidden');
  if(!p||!pw){ if(err){err.textContent='اكتب البيانات'; err.classList.remove('hidden');} return; }
  const btn=document.getElementById('login-btn'); if(btn){btn.textContent='جاري...'; btn.disabled=true;}
  try{
    const payload={password:pw}; if(p.includes('@')) payload.email=p; else payload.phone=p;
    const res=await api('/api/admin/login',{method:'POST',body:JSON.stringify(payload)});
    if(res.ok && (res.data.token||res.data.data?.token)){ const adminToken=res.data.token||res.data.data.token; setToken(adminToken); localStorage.setItem('admin_token',adminToken); localStorage.setItem('token',adminToken); localStorage.setItem('auth_token',adminToken); console.log('Admin token saved'); render(); loadAll(); }
    else { if(err){err.textContent=res.data.message||'فشل الدخول'; err.classList.remove('hidden');} if(btn){btn.textContent='دخول'; btn.disabled=false;} }
  }catch(e){ if(err){err.textContent=e.message; err.classList.remove('hidden');} if(btn){btn.textContent='دخول'; btn.disabled=false;} }
}
