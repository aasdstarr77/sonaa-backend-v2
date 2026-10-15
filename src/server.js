const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));

let fp = path.join(__dirname, '..', 'frontend');
if (!fs.existsSync(fp)) fp = path.join(__dirname, 'frontend');
if (!fs.existsSync(fp)) fp = path.join(__dirname, '..');
if (!fs.existsSync(fp)) fp = __dirname;
app.use(express.static(fp));

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sonaa';

// === حل مشكلة Vercel Timeout - اتصال واحد فقط ===
let cached = global.mongoose;
if (!cached) cached = global.mongoose = { conn: null, promise: null };

async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    const opts = { bufferCommands: false, serverSelectionTimeoutMS: 3000, socketTimeoutMS: 5000 };
    cached.promise = mongoose.connect(MONGODB_URI, opts).then((m) => m);
  }
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }
  return cached.conn;
}

const orderSchema = new mongoose.Schema({
  sn: { type: String, unique: true, required: true },
  service: String, area: String, address: String,
  clientPhone: String, phone: String, clientName: String,
  description: String, status: { type: String, default: 'قيد المراجعة' },
  offers: { type: Array, default: [] },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'orders' });

const fanniSchema = new mongoose.Schema({
  name: String, phone: { type: String, unique: true },
  password: String, service: String, area: String,
  status: { type: String, default: 'pending' },
  isApproved: { type: Boolean, default: false },
  isDisabled: { type: Boolean, default: false },
  balance: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }, approvedAt: Date
}, { strict: false, collection: 'fannis' });

const topupSchema = new mongoose.Schema({
  fromPhone: String, phone: String, amount: Number, method: String,
  status: { type: String, default: 'pending' },
  walletNumber: { type: String, default: '01152822263' },
  createdAt: { type: Date, default: Date.now }, approvedAt: Date, rejectedAt: Date
}, { strict: false, collection: 'topups' });

const adminSchema = new mongoose.Schema({
  email: aasdstarr77@gmail.com, phone: 01152822263, password: aasd25254655, name: hmzawy, role: owner
}, { strict: false, collection: 'admins' });

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);
const Fanni = mongoose.models.Fanni || mongoose.model('Fanni', fanniSchema);
const Topup = mongoose.models.Topup || mongoose.model('Topup', topupSchema);
const Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);

function generateSN() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const rl = Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  const rn = Math.floor(1000 + Math.random() * 9000);
  const rt = Date.now().toString(36).toUpperCase().slice(-3);
  return `SN-${rl}${rn}-${rt}`;
}

async function createOrder(body) {
  await connectDB();
  let sn, exists = true;
  while (exists) { sn = generateSN(); exists = await Order.findOne({ sn }); }
  const o = await Order.create({
    sn, service: body.service || '', area: body.area || body.address || '',
    address: body.address || body.area || '', clientPhone: body.clientPhone || body.phone || '',
    phone: body.phone || body.clientPhone || '', clientName: body.clientName || 'عميل',
    description: body.description || '', status: 'قيد المراجعة', offers: []
  });
  return o;
}

// === ADMIN LOGIN - سريع ومش بيعمل Timeout ===
app.post('/api/admin/login', async (req, res) => {
  try {
    await connectDB();
    const { phone, email, password } = req.body;
    const loginId = (phone || email || '').trim();
    const pass = (password || '').trim();
    
    if (!loginId || !pass) return res.status(400).json({ message: 'اكتب البيانات' });
    
    let admin = await Admin.findOne({
      $or: [{ email: loginId }, { phone: loginId }]
    }).lean();
    
    // لو مفيش أدمن خالص - انشئ الافتراضي فوراً
    if (!admin) {
      const count = await Admin.countDocuments();
      if (count === 0) {
        admin = await Admin.create({
          email: 'admin@sonaa.com',
          phone: '01152822263',
          password: 'Admin@123456',
          name: 'الادمن الرئيسي',
          role: 'admin'
        });
      } else {
        return res.status(401).json({ message: 'بيانات الادمن غير صحيحة' });
      }
    }
    
    if (admin.password !== pass) {
      // جرب الباسورد القديم كمان
      if (pass !== 'aasd139518' && admin.password !== 'aasd139518') {
        return res.status(401).json({ message: 'كلمة السر غلط' });
      }
    }
    
    const token = Buffer.from(admin._id + ':' + Date.now()).toString('base64');
    res.json({ token, admin, data: admin });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ message: 'خطأ في الاتصال بقاعدة البيانات - جرب تاني', error: err.message });
  }
});

app.post('/api/admins/login', (req, res) => { req.url = '/api/admin/login'; app.handle(req, res); });
app.post('/api/auth/admin/login', (req, res) => { req.url = '/api/admin/login'; app.handle(req, res); });

