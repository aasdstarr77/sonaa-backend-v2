
'use strict';

const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGO_URI;

  // التحقق من رابط قاعدة البيانات
  if (!uri) {
    throw new Error('متغير MONGO_URI غير مضبوط في إعدادات البيئة');
  }

  try {
    // إعادة استخدام الاتصال القائم بدل فتح اتصال جديد
    if (mongoose.connection.readyState === 1) {
      return mongoose.connection;
    }

    const conn = await mongoose.connect(uri, {
      autoIndex: true
    });

    console.log(`✓ MongoDB متصل: ${conn.connection.host}`);

    return conn;
  } catch (e) {
    console.error('✗ فشل اتصال MongoDB:', e.message);
    throw e;
  }
};

module.exports = connectDB;
