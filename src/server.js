
'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const connectDB = require('./config/db');
const orderRouter = require('./routes/order');
const fanniRouter = require('./routes/fanni');
const adminRouter = require('./routes/admin');
const publicRouter = require('./routes/public');
const { auth } = require('./middleware/auth');
const errorHandler = require('./middleware/error');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

// الأمان الأساسي
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// تحديد مكان ملفات الواجهات
const possibleFrontendPaths = [
  path.join(__dirname, '..', 'frontend'),
  path.join(__dirname, 'frontend'),
  path.join(__dirname, '..')
];

const frontendPath = possibleFrontendPaths.find(
  p => fs.existsSync(p) && fs.statSync(p).isDirectory()
) || __dirname;

// تقديم ملفات HTML وCSS وJavaScript والصور
app.use(express.static(frontendPath, {
  index: false,
  dotfiles: 'ignore'
}));

// فحص صحة الخدمة فقط، دون اشتراط اتصال قاعدة البيانات
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'sonaa-backend-v2',
    database: mongoose.connection.readyState === 1
      ? 'connected'
      : 'disconnected',
    time: new Date().toISOString()
  });
});

// الاتصال بقاعدة البيانات عند الحاجة، مع إعادة استخدام الاتصال
async function ensureDatabase(req, res, next) {
  try {
    if (mongoose.connection.readyState !== 1) {
      if (!global.__sonaaMongoPromise) {
        global.__sonaaMongoPromise = connectDB().catch(err => {
          global.__sonaaMongoPromise = null;
          throw err;
        });
      }

      await global.__sonaaMongoPromise;
    }

    next();
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);

    if (!res.headersSent) {
      res.status(503).json({
        ok: false,
        service: 'sonaa-backend-v2',
        database: 'disconnected',
        message: 'قاعدة البيانات غير متاحة حاليًا',
        code: 'DATABASE_UNAVAILABLE',
        time: new Date().toISOString()
      });
    }
  }
}

// فحص API مع التأكد من الاتصال الفعلي بقاعدة البيانات
app.get('/api/health', ensureDatabase, (req, res) => {
  res.json({
    ok: true,
    service: 'sonaa-backend-v2',
    database: mongoose.connection.readyState === 1
      ? 'connected'
      : 'disconnected',
    time: new Date().toISOString()
  });
});

// الحد من محاولات تسجيل الدخول
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'محاولات تسجيل الدخول كثيرة، حاول مرة أخرى بعد قليل'
  }
});

const loginPaths = [
  '/api/fanni/login',
  '/api/fannis/login',
  '/api/technician/login',
  '/api/technicians/login',
  '/api/admin/login',
  '/api/admins/login',
  '/api/auth/admin/login'
];

app.use(loginPaths, loginLimiter);

// جميع مسارات API التي تتعامل مع قاعدة البيانات
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  return ensureDatabase(req, res, next);
});

// مسارات عامة
app.use('/api', publicRouter);

// الطلبات - المسار الأساسي
app.use('/api/orders', orderRouter);

// توافق مع مسارات صفحات العميل القديمة
app.use('/api/client/orders', orderRouter);
app.use('/api/client/order', orderRouter);
app.use('/api/order', orderRouter);
app.use('/api/orders/client', orderRouter);
app.use('/api/orders/sn', orderRouter);

// مسارات الفني وتسجيل الدخول
app.use('/api/fanni', fanniRouter);
app.use('/api/fannis', fanniRouter);
app.use('/api/technician', fanniRouter);
app.use('/api/technicians', fanniRouter);

// مسار عروض الفني المتوافق مع الواجهة القديمة
app.use('/api/fanni/orders', orderRouter);

// لوحة الإدارة وتسجيل دخول الأدمن
app.use('/api/admin', adminRouter);
app.use('/api/admins', adminRouter);
app.use('/api/auth/admin', adminRouter);

// قائمة الطلبات في لوحة الإدارة: للأدمن المصرح له فقط
const Order = require('./models/Order');

app.get('/api/admin/orders', auth('admin'), async (req, res, next) => {
  try {
    const orders = await Order.find({})
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    res.json({ orders, data: orders });
  } catch (err) {
    next(err);
  }
});

// صفحات الموقع
function sendHtml(res, filename) {
  const candidates = [
    path.join(frontendPath, filename),
    path.join(__dirname, filename),
    path.join(__dirname, '..', filename),
    path.join(__dirname, '..', 'frontend', filename)
  ];

  const file = candidates.find(
    p => fs.existsSync(p) && fs.statSync(p).isFile()
  );

  if (!file) {
    return res.status(404).send(`الصفحة ${filename} غير موجودة`);
  }

  return res.sendFile(file);
}

app.get('/', (req, res) => sendHtml(res, 'client.html'));
app.get('/client', (req, res) => sendHtml(res, 'client.html'));
app.get('/fanni', (req, res) => sendHtml(res, 'fanni.html'));
app.get('/admin', (req, res) => sendHtml(res, 'admin.html'));

// رد موحد على مسارات API غير الموجودة
app.use('/api', (req, res) => {
  res.status(404).json({
    message: 'مسار API غير موجود',
    path: req.originalUrl
  });
});

// معالجة أخطاء الخادم
app.use(errorHandler);

module.exports = app;

// التشغيل المحلي
if (require.main === module) {
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`Sunaa server listening on port ${PORT}`);
  });
}
