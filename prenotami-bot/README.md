# 🤖 Prenotami Smart Automation Bot v2.0

> **The Ultimate Intelligent Booking Assistant**  
> Automate. Monitor. Book. Win.

---

## 📁 Project Structure

```
prenotami-bot/
│
├── config/
│   └── config.js                  ← Central configuration (reads from .env)
│
├── src/
│   ├── index.js                   ← 🚀 Main entry point
│   │
│   ├── core/
│   │   ├── Bot.js                 ← Single-account bot (state machine)
│   │   ├── BotOrchestrator.js     ← Multi-account parallel runner
│   │   └── StateManager.js        ← Global stats & state tracking
│   │
│   ├── auth/
│   │   ├── LoginHandler.js        ← Prenotami login flow
│   │   └── SessionManager.js      ← Cookie/session persistence
│   │
│   ├── browser/
│   │   ├── BrowserFactory.js      ← Puppeteer setup + stealth config
│   │   └── AntiDetection.js       ← Human-like interaction helpers
│   │
│   ├── booking/
│   │   ├── SlotMonitor.js         ← Calendar scanning logic
│   │   ├── BookingHandler.js      ← Slot selection + booking flow
│   │   └── FormFiller.js          ← Auto-fill personal data forms
│   │
│   ├── verification/
│   │   ├── OTPHandler.js          ← OTP detection + resolution
│   │   └── EmailHandler.js        ← Read OTP codes via IMAP
│   │
│   ├── notifications/
│   │   └── NotificationService.js ← Email + Telegram alerts
│   │
│   ├── queue/
│   │   └── TaskQueue.js           ← Concurrent task management
│   │
│   ├── scheduler/
│   │   └── Scheduler.js           ← Cron-based scheduling
│   │
│   ├── accounts/
│   │   └── AccountManager.js      ← Load & manage account list
│   │
│   └── utils/
│       ├── logger.js              ← Winston logger (console + file)
│       ├── retry.js               ← Retry / sleep / delay utilities
│       ├── proxy.js               ← Proxy configuration helpers
│       └── test-connection.js     ← Quick connectivity check
│
├── accounts/
│   ├── accounts.example.json      ← Template — copy to accounts.json
│   └── accounts.json              ← Your credentials (gitignored)
│
├── scripts/
│   └── setup.js                   ← First-time setup wizard
│
├── logs/                          ← Auto-created — daily rotating logs
├── sessions/                      ← Auto-created — per-account sessions
├── screenshots/                   ← Auto-created — booking confirmations
│
├── .env                           ← Your config (gitignored)
├── .env.example                   ← Template for .env
├── .gitignore
└── package.json
```

---

## ⚙️ Requirements

| Tool    | Version  |
|---------|----------|
| Node.js | ≥ 18.0.0 |
| npm     | ≥ 9.0.0  |

---

## 🚀 Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Run the setup wizard

```bash
npm run setup
```

This will:
- Create required directories (`logs/`, `sessions/`, `accounts/`, `screenshots/`)
- Copy `.env.example` → `.env`
- Copy `accounts.example.json` → `accounts/accounts.json`
- Ask you a few quick config questions

### 3. Edit your accounts

Open `accounts/accounts.json` and fill in your Prenotami credentials:

```json
[
  {
    "id": "account-001",
    "email": "your_email@example.com",
    "password": "your_prenotami_password",
    "firstName": "Mario",
    "lastName": "Rossi",
    "fiscalCode": "RSSMRA80A01H501U",
    "phone": "+39 333 1234567"
  }
]
```

### 4. Configure `.env`

Key settings:

```env
SERVICE_ID=1234              # The Prenotami service ID to book
CHECK_INTERVAL_MS=15000      # Check every 15 seconds
HEADLESS=true                # Run without visible browser
NOTIFY_TO=your@email.com     # Get notified when booked
```

### 5. Test connectivity

```bash
npm test
```

### 6. Start the bot!

```bash
npm start
```

---

## 👥 Multi-Account Usage

Add multiple entries to `accounts/accounts.json`. The bot runs them all in parallel, each in an isolated browser session:

```json
[
  { "id": "user-001", "email": "first@example.com",  "password": "..." },
  { "id": "user-002", "email": "second@example.com", "password": "..." },
  { "id": "user-003", "email": "third@example.com",  "password": "..." }
]
```

Control max concurrency in `.env`:

```env
MAX_CONCURRENT_ACCOUNTS=5
```

---

## 🔔 Notifications

### Email (Gmail)

```env
NOTIFY_EMAIL=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your_app_password   ← Use Gmail App Password
NOTIFY_TO=your@gmail.com
```

### Telegram

```env
NOTIFY_TELEGRAM=true
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

---

## 🔐 OTP Handling

The bot automatically detects OTP verification steps. It reads codes from your email inbox via IMAP.

Set per-account in `accounts.json`:

```json
{
  "emailPassword": "your_gmail_app_password",
  "imapHost": "imap.gmail.com",
  "imapPort": 993
}
```

---

## 🛡 Anti-Detection Features

- **Stealth plugin** — bypasses headless browser detection
- **User-agent rotation** — realistic desktop browser fingerprints
- **Human-like typing** — random delays between keystrokes
- **Natural mouse movement** — curved paths, random click offsets
- **Random scroll behaviour** — simulates page reading
- **Dynamic delays** — jittered timing to avoid pattern detection
- **Session reuse** — persists cookies to avoid repeated logins
- **Profile isolation** — separate Chrome profile per account

---

## 📊 Logging

Logs are written to:

- **Console** — coloured, human-readable
- **`logs/bot-YYYY-MM-DD.log`** — structured JSON, daily rotation
- **`logs/errors-YYYY-MM-DD.log`** — errors only

Control log verbosity:

```env
LOG_LEVEL=info     # error | warn | info | debug
```

---

## 🔧 Proxy Support

```env
USE_PROXY=true
PROXY_HOST=proxy.example.com
PROXY_PORT=8080
PROXY_USERNAME=user
PROXY_PASSWORD=pass
```

---

## 🧪 Development Mode

```bash
npm run dev     # Run with nodemon (auto-restart on file change)
```

Enable visible browser for debugging:

```env
HEADLESS=false
SLOW_MO=100
LOG_LEVEL=debug
```

---

## ❓ FAQ

**Q: Why is the bot not finding slots?**  
A: Verify `SERVICE_ID` in `.env` matches the correct Prenotami service. Try setting `HEADLESS=false` to watch the browser.

**Q: Login fails immediately**  
A: Check credentials in `accounts.json`. Enable `LOG_LEVEL=debug` to see detailed page flow.

**Q: OTP is never received**  
A: Make sure Gmail IMAP is enabled in Google account settings and you're using an App Password (not your regular password).

**Q: How do I stop the bot?**  
A: Press `Ctrl+C` — it will shut down gracefully.

---

## 📜 License

Private software. All rights reserved.  
Redistribution or resale without written permission is prohibited.
