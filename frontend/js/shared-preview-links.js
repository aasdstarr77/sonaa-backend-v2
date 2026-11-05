(function fixPreviewLinks(){
  const params=new URLSearchParams(window.location.search);
  if(!params.has('preview'))return;
  const aliases={
    'client':{file:'client.html',section:'new'},'fanni':{file:'fanni.html',section:'login'},
    'client-register.html':{file:'client.html',section:'register'},
    'register.html':{file:location.pathname.endsWith('/fanni.html')?'fanni.html':'client.html',section:'register'},
    'client-login.html':{file:'client.html',section:'login'},
    'client-dashboard.html':{file:'client.html',section:'login'},
    'client-orders.html':{file:'client.html',section:'orders'},
    'my-orders.html':{file:'client.html',section:'orders'},
    'new-order.html':{file:'client.html',section:'new'},
    'new-order-form.html':{file:'client.html',section:'new'},
    'complaint.html':{file:'client.html',section:'complaint'},
    'complaints.html':{file:'client.html',section:'complaint'},
    'profile.html':{file:'client.html',section:'profile'},
    'client-profile.html':{file:'client.html',section:'profile'},
    'fanni-login.html':{file:'fanni.html',section:'login'},
    'fanni-dashboard.html':{file:'fanni.html',section:'login'},
    'fanni-orders.html':{file:'fanni.html',section:'myOffers'}
  };
  document.addEventListener('click',function(e){
    const link=e.target.closest('a');if(!link)return;
    const href=link.getAttribute('href');
    if(!href||href.startsWith('#')||/^(https?:|javascript:|mailto:|tel:|data:)/i.test(href))return;
    e.preventDefault();
    let target;try{target=new URL(href,window.location.href)}catch(_){return}
    const base=decodeURIComponent(target.pathname.split('/').pop()||'');
    const alias=aliases[base];
    if(alias){target=new URL('/frontend/'+alias.file,window.location.origin);target.searchParams.set('section',alias.section);}
    target.searchParams.set('preview','true');target.searchParams.set('t',String(Date.now()));
    console.log('Preview navigating to:',target.pathname+target.search);
    window.location.href=target.pathname+target.search+target.hash;
  },true);
  document.querySelectorAll('form').forEach(function(form){form.addEventListener('submit',function(e){e.preventDefault();alert('في وضع المعاينة، إرسال النماذج معطل');});});
})();
