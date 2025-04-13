// index.js - Main entry point
const express = require('express');
const { Telegraf } = require('telegraf');
const axios = require('axios');
const crypto = require('crypto');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize Express app for webhook handling (needed for Vercel deployment)
const app = express();

// Initialize Telegram bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// AliExpress API config
const aliExpressConfig = {
  appKey: process.env.ALIEXPRESS_APP_KEY,
  appSecret: process.env.ALIEXPRESS_APP_SECRET,
  trackingId: process.env.ALIEXPRESS_TRACKING_ID, // Your tracking ID
  apiUrl: 'https://api-sg.aliexpress.com/sync'
};

// Helper function to sign AliExpress API requests
function signRequest(params, secret) {
  // Sort params alphabetically
  const sortedParams = Object.keys(params).sort().reduce(
    (result, key) => {
      result[key] = params[key];
      return result;
    }, 
    {}
  );
  
  // Create string to sign
  let signStr = '';
  Object.keys(sortedParams).forEach(key => {
    if (sortedParams[key] !== '' && sortedParams[key] !== undefined && sortedParams[key] !== null) {
      signStr += key + sortedParams[key];
    }
  });
  
  // Create signature
  signStr = secret + signStr + secret;
  return crypto.createHash('md5').update(signStr).digest('hex').toUpperCase();
}

// Improved function to extract product ID from AliExpress URL
function extractProductId(url) {
  try {
    // Format: https://www.aliexpress.com/item/1005006456204259.html
    const itemMatch = url.match(/item\/(\d+)(?:\.html)?/);
    if (itemMatch && itemMatch[1]) {
      console.log(`Extracted product ID from direct URL: ${itemMatch[1]}`);
      return itemMatch[1];
    }
    
    // For short URLs and other formats
    return null;
  } catch (error) {
    console.error('Error extracting product ID:', error);
    return null;
  }
}

// Improved function to resolve short URLs with timeout handling
async function resolveShortUrl(url) {
  try {
    console.log(`Resolving URL: ${url}`);
    
    // Much shorter timeout to prevent hanging
    const response = await axios.get(url, {
      maxRedirects: 5,
      validateStatus: function(status) {
        return status >= 200 && status < 400; // Accept all 2xx and 3xx responses
      },
      timeout: 8000, // Reduced timeout to 8 seconds
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0'
      }
    });
    
    // Get the final URL after redirects
    let finalUrl = '';
    
    if (response.request.res && response.request.res.responseUrl) {
      finalUrl = response.request.res.responseUrl;
    } else if (response.request._redirectable && response.request._redirectable._currentUrl) {
      finalUrl = response.request._redirectable._currentUrl;
    } else if (response.request.path) {
      // Construct full URL if only path is available
      const parsedUrl = new URL(url);
      finalUrl = `${parsedUrl.protocol}//${parsedUrl.host}${response.request.path}`;
    } else {
      finalUrl = url;
    }
    
    console.log(`Resolved to final URL: ${finalUrl}`);
    return finalUrl;
  } catch (error) {
    console.error('Error resolving short URL:', error);
    
    // Special case for AliExpress click tracking URLs
    if (url.includes('click.aliexpress.com')) {
      console.log('Detected AliExpress tracking URL, attempting alternative resolution...');
      
      // For AliExpress tracking URLs, try to extract the product ID directly from the URL
      // or use the original URL directly if it contains 'item/'
      if (url.includes('item/')) {
        return url;
      }
      
      // If we can't resolve a click.aliexpress.com URL, throw a specific error
      throw new Error('Cannot process AliExpress tracking URL. Please send a direct product link.');
    }
    
    throw new Error(`Failed to resolve URL: ${error.message}`);
  }
}

// Improved product details function with better error handling
async function getProductDetails(url) {
  try {
    // First check if the URL contains a direct product ID
    let productId = extractProductId(url);
    
    // If no product ID found directly, try to resolve the URL first
    if (!productId) {
      console.log('No direct product ID found, resolving URL...');
      const resolvedUrl = await resolveShortUrl(url);
      productId = extractProductId(resolvedUrl);
      
      if (!productId) {
        throw new Error('Could not extract product ID even after resolving URL');
      }
    }
    
    console.log(`Getting product details for ID: ${productId}`);
    const timestamp = new Date().toISOString().split('.')[0].replace(/[-:T]/g, '');
    
    const params = {
      app_key: aliExpressConfig.appKey,
      method: 'aliexpress.affiliate.product.query',
      sign_method: 'md5',
      timestamp: timestamp,
      format: 'json',
      v: '2.0',
      product_ids: productId
    };
    
    // Add signature
    params.sign = signRequest(params, aliExpressConfig.appSecret);
    
    const response = await axios.post(aliExpressConfig.apiUrl, null, { params });
    console.log('Successfully received product details');
    return response.data;
  } catch (error) {
    console.error('Error getting product details:', error.message);
    throw error;
  }
}

