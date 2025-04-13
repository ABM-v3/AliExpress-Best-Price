// index.js - Main entry point with improvements
const express = require('express');
const { Telegraf } = require('telegraf');
const axios = require('axios');
const crypto = require('crypto');
const dotenv = require('dotenv');
const NodeCache = require('node-cache'); // Add caching
const { RateLimiter } = require('limiter'); // Add rate limiting

// Load environment variables
dotenv.config();

// Initialize Express app for webhook handling
const app = express();

// Initialize Telegram bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// AliExpress API config
const aliExpressConfig = {
  appKey: process.env.ALIEXPRESS_APP_KEY,
  appSecret: process.env.ALIEXPRESS_APP_SECRET,
  trackingId: process.env.ALIEXPRESS_TRACKING_ID,
  apiUrl: 'https://api-sg.aliexpress.com/sync',
  // Add fallback URL in case Singapore gateway has issues
  fallbackApiUrl: 'https://api.aliexpress.com/sync'
};

// Initialize cache - 30 minute TTL
const cache = new NodeCache({ stdTTL: 1800, checkperiod: 300 });

// Initialize rate limiter - 1 request per second (adjust based on AliExpress limits)
const rateLimiter = new RateLimiter({ tokensPerInterval: 1, interval: "second" });

// AliExpress API error codes mapping
const aliExpressErrorCodes = {
  '40001': 'Missing required parameters',
  '40002': 'Invalid parameter value',
  '40003': 'Insufficient permissions',
  '40004': 'System error',
  '40005': 'Request timeout',
  '50001': 'API service is unavailable',
  '50002': 'API service is under maintenance'
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

// Improved function to extract product ID from AliExpress URL with more URL patterns
function extractProductId(url) {
  try {
    // Common patterns for product URLs
    const patterns = [
      // Standard item URL: https://www.aliexpress.com/item/1005006456204259.html
      /item\/(\d+)(?:\.html)?/,
      
      // Detail URL with spm: https://www.aliexpress.com/item/detail/1005006456204259.html
      /detail\/(\d+)(?:\.html)?/,
      
      // URL with product ID in query parameter
      /(?:[?&])productId=(\d+)/,
      
      // URL with item ID in query parameter
      /(?:[?&])itemId=(\d+)/,
      
      // URL with ID in query parameter
      /(?:[?&])id=(\d+)/
    ];
    
    // Try each pattern
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        console.log(`Extracted product ID: ${match[1]} using pattern ${pattern}`);
        return match[1];
      }
    }
    
    // For other formats
    return null;
  } catch (error) {
    console.error('Error extracting product ID:', error);
    return null;
  }
}

