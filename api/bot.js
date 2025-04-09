const { Telegraf } = require('telegraf');
const axios = require('axios');

const bot = new Telegraf(process.env.BOT_TOKEN);

// 1. Enhanced Product ID Extractor
function extractProductId(url) {
  try {
    // Handle affiliate links by extracting final URL
    if (url.includes('s.click.aliexpress.com')) {
      const decoded = decodeURIComponent(url);
      const itemMatch = decoded.match(/item%2F(\d+)\.html/);
      if (itemMatch) return itemMatch[1];
      
      // Alternative pattern for some affiliate links
      const idMatch = decoded.match(/id=(\d+)/);
      if (idMatch) return idMatch[1];
    }

    // Standard and mobile links
    const patterns = [
      /aliexpress\.com\/item\/(\d+)/,
      /m\.aliexpress\.com\/i\/(\d+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    return null;
  } catch (e) {
    console.error('Extraction error:', e);
    return null;
  }
}

// 2. Debugging-Friendly API Call
async function getShippingMethods(productId) {
  console.log(`Fetching shipping for ${productId}`);
  
  try {
    // Simulate API response (replace with real API call)
    return [
      {
        name: "AliExpress Standard Shipping",
        days: "15-25",
        cost: "Free",
        tracking: true
      },
      {
        name: "DHL Express",
        days: "3-7", 
        cost: "$12.99",
        tracking: true
      }
    ];

    /* REAL IMPLEMENTATION:
    const token = await getAuthToken();
    const response = await axios.get(`https://api.alibaba.com/shipping`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { productId }
    });
    return response.data.methods;
    */
  } catch (error) {
    console.error('API Failure:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    throw new Error('Shipping API unavailable');
  }
}

// 3. Enhanced Error Responses
bot.on('text', async (ctx) => {
  const url = ctx.message.text.trim();
  console.log('Received URL:', url);

  if (!url.includes('aliexpress.com')) {
    return ctx.reply('❌ Please send a valid AliExpress link');
  }

  try {
    await ctx.sendChatAction('typing');
    const productId = extractProductId(url);
    console.log('Extracted ID:', productId);

    if (!productId) {
      return ctx.replyWithMarkdown(
        `🔍 *Couldn't extract product ID*\n\n` +
        `Try these link formats:\n` +
        `• Full URL: \\\`https://www.aliexpress.com/item/100500123456.html\\\`\n` +
        `• Clean affiliate link: \\\`https://s.click.aliexpress.com/e/_DdJwKq1\\\``
      );
    }

    const methods = await getShippingMethods(productId);
    console.log('Methods:', methods);

    let response = `🚛 *Shipping Options*\n\n`;
    methods.forEach((m, i) => {
      response += `${i+1}. *${m.name}*\n` +
                 `   ⏱ ${m.days} days | 💰 ${m.cost}\n` +
                 `   ${m.tracking ? '📦 With tracking' : '🚫 No tracking'}\n\n`;
    });

    await ctx.replyWithMarkdown(response);

  } catch (error) {
    console.error('Handler Error:', error);
    await ctx.replyWithMarkdown(
      `⚠️ *Shipping Data Unavailable*\n\n` +
      `Possible reasons:\n` +
      `• Product doesn't ship to your country\n` +
      `• Temporary API issue\n\n` +
      `Try again later or contact support`
    );
  }
});

// Keep other functions unchanged
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
