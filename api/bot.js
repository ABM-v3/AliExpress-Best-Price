const { Telegraf } = require('telegraf');
const axios = require('axios');

const bot = new Telegraf(process.env.BOT_TOKEN);

// 1. AliExpress API Authentication
let authToken = null;
async function getAuthToken() {
  if (authToken) return authToken;
  
  const response = await axios.post('https://api.alibaba.com/token', {
    client_id: process.env.ALI_APP_KEY,
    client_secret: process.env.ALI_APP_SECRET,
    grant_type: 'client_credentials'
  }, { timeout: 5000 });

  authToken = response.data.access_token;
  return authToken;
}

// 2. Product ID Extractor (Supports All Link Types)
function extractProductId(url) {
  // Standard: https://www.aliexpress.com/item/100500123456.html
  let match = url.match(/aliexpress\.com\/item\/(\d+)/);
  if (match) return match[1];

  // Affiliate: https://s.click.aliexpress.com/e/_DdJwKq1
  match = url.match(/[?&]url=[^%]*%2Fitem%2F(\d+)/);
  if (match) return match[1];

  // Mobile: https://m.aliexpress.com/i/100500123456.html
  match = url.match(/m\.aliexpress\.com\/i\/(\d+)/);
  if (match) return match[1];

  return null;
}

// 3. Real Shipping API Call
async function getShippingMethods(productId) {
  try {
    const token = await getAuthToken();
    const response = await axios.get(`https://api.alibaba.com/logistics/shipping`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        productId,
        countryCode: 'US' // Change based on user location
      },
      timeout: 8000
    });

    return response.data.methods.map(method => ({
      name: method.shippingCompany,
      days: `${method.minDeliveryDays}-${method.maxDeliveryDays}`,
      cost: method.fee ? `$${method.fee}` : 'Free',
      service: method.serviceName,
      tracking: method.hasTracking ? '✅' : '❌'
    }));

  } catch (error) {
    console.error('Shipping API Error:', error.response?.data || error.message);
    throw new Error('Failed to fetch shipping data');
  }
}

// 4. Bot Commands
bot.start((ctx) => {
  ctx.replyWithMarkdown(
    `🚢 *AliExpress Shipping Checker*\n\n` +
    `Send me any product link to see *real-time shipping options*:\n\n` +
    `• Standard: https://www.aliexpress.com/item/100500123456.html\n` +
    `• Affiliate: https://s.click.aliexpress.com/e/_DdJwKq1\n` +
    `• Mobile: https://m.aliexpress.com/i/100500123456.html`
  );
});

// 5. Message Handler
bot.on('text', async (ctx) => {
  const url = ctx.message.text.trim();
  
  if (!url.includes('aliexpress.com')) {
    return ctx.reply('Please send a valid AliExpress link');
  }

  try {
    await ctx.sendChatAction('typing');
    const productId = extractProductId(url);
    
    if (!productId) {
      return ctx.reply('⚠️ Could not identify product. Send direct item links for best results.');
    }

    const methods = await getShippingMethods(productId);
    
    if (methods.length === 0) {
      return ctx.reply('No shipping methods found for this product');
    }

    let response = `📦 *Shipping Options for* [${productId}](https://www.aliexpress.com/item/${productId}.html)\n\n`;
    methods.forEach((m, i) => {
      response += `${i+1}. *${m.name}* (${m.service})\n` +
                 `   ⏱ ${m.days} days | 💰 ${m.cost}\n` +
                 `   Tracking: ${m.tracking}\n\n`;
    });

    ctx.replyWithMarkdown(response);

  } catch (error) {
    console.error('Handler Error:', error);
    ctx.reply('⚠️ Error fetching shipping data. Please try again later.');
  }
});

// 6. Vercel Handler
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
