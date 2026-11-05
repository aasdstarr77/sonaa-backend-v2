'use strict';

const TTL_MS = 30 * 1000;
const maintenanceCache = { isOn: false, message: '', lastFetch: 0 };
let refreshPromise = null;
let cacheVersion = 0;

async function getMaintenanceStatus(AdminConfig) {
  if (Date.now() - maintenanceCache.lastFetch < TTL_MS) return maintenanceCache;
  if (refreshPromise) return refreshPromise;
  const versionAtStart = cacheVersion;
  refreshPromise = (async () => {
    const config = await AdminConfig.findOne({ key: 'main' })
      .select('settings.maintenance settings.maintenanceMessage')
      .maxTimeMS(5000)
      .lean();
    if (versionAtStart === cacheVersion) {
      maintenanceCache.isOn = Boolean(config?.settings?.maintenance);
      maintenanceCache.message = String(config?.settings?.maintenanceMessage || 'النظام في وضع الصيانة مؤقتًا. حاول مرة أخرى لاحقًا.');
      maintenanceCache.lastFetch = Date.now();
    }
    return maintenanceCache;
  })();
  const pendingRefresh = refreshPromise;
  try { return await pendingRefresh; }
  finally {
    if (refreshPromise === pendingRefresh) refreshPromise = null;
  }
}

function resetMaintenanceCache() {
  cacheVersion += 1;
  maintenanceCache.isOn = false;
  maintenanceCache.message = '';
  maintenanceCache.lastFetch = 0;
  refreshPromise = null;
}

module.exports = { getMaintenanceStatus, resetMaintenanceCache, maintenanceCache };
