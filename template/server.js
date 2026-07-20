// ============================================================
//  CHATBOT IA POUR DASHBOARD POWER BI  —  MODELE REUTILISABLE
// ============================================================
// Rien a modifier ici. Tout ce qui depend de la base se configure dans :
//   - .env        (connexion SQL, cle Gemini, lien du rapport, nom)
//   - schema.txt  (description des tables et regles metier de VOTRE base)
// ============================================================

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const sql = require('mssql');

const app = express();
app.use(express.json());

app.use(function (req, res, next) {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
});

const PORT           = process.env.PORT || 3000;
const GEMINI_KEY     = process.env.GEMINI_API_KEY;
const GEMINI_MODEL   = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const ASSISTANT_NAME = process.env.ASSISTANT_NAME || "Assistant IA";
const PBI_EMBED_URL  = process.env.PBI_EMBED_URL || "";

// Le schema/regles metier de VOTRE base, lu depuis schema.txt
const DOMAIN = fs.readFileSync(path.join(__dirname, 'schema.txt'), 'utf8');

app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/chatui', (req, res) => { res.set('Content-Type', 'text/html; charset=utf-8'); res.send(CHAT_HTML); });
app.get('/portal', (req, res) => { res.set('Content-Type', 'text/html; charset=utf-8'); res.send(PORTAL_HTML); });

app.post('/api/chatapi', async (req, res) => {
    if (!GEMINI_KEY) return res.status(500).json({ error: "GEMINI_API_KEY non configuree (voir .env)" });
    const userMessages = (req.body && req.body.messages) || [];
    if (!Array.isArray(userMessages) || userMessages.length === 0)
        return res.status(400).json({ error: "messages manquant" });
    try {
        const reply = await runConversation(userMessages);
        res.json({ reply });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => console.log(`Chatbot "${ASSISTANT_NAME}" sur http://localhost:${PORT}`));

function getSystemPrompt() {
    const dateStr = new Date().toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    return `Tu es "${ASSISTANT_NAME}", l'assistant d'un dashboard Power BI. Reponds TOUJOURS dans la meme langue que la question de l'utilisateur (francais, anglais, arabe, etc.), de maniere concise et professionnelle.

Tu as acces a un outil "query_database" pour interroger en LECTURE SEULE la base SQL Server qui alimente ce dashboard. Utilise-le des qu'une question porte sur des donnees reelles.

${DOMAIN}

REGLES GENERALES :
- Ajoute WITH (NOLOCK) apres chaque table pour ne pas bloquer la production.
- Joins UNIQUEMENT les tables necessaires (la base peut etre volumineuse).
- Toute requete doit etre un SELECT en lecture seule (jamais INSERT/UPDATE/DELETE/DROP/etc.).
- N'invente JAMAIS de donnees. Si la requete echoue, dis-le explicitement.
- FORMAT : si la reponse contient plusieurs lignes de donnees, formate-les en tableau HTML (<table>, <th>, <td>, nombres alignes a droite avec style='text-align:right'). PAS de tableaux Markdown. Pour une seule valeur, reste en texte.

Date du jour : ${dateStr}.`;
}

const TOOLS = [{ functionDeclarations: [{
    name: "query_database",
    description: "Execute une requete SQL SELECT en lecture seule et retourne les lignes (JSON).",
    parameters: { type: "OBJECT", properties: { sql: { type: "STRING" } }, required: ["sql"] }
}]}];

function toGeminiContents(messages) {
    return messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
}

async function callGemini(contents) {
    for (let attempt = 0; attempt <= 3; attempt++) {
        const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + GEMINI_KEY, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ system_instruction: { parts: [{ text: getSystemPrompt() }] }, contents, tools: TOOLS })
        });
        const data = await res.json();
        if (res.ok) return data;
        const message = (data.error && data.error.message) || "Erreur API Gemini";
        if ((res.status === 503 || /overloaded|unavailable/i.test(message)) && attempt < 3) {
            await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); continue;
        }
        throw new Error(message);
    }
}

