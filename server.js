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
app.use(express.json({ limit: '100mb' })); // Increase limit for base64 images
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Add explicit payload size handling
app.use((req, res, next) => {
  if (req.path === '/api/confirm-capture') {
    console.log('Request content length:', req.get('content-length'));
  }
  next();
});
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
            \${capture.screenshot ? \`
              <div style="margin-bottom: 15px;">
                <img src="\${capture.screenshot}" 
                     style="width: 100%; max-height: 200px; object-fit: cover; border-radius: 8px; cursor: pointer;" 
                     onclick="openImageModal('\${capture.screenshot}')"
                     title="Click to view full size">
              </div>
            \` : ''}
            
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
    
    function openImageModal(imageData) {
      const modal = document.createElement('div');
      modal.style.cssText = \`
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.9);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        cursor: pointer;
      \`;
      
      modal.innerHTML = \`
        <img src="\${imageData}" style="max-width: 90%; max-height: 90%; object-fit: contain; border-radius: 8px;">
      \`;
      
      modal.addEventListener('click', () => modal.remove());
      document.body.appendChild(modal);
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
    console.log('Database saved successfully to:', DATABASE_FILE);
  } catch (error) {
    console.error('Failed to save database:', error);
    console.error('Error details:', error.message);
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

// Stripe setup
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Store subscription data
database.subscriptions = database.subscriptions || [];

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
  const debugInfo = {
    bodyKeys: Object.keys(req.body),
    screenshotExists: 'screenshot' in req.body,
    screenshotType: typeof req.body.screenshot,
    screenshotNull: req.body.screenshot == null,
    screenshotLength: req.body.screenshot?.length || 0,
    screenshotPrefix: req.body.screenshot?.substring(0, 50) || 'NO DATA'
  };
  
  console.log('=== CAPTURE REQUEST ===');
  console.log('Debug info:', debugInfo);
  
  const { captureId, confirmedPrice, userId, url, timestamp, notificationPrefs, userEmail, userPhone, screenshot } = req.body;
  
  const capture = {
    id: captureId,
    userId: userId,
    url: url,
    confirmedPrice: confirmedPrice,
    timestamp: timestamp,
    notificationPrefs: notificationPrefs,
    userEmail: userEmail,
    userPhone: userPhone,
    screenshot: screenshot, // Store the screenshot data
    status: 'monitoring',
    createdAt: new Date().toISOString()
  };
  
  database.captures.push(capture);
  saveDatabase(); // Persist to file
  
  console.log('New capture saved:', capture.id, capture.url, capture.confirmedPrice);
  
  // Include debug info in response for testing
  if (req.body.debug) {
    debugInfo.captureInDb = !!database.captures.find(c => c.id === captureId);
    debugInfo.captureScreenshotInDb = !!database.captures.find(c => c.id === captureId)?.screenshot;
  }
  
  res.json({
    success: true,
    message: 'Hoot! Price tracking activated!',
    debug: debugInfo,
    captureHasScreenshot: !!capture.screenshot,
    screenshotLength: capture.screenshot?.length || 0
  });
});

app.get('/api/test-debug', (req, res) => {
  res.json({
    message: 'Debug endpoint working',
    timestamp: new Date().toISOString(),
    capturesCount: database.captures.length
  });
});

app.get('/api/user/:userId/captures', (req, res) => {
  const userCaptures = database.captures.filter(c => c.userId === req.params.userId);
  res.json(userCaptures);
});

app.get('/api/admin/all-captures', (req, res) => {
  console.log('=== ADMIN ENDPOINT CALLED ===');
  console.log('Current database.captures length:', database.captures.length);
  console.log('Captures:', database.captures);
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

// Create Stripe subscription
app.post('/api/create-subscription', async (req, res) => {
  try {
    const { email, phone, paymentMethodId } = req.body;

    // Create customer
    const customer = await stripe.customers.create({
      email: email,
      phone: phone,
      payment_method: paymentMethodId,
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: process.env.STRIPE_PRICE_ID || 'price_1234567890' }], // You'll need to create a price in Stripe
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });

    // Store subscription in database
    const subscriptionData = {
      id: subscription.id,
      customerId: customer.id,
      email: email,
      phone: phone,
      status: subscription.status,
      createdAt: new Date().toISOString()
    };
    
    database.subscriptions.push(subscriptionData);
    saveDatabase();

    res.json({
      success: true,
      subscriptionId: subscription.id,
      clientSecret: subscription.latest_invoice.payment_intent.client_secret,
    });
    
  } catch (error) {
    console.error('Subscription creation failed:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Handle Stripe webhooks
app.post('/api/stripe-webhook', express.raw({type: 'application/json'}), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.log('Webhook signature verification failed.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'invoice.payment_succeeded':
      const invoice = event.data.object;
      console.log('Payment succeeded for subscription:', invoice.subscription);
      
      // Update subscription status in database
      const sub = database.subscriptions.find(s => s.id === invoice.subscription);
      if (sub) {
        sub.status = 'active';
        sub.lastPayment = new Date().toISOString();
        saveDatabase();
      }
      break;
      
    case 'invoice.payment_failed':
      console.log('Payment failed for subscription:', event.data.object.subscription);
      break;
      
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({received: true});
});

// Get subscription status
app.get('/api/subscription-status/:email', (req, res) => {
  const subscription = database.subscriptions.find(s => 
    s.email === req.params.email && s.status === 'active'
  );
  
  res.json({
    active: !!subscription,
    subscription: subscription || null
  });
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
        <label for="card-element">Card Information</label>
        <div id="card-element" style="padding: 12px; border: 2px solid #ddd; border-radius: 8px; background: white;">
          <!-- Stripe Elements will create form elements here -->
        </div>
        <div id="card-errors" role="alert" style="color: #e74c3c; margin-top: 5px; font-size: 14px;"></div>
      </div>
      
      <button type="submit" class="subscribe-btn">
        🚀 Subscribe Now - $1/month
      </button>
    </form>
    
    <div class="money-back">
      💰 30-day money-back guarantee. Cancel anytime.
    </div>
  </div>
  
  <script src="https://js.stripe.com/v3/"></script>
  <script>
    // Initialize Stripe
    const stripe = Stripe('${process.env.STRIPE_PUBLISHABLE_KEY}');
    const elements = stripe.elements();
    
    // Create card element
    const cardElement = elements.create('card', {
      style: {
        base: {
          fontSize: '16px',
          color: '#424770',
          '::placeholder': {
            color: '#aab7c4',
          },
        },
      },
    });
    
    cardElement.mount('#card-element');
    
    // Handle real-time validation errors from the card Element
    cardElement.on('change', function(event) {
      const displayError = document.getElementById('card-errors');
      if (event.error) {
        displayError.textContent = event.error.message;
      } else {
        displayError.textContent = '';
      }
    });
    
    // Handle form submission
    document.getElementById('subscriptionForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const submitBtn = e.target.querySelector('.subscribe-btn');
      submitBtn.textContent = 'Processing...';
      submitBtn.disabled = true;
      
      const email = document.getElementById('email').value;
      const phone = document.getElementById('phone').value;
      
      try {
        // Create payment method
        const {error, paymentMethod} = await stripe.createPaymentMethod({
          type: 'card',
          card: cardElement,
          billing_details: {
            email: email,
            phone: phone,
          },
        });
        
        if (error) {
          document.getElementById('card-errors').textContent = error.message;
          submitBtn.textContent = '🚀 Subscribe Now - $1/month';
          submitBtn.disabled = false;
          return;
        }
        
        // Create subscription
        const response = await fetch('/api/create-subscription', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: email,
            phone: phone,
            paymentMethodId: paymentMethod.id,
          }),
        });
        
        const result = await response.json();
        
        if (result.success) {
          // Store subscription info for extension
          if (window.chrome && window.chrome.storage) {
            chrome.storage.local.set({
              subscription: {
                active: true,
                email: email,
                phone: phone,
                subscribedAt: new Date().toISOString()
              }
            });
          }
          
          // Redirect to success page (don't close tab)
          window.location.href = '/subscription-success';
        } else {
          document.getElementById('card-errors').textContent = result.error;
          submitBtn.textContent = '🚀 Subscribe Now - $1/month';
          submitBtn.disabled = false;
        }
        
      } catch (error) {
        console.error('Error:', error);
        document.getElementById('card-errors').textContent = 'An error occurred. Please try again.';
        submitBtn.textContent = '🚀 Subscribe Now - $1/month';
        submitBtn.disabled = false;
      }
    });
  </script>
</body>
</html>
  `);
});

