'use strict';
(()=> {
  const keys={client:'sonaa_client_account_token',fanni:'fanni_token_v4',admin:'admin_token_v3'};
  const bytes=s=>Uint8Array.from(atob((s+'='.repeat((4-s.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  let hiddenFor='', checkedFor='', checkingFor='';
  function pageRole(){
    const p=String(location.pathname||'').toLowerCase();
    if(/(^|[/_.-])admin([/_.-]|$)/.test(p))return 'admin';
    if(/(^|[/_.-])(fanni|technician)([/_.-]|$)/.test(p))return 'fanni';
    if(/(^|[/_.-])client([/_.-]|$)/.test(p))return 'client';
    return '';
  }
  function account(){
    const preferred=pageRole();
    if(preferred)try{const token=localStorage.getItem(keys[preferred]);if(token)return{role:preferred,token};}catch(_){}
    for(const role of ['client','fanni','admin'])try{
      const token=localStorage.getItem(keys[role]);
      if(token)return{role,token};
    }catch(_){}
    return null;
  }
  function accountKey(a){return a.role+':'+a.token;}
  function removeButton(key){
    const b=document.getElementById('sonaa-web-push-enable');
    if(b&&(!key||b._sonaaKey===key))b.remove();
  }
  function showButton(a,label){
    const key=accountKey(a);
    let b=document.getElementById('sonaa-web-push-enable');
    if(b&&b._sonaaKey!==key){b.remove();b=null;}
    if(!b){
      b=document.createElement('button');
      b.id='sonaa-web-push-enable';b._sonaaKey=key;b.type='button';
      b.style.cssText='position:fixed;z-index:9999;top:12px;left:12px;max-width:calc(100vw - 24px);padding:9px 13px;border:1px solid #bfdbfe;border-radius:12px;background:#fff;color:#12305b;font:700 12px system-ui;box-shadow:0 4px 16px #0b1b3a22';
      b.onclick=()=>enable(b,a);
      document.body.appendChild(b);
    }
    b.textContent=label||'🔔 تفعيل إشعارات المتصفح';
    b.disabled=false;
  }
  async function saveSubscription(a,s){
    const r=await fetch('/api/notifications/'+a.role+'/web-subscription',{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+a.token},
      body:JSON.stringify({subscription:s.toJSON()})
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(d.message||'تعذر تسجيل المتصفح.');
  }
  async function existingSubscription(a){
    const key=accountKey(a);
    if(checkedFor===key||checkingFor===key||!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window)||Notification.permission!=='granted')return;
    checkingFor=key;
    let saved=false;
    try{
      const reg=await navigator.serviceWorker.register('/service-worker.js',{scope:'/'});
      const s=await reg.pushManager.getSubscription();
      if(s&&accountKey(account()||{role:'',token:''})===key){
        await saveSubscription(a,s);
        saved=true;hiddenFor=key;removeButton(key);
      }else if(!s&&accountKey(account()||{role:'',token:''})===key){
        showButton(a,'🔔 استكمال تفعيل إشعارات المتصفح');
        checkedFor=key;
      }
    }catch(_){
      if(accountKey(account()||{role:'',token:''})===key){showButton(a,'🔔 إعادة تفعيل إشعارات المتصفح');checkedFor=key;}
    }finally{
      if(saved)checkedFor=key;
      checkingFor='';
    }
  }
  async function enable(b,a){
    if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window)){alert('المتصفح لا يدعم إشعارات الويب. جرّب Chrome على أندرويد.');return;}
    if(!isSecureContext){alert('إشعارات المتصفح تحتاج HTTPS.');return;}
    const old=b.textContent;
    b.disabled=true;b.textContent='جاري التفعيل…';
    try{
      let permission=Notification.permission;
      if(permission!=='granted')permission=await Notification.requestPermission();
      if(permission!=='granted')throw Error('لم يتم السماح بإشعارات المتصفح.');
      const kr=await fetch('/api/notifications/web-push-public-key',{cache:'no-store'}),kd=await kr.json().catch(()=>({}));
      if(!kr.ok||!kd.publicKey)throw Error(kd.message||'خدمة إشعارات المتصفح غير متاحة حاليًا. حاول مرة أخرى لاحقًا.');
      const reg=await navigator.serviceWorker.register('/service-worker.js',{scope:'/'});
      await navigator.serviceWorker.ready;
      let s=await reg.pushManager.getSubscription();
      if(!s)s=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(kd.publicKey)});
      await saveSubscription(a,s);
      hiddenFor=accountKey(a);checkedFor=hiddenFor;removeButton(hiddenFor);
    }catch(e){checkedFor=accountKey(a);alert(e.message||'تعذر التفعيل.');b.textContent=old;b.disabled=false;}
  }
  function mount(a){
    const b=document.getElementById('sonaa-web-push-enable');
    if(!a){if(b)b.remove();return;}
    const key=accountKey(a);
    if(b&&b._sonaaKey!==key){b.remove();}
    if(hiddenFor===key){removeButton(key);return;}
    if('Notification'in window&&Notification.permission==='granted'){
      void existingSubscription(a);
      if(checkedFor!==key&&!checkingFor)showButton(a,'🔔 جارٍ فحص إشعارات المتصفح…');
      return;
    }
    showButton(a,'🔔 تفعيل إشعارات المتصفح');
  }
  function refresh(){mount(account());}
  // CON uses native Expo notifications; keep the browser permission banner out of its WebView.
  if(window.__SONAA_CON_APP__){removeButton();return;}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh);else refresh();
  setInterval(refresh,2500);
})();