async function runConversation(initialMessages) {
    let contents = toGeminiContents(initialMessages);
    for (let turn = 0; turn < 5; turn++) {
        const data = await callGemini(contents);
        const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
        const fc = parts.find(p => p.functionCall);
        if (!fc) {
            const textParts = parts.filter(p => p.text && !p.thought);
            return textParts.length ? textParts.map(p => p.text).join("") : "Je n'ai pas pu formuler de reponse.";
        }
        contents.push({ role: "model", parts });
        let payload;
        try { payload = { result: await queryDatabase(fc.functionCall.args.sql) }; }
        catch (err) { payload = { error: err.message }; }
        contents.push({ role: "user", parts: [{ functionResponse: { name: fc.functionCall.name, response: payload } }] });
    }
    return "Desole, je n'ai pas pu obtenir de reponse definitive.";
}

const queryCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function queryDatabase(query) {
    const trimmed = (query || "").trim();
    const upper = trimmed.toUpperCase();
    if (!/^(SELECT|WITH)\b/.test(upper)) throw new Error("Seules les requetes SELECT sont autorisees.");
    if (/\b(INSERT|UPDATE|DELETE|DROP|ALTER|EXEC|MERGE|TRUNCATE|GRANT|REVOKE|CREATE)\b/.test(upper))
        throw new Error("Requete refusee (mot-cle non autorise).");
    const cached = queryCache.get(trimmed);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.rows;
    const pool = await getPool();
    const result = await pool.request().query(trimmed);
    queryCache.set(trimmed, { rows: result.recordset, at: Date.now() });
    return result.recordset;
}

let poolPromise = null;
function getPool() {
    if (!poolPromise) {
        poolPromise = sql.connect({
            server: process.env.SQL_HOST || "localhost",
            port: parseInt(process.env.SQL_PORT || "1433", 10),
            database: process.env.SQL_DATABASE,
            user: process.env.SQL_USER,
            password: process.env.SQL_PASSWORD,
            options: { encrypt: true, trustServerCertificate: true },
            connectionTimeout: 15000, requestTimeout: 120000
        }).catch(err => { poolPromise = null; throw err; });
    }
    return poolPromise;
}

const PORTAL_HTML = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Dashboard</title>
<style>
  html,body{margin:0;padding:0;height:100%;overflow:hidden;font-family:'Segoe UI',sans-serif;}
  #report{position:fixed;inset:0;width:100%;height:100%;border:0;}
  #chatToggle{position:fixed;bottom:24px;right:24px;z-index:1000;width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;background:#48b096;color:#fff;font-size:28px;box-shadow:0 4px 16px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;}
  #chatPanel{position:fixed;bottom:96px;right:24px;z-index:1000;width:380px;height:540px;max-width:calc(100vw - 48px);max-height:calc(100vh - 130px);border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.35);border:1px solid #e0e0e0;display:none;}
  #chatPanel.open{display:block;}
  #chatPanel iframe{width:100%;height:100%;border:0;}
</style></head>
<body>
  <iframe id="report" src="${PBI_EMBED_URL}" allowfullscreen></iframe>
  <div id="chatPanel"><iframe src="/chatui"></iframe></div>
  <button id="chatToggle">&#128172;</button>
  <script>
    var panel=document.getElementById('chatPanel'),btn=document.getElementById('chatToggle');
    btn.addEventListener('click',function(){var o=panel.classList.toggle('open');btn.innerHTML=o?'&#10005;':'&#128172;';});
  </script>
