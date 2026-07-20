require('dotenv').config();
const express = require('express');
const sql = require('mssql');

const app = express();
app.use(express.json());

app.use(function (req, res, next) {
    console.log(`[req] ${req.method} ${req.url} | origin=${req.headers.origin || "-"} | ua=${(req.headers["user-agent"] || "-").slice(0, 60)}`);
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }
    next();
});

const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/chatui', (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(CHAT_HTML);
});

app.get('/portal', (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(PORTAL_HTML);
});

const PBI_EMBED_URL = "https://app.powerbi.com/reportEmbed?reportId=d25540be-95cc-4bba-b959-731a2b121964&autoAuth=true&ctid=14923c2a-da58-49a8-b870-b3ab96fb79a3";

const PORTAL_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Dashboard Clinique</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; height:100%; overflow:hidden; font-family:'Segoe UI', sans-serif; }
  #report { position:fixed; inset:0; width:100%; height:100%; border:0; }
  #chatToggle {
    position:fixed; bottom:24px; right:24px; z-index:1000;
    width:60px; height:60px; border-radius:50%; border:none; cursor:pointer;
    background:#48b096; color:#fff; font-size:28px;
    box-shadow:0 4px 16px rgba(0,0,0,.35);
    display:flex; align-items:center; justify-content:center;
    transition: transform .15s ease;
  }
  #chatToggle:hover { transform:scale(1.08); }
  #chatPanel {
    position:fixed; bottom:96px; right:24px; z-index:1000;
    width:380px; height:540px; max-width:calc(100vw - 48px); max-height:calc(100vh - 130px);
    border-radius:14px; overflow:hidden; background:#fff;
    box-shadow:0 10px 40px rgba(0,0,0,.35); border:1px solid #e0e0e0;
    display:none;
  }
  #chatPanel.open { display:block; }
  #chatPanel iframe { width:100%; height:100%; border:0; }
</style>
</head>
<body>
  <iframe id="report" src="${PBI_EMBED_URL}" allowfullscreen></iframe>
  <div id="chatPanel"><iframe src="/chatui" title="Assistant IA" allow="microphone"></iframe></div>
  <button id="chatToggle" title="Assistant IA">&#128172;</button>
  <script>
    var panel = document.getElementById('chatPanel');
    var btn = document.getElementById('chatToggle');
    btn.addEventListener('click', function () {
      var open = panel.classList.toggle('open');
      btn.innerHTML = open ? '&#10005;' : '&#128172;';
    });
  </script>
</body>
</html>`;

app.post('/api/chatapi', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY non configuree (voir .env)" });
    }

    const userMessages = (req.body && req.body.messages) || [];
    if (!Array.isArray(userMessages) || userMessages.length === 0) {
        return res.status(400).json({ error: "Parametre 'messages' manquant ou vide" });
    }

    try {
        const reply = await runConversation(userMessages, apiKey);
        res.json({ reply });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Chatbot server listening on http://localhost:${PORT}`);
    console.log(`Chat UI: http://localhost:${PORT}/chatui`);
});

