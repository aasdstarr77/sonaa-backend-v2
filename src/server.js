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

// ========== MongoDB Connection ==========
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sonaa';

let isConnected = false;
async function connectDB() {
  if (isConnected) return;
  try {
    await mongoose.connect(MONGODB_URI);
    isConnected = true;
    console.log('✅ MongoDB Connected:', mongoose.connection.host);
  } catch (err) {
    console.error('❌ MongoDB Error:', err.message);
  }
}
connectDB();

// ========== Schemas ==========
const orderSchema = new mongoose.Schema({
  sn: { type: String, unique: true, required: true },
  service: String,
  area: String,
  address: String,
  clientPhone: String,
  phone: String,
  clientName: String,
  description: String,
  status: { type: String, default: 'قيد المراجعة' },
  offers: { type: Array, default: [] },
  createdAt: { type: Date, default: Date.now }
});

const fanniSchema = new mongoose.Schema({
  name: String,
  phone: { type: String, unique: true },
  password: String,
  service: String,
  area: String,
  status: { type: String, default: 'pending' },
  isApproved: { type: Boolean, default: false },
  isDisabled: { type: Boolean, default: false },
  balance: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  approvedAt: Date
}, { strict: false });

const topupSchema = new mongoose.Schema({
  fromPhone: String,
  phone: String,
  amount: Number,
  method: String,
  status: { type: String, default: 'pending' },
  walletNumber: { type: String, default: '01152822263' },
  createdAt: { type: Date, default: Date.now },
  approvedAt: Date,
  rejectedAt: Date
}, { strict: false });

const adminSchema = new mongoose.Schema({
  email: String,
  phone: String,
  password: String,
  name: String,
  role: { type: String, default: 'admin' }
}, { strict: false });

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);
const Fanni = mongoose.models.Fanni || mongoose.model('Fanni', fanniSchema);
const Topup = mongoose.models.Topup || mongoose.model('Topup', topupSchema);
const Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);

// انشاء ادمن افتراضي
async function ensureAdmin() {
  await connectDB();
  const count = await Admin.countDocuments();
  if (count === 0) {
    await Admin.create({
      email: 'aasdstarr77@gmail.com',
      phone: '01152822263',
      password: 'aasd139518',
      name: 'الادمن الرئيسي',
      role: 'admin'
    });
    console.log('Default admin created');
  }
}
ensureAdmin();

// ========== دالة توليد الكود المرجعي الجديد - فيه حروف ومستحيل يتكرر ==========
function generateSN() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // بدون I,O
  const randomLetters = Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  const randomNumbers = Math.floor(1000 + Math.random() * 9000);
  const timePart = Date.now().toString(36).toUpperCase().slice(-3);
  return `SN-${randomLetters}${randomNumbers}-${timePart}`;
  // مثال: SN-KTP4839-X7Z
}

async function createOrder(body) {
  await connectDB();
  let sn;
  let exists = true;
  // تأكد ان الكود مش متكرر
  while (exists) {
    sn = generateSN();
    exists = await Order.findOne({ sn });
  }
  
  const o = await Order.create({
    sn: sn,
    service: body.service || body.serviceType || '',
    area: body.area || body.address || '',
    address: body.address || body.area || '',
    clientPhone: body.clientPhone || body.phone || '',
    phone: body.phone || body.clientPhone || '',
    clientName: body.clientName || 'عميل',
    description: body.description || body.desc || '',
    status: 'قيد المراجعة',
    offers: []
  });
  return o;
}

// ========== ADMIN LOGIN ==========
app.post('/api/admin/login', async (req, res) => {
  await connectDB();
  const { phone, email, password } = req.body;
  const admin = await Admin.findOne({
    $and: [
      { $or: [{ email: email }, { phone: phone }, { email: phone }, { phone: email }] },
      { password: password }
    ]
  });
  if (!admin) return res.status(401).json({ message: 'بيانات الادمن غير صحيحة' });
  const token = Buffer.from(admin._id + ':' + Date.now()).toString('base64');
  res.json({ token, admin, data: admin });
});
app.post('/api/admins/login', (req, res) => { req.url = '/api/admin/login'; app.handle(req, res); });
app.post('/api/auth/admin/login', async (req, res) => {
  await connectDB();
  const { phone, email, password } = req.body;
  const admin = await Admin.findOne({
    $and: [
      { $or: [{ email: email }, { phone: phone }, { email: phone }, { phone: email }] },
      { password: password }
    ]
  });
  if (!admin) return res.status(401).json({ message: 'بيانات الادمن غير صحيحة' });
  const token = Buffer.from(admin._id + ':' + Date.now()).toString('base64');
  res.json({ token, admin });
});

