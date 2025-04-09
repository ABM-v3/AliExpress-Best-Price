const { Telegraf } = require('telegraf');
const axios = require('axios');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Extract product ID from any AliExpress URL format
function extractProductId(url) {
  // Format 1: Direct product links
  // Example: https://www.aliexpress.com/item/100500123456.html
  const directMatch = url.match(/aliexpress\.com\/item\/(\d+)/);
  if (directMatch) return directMatch[1];

  // Format 2: Affiliate/shortened links
  // Example: https://s.click.aliexpress.com/e/_Dl9rkcl
  const affiliateMatch = url.match(/\/e\/_(\w+)/);
  if (affiliateMatch) {
    // In real implementation, you would resolve the short URL to get final product ID
    return 'PRODUCT_ID_FROM_SHORTLINK'; // Placeholder
  }

  // Format 3: Mobile links
  // Example: https://m.aliexpress.com/i/100500123456.html
  const mobileMatch = url.match(/m\.aliexpress\.com\/i\/(\d+)/);
  if (mobileMatch) return mobileMatch[1];

  return null;
}

// Get shipping methods (mock data - replace with real API)
async function getShippingMethods(productId) {
  // These would come from AliExpress API in production
  return [
    { 
      name: "AliExpress Standard Shipping",
      days: "15-45",
      cost: "Free",
      carrier: "Cainiao"
    },
    { 
      name: "AliExpress Premium Shipping",
      days: "10-20", 
      cost: "$2.99",
      carrier: "AliExpress Logistics"
    },
    {
      name: "DHL Express",
      days: "3-7",
      cost: "$15.99",
      carrier: "DHL"
    }
  ];
}

bot.start((ctx) => {
  ctx.replyWithMarkdown(
    `🚛 *AliExpress Shipping Finder*\n\n` +
    `Send me any AliExpress product link to see shipping options:\n\n` +
    `• Full link: https://www.aliexpress.com/item/100500123456.html\n` +
    `• Affiliate link: https://s.click.aliexpress.com/e/_Dl9rkcl\n` +
    `• Mobile link: https://m.aliexpress.com/i/100500123456.html`
  );
});

bot.on('text', async (ctx) => {
  const url = ctx.message.text.trim();
  
  // Verify it's an AliExpress link
  if (!url.includes('aliexpress.com')) {
    return ctx.reply('Please send a valid AliExpress product link');
  }

  try {
    await ctx.sendChatAction('typing');
    
    const productId = extractProductId(url);
    if (!productId) {
      return ctx.reply('Could not extract product ID from this link format');
    }

    const shippingMethods = await getShippingMethods(productId);
    
    if (shippingMethods.length === 0) {
      return ctx.reply('No shipping methods available for this product');
    }

    let response = `📦 *Shipping Options*\n\n`;
    shippingMethods.forEach(method => {
      response += `🚚 *${method.name}*\n` +
                 `⏱️ Delivery: ${method.days} days\n` +
                 `💵 Cost: ${method.cost}\n` +
                 `📦 Carrier: ${method.carrier}\n\n`;
    });

    ctx.replyWithMarkdown(response);

  } catch (error) {
    console.error('Error:', error);
    ctx.reply('⚠️ Error fetching shipping info. Please try again later.');
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
