const { Telegraf } = require('telegraf');
const bot = new Telegraf(process.env.BOT_TOKEN);
const TARGET_CHANNEL = '@CouponsAndDeals'; // Your channel

// Store seen posts (in-memory, replace with DB for production)
const postCache = new Set();

// Monitor all channels where bot is added
bot.on(['channel_post', 'edited_channel_post'], async (ctx) => {
  try {
    const post = ctx.update.channel_post || ctx.update.edited_channel_post;
    
    // Skip if already processed or not from monitored channel
    if (postCache.has(post.message_id)) return;
    postCache.add(post.message_id);

    // Forward to your channel
    await ctx.telegram.copyMessage(
      TARGET_CHANNEL,
      post.chat.id,
      post.message_id,
      { parse_mode: 'Markdown' }
    );
    
    console.log(`Copied post from ${post.chat.title}`);

  } catch (error) {
    console.error('Copy error:', error.message);
  }
});

// Manual trigger command
bot.command('forcecopy', async (ctx) => {
  await ctx.reply(`Monitoring ${postCache.size} posts. I'll auto-copy new deals to ${TARGET_CHANNEL}`);
});

// Vercel handler
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') await bot.handleUpdate(req.body);
    res.status(200).json({ status: 'OK' });
  } catch (e) {
    console.error('Handler Error:', e);
    res.status(200).json({ status: 'Error handled' });
  }
};
