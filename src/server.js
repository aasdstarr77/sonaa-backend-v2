const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));

let fp = path.join(__dirname, '..', 'frontend');
if (!fs.existsSync(fp)) fp = path.join(__dirname, 'frontend');
if (!fs.existsSync(fp)) fp = path.join(__dirname, '..');
if (!fs.existsSync(fp)) fp = __dirname;
app.use(express.static(fp));

// ========== حل مشكلة اختفاء البيانات في Vercel ==========
// نستخدم global variable عشان تفضل في الذاكرة اطول فترة + ملف + backup
const DB_FILE = path.join('/tmp', 'sonaa_db.json');
const BACKUP_FILE = path.join('/tmp', 'sonaa_backup.json');

// Global عشان يفضل حتى لو الملف اتمسح
if (!global.sonaaDB) {
  global.sonaaDB = { orders: [], fannis: [], topups: [], admins: [], c: 1001 };
}

let DB = global.sonaaDB;

function loadDB() {
  try {
    // حاول من الملف الاساسي
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (parsed.orders) {
        DB.orders = parsed.orders || DB.orders;
        DB.fannis = parsed.fannis || DB.fannis;
        DB.topups = parsed.topups || DB.topups;
        DB.admins = parsed.admins || DB.admins;
        DB.c = parsed.c || DB.c;
        global.sonaaDB = DB;
      }
    } else if (fs.existsSync(BACKUP_FILE)) {
      // حاول من الباك اب
      const data = fs.readFileSync(BACKUP_FILE, 'utf8');
      const parsed = JSON.parse(data);
      DB.orders = parsed.orders || [];
      DB.fannis = parsed.fannis || [];
      DB.topups = parsed.topups || [];
      DB.admins = parsed.admins || [];
      DB.c = parsed.c || 1001;
      global.sonaaDB = DB;
    }
    
    // انشاء ادمن افتراضي لو مفيش
    if (DB.admins.length === 0) {
      DB.admins.push({
        _id: 'admin_default',
        email: 'admin@sonaa.com',
        phone: '01012345678',
        password: 'Admin@123456',
        name: 'الادمن الرئيسي',
        role: 'admin'
      });
      saveDB();
      console.log('Default admin created');
    }
  } catch (e) { console.log('DB load error:', e.message); }
  return DB;
}

function saveDB() {
  try {
    global.sonaaDB = DB;
    fs.writeFileSync(DB_FILE, JSON.stringify(DB));
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(DB));
    // كمان احفظ نسخة في الذاكرة فقط
    if (DB.orders.length > 0) {
      console.log('DB saved:', DB.fannis.length, 'fannis,', DB.orders.length, 'orders,', DB.topups.length, 'topups');
    }
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
  return o;
}

