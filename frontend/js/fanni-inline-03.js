(function(){
  let observedHeader=null;
  let headerResizeObserver=null;
  function syncStickyTabs(){
    const header=document.querySelector('#app .app-header');
    if(!header)return;
    if(header!==observedHeader){
      observedHeader=header;
      if(headerResizeObserver)headerResizeObserver.disconnect();
      if('ResizeObserver' in window){
        headerResizeObserver=new ResizeObserver(syncStickyTabs);
        headerResizeObserver.observe(header);
      }
    }
    const height=Math.ceil(header.getBoundingClientRect().height);
    if(!height)return;
    document.documentElement.style.setProperty('--sonaa-sticky-header-height',height+'px');
    document.querySelectorAll('.client-section-tabs,.fanni-dashboard-tabs').forEach(function(tabs){
      tabs.style.top=height+'px';
      tabs.style.zIndex='30';
    });
  }
  const app=document.getElementById('app');
  if(app)new MutationObserver(syncStickyTabs).observe(app,{childList:true,subtree:true});
  window.addEventListener('resize',syncStickyTabs,{passive:true});
  syncStickyTabs();
})();