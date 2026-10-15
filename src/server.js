const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));

// فين مكان frontend
let fp = path.join(__dirname, '..', 'frontend');
if (!fs.existsSync(fp)) fp = path.join(__dirname, 'frontend');
if (!fs.existsSync(fp)) fp = path.join(__dirname, '..');
if (!fs.existsSync(fp)) fp = __dirname;
console.log('Frontend path:', fp);
app.use(express.static(fp));

// قاعدة بيانات في ملف عشان Vercel
const DB_FILE = path.join('/tmp', 'sonaa_db.json');
let DB = { orders: [], fannis: [], topups: [], admins: [], c: 1001 };

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(data);
      // دمج مع الافتراضي عشان لو ملفات قديمة
      DB.orders = parsed.orders || [];
      DB.fannis = parsed.fannis || [];
      DB.topups = parsed.topups || [];
      DB.admins = parsed.admins || [];
      DB.c = parsed.c || 1001;
    }
    // انشاء ادمن افتراضي لو مفيش
    if (DB.admins.length === 0) {
      DB.admins.push({
        _id: 'admin_default',
        email: 'admin@sonaa.com',
        phone: '01152822263',
        password: 'aasd1395186',
        name: 'الادمن الرئيسي',
        role: 'admin'
      });
      saveDB();
      console.log('Default admin created: admin@sonaa.com / Admin@123456');
    }
  } catch (e) { console.log('DB load error:', e.message); }
}

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(DB));
  } catch (e) { console.log('DB save error:', e.message); }
}

loadDB();

function createOrder(body) {
  const sn = 'SN' + DB.c++;
  const o = {
    _id: Date.now() + '' + Math.floor(Math.random()*1000),
    sn: sn,
    service: body.service || body.serviceType || '',
    area: body.area || body.address || '',
    address: body.address || body.area || '',
    clientPhone: body.clientPhone || body.phone || '',
    phone: body.phone || body.clientPhone || '',
    clientName: body.clientName || 'عميل',
    description: body.description || body.desc || '',
    status: 'قيد المراجعة',
    offers: [],
    createdAt: new Date()
  };
  DB.orders.unshift(o);
  saveDB();
  console.log('Order created:', o.sn);
  return o;
}

// ========== ADMIN LOGIN - جديد ==========
app.post('/api/admin/login', (req, res) => {
  loadDB();
  const { phone, email, password } = req.body;
  const admin = DB.admins.find(a => (a.email===email||a.phone===phone||a.email===phone) && a.password===password);
  if (!admin) return res.status(401).json({ message: 'بيانات الادمن غير صحيحة - جرب admin@sonaa.com / Admin@123456' });
  const token = Buffer.from(admin._id+':'+Date.now()).toString('base64');
  res.json({ token, admin, data: admin });
});
app.post('/api/admins/login', (req,res)=>{ req.url='/api/admin/login'; app.handle(req,res); });
app.post('/api/auth/admin/login', (req,res)=>{ 
  loadDB();
  const { phone, email, password } = req.body;
  const admin = DB.admins.find(a => (a.email===email||a.phone===phone||a.email===phone) && a.password===password);
  if (!admin) return res.status(401).json({ message: 'بيانات الادمن غير صحيحة' });
  const token = Buffer.from(admin._id+':'+Date.now()).toString('base64');
  res.json({ token, admin });
});

// ========== ORDERS ==========
app.get('/api/orders', (req, res) => { loadDB(); res.json({ orders: DB.orders, data: DB.orders }); });
app.get('/api/client/orders', (req, res) => { loadDB(); res.json({ orders: DB.orders, data: DB.orders }); });
app.get('/api/admin/orders', (req, res) => { loadDB(); res.json({ orders: DB.orders, data: DB.orders }); });
app.get('/api/orders/available', (req, res) => { loadDB(); res.json({ orders: DB.orders, data: DB.orders }); });
app.get('/api/fanni/orders/available', (req, res) => { loadDB(); res.json({ orders: DB.orders, data: DB.orders }); });
app.get('/api/fanni/available-orders', (req, res) => { loadDB(); res.json({ orders: DB.orders, data: DB.orders }); });

