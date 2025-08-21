const express = require('express');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
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
  const { url, price, userId, hash, notificationPreference } = req.body;
  const snapshot = {
    id: crypto.randomBytes(16).toString('hex'),
    userId,
    url,
    price,
    screenshotPath: req.file ? req.file.filename : null,
    hash,
    notificationPreference,
    status: 'monitoring',
    createdAt: new Date().toISOString()
  };
  database.snapshots.push(snapshot);
  res.json({ success: true, message: 'Price snapshot captured', id: snapshot.id });
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
    originalPrice: snapshot.price,
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

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
