import http from "node:http";

const token = process.env.TELEGRAM_BOT_TOKEN;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const port = Number(process.env.PORT || 8789);

if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");
if (!webhookSecret) throw new Error("TELEGRAM_WEBHOOK_SECRET is required");

const server = http.createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/telegram/webhook") {
    response.writeHead(404);
    response.end();
    return;
  }
  if (request.headers["x-telegram-bot-api-secret-token"] !== webhookSecret) {
    response.writeHead(401);
    response.end();
    return;
  }
  let body = "";
  for await (const chunk of request) body += chunk;
  try {
    JSON.parse(body);
  } catch {
    response.writeHead(400);
    response.end();
    return;
  }
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ ok: true }));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Telegram webhook receiver listening on port ${port}`);
});
