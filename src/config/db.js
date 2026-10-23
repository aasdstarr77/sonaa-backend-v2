
'use strict';

const mongoose = require('mongoose');

let connectionPromise = null;

async function connectDB() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error('متغير MONGO_URI غير مضبوط في إعدادات البيئة');
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // مشاركة محاولة الاتصال الجارية بدل إنشاء محاولات متزامنة.
  if (connectionPromise) {
    return connectionPromise;
  }

  const pending = mongoose.connect(uri, {
    autoIndex: true,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000
  })
    .then(() => {
      console.log(
        `✓ MongoDB متصل: ${mongoose.connection.host}`
      );

      return mongoose.connection;
    })
    .catch((error) => {
      console.error(
        '✗ فشل اتصال MongoDB:',
        error.message
      );

      throw error;
    })
    .finally(() => {
      // لا تحتفظ بوعد انتهى؛ حتى يمكن إعادة المحاولة لاحقًا.
      if (connectionPromise === pending) {
        connectionPromise = null;
      }
    });

  connectionPromise = pending;

  return pending;
}

module.exports = connectDB;