const SYSTEM_PROMPT = `Tu es l'assistant du dashboard Power BI "cliniqueeee". Reponds TOUJOURS dans la meme langue que la question de l'utilisateur (francais, anglais, arabe, etc.), de maniere concise et professionnelle.

Tu as acces a un outil "query_database" pour interroger en lecture seule la base SQL Server "csys" qui alimente ce dashboard. Utilise-le des qu'une question porte sur des donnees reelles (clients, ventes, produits, etc.) plutot que d'inventer une reponse.

Schema (lecture seule) :
- dbo.Client : CodCli (code client), Nom, codFamCli (categorie/famille client), CodRep (code representant), codSouReg (code sous-region), VilleFac (ville)
- dbo.Facture : numbon (numero de bon), typbon (type de document : FC/FB/FF=factures, BL=bon livraison, CA/CV=commandes, DV=devis, AV=avoir, BR=bon retour...), codcli (-> Client.CodCli), codrep (-> Represt.CodRep), datesys (date), mntbon (montant total du bon)
- dbo.MvtSto : lignes de detail. numbon (-> Facture.numbon), codart (-> Stock.codart), desart (designation article), quantite, priuni (prix de vente unitaire), priach (prix d'achat unitaire), montht (montant HT ligne), datbon (date), typmvt : 'S'=vente/sortie, 'E'=retour/entree, 'T'=transfert de stock, 'X'=devis ou commande non confirmee. NE JAMAIS inclure T et X dans les calculs de ventes !
- dbo.Stock : codart, desart, FamArt (-> FamArt.FamArt), Qtestk (stock actuel), StkMin, StkMax, Priach, pvp (prix vente public), Marque, actif
- dbo.FamArt : FamArt (code famille), DesFam (nom de la famille d'articles)
- dbo.soureg : codsoureg (-> Client.codSouReg), dessoureg (nom sous-region), codregion, codville
- dbo.Represt : CodRep (-> Client.CodRep et Facture.codrep), Nom (nom du representant)

Definitions metier (identiques au dashboard, a respecter) :
- Chiffre d'affaires = SUM(montht) sur MvtSto ou typmvt='S'
- Montant Retourne = SUM(montht) ou typmvt='E'
- Ventes Nettes = CA - Montant Retourne
- Quantite Vendue = SUM(quantite) ou typmvt='S'
- Marge = SUM(quantite * (priuni - priach)) ou typmvt='S' (ne PAS utiliser la colonne 'marge', elle n'est pas fiable)
- Taux de marge % = Marge / CA

PERFORMANCE (TRES IMPORTANT) : la base est volumineuse. Joins UNIQUEMENT les tables strictement necessaires a la question. N'ajoute JAMAIS de jointure inutile.
- Le filtre "exclure les clients dont Nom est NULL ou vide" (c.Nom IS NOT NULL AND LTRIM(RTRIM(c.Nom)) <> '') s'applique SEULEMENT quand la question porte sur les clients (regroupement ou filtre par client). Pour une question par famille, par article ou par representant, ne joins PAS la table Client du tout.

Chemins de jointure (utilise le plus court possible) :
- CA par famille d'articles : MvtSto -> Stock (codart) -> FamArt. (NE PAS joindre Facture ni Client)
- CA par article : MvtSto seul (desart) ou -> Stock. (NE PAS joindre Facture ni Client)
- CA par representant : MvtSto -> Facture (numbon) -> Represt (codrep). (NE PAS joindre Client)
- CA par client / region / ville : MvtSto -> Facture -> Client (-> soureg), AVEC le filtre nom non vide.

Ajoute TOUJOURS le hint WITH (NOLOCK) apres chaque table pour ne pas bloquer l'application de production.

Exemple de requete "Top 5 clients" :
SELECT TOP 5 c.Nom AS Client,
       SUM(CASE WHEN m.typmvt = 'S' THEN m.montht ELSE 0 END) - SUM(CASE WHEN m.typmvt = 'E' THEN m.montht ELSE 0 END) AS VentesNettes
FROM dbo.MvtSto m WITH (NOLOCK)
INNER JOIN dbo.Facture f WITH (NOLOCK) ON f.numbon = m.numbon
INNER JOIN dbo.Client c WITH (NOLOCK) ON c.CodCli = f.codcli
WHERE c.Nom IS NOT NULL AND LTRIM(RTRIM(c.Nom)) <> ''
GROUP BY c.Nom
ORDER BY VentesNettes DESC

Toute requete doit etre un SELECT en lecture seule (jamais INSERT/UPDATE/DELETE/DROP/etc.).

REGLE ABSOLUE : n'invente JAMAIS de noms de clients, de montants ou de donnees. Si l'outil query_database echoue, renvoie une erreur, ou si tu n'es pas sûr du resultat, dis-le explicitement a l'utilisateur (ex: "je n'ai pas pu récupérer cette donnée, réessayez") plutot que de fournir un exemple ou une estimation qui ressemble a une vraie reponse.

FORMAT DE REPONSE : quand ta reponse presente plusieurs lignes de donnees (par exemple un CA par famille, un classement, une repartition), formate-les OBLIGATOIREMENT en tableau HTML avec la balise <table>, des en-tetes <th> et des cellules <td>. Aligne les nombres a droite avec style='text-align:right'. N'utilise PAS de tableaux Markdown (avec des | ). Pour une reponse a une seule valeur ou une phrase, reste en texte simple.`;

