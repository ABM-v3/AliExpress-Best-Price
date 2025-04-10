const { Telegraf } = require('telegraf');
const axios = require('axios');
const crypto = require('crypto');
const { URLSearchParams } = require('url');

const bot = new Telegraf(process.env.BOT_TOKEN);
const AFFILIATE_TAG = process.env.AFFILIATE_ID || 'your_default_tag';

// 1. Signature Generation (HMAC-SHA256)
function generateSignature(params, secret) {
  const sorted = Object.keys(params).sort();
  const signStr = sorted.map(key => `${key}${params[key]}`).join('');
  return crypto.createHmac('sha256', secret)
    .update(signStr)
    .digest('hex')
    .toUpperCase();
}

// 2. OAuth Token Service
async function getAccessToken() {
  const params = new URLSearchParams();
  params.append('client_id', 512082);
  params.append('client_secret', 8ZR7b0XNh0DDSokcdW50ACF7yUCatSVY);

  
  params.append('grant_type', 'client_credentials');

  const { data } = await axios.post(
    'https://oauth.aliexpress.com/token',
    params,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache'
      },
      timeout: 5000
    }
  );
  
  if (!data.access_token) {
    throw new Error(`Auth failed: ${data.error_description || 'Unknown error'}`);
  }
  return data.access_token;
}

// 3. Core API Request Handler
async function aliApiRequest(method, params = {}) {
  const token = await getAccessToken();
  const timestamp = new Date().toISOString();

  const baseParams = {
    method,
    app_key: process.env.ALI_APP_KEY,
    sign_method: 'hmac-sha256',
    timestamp,
    v: '2.0',
    access_token: token,
    ...params
  };

  baseParams.sign = generateSignature(baseParams, process.env.ALI_APP_SECRET);

  const { data } = await axios.get('https://api.aliexpress.com/rest', {
    params: baseParams,
    timeout: 10000
  });

  if (data.error_code) {
    throw new Error(`API ${data.error_code}: ${data.error_message}`);
  }

  return data.result;
}

// 4. Product Services
async function searchProducts(query) {
  return aliApiRequest('aliexpress.affiliate.product.query', {
    keywords: query,
    fields: 'productId,productTitle,productImage,salePrice,discount,shopUrl,commissionRate',
    sort: 'price_asc',
    page_size: 3,
    platform_product_type: 'ALL'
  });
}

async function getProductDetails(productId) {
  return aliApiRequest('aliexpress.affiliate.product.detail', {
    productId,
    fields: 'productId,productTitle,productImage,salePrice,discount,shopUrl,commissionRate'
  });
}

// 5. URL Parser
function extractProductId(url) {
  const patterns = [
    /aliexpress\.com\/item\/(\d+)/,
    /\/i\/(\d+)/,
    /id=(\d+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// 6. Affiliate Link Generator
function generateAffiliateLink(productId) {
  return `https://s.click.aliexpress.com/deeplink?id=${AFFILIATE_TAG}&url=/item/${productId}.html`;
}

// 7. Bot Message Handlers
bot.start((ctx) => ctx.replyWithMarkdown(
  `🛒 *AliExpress Price Bot*\n\n` +
  `Send me:\n` +
  `• Product *keywords* (e.g. "wireless earbuds")\n` +
  `• Or *product links* (e.g. https://www.aliexpress.com/item/123.html)\n\n` +
  `I'll find you the best deals!`
));

bot.on('text', async (ctx) => {
  try {
    await ctx.sendChatAction('typing');
    const input = ctx.message.text.trim();
    const isUrl = input.includes('aliexpress.com');

    let products = [];
    if (isUrl) {
      const productId = extractProductId(input);
      if (!productId) throw new Error('Invalid AliExpress URL format');
      const details = await getProductDetails(productId);
      products = [details];
    } else {
      const results = await searchProducts(input);
      products = results.products || [];
    }

    if (products.length === 0) {
      return ctx.reply('🔍 No products found. Try different keywords or check your link.');
    }

    for (const product of products) {
      const message = [
        `🎯 *${product.productTitle}*`,
        `💰 Price: $${product.salePrice} (${product.discount}% OFF)`,
        `📊 Commission: ${product.commissionRate}%`,
        `🔗 [Buy Now](${generateAffiliateLink(product.productId)})`
      ].join('\n');

      try {
        if (product.productImage) {
          await ctx.replyWithPhoto(
            { url: product.productImage },
            { caption: message, parse_mode: 'Markdown' }
          );
        } else {
          await ctx.replyWithMarkdown(message);
        }
      } catch (error) {
        console.error('Send error:', error);
        await ctx.replyWithMarkdown(message); // Fallback
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

  } catch (error) {
    console.error('Handler error:', error);
    ctx.reply(`⚠️ Error: ${error.message}`);
  }
});

// 8. Vercel Handler
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
    }
    res.status(200).json({ status: 'OK' });
  } catch (e) {
    console.error('Webhook error:', e);
    res.status(200).json({ status: 'Error handled' });
  }
};
