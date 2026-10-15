const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const DB = { orders: [{sn:'SN-1001',clientName:'احمد',clientPhone:'01012345678',service:'دش',city:'شبرا',status:'pending',createdAt:new Date()}], fannis: [] };
let counter = 1002;

// ===== 3 APIs =====
app.get('/api/orders', (req,res)=> res.json(DB.orders));
app.post('/api/orders', (req,res)=>{ const o={_id:Date.now()+'',sn:`SN-${counter++}`,...req.body,status:'pending',createdAt:new Date()}; DB.orders.push(o); res.json({order:o}); });
app.get('/api/fanni', (req,res)=> res.json(DB.fannis));
app.post('/api/fanni/register', (req,res)=>{ const f={_id:Date.now()+'',...req.body}; DB.fannis.push(f); res.json({fanni:f}); });

// ===== CLIENT UI - ديزاين فخم =====
app.get('/', (req,res)=> res.send(`
<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"></script><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@700;800&display=swap" rel="stylesheet"><style>*{font-family:Cairo}</style></head>
<body class="bg-[#0a0a0a] text-white min-h-screen">
<div class="max-w-md mx-auto p-4">
<div class="bg-gradient-to-br from-orange-500 to-red-600 rounded-[24px] p-6 mb-4"><h1 class="text-3xl font-black">صنعة</h1><p class="opacity-80">فني دش وكاميرات في شبرا - يوصلك في 30 دقيقة</p></div>
<div class="bg-[#1a1a1a] rounded-[20px] p-5 border border-white/10">
<input id="n" placeholder="اسمك" class="w-full bg-black border border-white/10 rounded-xl p-4 mb-3 text-white">
<input id="p" placeholder="رقمك 010..." class="w-full bg-black border border-white/10 rounded-xl p-4 mb-3 text-white">
<select id="s" class="w-full bg-black border border-white/10 rounded-xl p-4 mb-3 text-white"><option>تركيب دش</option><option>صيانة دش</option><option>تركيب كاميرات</option><option>صيانة كاميرات</option></select>
<input id="c" value="شبرا الخيمة" class="w-full bg-black border border-white/10 rounded-xl p-4 mb-3 text-white">
<button onclick="send()" class="w-full bg-white text-black rounded-xl p-4 font-black text-lg">اطلب فني الآن - مجاناً</button>
<div id="r" class="mt-3"></div>
</div>
<div class="flex gap-2 mt-4"><a href="/fanni" class="flex-1 bg-[#1a1a1a] border border-white/10 rounded-xl p-3 text-center">🔧 دخول فني</a><a href="/admin" class="flex-1 bg-[#1a1a1a] border border-white/10 rounded-xl p-3 text-center">👑 لوحة ادمن</a></div>
</div>
<script>async function send(){if(!n.value||!p.value)return alert('اكتب بياناتك');const res=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientName:n.value,clientPhone:p.value,service:s.value,city:c.value})});const j=await res.json();r.innerHTML='<div class="bg-green-500/20 border border-green-500 rounded-xl p-4 text-center">✅ رقم طلبك <b>'+j.order.sn+'</b><br>هنكلمك حالا</div>';}</script>
</body></html>
`));

// ===== FANNI UI =====
app.get('/fanni', (req,res)=> res.send(`
<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-slate-900 text-white p-4"><div class="max-w-md mx-auto">
<h1 class="text-2xl font-black mb-4">🔧 بوابة الفني</h1>
<div class="bg-slate-800 rounded-2xl p-4 mb-4"><input id="fn" placeholder="اسمك" class="w-full bg-black rounded-xl p-3 mb-2"><input id="fp" placeholder="رقمك" class="w-full bg-black rounded-xl p-3 mb-2"><button onclick="reg()" class="w-full bg-orange-500 rounded-xl p-3 font-bold">سجل كفني</button></div>
<h2 class="font-bold mb-2">الطلبات المتاحة</h2><button onclick="load()" class="bg-white text-black rounded-xl px-4 py-2 mb-2">تحديث</button><div id="list"></div>
<a href="/" class="block text-center mt-4 opacity-60">← رجوع للعميل</a>
</div>
<script>async function reg(){const r=await fetch('/api/fanni/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:fn.value,phone:fp.value})});alert('تم');load();}async function load(){const r=await fetch('/api/orders');const d=await r.json();list.innerHTML=d.reverse().map(o=>'<div class="bg-slate-800 rounded-xl p-3 mb-2"><b>'+o.sn+'</b> - '+o.clientName+'<br>'+o.service+' - '+o.city+'<br>'+o.clientPhone+'</div>').join('');}load();</script>
</body></html>
`));

// ===== ADMIN UI - الداشبورد الحقيقي =====
app.get('/admin', (req,res)=> res.send(`
<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-[#f5f5f0] text-black p-4"><div class="max-w-4xl mx-auto">
<h1 class="text-3xl font-black">👑 لوحة تحكم صنعة - Admin</h1><p class="opacity-60 mb-4">ده الشغل اللي من الصبح - كل الطلبات والفنيين</p>
<div class="grid grid-cols-2 gap-3 mb-4"><div class="bg-black text-white rounded-2xl p-4"><div class="text-2xl font-black" id="count">0</div><div>إجمالي الطلبات</div></div><div class="bg-orange-500 text-white rounded-2xl p-4"><div class="text-2xl font-black">شبرا</div><div>المنطقة النشطة</div></div></div>
<button onclick="load()" class="bg-black text-white rounded-xl px-6 py-3 font-bold mb-4">تحديث البيانات</button>
<div id="orders" class="space-y-2"></div>
<div id="fannis" class="mt-6"></div>
<a href="/" class="block mt-6 bg-white border rounded-xl p-3 text-center">← واجهة العميل</a>
</div>
<script>async function load(){const o=await (await fetch('/api/orders')).json();const f=await (await fetch('/api/fanni')).json();count.innerText=o.length;orders.innerHTML='<h2 class=\\"font-black text-xl mb-2\\">الطلبات ('+o.length+')</h2>'+o.reverse().map(x=>'<div class=\\"bg-white rounded-xl p-4 border\\"><div class=\\"flex justify-between\\"><b>'+x.sn+'</b><span class=\\"bg-black text-white px-2 rounded-full text-xs\\">'+x.status+'</span></div>👤 '+x.clientName+' - '+x.clientPhone+'<br>🔧 '+x.service+' - '+x.city+'<br><small>'+new Date(x.createdAt).toLocaleString('ar-EG')+'</small></div>').join('');fannis.innerHTML='<h2 class=\\"font-black text-xl mb-2 mt-4\\">الفنيين ('+f.length+')</h2>'+(f.length?f.map(x=>'<div class=\\"bg-white rounded-xl p-3 border\\">🔧 '+x.name+' - '+x.phone+'</div>').join(''):'<div class=\\"opacity-50\\">مفيش فنيين مسجلين</div>');}load();</script>
</body></html>
`));

app.listen(3000, ()=> console.log('✓ http://localhost:3000 (عميل) | /fanni (فني) | /admin (ادمن)'));
