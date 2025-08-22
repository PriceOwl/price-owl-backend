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
// Simple admin authentication
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
let adminSessions = new Set();

// Serve admin login
app.get('/admin', (req, res) => {
  res.send(`
    <html>
      <head><title>Price Owl Admin Login</title></head>
      <body style="font-family: Arial; background: #1a1a2e; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
        <div style="background: #0f3460; padding: 40px; border-radius: 12px; text-align: center;">
          <h1>🦉 Price Owl Admin</h1>
          <form method="POST" action="/admin/login">
            <input type="password" name="password" placeholder="Admin Password" style="padding: 12px; margin: 10px; border: none; border-radius: 5px; width: 200px;">
            <br>
            <button type="submit" style="padding: 12px 24px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer;">Login</button>
          </form>
        </div>
      </body>
    </html>
  `);
});

app.post('/admin/login', express.urlencoded({ extended: true }), (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    const sessionId = crypto.randomBytes(16).toString('hex');
    adminSessions.add(sessionId);
    res.cookie('admin_session', sessionId);
    res.redirect('/admin/dashboard');
  } else {
    res.redirect('/admin?error=invalid');
  }
});

app.get('/admin/dashboard', (req, res) => {
  const sessionId = req.headers.cookie?.split('admin_session=')[1]?.split(';')[0];
  if (!sessionId || !adminSessions.has(sessionId)) {
    return res.redirect('/admin');
  }
  
  // Simple inline admin dashboard
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Price Owl Admin - Daily Monitoring</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: white;
      margin: 0;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 30px;
      border-radius: 12px;
      margin-bottom: 30px;
      text-align: center;
      position: relative;
    }
    .logout-btn {
      position: absolute;
      top: 20px;
      right: 20px;
      background: #dc3545;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 5px;
      cursor: pointer;
    }
    h1 { margin: 0; font-size: 32px; }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: #16213e;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }
    .stat-number {
      font-size: 36px;
      font-weight: bold;
      color: #667eea;
    }
    .captures-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
      gap: 20px;
    }
    .capture-card {
      background: #0f3460;
      border-radius: 12px;
      padding: 20px;
      border: 2px solid transparent;
      transition: all 0.3s;
    }
    .capture-card:hover { border-color: #667eea; }
    .capture-url {
      font-size: 12px;
      color: #94a3b8;
      margin-bottom: 10px;
      word-break: break-all;
    }
    .capture-price {
      font-size: 28px;
      font-weight: bold;
      color: #10b981;
      margin: 15px 0;
    }
    .capture-meta {
      display: flex;
      justify-content: space-between;
      margin: 10px 0;
      font-size: 12px;
      color: #94a3b8;
    }
    .notification-prefs {
      display: flex;
      gap: 8px;
      margin: 10px 0;
    }
    .pref-tag {
      background: #667eea;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
    }
    .action-section {
      margin-top: 15px;
      padding-top: 15px;
      border-top: 1px solid #334155;
    }
    .deal-input {
      display: flex;
      gap: 10px;
      margin-bottom: 10px;
    }
    .deal-input input {
      flex: 1;
      padding: 8px;
      background: #1e293b;
      border: 1px solid #334155;
      color: white;
      border-radius: 4px;
    }
    .notify-btn {
      padding: 8px 16px;
      background: #10b981;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
    }
    .refresh-btn {
      padding: 12px 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 20px;
    }
    .check-link {
      color: #667eea;
      text-decoration: none;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🦉 Price Owl Command Center</h1>
    <p>Daily Price Monitoring Dashboard</p>
    <button class="logout-btn" onclick="logout()">🚪 Logout</button>
  </div>
  
  <div class="stats">
    <div class="stat-card">
      <div class="stat-number" id="totalCaptures">0</div>
      <div>Total Captures</div>
    </div>
    <div class="stat-card">
      <div class="stat-number" id="todayCaptures">0</div>
      <div>Today's Captures</div>
    </div>
    <div class="stat-card">
      <div class="stat-number" id="pendingChecks">0</div>
      <div>Pending Checks</div>
    </div>
  </div>
  
  <button class="refresh-btn" onclick="loadCaptures()">🔄 Refresh Dashboard</button>
  
  <div id="captures" class="captures-grid"></div>
  
  <script>
    async function loadCaptures() {
      try {
        const response = await fetch('/api/admin/all-captures');
        const captures = await response.json();
        
        document.getElementById('totalCaptures').textContent = captures.length;
        
        const today = new Date().toDateString();
        const todayCount = captures.filter(c => 
          new Date(c.timestamp).toDateString() === today
        ).length;
        document.getElementById('todayCaptures').textContent = todayCount;
        document.getElementById('pendingChecks').textContent = captures.length;
        
        const container = document.getElementById('captures');
        if (captures.length === 0) {
          container.innerHTML = \`
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #94a3b8;">
              <h3>🦉 No captures yet!</h3>
              <p>Waiting for users to capture their first prices...</p>
            </div>
          \`;
          return;
        }
        
        container.innerHTML = captures.map(capture => \`
          <div class="capture-card">
            <div class="capture-url">\${capture.url}</div>
            <div class="capture-price">📌 \${capture.confirmedPrice}</div>
            
            <div class="capture-meta">
              <span>User: \${capture.userId.substring(0, 8)}...</span>
              <span>\${new Date(capture.timestamp).toLocaleString()}</span>
            </div>
            
            <div class="notification-prefs">
              \${(capture.notificationPrefs || []).map(pref => 
                \`<span class="pref-tag">\${pref}</span>\`
              ).join('')}
            </div>
            
            <div style="font-size: 11px; color: #94a3b8; margin: 5px 0;">
              \${capture.userEmail ? \`📧 \${capture.userEmail}\` : ''}
              \${capture.userPhone ? \`📱 \${capture.userPhone}\` : ''}
            </div>
            
            <a href="\${capture.url}" target="_blank" class="check-link">🔗 Check Current Price</a>
            
            <div class="action-section">
              <div class="deal-input">
                <input type="text" id="price-\${capture.id}" placeholder="New deal price (e.g. $89.99)">
                <input type="text" id="info-\${capture.id}" placeholder="Deal details (e.g. 20% off flash sale)">
              </div>
              <button class="notify-btn" onclick="notifyUser('\${capture.id}')">
                🦉 Send Hoot Alert!
              </button>
            </div>
          </div>
        \`).join('');
        
      } catch (error) {
        console.error('Failed to load captures:', error);
        document.getElementById('captures').innerHTML = \`
          <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #ef4444;">
            <h3>❌ Connection Error</h3>
            <p>Could not connect to backend. Make sure the server is running.</p>
            <button class="refresh-btn" onclick="loadCaptures()">🔄 Try Again</button>
          </div>
        \`;
      }
    }
    
    async function notifyUser(captureId) {
      const dealPrice = document.getElementById(\`price-\${captureId}\`).value;
      const dealInfo = document.getElementById(\`info-\${captureId}\`).value;
      
      if (!dealPrice) {
        alert('Enter the deal price!');
        return;
      }
      
      await fetch('/api/admin/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          captureId,
          dealPrice,
          dealInfo: dealInfo || 'Great deal found!'
        })
      });
      
      alert('Hoot sent! User notified of the deal.');
      loadCaptures();
    }
    
    function logout() {
      document.cookie = 'admin_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      window.location.href = '/admin';
    }
    
    loadCaptures();
    setInterval(loadCaptures, 30000);
  </script>
</body>
</html>
  `);
});

const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// File-based database for persistence
const path = require('path');
const DATABASE_FILE = path.join(__dirname, 'database.json');

let database = {
  captures: [],
  notifications: []
};

// Load existing data
try {
  const data = require('fs').readFileSync(DATABASE_FILE, 'utf8');
  database = JSON.parse(data);
} catch (error) {
  console.log('No existing database file, starting fresh');
}

// Save database function
function saveDatabase() {
  try {
    require('fs').writeFileSync(DATABASE_FILE, JSON.stringify(database, null, 2));
  } catch (error) {
    console.error('Failed to save database:', error);
  }
}

// Email setup (using Gmail - replace with your service)
const emailTransporter = nodemailer.createTransport({
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
  const { captureId, confirmedPrice, userId, url, timestamp, notificationPrefs, userEmail, userPhone } = req.body;
  
  const capture = {
    id: captureId,
    userId: userId,
    url: url,
    confirmedPrice: confirmedPrice,
    timestamp: timestamp,
    notificationPrefs: notificationPrefs,
    userEmail: userEmail,
    userPhone: userPhone,
    status: 'monitoring',
    createdAt: new Date().toISOString()
  };
  
  database.captures.push(capture);
  saveDatabase(); // Persist to file
  
  console.log('New capture saved:', capture.id, capture.url, capture.confirmedPrice);
  
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

// Subscription landing page
app.get('/subscribe', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>🦉 Price Owl Premium - Subscribe</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      margin: 0;
      padding: 20px;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: white;
      padding: 40px;
      border-radius: 20px;
      max-width: 500px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.1);
      text-align: center;
    }
    h1 { color: #333; margin-bottom: 10px; }
    .price { font-size: 48px; color: #28a745; font-weight: bold; margin: 20px 0; }
    .features {
      text-align: left;
      background: #f8f9fa;
      padding: 20px;
      border-radius: 12px;
      margin: 20px 0;
    }
    .features h3 { margin-top: 0; color: #333; }
    .features ul { margin: 0; padding-left: 20px; }
    .features li { margin: 8px 0; color: #555; }
    .form-group {
      margin: 20px 0;
      text-align: left;
    }
    label {
      display: block;
      margin-bottom: 5px;
      color: #333;
      font-weight: 500;
    }
    input {
      width: 100%;
      padding: 12px;
      border: 2px solid #ddd;
      border-radius: 8px;
      font-size: 16px;
      box-sizing: border-box;
    }
    input:focus {
      outline: none;
      border-color: #667eea;
    }
    .subscribe-btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 15px 30px;
      border: none;
      border-radius: 10px;
      font-size: 18px;
      font-weight: bold;
      cursor: pointer;
      width: 100%;
      margin-top: 20px;
      transition: transform 0.2s;
    }
    .subscribe-btn:hover {
      transform: translateY(-2px);
    }
    .money-back {
      background: #e8f5e8;
      color: #155724;
      padding: 10px;
      border-radius: 8px;
      margin-top: 20px;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🦉 Price Owl Premium</h1>
    <p>Get automatic price tracking and instant alerts!</p>
    
    <div class="price">$1<small>/month</small></div>
    
    <div class="features">
      <h3>✨ Premium Features</h3>
      <ul>
        <li>🤖 Automatic daily price checking</li>
        <li>📧 Instant email alerts when prices drop</li>
        <li>📱 SMS notifications for urgent deals</li>
        <li>🔔 Real-time deal notifications</li>
        <li>🎯 Advanced price tracking algorithms</li>
        <li>⚡ Priority customer support</li>
      </ul>
    </div>
    
    <form id="subscriptionForm">
      <div class="form-group">
        <label for="email">Email Address</label>
        <input type="email" id="email" name="email" required placeholder="your@email.com">
      </div>
      
      <div class="form-group">
        <label for="phone">Phone Number (for SMS alerts)</label>
        <input type="tel" id="phone" name="phone" required placeholder="+1234567890">
      </div>
      
      <div class="form-group">
        <label for="cardNumber">Card Number</label>
        <input type="text" id="cardNumber" name="cardNumber" required placeholder="1234 5678 9012 3456" maxlength="19">
      </div>
      
      <div style="display: flex; gap: 15px;">
        <div class="form-group" style="flex: 1;">
          <label for="expiry">Expiry Date</label>
          <input type="text" id="expiry" name="expiry" required placeholder="MM/YY" maxlength="5">
        </div>
        <div class="form-group" style="flex: 1;">
          <label for="cvc">CVC</label>
          <input type="text" id="cvc" name="cvc" required placeholder="123" maxlength="4">
        </div>
      </div>
      
      <button type="submit" class="subscribe-btn">
        🚀 Subscribe Now - $1/month
      </button>
    </form>
    
    <div class="money-back">
      💰 30-day money-back guarantee. Cancel anytime.
    </div>
  </div>
  
  <script>
    // Format card number with spaces
    document.getElementById('cardNumber').addEventListener('input', function(e) {
      let value = e.target.value.replace(/\\s/g, '').replace(/[^0-9]/gi, '');
      let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
      e.target.value = formattedValue;
    });
    
    // Format expiry date
    document.getElementById('expiry').addEventListener('input', function(e) {
      let value = e.target.value.replace(/\\D/g, '');
      if (value.length >= 2) {
        value = value.substring(0, 2) + '/' + value.substring(2, 4);
      }
      e.target.value = value;
    });
    
    // Only allow numbers in CVC
    document.getElementById('cvc').addEventListener('input', function(e) {
      e.target.value = e.target.value.replace(/[^0-9]/g, '');
    });
    
    document.getElementById('subscriptionForm').addEventListener('submit', function(e) {
      e.preventDefault();
      
      // Simple simulation - in real implementation would use Stripe
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());
      
      // Simulate payment processing
      const submitBtn = e.target.querySelector('.subscribe-btn');
      submitBtn.textContent = 'Processing...';
      submitBtn.disabled = true;
      
      setTimeout(() => {
        alert('🎉 Subscription activated! Welcome to Price Owl Premium!\\n\\nYou will now receive automatic price alerts.');
        
        // In real implementation, would redirect to success page or extension
        window.close();
        
        // Store subscription info (simplified)
        if (window.chrome && window.chrome.storage) {
          chrome.storage.local.set({
            subscription: {
              active: true,
              email: data.email,
              phone: data.phone,
              subscribedAt: new Date().toISOString()
            }
          });
        }
      }, 2000);
    });
  </script>
</body>
</html>
  `);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
