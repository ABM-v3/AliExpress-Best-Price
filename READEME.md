# Telegram AliExpress Affiliate Bot

A Telegram bot that generates affiliate links for AliExpress products. Users send any AliExpress product URL, and the bot responds with the product details and your affiliate link.

## Features

- Process AliExpress product URLs
- Extract product information using AliExpress API
- Generate affiliate links with your tracking ID
- Return product details and affiliate link to the user
- Deploy easily on Vercel with serverless functions

## Setup

### Prerequisites

- Node.js (v18 or higher)
- Telegram Bot Token (from [BotFather](https://t.me/botfather))
- AliExpress Affiliate API credentials (App Key and App Secret)
- AliExpress Tracking ID

### Local Development

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/telegram-aliexpress-affiliate-bot.git
   cd telegram-aliexpress-affiliate-bot
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file by copying the example:
   ```
   cp .env.example .env
   ```

4. Fill in your environment variables in the `.env` file:
   ```
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
   ALIEXPRESS_APP_KEY=your_aliexpress_app_key_here
   ALIEXPRESS_APP_SECRET=your_aliexpress_app_secret_here
   ALIEXPRESS_TRACKING_ID=your_aliexpress_tracking_id_here
   NODE_ENV=development
   ```

5. Start the development server:
   ```
   npm run dev
   ```

### Deployment to Vercel

1. Push your code to GitHub.

2. Create a new project on [Vercel](https://vercel.com) and link it to your GitHub repository.

3. Add the following environment variables in the Vercel project settings:
   - `TELEGRAM_BOT_TOKEN`
   - `ALIEXPRESS_APP_KEY`
   - `ALIEXPRESS_APP_SECRET`
   - `ALIEXPRESS_TRACKING_ID`
   - `NODE_ENV=production`

4. Deploy the project.

5. Set up the Telegram webhook:
   - Get your Vercel deployment URL (e.g., `https://your-project.vercel.app`)
   - Set the webhook by visiting:
     ```
     https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook?url=https://your-project.vercel.app/webhook/<YOUR_TELEGRAM_BOT_TOKEN>
     ```

## Usage

1. Start a chat with your bot on Telegram.
2. Send an AliExpress product URL (any format works).
3. The bot will respond with the product details and your affiliate link.

## How It Works

1. User sends a product URL to the bot
2. The bot extracts the product ID from the URL
3. The bot queries the AliExpress API for product details
4. The bot generates an affiliate link using your tracking ID
5. The bot formats and sends the response to the user

## API Endpoints Used

- `aliexpress.affiliate.product.query` - Get product details
- `aliexpress.affiliate.link.generate` - Generate affiliate links

## License

MIT
