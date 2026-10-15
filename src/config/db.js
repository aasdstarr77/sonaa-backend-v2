const mongoose = require('mongoose');
const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI غير موجود في .env');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    throw new Error('JWT_SECRET غير موجود أو قصير - يجب 16 حرف على الأقل');
  }
  try {
    const conn = await mongoose.connect(uri, { autoIndex: true });
    console.log(`✓ MongoDB متصل: ${conn.connection.host}`);
    return conn;
  } catch (e) {
    console.error('✗ فشل اتصال MongoDB:', e.message);
    throw e;
  }
};
module.exports = connectDB;