// Function to generate affiliate link
async function getAffiliateLink(productId) {
  try {
    const timestamp = new Date().toISOString().split('.')[0].replace(/[-:T]/g, '');
    
    const params = {
      app_key: aliExpressConfig.appKey,
      method: 'aliexpress.affiliate.link.generate',
      sign_method: 'md5',
      timestamp: timestamp,
      format: 'json',
      v: '2.0',
      promotion_link_type: '0', // 0 for product links
      source_values: productId,
      tracking_id: aliExpressConfig.trackingId
    };
    
    // Add signature
    params.sign = signRequest(params, aliExpressConfig.appSecret);
    
    const response = await axios.post(aliExpressConfig.apiUrl, null, { params });
    return response.data;
  } catch (error) {
    console.error('Error generating affiliate link:', error.message);
    throw error;
  }
}

// Function to format product information for response
function formatProductResponse(productDetails, affiliateLink) {
  try {
    const product = productDetails.aliexpress_affiliate_product_query_response.resp_result.result.products.product[0];
    const promotionLink = affiliateLink.aliexpress_affiliate_link_generate_response.resp_result.result.promotion_links.promotion_link[0];
    
    return `
🔥 *${product.product_title}*

💰 *Price:* $${product.target_app_sale_price}
⭐ *Rating:* ${product.evaluate_rate}%
📦 *Orders:* ${product.lastest_volume}

👉 [Buy Now With Discount](${promotionLink.promotion_link})
`;
  } catch (error) {
    console.error('Error formatting product response:', error);
    return 'Sorry, I could not retrieve the product information.';
  }
}

// More robust webhook setup with retry logic
async function setupWebhook(token, webhookUrl) {
  const maxRetries = 5;
  let retries = 0;
  let success = false;
  
  while (retries < maxRetries && !success) {
    try {
      console.log(`Setting webhook (attempt ${retries + 1}/${maxRetries}): ${webhookUrl}`);
      await bot.telegram.setWebhook(webhookUrl, {
        drop_pending_updates: true,
        max_connections: 100
      });
      success = true;
      console.log('Webhook successfully set!');
    } catch (error) {
      retries++;
      console.error(`Webhook setup failed (attempt ${retries}/${maxRetries}):`, error.message);
      
      if (retries < maxRetries) {
        // Exponential backoff: wait longer between each retry
        const waitTime = Math.pow(2, retries) * 1000;
        console.log(`Retrying in ${waitTime/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        console.error('All webhook setup attempts failed. Falling back to polling mode.');
        // Fallback to polling if all webhook attempts fail
        await bot.launch();
        console.log('Bot started in polling mode as fallback');
      }
    }
  }
  
  return success;
}

// Bot command handlers
bot.start((ctx) => {
  ctx.reply('Welcome to AliExpress Affiliate Bot! 🚀\n\nSend me an AliExpress product link, and I\'ll give you the best price with an affiliate link.');
});

bot.help((ctx) => {
  ctx.reply('Just send me any AliExpress product link, and I\'ll generate an affiliate link for you with the best price.');
});

// Handle URLs with improved error handling
bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  
  // Check if the message contains a URL
  if (text.includes('aliexpress.com') || text.includes('ae.aliexpress.com') || text.includes('a.aliexpress.com')) {
    try {
      const processingMsg = await ctx.reply('Processing your link... Please wait.');
      
      console.log(`Processing URL: ${text}`);
      // Get product details directly passing the URL
      const productDetails = await getProductDetails(text);
      
      // Extract product ID for the affiliate link generation
      let productId;
      try {
        productId = productDetails.aliexpress_affiliate_product_query_response.resp_result.result.products.product[0].product_id;
      } catch (e) {
        throw new Error('Failed to extract product ID from API response');
      }
      
      console.log(`Generating affiliate link for product ID: ${productId}`);
      const affiliateLink = await getAffiliateLink(productId);
      
      const response = formatProductResponse(productDetails, affiliateLink);
      await ctx.replyWithMarkdown(response);
      
      // Delete the "processing" message after we've sent the response
      try {
        await ctx.deleteMessage(processingMsg.message_id);
      } catch (e) {
        console.log('Could not delete processing message:', e.message);
      }
    } catch (error) {
      console.error('Error processing link:', error);
      ctx.reply(`Sorry, there was an error processing this link: ${error.message}\n\nPlease try another product or try again later.`);
    }
  } else {
    ctx.reply('Please send me an AliExpress product link.');
  }
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Express routes
app.use(express.json());

// Root route - Display a simple status page
app.get('/', (req, res) => {
  res.status(200).send('AliExpress Affiliate Bot is running! 🚀');
});

// Webhook route for Telegram
app.post(`/webhook/${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body);
  res.status(200).send('OK');
});

// Configure the bot to work with webhooks for Vercel deployment
const WEBHOOK_URL = `https://ali-express-best-pricev2.vercel.app/webhook/${process.env.TELEGRAM_BOT_TOKEN}`;

// For local development
if (process.env.NODE_ENV === 'development') {
  // Use polling for local development
  bot.launch().then(() => {
    console.log('Bot started in polling mode (development)');
  });
} else {
  // For Vercel production environment
  setupWebhook(process.env.TELEGRAM_BOT_TOKEN, WEBHOOK_URL)
    .then(success => {
      if (success) {
        console.log('Using webhook mode for production');
      } else {
        console.log('Using polling mode as fallback for production');
      }
    });
  
  // Start Express server for production (Vercel)
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export for Vercel serverless functions
module.exports = app;
