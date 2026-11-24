# Production deployment

## Required services

1. A 24/7 Linux host or managed Node.js service.
2. HTTPS domain or reverse proxy.
3. Telegram bot token in a secret variable.
4. Webhook secret in a secret variable.
5. Persistent disk for `bot/data` and `bot/backups`.

## Telegram webhook

```powershell
$env:TELEGRAM_BOT_TOKEN = "new-bot-token"
$env:TELEGRAM_WEBHOOK_SECRET = "random-long-secret"
$env:TELEGRAM_WEBAPP_URL = "https://arthur404-max.github.io/IT_ENGLISH_TG_2/"
$env:TELEGRAM_ADMIN_IDS = "123456789"
$env:PORT = "8788"
npm run bot
```

Set the Telegram webhook only after HTTPS and the webhook route are verified.

## Backups

Run `npm run backup` on schedule (at least once per hour). Keep the latest 30 snapshots locally and copy snapshots to external storage.

Before switching storage hosts:

1. Stop the bot.
2. Create a backup.
3. Copy `bot/data/purchases.json`, `bot/data/profiles.json` and the backup folder.
4. Restore and run `npm run test:profile`.
5. Start the bot.
6. Verify webhook secret, Stars invoice, and one read-only access status call.
