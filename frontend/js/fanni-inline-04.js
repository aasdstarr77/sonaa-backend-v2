/* Enter-key support only for flows that did not already have it. */
(function(){
 if(window.__sonaaFanniEnterSupport)return;
 window.__sonaaFanniEnterSupport=true;
 document.addEventListener('keydown',function(event){
  if(event.key!=='Enter'||event.shiftKey||event.defaultPrevented)return;
  var target=event.target;
  if(!target||target.isContentEditable)return;
  var loginPanel=target.closest('.fanni-login-panel');
  if(loginPanel&&target.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"])')){
   event.preventDefault();
   var fields=Array.from(loginPanel.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not(:disabled)')).filter(function(el){return el.getClientRects().length>0});
   var index=fields.indexOf(target);
   if(index>=0&&index<fields.length-1){fields[index+1].focus();return;}
   if(state.tab==='register')doRegister();else doLogin();
   return;
  }
  if(target.id==='fanniEditPhone'){event.preventDefault();document.getElementById('fanniEditAreas')?.focus();return;}
  if(target.id==='fanniEditAreas'){event.preventDefault();saveProfileChanges();return;}
  if(target.id==='fanniOfferPrice'){event.preventDefault();document.getElementById('fanniOfferMessage')?.focus();return;}
  if(target.id==='fanniOfferMessage'){event.preventDefault();submitOffer();return;}
 });
})();