// Subscription success page
app.get('/subscription-success', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>🎉 Welcome to Price Owl Premium!</title>
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
      color: white;
      text-align: center;
    }
    .success-container {
      background: white;
      color: #333;
      padding: 40px;
      border-radius: 20px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.2);
      max-width: 600px;
      animation: slideUp 0.6s ease-out;
    }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(30px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .celebration {
      font-size: 120px;
      margin-bottom: 20px;
      animation: bounce 1s ease-in-out infinite alternate;
    }
    @keyframes bounce {
      to { transform: translateY(-10px); }
    }
    h1 {
      color: #28a745;
      margin-bottom: 15px;
      font-size: 2.5em;
    }
    .features-box {
      background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
      padding: 25px;
      border-radius: 15px;
      margin: 25px 0;
      text-align: left;
    }
    .features-box h3 {
      color: #667eea;
      margin-top: 0;
      text-align: center;
    }
    .features-box ul {
      list-style: none;
      padding: 0;
    }
    .features-box li {
      padding: 8px 0;
      border-bottom: 1px solid #dee2e6;
      font-weight: 500;
    }
    .features-box li:last-child {
      border-bottom: none;
    }
    .instruction-box {
      background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%);
      padding: 20px;
      border-radius: 12px;
      margin: 20px 0;
      border-left: 5px solid #ffc107;
    }
    .instruction-box h3 {
      color: #856404;
      margin-top: 0;
    }
    .instruction-box p {
      color: #856404;
      margin-bottom: 0;
      font-weight: 500;
    }
    .action-buttons {
      display: flex;
      gap: 15px;
      justify-content: center;
      margin-top: 30px;
      flex-wrap: wrap;
    }
    .btn {
      padding: 15px 25px;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      font-weight: bold;
      font-size: 16px;
      transition: all 0.3s;
      text-decoration: none;
      display: inline-block;
    }
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
    }
    .btn-secondary {
      background: #6c757d;
      color: white;
    }
    .btn-secondary:hover {
      background: #5a6268;
      transform: translateY(-1px);
    }
    .premium-badge {
      background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
      color: #333;
      padding: 8px 16px;
      border-radius: 20px;
      font-weight: bold;
      font-size: 14px;
      display: inline-block;
      margin-bottom: 20px;
      box-shadow: 0 2px 10px rgba(255, 215, 0, 0.3);
    }
  </style>
