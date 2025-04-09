const { Telegraf } = require('telegraf');
const axios = require('axios');

const bot = new Telegraf(process.env.BOT_TOKEN);

// 1. Mock shipping methods (replace with real API call if needed)
async function getShippingMethods(productId) {
  // In a real implementation, you would call AliExpress API here
  return [
    { name: "AliExpress Standard Shipping", days: "15-20", cost: "Free" },
    { name: "DHL Express", days: "3-5", cost: "$12.99" },
    { name: "EMS", days: "7-12", cost: "$8.50" }
  ];
}

// 2. Start command
bot.start((ctx) => {
  ctx.replyWithMarkdown(
    `🚚 *Shipping Method Bot*\n\n` +
    `Send me an AliExpress product link to see shipping options\n\n` +
    `Example: https://www.aliexpress.com/item/100500123456.html`
  );
});

// 3. Handle product links
bot.on('text', async (ctx) => {
  const url = ctx.message.text;
  
  // Simple URL validation
  if (!url.includes('aliexpress.com/item/')) {
    return ctx.reply('Please send a valid AliExpress product link');
  }

  try {
    await ctx.sendChatAction('typing');
    
    // Extract product ID (simplified)
    const productId = url.split('/item/')[1]?.split('.html')[0] || '100500123456';
    
    const shippingMethods = await getShippingMethods(productId);
    
    if (shippingMethods.length === 0) {
      return ctx.reply('No shipping methods found for this product');
    }

    let response = `🚛 *Shipping Options*\n\n`;
    shippingMethods.forEach(method => {
      response += `▫️ *${method.name}*\n` +
                 `⌛ Delivery: ${method.days} days\n` +
                 `💰 Cost: ${method.cost}\n\n`;
    });

    ctx.replyWithMarkdown(response);

  } catch (error) {
    console.error('Error:', error);
    ctx.reply('⚠️ Error fetching shipping info. Please try another product.');
  }
});

// 4. Vercel handler
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
