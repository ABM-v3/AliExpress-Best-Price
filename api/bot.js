const { Telegraf } = require('telegraf');
const axios = require('axios');

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHANNEL_ID = process.env.CHANNEL_ID; // Format: '@yourchannelname'

// 1. AliExpress API Access
async function getAliExpressDeals() {
  try {
    // First get API token
    const authRes = await axios.post('https://api.alibaba.com/token', {
      client_id: process.env.ALI_APP_KEY,
      client_secret: process.env.ALI_APP_SECRET,
      grant_type: 'client_credentials'
    });

    // Then fetch deals
    const response = await axios.get('https://api.alibaba.com/products/search', {
      headers: {
        Authorization: `Bearer ${authRes.data.access_token}`
      },
      params: {
        sort: 'orders_desc',
        pageSize: 3,
        minPrice: 1,
        maxPrice: 50,
        locale: 'en'
      }
    });

    return response.data?.data?.map(item => ({
      title: item.title,
      price: item.price.value,
      image: item.imageUrl,
      productUrl: `https://www.aliexpress.com/item/${item.productId}.html`
    })) || [];

  } catch (error) {
    console.error('API Error:', {
      status: error.response?.status,
      message: error.message,
      data: error.response?.data
    });
    return [];
  }
}

// 2. Post to Channel
async function postDeals() {
  try {
    const deals = await getAliExpressDeals();
    
    if (deals.length === 0) {
      console.log('No deals found');
      return;
    }

    for (const deal of deals) {
      try {
        await bot.telegram.sendPhoto(
          CHANNEL_ID,
          { url: deal.image },
          {
            caption: `🔥 ${deal.title}\n💰 Price: $${deal.price}\n🔗 ${deal.productUrl}`,
            parse_mode: 'Markdown'
          }
        );
        await new Promise(resolve => setTimeout(resolve, 2000)); // Delay between posts
      } catch (e) {
        console.error('Failed to post:', e.message);
      }
    }
  } catch (error) {
    console.error('Posting failed:', error);
  }
}

// 3. Manual Trigger
bot.command('postdeals', async (ctx) => {
  await postDeals();
  ctx.reply('Deal posting initiated!');
});

// 4. Vercel Handler
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
postDeals();