// قفل التسجيل نهائياً
app.post('/api/admin/register', (req, res) => {
  res.status(403).json({ message: '⛔ تسجيل الأدمن مغلق' });
});

app.get('/api/orders', async (req, res) => { try{ await connectDB(); const orders = await Order.find().sort({ createdAt: -1 }).limit(100).lean(); res.json({ orders, data: orders }); }catch(e){ res.json({orders:[], data:[]}); } });
app.get('/api/fannis', async (req, res) => { try{ await connectDB(); const fannis = await Fanni.find().sort({ createdAt: -1 }).lean(); res.json({ fannis, data: fannis }); }catch(e){ res.json({fannis:[], data:[]}); } });
app.get('/api/admin/fannis', async (req, res) => { try{ await connectDB(); const fannis = await Fanni.find().sort({ createdAt: -1 }).lean(); res.json({ fannis, data: fannis }); }catch(e){ res.json({fannis:[], data:[]}); } });
app.get('/api/fanni', async (req, res) => { try{ await connectDB(); const fannis = await Fanni.find().sort({ createdAt: -1 }).lean(); res.json({ fannis, data: fannis }); }catch(e){ res.json({fannis:[], data:[]}); } });
app.get('/api/technicians', async (req, res) => { try{ await connectDB(); const fannis = await Fanni.find().sort({ createdAt: -1 }).lean(); res.json({ fannis, data: fannis }); }catch(e){ res.json({fannis:[], data:[]}); } });

app.post('/api/fanni/register', async (req, res) => {
  try{
    await connectDB();
    const exists = await Fanni.findOne({ phone: req.body.phone });
    if (exists) return res.status(400).json({ message: 'الرقم مسجل' });
    const f = await Fanni.create({ ...req.body, status: 'pending', isApproved: false, isDisabled: false, balance: 0 });
    res.json({ fanni: f, data: f });
  }catch(e){ res.status(500).json({message:e.message}); }
});
app.post('/api/fannis/register', (req, res) => { req.url = '/api/fanni/register'; app.handle(req, res); });

async function handleFanniLogin(req, res) {
  try{
    await connectDB();
    const { phone, password, clientPhone } = req.body;
    const p = (phone || clientPhone || '').replace(/\D/g, '');
    const all = await Fanni.find().lean();
    const f = all.find(x => x.phone && x.phone.replace(/\D/g, '') === p);
    if (!f) return res.status(404).json({ message: 'الحساب غير موجود' });
    if (f.password && f.password !== password) return res.status(401).json({ message: 'كلمة السر خطأ' });
    if (f.isDisabled) return res.status(403).json({ message: '⛔ موقوف', status: 'disabled' });
    if (!f.isApproved && f.status !== 'approved') return res.status(423).json({ message: '⏳ قيد المراجعة', status: 'pending' });
    const token = Buffer.from(f._id + ':' + Date.now()).toString('base64');
    res.json({ token, fanni: f, user: f, data: f, accessToken: token });
  }catch(e){ res.status(500).json({message:e.message}); }
}
app.post('/api/fanni/login', handleFanniLogin);
app.post('/api/fannis/login', handleFanniLogin);

async function approveFanniById(req, res) {
  try{
    await connectDB();
    const f = await Fanni.findOne({ $or: [{ _id: req.params.id }, { phone: req.params.id }] });
    if (!f) return res.status(404).json({ message: 'غير موجود' });
    f.status = 'approved'; f.isApproved = true; f.isDisabled = false; f.approvedAt = new Date(); await f.save();
    res.json({ message: 'تمت الموافقة', fanni: f, data: f });
  }catch(e){ res.status(500).json({message:e.message}); }
}
async function disableFanniById(req, res) {
  try{
    await connectDB();
    const f = await Fanni.findOne({ $or: [{ _id: req.params.id }, { phone: req.params.id }] });
    if (!f) return res.status(404).json({ message: 'غير موجود' });
    f.isDisabled = true; f.status = 'disabled'; await f.save();
    res.json({ message: 'تم التعطيل', fanni: f });
  }catch(e){ res.status(500).json({message:e.message}); }
}
async function enableFanniById(req, res) {
  try{
    await connectDB();
    const f = await Fanni.findOne({ $or: [{ _id: req.params.id }, { phone: req.params.id }] });
    if (!f) return res.status(404).json({ message: 'غير موجود' });
    f.isDisabled = false; f.status = 'approved'; f.isApproved = true; await f.save();
    res.json({ message: 'تمت الاستعادة', fanni: f });
  }catch(e){ res.status(500).json({message:e.message}); }
}