const GEMINI_MODEL = "gemini-3.1-flash-lite";

function getSystemPrompt() {
    const dateStr = new Date().toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    return SYSTEM_PROMPT + "\n\nDate du jour : " + dateStr + ". Utilise cette date pour interpreter les expressions comme 'aujourd'hui', 'ce mois', 'cette annee', 'le mois dernier' dans les questions et les requetes SQL.";
}

const TOOLS = [
    {
        functionDeclarations: [
            {
                name: "query_database",
                description: "Execute une requete SQL SELECT en lecture seule sur la base 'csys' et retourne les lignes obtenues (JSON).",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        sql: { type: "STRING", description: "Requete SQL Server, doit commencer par SELECT ou WITH" }
                    },
                    required: ["sql"]
                }
            }
        ]
    }
];

function toGeminiContents(messages) {
    return messages.map(function (m) {
        return {
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
        };
    });
}

async function callGemini(contents, apiKey) {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const res = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + apiKey,
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: getSystemPrompt() }] },
                    contents: contents,
                    tools: TOOLS
                })
            }
        );

        const data = await res.json();

        if (res.ok) {
            return data;
        }

        const message = (data.error && data.error.message) || "Erreur API Gemini";
        const overloaded = res.status === 503 || /high demand|overloaded|unavailable/i.test(message);

        if (overloaded && attempt < maxRetries) {
            lastError = message;
            await new Promise(function (r) { setTimeout(r, 1500 * (attempt + 1)); });
            continue;
        }

        throw new Error(message);
    }

    throw new Error(lastError || "Erreur API Gemini");
}

async function runConversation(initialMessages, apiKey) {
    let contents = toGeminiContents(initialMessages);

    for (let turn = 0; turn < 5; turn++) {
        let t0 = Date.now();
        const data = await callGemini(contents, apiKey);
        console.log(`[turn ${turn}] Gemini call took ${Date.now() - t0}ms`);

        const candidate = data.candidates && data.candidates[0];
        const parts = (candidate && candidate.content && candidate.content.parts) || [];
        const functionCallPart = parts.find(function (p) { return p.functionCall; });

        if (!functionCallPart) {
            const textParts = parts.filter(function (p) { return p.text && !p.thought; });
            if (textParts.length === 0) {
                console.log(`[turn ${turn}] AUCUN TEXTE dans la reponse Gemini:`, JSON.stringify(data).slice(0, 800));
                return "Je n'ai pas pu formuler de réponse, veuillez reformuler votre question.";
            }
            const reply = textParts.map(function (p) { return p.text; }).join("");
            console.log(`[turn ${turn}] reponse envoyee (${reply.length} chars)`);
            return reply;
        }

        contents.push({ role: "model", parts: parts });

        let responsePayload;
        t0 = Date.now();
        try {
            console.log(`[turn ${turn}] SQL query: ${functionCallPart.functionCall.args.sql}`);
            const rows = await queryDatabase(functionCallPart.functionCall.args.sql);
            responsePayload = { result: rows };
            console.log(`[turn ${turn}] SQL query took ${Date.now() - t0}ms, ${rows.length} rows`);
        } catch (err) {
            responsePayload = { error: err.message };
            console.log(`[turn ${turn}] SQL query FAILED after ${Date.now() - t0}ms: ${err.message}`);
        }

        contents.push({
            role: "user",
            parts: [{
                functionResponse: {
                    name: functionCallPart.functionCall.name,
                    response: responsePayload
                }
            }]
        });
    }

    return "Desole, je n'ai pas pu obtenir de reponse definitive.";
}

