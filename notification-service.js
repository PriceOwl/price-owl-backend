const twilio = require('twilio');

// Use environment variables - never hardcode credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = accountSid ? twilio(accountSid, authToken) : null;

async function sendPriceDropAlert(phoneNumber, productUrl, oldPrice, newPrice) {
  if (!client) {
    console.log('SMS not configured');
    return false;
  }
  
  const message = `Price Owl Alert!\n\n${productUrl}\n\nPrice dropped!\nWas: ${oldPrice}\nNow: ${newPrice}\n\nTime to save!`;
  
  try {
    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });
    return true;
  } catch (error) {
    console.error('Failed to send alert:', error);
    return false;
  }
}

module.exports = { sendPriceDropAlert };