</head>
<body>
  <div class="success-container">
    <div class="celebration">🎉</div>
    <div class="premium-badge">✨ PREMIUM ACTIVATED ✨</div>
    <h1>Congratulations!</h1>
    <p style="font-size: 18px; margin-bottom: 25px;">
      Welcome to <strong>Price Owl Premium</strong>! Your subscription is now active and you have full access to all premium features.
    </p>

    <div class="features-box">
      <h3>🦉 Your Premium Features Are Now Active:</h3>
      <ul>
        <li>🤖 Automatic daily price checking while you sleep</li>
        <li>📧 Instant email alerts when prices drop</li>
        <li>📱 SMS notifications for urgent deals</li>
        <li>🔔 Real-time deal notifications</li>
        <li>🎯 Advanced price tracking algorithms</li>
        <li>⚡ Priority customer support</li>
      </ul>
    </div>

    <div class="instruction-box">
      <h3>🚀 What to do next:</h3>
      <p>
        <strong>Go back to the Price Owl extension</strong> in your browser and refresh it. 
        You now have full access to email and SMS notifications in the settings!
      </p>
    </div>

    <p style="font-size: 16px; color: #666; margin: 20px 0;">
      <strong>That's it!</strong> Just enjoy the extension and let Price Owl find the best deals for you automatically. 
      Happy saving! 💰
    </p>

    <div class="action-buttons">
      <button class="btn btn-primary" onclick="openExtension()">
        🦉 Open Price Owl Extension
      </button>
      <button class="btn btn-secondary" onclick="window.close()">
        Close This Tab
      </button>
    </div>

    <p style="font-size: 12px; color: #999; margin-top: 30px;">
      Questions? Contact us at support@priceowl.com
    </p>
  </div>

  <script>
    function openExtension() {
      // Try to open the extension popup (this might not work due to browser restrictions)
      if (window.chrome && window.chrome.runtime) {
        try {
          window.chrome.runtime.sendMessage('extension-id', {action: 'openPopup'});
        } catch (e) {
          alert('Please click on the Price Owl extension icon in your browser toolbar to access your premium features!');
        }
      } else {
        alert('Please click on the Price Owl extension icon in your browser toolbar to access your premium features!');
      }
    }

    // Auto-close after 30 seconds if user doesn't interact
    let autoCloseTimer = setTimeout(() => {
      if (confirm('Would you like to close this tab? Your premium features are ready to use in the Price Owl extension!')) {
        window.close();
      }
    }, 30000);

    // Clear auto-close if user interacts with page
    document.addEventListener('click', () => {
      clearTimeout(autoCloseTimer);
    });
  </script>
</body>
</html>
  `);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🦉 Price Owl Backend v2.0 running on port ${PORT} - Screenshot Fix Deployed`);
});
