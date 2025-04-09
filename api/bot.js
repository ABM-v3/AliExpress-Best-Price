const { Telegraf } = require('telegraf');
const axios = require('axios');

console.log("Bot starting..."); // Debug log

const bot = new Telegraf(process.env.BOT_TOKEN);

// Test command
bot.command('start', (ctx) => {
  console.log("Received /start command"); // Debug log
  ctx.reply('Debug mode: Bot is online ✅');
});

// Error logging
bot.catch((err) => {
  console.error('Bot error:', err);
});

// Vercel handler
module.exports = async (req, res) => {
  console.log("Incoming request:", req.method, req.body); // Debug log
  
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
    }
    res.status(200).json({ status: 'OK' });
  } catch (e) {
    console.error('Handler error:', e);
    res.status(200).json({ status: 'Error handled' });
  }
};
