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
let isConnected = false;
async function connectDB() {
  if (isConnected && mongoose.connection.readyState === 1) return;
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000, socketTimeoutMS: 10000 });
    }
    isConnected = true;
  } catch (err) {
    console.error('Mongo Error:', err.message);
  }
}

const orderSchema = new mongoose.Schema({
  sn: { type: String, unique: true, required: true, index: true },
  service: String, area: String, address: String,
  clientPhone: String, phone: String, clientName: String,
  description: String, status: { type: String, default: 'قيد المراجعة' },
  offers: { type: Array, default: [] },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'orders' });

const fanniSchema = new mongoose.Schema({
  name: String, phone: { type: String, unique: true, index: true },
  password: String, service: String, area: String,
  status: { type: String, default: 'pending' },
  isApproved: { type: Boolean, default: false },
  isDisabled: { type: Boolean, default: false },
  balance: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }, approvedAt: Date
}, { strict: false, collection: 'fannis' });

const topupSchema = new mongoose.Schema({
  fromPhone: String, phone: String, amount: Number, method: String,
  status: { type: String, default: 'pending', index: true },
  walletNumber: { type: String, default: '01152822263' },
  createdAt: { type: Date, default: Date.now }, approvedAt: Date, rejectedAt: Date
}, { strict: false, collection: 'topups' });

const adminSchema = new mongoose.Schema({
  email: String, phone: String, password: String, name: String, role: String
}, { strict: false, collection: 'admins' });

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);
const Fanni = mongoose.models.Fanni || mongoose.model('Fanni', fanniSchema);
const Topup = mongoose.models.Topup || mongoose.model('Topup', topupSchema);
const Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);

async function ensureAdmin() {
  try {
    await connectDB();
    const count = await Admin.countDocuments();
    if (count === 0) {
      await Admin.create({ email: 'aasdstarr77@gmail.com', phone: '01152822263', password: 'aasd139518', name: 'الادمن الرئيسي', role: 'admin' });
      console.log('Admin created 01152822263');
    }
  } catch(e){}
}
ensureAdmin();

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

app.post('/api/admin/login', async (req, res) => {
  await connectDB();
  const { phone, email, password } = req.body;
  const admin = await Admin.findOne({ $and: [{ $or: [{ email }, { phone }, { email: phone }, { phone: email }] }, { password }] });
  if (!admin) return res.status(401).json({ message: 'بيانات غير صحيحة' });
  const token = Buffer.from(admin._id + ':' + Date.now()).toString('base64');
  res.json({ token, admin, data: admin });
});
app.post('/api/admins/login', (req, res) => { req.url = '/api/admin/login'; app.handle(req, res); });
app.post('/api/auth/admin/login', (req, res) => { req.url = '/api/admin/login'; app.handle(req, res); });

app.get('/api/orders', async (req, res) => { await connectDB(); const orders = await Order.find().sort({ createdAt: -1 }).limit(100).lean(); res.json({ orders, data: orders }); });
app.get('/api/client/orders', async (req, res) => { await connectDB(); const orders = await Order.find().sort({ createdAt: -1 }).limit(100).lean(); res.json({ orders, data: orders }); });
app.get('/api/admin/orders', async (req, res) => { await connectDB(); const orders = await Order.find().sort({ createdAt: -1 }).limit(100).lean(); res.json({ orders, data: orders }); });
app.get('/api/orders/available', async (req, res) => { await connectDB(); const orders = await Order.find().sort({ createdAt: -1 }).limit(100).lean(); res.json({ orders, data: orders }); });
app.get('/api/fanni/orders/available', async (req, res) => { await connectDB(); const orders = await Order.find().sort({ createdAt: -1 }).limit(100).lean(); res.json({ orders, data: orders }); });
app.get('/api/fanni/available-orders', async (req, res) => { await connectDB(); const orders = await Order.find().sort({ createdAt: -1 }).limit(100).lean(); res.json({ orders, data: orders }); });
app.get('/api/orders/:sn', async (req, res) => {
  await connectDB();
  const sn = req.params.sn.toUpperCase();
  const order = await Order.findOne({ $or: [{ sn }, { _id: req.params.sn }] }).lean();
  if (!order) return res.status(404).json({ message: 'غير موجود' });
  res.json({ order });
});
app.post('/api/orders', async (req, res) => { try{ const o = await createOrder(req.body); res.json({ sn: o.sn, order: o, data: o }); }catch(e){ res.status(500).json({message:e.message}); } });
app.post('/api/client/orders', async (req, res) => { try{ const o = await createOrder(req.body); res.json({ sn: o.sn, order: o, data: o }); }catch(e){ res.status(500).json({message:e.message}); } });
app.post('/api/admin/orders', async (req, res) => { try{ const o = await createOrder(req.body); res.json({ sn: o.sn, order: o, data: o }); }catch(e){ res.status(500).json({message:e.message}); } });

