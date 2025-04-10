const { Telegraf } = require('telegraf');
const axios = require('axios');

const bot = new Telegraf(process.env.BOT_TOKEN);
const TARGET_CHANNEL = '@CouponsAndDeals'; // Your channel
const CACHE = new Map(); // Stores recent posts

// 1. Store recent posts from public channels
bot.on('channel_post', (ctx) => {
  if (ctx.channelPost?.text?.includes('deal') || ctx.channelPost?.caption?.includes('deal')) {
    CACHE.set(ctx.channelPost.message_id, ctx.channelPost);
    // Keep only last 20 posts
    if (CACHE.size > 20) CACHE.delete([...CACHE.keys()][0]);
  }
});

// 2. Manual Trigger Command
bot.command('copylatest', async (ctx) => {
  try {
    if (CACHE.size === 0) {
      return ctx.reply('No recent deals found in cache. I can only monitor public channels.');
    }

    // Get last 5 deals
    const recentPosts = [...CACHE.values()].slice(-5).reverse();
    
    for (const post of recentPosts) {
      try {
        if (post.photo) {
          const photo = post.photo.pop();
          await ctx.telegram.sendPhoto(
            TARGET_CHANNEL,
            { url: await ctx.telegram.getFileLink(photo.file_id) },
            { caption: post.caption || 'Hot Deal!', parse_mode: 'Markdown' }
          );
        } else if (post.text) {
          await ctx.telegram.sendMessage(
            TARGET_CHANNEL,
            post.text,
            { parse_mode: 'Markdown' }
          );
        }
        await new Promise(resolve => setTimeout(resolve, 1500)); // Delay
      } catch (error) {
        console.error('Copy error:', error.message);
      }
    }
    
    ctx.reply(`✅ Copied ${recentPosts.length} deals to ${TARGET_CHANNEL}`);
  } catch (error) {
    ctx.reply('❌ Error: ' + error.message);
  }
});

// 3. Help Command
bot.command('help', (ctx) => {
  ctx.replyWithMarkdown(
    `*How to use:*\n\n` +
    `1. Add me to any *public* channel with deals\n` +
    `2. I'll automatically cache recent posts\n` +
    `3. Use /copylatest to post deals to ${TARGET_CHANNEL}\n\n` +
    `*Note:* I can only see messages in channels where I'm added!`
  );
});

// Vercel handler
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
