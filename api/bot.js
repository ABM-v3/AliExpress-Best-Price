const { Telegraf } = require('telegraf');
const axios = require('axios');
const cron = require('node-cron');

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHANNEL_ID = process.env.CHANNEL_ID; // Your channel username (e.g., '@yourchannel')

// 1. AliExpress API Authentication
async function getAliToken() {
  try {
    const response = await axios.post('https://api.alibaba.com/token', {
      client_id: process.env.ALI_APP_KEY,
      client_secret: process.env.ALI_APP_SECRET,
      grant_type: 'client_credentials'
    });
    return response.data.access_token;
  } catch (error) {
    console.error('Auth Error:', error.response?.data || error.message);
    throw error;
  }
}

// 2. Fetch Daily Deals
async function fetchDailyDeals() {
  try {
    const token = await getAliToken();
    const response = await axios.get('https://api.alibaba.com/products/search', {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        sort: 'orders_desc',
        pageSize: 5,
        minPrice: 1,
        maxPrice: 50,
        locale: 'en',
        currency: 'USD'
      }
    });

    return response.data?.data?.map(product => ({
      id: product.productId,
      title: product.title,
      price: product.price.value,
      originalPrice: product.originalPrice?.value || product.price.value * 1.5,
      image: product.imageUrl,
      orders: product.tradeCount,
      rating: product.evaluation?.star || 4.5
    })) || [];
  } catch (error) {
    console.error('Deals Error:', error.response?.data || error.message);
    return [];
  }
}

// 3. Generate Affiliate Link
function generateAffLink(productId) {
  return `https://s.click.aliexpress.com/deeplink?id=${process.env.AFFILIATE_ID}&url=/item/${productId}.html`;
}

// 4. Format Deal Post
function formatDeal(product) {
  const discount = Math.round((1 - product.price / product.originalPrice) * 100);
  
  return `🔥 *${product.title}*\n\n` +
         `💰 Price: $${product.price} (was $${product.originalPrice}) - ${discount}% OFF\n` +
         `⭐ Rating: ${product.rating}/5 | 🛒 ${product.orders} orders\n` +
         `🔗 [Buy Now](${generateAffLink(product.id)})`;
}

// 5. Post to Channel
async function postDealsToChannel() {
  try {
    const deals = await fetchDailyDeals();
    
    for (const deal of deals) {
      try {
        await bot.telegram.sendPhoto(
          CHANNEL_ID,
          { url: deal.image },
          {
            caption: formatDeal(deal),
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { text: '🛒 Buy Now', url: generateAffLink(deal.id) }
              ]]
            }
          }
        );
        await new Promise(resolve => setTimeout(resolve, 2000)); // Delay between posts
      } catch (e) {
        console.error('Failed to post:', deal.id, e.message);
      }
    }
  } catch (error) {
    console.error('Posting Error:', error);
  }
}

// 6. Schedule Daily Posts (9AM UTC)
cron.schedule('0 9 * * *', postDealsToChannel);

// 7. Manual Trigger Command
bot.command('postdeals', async (ctx) => {
  if (ctx.chat.id.toString() === CHANNEL_ID.replace('@', '')) {
    await postDealsToChannel();
    ctx.reply('Deals posted!');
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
    console.error('Handler Error:', e);
    res.status(200).json({ status: 'Error handled' });
  }
};

// Initial test
postDealsToChannel();