app.get('/api/orders/:sn', (req, res) => {
  loadDB();
  const sn = req.params.sn.toUpperCase();
  const order = DB.orders.find(o => (o.sn && o.sn.toUpperCase() === sn) || o._id === req.params.sn);
  if (!order) return res.status(404).json({ message: 'الكود غير موجود' });
  res.json({ order });
});
app.get('/api/client/orders/:sn', (req, res) => {
  loadDB();
  const sn = req.params.sn.toUpperCase();
  const order = DB.orders.find(o => (o.sn && o.sn.toUpperCase() === sn) || o._id === req.params.sn);
  if (!order) return res.status(404).json({ message: 'الكود غير موجود' });
  res.json({ order });
});

app.post('/api/orders', (req, res) => { loadDB(); const o = createOrder(req.body); res.json({ sn: o.sn, order: o, data: o }); });
app.post('/api/client/orders', (req, res) => { loadDB(); const o = createOrder(req.body); res.json({ sn: o.sn, order: o, data: o }); });
app.post('/api/admin/orders', (req, res) => { loadDB(); const o = createOrder(req.body); res.json({ sn: o.sn, order: o, data: o }); });

app.patch('/api/orders/:id/status', (req, res) => {
  loadDB();
  const id = req.params.id;
  const order = DB.orders.find(o => o.sn === id || o._id === id);
  if (!order) return res.status(404).json({ error: 'not found' });
  order.status = req.body.status;
  saveDB();
  res.json({ order });
});
app.put('/api/orders/:id', (req, res) => {
  loadDB();
  const id = req.params.id;
  const order = DB.orders.find(o => o.sn === id || o._id === id);
  if (!order) return res.status(404).json({ error: 'not found' });
  if (req.body.status) order.status = req.body.status;
  saveDB();
  res.json({ order });
});

// ========== FANNIS - كل المسارات ==========
app.get('/api/fanni', (req, res) => { loadDB(); res.json({ fannis: DB.fannis, data: DB.fannis }); });
app.get('/api/fannis', (req, res) => { loadDB(); res.json({ fannis: DB.fannis, data: DB.fannis }); });
app.get('/api/admin/fannis', (req, res) => { loadDB(); res.json({ fannis: DB.fannis, data: DB.fannis }); });
app.get('/api/technicians', (req, res) => { loadDB(); res.json({ fannis: DB.fannis, data: DB.fannis }); });

app.post('/api/fanni/register', (req, res) => {
  loadDB();
  // منع تكرار بنفس الرقم
  const exists = DB.fannis.find(f=> f.phone===req.body.phone || f.clientPhone===req.body.phone);
  if (exists) return res.status(400).json({ message: 'رقم الهاتف مسجل من قبل - انتظر موافقة الادمن' });
  const f = { _id: Date.now() + '' + Math.floor(Math.random()*1000), ...req.body, status: req.body.status||'pending', isApproved: false, createdAt: new Date(), balance:0 };
  DB.fannis.push(f);
  saveDB();
  console.log('Fanni registered:', f.phone, f.name);
  res.json({ fanni: f, data: f, message:'تم التسجيل - بانتظار الموافقة' });
});
app.post('/api/fannis/register', (req,res)=>{ req.url='/api/fanni/register'; app.handle(req,res); });
app.post('/api/technician/register', (req,res)=>{ req.url='/api/fanni/register'; app.handle(req,res); });
app.post('/api/technicians/register', (req,res)=>{ req.url='/api/fanni/register'; app.handle(req,res); });
app.post('/api/fanni/signup', (req,res)=>{ req.url='/api/fanni/register'; app.handle(req,res); });

// ========== FANNI LOGIN - جديد ومهم ==========
function handleFanniLogin(req,res){
  loadDB();
  const { phone, password, clientPhone, phoneNumber } = req.body;
  const p = (phone||clientPhone||phoneNumber||'').replace(/\D/g,'');
  const f = DB.fannis.find(x=> (x.phone && x.phone.replace(/\D/g,'')===p) || x.clientPhone===p );
  if (!f) return res.status(404).json({ message: 'الحساب غير موجود - سجل حساب جديد' });
  if (f.password && f.password!==password) return res.status(401).json({ message: 'كلمة السر غير صحيحة' });
  if (!f.isApproved && f.status!=='approved') {
    return res.status(423).json({ message: '⏳ حسابك قيد المراجعة من الإدارة - سيتم تفعيله خلال ساعات', status:'pending' });
  }
  const token = Buffer.from(f._id+':'+Date.now()).toString('base64');
  res.json({ token, fanni: f, user: f, data: f, accessToken: token });
}
app.post('/api/fanni/login', handleFanniLogin);
app.post('/api/fannis/login', handleFanniLogin);
app.post('/api/technician/login', handleFanniLogin);
app.post('/api/fanni/signin', handleFanniLogin);
app.post('/api/technicians/login', handleFanniLogin);

