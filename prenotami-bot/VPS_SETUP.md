# Prenotami Bot - VPS Setup and User Guide

This guide explains exactly how to install, run, and use the app on a VPS.

Use this document when you sell the app to a customer.

---

## 1) VPS requirements

- Ubuntu 22.04/24.04 VPS (recommended)
- Minimum: 2 vCPU, 2 GB RAM, 20 GB disk
- A sudo user
- Internet access to `https://prenotami.esteri.it`

---

## 2) First-time server setup

Run these commands on the VPS:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl git ufw
```

Install Docker:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

Optional firewall (recommended):

```bash
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status
```

---

## 3) Upload project to VPS

Choose one method.

### Method A - Git clone

```bash
git clone <YOUR_REPOSITORY_URL> prenotami-bot
cd prenotami-bot
```

### Method B - Upload zip from your PC

1. Upload project folder to VPS (SFTP/WinSCP/FileZilla).
2. SSH into VPS and go to project folder:

```bash
cd /path/to/prenotami-bot
```

---

## 4) Configure the app

### 4.1 Create `.env`

```bash
cp .env.example .env
nano .env
```

Minimum required keys:

- `MODE=rdv` (or `MODE=liste_attente`)
- `SERVICE_ID=<service id>` (required for `MODE=rdv`)
- `NOTIFY_TELEGRAM=true`
- `TELEGRAM_BOT_TOKEN=<bot token>`
- `TELEGRAM_CHAT_ID=<numeric chat id>`

Important recommended values:

- `HEADLESS=true`
- `SCHEDULER_DISABLED=false`
- `HEALTH_ENABLED=true`
- `HEALTH_PORT=3001`

### 4.2 Create `accounts/accounts.json`

```bash
cp accounts/accounts.example.json accounts/accounts.json
nano accounts/accounts.json
```

Fill real customer data for each account:

- `email`
- `password`
- `firstName`
- `lastName`
- `fiscalCode`
- `birthDate`
- `phone`
- `passport`

You can add multiple accounts in the same JSON array.

---

## 5) Start app with Docker (recommended)

From project root:

```bash
docker compose up -d --build
```

Check status:

```bash
docker compose ps
```

See live logs:

```bash
docker compose logs -f
```

Stop app:

```bash
docker compose down
```

Restart app:

```bash
docker compose restart
```

---

## 6) Health check and monitoring

### Health endpoint

```bash
curl http://127.0.0.1:3001/health
```

If everything is good, it should return healthy status JSON.

### Useful commands

```bash
docker compose ps
docker compose logs --since=10m
```

App data is persisted in:

- `logs/`
- `sessions/`
- `state/`

---

## 7) Exact daily usage (for your buyer)

Give these instructions to the customer:

1. **Keep VPS running 24/7.**
2. **Do not close Docker or stop the container.**
3. **Check bot once per day** with:
   - `docker compose ps`
   - `docker compose logs --since=10m`
4. **Watch Telegram notifications** for:
   - slot found
   - reservation steps
   - errors/retries
5. **If settings must change** (service id, mode, account info):
   - edit `.env` or `accounts/accounts.json`
   - run `docker compose up -d --build`
6. **If bot looks stuck**, restart:
   - `docker compose restart`
7. **After VPS reboot**, app auto-starts (because restart policy is `unless-stopped`).

---

## 8) How to hand this app to a new user

Use this checklist before delivery:

1. Create a clean copy of the project.
2. Put buyer credentials in:
   - `.env`
   - `accounts/accounts.json`
3. Start and test:
   - `docker compose up -d --build`
   - verify logs and `/health`
4. Confirm Telegram alerts are received.
5. Share with buyer:
   - VPS IP
   - SSH user
   - SSH key/password
   - this `VPS_SETUP.md` guide
6. Tell buyer to change all sensitive credentials after delivery.

---

## 9) Troubleshooting

### Container is not running

```bash
docker compose ps
docker compose logs --tail=200
```

Common causes:

- invalid `.env` value
- invalid JSON in `accounts/accounts.json`
- missing required fields

### Telegram not working

Run:

```bash
npm install
npm run test-telegram
```

Check:

- `TELEGRAM_BOT_TOKEN` is correct
- `TELEGRAM_CHAT_ID` is numeric and correct
- bot is allowed to message that chat

### Login/reservation errors

- Recheck account credentials in `accounts/accounts.json`
- Verify `SERVICE_ID`
- Keep conservative polling values (do not set extreme intervals)

---

## 10) Security best practices

- Never share `.env` in public repositories.
- Restrict SSH access (key-based login recommended).
- Keep VPS updated monthly.
- Rotate Telegram token and account passwords when ownership changes.
- Keep `accounts/` data private.

---

If you want, you can also create a second short file named `USER_QUICK_START.md` with only the 7 daily-use commands for non-technical buyers.
