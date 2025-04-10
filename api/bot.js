const { Telegraf } = require('telegraf');
const axios = require('axios');
const crypto = require('crypto');

const bot = new Telegraf(process.env.BOT_TOKEN);

// 1. AliExpress API Authentication
async function getAccessToken() {
  const response = await axios.post(
    'https://oauth.aliexpress.com/token',
    new URLSearchParams({
      client_id: process.env.ALI_APP_KEY,
      client_secret: process.env.ALI_APP_SECRET,
      grant_type: 'client_credentials'
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return response.data.access_token;
}

// 2. Extract Product ID from any AliExpress URL
function extractProductId(url) {
  const matches = url.match(/aliexpress\.com\/item\/(\d+)/) || 
                 url.match(/\/i\/(\d+)/) || 
                 url.match(/id=(\d+)/);
  return matches ? matches[1] : null;
}

// 3. Find Best Prices
async function findBestDeal(query) {
  const token = await getAccessToken();
  const isUrl = query.includes('aliexpress.com');

  // For product URLs
  if (isUrl) {
    const productId = extractProductId(query);
    if (!productId) throw new Error('Invalid AliExpress URL');
    
    const response = await axios.get('https://api.aliexpress.com/rest', {
      params: {
        method: 'aliexpress.affiliate.product.detail',
        app_key: process.env.ALI_APP_KEY,
        sign_method: 'hmac-sha256',
        timestamp: new Date().toISOString(),
        v: '2.0',
        access_token: token,
        productId,
        fields: 'productTitle,productImage,salePrice,discount,shopUrl'
      }
    });
    return [response.data.result]; // Return as array for consistency
  }

  // For keyword searches
  const response = await axios.get('https://api.aliexpress.com/rest', {
    params: {
      method: 'aliexpress.affiliate.product.query',
      app_key: process.env.ALI_APP_KEY,
      sign_method: 'hmac-sha256',
      timestamp: new Date().toISOString(),
      v: '2.0',
      access_token: token,
      keywords: query,
      sort: 'price_asc', // Sort by lowest price
      page_size: '3',    // Get top 3 cheapest
      fields: 'productId,productTitle,productImage,salePrice,discount,shopUrl'
    }
  });
  return response.data.result?.products || [];
}

// 4. Generate Affiliate Link
function generateAffiliateLink(productId) {
  return `https://s.click.aliexpress.com/deeplink?id=${process.env.AFFILIATE_ID}&url=/item/${productId}.html`;
}

// 5. Bot Command Handlers
bot.start((ctx) => {
  ctx.replyWithMarkdown(
    `🔍 *AliExpress Price Finder*\n\n` +
    `Send me:\n` +
    `• A product *keyword* (e.g. "wireless earbuds")\n` +
    `• Or an *AliExpress link* (e.g. https://www.aliexpress.com/item/123.html)\n\n` +
    `I'll find you the best deals!`
  );
});

bot.on('text', async (ctx) => {
  try {
    await ctx.sendChatAction('typing');
    const deals = await findBestDeal(ctx.message.text);

    if (deals.length === 0) {
      return ctx.reply('No products found. Try different keywords or check the link.');
    }

    for (const deal of deals) {
      const message = `🎯 *${deal.productTitle}*\n` +
                     `💰 Price: $${deal.salePrice} (${deal.discount}% OFF)\n` +
                     `🔗 [Buy Now](${generateAffiliateLink(deal.productId || deal.productid)})`;

      if (deal.productImage) {
        await ctx.replyWithPhoto(
          { url: deal.productImage },
          { caption: message, parse_mode: 'Markdown' }
        );
      } else {
        await ctx.replyWithMarkdown(message);
      }
    }

  } catch (error) {
    console.error('Error:', error);
    ctx.reply('⚠️ Error: ' + error.message);
  }
});

// Vercel handler
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') await bot.handleUpdate(req.body);
    res.status(200).json({ status: 'OK' });
  } catch (e) {
    console.error('Handler Error:', e);
    res.status(200).json({ status: 'Error handled' });
  }
};