</body></html>`;

const CHAT_HTML = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${ASSISTANT_NAME}</title>
<style>
  *{box-sizing:border-box;}
  body{margin:0;font-family:'Segoe UI',sans-serif;background:#fff;display:flex;flex-direction:column;height:100vh;}
  .header{background:#0C3549;color:#fff;padding:12px 16px;font-weight:600;font-size:14px;display:flex;align-items:center;justify-content:space-between;}
  .newChat{background:transparent;border:1px solid rgba(255,255,255,.5);color:#fff;border-radius:12px;padding:3px 10px;font-size:11px;cursor:pointer;font-family:inherit;}
  .messages{flex:1;padding:12px;overflow-y:auto;font-size:13px;color:#252423;}
  .msg{border-radius:8px;padding:8px 10px;margin-bottom:8px;max-width:85%;word-wrap:break-word;white-space:pre-wrap;}
  .msg.bot{background:#f2f2f2;overflow-x:auto;}
  .msg.user{background:#48b096;color:#fff;margin-left:auto;text-align:right;}
  .msg.error{background:#fdecea;color:#b3261e;}
  .msg table{border-collapse:collapse;width:100%;margin:4px 0;font-size:12px;}
  .msg th,.msg td{border:1px solid #ddd;padding:4px 8px;text-align:left;}
  .msg th{background:#0C3549;color:#fff;}
  .msg tr:nth-child(even) td{background:#f7f7f7;}
  .inputRow{padding:8px 10px;border-top:1px solid #eee;display:flex;gap:6px;}
  .inputRow input{flex:1;border:1px solid #ddd;border-radius:14px;padding:8px 12px;font-size:12px;}
  .inputRow button{background:#48b096;color:#fff;border:none;border-radius:50%;width:34px;height:34px;cursor:pointer;}
  .typing{font-style:italic;color:#999;font-size:12px;padding:0 12px 8px;}
</style></head>
<body>
  <div class="header">${ASSISTANT_NAME} <button class="newChat" id="newChat">&#8634; Nouveau chat</button></div>
  <div class="messages" id="messages"><div class="msg bot">Bonjour ! Comment puis-je vous aider ?</div></div>
  <div class="typing" id="typing" style="display:none;">L'assistant ecrit...</div>
  <div class="inputRow"><input id="input" type="text" placeholder="Ecrivez un message..." autocomplete="off"><button id="send">&#10148;</button></div>
  <script>
    var chatHistory=[],messagesEl=document.getElementById('messages'),input=document.getElementById('input'),sendBtn=document.getElementById('send'),typingEl=document.getElementById('typing');
    var ALLOWED=/^(TABLE|THEAD|TBODY|TFOOT|TR|TH|TD|B|STRONG|EM|I|BR|UL|OL|LI|P|SPAN|DIV|H3|H4)$/;
    function sanitize(node){Array.prototype.slice.call(node.childNodes).forEach(function(c){if(c.nodeType===1){if(!ALLOWED.test(c.tagName)){c.parentNode.replaceChild(document.createTextNode(c.textContent),c);return;}Array.prototype.slice.call(c.attributes).forEach(function(a){if(!/^(style|colspan|rowspan)$/i.test(a.name))c.removeAttribute(a.name);});sanitize(c);}});}
    function addMessage(role,text){var div=document.createElement('div');div.className='msg '+role;if(role==='bot'&&/<(table|ul|ol|strong|b|br|p)/i.test(text)){var tmp=document.createElement('div');tmp.innerHTML=text.replace(/\\*\\*([^*]+)\\*\\*/g,'<strong>$1</strong>');sanitize(tmp);div.innerHTML=tmp.innerHTML;div.style.whiteSpace='normal';}else{div.textContent=text;}messagesEl.appendChild(div);messagesEl.scrollTop=messagesEl.scrollHeight;}
    function send(){var text=input.value.trim();if(!text)return;addMessage('user',text);chatHistory.push({role:'user',content:text});input.value='';input.disabled=true;sendBtn.disabled=true;typingEl.style.display='block';
      fetch('/api/chatapi',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:chatHistory})}).then(function(r){return r.json();}).then(function(data){typingEl.style.display='none';input.disabled=false;sendBtn.disabled=false;input.focus();if(data.error){addMessage('error','Erreur : '+data.error);return;}addMessage('bot',data.reply);chatHistory.push({role:'assistant',content:data.reply});}).catch(function(err){typingEl.style.display='none';input.disabled=false;sendBtn.disabled=false;addMessage('error','Erreur reseau : '+err.message);});}
    sendBtn.addEventListener('click',send);
    input.addEventListener('keydown',function(e){if(e.key==='Enter')send();});
    document.getElementById('newChat').addEventListener('click',function(){chatHistory=[];messagesEl.innerHTML='';addMessage('bot','Bonjour ! Comment puis-je vous aider ?');input.disabled=false;sendBtn.disabled=false;input.value='';input.focus();});
  </script>
</body></html>`;
