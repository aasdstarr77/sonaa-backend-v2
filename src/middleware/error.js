module.exports = (err, req, res, next) => {
  console.error('ERROR:', err.message);
  if (err.name === 'ValidationError') return res.status(400).json({ message: err.message });
  if (err.code === 11000) return res.status(409).json({ message: 'بيانات مكررة' });
  res.status(err.status || 500).json({ message: err.message || 'خطأ في الخادم' });
};
