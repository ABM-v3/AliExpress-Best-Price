const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

// Initialize bot with error handling
const bot = new Telegraf(process.env.BOT_TOKEN);

// Cache for API token
let aliToken = null;
let tokenExpiry = 0;

// 1. AliExpress API Authentication
async function getAliToken() {
  try {
    // Return cached token if valid
    if (aliToken && Date.now() < tokenExpiry) {
      return aliToken;
    }

    const response = await axios.post('https://api.alibaba.com/token', {
      client_id: process.env.ALI_APP_KEY,
      client_secret: process.env.ALI_APP_SECRET,
      grant_type: 'client_credentials'
    }, {
      timeout: 5000 // 5-second timeout
    });

    aliToken = response.data.access_token;
    tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // 1-minute buffer
    return aliToken;

  } catch (error) {
    console.error('Auth Error:', error.response?.data || error.message);
    throw new Error('API authentication failed');
  }
}

// 2. Product Search with Retries
async function searchProducts(query) {
  try {
    const token = await getAliToken();
    const response = await axios.get('https://api.alibaba.com/products/search', {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        keywords: query,
        sort: 'price_asc',
        pageSize: 3,
        locale: 'en'
      },
      timeout: 8000 // 8-second timeout
    });

    return response.data?.data?.map(product => ({
      id: product.productId,
      title: product.title,
      price: product.price?.value || 'N/A',
      image: product.imageUrl || null,
      rating: product.evaluation?.star || '4.5'
    })) || [];

  } catch (error) {
    console.error('Search Error:', error.response?.data || error.message);
    return [];
  }
}

// 3. Generate Affiliate Link
function createAffLink(productId) {
  return `https://s.click.aliexpress.com/deeplink?id=${process.env.AFFILIATE_ID}&url=/item/${productId}.html`;
}

// 4. Bot Commands
bot.start((ctx) => {
  ctx.replyWithMarkdown(
    `🛒 *AliExpress Price Bot* 🔍\n\n` +
    `Send me a product name like:\n` +
    `• "smart watch"\n` +
    `• "wireless earbuds"\n` +
    `• "LED strip lights"`
  );
});

bot.on('text', async (ctx) => {
  try {
    const query = ctx.message.text.trim();
    
    // Show typing indicator
    await ctx.sendChatAction('typing');
    
    const products = await searchProducts(query);
    
    if (products.length === 0) {
      return ctx.reply('⚠️ No products found. Try different keywords or check back later.');
    }

    // Send each product as separate message
    for (const product of products.slice(0, 3)) { // Limit to 3 results
      const buttons = Markup.inlineKeyboard([
        Markup.button.url('🛒 Buy Now', createAffLink(product.id))
      ]);

      const caption = `🎯 *${product.title}*\n` +
                     `💰 Price: $${product.price}\n` +
                     `⭐ Rating: ${product.rating}/5\n` +
                     `🔗 [View Product](${createAffLink(product.id)})`;

      try {
        if (product.image) {
          await ctx.replyWithPhoto({ url: product.image }, { 
            caption, 
            parse_mode: 'Markdown', 
            ...buttons 
          });
        } else {
          await ctx.replyWithMarkdown(caption, buttons);
        }
      } catch (e) {
        console.error('Send Error:', e);
        await ctx.replyWithMarkdown(caption, buttons);
      }
    }

  } catch (error) {
    console.error('Handler Error:', error);
    ctx.reply('❌ Service temporarily unavailable. Please try again later.');
  }
});

// 5. Vercel Serverless Handler
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
