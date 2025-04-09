const { Telegraf } = require("telegraf");
const axios = require("axios");

// Load environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const ALI_APP_KEY = process.env.ALI_APP_KEY;
const ALI_APP_SECRET = process.env.ALI_APP_SECRET;
const AFFILIATE_ID = process.env.AFFILIATE_ID;

const bot = new Telegraf(BOT_TOKEN);

// Fetch AliExpress products via API
async function fetchAliProducts(query) {
  try {
    const authUrl = "https://api.alibaba.com/token";
    const authResponse = await axios.post(authUrl, {
      client_id: ALI_APP_KEY,
      client_secret: ALI_APP_SECRET,
      grant_type: "client_credentials",
    });

    const accessToken = authResponse.data.access_token;

    const searchUrl = "https://api.alibaba.com/products/search";
    const searchResponse = await axios.get(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { keywords: query, sort: "price_asc", pageSize: 3 },
    });

    return searchResponse.data.data || [];
  } catch (error) {
    console.error("API Error:", error);
    return [];
  }
}

// Generate affiliate link
function generateAffLink(productId) {
  return `https://s.click.aliexpress.com/deeplink?id=${AFFILIATE_ID}&url=/item/${productId}.html`;
}

// Bot commands
bot.start((ctx) => {
  ctx.reply("🔍 Send me a product name (e.g., 'wireless earphones') to find the best AliExpress deals!");
});

bot.on("text", async (ctx) => {
  const query = ctx.message.text;
  const products = await fetchAliProducts(query);

  if (products.length === 0) {
    return ctx.reply("❌ No products found. Try another keyword!");
  }

  for (const product of products) {
    const message = `🎯 *${product.title}*\n💰 Price: $${product.price}\n🔗 [Buy Now](${generateAffLink(product.productId)})`;
    await ctx.replyWithMarkdown(message);
  }
});

// Vercel serverless function handler
module.exports = async (req, res) => {
  try {
    await bot.handleUpdate(req.body);
    res.status(200).send("OK");
  } catch (error) {
    console.error("Bot error:", error);
    res.status(400).send("Error");
  }
};
