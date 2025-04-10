const { Telegraf } = require('telegraf');
const axios = require('axios');
const crypto = require('crypto');

const bot = new Telegraf(process.env.BOT_TOKEN);

// 1. Enhanced Error Handling for API Calls
async function safeApiCall(fn) {
  try {
    return await fn();
  } catch (error) {
    console.error('API Error:', {
      url: error.config?.url,
      params: error.config?.params,
      status: error.response?.status,
      data: error.response?.data
    });
    throw new Error('AliExpress API is currently unavailable. Please try again later.');
  }
}

// 2. Unified Product Response Handler
function formatProduct(product) {
  // Handle both product.query and product.detail responses
  const base = product.product || product;
  return {
    id: base.productId || base.productid,
    title: base.productTitle || base.title,
    price: base.salePrice || base.price,
    image: base.productImage || base.image,
    discount: base.discount || 0,
    url: base.shopUrl || base.url
  };
}

// 3. Robust Product Search
async function findProducts(query) {
  return safeApiCall(async () => {
    const token = await getAccessToken();
    const isUrl = query.includes('aliexpress.com');
    const timestamp = new Date().toISOString();

    const params = {
      method: isUrl ? 'aliexpress.affiliate.product.detail' : 'aliexpress.affiliate.product.query',
      app_key: process.env.ALI_APP_KEY,
      sign_method: 'hmac-sha256',
      timestamp,
      v: '2.0',
      access_token: token,
      fields: 'productId,productTitle,productImage,salePrice,discount,shopUrl'
    };

    if (isUrl) {
      const productId = extractProductId(query);
      if (!productId) throw new Error('Invalid AliExpress URL');
      params.productId = productId;
    } else {
      params.keywords = query;
      params.sort = 'price_asc';
      params.page_size = '3';
    }

    params.sign = generateSignature(params, process.env.ALI_APP_SECRET);

    const response = await axios.get('https://api.aliexpress.com/rest', { params });
    
    // Handle both single product and list responses
    if (isUrl) {
      return [formatProduct(response.data.result)];
    }
    return response.data.result?.products?.map(formatProduct) || [];
  });
}

// ... (keep previous helper functions: getAccessToken, extractProductId, generateAffiliateLink)

// 4. Enhanced Bot Response
bot.on('text', async (ctx) => {
  try {
    await ctx.sendChatAction('typing');
    const products = await findProducts(ctx.message.text);

    if (products.length === 0) {
      return ctx.reply('🔍 No products found. Try:\n• Different keywords\n• Direct AliExpress product links');
    }

    for (const product of products) {
      const message = `🎯 *${product.title}*\n` +
                     `💰 $${product.price} (${product.discount}% OFF)\n` +
                     `🔗 [Buy Now](${generateAffiliateLink(product.id)})`;

      try {
        if (product.image) {
          await ctx.replyWithPhoto(
            { url: product.image },
            { caption: message, parse_mode: 'Markdown' }
          );
        } else {
          await ctx.replyWithMarkdown(message);
        }
      } catch (e) {
        console.error('Send Error:', e.message);
        await ctx.replyWithMarkdown(message); // Fallback to text
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

  } catch (error) {
    console.error('Handler Error:', error);
    ctx.reply(`⚠️ ${error.message}`);
  }
});

// ... (keep Vercel handler)
