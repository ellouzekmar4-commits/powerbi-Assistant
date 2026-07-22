# 🤖 AI Chatbot for Power BI — Live SQL data, Voice, Free

An AI assistant embedded in a Power BI dashboard that answers questions in natural language by querying your **real SQL Server database live** — with **voice input**, multilingual answers, and a **permanent free URL**.

📖 **Full step-by-step guide (anyone can follow it): [GUIDE.md](GUIDE.md)**

---

## Quick overview

```
User (browser / Power BI)
        ▼
Permanent public URL  ── Tailscale Funnel (free, never changes)
        ▼
Local Node.js server (server.js)
    ▼          ▼
SQL Server   Google Gemini API
(your data)  (writes SQL + answers)
```

## Features
- 💬 Floating chat inside Power BI + full web portal (`/portal`)
- 📊 Real answers from live SQL queries (read-only, never invents data)
- 🎤 Voice input — speak in any language, auto-transcribed by Gemini
- 🌍 Answers in the language of the question
- 🆓 100% free (Gemini free tier + Tailscale Funnel)
- 🔗 Permanent URL that never changes

## Repository contents
| File / folder | What it is |
|---|---|
| [`GUIDE.md`](GUIDE.md) | **Complete build guide** — start here |
| `server.js` | The chatbot server (chat UI, AI+SQL logic, voice transcription, portal) |
| `.env.example` | Configuration template (copy to `.env`, fill your values) |
| `docs/` | GitHub Pages redirect pages (optional stable-alias layer) |
| `template/` | Ready-to-fill copy to reuse on another database |
| `start-server.cmd`, `launcher.vbs` | Auto-start on Windows boot |

## Get started
1. Read **[GUIDE.md](GUIDE.md)**
2. Create a read-only SQL user
3. Fill `.env` (SQL connection + Gemini API key)
4. Describe your database schema in `server.js` (`SYSTEM_PROMPT`)
5. `npm install && node server.js`
6. Expose it with Tailscale Funnel → permanent URL
7. Embed the URL in Power BI via the "HTML Content" visual

## Security
The `.env` (API key + DB password) is **git-ignored** — never committed. The DB user is **read-only**; the server only allows `SELECT`.

---

*Built step by step with Claude. Free, open, reusable for any SQL Server + Power BI project.*
