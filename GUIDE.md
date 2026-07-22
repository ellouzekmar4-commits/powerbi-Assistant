# 🤖 Build Your Own AI Chatbot for a Power BI Dashboard (Free, with Voice)

A complete, step-by-step guide to build an AI assistant that answers questions in natural language by querying your **real SQL Server database live**, embedded in your Power BI report — with **voice input** and a **permanent free URL**.

> This guide is generic. It was built for a clinic (`csys` database) but works for **any SQL Server + Power BI project**. Anyone can follow it.

---

## What you get

- 💬 A chat assistant inside your Power BI report (floating button) **and** a full web portal
- 📊 Answers built from your **real data** (live SQL queries), not made up
- 🎤 **Voice input** — speak your question in any language, it transcribes and answers
- 🌍 Multilingual (answers in the language of the question)
- 🆓 **100% free** (Google Gemini free tier + free hosting tunnel)
- 🔗 A **permanent URL** that never changes

## How it works (architecture)

```
User (browser / Power BI)
        │
        ▼
Permanent public URL  ── Tailscale Funnel (free, stable)
        │
        ▼
Local Node.js server  (runs on your PC)
        │
   ┌────┴─────┐
   ▼          ▼
SQL Server   Google Gemini API
(your data)  (the "brain")
```

The **brain**: Gemini receives the question + your database schema, writes a SQL query, the server runs it (read-only), then Gemini turns the result into a clear answer/table.

---

## Prerequisites

