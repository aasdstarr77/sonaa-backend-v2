'use strict';

module.exports = (err, req, res, next) => {
  // Keep diagnostic details in server logs only; never send stack traces or
  // database/JWT/provider messages back to clients.
  console.error('Request failed:', {
    method: req.method,
    path: req.originalUrl,
    name: err && err.name,
    message: err && err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err && err.stack
  });

  if (res.headersSent) return next(err);

  if (err && err.name === 'ValidationError') {
    return res.status(400).json({ message: 'البيانات المرسلة غير صحيحة.' });
  }
  if (err && err.code === 11000) {
    return res.status(409).json({ message: 'بيانات مكررة' });
  }

  const status = Number(err && err.status);
  if (status >= 400 && status < 500) {
    return res.status(status).json({ message: 'تعذر تنفيذ الطلب. راجع البيانات والصلاحيات.' });
  }

  return res.status(500).json({ message: 'حدث خطأ داخلي. حاول مرة أخرى لاحقًا.' });
};
