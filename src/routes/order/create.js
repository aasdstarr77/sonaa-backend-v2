'use strict';

const express = require('express');

function createOrderCreationRouter({
  clientAuth,
  createSchema,
  findPhoneContainingField,
  normalizePhone,
  Order,
  generateSN,
  sanitizeText,
  notifyAdmins,
  createNotification,
  jwt,
  publicOrder
}) {
  const router = express.Router();

  router.post('/', clientAuth, async (req, res, next) => {
    try {
      const body = {
        ...req.body,
        // الاسم ورقم الهاتف مصدرهما الحساب الموثّق، وليس حقولًا يرسلها المتصفح.
        clientName: req.client.name,
        phone: req.client.phone,
        description: req.body.description || req.body.desc
      };
  
      const { error, value } = createSchema.validate(body, {
        abortEarly: false,
        stripUnknown: false
      });
  
      if (error) {
        return res.status(400).json({
          message: 'بيانات الطلب غير مكتملة أو غير صحيحة',
          details: error.details.map(item => item.message)
        });
      }
  
      const phoneInField = findPhoneContainingField({
        service: value.service,
        area: value.area,
        address: value.address || '',
        clientName: value.clientName || '',
        budget: value.budget || '',
        description: value.description || '',
        desc: value.desc || ''
      });
  
      if (phoneInField) {
        return res.status(400).json({
          message:
            'ممنوع كتابة رقم موبايل داخل الاسم أو المنطقة أو العنوان أو وصف الطلب أو الميزانية. استخدم خانة رقم الهاتف المخصصة.'
        });
      }
  
      const clientPhone = normalizePhone(value.phone);
  
      if (!clientPhone) {
        return res.status(400).json({
          message: 'رقم هاتف العميل غير صحيح'
        });
      }
  
      const address = String(value.address || '').trim();
      // المنطقة حقل مستقل يظهر للفني قبل قبول الطلب؛ العنوان التفصيلي يظل محميًا حتى القبول.
      const area = String(value.area || '').trim();
  
      if (area.length < 2 || area.length > 100) {
        return res.status(400).json({
          message: 'اكتب المنطقة أو الحي بشكل صحيح'
        });
      }
  
      if (address.length < 2) {
        return res.status(400).json({
          message: 'العنوان التفصيلي مطلوب'
        });
      }
  
      if (!process.env.JWT_SECRET) {
        return res.status(503).json({
          message: 'إنشاء الطلب غير متاح بسبب إعدادات الخادم'
        });
      }
  
      const textDescription = String(value.description || value.desc || '').trim();
      const voiceRecordingData = String(value.voiceRecordingData || '').trim();
      if (textDescription.length < 10 && !voiceRecordingData) return res.status(400).json({ message: 'اكتب وصف المشكلة أو سجّل فويس يوضح المشكلة قبل إرسال الطلب.' });
      const safeDescription = sanitizeText(textDescription);
  
      const safeClientName = sanitizeText(
        String(value.clientName || 'عميل').trim()
      );
  
      let order = null;
  
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          order = await Order.create({
            sn: generateSN(),
            clientAccount: req.clientId,
            clientAccountLinkedAt: new Date(),
            service: value.service,
            area,
            address,
            clientName: safeClientName || 'عميل',
            clientPhone,
            budget: value.budget || '',
            description: safeDescription,
            ...(voiceRecordingData ? { voiceRecordingData } : {}),
            status: 'قيد المراجعة'
          });
  
          break;
        } catch (err) {
          if (err.code !== 11000 || attempt === 2) throw err;
        }
      }
  
      if (!order) {
        return res.status(500).json({
          message: 'تعذر إنشاء الطلب'
        });
      }
  
      await notifyAdmins({ type: 'admin_new_order', title: 'طلب جديد يحتاج مراجعة', message: `وصل طلب جديد ${order.sn} لخدمة ${order.service}.`, link: '/admin?tab=orders', dedupeKey: 'admin-new-order:' + String(order._id) });
      await createNotification({
        recipientRole: 'client', recipientId: order.clientAccount, type: 'order_created',
        title: 'تم استلام طلبك', message: 'استلمنا طلبك ' + order.sn + ' وسيتم مراجعته من الإدارة.',
        link: '/?tab=orders', dedupeKey: 'order-created:' + String(order._id)
      });
  
      const clientToken = jwt.sign(
        {
          purpose: 'client-order',
          accountId: String(order.clientAccount),
          orderId: String(order._id),
          sn: order.sn
        },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );
  
      const safeOrder = publicOrder(order);
  
      return res.status(201).json({
        message: 'تم إنشاء الطلب بنجاح، وسيتم مراجعته من الإدارة',
        sn: order.sn,
        id: order._id,
        clientToken,
        order: safeOrder,
        data: safeOrder
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = createOrderCreationRouter;
