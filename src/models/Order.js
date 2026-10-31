'use strict';

const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
fanni: {
type: mongoose.Schema.Types.ObjectId,
ref: 'Fanni',
required: true
},

fanniId: {
type: String,
trim: true
},

fanniName: {
type: String,
trim: true,
maxlength: 50
},

fanniLevel: {
type: String,
trim: true,
maxlength: 30,
default: 'مبتدئ'
},

// لقطة من شارات الفني وقت تقديم العرض، وتُحدّث للعروض القديمة عند عرض الطلب.
fanniBadges: {
type: [String],
enum: ['trusted', 'top_rated', 'verified', 'fast_response', 'premium', 'gold'],
default: []
},

fanniPhone: {
type: String,
trim: true
},

price: {
type: String,
required: true,
trim: true
},

priceNum: {
type: Number,
min: 0
},

message: {
type: String,
trim: true,
maxlength: 500
},

date: {
type: Date,
default: Date.now
}
}, {
_id: true
});

const orderSchema = new mongoose.Schema({
sn: {
type: String,
required: true,
unique: true,
index: true,
trim: true,
uppercase: true,
match: /^SN\d{6}$/
},

// حساب العميل صاحب الطلب؛ يظل اختياريًا لتوافق الطلبات القديمة.
clientAccount: {
type: mongoose.Schema.Types.ObjectId,
ref: 'Client',
default: null,
index: true
},
// Timestamp marks when a legacy tracking token was invalidated by account linking.
clientAccountLinkedAt: { type: Date, default: null },

service: {
type: String,
required: true,
trim: true,
maxlength: 100,
index: true
},

// المنطقة العامة أو الحي.
area: {
type: String,
required: true,
trim: true,
maxlength: 250
},

// العنوان التفصيلي للعميل.
// لا يجوز عرضه للفني قبل قبول عرضه وتعيينه على الطلب.
address: {
type: String,
trim: true,
maxlength: 250,
default: ''
},

city: {
type: String,
trim: true,
maxlength: 100
},

clientName: {
type: String,
trim: true,
maxlength: 50,
default: 'عميل'
},

clientPhone: {
type: String,
required: true,
trim: true
},

description: {
type: String,
trim: true,
maxlength: 1000
},

voiceRecordingData: { type: String, select: false, maxlength: 520000 },

// لا يسمح بنشر الطلب الذي يحتوي على تسجيل قبل تأكيد مراجعته من الإدارة.
voiceReviewedAt: { type: Date, default: null },
voiceReviewedBy: { type: String, trim: true, maxlength: 120, default: '' },

budget: {
type: String,
trim: true,
maxlength: 50,
default: ''
},

status: {
type: String,
enum: [
'قيد المراجعة',
'تم النشر',
'وصلتك عروض',
'تم اختيار فني',
'تم الانتهاء',
'منتهي',
'اعتذار',
'منتهي - اعتذار',
'ملغي',
'مؤرشف'
],
default: 'قيد المراجعة',
index: true
},

// سجل آخر إجراء إداري على الطلب.
adminActionNote: { type: String, trim: true, maxlength: 500, default: '' },
adminActionAt: { type: Date, default: null },
adminActionBy: { type: String, trim: true, maxlength: 120, default: '' },

// محادثة الطلب وسجل تعديلات السعر الموافق عليها.
chatMessages: [{ senderRole: { type: String, enum: ['client', 'fanni'], required: true }, senderId: { type: String, default: '' }, targetOfferId: { type: String, default: '' }, text: { type: String, required: true, maxlength: 1000 }, createdAt: { type: Date, default: Date.now } }],
priceChangeRequests: [{ fanniId: { type: mongoose.Schema.Types.ObjectId, ref: 'Fanni', required: true }, oldPrice: { type: Number, required: true, min: 0 }, newPrice: { type: Number, required: true, min: 0 }, reason: { type: String, required: true, trim: true, maxlength: 500 }, status: { type: String, enum: ['قيد الموافقة', 'مقبول', 'مرفوض'], default: 'قيد الموافقة' }, requestedAt: { type: Date, default: Date.now }, decidedAt: { type: Date, default: null }, decidedByRole: { type: String, default: '' } }],

// عروض الفنيين على الطلب.
offers: {
type: [offerSchema],
default: []
},

// الفني الذي اختاره العميل.
assignedFanni: {
type: mongoose.Schema.Types.ObjectId,
ref: 'Fanni',
default: null
},

assignedFanniName: {
type: String,
trim: true,
maxlength: 50,
default: ''
},

// العرض الذي وافق عليه العميل.
acceptedOfferId: {
type: mongoose.Schema.Types.ObjectId,
default: null
},

acceptedOfferPrice: {
type: Number,
min: 0,
default: null
},

// نسبة عمولة المنصة.
commissionRate: {
type: Number,
min: 0,
max: 100,
default: 10
},

// قيمة العمولة الخاصة بالعرض المقبول.
commissionAmount: {
type: Number,
min: 0,
default: 0
},

// لا تتحول إلى true إلا بعد تسجيل الخصم بنجاح.
commissionCharged: {
type: Boolean,
default: false,
index: true
},

commissionChargedAt: {
type: Date,
default: null
},

// انتهاء استقبال العروض بعد 48 ساعة افتراضيًا.
expiresAt: {
type: Date,
default: () => new Date(Date.now() + 48 * 60 * 60 * 1000),
index: true
},

createdAt: {
type: Date,
default: Date.now,
index: true
}
}, {
timestamps: false
});

/*

* فهارس تساعد في:
* 1. جلب الطلبات المتاحة وغير المنتهية.
* 2. جلب الطلبات التي قدم عليها فني معين.
* 3. الوصول إلى طلبات الفني الذي تم اختياره.
     */
     orderSchema.index({
     status: 1,
     expiresAt: 1,
     createdAt: -1
     });

orderSchema.index({
'offers.fanni': 1,
createdAt: -1
});

orderSchema.index({
assignedFanni: 1,
status: 1
});

orderSchema.index({ clientAccount: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);