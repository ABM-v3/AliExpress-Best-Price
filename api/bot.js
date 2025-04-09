const { Telegraf } = require("telegraf");

// Initialize bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// Simple test command
bot.command("start", (ctx) => {
  ctx.reply("Bot is working! 🎉 Send me a product name.");
});

// Webhook handler for Vercel
module.exports = async (req, res) => {
  try {
    // Parse update manually for Vercel
    const update = req.body;
    if (!update || !update.message) {
      return res.status(400).send("Invalid update format");
    }

    await bot.handleUpdate(update);
    res.status(200).send("OK");
  } catch (e) {
    console.error("Webhook error:", e);
    res.status(200).send("Error handled"); // Always return 200 to prevent Telegram retries
  }
};