app.post('/api/admin/register', async (req, res) => {
  await connectDB();
  const { email, password, phone, name } = req.body;
  if (await Admin.findOne({ email })) return res.status(400).json({ message: 'الادمن موجود' });
  const admin = await Admin.create({ email, password, phone: phone || '', name: name || 'Admin', role: 'admin' });
  res.json({ message: 'تم انشاء الادمن', admin });
});

// ========== ORDERS ==========
app.get('/api/orders', async (req, res) => { await connectDB(); const orders = await Order.find().sort({ createdAt: -1 }); res.json({ orders, data: orders }); });
app.get('/api/client/orders', async (req, res) => { await connectDB(); const orders = await Order.find().sort({ createdAt: -1 }); res.json({ orders, data: orders }); });
app.get('/api/admin/orders', async (req, res) => { await connectDB(); const orders = await Order.find().sort({ createdAt: -1 }); res.json({ orders, data: orders }); });
app.get('/api/orders/available', async (req, res) => { await connectDB(); const orders = await Order.find().sort({ createdAt: -1 }); res.json({ orders, data: orders }); });
app.get('/api/fanni/orders/available', async (req, res) => { await connectDB(); const orders = await Order.find().sort({ createdAt: -1 }); res.json({ orders, data: orders }); });
app.get('/api/fanni/available-orders', async (req, res) => { await connectDB(); const orders = await Order.find().sort({ createdAt: -1 }); res.json({ orders, data: orders }); });

app.get('/api/orders/:sn', async (req, res) => {
  await connectDB();
  const sn = req.params.sn.toUpperCase();
  const order = await Order.findOne({ $or: [{ sn: sn }, { _id: req.params.sn }] });
  if (!order) return res.status(404).json({ message: 'الكود غير موجود' });
  res.json({ order });
});

app.post('/api/orders', async (req, res) => { const o = await createOrder(req.body); res.json({ sn: o.sn, order: o, data: o }); });
app.post('/api/client/orders', async (req, res) => { const o = await createOrder(req.body); res.json({ sn: o.sn, order: o, data: o }); });
app.post('/api/admin/orders', async (req, res) => { const o = await createOrder(req.body); res.json({ sn: o.sn, order: o, data: o }); });

app.patch('/api/orders/:id/status', async (req, res) => {
  await connectDB();
  const order = await Order.findOne({ $or: [{ sn: req.params.id }, { _id: req.params.id }] });
  if (!order) return res.status(404).json({ error: 'not found' });
  order.status = req.body.status; await order.save(); res.json({ order });
});
app.put('/api/orders/:id', async (req, res) => {
  await connectDB();
  const order = await Order.findOne({ $or: [{ sn: req.params.id }, { _id: req.params.id }] });
  if (!order) return res.status(404).json({ error: 'not found' });
  if (req.body.status) order.status = req.body.status; await order.save(); res.json({ order });
});

// ========== FANNIS ==========
app.get('/api/fanni', async (req, res) => { await connectDB(); const fannis = await Fanni.find().sort({ createdAt: -1 }); res.json({ fannis, data: fannis }); });
app.get('/api/fannis', async (req, res) => { await connectDB(); const fannis = await Fanni.find().sort({ createdAt: -1 }); res.json({ fannis, data: fannis }); });
app.get('/api/admin/fannis', async (req, res) => { await connectDB(); const fannis = await Fanni.find().sort({ createdAt: -1 }); res.json({ fannis, data: fannis }); });
app.get('/api/technicians', async (req, res) => { await connectDB(); const fannis = await Fanni.find().sort({ createdAt: -1 }); res.json({ fannis, data: fannis }); });

app.post('/api/fanni/register', async (req, res) => {
  await connectDB();
  const exists = await Fanni.findOne({ phone: req.body.phone });
  if (exists) return res.status(400).json({ message: 'رقم الهاتف مسجل من قبل - انتظر موافقة الادمن' });
  const f = await Fanni.create({ ...req.body, status: 'pending', isApproved: false, isDisabled: false, balance: 0 });
  res.json({ fanni: f, data: f, message: 'تم التسجيل - بانتظار الموافقة' });
});
app.post('/api/fannis/register', (req, res) => { req.url = '/api/fanni/register'; app.handle(req, res); });
app.post('/api/technician/register', (req, res) => { req.url = '/api/fanni/register'; app.handle(req, res); });
app.post('/api/technicians/register', (req, res) => { req.url = '/api/fanni/register'; app.handle(req, res); });
app.post('/api/fanni/signup', (req, res) => { req.url = '/api/fanni/register'; app.handle(req, res); });