// ========== APPROVE FANNI - اهم جزء كان ناقص ==========
function approveFanniById(req,res){
  loadDB();
  const id = req.params.id;
  const f = DB.fannis.find(x=> x._id===id || x.phone===id || x._id===id.replace(/\D/g,''));
  if (!f) return res.status(404).json({ message: 'الفني غير موجود' });
  f.status = 'approved';
  f.isApproved = true;
  f.approved = true;
  f.approvedAt = new Date();
  // لو البادي فيه status خدها
  if (req.body.status) f.status = req.body.status;
  if (req.body.isApproved!==undefined) f.isApproved = req.body.isApproved;
  saveDB();
  console.log('Fanni approved:', f.phone);
  res.json({ message:'تمت الموافقة', fanni:f, data:f });
}

// كل الاحتمالات اللي لوحة الادمن بتحاولها
app.post('/api/fannis/:id/approve', approveFanniById);
app.put('/api/fannis/:id/approve', approveFanniById);
app.patch('/api/fannis/:id/approve', approveFanniById);
app.post('/api/fanni/:id/approve', approveFanniById);
app.put('/api/fanni/:id/approve', approveFanniById);
app.post('/api/technicians/:id/approve', approveFanniById);
app.put('/api/technicians/:id/approve', approveFanniById);
app.post('/api/admin/fannis/:id/approve', approveFanniById);
app.put('/api/admin/fannis/:id/approve', approveFanniById);
app.post('/api/admin/fanni/:id/approve', approveFanniById);
app.put('/api/admin/fanni/:id/approve', approveFanniById);
app.post('/api/fannis/:id/activate', approveFanniById);
app.put('/api/fannis/:id/activate', approveFanniById);

// تحديث عام للفني (PATCH /api/fannis/:id)
app.patch('/api/fannis/:id', (req,res)=>{
  loadDB();
  const id=req.params.id;
  const f=DB.fannis.find(x=> x._id===id);
  if(!f) return res.status(404).json({message:'غير موجود'});
  Object.assign(f, req.body);
  if(req.body.status==='approved'||req.body.isApproved) { f.isApproved=true; f.status='approved'; }
  saveDB();
  res.json({fanni:f, data:f});
});
app.put('/api/fannis/:id', (req,res)=>{
  loadDB();
  const id=req.params.id;
  const f=DB.fannis.find(x=> x._id===id);
  if(!f) return res.status(404).json({message:'غير موجود'});
  Object.assign(f, req.body);
  if(req.body.status==='approved'||req.body.isApproved) { f.isApproved=true; f.status='approved'; }
  saveDB();
  res.json({fanni:f, data:f});
});
app.patch('/api/technicians/:id', (req,res)=>{ req.url='/api/fannis/'+req.params.id; app.handle(req,res); });
app.put('/api/technicians/:id', (req,res)=>{ req.url='/api/fannis/'+req.params.id; app.handle(req,res); });

app.post('/api/fannis/:id/reject', (req,res)=>{
  loadDB();
  const f=DB.fannis.find(x=> x._id===req.params.id);
  if(!f) return res.status(404).json({message:'غير موجود'});
  f.status='rejected'; f.isApproved=false; saveDB(); res.json({message:'تم الرفض', fanni:f});
});

// ========== WALLET / TOPUP - جديد ==========
app.post('/api/fanni/wallet/topup', (req,res)=>{
  loadDB();
  const t={ _id:Date.now()+'', ...req.body, status:'pending', createdAt:new Date() };
  DB.topups.unshift(t); saveDB(); res.json({message:'تم إرسال طلب الشحن - قيد المراجعة', data:t, topup:t});
});
app.post('/api/fanni/wallet/recharge', (req,res)=>{ req.url='/api/fanni/wallet/topup'; app.handle(req,res); });
app.post('/api/fanni/topup', (req,res)=>{ req.url='/api/fanni/wallet/topup'; app.handle(req,res); });
app.post('/api/wallet/topup-request', (req,res)=>{ req.url='/api/fanni/wallet/topup'; app.handle(req,res); });
app.post('/api/fanni/balance/topup', (req,res)=>{ req.url='/api/fanni/wallet/topup'; app.handle(req,res); });
app.post('/api/topup-requests', (req,res)=>{ req.url='/api/fanni/wallet/topup'; app.handle(req,res); });

