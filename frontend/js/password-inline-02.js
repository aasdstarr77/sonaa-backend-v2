/* Enter-key support for recovery chat controls outside forms. */
(function(){
 document.addEventListener('keydown',function(event){
  if(event.key!=='Enter'||event.shiftKey||event.defaultPrevented)return;
  var el=event.target;
  if(!el||el.isContentEditable)return;
  if(el.id==='messageText'){event.preventDefault();document.getElementById('sendMessage')?.click();return;}
  if(el.id==='adminReply'){event.preventDefault();document.getElementById('sendAdminReply')?.click();return;}
  if(el.id==='recoveryCode'){event.preventDefault();document.getElementById('verifyCode')?.click();return;}
  if(el.id==='newPassword'){event.preventDefault();document.getElementById('confirmPassword')?.focus();return;}
  if(el.id==='confirmPassword'){event.preventDefault();document.getElementById('resetPassword')?.click();return;}
 });
})();