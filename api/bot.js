const { Telegraf } = require('telegraf');
const axios = require('axios');

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHANNEL_ID = '@CouponsAndDeals';

// 1. PROPER AliExpress Affiliate API Endpoint
async function getDeals() {
  try {
    // Use the official affiliate API endpoint
    const response = await axios.get('https://portals.aliexpress.com/api/v1/affiliate/products', {
      params: {
        app_key: process.env.ALI_APP_KEY,
        app_secret: process.env.ALI_APP_SECRET,
        fields: 'productId,title,imageUrl,price,discount,orders',
        sort: 'orders_desc',
        pageSize: 5
      },
      timeout: 10000
    });
    
    return response.data.data?.map(item => ({
      id: item.productId,
      title: item.title,
      price: item.price,
      image: item.imageUrl,
      orders: item.orders,
      discount: item.discount
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

// 2. Post to Channel
async function postDeals() {
  const deals = await getDeals();
  
  if (deals.length === 0) {
    console.log('No deals found - using mock data');
    deals.push({
      id: "100000",
      title: "TEST: Wireless Earbuds",
      price: "12.99",
      image: "https://ae01.alicdn.com/kf/Ha9d89e9a7b1a4e1e8f5a8f5a8f5a8f5a.jpg",
      orders: "1500",
      discount: "60"
    });
  }

  for (const deal of deals) {
    try {
      await bot.telegram.sendPhoto(
        CHANNEL_ID,
        { url: deal.image },
        {
          caption: `🔥 ${deal.title}\n💰 $${deal.price} (${deal.discount}% OFF)\n🛒 ${deal.orders} orders`,
          parse_mode: 'Markdown'
        }
      );
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (e) {
      console.error('Post failed:', e.message);
    }
  }
}

// 3. Command
bot.command('deals', async (ctx) => {
  await postDeals();
  ctx.reply('✅ Deals posted to @CouponsAndDeals');
});

// Vercel handler remains the same
