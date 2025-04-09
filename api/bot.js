const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

// Initialize bot
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
async function searchWithRetry(query, retries = 2) {
  while (retries > 0) {
    try {
      const token = await getAliToken();
      const response = await axios.get('https://api.alibaba.com/products/search', {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Accept-Language': 'en-US'
        },
        params: {
          keywords: query,
          sort: 'price_asc',
          pageSize: 3,
          locale: 'en',
          currency: 'USD'
        },
        timeout: 8000 // 8-second timeout
      });

      // Process results
      const products = response.data?.data?.filter(p => 
        p.productId && p.title
      ).map(p => ({
        id: p.productId,
        title: p.title?.trim() || 'No Title',
        price: p.price?.formattedPrice || 'N/A',
        image: p.imageUrl || null,
        rating: p.evaluation?.star || '4.0'
      })) || [];

      if (products.length > 0) return products;
      
    } catch (error) {
      console.error(`Attempt ${3-retries} failed:`, error.message);
    }
    retries--;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return [];
}

// 3. Generate Affiliate Link
function createAffLink(productId) {
  return `https://s.click.aliexpress.com/deeplink?id=${process.env.AFFILIATE_ID}&url=/item/${productId}.html`;
}

// 4. API Test Command
bot.command('testapi', async (ctx) => {
  try {
    const token = await getAliToken();
    await ctx.reply(`✅ API connection working! Token: ${token.slice(0, 15)}...`);
    
    const testProducts = await searchWithRetry("smart watch");
    await ctx.reply(`📦 Found ${testProducts.length} products`);
    
    if (testProducts.length > 0) {
      await ctx.reply(`First result: ${testProducts[0].title}\nPrice: ${testProducts[0].price}`);
    }
  } catch (e) {
    await ctx.reply(`❌ API test failed: ${e.message}`);
    console.error('API Test Error:', e);
  }
});

// 5. Start Command
bot.start((ctx) => {
  ctx.replyWithMarkdown(
    `🛒 *AliExpress Price Bot* 🔍\n\n` +
    `Send me any product name like:\n` +
    `• Smart watch\n` +
    `• Wireless earbuds\n` +
    `• LED strip lights\n\n` +
    `Try /testapi to check connection`
  );
});

// 6. Product Search Handler
bot.on('text', async (ctx) => {
  try {
    await ctx.sendChatAction('typing');
    const query = ctx.message.text.trim();
    
    if (query.startsWith('/')) return; // Ignore commands
    
    const products = await searchWithRetry(query);
    
    if (products.length === 0) {
      return ctx.replyWithMarkdown(
        `🔍 No products found for *"${query}"*\n\n` +
        `Try:\n` +
        `- Different keywords\n` +
        `- English terms\n` +
        `- More common product names\n\n` +
        `Example: "bluetooth headphones"`
      );
    }

    // Send products (max 3)
    for (const product of products.slice(0, 3)) {
      const buttons = Markup.inlineKeyboard([
        Markup.button.url('🛒 Buy Now', createAffLink(product.id))
      ]);

      const caption = `🎯 *${product.title}*\n` +
                     `💰 Price: ${product.price}\n` +
                     `⭐ Rating: ${product.rating}/5`;

      try {
        if (product.image) {
          await ctx.replyWithPhoto(
            { url: product.image },
            { caption, parse_mode: 'Markdown', ...buttons }
          );
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
    ctx.reply('⚠️ Service temporarily unavailable. Please try again later.');
  }
});

// 7. Error Handling
bot.catch((err) => {
  console.error('Bot Error:', err);
});

// 8. Vercel Serverless Handler
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
    }
    res
