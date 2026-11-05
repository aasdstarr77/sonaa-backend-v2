'use strict';

const express = require('express');
const crypto = require('crypto');
const { AREA_OPTIONS, ALL_AREAS_LABEL, normalizeArea, canonicalAreaName } = require('../../config/areas');

function createAdminOperationsRouter({
  Region,
  Joi,
  adminName,
  writeAdminAudit,
  auth,
  mongoose,
  normalizePhone,
  Fanni,
  Client,
  Notification
}) {
  const router = express.Router();
  function validId(value) { return mongoose.isValidObjectId(value); }
  function sendBadId(res) { return res.status(400).json({ message: 'معرّف غير صالح' }); }

  async function syncManagedAreas(req) {
    const existing=await Region.find({}).select('+normalizedName').sort({createdAt:1,_id:1}),groups=new Map();
    for(const r of existing){const key=normalizeArea(r.name);if(!key)continue;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
    let merged=0,renamed=0;
    for(const [key,group] of groups){
      const canonical=canonicalAreaName(group.find(x=>canonicalAreaName(x.name)===x.name)?.name||group[0].name),keeper=group.find(x=>x.name===canonical)||group[0],oldNames=[...new Set(group.map(x=>x.name))],deleted=group.some(x=>x.isDeleted===true),active=group.every(x=>x.isActive!==false)&&!deleted,isBase=group.some(x=>x.isBase===true)||AREA_OPTIONS.some(x=>normalizeArea(x)===key);
      for(const duplicate of group)if(String(duplicate._id)!==String(keeper._id)){await Region.deleteOne({_id:duplicate._id});merged++;}
      const oldName=keeper.name;keeper.name=canonical;keeper.normalizedName=key;keeper.isActive=active;keeper.isDeleted=deleted;keeper.isBase=isBase;await keeper.save();if(oldName!==canonical)renamed++;
      for(const old of oldNames)if(old!==canonical)await Fanni.updateMany({role:'fanni',areas:old},{$set:{'areas.$[matchedArea]':canonical}},{arrayFilters:[{matchedArea:old}]});
    }
    const seeds=AREA_OPTIONS.map(name=>({updateOne:{filter:{normalizedName:normalizeArea(name)},update:{$setOnInsert:{name,normalizedName:normalizeArea(name),isActive:true,isBase:true,isDeleted:false,createdBy:'القائمة الأساسية'}},upsert:true}}));
    if(seeds.length)await Region.bulkWrite(seeds,{ordered:false});
    if(merged||renamed)await writeAdminAudit(req,'توحيد أسماء المناطق وإزالة التكرار','regions','base-area-normalization',JSON.stringify({merged,renamed}));
  }
  router.get('/regions',auth('admin'),async(req,res,next)=>{try{const regions=await Region.find({}).sort({isDeleted:1,isActive:-1,name:1}).limit(1000).lean();return res.set('Cache-Control','no-store').json({regions,items:regions});}catch(error){return next(error);}});
  router.post('/regions',auth('admin'),async(req,res,next)=>{try{
    const checked=Joi.object({name:Joi.string().trim().min(2).max(100).required()}).required().validate(req.body||{},{abortEarly:false,stripUnknown:true});if(checked.error)return res.status(400).json({message:'اسم المنطقة مطلوب من حرفين إلى 100 حرف'});
    const name=canonicalAreaName(checked.value.name),normalizedName=normalizeArea(name);if(name.length<2)return res.status(400).json({message:'اسم المنطقة غير صالح'});
    const exists=await Region.findOne({normalizedName}).select('_id name isActive isDeleted').lean();if(exists)return res.status(409).json({message:exists.isDeleted?'المنطقة محذوفة بالفعل؛ يمكنك استعادتها من القائمة':'المنطقة موجودة بالفعل',region:exists});
    const region=await Region.create({name,normalizedName,createdBy:adminName(req),isActive:true,isBase:false,isDeleted:false});await writeAdminAudit(req,'إضافة منطقة خدمة','regions',String(region._id),name);return res.status(201).json({message:'تمت إضافة المنطقة إلى القائمة الموحدة',region});
  }catch(error){if(error&&error.code===11000)return res.status(409).json({message:'المنطقة موجودة بالفعل'});return next(error);}});
  router.patch('/regions/:id',auth('admin'),async(req,res,next)=>{try{
    if(!validId(req.params.id))return sendBadId(res);
    const checked=Joi.object({name:Joi.string().trim().min(2).max(100).optional(),isActive:Joi.boolean().optional(),isDeleted:Joi.boolean().optional()}).min(1).required().validate(req.body||{},{abortEarly:false,stripUnknown:true});if(checked.error)return res.status(400).json({message:'بيانات تعديل المنطقة غير صحيحة'});
    const region=await Region.findById(req.params.id);if(!region)return res.status(404).json({message:'المنطقة غير موجودة'});const before={name:region.name,isActive:region.isActive,isDeleted:region.isDeleted};
    const restoreBaseName=region.isBase&&checked.value.name!==undefined?canonicalAreaName(before.name):null;
    if(checked.value.name!==undefined){const name=canonicalAreaName(checked.value.name),normalizedName=normalizeArea(name),duplicate=await Region.findOne({normalizedName,_id:{$ne:region._id}}).select('_id name').lean();if(duplicate)return res.status(409).json({message:'اسم المنطقة مستخدم بالفعل',region:duplicate});region.name=name;region.normalizedName=normalizedName;if(region.isBase)region.isBase=false;}
    if(checked.value.isDeleted!==undefined){region.isDeleted=checked.value.isDeleted;region.isActive=!checked.value.isDeleted;}if(checked.value.isActive!==undefined&&region.isDeleted!==true)region.isActive=checked.value.isActive;await region.save();
    if(restoreBaseName)await Region.create({name:restoreBaseName,normalizedName:normalizeArea(restoreBaseName),isActive:false,isBase:true,isDeleted:true,createdBy:'القائمة الأساسية'});
    let updatedTechnicians=0;if(before.name!==region.name){const result=await Fanni.updateMany({role:'fanni',areas:before.name},{$set:{'areas.$[matchedArea]':region.name}},{arrayFilters:[{matchedArea:before.name}]});updatedTechnicians=Number(result.modifiedCount||result.nModified||0);}
    await writeAdminAudit(req,'تعديل منطقة خدمة','regions',String(region._id),JSON.stringify({before,after:{name:region.name,isActive:region.isActive,isDeleted:region.isDeleted},updatedTechnicians}));return res.json({message:region.isDeleted?'تم حذف المنطقة من الاختيارات':region.isActive?'تم حفظ المنطقة وهي متاحة في الاختيارات':'تم إخفاء المنطقة من الاختيارات الجديدة',region,updatedTechnicians});
  }catch(error){return next(error);}});
  router.delete('/regions/:id',auth('admin'),async(req,res,next)=>{try{if(!validId(req.params.id))return sendBadId(res);const region=await Region.findById(req.params.id);if(!region)return res.status(404).json({message:'المنطقة غير موجودة أو حُذفت بالفعل'});region.isActive=false;region.isDeleted=true;await region.save();await writeAdminAudit(req,'حذف منطقة خدمة','regions',String(region._id),JSON.stringify({name:region.name,isBase:region.isBase}));return res.json({message:'تم حذف المنطقة من الاختيارات الجديدة مع الاحتفاظ بالبيانات التاريخية. ويمكن استعادتها من القائمة.'});}catch(error){return next(error);}});
  router.get('/regions/legacy-areas', auth('admin'), async (req, res, next) => {
    try {
      const [technicians, activeRegions] = await Promise.all([
        Fanni.find({ role: 'fanni' }).select('_id name status areas').limit(5000).lean(),
        Region.find({ isActive: true }).select('name').lean()
      ]);
      const known = new Set([...(AREA_OPTIONS || []), ...activeRegions.map(item => item.name), ALL_AREAS_LABEL].map(normalizeArea));
      const grouped = new Map();
      for (const technician of technicians) {
        for (const raw of Array.isArray(technician.areas) ? technician.areas : []) {
          const name = String(raw || '').normalize('NFC').trim().replace(/\s+/g, ' ');
          const key = normalizeArea(name);
          if (!key || known.has(key)) continue;
          const item = grouped.get(key) || { name, technicianCount: 0, examples: [] };
          item.technicianCount += 1;
          if (item.examples.length < 5) item.examples.push({ id: String(technician._id), name: technician.name || 'فني', status: technician.status || '' });
          grouped.set(key, item);
        }
      }
      return res.set('Cache-Control', 'no-store').json({ legacyAreas: Array.from(grouped.values()).sort((a, b) => b.technicianCount - a.technicianCount), scannedTechnicians: technicians.length });
    } catch (error) { return next(error); }
  });

  router.post('/notifications/direct', auth('admin'), async (req, res, next) => {
    try {
      const schema = Joi.object({
        title: Joi.string().trim().min(2).max(100).required(), message: Joi.string().trim().min(2).max(300).required(),
        recipientRole: Joi.string().valid('fanni', 'client').required(), recipientMode: Joi.string().valid('single', 'group').default('single'),
        phone: Joi.string().trim().allow('').optional(),
        audience: Joi.string().valid('all', 'approved', 'active', 'disabled').when('recipientMode', { is: 'group', then: Joi.required(), otherwise: Joi.optional() })
      }).required();
      const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
      if (error) return res.status(400).json({ message: 'بيانات الرسالة أو المستلم غير صحيحة' });
      if (value.recipientMode === 'single') {
        const phone = normalizePhone(value.phone);
        if (!phone || !/^01[0-9]{9}$/.test(phone)) return res.status(400).json({ message: 'اكتب رقم هاتف مصري صحيحًا للمستلم' });
        let recipient;
        if (value.recipientRole === 'fanni') recipient = await Fanni.findOne({ phone, role: 'fanni' }).select('_id name phone status').lean();
        else recipient = await Client.findOne({ phone }).select('_id name phone status').lean();
        if (!recipient) return res.status(404).json({ message: value.recipientRole === 'fanni' ? 'لا يوجد فني بهذا الرقم' : 'لا يوجد عميل بهذا الرقم' });
        const campaignId = crypto.randomBytes(16).toString('hex');
        await Notification.create({ campaignId, recipientRole: value.recipientRole, recipientId: recipient._id, type: 'admin_message', title: value.title, message: value.message, link: '', readAt: null });
        await writeAdminAudit(req, 'إرسال إشعار فردي', 'notifications', recipient.phone, JSON.stringify({ role: value.recipientRole, campaignId }));
        return res.status(201).json({ message: 'تم إرسال الإشعار إلى المستلم المحدد فقط', sent: 1, campaignId, recipient: { role: value.recipientRole, name: recipient.name, phone: recipient.phone } });
      }
      let filter = {};
      if (value.recipientRole === 'fanni') {
        filter.role = 'fanni';
        if (value.audience === 'approved') filter.status = 'معتمد';
        else if (value.audience === 'disabled') filter.status = 'معلق';
        else if (value.audience === 'active') return res.status(400).json({ message: 'اختار الفنيين المعتمدين أو المعطلين أو الجميع' });
      } else {
        if (value.audience === 'active' || value.audience === 'approved') filter.status = 'نشط';
        else if (value.audience === 'disabled') filter.status = 'معلق';
      }
      const Model = value.recipientRole === 'fanni' ? Fanni : Client;
      const total = await Model.countDocuments(filter);
      if (total > 5000) return res.status(413).json({ message: 'عدد المستلمين أكبر من الحد الآمن (5000). قسّم الإرسال إلى فئات أصغر.', count: total });
      if (!total) return res.status(404).json({ message: 'لا توجد حسابات تطابق الفئة المحددة', sent: 0 });
      const recipients = await Model.find(filter).select('_id').limit(5000).lean();
      const createdAt = new Date();
      const campaignId = crypto.randomBytes(16).toString('hex');
      const docs = recipients.map(person => ({ campaignId, recipientRole: value.recipientRole, recipientId: person._id, type: 'admin_message', title: value.title, message: value.message, link: '', readAt: null, createdAt, updatedAt: createdAt }));
      await Notification.insertMany(docs, { ordered: true });
      await writeAdminAudit(req, 'إرسال إشعار جماعي', 'notifications', value.recipientRole + ':' + value.audience, JSON.stringify({ sent: docs.length, campaignId }));
      return res.status(201).json({ message: 'تم إرسال الإشعار الجماعي داخل التطبيق', sent: docs.length, campaignId, recipientRole: value.recipientRole, audience: value.audience });
    } catch (error) { return next(error); }
  });
  
  router.get('/notifications/direct', auth('admin'), async (req, res, next) => {
    try {
      const records = await Notification.find({ type: 'admin_message' }).sort({ createdAt: -1 }).limit(5000).lean();
      const groups = new Map();
      for (const item of records) {
        const legacyKey = !item.campaignId
          ? [item.recipientRole, new Date(item.createdAt || 0).toISOString(), item.title, item.message].join('|')
          : '';
        const key = item.campaignId ? 'campaign:' + item.campaignId : 'legacy:' + legacyKey;
        let group = groups.get(key);
        if (!group) {
          group = { id: String(item._id), campaignId: item.campaignId || null, recipientRole: item.recipientRole, title: item.title, message: item.message, createdAt: item.createdAt, count: 0 };
          groups.set(key, group);
        }
        group.count += 1;
      }
      return res.set('Cache-Control', 'no-store').json({ notifications: Array.from(groups.values()).slice(0, 200) });
    } catch (error) { return next(error); }
  });
  
  router.delete('/notifications/direct/:id', auth('admin'), async (req, res, next) => {
    try {
      if (!validId(req.params.id)) return sendBadId(res);
      const item = await Notification.findOne({ _id: req.params.id, type: 'admin_message' }).lean();
      if (!item) return res.status(404).json({ message: 'الإشعار الإداري غير موجود أو تم حذفه بالفعل' });
      const filter = item.campaignId
        ? { type: 'admin_message', campaignId: item.campaignId, recipientRole: item.recipientRole }
        : { type: 'admin_message', recipientRole: item.recipientRole, title: item.title, message: item.message, createdAt: item.createdAt };
      const result = await Notification.deleteMany(filter);
      if (!result.deletedCount) return res.status(404).json({ message: 'الإشعار غير موجود أو تم حذفه بالفعل' });
      await writeAdminAudit(req, 'حذف إشعار إداري', 'notifications', item.campaignId || String(item._id), JSON.stringify({ deleted: result.deletedCount, role: item.recipientRole, title: item.title }));
      return res.json({ message: 'تم حذف الإشعار من جميع الحسابات المستهدفة', deleted: result.deletedCount });
    } catch (error) { return next(error); }
  });

  return router;
}

module.exports = createAdminOperationsRouter;
