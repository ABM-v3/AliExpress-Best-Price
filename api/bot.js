const { Telegraf } = require('telegraf');

// Initialize bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// Test command
bot.command('start', (ctx) => {
  ctx.reply('🛒 Welcome to AliExpress Price Bot!\n\nSend me a product name like "wireless earbuds"');
});

// Handle all text messages
bot.on('text', (ctx) => {
  ctx.reply(`🔍 Searching for "${ctx.message.text}"...\n\n(Bot is working! AliExpress API integration will go here)`);
});

// Vercel serverless function handler
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      await bot.handleUpdate(req.body);
      return res.status(200).json({ status: 'OK' });
    } catch (e) {
      console.error('Error:', e);
      return res.status(200).json({ status: 'Error handled' });
    }
  }
  
  // GET request handling (for testing)
  return res.status(200).json({
    status: 'Bot endpoint is live',
    webhook_info: `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getWebhookInfo`
  });
};
