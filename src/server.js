
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
const AdminConfig = require('./models/AdminConfig');
const orderRouter = require('./routes/order');
const fanniRouter = require('./routes/fanni');
const adminRouter = require('./routes/admin');
const publicRouter = require('./routes/public');
const clientRouter = require('./routes/client');
const complaintRouter = require('./routes/Complaint');
const notificationsRouter = require('./routes/notifications');
const { auth } = require('./middleware/auth');
const errorHandler = require('./middleware/error');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://sonaa-backend-v2.vercel.app'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Restrict browser access to explicitly configured origins. Requests without
// an Origin header (for example native apps/server-to-server calls) remain valid.
const configuredOrigins = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set([
  ...configuredOrigins,
  'https://sonaa-backend-v2.vercel.app',
  ...(process.env.NODE_ENV === 'production'
    ? []
    : ['http://localhost:3000', 'http://localhost:5173'])
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

const possibleFrontendPaths = [
  path.join(__dirname, '..', 'frontend'),
  path.join(__dirname, 'frontend'),
  path.join(__dirname, '..')
];

const frontendPath = possibleFrontendPaths.find(
  p => fs.existsSync(p) && fs.statSync(p).isDirectory()
) || __dirname;

app.use(express.static(frontendPath, {
  index: false,
  dotfiles: 'ignore'
}));

// اختبار قاعدة البيانات فعليًا، وليس الاكتفاء بحالة الاتصال.
async function checkDatabase(req, res) {
  try {
    await connectDB();

    if (!mongoose.connection.db) {
      throw new Error('MongoDB connection is not ready');
    }

    await mongoose.connection.db.admin().ping();

    return res.status(200).json({
      ok: true,
      service: 'sonaa-backend-v2',
      database: 'connected',
      time: new Date().toISOString()
    });
  } catch (err) {
    console.error('Database health check failed:', err.message);

    if (!res.headersSent) {
      return res.status(503).json({
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

app.get('/health', checkDatabase);
app.get('/api/health', checkDatabase);

// تأمين المسارات التي تعتمد على قاعدة البيانات.
async function ensureDatabase(req, res, next) {
  try {
    // فحص الصحة له معالج مستقل.
    // قائمة الخدمات ثابتة ولا تحتاج اتصال MongoDB.
    
if (req.path === '/health') {

      return next();
    }

    await connectDB();

    if (mongoose.connection.readyState !== 1) {
      throw new Error('MongoDB is not connected');
    }

    // Maintenance mode blocks customer/technician APIs while keeping admin access
    // and public configuration/service lists available to display the notice.
    const maintenanceExempt = ['/health', '/content', '/services', '/areas', '/vodafone-cash'];
    const isAdminPath = req.path.startsWith('/admin') ||
      req.path.startsWith('/admins') || req.path.startsWith('/auth/admin');
    if (!isAdminPath && !maintenanceExempt.includes(req.path)) {
      const config = await AdminConfig.findOne({ key: 'main' })
        .select('settings.maintenance settings.maintenanceMessage')
        .lean();
      if (config?.settings?.maintenance) {
        return res.status(503).json({
          message: String(config.settings.maintenanceMessage || 'النظام في وضع الصيانة مؤقتًا. حاول مرة أخرى لاحقًا.'),
          code: 'MAINTENANCE_MODE'
        });
      }
    }

    return next();
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);

    if (!res.headersSent) {
      return res.status(503).json({
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
  '/api/client/login',
  '/api/client/register',
  '/api/admin/login',
  '/api/admins/login',
  '/api/auth/admin/login'
];

app.use(loginPaths, loginLimiter);

// جميع مسارات API التي تعتمد على قاعدة البيانات تمر عبر هذا الوسيط.
app.use('/api', ensureDatabase);

app.use('/api', publicRouter);
app.use('/api/client', clientRouter);
app.use('/api/notifications', notificationsRouter);

// Public complaint submission/tracking uses order code + name, so limit attempts
// to reduce guessing and spam. This is defense-in-depth, not identity proof.
const complaintLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'محاولات كثيرة. حاول مرة أخرى بعد قليل.' }
});
app.use('/api/complaints', complaintLimiter, complaintRouter);
app.use('/api/orders', orderRouter);

// التوافق مع المسارات القديمة لواجهة العميل.
app.use('/api/client/orders', orderRouter);
app.use('/api/client/order', orderRouter);
app.use('/api/order', orderRouter);
app.use('/api/orders/client', orderRouter);
app.use('/api/orders/sn', orderRouter);

app.use('/api/fanni', fanniRouter);
app.use('/api/fannis', fanniRouter);
app.use('/api/technician', fanniRouter);
app.use('/api/technicians', fanniRouter);

// مسار عروض الفني.
app.use('/api/fanni/orders', orderRouter);

app.use('/api/admin', adminRouter);
app.use('/api/admins', adminRouter);
app.use('/api/auth/admin', adminRouter);

// قائمة الطلبات للأدمن المصرح له فقط.
const Order = require('./models/Order');

app.get('/api/admin/orders', auth('admin'), async (req, res, next) => {
  try {
    const orders = await Order.find({})
      .populate('assignedFanni', 'name phone specialties areas')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    return res.json({ orders, data: orders });
  } catch (err) {
    return next(err);
  }
});

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

app.get('/', (req, res) => sendHtml(res, 'index.html'));
app.get('/client', (req, res) => sendHtml(res, 'client.html'));
app.get('/fanni', (req, res) => sendHtml(res, 'fanni.html'));
app.get('/admin', (req, res) => sendHtml(res, 'admin.html'));

app.use('/api', (req, res) => {
  return res.status(404).json({
    message: 'مسار API غير موجود',
    path: req.originalUrl
  });
});

app.use(errorHandler);

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`Sunaa server listening on port ${PORT}`);
  });
}
