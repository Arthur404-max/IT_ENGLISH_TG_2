import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProfileStore } from "./profile-store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const token = process.env.TELEGRAM_BOT_TOKEN;
const webAppUrl = process.env.TELEGRAM_WEBAPP_URL;
const port = Number(process.env.PORT || 8788);
const purchasesFile = path.join(__dirname, "data", "purchases.json");
const profileStore = new ProfileStore(path.join(__dirname, "data", "profiles.json"));
const gameSessions = new Map();
const unitsFile = path.join(__dirname, "..", "data", "units.json");

let vocabQuestions = [];
try {
  const unitsDocument = JSON.parse(fs.readFileSync(unitsFile, "utf8"));
  vocabQuestions = (unitsDocument.units || []).flatMap((unit) =>
    (unit.vocab || []).map((item) => ({
      en: String(item.en || "").trim(),
      ru: String(item.ru || "").split(",")[0].trim(),
      unitId: Number(unit.id),
    })),
  ).filter((item) => item.en && item.ru);
} catch (error) {
  console.error("Unable to load vocabulary:", error.message);
}

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

function hasAccess(purchases, userId) {
  const record = purchases[String(userId)];
  if (!record) return false;
  const paid = Boolean(record.paid_at || record.telegram_payment_charge_id);
  const free = Number(record.free_until || 0) > Date.now();
  return paid || free;
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

function shuffled(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildGameOptions(answer) {
  const distractors = shuffled(vocabQuestions.map((item) => item.ru))
    .filter((value) => value !== answer)
    .slice(0, 3);
  return shuffled([answer, ...distractors]);
}

function personalizedQuestions(progressSnapshot) {
  const words = progressSnapshot && typeof progressSnapshot.words === "object"
    ? progressSnapshot.words
    : {};
  const ranked = [];

  for (const [wordKey, record] of Object.entries(words).slice(0, 500)) {
    const match = /^(\d+)\|(.+)$/u.exec(wordKey);
    if (!match) continue;
    const unitId = Number(match[1]);
    const en = match[2].trim();
    const vocabulary = vocabQuestions.find((item) =>
      item.unitId === unitId && item.en.toLowerCase() === en.toLowerCase());
    if (!vocabulary) continue;

    const lapses = Math.max(0, Number(record?.lapses || 0));
    const leech = Boolean(record?.leech);
    const wrong = Math.max(0, Number(record?.wrong || 0));
    const correct = Math.max(0, Number(record?.correct || 0));
    const dueAt = Number(record?.due_at || 0);
    const overdue = dueAt > 0 && dueAt < Math.floor(Date.now() / 1000);
    const accuracy = (wrong + correct) > 0 ? wrong / (wrong + correct) : 0;
    const score = lapses * 100 + (leech ? 80 : 0) + (overdue ? 40 : 0) +
      wrong * 8 + accuracy * 30;
    ranked.push({ item: vocabulary, score });
  }

  if (ranked.length) {
    return shuffled(ranked
      .sort((a, b) => b.score - a.score)
      .slice(0, 60)
      .map((entry) => entry.item))
      .slice(0, 10);
  }

  return shuffled(vocabQuestions).slice(0, 10);
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
    if (request.method === "POST" && request.url === "/api/profile/progress/sync") {
      const body = await readJson(request);
      const user = validateInitData(body.initData);
      if (!user) {
        response.writeHead(401, headers);
        response.end(JSON.stringify({ error: "invalid initData" }));
        return;
      }
      if (!body.progress || typeof body.progress !== "object") {
        response.writeHead(400, headers);
        response.end(JSON.stringify({ error: "progress required" }));
        return;
      }
      const progress = profileStore.syncProgress(user.id, body.progress);
      response.writeHead(200, headers);
      response.end(JSON.stringify({ ok: true, updated_at: progress.updated_at }));
      return;
    }

    if (request.method === "POST" && request.url === "/api/profile/progress") {
      const body = await readJson(request);
      const user = validateInitData(body.initData);
      if (!user) {
        response.writeHead(401, headers);
        response.end(JSON.stringify({ error: "invalid initData" }));
        return;
      }
      response.writeHead(200, headers);
      response.end(JSON.stringify({ progress: profileStore.getProgress(user.id) }));
      return;
    }

    if (request.method === "POST" && request.url === "/api/account/notifications") {
      const body = await readJson(request);
      const user = validateInitData(body.initData);
      if (!user) {
        response.writeHead(401, headers);
        response.end(JSON.stringify({ error: "invalid initData" }));
        return;
      }
      const notifications = profileStore.setNotifications(user.id, body.enabled);
      response.writeHead(200, headers);
      response.end(JSON.stringify({ notifications }));
      return;
    }

    if (request.method === "POST" && request.url === "/api/account/subscription") {
      const body = await readJson(request);
      const user = validateInitData(body.initData);
      if (!user) {
        response.writeHead(401, headers);
        response.end(JSON.stringify({ error: "invalid initData" }));
        return;
      }
      const profile = profileStore.getProfile(user.id);
      response.writeHead(200, headers);
      response.end(JSON.stringify({ subscription: profile.subscription }));
      return;
    }

    if (request.method === "POST" && request.url === "/api/admin/purchases") {
      const body = await readJson(request);
      const user = validateInitData(body.initData);
      if (!user) {
        response.writeHead(401, headers);
        response.end(JSON.stringify({ error: "invalid initData" }));
        return;
      }
      const admins = String(process.env.TELEGRAM_ADMIN_IDS || "")
        .split(",").map((value) => value.trim()).filter(Boolean);
      if (!admins.includes(String(user.id))) {
        response.writeHead(403, headers);
        response.end(JSON.stringify({ error: "admin access required" }));
        return;
      }
      response.writeHead(200, headers);
      response.end(JSON.stringify({ purchases: loadPurchases() }));
      return;
    }

    if (request.method === "POST" && request.url === "/api/streak/status") {
      const body = await readJson(request);
      const user = validateInitData(body.initData);
      if (!user) {
        response.writeHead(401, headers);
        response.end(JSON.stringify({ error: "invalid initData" }));
        return;
      }
      response.writeHead(200, headers);
      response.end(JSON.stringify({ streak: profileStore.getStreak(user.id) }));
      return;
    }

    if (request.method === "POST" && request.url === "/api/streak/complete") {
      const body = await readJson(request);
      const user = validateInitData(body.initData);
      if (!user) {
        response.writeHead(401, headers);
        response.end(JSON.stringify({ error: "invalid initData" }));
        return;
      }
      const streak = profileStore.recordLearningDay(user.id);
      response.writeHead(200, headers);
      response.end(JSON.stringify({ streak }));
      return;
    }

    if (request.method === "POST" && request.url === "/api/blitz/start") {
      const body = await readJson(request);
      const user = validateInitData(body.initData);
      if (!user) {
        response.writeHead(401, headers);
        response.end(JSON.stringify({ error: "invalid initData" }));
        return;
      }
      const session = profileStore.startBlitz(user.id);
      response.writeHead(200, headers);
      response.end(JSON.stringify(session));
      return;
    }

    if (request.method === "POST" && request.url === "/api/blitz/submit") {
      const body = await readJson(request);
      const user = validateInitData(body.initData);
      if (!user) {
        response.writeHead(401, headers);
        response.end(JSON.stringify({ error: "invalid initData" }));
        return;
      }
      const result = profileStore.submitBlitz(
        user.id,
        String(body.session_id || ""),
        Number(body.correct || 0),
        Number(body.total || 0),
      );
      if (!result.ok) {
        response.writeHead(400, headers);
        response.end(JSON.stringify({ error: result.reason }));
        return;
      }
      response.writeHead(200, headers);
      response.end(JSON.stringify(result));
      return;
    }

    if (request.method === "POST" && request.url === "/api/leaderboard") {
      const body = await readJson(request);
      const user = validateInitData(body.initData);
      if (!user) {
        response.writeHead(401, headers);
        response.end(JSON.stringify({ error: "invalid initData" }));
        return;
      }
      response.writeHead(200, headers);
      response.end(JSON.stringify({
        entries: profileStore.getLeaderboard(Number(body.limit || 10)),
      }));
      return;
    }

    if (request.method === "POST" && request.url === "/api/access/status") {
      const body = await readJson(request);
      const user = validateInitData(body.initData);
      if (!user) {
        response.writeHead(401, headers);
        response.end(JSON.stringify({ error: "invalid initData" }));
        return;
      }
      const purchases = loadPurchases();
      const record = purchases[String(user.id)];
      const paid = Boolean(record?.paid_at || record?.telegram_payment_charge_id);
      const freeUntil = Number(record?.free_until || 0);
      response.writeHead(200, headers);
      response.end(JSON.stringify({
        paid,
        free: freeUntil > Date.now(),
        freeUntil: freeUntil > Date.now() ? freeUntil : null,
      }));
      return;
    }

    if (request.method === "POST" && request.url === "/api/access/game/start") {
      const body = await readJson(request);
      const user = validateInitData(body.initData);
      if (!user) {
        response.writeHead(401, headers);
        response.end(JSON.stringify({ error: "invalid initData" }));
        return;
      }
      const purchases = loadPurchases();
      const record = purchases[String(user.id)];
      if (record?.free_until > Date.now()) {
        response.writeHead(200, headers);
        response.end(JSON.stringify({ alreadyUnlocked: true }));
        return;
      }
      const startLimit = profileStore.checkGameStart(user.id);
      if (!startLimit.allowed) {
        response.writeHead(429, headers);
        response.end(JSON.stringify({ error: "free game daily limit" }));
        return;
      }
      const nonce = crypto.randomBytes(16).toString("hex");
      const selectedQuestions = personalizedQuestions(body.progress);
      const questions = selectedQuestions.map((item) => ({
        en: item.en,
        options: buildGameOptions(item.ru),
      }));
      gameSessions.set(nonce, {
        userId: String(user.id),
        expiresAt: Date.now() + 5 * 60_000,
        answers: questions.map((item) => {
          const source = selectedQuestions.find((entry) => entry.en === item.en);
          return source.ru;
        }),
        items: selectedQuestions.map((item) => ({
          unitId: item.unitId,
          en: item.en,
        })),
      });
      response.writeHead(200, headers);
      response.end(JSON.stringify({ nonce, questions }));
      return;
    }

    if (request.method === "POST" && request.url === "/api/access/game/submit") {
      const body = await readJson(request);
      const user = validateInitData(body.initData);
      if (!user) {
        response.writeHead(401, headers);
        response.end(JSON.stringify({ error: "invalid initData" }));
        return;
      }
      const session = gameSessions.get(String(body.nonce || ""));
      if (!session ||
          session.userId !== String(user.id) ||
          session.expiresAt < Date.now()) {
        gameSessions.delete(String(body.nonce || ""));
        response.writeHead(400, headers);
        response.end(JSON.stringify({ error: "game session expired" }));
        return;
      }
      gameSessions.delete(String(body.nonce || ""));
      const submitted = Array.isArray(body.answers) ? body.answers : [];
      const submissionLimit = profileStore.checkGameSubmission(user.id);
      if (!submissionLimit.allowed) {
        response.writeHead(429, headers);
        response.end(JSON.stringify({ error: "free game hourly limit" }));
        return;
      }
      const correct = session.answers.reduce(
        (count, answer, index) => count + (submitted[index] === answer ? 1 : 0),
        0,
      );
      const passed = correct >= 8;
      if (passed) {
        const purchases = loadPurchases();
        const record = purchases[String(user.id)] || {};
        record.free_until = Date.now() + 24 * 60 * 60 * 1000;
        record.free_granted_at = new Date().toISOString();
        record.free_score = correct;
        purchases[String(user.id)] = record;
        savePurchases(purchases);
      }
      response.writeHead(200, headers);
      response.end(JSON.stringify({
        passed,
        correct,
        total: session.answers.length,
        freeUntil: passed ? loadPurchases()[String(user.id)].free_until : null,
        review: session.items.map((item, index) => ({
          ...item,
          correct: submitted[index] === session.answers[index],
        })),
      }));
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
        const purchases = loadPurchases();
        const unlocked = hasAccess(purchases, message.from.id);
        await telegram("sendMessage", {
          chat_id: message.chat.id,
          text: unlocked
            ? "Доступ открыт. Можно запускать IT English Lab."
            : "Для открытия IT English Lab оплатите 1 Telegram Star или пройдите бесплатную игру.",
          reply_markup: {
            inline_keyboard: [
              unlocked
                ? [{ text: "Открыть мини-приложение", web_app: { url: webAppUrl } }]
                : [{ text: "Купить доступ за ⭐ 1", callback_data: "buy_access" }],
              !unlocked
                ? [{ text: "Получить бесплатно через игру", callback_data: "free_game" }]
                : [],
            ].filter((row) => row.length),
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

      if (update.callback_query?.data === "free_game") {
        await telegram("sendMessage", {
          chat_id: update.callback_query.message.chat.id,
          text: "Откройте Mini App, нажмите «Пройти игру» и наберите минимум 8 из 10.",
          reply_markup: {
            inline_keyboard: [
              [{ text: "Играть бесплатно", web_app: { url: `${webAppUrl}?free_game=1#/home` } }],
            ],
          },
        });
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
