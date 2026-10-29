
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
const supportRouter = require('./routes/support');
const passwordRecoveryRouter = require('./routes/passwordRecovery');
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
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      mediaSrc: ["'self'", 'blob:', 'data:'],
      connectSrc: ["'self'", 'https://sonaa-backend-v2.vercel.app'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"]
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
  path.join(__dirname, '..', 'frontend-dist'),
  path.join(__dirname, '..', 'frontend'),
  path.join(__dirname, 'frontend'),
  path.join(__dirname, '..')
];

const frontendPath = possibleFrontendPaths.find(
  p => fs.existsSync(p) && fs.statSync(p).isDirectory()
) || __dirname;

// Serve the editor and other repository frontend files from an explicit absolute path.
// The explicit sendFile route is a fallback if static middleware does not resolve the file.
const repositoryFrontendPath = path.join(__dirname, '../frontend');
app.use('/frontend', (req, res, next) => {
  // Allow same-origin editor previews; never send DENY for these pages.
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
}, express.static(repositoryFrontendPath, {
  index: false,
  dotfiles: 'ignore'
}));
app.get('/frontend/editor.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/editor.html'));
});

app.use(express.static(frontendPath, {
  index: false,
  dotfiles: 'ignore'
}));

// Serve official Sonaa brand assets from the repository public folder.
app.use('/images', express.static(path.join(__dirname, '..', 'public', 'images'), {
  dotfiles: 'ignore',
  fallthrough: false,
  immutable: true,
  maxAge: '7d'
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
    const maintenanceExempt = ['/health', '/content', '/services', '/areas'];
    const isAdminPath = req.path.startsWith('/admin') ||
      req.path.startsWith('/admins') || req.path.startsWith('/auth/admin');
    if (!isAdminPath && !maintenanceExempt.includes(req.path)) {
      const config = await AdminConfig.findOne({ key: 'main' })
        .select('settings.maintenance settings.maintenanceMessage')
        .maxTimeMS(5000)
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

const fanniRegistrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: async () => {
    try {
      const config = await AdminConfig.findOne({ key: 'main' })
        .select('settings.maxFanniSignupAttempts')
        .lean();
      const configured = Number(config?.settings?.maxFanniSignupAttempts);
      return Number.isInteger(configured) && configured >= 1 && configured <= 100 ? configured : 5;
    } catch (_) { return 5; }
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'تم تجاوز الحد المسموح لمحاولات تسجيل الفني. حاول مرة أخرى بعد 15 دقيقة.' }
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

const PageVisit = require('./models/PageVisit');
const pageVisitLimiter = rateLimit({windowMs:60000,limit:60,standardHeaders:true,legacyHeaders:false});
const TRACKABLE_PAGES = new Set(['home','client-app','technician-app','customer-registration-info','technician-registration-info','client-login','client-register','technician-login','technician-register','client-dashboard','technician-dashboard','admin-login','admin-dashboard','password-recovery']);
app.post('/api/page-visits', pageVisitLimiter, async (req,res)=>{try{const pageKey=String(req.body?.pageKey||'').trim().slice(0,80),pageName=String(req.body?.pageName||'').trim().slice(0,160),rawPath=String(req.body?.path||'/').split('?')[0].slice(0,300),referrer=String(req.body?.referrer||'').slice(0,300),visitorId=String(req.body?.visitorId||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80);if(!TRACKABLE_PAGES.has(pageKey)||!pageName)return res.status(400).json({message:'بيانات الزيارة غير صالحة'});await PageVisit.create({pageKey,pageName,path:rawPath.startsWith('/')?rawPath:'/',referrer,visitorId});return res.status(202).json({ok:true});}catch(err){return res.status(202).json({ok:false});}});

app.use(['/api/fanni/register', '/api/fannis/register', '/api/technician/register', '/api/technicians/register'], fanniRegistrationLimiter);

app.use('/api', publicRouter);
app.use('/api/client', clientRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/support', supportRouter);
app.use('/api/password-recovery', passwordRecoveryRouter);

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
    const [orders, voiceOrders] = await Promise.all([
      Order.find({})
        .populate('assignedFanni', 'name phone specialties areas')
        .sort({ createdAt: -1 })
        .limit(500)
        .lean(),
      Order.find({ voiceRecordingData: { $exists: true, $ne: '' } }).select('sn').lean()
    ]);
    const voiceOrderSNs = new Set(voiceOrders.map(order => String(order.sn || '').toUpperCase()));
    const safeOrders = orders.map(order => ({ ...order, hasVoiceRecording: voiceOrderSNs.has(String(order.sn || '').toUpperCase()) }));
    return res.json({ orders: safeOrders, data: safeOrders });
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
app.get('/technicians', (req, res) => sendHtml(res, 'technicians.html'));
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
