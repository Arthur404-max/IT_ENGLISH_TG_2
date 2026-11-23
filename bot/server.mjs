import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const token = process.env.TELEGRAM_BOT_TOKEN;
const webAppUrl = process.env.TELEGRAM_WEBAPP_URL;
const port = Number(process.env.PORT || 8788);
const purchasesFile = path.join(__dirname, "data", "purchases.json");

if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");
if (!webAppUrl || !/^https:\/\//i.test(webAppUrl)) {
  throw new Error("TELEGRAM_WEBAPP_URL must be HTTPS");
}

fs.mkdirSync(path.dirname(purchasesFile), { recursive: true });
if (!fs.existsSync(purchasesFile)) fs.writeSync(fs.openSync(purchasesFile, "w"), "{}");

function loadPurchases() {
  try {
    return JSON.parse(fs.readFileSync(purchasesFile, "utf8"));
  } catch {
    return {};
  }
}

function savePurchases(purchases) {
  fs.writeFileSync(purchasesFile, JSON.stringify(purchases, null, 2));
}

async function telegram(method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok || !body.ok) {
    throw new Error(body.description || `Telegram API error ${response.status}`);
  }
  return body.result;
}

function validateInitData(initData) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  params.delete("hash");
  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const calculated = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (!hash || !crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(hash))) {
    return null;
  }
  try {
    const user = JSON.parse(params.get("user") || "null");
    return user && user.id ? user : null;
  } catch {
    return null;
  }
}

function corsHeaders(origin) {
  const allowed = new Set([
    webAppUrl.replace(/\/$/, ""),
    "https://web.telegram.org",
  ]);
  return {
    "access-control-allow-origin": allowed.has(origin) ? origin : "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : {};
}

async function sendPaymentInvoice(chatId, userId) {
  await telegram("sendInvoice", {
    chat_id: chatId,
    title: "Доступ к IT English",
    description: "Открывает все материалы Mini App на этом Telegram-аккаунте",
    payload: `it-english-access:${userId}`,
    provider_token: "",
    currency: "XTR",
    prices: [{ label: "Доступ", amount: 1 }],
  });
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin || "";
  const headers = { ...corsHeaders(origin), "content-type": "application/json" };
  if (request.method === "OPTIONS") {
    response.writeHead(204, headers);
    response.end();
    return;
  }

  try {
    if (request.method === "POST" && request.url === "/api/access/status") {
      const body = await readJson(request);
      const user = validateInitData(body.initData);
      if (!user) {
        response.writeHead(401, headers);
        response.end(JSON.stringify({ error: "invalid initData" }));
        return;
      }
      const purchases = loadPurchases();
      response.writeHead(200, headers);
      response.end(JSON.stringify({ paid: Boolean(purchases[String(user.id)]) }));
      return;
    }

    if (request.method === "POST" && request.url === "/api/access/invoice") {
      const body = await readJson(request);
      const user = validateInitData(body.initData);
      if (!user) {
        response.writeHead(401, headers);
        response.end(JSON.stringify({ error: "invalid initData" }));
        return;
      }
      const invoiceLink = await telegram("createInvoiceLink", {
        title: "Доступ к IT English",
        description: "Открывает все материалы Mini App на этом Telegram-аккаунте",
        payload: `it-english-access:${user.id}`,
        provider_token: "",
        currency: "XTR",
        prices: [{ label: "Доступ", amount: 1 }],
      });
      response.writeHead(200, headers);
      response.end(JSON.stringify({ invoiceLink }));
      return;
    }

    response.writeHead(404, headers);
    response.end(JSON.stringify({ error: "not found" }));
  } catch (error) {
    console.error(error);
    response.writeHead(500, headers);
    response.end(JSON.stringify({ error: "internal server error" }));
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Telegram Stars payment server listening on port ${port}`);
});

let updateOffset = 0;
async function pollUpdates() {
  try {
    const updates = await telegram("getUpdates", {
      offset: updateOffset,
      timeout: 25,
      allowed_updates: ["message", "callback_query", "pre_checkout_query"],
    });
    for (const update of updates) {
      updateOffset = Math.max(updateOffset, update.update_id + 1);

      if (update.pre_checkout_query) {
        await telegram("answerPreCheckoutQuery", {
          pre_checkout_query_id: update.pre_checkout_query.id,
          ok: true,
        });
      }

      if (update.message?.successful_payment) {
        const payment = update.message.successful_payment;
        const userId = update.message.from.id;
        if (payment.currency === "XTR" && payment.total_amount === 1) {
          const purchases = loadPurchases();
          purchases[String(userId)] = {
            paid_at: new Date().toISOString(),
            telegram_payment_charge_id: payment.telegram_payment_charge_id,
            provider_payment_charge_id: payment.provider_payment_charge_id || "",
          };
          savePurchases(purchases);
        }
      }

      const message = update.message;
      if (message?.text === "/start" || message?.text === "/open") {
        await telegram("sendMessage", {
          chat_id: message.chat.id,
          text: "IT English — тренажёр английского для IT.",
          reply_markup: {
            inline_keyboard: [
              [{ text: "Открыть мини-приложение", web_app: { url: webAppUrl } }],
              [{ text: "Купить доступ за ⭐ 1", callback_data: "buy_access" }],
            ],
          },
        });
      }

      if (message?.text === "/buy") {
        await sendPaymentInvoice(message.chat.id, message.from.id);
      }

      if (update.callback_query?.data === "buy_access") {
        await sendPaymentInvoice(
          update.callback_query.message.chat.id,
          update.callback_query.from.id,
        );
        await telegram("answerCallbackQuery", {
          callback_query_id: update.callback_query.id,
        });
      }
    }
  } catch (error) {
    console.error("Polling error:", error.message);
  }
  setTimeout(pollUpdates, 1000);
}

pollUpdates();
