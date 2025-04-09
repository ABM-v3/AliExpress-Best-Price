const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

// Initialize bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// AliExpress API Auth
async function getAliToken() {
  const response = await axios.post('https://api.alibaba.com/token', {
    client_id: process.env.ALI_APP_KEY,
    client_secret: process.env.ALI_APP_SECRET,
    grant_type: 'client_credentials'
  });
  return response.data.access_token;
}

// Product Search
async function searchAliExpress(query) {
  try {
    const token = await getAliToken();
    const response = await axios.get('https://api.alibaba.com/products/search', {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        keywords: query,
        sort: 'price_asc',
        pageSize: 3
      }
    });
    return response.data.data || [];
  } catch (error) {
    console.error('API Error:', error);
    return [];
  }
}

// Generate affiliate link
function createAffLink(productId) {
  return `https://s.click.aliexpress.com/deeplink?id=${process.env.AFFILIATE_ID}&url=/item/${productId}.html`;
}

// Bot Commands
bot.command('start', (ctx) => {
  ctx.reply(
    '🛒 *AliExpress Price Finder Bot*\n\nSend me a product name (e.g., "smart watch") to find the best deals!',
    { parse_mode: 'Markdown' }
  );
});

bot.on('text', async (ctx) => {
  const query = ctx.message.text;
  const products = await searchAliExpress(query);

  if (products.length === 0) {
    return ctx.reply('❌ No products found. Try another search like "wireless earbuds"');
  }

  for (const product of products) {
    const message = `⌚ *${product.title}*\n💰 Price: $${product.price}\n⭐ Rating: ${product.rating || '4.5'}/5\n🚚 Shipping: Free delivery`;
    const buttons = Markup.inlineKeyboard([
      Markup.button.url('🛒 Buy Now', createAffLink(product.productId))
    ]);

    try {
      await ctx.replyWithPhoto(
        { url: product.imageUrl || 'https://via.placeholder.com/300?text=Product+Image' },
        { caption: message, parse_mode: 'Markdown', ...buttons }
      );
    } catch (e) {
      await ctx.replyWithMarkdown(message, buttons);
    }
  }
});

// Vercel Handler
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      await bot.handleUpdate(req.body);
      return res.status(200).json({ status: 'OK' });
    } catch (e) {
      console.error('Error:', e);
      return res.status(200).json({ status: 'Error handled' });
    }
  }
  res.status(200).json({ status: 'Bot endpoint active' });
};
