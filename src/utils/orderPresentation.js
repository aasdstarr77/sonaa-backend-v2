'use strict';

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function toWesternDigits(value) {
  return String(value).replace(/[٠-٩۰-۹]/g, digit => {
    const arabicIndex = ARABIC_DIGITS.indexOf(digit);
    if (arabicIndex !== -1) return String(arabicIndex);
    return String(PERSIAN_DIGITS.indexOf(digit));
  });
}

function containsEgyptianMobile(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const normalized = toWesternDigits(value);
  const chunks = normalized.match(/\d(?:[\s().+-_/\،,؛:]*\d){9,15}/g) || [];
  return chunks.some(chunk => {
    const digits = chunk.replace(/\D/g, '');
    return /01[0125]\d{8}/.test(digits) ||
      /201[0125]\d{8}/.test(digits) ||
      /00201[0125]\d{8}/.test(digits);
  });
}

function sanitizeText(value) {
  if (typeof value !== 'string') return value;
  if (containsEgyptianMobile(value)) {
    return '[تم إخفاء التفاصيل لاحتوائها على رقم تواصل]';
  }
  return value;
}

function findPhoneContainingField(fields) {
  for (const [fieldName, value] of Object.entries(fields)) {
    if (typeof value === 'string' && containsEgyptianMobile(value)) return fieldName;
  }
  return null;
}

function sanitizeOffer(offer) {
  const safeOffer = typeof offer.toObject === 'function' ? offer.toObject() : { ...offer };
  delete safeOffer.fanniPhone;
  delete safeOffer.phone;
  delete safeOffer.fanniId;
  delete safeOffer.fanni;
  if (typeof safeOffer.message === 'string') safeOffer.message = sanitizeText(safeOffer.message);
  return safeOffer;
}

function publicOrder(order, options = {}) {
  const {
    includeAddress = true,
    includeAssignedFanniPhone = false,
    includeClientName = true
  } = options;
  if (!order) return null;
  const data = typeof order.toObject === 'function' ? order.toObject() : { ...order };
  const assignedFanniId = data.assignedFanni;
  data.hasVoiceRecording = Boolean(data.voiceRecordingData);
  delete data.voiceRecordingData;
  if (!includeAddress) delete data.address;
  if (!includeClientName) delete data.clientName;
  delete data.clientPhone;
  delete data.phone;
  delete data.clientAccount;
  delete data.assignedFanni;
  delete data.assignedFanniPhone;
  // Platform commission is internal financial data and must never be exposed in client-facing order payloads.
  delete data.commissionRate;
  delete data.commissionAmount;
  delete data.commissionCharged;
  delete data.commissionChargedAt;
  if (includeAssignedFanniPhone && data.status === 'تم اختيار فني' && assignedFanniId) {
    const acceptedOffer = Array.isArray(data.offers)
      ? data.offers.find(offer =>
          (data.acceptedOfferId && String(offer._id) === String(data.acceptedOfferId)) ||
          (!data.acceptedOfferId && String(offer.fanni) === String(assignedFanniId)))
      : null;
    if (acceptedOffer && typeof acceptedOffer.fanniPhone === 'string' && acceptedOffer.fanniPhone.trim()) {
      data.assignedFanniPhone = acceptedOffer.fanniPhone;
    }
  }
  if (typeof data.description === 'string') data.description = sanitizeText(data.description);
  if (typeof data.desc === 'string') data.desc = sanitizeText(data.desc);
  if (Array.isArray(data.offers)) {
    const seenTechnicians = new Set();
    const uniqueOffers = [];
    for (const offer of data.offers) {
      const technicianId = String(offer?.fanni?._id || offer?.fanni || offer?.fanniId || '').trim();
      const offerId = String(offer?._id || offer?.id || '').trim();
      const key = technicianId ? `fanni:${technicianId}` : offerId ? `offer:${offerId}` : '';
      if (key && seenTechnicians.has(key)) continue;
      if (key) seenTechnicians.add(key);
      uniqueOffers.push(offer);
    }
    data.offers = uniqueOffers.map(sanitizeOffer);
  }
  return data;
}

function createFanniCanHandleService({ CATEGORIES, normalizeServiceName }) {
  return function fanniCanHandleService(specialties, serviceName) {
    if (!Array.isArray(specialties) || !serviceName) return false;
    const normalizedService = normalizeServiceName(serviceName);
    if (!normalizedService) return false;
    const normalizedSpecialties = specialties
      .filter(value => typeof value === 'string')
      .map(normalizeServiceName)
      .filter(Boolean);
    if (normalizedSpecialties.includes(normalizedService)) return true;
    const category = CATEGORIES.find(item =>
      item.services.some(service => normalizeServiceName(service) === normalizedService)
    );
    if (!category) return false;
    return normalizedSpecialties.includes(normalizeServiceName(category.label));
  };
}

module.exports = {
  toWesternDigits,
  containsEgyptianMobile,
  sanitizeText,
  findPhoneContainingField,
  sanitizeOffer,
  publicOrder,
  createFanniCanHandleService
};
