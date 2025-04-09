const { Telegraf, Markup } = require("telegraf");
const axios = require("axios");

// Load env vars
const BOT_TOKEN = process.env.BOT_TOKEN;
const ALI_APP_KEY = process.env.ALI_APP_KEY;
const ALI_APP_SECRET = process.env.ALI_APP_SECRET;
const AFFILIATE_ID = process.env.AFFILIATE_ID; // Found in Step 1

const bot = new Telegraf(BOT_TOKEN);

// Fetch AliExpress products
async function fetchAliProducts(query) {
  try {
    // Get API token
    const authRes = await axios.post("https://api.alibaba.com/token", {
      client_id: ALI_APP_KEY,
      client_secret: ALI_APP_SECRET,
      grant_type: "client_credentials",
    });
    const token = authRes.data.access_token;

    // Search products
    const searchRes = await axios.get("https://api.alibaba.com/products/search", {
      headers: { Authorization: `Bearer ${token}` },
      params: { keywords: query, sort: "price_asc", pageSize: 3 },
    });
    return searchRes.data.data || [];
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
  ctx.reply(
    "🛍️ *AliExpress Deal Finder Bot* 🔍\n\nSend me a product name (e.g., 'wireless earbuds') to find the best deals!",
    { parse_mode: "Markdown" }
  );
});

bot.on("text", async (ctx) => {
  const query = ctx.message.text;
  const products = await fetchAliProducts(query);

  if (products.length === 0) {
    return ctx.reply("❌ No products found. Try another keyword like 'smart watch' or 'LED strip'!");
  }

  for (const product of products) {
    const message = `🎯 *${product.title}*\n💰 Price: $${product.price}\n⭐ Rating: ${product.rating || "4.5"}/5\n🚚 Shipping: Free + 15-day delivery`;
    const buttons = Markup.inlineKeyboard([
      [Markup.button.url("🛒 Buy Now", generateAffLink(product.productId))],
      [Markup.button.callback("🔍 More Like This", `search_similar:${product.productId}`)],
    ]);

    // Send product image + details
    try {
      await ctx.replyWithPhoto(
        { url: product.imageUrl || "https://via.placeholder.com/300?text=AliExpress+Product" },
        { caption: message, parse_mode: "Markdown", ...buttons }
      );
    } catch (e) {
      // Fallback if image fails
      await ctx.replyWithMarkdown(message, buttons);
    }
  }
});

// Handle callback queries (e.g., "More Like This")
bot.action(/search_similar:(.+)/, async (ctx) => {
  const productId = ctx.match[1];
  await ctx.reply(`🔍 Searching similar products to ${productId}...`);
  // Implement similar product search here
});

// Vercel handler
module.exports = async (req, res) => {
  try {
    await bot.handleUpdate(req.body);
    res.status(200).send("OK");
  } catch (error) {
    console.error("Bot error:", error);
    res.status(400).send("Error");
  }
};
