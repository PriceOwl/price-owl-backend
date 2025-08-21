const express = require('express');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs').promises;
const Tesseract = require('tesseract.js');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

const database = {
  captures: [],
  notifications: []
};

// Email setup (using Gmail - replace with your service)
const emailTransporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASS || 'your-app-password'
  }
});

// Twilio setup (sign up at twilio.com for free trial)
const twilioClient = process.env.TWILIO_SID ? 
  twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH) : null;

app.post('/api/capture-screenshot', upload.single('screenshot'), async (req, res) => {
  const { url, selection } = req.body;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No screenshot' });
  }
  
  let detectedPrice = null;
  try {
    const { data: { text } } = await Tesseract.recognize(
      req.file.path,
      'eng'
    );
    const priceMatch = text.match(/\$[\d,]+\.?\d*/);
    detectedPrice = priceMatch ? priceMatch[0] : null;
  } catch (error) {
    console.log('OCR error:', error);
  }
  
  const capture = {
    id: crypto.randomBytes(16).toString('hex'),
    url: url,
    screenshotPath: req.file.filename,
    detectedPrice: detectedPrice,
    timestamp: new Date().toISOString(),
    selection: selection
  };
  
  res.json({
    success: true,
    captureId: capture.id,
    detectedPrice: detectedPrice,
    screenshotUrl: `https://price-owl-backend-production.up.railway.app/uploads/${req.file.filename}`,
    timestamp: capture.timestamp
  });
});

app.post('/api/confirm-capture', async (req, res) => {
  const { captureId, confirmedPrice, userId, url, timestamp, notificationPrefs } = req.body;
  
  const capture = {
    id: captureId,
    userId: userId,
    url: url,
    confirmedPrice: confirmedPrice,
    timestamp: timestamp,
    notificationPrefs: notificationPrefs,
    status: 'monitoring',
    createdAt: new Date().toISOString()
  };
  
  database.captures.push(capture);
  
  res.json({
    success: true,
    message: 'Hoot! Price tracking activated!'
  });
});

app.get('/api/user/:userId/captures', (req, res) => {
  const userCaptures = database.captures.filter(c => c.userId === req.params.userId);
  res.json(userCaptures);
});

app.get('/api/admin/all-captures', (req, res) => {
  res.json(database.captures);
});

app.post('/api/admin/send-notification', async (req, res) => {
  const { captureId, dealPrice, dealInfo } = req.body;
  const capture = database.captures.find(c => c.id === captureId);
  
  if (!capture) return res.status(404).json({ error: 'Not found' });
  
  const message = `🦉 Hoot hoot! Price drop alert!\n${capture.url}\nOriginal: ${capture.confirmedPrice}\nNow: ${dealPrice}\n${dealInfo}`;
  
  // Send notifications based on preferences
  if (capture.notificationPrefs.includes('email') && process.env.EMAIL_USER) {
    await emailTransporter.sendMail({
      from: process.env.EMAIL_USER,
      to: capture.userEmail,
      subject: '🦉 Price Owl Alert - Price Dropped!',
      text: message
    });
  }
  
  if (capture.notificationPrefs.includes('sms') && twilioClient) {
    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE,
      to: capture.userPhone
    });
  }
  
  res.json({ success: true, message: 'Notifications sent!' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