async function queryDatabase(query) {
    const trimmed = (query || "").trim();
    const upper = trimmed.toUpperCase();

    if (!/^(SELECT|WITH)\b/.test(upper)) {
        throw new Error("Seules les requetes SELECT sont autorisees.");
    }
    if (/\b(INSERT|UPDATE|DELETE|DROP|ALTER|EXEC|MERGE|TRUNCATE|GRANT|REVOKE|CREATE)\b/.test(upper)) {
        throw new Error("Requete refusee (mot-cle non autorise).");
    }

    const cached = queryCache.get(trimmed);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        console.log("[cache] resultat servi depuis le cache");
        return cached.rows;
    }

    const pool = await getPool();
    const result = await pool.request().query(trimmed);
    queryCache.set(trimmed, { rows: result.recordset, at: Date.now() });
    return result.recordset;
}

const queryCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

let poolPromise = null;

function getPool() {
    if (!poolPromise) {
        poolPromise = sql.connect({
            server: process.env.SQL_HOST || "localhost",
            port: parseInt(process.env.SQL_PORT || "1433", 10),
            database: process.env.SQL_DATABASE || "csys",
            user: process.env.SQL_USER,
            password: process.env.SQL_PASSWORD,
            options: { encrypt: true, trustServerCertificate: true },
            connectionTimeout: 15000,
            requestTimeout: 120000
        }).catch(function (err) {
            poolPromise = null;
            throw err;
        });
    }
    return poolPromise;
}

