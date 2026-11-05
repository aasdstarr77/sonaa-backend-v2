'use strict';
const crypto=require('node:crypto');const Sub=require('../models/WebPushSubscription');
const enc=b=>Buffer.from(b).toString('base64url'),dec=s=>Buffer.from(String(s||''),'base64url');
function isAllowedPushEndpoint(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false;
    const host = url.hostname.toLowerCase();
    return host === 'fcm.googleapis.com'
      || host === 'updates.push.services.mozilla.com'
      || host === 'web.push.apple.com'
      || host.endsWith('.push.apple.com')
      || host === 'notify.windows.com'
      || host.endsWith('.notify.windows.com');
  } catch {
    return false;
  }
}

function extract(salt,ikm){return crypto.createHmac('sha256',salt).update(ikm).digest();}
function expand(prk,info,len){let prev=Buffer.alloc(0),out=Buffer.alloc(0),i=1;while(out.length<len){prev=crypto.createHmac('sha256',prk).update(Buffer.concat([prev,Buffer.from(info),Buffer.from([i++])])).digest();out=Buffer.concat([out,prev]);}return out.subarray(0,len);}
function getVapidKeys(){const pub=dec(process.env.VAPID_PUBLIC_KEY),priv=dec(process.env.VAPID_PRIVATE_KEY);return pub.length===65&&pub[0]===4&&priv.length===32?{pub,priv}:null;}
function jwt(endpoint,k){const u=new URL(endpoint),key=crypto.createPrivateKey({key:{kty:'EC',crv:'P-256',x:enc(k.pub.subarray(1,33)),y:enc(k.pub.subarray(33)),d:enc(k.priv)},format:'jwk'});const a=enc(Buffer.from(JSON.stringify({typ:'JWT',alg:'ES256'}))),b=enc(Buffer.from(JSON.stringify({aud:u.origin,exp:Math.floor(Date.now()/1000)+43200,sub:process.env.VAPID_SUBJECT||'mailto:admin@sonaa.app'}))),data=a+'.'+b;return data+'.'+enc(crypto.sign('sha256',Buffer.from(data),{key,dsaEncoding:'ieee-p1363'}));}
function encrypt(sub,payload){const ua=dec(sub.keys.p256dh),auth=dec(sub.keys.auth);if(ua.length!==65||ua[0]!==4||auth.length<16||auth.length>32)throw Error('Invalid Web Push keys');const e=crypto.createECDH('prime256v1');e.generateKeys();const as=e.getPublicKey(),shared=e.computeSecret(ua),ikm=expand(extract(auth,shared),Buffer.concat([Buffer.from('WebPush: info\0'),ua,as]),32),salt=crypto.randomBytes(16),prk=extract(salt,ikm),cek=expand(prk,'Content-Encoding: aes128gcm\0',16),nonce=expand(prk,'Content-Encoding: nonce\0',12),cipher=crypto.createCipheriv('aes-128-gcm',cek,nonce),data=Buffer.concat([cipher.update(Buffer.concat([Buffer.from(JSON.stringify(payload)),Buffer.from([2])])),cipher.final(),cipher.getAuthTag()]),head=Buffer.alloc(21);salt.copy(head);head.writeUInt32BE(4096,16);head[20]=as.length;return Buffer.concat([head,as,data]);}
async function sendOne(s,n,k){if(!isAllowedPushEndpoint(s.endpoint)){await Sub.deleteOne({_id:s._id}).catch(()=>{});return;}const body=encrypt(s,{title:String(n.title||'إشعار من صُنّاع').slice(0,100),body:String(n.message||'').slice(0,300),data:{url:String(n.link||'/').startsWith('/')?String(n.link||'/'):'/'}});const r=await fetch(s.endpoint,{method:'POST',redirect:'manual',headers:{TTL:'86400','Content-Type':'application/octet-stream','Content-Encoding':'aes128gcm',Authorization:'vapid t='+jwt(s.endpoint,k)+', k='+enc(k.pub)},body});if(r.status===404||r.status===410)await Sub.deleteOne({_id:s._id}).catch(()=>{});else if(!r.ok)console.error('Web Push endpoint rejected delivery:',r.status);}
async function sendWebPushNotification(n){try{const k=getVapidKeys();if(!k)return;const subs=await Sub.find({recipientRole:n.recipientRole,recipientId:n.recipientId}).limit(50).lean();await Promise.allSettled(subs.map(s=>sendOne(s,n,k)));}catch(e){console.error('Web Push delivery failed:',e.message);}}
module.exports={sendWebPushNotification,getVapidKeys,isAllowedPushEndpoint};