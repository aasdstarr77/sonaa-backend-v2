'use strict';

const AdminAuditLog = require('../models/AdminAuditLog');

function createAdminAuditWriter(adminName) {
  return async function writeAdminAudit(req, action, category, target, details) {
  try {
    await AdminAuditLog.create({
      action: String(action || '').slice(0, 100),
      category: String(category || 'admin').slice(0, 50),
      target: String(target || '').slice(0, 200),
      details: String(details || '').slice(0, 1000),
      adminName: adminName(req),
      adminId: String(req.user?._id || ''),
      ip: String(req.ip || '').slice(0, 80)
    });
  } catch (err) { console.error('Could not write admin audit log:', err.message); }
};
}

async function writeOrderAdminAudit(req, action, target, details) {
  try {
    await AdminAuditLog.create({
      action: String(action || '').slice(0, 100),
      category: 'orders',
      target: String(target || '').slice(0, 200),
      details: String(details || '').slice(0, 1000),
      adminName: String(req.user?.name || req.user?.phone || req.user?.email || 'admin').slice(0, 120),
      adminId: String(req.user?._id || req.userId || ''),
      ip: String(req.ip || '').slice(0, 80)
    });
  } catch (err) {
    console.error('Could not write order admin audit log:', err.message);
  }
}

module.exports = { createAdminAuditWriter, writeOrderAdminAudit };