app.get('/api/fanni/wallet/history', (req,res)=>{ loadDB(); res.json({history:DB.topups, data:DB.topups, balance:0}); });
app.get('/api/fanni/wallet', (req,res)=>{ loadDB(); res.json({history:DB.topups, data:DB.topups}); });
app.get('/api/fanni/balance/history', (req,res)=>{ loadDB(); res.json({history:DB.topups, data:DB.topups}); });
app.get('/api/topup-requests', (req,res)=>{ loadDB(); res.json({requests:DB.topups, data:DB.topups}); });
app.get('/api/topup-requests/my', (req,res)=>{ loadDB(); res.json({history:DB.topups, data:DB.topups}); });
app.get('/api/admin/topup-requests', (req,res)=>{ loadDB(); res.json({requests:DB.topups, data:DB.topups}); });
app.get('/api/wallet/topup-requests', (req,res)=>{ loadDB(); res.json({requests:DB.topups, data:DB.topups}); });

// موافقة الشحن
function approveTopup(req,res){
  loadDB();
  const id=req.params.id;
  const t=DB.topups.find(x=> x._id===id);
  if(!t) return res.status(404).json({message:'طلب الشحن غير موجود'});
  t.status='approved'; t.approvedAt=new Date(); 
  // زود رصيد الفني
  const f=DB.fannis.find(x=> x.phone===t.fromPhone || x.phone===t.phone);
  if(f) f.balance=(f.balance||0)+Number(t.amount||0);
  saveDB();
  res.json({message:'تم تأكيد الشحن', data:t});
}
app.post('/api/topup-requests/:id/approve', approveTopup);
app.put('/api/topup-requests/:id/approve', approveTopup);
app.post('/api/admin/topup-requests/:id/approve', approveTopup);
app.put('/api/topup-requests/:id/status', (req,res)=>{ if(req.body.status==='approved') return approveTopup(req,res); res.json({}); });

// عروض الفني
app.post('/api/fanni/orders/:sn/offer', (req,res)=>{
  loadDB();
  const sn=req.params.sn.toUpperCase();
  const order=DB.orders.find(o=> o.sn.toUpperCase()===sn || o._id===sn);
  if(!order) return res.status(404).json({message:'الطلب غير موجود'});
  const offer={ _id:Date.now()+'', price:req.body.price, message:req.body.message, createdAt:new Date() };
  order.offers=order.offers||[]; order.offers.push(offer); saveDB();
  res.json({message:'تم إرسال العرض', offer, data:offer});
});
app.get('/api/fanni/offers', (req,res)=>{ loadDB(); const all=DB.orders.flatMap(o=> (o.offers||[]).map(of=>({...of, orderSn:o.sn}))); res.json({offers:all, data:all}); });
app.get('/api/fanni/my-offers', (req,res)=>{ loadDB(); const all=DB.orders.flatMap(o=> (o.offers||[]).map(of=>({...of, orderSn:o.sn}))); res.json({offers:all, data:all}); });

// شكاوى
app.post('/api/complaints', (req, res) => { console.log('Complaint:', req.body); res.json({ ok: true, message: 'تم استلام الشكوى' }); });
app.post('/api/client/complaints', (req, res) => { console.log('Complaint:', req.body); res.json({ ok: true }); });

// صفحات
function sendHtml(res, name) {
  const files = [
    path.join(fp, name),
    path.join(__dirname, name),
    path.join(__dirname, '..', name),
    path.join(__dirname, 'frontend', name)
  ];
  for (let p of files) {
    if (fs.existsSync(p)) return res.sendFile(p);
  }
  res.send(`ملف ${name} مش موجود. جربت في: ${files.join(', ')}`);
}
app.get('/', (req, res) => sendHtml(res, 'client.html'));
app.get('/client', (req, res) => sendHtml(res, 'client.html'));
app.get('/fanni', (req, res) => sendHtml(res, 'fanni.html'));
app.get('/admin', (req, res) => sendHtml(res, 'admin.html'));
app.get('/client.html', (req, res) => sendHtml(res, 'client.html'));
app.get('/fanni.html', (req, res) => sendHtml(res, 'fanni.html'));
app.get('/admin.html', (req, res) => sendHtml(res, 'admin.html'));

module.exports = app;
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log('Server running on', PORT));
}
