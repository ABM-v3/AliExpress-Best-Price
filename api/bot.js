const { Telegraf } = require('telegraf');
const axios = require('axios');

const bot = new Telegraf(process.env.BOT_TOKEN);

// 1. API Authentication with Token Refresh
let apiToken = null;
async function refreshToken() {
  try {
    const response = await axios.post('https://api.alibaba.com/token', {
      client_id: process.env.ALI_APP_KEY,
      client_secret: process.env.ALI_APP_SECRET,
      grant_type: 'client_credentials'
    }, { timeout: 5000 });
    
    apiToken = response.data.access_token;
    setTimeout(refreshToken, (response.data.expires_in - 60) * 1000); // Refresh 1min before expiry
    return apiToken;
  } catch (e) {
    console.error('Token refresh failed:', e.message);
    throw e;
  }
}

// 2. Universal Product ID Extractor
function extractProductId(url) {
  try {
    // Decode URL first
    const decodedUrl = decodeURIComponent(url);
    
    // Pattern 1: Standard affiliate links (s.click.aliexpress.com)
    const affiliateMatch = decodedUrl.match(/(?:item%2F|i%2F)(\d+)/) || decodedUrl.match(/id=(\d+)/);
    if (affiliateMatch) return affiliateMatch[1];
    
    // Pattern 2: Direct product links
    const directMatch = url.match(/(?:aliexpress\.com\/item\/|m\.aliexpress\.com\/i\/)(\d+)/);
    if (directMatch) return directMatch[1];
    
    return null;
  } catch (e) {
    console.error('URL parsing error:', e);
    return null;
  }
}

// 3. Real Shipping API Call
async function fetchShippingMethods(productId) {
  try {
    const token = apiToken || await refreshToken();
    
    const response = await axios.get('https://api.alibaba.com/logistics/shipping_options', {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        product_id: productId,
        target_currency: 'USD',
        target_language: 'en',
        country_code: 'US' // Change as needed
      },
      timeout: 10000
    });

    return response.data.data?.map(method => ({
      name: method.shipping_company,
      days: `${method.estimated_delivery_time_min}-${method.estimated_delivery_time_max} days`,
      cost: method.fee ? `$${method.fee.value}` : 'Free',
      tracking: method.tracked ? '✅' : '❌',
      service: method.service_name
    })) || [];

  } catch (error) {
    console.error('Shipping API Error:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    throw new Error('Failed to fetch shipping data');
  }
}

// 4. Bot Command Handlers
bot.start((ctx) => {
  ctx.replyWithMarkdown(
    `🚢 *AliExpress Shipping Checker*\n\n` +
    `Send me any product link:\n` +
    `• Affiliate: \\\`https://s.click.aliexpress.com/e/_DdJwKq1\\\`\n` +
    `• Direct: \\\`https://www.aliexpress.com/item/100500123456.html\\\`\n` +
    `• Mobile: \\\`https://m.aliexpress.com/i/100500123456.html\\``
  );
});

bot.on('text', async (ctx) => {
  const url = ctx.message.text.trim();
  
  if (!url.includes('aliexpress.com')) {
    return ctx.reply('❌ Please send a valid AliExpress link');
  }

  try {
    await ctx.sendChatAction('typing');
    
    // Extract product ID
    const productId = extractProductId(url);
    if (!productId) {
      return ctx.replyWithMarkdown(
        `🔍 *Invalid Link Format*\n\n` +
        `I support:\n` +
        `• Affiliate links (s.click.aliexpress.com)\n` +
        `• Direct product links\n` +
        `• Mobile links\n\n` +
        `Example: \\\`https://www.aliexpress.com/item/100500123456.html\\``
      );
    }

    // Fetch real shipping data
    const methods = await fetchShippingMethods(productId);
    
    if (methods.length === 0) {
      return ctx.reply('⚠️ No shipping options available for this product');
    }

    // Format response
    let response = `📦 *Shipping Options*\n\n`;
    methods.forEach((m, i) => {
      response += `${i+1}. *${m.name}* (${m.service})\n` +
                 `   ⏱ ${m.days} | 💰 ${m.cost}\n` +
                 `   Tracking: ${m.tracking}\n\n`;
    });

    await ctx.replyWithMarkdown(response);

  } catch (error) {
    console.error('Handler Error:', error);
    await ctx.replyWithMarkdown(
      `⚠️ *Service Temporarily Unavailable*\n\n` +
      `Please try:\n` +
      `1. Sending the link again\n` +
      `2. Using a direct product link\n` +
      `3. Trying later\n\n` +
      `Error: \\\`${error.message}\\\``
    );
  }
});

// Vercel handler
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
    }
    res.status(200).json({ status: 'OK' });
  } catch (e) {
    console.error('Webhook Error:', e);
    res.status(200).json({ status: 'Error handled' });
  }
};
