const puppeteer = require('puppeteer');
const { Telegraf } = require('telegraf');
const bot = new Telegraf(process.env.BOT_TOKEN);
const TARGET_CHANNEL = '@CouponsAndDeals';

async function scrapeChannel(channelUrl) {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true
  });
  
  const page = await browser.newPage();
  await page.goto(channelUrl, { waitUntil: 'networkidle2', timeout: 60000 });

  // Extract posts (CSS selectors may need adjustment)
  const posts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.tgme_widget_message')).map(post => ({
      text: post.querySelector('.tgme_widget_message_text')?.innerText,
      image: post.querySelector('.tgme_widget_message_photo_wrap')?.style.backgroundImage.match(/url\('(.*)'\)/)?.[1],
      time: post.querySelector('.tgme_widget_message_date time')?.getAttribute('datetime')
    }));
  });

  await browser.close();
  return posts.filter(p => p.text || p.image);
}

// Manual trigger command
bot.command('scrape', async (ctx) => {
  try {
    const channelUrl = 'https://t.me/s/SafwadijaExpress'; // Note /s/ format
    const posts = await scrapeChannel(channelUrl);
    
    // Send last 3 posts
    for (const post of posts.slice(0, 3)) {
      if (post.image) {
        await bot.telegram.sendPhoto(
          TARGET_CHANNEL,
          post.image,
          { caption: post.text || 'New Deal!' }
        );
      } else if (post.text) {
        await bot.telegram.sendMessage(TARGET_CHANNEL, post.text);
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    ctx.reply(`✅ Copied ${posts.length} posts from ${channelUrl}`);
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
    console.error('Scrape error:', error);
  }
});

module.exports = bot;
