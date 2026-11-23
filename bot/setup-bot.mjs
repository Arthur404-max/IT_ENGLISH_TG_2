const token = process.env.TELEGRAM_BOT_TOKEN;
const webAppUrl = process.env.TELEGRAM_WEBAPP_URL;

if (!token) {
  throw new Error("Set TELEGRAM_BOT_TOKEN in your environment.");
}
if (!webAppUrl || !/^https:\/\//i.test(webAppUrl)) {
  throw new Error("Set TELEGRAM_WEBAPP_URL to an HTTPS GitHub Pages URL.");
}

const api = `https://api.telegram.org/bot${token}`;

async function call(method, payload) {
  const response = await fetch(`${api}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok || !body.ok) {
    throw new Error(body.description || `Telegram API error: ${response.status}`);
  }
  return body.result;
}

await call("setMyCommands", {
  commands: [
    { command: "start", description: "Открыть IT English Lab" },
    { command: "open", description: "Запустить мини-приложение" },
  ],
});

await call("setChatMenuButton", {
  menu_button: {
    type: "web_app",
    text: "Открыть IT English",
    web_app: { url: webAppUrl },
  },
});

await call("setMyDescription", {
  description: "Интерактивный тренажёр английского языка для IT с экзаменами и интервальными повторениями.",
});

console.log("Telegram bot menu and commands configured.");