async function handleFanniLogin(req, res) {
  await connectDB();
  const { phone, password, clientPhone, phoneNumber } = req.body;
  const p = (phone || clientPhone || phoneNumber || '').replace(/\D/g, '');
  const all = await Fanni.find();
  const f = all.find(x => x.phone && x.phone.replace(/\D/g, '') === p);
  if (!f) return res.status(404).json({ message: 'الحساب غير موجود - سجل حساب جديد' });
  if (f.password && f.password !== password) return res.status(401).json({ message: 'كلمة السر غير صحيحة' });
  if (f.isDisabled) return res.status(403).json({ message: '⛔ حسابك موقوف من الإدارة', status: 'disabled' });
  if (!f.isApproved && f.status !== 'approved') {
    return res.status(423).json({ message: '⏳ حسابك قيد المراجعة من الإدارة', status: 'pending' });
  }
  const token = Buffer.from(f._id + ':' + Date.now()).toString('base64');
  res.json({ token, fanni: f, user: f, data: f, accessToken: token });
}
app.post('/api/fanni/login', handleFanniLogin);
app.post('/api/fannis/login', handleFanniLogin);
app.post('/api/technician/login', handleFanniLogin);
app.post('/api/fanni/signin', handleFanniLogin);
app.post('/api/technicians/login', handleFanniLogin);

// تحكم الفنيين
async function findFanni(id) { await connectDB(); return await Fanni.findOne({ $or: [{ _id: id }, { phone: id }] }); }

async function approveFanniById(req, res) {
  await connectDB();
  const f = await Fanni.findOne({ $or: [{ _id: req.params.id }, { phone: req.params.id }] });
  if (!f) return res.status(404).json({ message: 'الفني غير موجود' });
  f.status = 'approved'; f.isApproved = true; f.isDisabled = false; f.approvedAt = new Date();
  if (req.body.status) f.status = req.body.status;
  await f.save();
  res.json({ message: 'تمت الموافقة', fanni: f, data: f });
}
async function rejectFanniById(req, res) {
  await connectDB();
  const f = await Fanni.findOne({ $or: [{ _id: req.params.id }, { phone: req.params.id }] });
  if (!f) return res.status(404).json({ message: 'الفني غير موجود' });
  f.status = 'rejected'; f.isApproved = false; f.isDisabled = false; await f.save();
  res.json({ message: 'تم الرفض', fanni: f });
}
async function disableFanniById(req, res) {
  await connectDB();
  const f = await Fanni.findOne({ $or: [{ _id: req.params.id }, { phone: req.params.id }] });
  if (!f) return res.status(404).json({ message: 'الفني غير موجود' });
  f.isDisabled = true; f.status = 'disabled'; await f.save();
  res.json({ message: 'تم تعطيل الفني', fanni: f });
}
async function enableFanniById(req, res) {
  await connectDB();
  const f = await Fanni.findOne({ $or: [{ _id: req.params.id }, { phone: req.params.id }] });
  if (!f) return res.status(404).json({ message: 'الفني غير موجود' });
  f.isDisabled = false; f.status = 'approved'; f.isApproved = true; await f.save();
  res.json({ message: 'تمت استعادة الفني', fanni: f });
}

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

app.post('/api/fannis/:id/reject', rejectFanniById);
app.put('/api/fannis/:id/reject', rejectFanniById);
app.post('/api/admin/fannis/:id/reject', rejectFanniById);
app.post('/api/fanni/:id/reject', rejectFanniById);

app.post('/api/fannis/:id/disable', disableFanniById);
app.put('/api/fannis/:id/disable', disableFanniById);
app.post('/api/admin/fannis/:id/disable', disableFanniById);
app.post('/api/fanni/:id/disable', disableFanniById);
app.post('/api/fannis/:id/block', disableFanniById);

app.post('/api/fannis/:id/enable', enableFanniById);
app.put('/api/fannis/:id/enable', enableFanniById);
app.post('/api/fannis/:id/restore', enableFanniById);
app.post('/api/admin/fannis/:id/enable', enableFanniById);
app.post('/api/fanni/:id/enable', enableFanniById);

app.patch('/api/fannis/:id', async (req, res) => {
  await connectDB();
  const f = await Fanni.findOne({ $or: [{ _id: req.params.id }, { phone: req.params.id }] });
  if (!f) return res.status(404).json({ message: 'غير موجود' });
  Object.assign(f, req.body);
  if (req.body.status === 'approved' || req.body.isApproved) { f.isApproved = true; f.status = 'approved'; f.isDisabled = false; }
  await f.save(); res.json({ fanni: f, data: f });
});
app.put('/api/fannis/:id', async (req, res) => {
  await connectDB();
  const f = await Fanni.findOne({ $or: [{ _id: req.params.id }, { phone: req.params.id }] });
  if (!f) return res.status(404).json({ message: 'غير موجود' });
  Object.assign(f, req.body); await f.save(); res.json({ fanni: f, data: f });
});

