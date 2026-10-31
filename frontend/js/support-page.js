
'use strict';
const API_ROOT='/api/support';
const params=new URLSearchParams(location.search);
let role=params.get('role')||'';
if(!['client','fanni','admin'].includes(role)){
 if(localStorage.getItem('admin_token_v3'))role='admin';
 else if(localStorage.getItem('sonaa_client_account_token'))role='client';
 else if(localStorage.getItem('fanni_token_v4'))role='fanni';
}
const tokenKeys={client:'sonaa_client_account_token',fanni:'fanni_token_v4',admin:'admin_token_v3'};
const token=()=>{try{return localStorage.getItem(tokenKeys[role])||''}catch(_){return ''}};
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const dateLabel=v=>{if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleString('ar-EG',{dateStyle:'short',timeStyle:'short'})};
let cases=[],selected=null,busy=false,pollBusy=false;
const $=id=>document.getElementById(id);
async function request(path,options){
 let response;try{response=await fetch(API_ROOT+path,{method:options&&options.method||'GET',headers:{Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+token()},body:options&&options.body?JSON.stringify(options.body):undefined,cache:'no-store'});}catch(_){throw new Error('تعذر الاتصال. تحقق من الإنترنت وحاول مرة أخرى.')}
 let data={};try{data=await response.json()}catch(_){}
 if(!response.ok)throw new Error(response.status===404||response.status>=500?'تعذر تنفيذ طلبك حاليًا. حاول مرة أخرى.':(data.message||'تعذر تنفيذ الطلب.'));return data;
}
function showError(message){$('error-area').innerHTML=message?'<div class="error">'+esc(message)+'</div>':''}
function showNotice(message,success){$('notice-area').innerHTML=message?'<div class="'+(success?'success':'error')+'">'+esc(message)+'</div>':''}
function statusClass(status){return ['تم الحل','مغلقة'].includes(status)?'pill green':status==='بانتظار رد المستخدم'?'pill gray':'pill'}
function renderMessages(target,item,adminMode){
 const msgs=Array.isArray(item&&item.messages)?item.messages:[];
 $(target).innerHTML=msgs.length?msgs.map(m=>{
  const mine=adminMode?m.senderRole==='admin':m.senderRole===role;
  const sender=m.senderRole==='admin'?'دعم صُنّاع':m.senderRole==='assistant'?'المساعد الذكي':mine?'أنت':role==='fanni'?'الفني':'العميل';
  const removeButton=adminMode&&m._id?'<div style="display:flex;justify-content:flex-start;margin-top:10px"><button type="button" style="display:inline-flex!important;align-items:center;gap:6px;background:#b91c1c!important;color:#fff!important;border:1px solid #991b1b!important;border-radius:8px;padding:8px 12px;font-size:13px;font-weight:700;cursor:pointer;visibility:visible!important;opacity:1!important" onclick="deleteSupportMessage(&quot;'+esc(item._id)+'&quot;,&quot;'+esc(m._id)+'&quot;)">🗑 حذف الرسالة</button></div>':'';
  return '<article class="message '+(mine?'mine':adminMode?'admin':'')+'"><div class="meta">'+esc(sender)+' • '+esc(dateLabel(m.createdAt))+'</div><div class="body">'+esc(m.text)+'</div>'+removeButton+'</article>';
 }).join(''):'<p class="muted">لا توجد رسائل في هذه المحادثة.</p>';
}
async function deleteSupportMessage(caseId,messageId){
 if(role!=='admin'||busy)return;
 if(!confirm('متأكد إنك عايز تمسح الرسالة دي نهائيًا من محادثة الدعم عند العميل أو الفني؟'))return;
 busy=true;showError('');
 try{
  const data=await request('/admin/'+encodeURIComponent(caseId)+'/messages/'+encodeURIComponent(messageId),{method:'DELETE'});
  selected=data.supportCase||selected;
  cases=cases.map(item=>String(item._id)===String(caseId)?selected:item);
  showNotice(data.message||'تم حذف الرسالة.',true);
  renderAdmin();
 }catch(e){showError(e.message||'تعذر حذف الرسالة.')}finally{busy=false}
}
function renderOwner(){
 $('case-list').innerHTML=cases.length?cases.map(c=>'<button class="case '+(selected&&String(selected._id)===String(c._id)?'active':'')+'" data-case="'+esc(c._id)+'"><strong>'+esc(c.subject||'استفسار عام')+'</strong><small>'+esc(c.status||'جديدة')+(c.needsHuman?' • تحتاج تدخل الدعم':'')+' • '+esc(dateLabel(c.lastMessageAt||c.createdAt))+'</small></button>').join(''):'<p class="muted">لا توجد محادثات سابقة. ابدأ محادثة جديدة من الأعلى.</p>';
 document.querySelectorAll('[data-case]').forEach(btn=>btn.addEventListener('click',()=>openCase(btn.getAttribute('data-case'))));
 if(!selected){$('chat-title').textContent='اختار محادثة';$('chat-subtitle').textContent='هتظهر الرسائل هنا';$('case-status').textContent='—';$('messages').innerHTML='<p class="muted">افتح محادثة من القائمة أو ابدأ محادثة جديدة.</p>';$('reply-area').classList.add('hidden');$('closed-note').classList.add('hidden');return}
 $('chat-title').textContent=selected.subject||'محادثة الدعم';$('chat-subtitle').textContent='آخر تحديث: '+dateLabel(selected.lastMessageAt||selected.updatedAt);$('case-status').textContent=selected.status||'جديدة';$('case-status').className=statusClass(selected.status);
 renderMessages('messages',selected,false);
 const closed=['تم الحل','مغلقة'].includes(selected.status);$('reply-area').classList.toggle('hidden',closed);$('closed-note').classList.toggle('hidden',!closed);
}
function renderAdmin(){
 $('admin-case-list').innerHTML=cases.length?cases.map(c=>'<button class="case '+(selected&&String(selected._id)===String(c._id)?'active':'')+'" data-case="'+esc(c._id)+'"><strong>'+esc(c.subject||'استفسار عام')+' — '+esc(c.ownerName||'مستخدم')+'</strong><small>'+esc(c.ownerRole==='client'?'عميل':'فني')+' • '+esc(c.status||'جديدة')+(c.needsHuman?' • يحتاج تدخل':'')+' • '+esc(dateLabel(c.lastMessageAt||c.createdAt))+'</small></button>').join(''):'<p class="muted">لا توجد حالات مطابقة للفلتر.</p>';
 document.querySelectorAll('[data-case]').forEach(btn=>btn.addEventListener('click',()=>openCase(btn.getAttribute('data-case'))));
 if(!selected){$('admin-chat-title').textContent='اختار حالة';$('admin-chat-subtitle').textContent='';$('admin-case-status').textContent='—';$('admin-messages').innerHTML='<p class="muted">اختار حالة لعرض المحادثة.</p>';return}
 $('admin-chat-title').textContent=(selected.subject||'دعم')+' — '+(selected.ownerName||'مستخدم');$('admin-chat-subtitle').textContent=(selected.ownerRole==='client'?'عميل':'فني')+' • '+dateLabel(selected.lastMessageAt||selected.updatedAt);$('admin-case-status').textContent=selected.status||'جديدة';$('admin-case-status').className=statusClass(selected.status);
 renderMessages('admin-messages',selected,true);$('admin-status').value=selected.status||'جديدة';
}
async function loadCases(keepSelection){
 const path=role==='admin'?'/admin'+($('human-only').checked?'?needsHuman=true':'')+(role==='admin'&&$('admin-filter').value?($('human-only').checked?'&':'?')+'status='+encodeURIComponent($('admin-filter').value):''):'/'+role;
 const data=await request(path);cases=Array.isArray(data.supportCases)?data.supportCases:[];
 if(keepSelection&&selected){const fresh=cases.find(c=>String(c._id)===String(selected._id));if(fresh)selected=fresh;else selected=null;}
 if(role==='admin')renderAdmin();else renderOwner();
}
async function openCase(id){
 try{const data=await request('/'+role+'/'+encodeURIComponent(id));selected=data.supportCase||null;showError('');if(role==='admin')renderAdmin();else renderOwner()}catch(e){showError(e.message)}
}
async function createCase(){
 if(busy)return;const text=$('new-message').value.trim();if(!text){showError('اكتب رسالتك الأول.');return}
 busy=true;$('create-btn').disabled=true;showError('');
 try{const data=await request('/'+role,{method:'POST',body:{subject:$('subject').value.trim()||'استفسار عام',text}});selected=data.supportCase;cases=[selected,...cases.filter(c=>String(c._id)!==String(selected._id))];$('new-message').value='';$('subject').value='';showNotice('تم إرسال رسالتك بنجاح. يمكنك متابعة رد فريق الدعم من هنا.',true);renderOwner()}
 catch(e){showError(e.message)}finally{busy=false;$('create-btn').disabled=false}
}
async function sendOwnerMessage(needsHuman){
 if(busy||!selected)return;const text=$('reply-message').value.trim()||(needsHuman?'أحتاج تدخل موظف الدعم.':'');if(!text){showError('اكتب رسالتك الأول.');return}
 busy=true;$('send-btn').disabled=true;$('human-btn').disabled=true;showError('');
 try{const data=await request('/'+role+'/'+encodeURIComponent(selected._id)+'/messages',{method:'POST',body:{text,needsHuman:!!needsHuman}});selected=data.supportCase;cases=[selected,...cases.filter(c=>String(c._id)!==String(selected._id))];$('reply-message').value='';showNotice(needsHuman?'تم إرسال طلب تدخل الدعم.':'تم إرسال رسالتك.',true);renderOwner()}
 catch(e){showError(e.message)}finally{busy=false;$('send-btn').disabled=false;$('human-btn').disabled=false}
}
async function sendAdminReply(){
 if(busy||!selected)return;const text=$('admin-reply').value.trim();if(!text){showError('اكتب الرد الأول.');return}
 busy=true;$('admin-send').disabled=true;showError('');
 try{const data=await request('/admin/'+encodeURIComponent(selected._id)+'/reply',{method:'POST',body:{text}});selected=data.supportCase;cases=[selected,...cases.filter(c=>String(c._id)!==String(selected._id))];$('admin-reply').value='';showNotice('تم إرسال الرد وحفظه في المحادثة.',true);renderAdmin()}
 catch(e){showError(e.message)}finally{busy=false;$('admin-send').disabled=false}
}
async function saveStatus(){
 if(busy||!selected)return;busy=true;$('admin-save-status').disabled=true;showError('');
 try{const data=await request('/admin/'+encodeURIComponent(selected._id)+'/status',{method:'PATCH',body:{status:$('admin-status').value}});selected=data.supportCase;cases=[selected,...cases.filter(c=>String(c._id)!==String(selected._id))];showNotice(data.message||'تم تحديث الحالة.',true);await loadCases(true)}
 catch(e){showError(e.message)}finally{busy=false;$('admin-save-status').disabled=false}
}
async function refresh(){
 const active=document.activeElement;
 if(pollBusy||document.hidden||busy)return;
 pollBusy=true;
 try{
  await loadCases(true);
  if(selected){const data=await request('/'+role+'/'+encodeURIComponent(selected._id));selected=data.supportCase||selected;if(role==='admin')renderAdmin();else renderOwner();}
 }catch(e){if(!cases.length)showError(e.message)}finally{pollBusy=false}
}
function init(){
 const authenticated=!!token();
 $('back-btn').addEventListener('click',()=>{if(role==='fanni')location.href='fanni.html';else if(role==='admin')location.href='admin.html';else location.href='client.html'});
 $('login-link').href=role==='fanni'?'fanni.html':role==='admin'?'admin.html':'client.html';
 if(!['client','fanni','admin'].includes(role)||!authenticated){$('login-needed').classList.remove('hidden');return}
 if(role==='admin'){
  $('role-caption').textContent='إدارة محادثات العملاء والفنيين والرد عليهم';
  $('main').classList.add('hidden');$('admin-main').classList.remove('hidden');
  $('admin-refresh').addEventListener('click',()=>refresh());$('admin-send').addEventListener('click',sendAdminReply);$('admin-save-status').addEventListener('click',saveStatus);
  $('admin-filter').addEventListener('change',()=>loadCases(false).catch(e=>showError(e.message)));$('human-only').addEventListener('change',()=>loadCases(false).catch(e=>showError(e.message)));
 }else{
  $('role-caption').textContent=role==='client'?'دعم حساب العميل — محادثة خاصة داخل صُنّاع':'دعم الفني — محادثة خاصة داخل صُنّاع';
  $('main').classList.remove('hidden');$('create-btn').addEventListener('click',createCase);$('refresh-btn').addEventListener('click',()=>refresh());$('send-btn').addEventListener('click',()=>sendOwnerMessage(false));$('human-btn').addEventListener('click',()=>sendOwnerMessage(true));
 }
 loadCases(false).catch(e=>showError(e.message));
 setInterval(refresh,3000);
}
init();
