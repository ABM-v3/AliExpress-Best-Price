// index.js - Full Vercel-compatible version
require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const axios = require('axios');
const crypto = require('crypto');
const NodeCache = require('node-cache');
const { RateLimiter } = require('limiter');

// Initialize Express
const app = express();
app.use(express.json());

// Initialize bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// AliExpress API Config
const aliExpressConfig = {
  appKey: process.env.ALIEXPRESS_APP_KEY,
  appSecret: process.env.ALIEXPRESS_APP_SECRET,
  trackingId: process.env.ALIEXPRESS_TRACKING_ID,
  apiUrl: 'https://api-sg.aliexpress.com/sync',
  fallbackApiUrl: 'https://api.aliexpress.com/sync'
};

// Cache setup (30 minutes TTL)
const cache = new NodeCache({ stdTTL: 1800 });
const rateLimiter = new RateLimiter({ tokensPerInterval: 1, interval: "second" });

// Helper Functions
function signRequest(params, secret) {
  const sorted = Object.keys(params).sort().reduce((acc, key) => {
    acc[key] = params[key];
    return acc;
  }, {});
  
  let signStr = secret;
  Object.keys(sorted).forEach(key => {
    if (sorted[key]) signStr += key + sorted[key];
  });
  signStr += secret;
  
  return crypto.createHash('md5').update(signStr).digest('hex').toUpperCase();
}

function extractProductId(url) {
  const patterns = [
    /item\/(\d+)/,
    /product\/(\d+)/,
    /(?:id=|itemId=)(\d+)/,
    /(\d+)\.html/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// API Functions
async function getProductDetails(url) {
  const cacheKey = `product_${url}`;
  if (cache.get(cacheKey)) return cache.get(cacheKey);

  await rateLimiter.removeTokens(1);
  const productId = extractProductId(url) || await resolveUrlToProductId(url);
  
  const params = {
    app_key: aliExpressConfig.appKey,
    method: 'aliexpress.affiliate.product.query',
    sign_method: 'md5',
    timestamp: new Date().toISOString().replace(/[-:T]/g, '').split('.')[0],
    product_ids: productId,
    fields: 'product_title,product_main_image_url,target_app_sale_price,original_price',
    tracking_id: aliExpressConfig.trackingId
  };
  
  params.sign = signRequest(params, aliExpressConfig.appSecret);
  
  try {
    const response = await axios.post(aliExpressConfig.apiUrl, null, { params });
    cache.set(cacheKey, response.data);
    return response.data;
  } catch (error) {
    console.error('API Error:', error.response?.data || error.message);
    throw error;
  }
}

async function generateAffiliateLink(productId) {
  const cacheKey = `aff_${productId}`;
  if (cache.get(cacheKey)) return cache.get(cacheKey);

  await rateLimiter.removeTokens(1);
  
  const params = {
    app_key: aliExpressConfig.appKey,
    method: 'aliexpress.affiliate.link.generate',
    sign_method: 'md5',
    timestamp: new Date().toISOString().replace(/[-:T]/g, '').split('.')[0],
    source_values: productId,
    tracking_id: aliExpressConfig.trackingId,
    promotion_link_type: '0'
  };
  
  params.sign = signRequest(params, aliExpressConfig.appSecret);
  
  try {
    const response = await axios.post(aliExpressConfig.apiUrl, null, { params });
    cache.set(cacheKey, response.data);
    return response.data;
  } catch (error) {
    console.error('Affiliate Error:', error.response?.data || error.message);
    throw error;
  }
}

// Bot Handlers
bot.command('start', (ctx) => {
  ctx.reply('Welcome! Send me any AliExpress product link to get an affiliate link');
});

bot.on('text', async (ctx) => {
  try {
    const url = ctx.message.text.match(/https?:\/\/[^\s]+/)?.[0];
    if (!url || !url.includes('aliexpress')) {
      return ctx.reply('Please send a valid AliExpress product URL');
    }

    const loadingMsg = await ctx.reply('Processing your link...');
    
    const product = await getProductDetails(url);
    const productId = extractProductId(url);
    const affiliate = await generateAffiliateLink(productId);
    
    const productData = product.aliexpress_affiliate_product_query_response.resp_result.result.products.product[0];
    const affLink = affiliate.aliexpress_affiliate_link_generate_response.resp_result.result.promotion_links.promotion_link[0].promotion_link;
    
    await ctx.deleteMessage(loadingMsg.message_id);
    
    ctx.replyWithPhoto(productData.product_main_image_url, {
      caption: `🎯 ${productData.product_title}\n\n💰 Price: $${productData.target_app_sale_price}\n🔗 Affiliate Link: ${affLink}`,
      parse_mode: 'Markdown'
    });
    
  } catch (error) {
    console.error(error);
    ctx.reply('Error processing your link. Please try again later.');
  }
});

// Webhook Setup
const WEBHOOK_PATH = `/webhook/${bot.secretPathComponent()}`;
app.use(bot.webhookCallback(WEBHOOK_PATH));

app.get('/', (req, res) => res.send('Bot is running!'));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    await bot.telegram.setWebhook(`${process.env.WEBHOOK_URL}${WEBHOOK_PATH}`);
    console.log('Webhook set successfully');
  } catch (err) {
    console.error('Webhook setup error:', err);
  }
});

module.exports = app;
