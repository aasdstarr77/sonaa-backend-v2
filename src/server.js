const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// فين مكان frontend
const fp = path.join(__dirname, '..', 'frontend');
app.use(express.static(fp));

// APIs
let DB = { orders: [], fannis: [] };
let c = 1001;
app.get('/api/orders', (req,res)=> res.json(DB.orders));
app.post('/api/orders', (req,res)=>{ 
  const o={_id:Date.now()+'',sn:'SN-'+c++,...req.body,status:'pending',createdAt:new Date()}; 
  DB.orders.push(o); 
  res.json({order:o}); 
});
app.get('/api/fanni', (req,res)=> res.json(DB.fannis));
app.post('/api/fanni/register', (req,res)=>{ 
  const f={_id:Date.now()+'',...req.body}; 
  DB.fannis.push(f); 
  res.json({fanni:f}); 
});

// لو دخل على / افتح client.html اللي انت بعته
app.get('/', (req,res)=>{
  try {
    const p = path.join(fp, 'client.html');
    if(fs.existsSync(p)) return res.sendFile(p);
    return res.send('ملف client.html مش موجود في '+fp);
  } catch(e){ res.send('Error: '+e.message); }
});

app.get('/client', (req,res)=> res.sendFile(path.join(fp, 'client.html')));
app.get('/fanni', (req,res)=> res.sendFile(path.join(fp, 'fanni.html')));
app.get('/admin', (req,res)=> res.sendFile(path.join(fp, 'admin.html')));

module.exports = app;
app.listen(process.env.PORT || 3000);