- Windows PC with your **SQL Server** database and **Power BI Desktop**
- [Node.js](https://nodejs.org) (LTS)
- A free [Google AI Studio](https://aistudio.google.com) account (for the Gemini API key)
- A free [Tailscale](https://tailscale.com) account (for the permanent URL)
- (Optional) A free [GitHub](https://github.com) account (to back up your code)

---

## STEP 1 — Create a read-only database user

The chatbot must only **read** data, never modify it. In SQL Server Management Studio (or `sqlcmd`), run:

```sql
CREATE LOGIN chatbot_reader WITH PASSWORD = 'ChangeMe_StrongPassword!';
USE YourDatabase;
CREATE USER chatbot_reader FOR LOGIN chatbot_reader;
-- one GRANT per table the bot may read:
GRANT SELECT ON dbo.Table1 TO chatbot_reader;
GRANT SELECT ON dbo.Table2 TO chatbot_reader;
```

Make sure SQL Server accepts **SQL authentication** (Mixed Mode) and has a reachable **TCP port** (default 1433). For a named instance, set a static port in *SQL Server Configuration Manager → TCP/IP → IPAll → TCP Port = 1433*, then restart the SQL service.

---

## STEP 2 — Get the server code

Create a folder `powerbi-chatbot-server` and add the files below.

### `package.json`
```json
{
  "name": "powerbi-chatbot-server",
  "version": "1.0.0",
  "private": true,
  "main": "server.js",
  "dependencies": {
    "express": "^4.19.2",
    "mssql": "^10.0.2",
    "dotenv": "^16.4.5"
  }
}
```

### `.env` (your secrets — never share this file)
```
PORT=3000
SQL_HOST=localhost
SQL_PORT=1433
SQL_DATABASE=YourDatabase
SQL_USER=chatbot_reader
SQL_PASSWORD=ChangeMe_StrongPassword!
GEMINI_API_KEY=your_gemini_key_here
```

Get the Gemini key at **aistudio.google.com → Get API key → Create API key** (free, no credit card).

### `server.js`
The full, ready-to-use server is in this repository (`server.js`). It includes:
- `/chatui` — the chat window (with mic button)
- `/portal` — full-screen Power BI report + floating chat
- `/api/chatapi` — the AI + SQL logic (function calling)
- `/api/transcribe` — voice → text via Gemini

**The only part you customize is the schema description** (see STEP 3).

Install dependencies:
```bash
npm install
```

---

## STEP 3 — Describe YOUR database (the only real work)

Inside `server.js`, edit the `SYSTEM_PROMPT` to describe your tables, columns, and business rules. Example:

```
Schema (read-only):
- dbo.Client : CodCli, Nom (customer name)
- dbo.Facture : numbon, codcli (-> Client.CodCli), datesys (date)
- dbo.MvtSto : numbon (-> Facture.numbon), montht (amount), typmvt ('S'=sale, 'E'=return)

Business definitions:
- Revenue = SUM(montht) WHERE typmvt='S'
- Net Sales = Revenue - Returns (typmvt='E')

Rules:
- Always add WITH (NOLOCK) after each table.
- Only join the tables needed for the question.
- SELECT queries only, never modify data.
```

**The better you describe the schema, the better the answers.** This is the key to accuracy.

---

## STEP 4 — Run and test locally

```bash
node server.js
```
Open **http://localhost:3000/chatui** in Chrome or Edge. Ask a question — it should answer from your real data.

---

## STEP 5 — Make it public with a permanent free URL (Tailscale Funnel)

The chat must be reachable from Power BI (which loads it from the cloud). Tailscale Funnel gives a **stable public URL that never changes** — free.

1. Install Tailscale: `winget install Tailscale.Tailscale`
2. Log in (creates your free account):
   ```
   tailscale up
   ```
   (open the link it prints, sign in)
3. Enable Funnel (one-time, open the link it prints):
   ```
   tailscale funnel --bg 3000
   ```
   If it says *"Funnel is not enabled"*, open the link, click Enable, and re-run the command.
4. It prints your **permanent URL**, e.g.:
   ```
   https://your-pc.your-tailnet.ts.net
   ```
   This URL is **fixed forever** and the Tailscale service auto-starts with Windows.

Test it: open `https://your-pc.your-tailnet.ts.net/portal` from any device.

> **Alternative (quick test only):** `cloudflared tunnel --url http://localhost:3000` gives a temporary URL, but it **changes on every restart** — use Tailscale for production.

---

## STEP 6 — Add the chat to Power BI

The chatbot lives in a small measure using the free **"HTML Content"** custom visual (from AppSource).

1. In Power BI Desktop, add the **HTML Content** visual to your page.
2. Create a measure (replace the URL with YOUR Tailscale URL):

```dax
Chatbot Widget HTML =
"<div style='display:flex;justify-content:flex-end;align-items:flex-end;width:100%;height:100%;'>"
& "<details><summary style='list-style:none;width:56px;height:56px;border-radius:50%;background:#48b096;color:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.35);'>"
& UNICHAR(128172) & "</summary>"
& "<div style='width:320px;height:440px;background:#fff;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.3);margin-top:8px;overflow:hidden;'>"
& "<iframe src='https://your-pc.your-tailnet.ts.net/chatui' style='border:0;width:100%;height:100%;'></iframe>"
& "</div></details></div>"
```

3. Put this measure in the HTML Content visual's field. A floating 💬 button appears; clicking it opens the chat.
4. (Optional) Copy the visual onto every page so the chat is always available.

> **Note:** The mic works in the **web portal** (`/portal`), but often **not** inside the Power BI-embedded widget (Power BI's security sandbox blocks the microphone). Use the portal URL for voice.

---

## STEP 7 (optional) — Auto-start on boot

Create `start-server.cmd`:
```bat
@echo off
cd /d C:\path\to\powerbi-chatbot-server
:loop
node server.js
timeout /t 5 /nobreak >nul
goto loop
```
Put a shortcut to it (or a `.vbs` launcher) in the Windows **Startup** folder (`shell:startup`). Tailscale already auto-starts as a service.

---

## How the voice feature works

- Click the 🎤 button → it records your voice.
- It **stops automatically** when you stop talking (silence detection).
- The audio is sent to Gemini, which **transcribes it in any language** (auto-detected).
- The text appears in the input box — review it, then send.

No paid speech service needed — Gemini does the transcription for free.

---

## Cost

Using Google Gemini's **Flash-Lite** model (free tier: ~1000 requests/day):
- Typical question ≈ **$0.001** (one-tenth of a cent) if you were on the paid tier
- In practice: **$0** for normal usage (within the free daily quota)

See `Resume_Projet` for a detailed model/cost comparison (Flash-Lite vs Flash vs Pro).

---

## Security notes

- The `.env` file (API key + DB password) must **never** be committed to GitHub. This repo's `.gitignore` already excludes it.
- The database user is **read-only** and the server only allows `SELECT` queries.
- Add authentication (password) on the chat if you expose sensitive data widely.

---

## Reuse for another project

Everything database-specific is in **two places**: the `.env` (connection) and the `SYSTEM_PROMPT` schema description in `server.js`. Change those two, point the Power BI iframe to your URL, and you have a chatbot for any other database. A ready-to-fill template is in the `/template` folder.

---

## Limitations

- The PC hosting the server must stay **on**.
- Voice works on Chrome/Edge, in the web portal (not the embedded Power BI widget).
- Free Gemini tier has a daily request limit (generous for most uses).

---

*Built step by step with Claude. Free, open, reusable.*
