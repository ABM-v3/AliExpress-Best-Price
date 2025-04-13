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

// Function to extract product ID from AliExpress URL
function extractProductId(url) {
  // Handle different URL formats
  let productId = null;
  
  if (url.includes('item/')) {
    // Format: https://www.aliexpress.com/item/1005006456204259.html
    const match = url.match(/item\/(\d+)\.html/);
    if (match && match[1]) {
      productId = match[1];
    }
  } else if (url.includes('/_m/')) {
    // Format: https://a.aliexpress.com/_m0LrCZV
    // For this format, we need to follow redirects and extract from final URL
    // This will be handled in the getAffiliateLink function
    productId = url;
  }
  
  return productId;
}

// Function to get product details from AliExpress API
async function getProductDetails(productId) {
  try {
    // For direct product IDs
    if (/^\d+$/.test(productId)) {
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
      return response.data;
    } 
    // For short URLs, first resolve the URL
    else {
      const resolvedUrl = await resolveShortUrl(productId);
      const resolvedProductId = extractProductId(resolvedUrl);
      if (resolvedProductId) {
        return getProductDetails(resolvedProductId);
      }
      throw new Error('Could not extract product ID from URL');
    }
  } catch (error) {
    console.error('Error getting product details:', error.message);
    throw error;
  }
}

// Function to resolve short URLs
async function resolveShortUrl(url) {
  try {
    const response = await axios.get(url, {
      maxRedirects: 5,
      validateStatus: null
    });
    return response.request.res.responseUrl || url;
  } catch (error) {
    console.error('Error resolving short URL:', error.message);
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

// Bot command handlers
bot.start((ctx) => {
  ctx.reply('Welcome to AliExpress Affiliate Bot! 🚀\n\nSend me an AliExpress product link, and I\'ll give you the best price with an affiliate link.');
});

bot.help((ctx) => {
  ctx.reply('Just send me any AliExpress product link, and I\'ll generate an affiliate link for you with the best price.');
});

// Handle URLs
bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  
  // Check if the message contains a URL
  if (text.includes('aliexpress.com') || text.includes('ae.aliexpress.com') || text.includes('a.aliexpress.com')) {
    try {
      ctx.reply('Processing your link... Please wait.');
      
      const productId = extractProductId(text);
      if (!productId) {
        ctx.reply('Sorry, I couldn\'t recognize this AliExpress link format. Please send a valid product link.');
        return;
      }
      
      const productDetails = await getProductDetails(productId);
      const affiliateLink = await getAffiliateLink(productId);
      
      const response = formatProductResponse(productDetails, affiliateLink);
      ctx.replyWithMarkdown(response);
    } catch (error) {
      console.error('Error processing link:', error);
      ctx.reply('Sorry, there was an error processing this link. Please try another product or try again later.');
    }
  } else {
    ctx.reply('Please send me an AliExpress product link.');
  }
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Express route for webhook
app.use(express.json());
app.post(`/webhook/${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body);
  res.status(200).send('OK');
});

// For local development
if (process.env.NODE_ENV === 'development') {
  // Use polling for local development
  bot.launch().then(() => {
    console.log('Bot started in polling mode');
  });
} else {
  // Start Express server for production (Vercel)
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export for Vercel serverless functions
module.exports = app;