app.get('/api/fannis', async (req, res) => { await connectDB(); const fannis = await Fanni.find().sort({ createdAt: -1 }).lean(); res.json({ fannis, data: fannis }); });
app.get('/api/fanni', async (req, res) => { await connectDB(); const fannis = await Fanni.find().sort({ createdAt: -1 }).lean(); res.json({ fannis, data: fannis }); });
app.get('/api/admin/fannis', async (req, res) => { await connectDB(); const fannis = await Fanni.find().sort({ createdAt: -1 }).lean(); res.json({ fannis, data: fannis }); });
app.get('/api/technicians', async (req, res) => { await connectDB(); const fannis = await Fanni.find().sort({ createdAt: -1 }).lean(); res.json({ fannis, data: fannis }); });

app.post('/api/fanni/register', async (req, res) => {
  await connectDB();
  const exists = await Fanni.findOne({ phone: req.body.phone });
  if (exists) return res.status(400).json({ message: 'الرقم مسجل' });
  const f = await Fanni.create({ ...req.body, status: 'pending', isApproved: false, isDisabled: false, balance: 0 });
  res.json({ fanni: f, data: f });
});
app.post('/api/fannis/register', (req, res) => { req.url = '/api/fanni/register'; app.handle(req, res); });
app.post('/api/technicians/register', (req, res) => { req.url = '/api/fanni/register'; app.handle(req, res); });
app.post('/api/fanni/signup', (req, res) => { req.url = '/api/fanni/register'; app.handle(req, res); });

async function handleFanniLogin(req, res) {
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
}
app.post('/api/fanni/login', handleFanniLogin);
app.post('/api/fannis/login', handleFanniLogin);
app.post('/api/technician/login', handleFanniLogin);

async function approveFanniById(req, res) {
  await connectDB();
  const f = await Fanni.findOne({ $or: [{ _id: req.params.id }, { phone: req.params.id }] });
  if (!f) return res.status(404).json({ message: 'غير موجود' });
  f.status = 'approved'; f.isApproved = true; f.isDisabled = false; f.approvedAt = new Date(); await f.save();
  res.json({ message: 'تمت الموافقة', fanni: f, data: f });
}
async function rejectFanniById(req, res) {
  await connectDB();
  const f = await Fanni.findOne({ $or: [{ _id: req.params.id }, { phone: req.params.id }] });
  if (!f) return res.status(404).json({ message: 'غير موجود' });
  f.status = 'rejected'; f.isApproved = false; await f.save();
  res.json({ message: 'تم الرفض', fanni: f });
}
async function disableFanniById(req, res) {
  await connectDB();
  const f = await Fanni.findOne({ $or: [{ _id: req.params.id }, { phone: req.params.id }] });
  if (!f) return res.status(404).json({ message: 'غير موجود' });
  f.isDisabled = true; f.status = 'disabled'; await f.save();
  res.json({ message: 'تم التعطيل', fanni: f });
}
async function enableFanniById(req, res) {
  await connectDB();
  const f = await Fanni.findOne({ $or: [{ _id: req.params.id }, { phone: req.params.id }] });
  if (!f) return res.status(404).json({ message: 'غير موجود' });
  f.isDisabled = false; f.status = 'approved'; f.isApproved = true; await f.save();
  res.json({ message: 'تمت الاستعادة', fanni: f });
}

app.post('/api/fannis/:id/approve', approveFanniById);
app.put('/api/fannis/:id/approve', approveFanniById);
app.post('/api/fanni/:id/approve', approveFanniById);
app.post('/api/admin/fannis/:id/approve', approveFanniById);
app.post('/api/fannis/:id/activate', approveFanniById);
app.post('/api/fannis/:id/reject', rejectFanniById);
app.post('/api/admin/fannis/:id/reject', rejectFanniById);
app.post('/api/fannis/:id/disable', disableFanniById);
app.post('/api/admin/fannis/:id/disable', disableFanniById);
app.post('/api/fannis/:id/block', disableFanniById);
app.post('/api/fannis/:id/enable', enableFanniById);
app.post('/api/admin/fannis/:id/enable', enableFanniById);
app.post('/api/fannis/:id/restore', enableFanniById);

