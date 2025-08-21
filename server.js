const express = require('express');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const Tesseract = require('tesseract.js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

const database = {
  users: [],
  snapshots: [],
  notifications: []
};

app.post('/api/ocr-screenshot', upload.single('screenshot'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No screenshot provided' });
  }
  
  try {
    const { data: { text } } = await Tesseract.recognize(
      req.file.path,
      'eng'
    );
    const priceMatch = text.match(/\$[\d,]+\.?\d*/);
    const detectedPrice = priceMatch ? priceMatch[0] : null;
    
    res.json({ 
      success: true,
      detectedPrice,
      screenshotId: req.file.filename
    });
  } catch (error) {
    res.json({ 
      success: false,
      detectedPrice: null,
      screenshotId: req.file.filename
    });
  }
});

app.post('/api/save-snapshot', async (req, res) => {
  const { url, confirmedPrice, userId, screenshotId, timestamp } = req.body;
  
  const snapshot = {
    id: crypto.randomBytes(16).toString('hex'),
    userId,
    url,
    confirmedPrice,
    screenshotId,
    status: 'monitoring',
    timestamp,
    createdAt: new Date().toISOString()
  };
  
  database.snapshots.push(snapshot);
  res.json({ 
    success: true, 
    message: 'Price tracking started',
    id: snapshot.id
  });
});

app.get('/api/admin/snapshots', (req, res) => {
  res.json(database.snapshots);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