// ========== WALLET - رقم المحفظة الجديد 01152822263 ==========
app.post('/api/fanni/wallet/topup', async (req, res) => {
  await connectDB();
  const t = await Topup.create({ ...req.body, status: 'pending', walletNumber: '01152822263' });
  res.json({ message: 'تم إرسال طلب الشحن - حول على 01152822263', data: t, topup: t });
});
app.post('/api/fanni/wallet/recharge', (req, res) => { req.url = '/api/fanni/wallet/topup'; app.handle(req, res); });
app.post('/api/fanni/topup', (req, res) => { req.url = '/api/fanni/wallet/topup'; app.handle(req, res); });
app.post('/api/wallet/topup-request', (req, res) => { req.url = '/api/fanni/wallet/topup'; app.handle(req, res); });
app.post('/api/fanni/balance/topup', (req, res) => { req.url = '/api/fanni/wallet/topup'; app.handle(req, res); });
app.post('/api/topup-requests', (req, res) => { req.url = '/api/fanni/wallet/topup'; app.handle(req, res); });

app.get('/api/fanni/wallet/history', async (req, res) => { await connectDB(); const history = await Topup.find().sort({ createdAt: -1 }); res.json({ history, data: history, balance: 0 }); });
app.get('/api/fanni/wallet', async (req, res) => { await connectDB(); const history = await Topup.find().sort({ createdAt: -1 }); res.json({ history, data: history }); });
app.get('/api/fanni/balance/history', async (req, res) => { await connectDB(); const history = await Topup.find().sort({ createdAt: -1 }); res.json({ history, data: history }); });
app.get('/api/topup-requests', async (req, res) => { await connectDB(); const requests = await Topup.find().sort({ createdAt: -1 }); res.json({ requests, data: requests }); });
app.get('/api/topup-requests/my', async (req, res) => { await connectDB(); const history = await Topup.find().sort({ createdAt: -1 }); res.json({ history, data: history }); });
app.get('/api/admin/topup-requests', async (req, res) => { await connectDB(); const requests = await Topup.find().sort({ createdAt: -1 }); res.json({ requests, data: requests }); });
app.get('/api/wallet/topup-requests', async (req, res) => { await connectDB(); const requests = await Topup.find().sort({ createdAt: -1 }); res.json({ requests, data: requests }); });

async function approveTopup(req, res) {
  await connectDB();
  const t = await Topup.findById(req.params.id);
  if (!t) return res.status(404).json({ message: 'طلب الشحن غير موجود' });
  t.status = 'approved'; t.approvedAt = new Date();
  await t.save();
  const f = await Fanni.findOne({ phone: t.fromPhone || t.phone });
  if (f) { f.balance = (f.balance || 0) + Number(t.amount || 0); await f.save(); }
  res.json({ message: 'تم تأكيد الشحن', data: t });
}
async function rejectTopup(req, res) {
  await connectDB();
  const t = await Topup.findById(req.params.id);
  if (!t) return res.status(404).json({ message: 'طلب الشحن غير موجود' });
  t.status = 'rejected'; t.rejectedAt = new Date(); await t.save();
  res.json({ message: 'تم رفض طلب الشحن', data: t });
}
app.post('/api/topup-requests/:id/approve', approveTopup);
app.put('/api/topup-requests/:id/approve', approveTopup);
app.post('/api/admin/topup-requests/:id/approve', approveTopup);
app.put('/api/topup-requests/:id/status', async (req, res) => { if (req.body.status === 'approved') return approveTopup(req, res); if (req.body.status === 'rejected') return rejectTopup(req, res); res.json({}); });
app.post('/api/topup-requests/:id/reject', rejectTopup);
app.put('/api/topup-requests/:id/reject', rejectTopup);
app.post('/api/admin/topup-requests/:id/reject', rejectTopup);
app.post('/api/topup-requests/:id/decline', rejectTopup);

app.post('/api/fanni/orders/:sn/offer', async (req, res) => {
  await connectDB();
  const sn = req.params.sn.toUpperCase();
  const order = await Order.findOne({ $or: [{ sn: sn }, { _id: sn }] });
  if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
  const offer = { _id: Date.now() + '', price: req.body.price, message: req.body.message, createdAt: new Date() };
  order.offers = order.offers || []; order.offers.push(offer); await order.save();
  res.json({ message: 'تم إرسال العرض', offer, data: offer });
});
app.get('/api/fanni/offers', async (req, res) => { await connectDB(); const orders = await Order.find(); const all = orders.flatMap(o => (o.offers || []).map(of => ({ ...of, orderSn: o.sn }))); res.json({ offers: all, data: all }); });
app.get('/api/fanni/my-offers', async (req, res) => { await connectDB(); const orders = await Order.find(); const all = orders.flatMap(o => (o.offers || []).map(of => ({ ...of, orderSn: o.sn }))); res.json({ offers: all, data: all }); });

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
