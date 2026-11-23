# IT English Lab — PWA

Статический офлайн-тренажёр английского для IT. Работает в браузере на компьютере и телефоне; после первого открытия кэширует материалы для офлайн-доступа.

- 15 учебных юнитов, словарь, тексты, аудио, упражнения и экзамены.
- Прогресс хранится локально в браузере (IndexedDB); есть экспорт и импорт JSON.
- ИИ и серверное API отключены. Данные не синхронизируются между устройствами.

## Локальный просмотр

Запустите любой статический HTTP-сервер из корня репозитория, например:

```powershell
python -m http.server 8000
```

Затем откройте `http://localhost:8000/`. Для работы service worker нужен HTTPS или localhost.

## Публикация

Workflow `.github/workflows/pages.yml` публикует корень репозитория в GitHub Pages при отправке в `main`. В настройках репозитория откройте **Settings → Pages** и выберите **GitHub Actions** в поле **Source**.

## Telegram Mini App

1. Опубликуйте проект через GitHub Pages и получите HTTPS-ссылку вида `https://<account>.github.io/IT_ENGLISH_TG_2/`.
2. В командной строке задайте переменные окружения без записи секрета в файлы проекта:
   ```powershell
   $env:TELEGRAM_BOT_TOKEN = "новый токен бота"
   $env:TELEGRAM_WEBAPP_URL = "https://<account>.github.io/IT_ENGLISH_TG_2/"
   node bot/setup-bot.mjs
   ```
3. Не используйте ранее опубликованный токен; токен должен быть создан заново в BotFather и храниться только в переменной окружения.

Telegram SDK применяет тему приложения, расширяет окно и включает системную кнопку «Назад». Прогресс остаётся локальным для каждого устройства/аккаунта браузера и не отправляется в Telegram.

## Оплата Telegram Stars

`bot/server.mjs` принимает успешные платежи в Telegram Stars и выдаёт доступ одному Telegram-пользователю навсегда. Доступ стоит 1 Star.

```powershell
$env:TELEGRAM_BOT_TOKEN = "токен бота"
$env:TELEGRAM_WEBAPP_URL = "https://arthur404-max.github.io/IT_ENGLISH_TG_2/"
$env:PORT = "8788"
node bot/server.mjs
```

Сервер проверяет криптографическую подпись `initData` Telegram Mini App. Бэкенд должен быть доступен по публичному HTTPS и его URL нужно указать в `<meta name="telegram-backend-url" content="https://...">` в `index.html`.

Команды бота: `/start`, `/open`, `/buy`.

Удаление данных сайта в браузере удалит локальный прогресс. Для переноса на другое устройство используйте экспорт JSON в разделе «Настройки».
