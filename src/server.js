const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

// ===== شغّل ملفات frontend كـ Static =====
app.use(express.static(path.join(__dirname, '../frontend')));

const DB = { orders: [{sn:'SN-1001',clientName:'احمد',clientPhone:'01012345678',service:'دش',city:'شبرا',status:'pending',createdAt:new Date()}], fannis: [] };
let counter = 1002;

// ===== 3 APIs - زي ما هي =====
app.get('/api/orders', (req,res)=> res.json(DB.orders));
app.post('/api/orders', (req,res)=>{ const o={_id:Date.now()+'',sn:`SN-${counter++}`,...req.body,status:'pending',createdAt:new Date()}; DB.orders.push(o); res.json({order:o}); });
app.get('/api/fanni', (req,res)=> res.json(DB.fannis));
app.post('/api/fanni/register', (req,res)=>{ const f={_id:Date.now()+'',...req.body}; DB.fannis.push(f); res.json({fanni:f}); });

// ===== الصفحات الأساسية - من frontend =====
app.get('/', (req,res)=> {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/client', (req,res)=> {
  res.sendFile(path.join(__dirname, '../frontend/client.html'));
});

app.get('/fanni', (req,res)=> {
  res.sendFile(path.join(__dirname, '../frontend/fanni.html'));
});

app.get('/admin', (req,res)=> {
  res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('✓ Running on ' + PORT));
