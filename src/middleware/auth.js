const jwt = require('jsonwebtoken');
const Fanni = require('../models/Fanni');
function auth(requiredRole = null) {
  return async (req, res, next) => {
    try {
      const header = req.headers.authorization;
      if (!header ||!header.startsWith('Bearer ')) return res.status(401).json({ message: 'غير مصرح - Token مفقود' });
      const token = header.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await Fanni.findById(decoded.id);
      if (!user) return res.status(401).json({ message: 'المستخدم غير موجود' });
      if (user.status === 'معلق') return res.status(403).json({ message: `حسابك معلق` });
      if (requiredRole && user.role!== requiredRole && user.role!== 'admin') return res.status(403).json({ message: 'ليس لديك صلاحية' });
      req.user = user; req.userId = user._id;
      next();
    } catch (e) {
      if (e.name === 'JsonWebTokenError') return res.status(401).json({ message: 'Token غير صالح' });
      if (e.name === 'TokenExpiredError') return res.status(401).json({ message: 'انتهت صلاحية الجلسة' });
      next(e);
    }
  };
}
module.exports = { auth };