app.post('/api/fannis/:id/approve', approveFanniById);
app.post('/api/admin/fannis/:id/approve', approveFanniById);
app.post('/api/fannis/:id/activate', approveFanniById);
app.post('/api/fannis/:id/disable', disableFanniById);
app.post('/api/admin/fannis/:id/disable', disableFanniById);
app.post('/api/fannis/:id/enable', enableFanniById);
app.post('/api/admin/fannis/:id/enable', enableFanniById);

app.post('/api/admin/fannis/:id/set-balance', async (req, res) => {
  try{
    await connectDB();
    const f = await Fanni.findOne({ $or: [{ _id: req.params.id }, { phone: req.params.id }] });
    if (!f) return res.status(404).json({ message: 'الفني غير موجود' });
    f.balance = Number(req.body.amount); await f.save();
    res.json({ message: `تم تعيين الرصيد إلى ${f.balance}ج`, fanni: f });
  }catch(e){ res.status(500).json({message:e.message}); }
});
app.post('/api/admin/fannis/:id/add-balance', async (req, res) => {
  try{
    await connectDB();
    const f = await Fanni.findOne({ $or: [{ _id: req.params.id }, { phone: req.params.id }] });
    if (!f) return res.status(404).json({ message: 'غير موجود' });
    f.balance = (f.balance||0) + Number(req.body.amount); await f.save();
    res.json({ message: `الرصيد الآن ${f.balance}ج`, fanni: f });
  }catch(e){ res.status(500).json({message:e.message}); }
});

app.post('/api/fanni/wallet/topup', async (req, res) => {
  try{
    await connectDB();
    const t = await Topup.create({ ...req.body, status: 'pending', walletNumber: '01152822263' });
    res.json({ message: 'تم - حول على 01152822263', data: t, topup: t });
  }catch(e){ res.status(500).json({message:e.message}); }
});
app.post('/api/topup-requests', (req, res) => { req.url = '/api/fanni/wallet/topup'; app.handle(req, res); });

app.get('/api/topup-requests', async (req, res) => { try{ await connectDB(); const requests = await Topup.find().sort({ createdAt: -1 }).limit(100).lean(); res.json({ requests, data: requests }); }catch(e){ res.json({requests:[], data:[]}); } });
app.get('/api/admin/topup-requests', async (req, res) => { try{ await connectDB(); const requests = await Topup.find().sort({ createdAt: -1 }).limit(100).lean(); res.json({ requests, data: requests }); }catch(e){ res.json({requests:[], data:[]}); } });

async function approveTopup(req, res) {
  try{
    await connectDB();
    const t = await Topup.findById(req.params.id);
    if (!t) return res.status(404).json({ message: 'غير موجود' });
    if (t.status === 'approved') return res.json({ message: 'مقبول من قبل', data: t });
    t.status = 'approved'; t.approvedAt = new Date(); await t.save();
    let f = await Fanni.findOne({ phone: t.fromPhone }) || await Fanni.findOne({ phone: t.phone });
    if (f) { f.balance = (f.balance || 0) + Number(t.amount || 0); await f.save(); }
    res.json({ message: `تمت إضافة ${t.amount}ج`, data: t });
  }catch(e){ res.status(500).json({message:e.message}); }
}
app.post('/api/topup-requests/:id/approve', approveTopup);
app.post('/api/admin/topup-requests/:id/approve', approveTopup);
app.post('/api/topup-requests/:id/reject', async (req,res)=>{ try{ await connectDB(); const t=await Topup.findById(req.params.id); t.status='rejected'; await t.save(); res.json({message:'تم الرفض'});}catch(e){res.status(500).json({message:e.message});} });
app.post('/api/admin/topup-requests/:id/reject', async (req,res)=>{ try{ await connectDB(); const t=await Topup.findById(req.params.id); t.status='rejected'; await t.save(); res.json({message:'تم الرفض'});}catch(e){res.status(500).json({message:e.message});} });

app.post('/api/orders', async (req, res) => { try{ const o = await createOrder(req.body); res.json({ sn: o.sn, order: o, data: o }); }catch(e){ res.status(500).json({message:e.message}); } });
app.post('/api/client/orders', async (req, res) => { try{ const o = await createOrder(req.body); res.json({ sn: o.sn, order: o, data: o }); }catch(e){ res.status(500).json({message:e.message}); } });

app.get('/', (req, res) => { res.sendFile(path.join(fp, 'client.html')); });
app.get('/admin', (req, res) => { res.sendFile(path.join(fp, 'admin.html')); });
app.get('/fanni', (req, res) => { res.sendFile(path.join(fp, 'fanni.html')); });
app.get('/client', (req, res) => { res.sendFile(path.join(fp, 'client.html')); });

module.exports = app;
