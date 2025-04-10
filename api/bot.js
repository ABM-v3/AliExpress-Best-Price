const { Telegraf } = require('telegraf');
const axios = require('axios');

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHANNEL_ID = '@CouponsAndDeals'; // Hardcoded to your channel

// 1. Debugging function to verify channel access
async function checkBotRights() {
  try {
    const chat = await bot.telegram.getChat(CHANNEL_ID);
    console.log('Bot has access to channel:', chat.title);
    const members = await bot.telegram.getChatAdministrators(CHANNEL_ID);
    const isAdmin = members.some(m => m.user.id === bot.botInfo.id);
    console.log('Bot is admin:', isAdmin);
    return isAdmin;
  } catch (error) {
    console.error('Channel access error:', error.message);
    return false;
  }
}

// 2. Simplified Deal Fetcher
async function fetchTestDeals() {
  // Using mock data to eliminate API issues
  return [
    {
      title: "Wireless Earbuds Bluetooth 5.0",
      price: 12.99,
      image: "https://ae01.alicdn.com/kf/Ha9d89e9a7b1a4e1e8f5a8f5a8f5a8f5a.jpg",
      url: "https://www.aliexpress.com/item/1000000000000.html"
    },
    {
      title: "Smart Watch Fitness Tracker",
      price: 25.99,
      image: "https://ae01.alicdn.com/kf/Ha9d89e9a7b1a4e1e8f5a8f5a8f5a8f5b.jpg",
      url: "https://www.aliexpress.com/item/1000000000001.html"
    }
  ];
}

// 3. Channel Posting with Error Handling
async function postToChannel(message, imageUrl) {
  try {
    if (imageUrl) {
      await bot.telegram.sendPhoto(
        CHANNEL_ID,
        { url: imageUrl },
        { caption: message, parse_mode: 'Markdown' }
      );
    } else {
      await bot.telegram.sendMessage(CHANNEL_ID, message, { parse_mode: 'Markdown' });
    }
    console.log('Successfully posted to channel');
    return true;
  } catch (error) {
    console.error('Posting failed:', {
      error: error.message,
      response: error.response?.data,
      channel: CHANNEL_ID
    });
    return false;
  }
}

// 4. Main Deal-Posting Function
async function postDeals() {
  console.log('Starting deal posting...');
  
  // Verify bot permissions first
  if (!(await checkBotRights())) {
    console.error('Bot lacks channel permissions');
    return;
  }

  const deals = await fetchTestDeals();
  console.log(`Found ${deals.length} deals`);

  for (const deal of deals) {
    const message = `🔥 *${deal.title}*\n💰 Price: $${deal.price}\n🔗 ${deal.url}`;
    const success = await postToChannel(message, deal.image);
    
    if (success) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Delay between posts
    }
  }
}

// 5. Command Handlers
bot.command('postdeals', async (ctx) => {
  await postDeals();
  ctx.reply('Deals posted to @CouponsAndDeals! Check the channel.');
});

// 6. Vercel Handler
module.exports = async (req, res) => {
  console.log('Received request:', req.method);
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

// Initial test (remove in production)
postDeals();