// ========== ADMIN LOGIN ==========
app.post('/api/admin/login', (req, res) => {
  loadDB();
  const { phone, email, password } = req.body;
  const admin = DB.admins.find(a => (a.email===email||a.phone===phone||a.email===phone||a.phone===email) && a.password===password);
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

// انشاء ادمن جديد
app.post('/api/admin/register', (req,res)=>{
  loadDB();
  const { email, password, phone, name } = req.body;
  if(DB.admins.find(a=>a.email===email)) return res.status(400).json({message:'الادمن موجود'});
  const admin={ _id:Date.now()+'', email, password, phone:phone||'', name:name||'Admin', role:'admin' };
  DB.admins.push(admin); saveDB();
  res.json({message:'تم انشاء الادمن', admin});
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
app.post('/api/orders', (req, res) => { loadDB(); const o = createOrder(req.body); res.json({ sn: o.sn, order: o, data: o }); });
app.post('/api/client/orders', (req, res) => { loadDB(); const o = createOrder(req.body); res.json({ sn: o.sn, order: o, data: o }); });
app.post('/api/admin/orders', (req, res) => { loadDB(); const o = createOrder(req.body); res.json({ sn: o.sn, order: o, data: o }); });
app.patch('/api/orders/:id/status', (req, res) => {
  loadDB();
  const order = DB.orders.find(o => o.sn === req.params.id || o._id === req.params.id);
  if (!order) return res.status(404).json({ error: 'not found' });
  order.status = req.body.status; saveDB(); res.json({ order });
});
app.put('/api/orders/:id', (req, res) => {
  loadDB();
  const order = DB.orders.find(o => o.sn === req.params.id || o._id === req.params.id);
  if (!order) return res.status(404).json({ error: 'not found' });
  if (req.body.status) order.status = req.body.status; saveDB(); res.json({ order });
});

// ========== FANNIS ==========
app.get('/api/fanni', (req, res) => { loadDB(); res.json({ fannis: DB.fannis, data: DB.fannis }); });
app.get('/api/fannis', (req, res) => { loadDB(); res.json({ fannis: DB.fannis, data: DB.fannis }); });
app.get('/api/admin/fannis', (req, res) => { loadDB(); res.json({ fannis: DB.fannis, data: DB.fannis }); });
app.get('/api/technicians', (req, res) => { loadDB(); res.json({ fannis: DB.fannis, data: DB.fannis }); });

app.post('/api/fanni/register', (req, res) => {
  loadDB();
  const exists = DB.fannis.find(f=> f.phone===req.body.phone);
  if (exists) return res.status(400).json({ message: 'رقم الهاتف مسجل من قبل - انتظر موافقة الادمن' });
  const f = { _id: Date.now() + '' + Math.floor(Math.random()*1000), ...req.body, status: 'pending', isApproved: false, isDisabled:false, createdAt: new Date(), balance:0 };
  DB.fannis.push(f); saveDB();
  res.json({ fanni: f, data: f, message:'تم التسجيل - بانتظار الموافقة' });
});
app.post('/api/fannis/register', (req,res)=>{ req.url='/api/fanni/register'; app.handle(req,res); });
app.post('/api/technician/register', (req,res)=>{ req.url='/api/fanni/register'; app.handle(req,res); });
app.post('/api/technicians/register', (req,res)=>{ req.url='/api/fanni/register'; app.handle(req,res); });
app.post('/api/fanni/signup', (req,res)=>{ req.url='/api/fanni/register'; app.handle(req,res); });

function handleFanniLogin(req,res){
  loadDB();
  const { phone, password, clientPhone, phoneNumber } = req.body;
  const p = (phone||clientPhone||phoneNumber||'').replace(/\D/g,'');
  const f = DB.fannis.find(x=> (x.phone && x.phone.replace(/\D/g,'')===p));
  if (!f) return res.status(404).json({ message: 'الحساب غير موجود - سجل حساب جديد' });
  if (f.password && f.password!==password) return res.status(401).json({ message: 'كلمة السر غير صحيحة' });
  if (f.isDisabled) return res.status(403).json({ message: '⛔ حسابك موقوف من الإدارة', status:'disabled' });
  if (!f.isApproved && f.status!=='approved') {
    return res.status(423).json({ message: '⏳ حسابك قيد المراجعة من الإدارة', status:'pending' });
  }
  const token = Buffer.from(f._id+':'+Date.now()).toString('base64');
  res.json({ token, fanni: f, user: f, data: f, accessToken: token });
}
app.post('/api/fanni/login', handleFanniLogin);
app.post('/api/fannis/login', handleFanniLogin);
app.post('/api/technician/login', handleFanniLogin);
app.post('/api/fanni/signin', handleFanniLogin);
app.post('/api/technicians/login', handleFanniLogin);

// ========== تحكم الفنيين - قبول / رفض / تعطيل / استعادة ==========
function findFanni(id){ return DB.fannis.find(x=> x._id===id || x.phone===id); }

function approveFanniById(req,res){
  loadDB();
  const f = findFanni(req.params.id);
  if (!f) return res.status(404).json({ message: 'الفني غير موجود' });
  f.status = 'approved'; f.isApproved = true; f.isDisabled=false; f.approved = true; f.approvedAt = new Date();
  if (req.body.status) f.status = req.body.status;
  saveDB();
  res.json({ message:'تمت الموافقة', fanni:f, data:f });
}
function rejectFanniById(req,res){
  loadDB();
  const f = findFanni(req.params.id);
  if (!f) return res.status(404).json({ message: 'الفني غير موجود' });
  f.status = 'rejected'; f.isApproved=false; f.isDisabled=false; saveDB();
  res.json({ message:'تم الرفض', fanni:f });
}
function disableFanniById(req,res){
  loadDB();
  const f = findFanni(req.params.id);
  if (!f) return res.status(404).json({ message: 'الفني غير موجود' });
  f.isDisabled=true; f.status='disabled'; saveDB();
  res.json({ message:'تم تعطيل الفني', fanni:f });
}
function enableFanniById(req,res){
  loadDB();
  const f = findFanni(req.params.id);
  if (!f) return res.status(404).json({ message: 'الفني غير موجود' });
  f.isDisabled=false; f.status='approved'; f.isApproved=true; saveDB();
  res.json({ message:'تمت استعادة الفني', fanni:f });
}

// قبول
app.post('/api/fannis/:id/approve', approveFanniById);
app.put('/api/fannis/:id/approve', approveFanniById);
app.patch('/api/fannis/:id/approve', approveFanniById);
app.post('/api/fanni/:id/approve', approveFanniById);
app.put('/api/fanni/:id/approve', approveFanniById);
app.post('/api/technicians/:id/approve', approveFanniById);
app.post('/api/admin/fannis/:id/approve', approveFanniById);
app.put('/api/admin/fannis/:id/approve', approveFanniById);
app.post('/api/admin/fanni/:id/approve', approveFanniById);
app.post('/api/fannis/:id/activate', approveFanniById);

// رفض
app.post('/api/fannis/:id/reject', rejectFanniById);
app.put('/api/fannis/:id/reject', rejectFanniById);
app.post('/api/admin/fannis/:id/reject', rejectFanniById);
app.post('/api/fanni/:id/reject', rejectFanniById);

// تعطيل
app.post('/api/fannis/:id/disable', disableFanniById);
app.put('/api/fannis/:id/disable', disableFanniById);
app.post('/api/admin/fannis/:id/disable', disableFanniById);
app.post('/api/fanni/:id/disable', disableFanniById);
app.post('/api/fannis/:id/block', disableFanniById);

// استعادة / تفعيل
app.post('/api/fannis/:id/enable', enableFanniById);
app.put('/api/fannis/:id/enable', enableFanniById);
app.post('/api/fannis/:id/restore', enableFanniById);
app.post('/api/admin/fannis/:id/enable', enableFanniById);
app.post('/api/fanni/:id/enable', enableFanniById);

// تحديث عام
app.patch('/api/fannis/:id', (req,res)=>{
  loadDB();
  const f=findFanni(req.params.id);
  if(!f) return res.status(404).json({message:'غير موجود'});
  Object.assign(f, req.body);
  if(req.body.status==='approved'||req.body.isApproved) { f.isApproved=true; f.status='approved'; f.isDisabled=false; }
  saveDB(); res.json({fanni:f, data:f});
});
app.put('/api/fannis/:id', (req,res)=>{
  loadDB();
  const f=findFanni(req.params.id);
  if(!f) return res.status(404).json({message:'غير موجود'});
  Object.assign(f, req.body); saveDB(); res.json({fanni:f, data:f});
});

// ========== WALLET ==========
app.post('/api/fanni/wallet/topup', (req,res)=>{
  loadDB();
  const t={ _id:Date.now()+'', ...req.body, status:'pending', createdAt:new Date() };
  DB.topups.unshift(t); saveDB(); res.json({message:'تم إرسال طلب الشحن', data:t, topup:t});
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

// قبول ورفض الشحن
function approveTopup(req,res){
  loadDB();
  const t=DB.topups.find(x=> x._id===req.params.id);
  if(!t) return res.status(404).json({message:'طلب الشحن غير موجود'});
  t.status='approved'; t.approvedAt=new Date(); 
  const f=DB.fannis.find(x=> x.phone===t.fromPhone || x.phone===t.phone);
  if(f) f.balance=(f.balance||0)+Number(t.amount||0);
  saveDB(); res.json({message:'تم تأكيد الشحن', data:t});
}
function rejectTopup(req,res){
  loadDB();
  const t=DB.topups.find(x=> x._id===req.params.id);
  if(!t) return res.status(404).json({message:'طلب الشحن غير موجود'});
  t.status='rejected'; t.rejectedAt=new Date(); saveDB();
  res.json({message:'تم رفض طلب الشحن', data:t});
}
app.post('/api/topup-requests/:id/approve', approveTopup);
app.put('/api/topup-requests/:id/approve', approveTopup);
app.post('/api/admin/topup-requests/:id/approve', approveTopup);
app.put('/api/topup-requests/:id/status', (req,res)=>{ if(req.body.status==='approved') return approveTopup(req,res); if(req.body.status==='rejected') return rejectTopup(req,res); res.json({}); });
app.post('/api/topup-requests/:id/reject', rejectTopup);
app.put('/api/topup-requests/:id/reject', rejectTopup);
app.post('/api/admin/topup-requests/:id/reject', rejectTopup);
app.post('/api/topup-requests/:id/decline', rejectTopup);

// عروض
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

app.post('/api/complaints', (req, res) => { res.json({ ok: true }); });
app.post('/api/client/complaints', (req, res) => { res.json({ ok: true }); });

function sendHtml(res, name) {
  const files = [path.join(fp, name), path.join(__dirname, name), path.join(__dirname, '..', name), path.join(__dirname, 'frontend', name)];
  for (let p of files) { if (fs.existsSync(p)) return res.sendFile(p); }
  res.send(`ملف ${name} مش موجود`);
}
app.get('/', (req, res) => sendHtml(res, 'client.html'));
app.get('/client', (req, res) => sendHtml(res, 'client.html'));
app.get('/fanni', (req, res) => sendHtml(res, 'fanni.html'));
app.get('/admin', (req, res) => sendHtml(res, 'admin.html'));

module.exports = app;
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log('Server running on', PORT));
}