const CHAT_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Assistant IA</title>
<style>
  * { box-sizing: border-box; }
  body { margin:0; font-family: 'Segoe UI', sans-serif; background:#ffffff; display:flex; flex-direction:column; height:100vh; }
  .header { background:#0C3549; color:#fff; padding:12px 16px; font-weight:600; font-size:14px; display:flex; align-items:center; justify-content:space-between; }
  .newChat { background:transparent; border:1px solid rgba(255,255,255,.5); color:#fff; border-radius:12px; padding:3px 10px; font-size:11px; cursor:pointer; font-family:inherit; }
  .newChat:hover { background:rgba(255,255,255,.15); }
  .messages { flex:1; padding:12px; overflow-y:auto; font-size:13px; color:#252423; }
  .msg { border-radius:8px; padding:8px 10px; margin-bottom:8px; max-width:85%; word-wrap:break-word; white-space:pre-wrap; }
  .msg.bot { background:#f2f2f2; }
  .msg.user { background:#48b096; color:#fff; margin-left:auto; text-align:right; }
  .msg.error { background:#fdecea; color:#b3261e; }
  .inputRow { padding:8px 10px; border-top:1px solid #eee; display:flex; gap:6px; }
  .inputRow input { flex:1; border:1px solid #ddd; border-radius:14px; padding:8px 12px; font-size:12px; }
  .inputRow button { background:#48b096; color:#fff; border:none; border-radius:50%; width:34px; height:34px; min-width:34px; cursor:pointer; font-size:14px; display:inline-flex; align-items:center; justify-content:center; padding:0; }
  .inputRow button:disabled { opacity:0.5; cursor:default; }
  .typing { font-style:italic; color:#999; font-size:12px; padding:0 12px 8px; }
  .msg table { border-collapse:collapse; width:100%; margin:4px 0; font-size:12px; }
  .msg th, .msg td { border:1px solid #ddd; padding:4px 8px; text-align:left; }
  .msg th { background:#0C3549; color:#fff; font-weight:600; }
  .msg tr:nth-child(even) td { background:#f7f7f7; }
  .msg.bot { overflow-x:auto; }
</style>
</head>
<body>
  <div class="header">Assistant IA <button class="newChat" id="newChat" title="Effacer la conversation">&#8634; Nouveau chat</button></div>
  <div class="messages" id="messages">
    <div class="msg bot">Bonjour ! Comment puis-je vous aider avec vos donnees ?</div>
  </div>
  <div class="typing" id="typing" style="display:none;">L'assistant ecrit...</div>
  <div class="inputRow">
    <input id="input" type="text" placeholder="Ecrivez un message..." autocomplete="off">
    <button id="mic" title="Parler"><svg width="17" height="17" viewBox="0 0 24 24" fill="#fff"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z"/><path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.93V21a1 1 0 1 0 2 0v-3.07A7 7 0 0 0 19 11z"/></svg></button>
    <button id="send">&#10148;</button>
  </div>
  <script>
    var chatHistory = [];
    var messagesEl = document.getElementById('messages');
    var input = document.getElementById('input');
    var sendBtn = document.getElementById('send');
    var typingEl = document.getElementById('typing');

    var ALLOWED = /^(TABLE|THEAD|TBODY|TFOOT|TR|TH|TD|B|STRONG|EM|I|BR|UL|OL|LI|P|SPAN|DIV|H3|H4)$/;
    function sanitize(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 1) {
          if (!ALLOWED.test(c.tagName)) {
            c.parentNode.replaceChild(document.createTextNode(c.textContent), c);
            return;
          }
          Array.prototype.slice.call(c.attributes).forEach(function (a) {
            if (!/^(style|colspan|rowspan)$/i.test(a.name)) c.removeAttribute(a.name);
          });
          sanitize(c);
        }
      });
    }

    function addMessage(role, text) {
      var div = document.createElement('div');
      div.className = 'msg ' + role;
      if (role === 'bot' && /<(table|ul|ol|strong|b|br|p)/i.test(text)) {
        var tmp = document.createElement('div');
        tmp.innerHTML = text.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
        sanitize(tmp);
        div.innerHTML = tmp.innerHTML;
        div.style.whiteSpace = 'normal';
      } else {
        div.textContent = text;
      }
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function send() {
      var text = input.value.trim();
      if (!text) return;
      addMessage('user', text);
      chatHistory.push({ role: 'user', content: text });
      input.value = '';
      input.disabled = true;
      sendBtn.disabled = true;
      typingEl.style.display = 'block';

      fetch('/api/chatapi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatHistory })
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        typingEl.style.display = 'none';
        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
        if (data.error) {
          addMessage('error', 'Erreur : ' + data.error);
          return;
        }
        addMessage('bot', data.reply);
        chatHistory.push({ role: 'assistant', content: data.reply });
      })
      .catch(function (err) {
        typingEl.style.display = 'none';
        input.disabled = false;
        sendBtn.disabled = false;
        addMessage('error', 'Erreur reseau : ' + err.message);
      });
    }

    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') send();
    });

    // --- Reconnaissance vocale (parler pour poser la question) ---
    var micBtn = document.getElementById('mic');
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      micBtn.style.display = 'none';
    } else {
      var rec = new SR();
      rec.lang = 'fr-FR';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      var listening = false;
      micBtn.addEventListener('click', function () {
        if (listening) { rec.stop(); return; }
        try { rec.start(); } catch (e) {}
      });
      rec.onstart = function () { listening = true; micBtn.style.background = '#ED7373'; input.placeholder = 'Parlez...'; };
      rec.onend = function () { listening = false; micBtn.style.background = ''; input.placeholder = 'Ecrivez un message...'; };
      rec.onerror = function (e) {
        listening = false; micBtn.style.background = ''; input.placeholder = 'Ecrivez un message...';
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          addMessage('error', 'Microphone refuse. Autorisez l acces au micro dans le navigateur.');
        }
      };
      rec.onresult = function (e) {
        var t = e.results[0][0].transcript;
        input.value = t;
        send();
      };
    }

    document.getElementById('newChat').addEventListener('click', function () {
      chatHistory = [];
      messagesEl.innerHTML = '';
      addMessage('bot', 'Bonjour ! Comment puis-je vous aider avec vos donnees ?');
      typingEl.style.display = 'none';
      input.disabled = false;
      sendBtn.disabled = false;
      input.value = '';
      input.focus();
    });
  </script>
</body>
</html>`;
