/* Extracted page functions; classic-script globals are preserved. */
'use strict';

function setTab(tab){state.tab=tab;render();}

function toggleService(){
  if(state.servicesLoading){if(state.servicesError)loadServices();return;}
  if(state.servicesError){loadServices();return;}
  state.showService=!state.showService;
  if(state.showService){state.searchService='';state.openCategory=getCat(state.service)?.label||'';}
  render();
}

function handleOutsideServiceClick(event){
  if(!state.showService)return;
  const target=event.target;
  if(!(target instanceof Element))return;
  if(target.closest('button[onclick="toggleService()"]'))return;
  if(target.closest('#servicePanel'))return;
  const pageY=window.scrollY||window.pageYOffset||0;
  state.showService=false;state.openCategory='';state.searchService='';
  render();
  window.scrollTo({top:pageY,left:0,behavior:'instant'});
}

function toggleCategory(label){
  const opening=Boolean(label)&&state.openCategory!==label;
  state.openCategory=opening?label:'';
  render();
  if(!opening)return;
  requestAnimationFrame(()=>{
    const panel=document.getElementById('servicePanel');
    const list=document.getElementById('serviceList');
    const details=document.getElementById('selectedCategoryDetails');
    if(!panel||!list||!details)return;
    // Show the first row of detailed choices, not the bottom of the page.
    panel.scrollTop=0;
    list.scrollTop=0;
    const firstChoice=details.querySelector('.service-choice');
    if(firstChoice){
      const listRect=list.getBoundingClientRect();
      const choiceRect=firstChoice.getBoundingClientRect();
      list.scrollTo({top:Math.max(0,list.scrollTop+choiceRect.top-listRect.top-8),behavior:'smooth'});
    }
  });
}

function searchService(value){
  const input=document.getElementById('svcSearch');
  const pos=input?input.selectionStart:null;
  const position=captureScrollPosition();
  state.searchService=sanitizeInput(value,80);
  render();
  const nextInput=document.getElementById('svcSearch');
  const nextList=document.getElementById('serviceList');
  if(nextInput){
    try{nextInput.focus({preventScroll:true});}catch(error){nextInput.focus();}
    if(pos!==null){
      try{const cursor=Math.min(pos,nextInput.value.length);nextInput.setSelectionRange(cursor,cursor);}catch(error){}
    }
  }
  if(nextList)nextList.scrollTop=position.listTop;
  window.scrollTo({top:position.pageY,left:0,behavior:'instant'});
}

function selectService(serviceName){
  const clean=String(serviceName||'').trim();
  if(!clean||!ALL_SERVICES.includes(clean)){showToast('الخدمة غير موجودة في القائمة الرسمية.');return;}
  state.service=clean;state.showService=false;state.searchService='';state.openCategory='';render();
  requestAnimationFrame(()=>{
    const pickerButton=document.querySelector('button[onclick="toggleService()"]');
    if(pickerButton){
      const rect=pickerButton.getBoundingClientRect();
      const desiredTop=window.scrollY+rect.top-(window.innerHeight*0.32);
      window.scrollTo({top:Math.max(0,desiredTop),left:0,behavior:'smooth'});
      setTimeout(()=>{try{pickerButton.focus({preventScroll:true});}catch(error){}},180);
    }
  });
}

function selectServiceByIndex(index){
  const service=ALL_SERVICES[index];
  if(!service)return selectService(service);
  return selectService(service);
}

async function loadServices(){
  if(state.servicesLoading&&state.servicesLoaded)return;
  state.servicesLoading=true;state.servicesError='';render();
  try{
    const data=await API.getServices();
    CATEGORIES=data.categories;ALL_SERVICES=data.services;
    const flat=[...new Set(CATEGORIES.flatMap(c=>c.services))];
    if(flat.length!==ALL_SERVICES.length){ALL_SERVICES=[...new Set(ALL_SERVICES)];}
    state.servicesLoading=false;state.servicesError='';state.servicesLoaded=true;
    if(state.service&&!ALL_SERVICES.includes(state.service)){state.service='';}
    render();
    log('تم تحميل الخدمات من API:',CATEGORIES.length+' قسم, '+ALL_SERVICES.length+' خدمة');
  }catch(error){
    state.servicesLoading=false;state.servicesError=error.message||'تعذر تحميل الخدمات';state.servicesLoaded=false;CATEGORIES=[];ALL_SERVICES=[];
    render();showToast(state.servicesError);log('فشل تحميل الخدمات:',error);
  }
}
