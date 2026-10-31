'use strict';

const jwt = require('jsonwebtoken');
const Client = require('../models/Client');

async function clientAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'سجّل دخولك بحساب العميل أولًا' });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(503).json({ message: 'تسجيل الدخول غير متاح بسبب إعدادات الخادم' });
    }

    const token = header.slice(7).trim();
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'client' || !payload.id) {
      return res.status(401).json({ message: 'جلسة العميل غير صالحة' });
    }

    const client = await Client.findById(payload.id);
    if (!client) {
      return res.status(401).json({ message: 'حساب العميل غير موجود' });
    }
    if (Number(payload.tokenVersion || 0) !== Number(client.tokenVersion || 0)) {
      return res.status(401).json({ message: 'انتهت صلاحية الجلسة بعد تغيير كلمة المرور. سجّل الدخول مرة أخرى.' });
    }
    if (client.status !== 'نشط') {
      return res.status(403).json({ message: 'حساب العميل موقوف مؤقتًا' });
    }

    req.client = client;
    req.clientId = client._id;
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: error.name === 'TokenExpiredError' ? 'انتهت جلسة الدخول، سجّل الدخول مرة أخرى' : 'جلسة الدخول غير صالحة' });
    }
    return next(error);
  }
}

module.exports = { clientAuth };
