const { Telegraf } = require('telegraf');
const axios = require('axios');

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHANNEL_ID = '@CouponsAndDeals';

// 1. Enhanced API Debugger
async function testAliExpressAPI() {
  try {
    console.log('Starting API test...');
    
    // Test authentication
    const authRes = await axios.post('https://api.alibaba.com/token', {
      client_id: process.env.ALI_APP_KEY,
      client_secret: process.env.ALI_APP_SECRET,
      grant_type: 'client_credentials'
    }, { timeout: 5000 });

    console.log('✅ Auth success. Token:', authRes.data.access_token.slice(0, 15) + '...');

    // Test product search
    const searchRes = await axios.get('https://api.alibaba.com/products/search', {
      headers: { Authorization: `Bearer ${authRes.data.access_token}` },
      params: { pageSize: 1, sort: 'orders_desc' },
      timeout: 5000
    });

    console.log('📦 API returned', searchRes.data?.data?.length, 'products');
    return true;

  } catch (error) {
    console.error('🔴 API FAILURE:', {
      config: error.config,
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    return false;
  }
}

// 2. Channel Test Function
async function testChannelPosting() {
  try {
    const testMsg = await bot.telegram.sendMessage(
      CHANNEL_ID,
      '🚀 Test message from bot',
      { parse_mode: 'Markdown' }
    );
    console.log('✅ Channel test success. Message ID:', testMsg.message_id);
    return true;
  } catch (error) {
    console.error('🔴 CHANNEL POST FAILURE:', {
      channel: CHANNEL_ID,
      error: error.message,
      response: error.response?.data
    });
    return false;
  }
}

// 3. Main Command
bot.command('debug', async (ctx) => {
  const apiWorking = await testAliExpressAPI();
  const channelWorking = await testChannelPosting();
  
  ctx.replyWithMarkdown(
    `🔍 *Debug Results*\n\n` +
    `API Connection: ${apiWorking ? '✅ Working' : '❌ Failed'}\n` +
    `Channel Access: ${channelWorking ? '✅ Working' : '❌ Failed'}\n\n` +
    `Check Vercel logs for details`
  );
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
