require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const xlsx = require('xlsx');
const multer = require('multer');
const db = require('./lib/db');

const app = express();
const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.PASSWORD || 'Mundial2026!';
const DATABASE_URL = process.env.DATABASE_URL;
const EXCEL_PATH = process.env.EXCEL_PATH || path.join(__dirname, 'cubo todos los canales 3.xlsx');

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

const PASSWORD_HASH = sha256(PASSWORD);

const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.static(path.join(__dirname)));

function findHeaderRow(rows){
  for(let i=0;i<rows.length;i++){
    if(rows[i] && rows[i].some(c => /ESTABLECIMIENTO/i.test(String(c||'')))) return i;
  }
  return -1;
}

function parseStoresFromBuffer(buffer){
  const wb = xlsx.read(buffer, {type:'buffer'});
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, {header:1, defval:null, raw:true});
  const hi = findHeaderRow(rows);
  if(hi < 0) throw new Error('No se encontró columna Establecimiento en el Excel');

  const hdrs = rows[hi];
  const colTipo = hdrs.findIndex(h => /TIPO DE NEGOCIO/i.test(String(h||'')));
  const colZona = hdrs.findIndex(h => /ZONA/i.test(String(h||'')));
  const colEst = hdrs.findIndex(h => /ESTABLECIMIENTO/i.test(String(h||'')));

  if(colTipo < 0 || colZona < 0 || colEst < 0){
    throw new Error('No se encontraron las columnas Tipo de negocio, Zona o Establecimiento');
  }

  const stores = [];
  const seen = new Set();
  for(let i=hi+1;i<rows.length;i++){
    const row = rows[i];
    if(!row) continue;
    const nombre = String(row[colEst]||'').trim();
    if(!nombre) continue;
    const un = nombre.toUpperCase();
    if(un.startsWith('TOTAL') || seen.has(un)) continue;
    seen.add(un);

    const tipo = String(row[colTipo]||'').trim();
    const zona = String(row[colZona]||'').trim();
    if(!tipo || !zona) continue;

    stores.push({nombre, tipo, zona});
  }
  return stores;
}

function checkPassword(req, res, next){
  const { password } = req.body || req.query || {};
  if(!password) return res.status(400).json({ok:false, error:'Contraseña requerida'});
  if(sha256(password) !== PASSWORD_HASH) return res.status(401).json({ok:false, error:'Contraseña incorrecta'});
  next();
}

app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ ok: false, error: 'Contraseña requerida' });
  if (sha256(password) === PASSWORD_HASH) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false, error: 'Contraseña incorrecta' });
  }
});

app.get('/api/stores', (req, res) => {
  try {
    const buffer = fs.readFileSync(EXCEL_PATH);
    const stores = parseStoresFromBuffer(buffer);
    res.json(stores);
  } catch (err) {
    console.error('Stores error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/groups', (req, res) => {
  try {
    const groups = JSON.parse(fs.readFileSync(path.join(__dirname, 'grupos.json'), 'utf8'));
    res.json(groups);
  } catch (err) {
    console.error('Groups error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/weeks', async (req, res) => {
  try {
    if(!DATABASE_URL) throw new Error('DATABASE_URL no configurada');
    const result = await db.query('SELECT id, week_number, label, start_date, end_date, loaded_at FROM weeks ORDER BY week_number');
    res.json(result.rows);
  } catch (err) {
    console.error('Weeks error:', err);
    res.status(500).json({ error: err.message || 'Error de base de datos' });
  }
});

app.get('/api/weeks/:weekNumber/excel', async (req, res) => {
  try {
    const weekNumber = parseInt(req.params.weekNumber, 10);
    const result = await db.query('SELECT excel_data FROM weeks WHERE week_number = $1', [weekNumber]);
    if(result.rows.length === 0) return res.status(404).json({ error: 'Semana no encontrada' });
    const data = result.rows[0].excel_data;
    if(!data) return res.status(404).json({ error: 'Esta semana aún no tiene un Excel cargado' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="cubo-semana-${weekNumber}.xlsx"`);
    res.send(data);
  } catch (err) {
    console.error('Download week error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/weeks/:weekNumber/upload', upload.single('file'), checkPassword, async (req, res) => {
  try {
    const weekNumber = parseInt(req.params.weekNumber, 10);
    if(!req.file) return res.status(400).json({ ok: false, error: 'Archivo requerido' });

    const result = await db.query(
      'UPDATE weeks SET excel_data = $1, loaded_at = NOW() WHERE week_number = $2 RETURNING id',
      [req.file.buffer, weekNumber]
    );
    if(result.rows.length === 0) return res.status(404).json({ ok: false, error: 'Semana no encontrada' });

    res.json({ ok: true, week: weekNumber, size: req.file.size });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Backward compatibility: download Excel for the current week (defaults to week 1)
app.get('/api/download-excel', async (req, res) => {
  try {
    req.params = { weekNumber: '1' };
    // Reuse the week endpoint handler manually
    const result = await db.query('SELECT excel_data FROM weeks WHERE week_number = 1');
    if(result.rows.length === 0 || !result.rows[0].excel_data){
      // Fallback to local Excel if week 1 is not uploaded yet
      const buffer = fs.readFileSync(EXCEL_PATH);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="cubo todos los canales 3.xlsx"');
      return res.send(buffer);
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="cubo-semana-1.xlsx"');
    res.send(result.rows[0].excel_data);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Mundial Tennis server running on http://localhost:${PORT}`);
  if(!DATABASE_URL) console.warn('WARNING: DATABASE_URL is not set. Database endpoints will fail.');
});
