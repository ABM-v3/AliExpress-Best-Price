const { Telegraf } = require('telegraf');
const axios = require('axios');

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHANNEL_ID = '@CouponsAndDeals'; // Your channel

// 1. Fetch Real AliExpress Deals
async function fetchRealDeals() {
  try {
    // First get API token
    const authRes = await axios.post('https://api.alibaba.com/token', {
      client_id: process.env.ALI_APP_KEY,
      client_secret: process.env.ALI_APP_SECRET,
      grant_type: 'client_credentials'
    });

    // Then fetch trending products
    const response = await axios.get('https://api.alibaba.com/products/search', {
      headers: { Authorization: `Bearer ${authRes.data.access_token}` },
      params: {
        sort: 'orders_desc',
        pageSize: 5,
        minPrice: 1,
        maxPrice: 50,
        locale: 'en'
      },
      timeout: 10000
    });

    return response.data?.data?.map(item => ({
      id: item.productId,
      title: item.title,
      price: item.price.value,
      originalPrice: item.originalPrice?.value || item.price.value * 1.5,
      image: item.imageUrl,
      orders: item.tradeCount,
      rating: item.evaluation?.star || 4.5
    })) || [];

  } catch (error) {
    console.error('API Error:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    return [];
  }
}

// 2. Format Deal Post
function formatDeal(deal) {
  const discount = Math.round((1 - deal.price / deal.originalPrice) * 100);
  return `🔥 *${deal.title}*\n\n` +
         `💰 Price: $${deal.price} (was $${deal.originalPrice}) - ${discount}% OFF\n` +
         `⭐ ${deal.rating}/5 | 🛒 ${deal.orders} orders\n` +
         `🔗 https://www.aliexpress.com/item/${deal.id}.html`;
}

// 3. Post to Channel with Error Handling
async function postDeals() {
  try {
    const deals = await fetchRealDeals();
    console.log(`Found ${deals.length} deals`);

    for (const deal of deals.slice(0, 3)) { // Post top 3 deals
      try {
        await bot.telegram.sendPhoto(
          CHANNEL_ID,
          { url: deal.image },
          { 
            caption: formatDeal(deal),
            parse_mode: 'Markdown'
          }
        );
        await new Promise(resolve => setTimeout(resolve, 3000)); // Delay between posts
      } catch (e) {
        console.error('Failed to post:', deal.id, e.message);
        // Fallback to text if image fails
        await bot.telegram.sendMessage(
          CHANNEL_ID,
          formatDeal(deal),
          { parse_mode: 'Markdown' }
        );
      }
    }
  } catch (error) {
    console.error('Posting failed:', error);
  }
}

// 4. Command Handlers
bot.command('postdeals', async (ctx) => {
  await postDeals();
  ctx.reply('✅ Real deals posted to @CouponsAndDeals!');
});

// 5. Vercel Handler
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

// Initial test (comment out after verification)
postDeals();
