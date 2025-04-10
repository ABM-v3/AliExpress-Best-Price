const { Telegraf } = require('telegraf');
const axios = require('axios');
const Parser = require('rss-parser');

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHANNEL_ID = '@CouponsAndDeals';
const parser = new Parser();

// 1. Fetch Deals from AliExpress Affiliate RSS Feed
async function getDealsFromRSS() {
  try {
    const feed = await parser.parseURL('https://portals.aliexpress.com/affiliate/rss.htm');
    return feed.items.slice(0, 5).map(item => ({
      title: item.title,
      link: item.link,
      image: item.enclosure?.url || 'https://via.placeholder.com/300'
    }));
  } catch (error) {
    console.error('RSS Error:', error);
    return [];
  }
}

// 2. Post to Channel
async function postDeals() {
  const deals = await getDealsFromRSS();
  
  if (deals.length === 0) {
    deals.push({ // Fallback test deal
      title: "Wireless Earbuds (Test Data)",
      link: "https://www.aliexpress.com/item/1000000000000.html",
      image: "https://ae01.alicdn.com/kf/Ha9d89e9a7b1a4e1e8f5a8f5a8f5a8f5a.jpg"
    });
  }

  for (const deal of deals) {
    try {
      await bot.telegram.sendPhoto(
        CHANNEL_ID,
        { url: deal.image },
        {
          caption: `🔥 ${deal.title}\n🔗 ${deal.link}`,
          parse_mode: 'Markdown'
        }
      );
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error('Post Error:', error.message);
    }
  }
}

// 3. Command
bot.command('deals', async (ctx) => {
  await postDeals();
  ctx.reply('✅ Deals posted to @CouponsAndDeals');
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