app.post('/api/admin/fannis/:id/set-balance', async (req, res) => {
  await connectDB();
  const f = await Fanni.findOne({ $or: [{ _id: req.params.id }, { phone: req.params.id }] });
  if (!f) return res.status(404).json({ message: 'الفني غير موجود' });
  const amount = Number(req.body.amount);
  if (isNaN(amount)) return res.status(400).json({ message: 'مبلغ غير صحيح' });
  f.balance = amount; await f.save();
  res.json({ message: `تم تعيين رصيد ${f.name||f.phone} إلى ${amount}ج`, fanni: f });
});
app.post('/api/admin/fannis/:id/add-balance', async (req, res) => {
  await connectDB();
  const f = await Fanni.findOne({ $or: [{ _id: req.params.id }, { phone: req.params.id }] });
  if (!f) return res.status(404).json({ message: 'الفني غير موجود' });
  const amount = Number(req.body.amount);
  f.balance = (f.balance||0) + amount; await f.save();
  res.json({ message: `تم إضافة ${amount}ج - الرصيد الآن ${f.balance}ج`, fanni: f });
});

app.post('/api/fanni/wallet/topup', async (req, res) => {
  await connectDB();
  const t = await Topup.create({ ...req.body, status: 'pending', walletNumber: '01152822263' });
  res.json({ message: 'تم إرسال الطلب - حول على 01152822263', data: t, topup: t });
});
app.post('/api/fanni/wallet/recharge', (req, res) => { req.url = '/api/fanni/wallet/topup'; app.handle(req, res); });
app.post('/api/topup-requests', (req, res) => { req.url = '/api/fanni/wallet/topup'; app.handle(req, res); });

app.get('/api/topup-requests', async (req, res) => { await connectDB(); const requests = await Topup.find().sort({ createdAt: -1 }).limit(100).lean(); res.json({ requests, data: requests }); });
app.get('/api/admin/topup-requests', async (req, res) => { await connectDB(); const requests = await Topup.find().sort({ createdAt: -1 }).limit(100).lean(); res.json({ requests, data: requests }); });
app.get('/api/wallet/topup-requests', async (req, res) => { await connectDB(); const requests = await Topup.find().sort({ createdAt: -1 }).limit(100).lean(); res.json({ requests, data: requests }); });
app.get('/api/fanni/wallet/history', async (req, res) => { await connectDB(); const history = await Topup.find().sort({ createdAt: -1 }).limit(100).lean(); res.json({ history, data: history }); });

async function approveTopup(req, res) {
  await connectDB();
  const t = await Topup.findById(req.params.id);
  if (!t) return res.status(404).json({ message: 'طلب غير موجود' });
  if (t.status === 'approved') return res.json({ message: 'مقبول من قبل', data: t });
  t.status = 'approved'; t.approvedAt = new Date(); await t.save();
  let f = await Fanni.findOne({ phone: t.fromPhone }) || await Fanni.findOne({ phone: t.phone });
  if (!f) {
    const all = await Fanni.find().lean();
    const clean = (t.fromPhone || t.phone || '').replace(/\D/g, '');
    const found = all.find(x => x.phone && x.phone.replace(/\D/g, '') === clean);
    if (found) f = await Fanni.findById(found._id);
  }
  if (f) {
    f.balance = (f.balance || 0) + Number(t.amount || 0); await f.save();
    return res.json({ message: `تم قبول الشحن وإضافة ${t.amount}ج لرصيد ${f.name||f.phone} - الآن ${f.balance}ج`, data: t });
  } else {
    return res.json({ message: `تم القبول لكن الفني ${t.fromPhone||t.phone} غير موجود - الرصيد لم يضاف`, data: t });
  }
}
async function rejectTopup(req, res) {
  await connectDB();
  const t = await Topup.findById(req.params.id);
  if (!t) return res.status(404).json({ message: 'غير موجود' });
  t.status = 'rejected'; t.rejectedAt = new Date(); await t.save();
  res.json({ message: 'تم رفض الشحن', data: t });
}
app.post('/api/topup-requests/:id/approve', approveTopup);
app.put('/api/topup-requests/:id/approve', approveTopup);
app.post('/api/admin/topup-requests/:id/approve', approveTopup);
app.post('/api/topup-requests/:id/reject', rejectTopup);
app.post('/api/admin/topup-requests/:id/reject', rejectTopup);

app.post('/api/fanni/orders/:sn/offer', async (req, res) => {
  await connectDB();
  const sn = req.params.sn.toUpperCase();
  const order = await Order.findOne({ $or: [{ sn }, { _id: sn }] });
  if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
  const offer = { _id: Date.now() + '', price: req.body.price, message: req.body.message, fanniName: req.body.fanniName||'فني', createdAt: new Date() };
  order.offers = order.offers || []; order.offers.push(offer); await order.save();
  res.json({ message: 'تم', offer, data: offer });
});

app.get('/', (req, res) => { res.sendFile(path.join(fp, 'client.html')); });
app.get('/admin', (req, res) => { res.sendFile(path.join(fp, 'admin.html')); });
app.get('/fanni', (req, res) => { res.sendFile(path.join(fp, 'fanni.html')); });
app.get('/client', (req, res) => { res.sendFile(path.join(fp, 'client.html')); });

module.exports = app;
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log('Server running', PORT));
}
