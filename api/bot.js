const { Telegraf } = require("telegraf");

// Initialize bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// Middleware to verify requests
bot.use(async (ctx, next) => {
  console.log("Received update:", ctx.update);
  await next();
});

// Start command
bot.command("start", (ctx) => {
  ctx.reply("✅ Bot is alive! Send me a product name like 'wireless earbuds'.");
});

// Error handling
bot.catch((err) => {
  console.error("Bot error:", err);
});

// Vercel handler
module.exports = async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      console.log("Invalid body:", req.body);
      return res.status(400).json({ error: "Invalid request format" });
    }

    await bot.handleUpdate(req.body);
    res.status(200).json({ status: "processed" }); // ← Critical change
  } catch (e) {
    console.error("Handler error:", e);
    res.status(200).json({ status: "error_handled" }); // ← Must return 200
  }
};
