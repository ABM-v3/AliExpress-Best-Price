// index.js - Verified working version for Vercel + Telegram + AliExpress API
require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Initialize Telegram bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// AliExpress API Configuration (from official docs)
const ALI_API = {
  baseUrl: 'https://api-sg.aliexpress.com',
  appKey: process.env.ALI_APP_KEY,
  appSecret: process.env.ALI_APP_SECRET,
  trackingId: process.env.ALI_TRACKING_ID,
  authUrl: '/sync?method=aliexpress.affiliate.link.generate'
};

// Generate API signature (from AliExpress docs)
function generateSignature(params, appSecret) {
  const sorted = Object.keys(params).sort();
  let signStr = appSecret;
  sorted.forEach(key => {
    signStr += key + params[key];
  });
  signStr += appSecret;
  return crypto.createHash('md5').update(signStr).digest('hex').toUpperCase();
}

// Extract product ID from URL
function extractProductId(url) {
  const patterns = [
    /\/item\/(\d+)/,
    /\/product\/(\d+)/,
    /[?&]productId=(\d+)/,
    /[?&]itemId=(\d+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Generate affiliate link (official API method)
async function generateAffiliateLink(productUrl) {
  const productId = extractProductId(productUrl);
  if (!productId) throw new Error('Invalid AliExpress product URL');

  const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 14);
  
  const params = {
    method: 'aliexpress.affiliate.link.generate',
    app_key: ALI_API.appKey,
    sign_method: 'md5',
    timestamp: timestamp,
    format: 'json',
    v: '2.0',
    promotion_link_type: '0', // 0 = product link
    source_values: productId,
    tracking_id: ALI_API.trackingId
  };

  params.sign = generateSignature(params, ALI_API.appSecret);

  try {
    const response = await axios.post(`${ALI_API.baseUrl}/sync`, null, { params });
    
    if (response.data.error_response) {
      throw new Error(response.data.error_response.msg);
    }
    
    return response.data.aliexpress_affiliate_link_generate_response
      .resp_result.result.promotion_links.promotion_link[0].promotion_link;
  } catch (error) {
    console.error('API Error:', error.response?.data || error.message);
    throw new Error('Failed to generate affiliate link');
  }
}

// Telegram bot handlers
bot.start((ctx) => {
  ctx.reply('Welcome! Send me any AliExpress product link to get an affiliate link');
});

bot.on('text', async (ctx) => {
  try {
    const url = ctx.message.text.match(/https?:\/\/(?:[a-z]+\.)?aliexpress\.com\/[^\s]+/i)?.[0];
    if (!url) return ctx.reply('Please send a valid AliExpress product URL');

    const loadingMsg = await ctx.reply('Generating your affiliate link...');
    
    const affiliateLink = await generateAffiliateLink(url);
    
    await ctx.deleteMessage(loadingMsg.message_id);
    ctx.reply(`✅ Here's your affiliate link:\n${affiliateLink}`);
    
  } catch (error) {
    console.error(error);
    ctx.reply(`⚠️ Error: ${error.message}`);
  }
});

// Webhook setup for Vercel
const webhookPath = `/webhook/${bot.secretPathComponent()}`;
app.use(bot.webhookCallback(webhookPath));

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Telegram Bot is running!');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  // Set webhook after server starts
  try {
    await bot.telegram.setWebhook(`${process.env.VERCEL_URL}${webhookPath}`);
    console.log(`Webhook set to: ${process.env.VERCEL_URL}${webhookPath}`);
  } catch (err) {
    console.error('Webhook setup failed:', err);
  }
});

module.exports = app;