// Improved function to resolve short URLs with retries and exponential backoff
async function resolveShortUrl(url, retries = 3) {
  try {
    console.log(`Resolving URL: ${url}`);
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Make request with timeout
        const response = await axios.get(url, {
          maxRedirects: 5,
          validateStatus: function(status) {
            return status >= 200 && status < 400; // Accept all 2xx and 3xx responses
          },
          timeout: 8000, // 8 seconds timeout
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
        if (attempt < retries) {
          const waitTime = Math.pow(2, attempt) * 1000;
          console.log(`URL resolution attempt ${attempt} failed, retrying in ${waitTime/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          throw error; // Rethrow the error after all retries
        }
      }
    }
  } catch (error) {
    console.error('Error resolving short URL:', error);
    
    // Special case for AliExpress click tracking URLs
    if (url.includes('click.aliexpress.com') || url.includes('s.click.aliexpress.com')) {
      console.log('Detected AliExpress tracking URL, attempting alternative resolution...');
      
      // Try to extract product ID from the URL parameters
      try {
        const urlObj = new URL(url);
        const params = new URLSearchParams(urlObj.search);
        
        // Different URL param patterns AliExpress might use
        const possibleParams = ['dl_target_url', 'ulp', 'url', 'target'];
        
        for (const param of possibleParams) {
          if (params.has(param)) {
            const targetUrl = params.get(param);
            if (targetUrl && (targetUrl.includes('aliexpress.com') || targetUrl.includes('ae.aliexpress.com'))) {
              console.log(`Found target URL in parameter ${param}: ${targetUrl}`);
              
              // Handle URL encoding if needed
              try {
                return decodeURIComponent(targetUrl);
              } catch (e) {
                return targetUrl;
              }
            }
          }
        }
      } catch (e) {
        console.error('Error parsing tracking URL:', e);
      }
      
      // If we can't resolve a click.aliexpress.com URL, throw a specific error
      throw new Error('Cannot process AliExpress tracking URL. Please send a direct product link.');
    }
    
    throw new Error(`Failed to resolve URL: ${error.message}`);
  }
}

// Improved product details function with caching and rate limiting
async function getProductDetails(url) {
  try {
    // Normalize URL to prevent duplicate cache entries
    const normalizedUrl = url.trim().toLowerCase().replace(/\/$/, '');
    
    // Check cache first
    const cacheKey = `product_${normalizedUrl}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log(`Cache hit for URL: ${normalizedUrl}`);
      return cachedData;
    }
    
    // First check if the URL contains a direct product ID
    let productId = extractProductId(normalizedUrl);
    
    // If no product ID found directly, try to resolve the URL first
    if (!productId) {
      console.log('No direct product ID found, resolving URL...');
      const resolvedUrl = await resolveShortUrl(normalizedUrl);
      productId = extractProductId(resolvedUrl);
      
      if (!productId) {
        throw new Error('Could not extract product ID from this link. Please send a direct AliExpress product link.');
      }
    }
    
    console.log(`Getting product details for ID: ${productId}`);
    
    // Add rate limiting
    await rateLimiter.removeTokens(1);
    
    const timestamp = new Date().toISOString().split('.')[0].replace(/[-:T]/g, '');
    
    const params = {
      app_key: aliExpressConfig.appKey,
      method: 'aliexpress.affiliate.product.query',
      sign_method: 'md5',
      timestamp: timestamp,
      format: 'json',
      v: '2.0',
      product_ids: productId,
      fields: 'product_id,product_title,product_main_image_url,product_small_image_urls,product_video_url,product_detail_url,promo_link_info,target_app_sale_price,target_original_price,shop_id,shop_url,evaluate_rate,lastest_volume,sale_price,original_price,discount,target_sale_price,first_level_category_id,first_level_category_name,second_level_category_id,second_level_category_name,ship_to,ship_from'
    };
    
    // Add signature
    params.sign = signRequest(params, aliExpressConfig.appSecret);
    
    try {
      const response = await axios.post(aliExpressConfig.apiUrl, null, { params, timeout: 10000 });
      
      // Validate the response
      if (!response.data || !response.data.aliexpress_affiliate_product_query_response || 
          !response.data.aliexpress_affiliate_product_query_response.resp_result || 
          !response.data.aliexpress_affiliate_product_query_response.resp_result.result) {
        throw new Error('Invalid response from AliExpress API');
      }
      
      // Check for AliExpress API error codes
      const respResult = response.data.aliexpress_affiliate_product_query_response.resp_result;
      if (respResult.resp_code !== '200') {
        const errorCode = respResult.resp_code;
        const errorMsg = respResult.resp_msg || aliExpressErrorCodes[errorCode] || 'Unknown error';
        throw new Error(`AliExpress API error ${errorCode}: ${errorMsg}`);
      }
      
      // Verify that products exist in the response
      if (!respResult.result.products || !respResult.result.products.product || respResult.result.products.product.length === 0) {
        throw new Error('Product not found or no longer available');
      }
      
      // Store in cache
      cache.set(cacheKey, response.data);
      console.log('Successfully received and cached product details');
      return response.data;
    } catch (error) {
      // If primary API fails, try fallback API
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.response?.status >= 500) {
        console.log('Primary API failed, trying fallback API...');
        const fallbackResponse = await axios.post(aliExpressConfig.fallbackApiUrl, null, { params, timeout: 10000 });
        
        if (fallbackResponse.data && fallbackResponse.data.aliexpress_affiliate_product_query_response) {
          cache.set(cacheKey, fallbackResponse.data);
          return fallbackResponse.data;
        }
      }
      throw error;
    }
  } catch (error) {
    console.error('Error getting product details:', error.message);
    throw error;
  }
}

// Improved affiliate link function with caching and rate limiting
async function getAffiliateLink(productId) {
  try {
    // Check cache first
    const cacheKey = `aff_${productId}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log(`Cache hit for affiliate link: ${productId}`);
      return cachedData;
    }
    
    // Add rate limiting
    await rateLimiter.removeTokens(1);
    
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
    
    try {
      const response = await axios.post(aliExpressConfig.apiUrl, null, { params, timeout: 10000 });
      
      // Validate the response
      if (!response.data || !response.data.aliexpress_affiliate_link_generate_response || 
          !response.data.aliexpress_affiliate_link_generate_response.resp_result || 
          !response.data.aliexpress_affiliate_link_generate_response.resp_result.result) {
        throw new Error('Invalid response from AliExpress API for affiliate link generation');
      }
      
      // Check for AliExpress API error codes
      const respResult = response.data.aliexpress_affiliate_link_generate_response.resp_result;
      if (respResult.resp_code !== '200') {
        const errorCode = respResult.resp_code;
        const errorMsg = respResult.resp_msg || aliExpressErrorCodes[errorCode] || 'Unknown error';
        throw new Error(`AliExpress API error ${errorCode}: ${errorMsg}`);
      }
      
      // Verify that promotion links exist in the response
      if (!respResult.result.promotion_links || 
          !respResult.result.promotion_links.promotion_link || 
          respResult.result.promotion_links.promotion_link.length === 0) {
        throw new Error('Failed to generate affiliate link');
      }
      
      // Store in cache
      cache.set(cacheKey, response.data);
      return response.data;
    } catch (error) {
      // If primary API fails, try fallback API
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.response?.status >= 500) {
        console.log('Primary API failed, trying fallback API for affiliate link...');
        const fallbackResponse = await axios.post(aliExpressConfig.fallbackApiUrl, null, { params, timeout: 10000 });
        
        if (fallbackResponse.data && fallbackResponse.data.aliexpress_affiliate_link_generate_response) {
          cache.set(cacheKey, fallbackResponse.data);
          return fallbackResponse.data;
        }
      }
      throw error;
    }
  } catch (error) {
    console.error('Error generating affiliate link:', error.message);
    throw error;
  }
}

// Enhanced function to format product information with more details and better formatting
function formatProductResponse(productDetails, affiliateLink) {
  try {
    const product = productDetails.aliexpress_affiliate_product_query_response.resp_result.result.products.product[0];
    const promotionLink = affiliateLink.aliexpress_affiliate_link_generate_response.resp_result.result.promotion_links.promotion_link[0];
    
    // Calculate discount percentage if available
    let discountText = '';
    if (product.original_price && product.target_app_sale_price) {
      const originalPrice = parseFloat(product.original_price);
      const salePrice = parseFloat(product.target_app_sale_price);
      if (originalPrice > salePrice) {
        const discountPercent = Math.round((1 - salePrice / originalPrice) * 100);
        discountText = discountPercent > 0 ? `🔥 *${discountPercent}% OFF* 🔥\n` : '';
      }
    }
    
    // Format shipping info if available
    let shippingText = '';
    if (product.ship_to && product.ship_from) {
      shippingText = `📦 *Ships from:* ${product.ship_from} to ${product.ship_to}\n`;
    }
    
    // Format category info if available
    let categoryText = '';
    if (product.first_level_category_name) {
      categoryText = `📌 *Category:* ${product.first_level_category_name}`;
      if (product.second_level_category_name) {
        categoryText += ` > ${product.second_level_category_name}`;
      }
      categoryText += '\n';
    }
    
    // Format original price if there's a discount
    let priceText = '';
    if (product.original_price && parseFloat(product.original_price) > parseFloat(product.target_app_sale_price)) {
      priceText = `💰 *Price:* $${product.target_app_sale_price} ~~$${product.original_price}~~\n`;
    } else {
      priceText = `💰 *Price:* $${product.target_app_sale_price}\n`;
    }
    
    // Build the full message
    return `
${discountText}*${product.product_title}*

${priceText}⭐ *Rating:* ${product.evaluate_rate}%
${product.lastest_volume ? `📦 *Orders:* ${product.lastest_volume}\n` : ''}${shippingText}${categoryText}
👉 [Buy Now With Discount](${promotionLink.promotion_link})
`;
  } catch (error) {
    console.error('Error formatting product response:', error);
    return 'Sorry, I could not retrieve the product information.';
  }
}

// Improved webhook setup with retry logic and health checking
async function setupWebhook(token, webhookUrl) {
  const maxRetries = 5;
  let retries = 0;
  let success = false;
  
  while (retries < maxRetries && !success) {
    try {
      console.log(`Setting webhook (attempt ${retries + 1}/${maxRetries}): ${webhookUrl}`);
      
      // First check if current webhook is already set correctly
      const webhookInfo = await bot.telegram.getWebhookInfo();
      if (webhookInfo.url === webhookUrl && webhookInfo.is_ip_webhooks === false) {
        console.log('Webhook already correctly set up!');
        return true;
      }
      
      // Set the webhook with improved options
      await bot.telegram.setWebhook(webhookUrl, {
        drop_pending_updates: true,
        max_connections: 100,
        allowed_updates: ['message', 'edited_message', 'callback_query']
      });
      
      // Verify webhook was set correctly
      const verifyWebhook = await bot.telegram.getWebhookInfo();
      if (verifyWebhook.url === webhookUrl) {
        success = true;
        console.log('Webhook successfully set and verified!');
      } else {
        throw new Error('Webhook verification failed');
      }
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

// Improved URL detection function
function extractAliExpressUrl(text) {
  // Match various AliExpress domains and URL patterns
  const aliexpressRegex = /(https?:\/\/(?:www\.|m\.|a\.|[a-z0-9-]+\.)?(?:aliexpress\.com|ae\.aliexpress\.com|ru\.aliexpress\.com|pt\.aliexpress\.com|es\.aliexpress\.com|fr\.aliexpress\.com|de\.aliexpress\.com|it\.aliexpress\.com|nl\.aliexpress\.com)(?:\/[^\s]+)?)/gi;
  
  const matches = text.match(aliexpressRegex);
  return matches ? matches[0] : null;
}

// Enhanced error message function for user-friendly messages
function getUserFriendlyErrorMessage(error) {
  const message = error.message || 'Unknown error occurred';
  
  // Map common error patterns to friendly messages
  if (message.includes('product not found') || message.includes('no longer available')) {
    return 'This product appears to be unavailable or has been removed. Please try another product.';
  }
  
  if (message.includes('extract product ID')) {
    return 'I couldn\'t find a valid product in this link. Please send me a direct link to a specific product on AliExpress.';
  }
  
  if (message.includes('tracking URL')) {
    return 'I can\'t process this tracking URL directly. Please send me the direct product link from AliExpress instead.';
  }
  
  if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
    return 'The AliExpress server is taking too long to respond. Please try again later.';
  }
  
  if (message.includes('API error')) {
    return `There was an error connecting to AliExpress: ${
