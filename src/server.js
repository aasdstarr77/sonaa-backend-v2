const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));

// فين مكان frontend - جرب كذا مكان
let fp = path.join(__dirname, '..', 'frontend');
if (!fs.existsSync(fp)) fp = path.join(__dirname, 'frontend');
if (!fs.existsSync(fp)) fp = path.join(__dirname, '..');
if (!fs.existsSync(fp)) fp = __dirname;

console.log('Frontend path:', fp);

app.use(express.static(fp));

// قاعدة بيانات بسيطة تحفظ في ملف عشان Vercel
const DB_FILE = path.join('/tmp', 'sonaa_db.json');
let DB = { orders: [], fannis: [], c: 1001 };

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (parsed.orders) DB = parsed;
      console.log('DB loaded:', DB.orders.length, 'orders');
    }
  } catch (e) { console.log('DB load error:', e.message); }
}

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(DB));
  } catch (e) { console.log('DB save error:', e.message); }
}

loadDB();

// دالة إنشاء طلب موحدة
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
  DB.orders.unshift(o); // الجديد فوق
  saveDB();
  console.log('Order created:', o.sn, '- Total:', DB.orders.length);
  return o;
}

// ========== APIs - كلهم بيقرأوا من نفس المكان ==========

// قراءة كل الطلبات - للأدمن والفني والعميل
app.get('/api/orders', (req, res) => {
  loadDB();
  res.json({ orders: DB.orders, data: DB.orders });
});
app.get('/api/client/orders', (req, res) => {
  loadDB();
  res.json({ orders: DB.orders, data: DB.orders });
});
app.get('/api/admin/orders', (req, res) => {
  loadDB();
  res.json({ orders: DB.orders, data: DB.orders });
});

// قراءة طلب واحد بالـ SN
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

// إنشاء طلب - من العميل
app.post('/api/orders', (req, res) => {
  loadDB();
  const o = createOrder(req.body);
  res.json({ sn: o.sn, order: o, data: o });
});
app.post('/api/client/orders', (req, res) => {
  loadDB();
  const o = createOrder(req.body);
  res.json({ sn: o.sn, order: o, data: o });
});
app.post('/api/admin/orders', (req, res) => {
  loadDB();
  const o = createOrder(req.body);
  res.json({ sn: o.sn, order: o, data: o });
});

// تحديث حالة الطلب - للأدمن
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

// فنيين
app.get('/api/fanni', (req, res) => {
  loadDB();
  res.json({ fannis: DB.fannis, data: DB.fannis, fanni: DB.fannis });
});
app.get('/api/fannis', (req, res) => {
  loadDB();
  res.json({ fannis: DB.fannis, data: DB.fannis });
});
app.post('/api/fanni/register', (req, res) => {
  loadDB();
  const f = { _id: Date.now() + '', ...req.body, status: 'قيد المراجعة', createdAt: new Date() };
  DB.fannis.push(f);
  saveDB();
  res.json({ fanni: f, data: f });
});

// شكاوى
app.post('/api/complaints', (req, res) => {
  console.log('Complaint:', req.body);
  res.json({ ok: true, message: 'تم استلام الشكوى' });
});
app.post('/api/client/complaints', (req, res) => {
  console.log('Complaint:', req.body);
  res.json({ ok: true });
});

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

// للـ Vercel
module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log('Server running on', PORT));
}
