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

app.post('/api/snapshot', upload.single('screenshot'), async (req, res) => {
  const { url, userPrice, userId, hash, notificationPreference, timestamp } = req.body;
  
  let suggestedPrice = null;
  if (req.file) {
    try {
      const { data: { text } } = await Tesseract.recognize(
        req.file.path,
        'eng'
      );
      const priceMatch = text.match(/\$[\d,]+\.?\d*/);
      suggestedPrice = priceMatch ? priceMatch[0] : null;
    } catch (error) {
      console.log('OCR failed:', error);
    }
  }
  
  const snapshot = {
    id: crypto.randomBytes(16).toString('hex'),
    userId,
    url,
    userEnteredPrice: userPrice,
    suggestedPrice,
    screenshotPath: req.file ? req.file.filename : null,
    hash,
    notificationPreference,
    status: 'monitoring',
    timestamp,
    createdAt: new Date().toISOString()
  };
  
  database.snapshots.push(snapshot);
  res.json({ 
    success: true, 
    message: 'Snapshot saved',
    id: snapshot.id,
    suggestedPrice
  });
});

app.get('/api/admin/snapshots', (req, res) => {
  res.json(database.snapshots);
});

app.post('/api/admin/notify', async (req, res) => {
  const { snapshotId, dealPrice, dealInfo } = req.body;
  const snapshot = database.snapshots.find(s => s.id === snapshotId);
  if (!snapshot) return res.status(404).json({ error: 'Not found' });
  
  const notification = {
    id: crypto.randomBytes(16).toString('hex'),
    snapshotId,
    userId: snapshot.userId,
    originalPrice: snapshot.userEnteredPrice,
    dealPrice,
    dealInfo,
    sentAt: new Date().toISOString()
  };
  database.notifications.push(notification);
  res.json({ success: true, message: 'User notified' });
});

app.get('/api/user/:userId/notifications', (req, res) => {
  const userNotifications = database.notifications.filter(n => n.userId === req.params.userId);
  res.json(userNotifications);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
