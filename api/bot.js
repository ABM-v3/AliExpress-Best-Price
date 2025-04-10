const { Telegraf } = require('telegraf');
const axios = require('axios');

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHANNEL_ID = '@CouponsAndDeals';

// 1. API Debugger
async function testAPI() {
  try {
    const response = await axios.post('https://api.alibaba.com/token', {
      client_id: process.env.ALI_APP_KEY,
      client_secret: process.env.ALI_APP_SECRET,
      grant_type: 'client_credentials'
    }, { timeout: 5000 });

    console.log('API Success! Token:', response.data.access_token.slice(0, 10) + '...');
    return true;
  } catch (error) {
    console.error('API Failure:', {
      config: {
        url: error.config.url,
        data: error.config.data
      },
      status: error.response?.status,
      data: error.response?.data
    });
    return false;
  }
}

// 2. Deal Poster (with mock data fallback)
async function postDeals() {
  const apiWorking = await testAPI();
  
  let deals;
  if (apiWorking) {
    try {
      const token = await axios...; // Your API call here
      deals = await fetchRealDeals();
    } catch (e) {
      console.error('API Fetch Error:', e);
      deals = getMockDeals();
    }
  } else {
    deals = getMockDeals();
  }

  // Post to channel
  for (const deal of deals) {
    await bot.telegram.sendPhoto(
      CHANNEL_ID,
      { url: deal.image },
      { caption: formatDeal(deal), parse_mode: 'Markdown' }
    );
  }
}

// 3. Command Handlers
bot.command('post', async (ctx) => {
  await postDeals(); 
  ctx.reply('✅ Deals posted to @CouponsAndDeals');
});

// ... (keep existing Vercel handler)
