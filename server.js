require('dotenv').config();
const express = require('express');
const sql = require('mssql');

const app = express();
app.use(express.json({ limit: '25mb' }));

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
  html, body { margin:0; padding:0; height:100%; overflow:hidden; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
  #report { position:fixed; inset:0; width:100%; height:100%; border:0; }

  #chatToggle {
    position:fixed; bottom:24px; right:24px; z-index:1001;
    width:64px; height:64px; border-radius:50%; border:none; cursor:pointer;
    background:linear-gradient(135deg,#6366f1 0%,#7c3aed 100%);
    box-shadow:0 6px 22px rgba(79,70,229,.45);
    display:flex; align-items:center; justify-content:center;
    transition: transform .2s ease, box-shadow .2s ease;
  }
  #chatToggle:hover { transform:scale(1.08); box-shadow:0 9px 28px rgba(79,70,229,.55); }
  #chatToggle:active { transform:scale(.95); }
  #chatToggle svg { transition: transform .35s ease; }
  #chatToggle.open svg { transform:rotate(90deg); }
  #chatToggle::after {
    content:''; position:absolute; inset:0; border-radius:50%;
    box-shadow:0 0 0 0 rgba(99,102,241,.55); animation:ring 2.6s infinite;
  }
  #chatToggle.open::after { animation:none; box-shadow:none; }
  @keyframes ring {
    0%{ box-shadow:0 0 0 0 rgba(99,102,241,.5);}
    70%{ box-shadow:0 0 0 18px rgba(99,102,241,0);}
    100%{ box-shadow:0 0 0 0 rgba(99,102,241,0);}
  }

  #chatPanel {
    position:fixed; bottom:100px; right:24px; z-index:1000;
    width:384px; height:560px; max-width:calc(100vw - 48px); max-height:calc(100vh - 140px);
    border-radius:18px; overflow:hidden; background:#fff;
    box-shadow:0 14px 50px rgba(79,70,229,.28); border:1px solid #e6e8f2;
    transform-origin: bottom right;
    opacity:0; transform: translateY(24px) scale(.92); pointer-events:none;
    transition: opacity .28s ease, transform .34s cubic-bezier(.18,.85,.25,1.05);
  }
  #chatPanel.open { opacity:1; transform:none; pointer-events:auto; }
  #chatPanel iframe { width:100%; height:100%; border:0; }
</style>
</head>
<body>
  <iframe id="report" src="${PBI_EMBED_URL}" allowfullscreen></iframe>
  <div id="chatPanel"><iframe src="/chatui" title="Assistant IA" allow="microphone"></iframe></div>
  <button id="chatToggle" title="Assistant IA" aria-label="Ouvrir l'assistant">
    <svg viewBox="0 0 24 24" width="30" height="30" fill="#ffffff">
      <path d="M12 2.2c.45 3.9 2 5.45 5.9 5.9-3.9.45-5.45 2-5.9 5.9-.45-3.9-2-5.45-5.9-5.9 3.9-.45 5.45-2 5.9-5.9z"/>
      <path d="M18.6 13.4c.25 2.05 1.1 2.9 3.15 3.15-2.05.25-2.9 1.1-3.15 3.15-.25-2.05-1.1-2.9-3.15-3.15 2.05-.25 2.9-1.1 3.15-3.15z"/>
    </svg>
  </button>
  <script>
    var panel = document.getElementById('chatPanel');
    var btn = document.getElementById('chatToggle');
    var ICON_OPEN = '<svg viewBox="0 0 24 24" width="30" height="30" fill="#ffffff"><path d="M12 2.2c.45 3.9 2 5.45 5.9 5.9-3.9.45-5.45 2-5.9 5.9-.45-3.9-2-5.45-5.9-5.9 3.9-.45 5.45-2 5.9-5.9z"/><path d="M18.6 13.4c.25 2.05 1.1 2.9 3.15 3.15-2.05.25-2.9 1.1-3.15 3.15-.25-2.05-1.1-2.9-3.15-3.15 2.05-.25 2.9-1.1 3.15-3.15z"/></svg>';
    var ICON_CLOSE = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    btn.addEventListener('click', function () {
      var open = panel.classList.toggle('open');
      btn.classList.toggle('open', open);
      btn.innerHTML = open ? ICON_CLOSE : ICON_OPEN;
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

    const model = (req.body && req.body.model) || GEMINI_MODEL;
    try {
        const reply = await runConversation(userMessages, apiKey, model);
        res.json({ reply });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/transcribe', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY non configuree" });
    const audio = req.body && req.body.audio;
    if (!audio) return res.status(400).json({ error: "audio manquant" });
    try {
        const text = await transcribeAudio(audio, apiKey);
        res.json({ text: text });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

async function transcribeAudio(b64wav, apiKey) {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + apiKey, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: "Transcris exactement ce que dit cet audio, dans sa langue d'origine (ne traduis pas). Reponds uniquement avec le texte transcrit, sans commentaire." },
                    { inline_data: { mime_type: "audio/wav", data: b64wav } }
                ]
            }]
        })
    });
    const data = await res.json();
    if (!res.ok) {
        if (res.status === 429 || /quota|resource_exhausted|rate limit/i.test((data.error && data.error.message) || "")) {
            throw new Error("La limite quotidienne gratuite est atteinte. Merci de reessayer demain. / Free daily limit reached, try again tomorrow.");
        }
        throw new Error((data.error && data.error.message) || "Erreur transcription Gemini");
    }
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const t = parts.filter(function (p) { return p.text && !p.thought; }).map(function (p) { return p.text; }).join("").trim();
    return t;
}

app.listen(PORT, () => {
    console.log(`Chatbot server listening on http://localhost:${PORT}`);
    console.log(`Chat UI: http://localhost:${PORT}/chatui`);
});

const SYSTEM_PROMPT = `Tu es l'assistant du dashboard Power BI "cliniqueeee".

REGLE DE LANGUE (PRIORITE ABSOLUE) : reponds TOUJOURS dans la langue du DERNIER message de l'utilisateur (le plus recent), et UNIQUEMENT celui-la. IGNORE completement la langue des messages precedents et du message d'accueil pour choisir ta langue. Si le dernier message est en anglais -> reponds en anglais, MEME si toute la conversation avant etait en francais. Si le dernier message est en arabe -> reponds en arabe. Si en francais -> en francais. Ne change jamais cette regle, meme pour les messages courts ou dictes a la voix. Le schema ci-dessous est en francais uniquement pour ta comprehension interne : cela ne doit PAS influencer la langue de ta reponse.

Comprends les questions dans toutes les langues (les termes metier peuvent etre exprimes dans n'importe quelle langue : "invoices"/"factures"/"فواتير" = Facture, "clients"/"customers"/"عملاء" = Client, "sales"/"ventes"/"مبيعات" = ventes, etc.). Interroge toujours la base plutot que de demander une reformulation.

Reponds de maniere concise et professionnelle.

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

async function callGemini(contents, apiKey, model) {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const res = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/" + (model || GEMINI_MODEL) + ":generateContent?key=" + apiKey,
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

        // Quota quotidien gratuit atteint
        if (res.status === 429 || /quota|resource_exhausted|rate limit/i.test(message)) {
            throw new Error("La limite quotidienne gratuite de l'assistant est atteinte. Merci de reessayer demain (la limite se reinitialise chaque jour). / The free daily limit has been reached, please try again tomorrow.");
        }

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

async function runConversation(initialMessages, apiKey, model) {
    let contents = toGeminiContents(initialMessages);

    for (let turn = 0; turn < 5; turn++) {
        let t0 = Date.now();
        const data = await callGemini(contents, apiKey, model);
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
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:linear-gradient(160deg,#f5f6fb 0%,#eceef8 100%); display:flex; flex-direction:column; height:100vh; color:#1e293b; }
  .header { background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%); color:#fff; padding:14px 18px; font-weight:600; font-size:15px; display:flex; align-items:center; justify-content:space-between; box-shadow:0 2px 12px rgba(0,0,0,.18); z-index:2; }
  .header .title { display:flex; align-items:center; gap:9px; }
  .header .dot { width:9px; height:9px; border-radius:50%; background:#5ee0b0; box-shadow:0 0 0 3px rgba(94,224,176,.3); }
  .newChat { background:rgba(255,255,255,.16); border:1px solid rgba(255,255,255,.35); color:#fff; border-radius:20px; padding:5px 13px; font-size:12px; cursor:pointer; font-family:inherit; transition:background .2s; }
  .newChat:hover { background:rgba(255,255,255,.3); }
  .messages { flex:1; padding:16px 14px; overflow-y:auto; font-size:13.5px; display:flex; flex-direction:column; gap:10px; }
  .messages::-webkit-scrollbar { width:6px; }
  .messages::-webkit-scrollbar-thumb { background:rgba(0,0,0,.15); border-radius:3px; }
  .msg { padding:10px 14px; max-width:82%; flex-shrink:0; word-wrap:break-word; white-space:pre-wrap; line-height:1.45; box-shadow:0 1px 3px rgba(0,0,0,.09); animation:pop .25s ease; }
  @keyframes pop { from{ opacity:0; transform:translateY(6px);} to{ opacity:1; transform:translateY(0);} }
  .msg.bot { background:#ffffff; color:#1f2d2b; border-radius:16px 16px 16px 4px; align-self:flex-start; overflow-x:auto; }
  .msg.user { background:linear-gradient(135deg,#6366f1,#8b5cf6); color:#fff; border-radius:16px 16px 4px 16px; align-self:flex-end; }
  .msg.error { background:#fdecec; color:#c0392b; border-radius:14px; align-self:flex-start; }
  .inputRow { padding:10px 12px; background:#fff; border-top:1px solid #e8ecec; display:flex; gap:8px; align-items:center; }
  .inputRow input { flex:1; border:1px solid #dfe5e4; border-radius:22px; padding:11px 16px; font-size:13px; outline:none; transition:border-color .2s, box-shadow .2s; background:#f6f8f8; }
  .inputRow input:focus { border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,.18); background:#fff; }
  .inputRow button { background:linear-gradient(135deg,#6366f1,#8b5cf6); color:#fff; border:none; border-radius:50%; width:40px; height:40px; min-width:40px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; padding:0; box-shadow:0 2px 6px rgba(99,102,241,.4); transition:transform .15s; }
  .inputRow button:hover:not(:disabled) { transform:scale(1.09); }
  .inputRow button:disabled { opacity:.45; cursor:default; box-shadow:none; }
  .typing { padding:4px 20px 12px; }
  .typing span { display:inline-block; width:8px; height:8px; margin-right:4px; background:#6366f1; border-radius:50%; opacity:.4; animation:blink 1.2s infinite both; }
  .typing span:nth-child(2){ animation-delay:.2s; }
  .typing span:nth-child(3){ animation-delay:.4s; }
  @keyframes blink { 0%,80%,100%{ opacity:.3; transform:translateY(0);} 40%{ opacity:1; transform:translateY(-4px);} }
  .msg table { border-collapse:collapse; width:100%; margin:6px 0; font-size:12px; border-radius:8px; overflow:hidden; }
  .msg th, .msg td { border:1px solid #e4e9e8; padding:6px 10px; text-align:left; }
  .msg th { background:#4f46e5; color:#fff; font-weight:600; }
  .msg tr:nth-child(even) td { background:#f4f7f6; }
</style>
</head>
<body>
  <div class="header"><span class="title"><span class="dot"></span>Assistant IA</span><button class="newChat" id="newChat" title="Nouvelle conversation">&#8634; Nouveau</button></div>
  <div class="messages" id="messages">
    <div class="msg bot">Bonjour&nbsp;! Comment puis-je vous aider avec vos donnees ?</div>
  </div>
  <div class="typing" id="typing" style="display:none;"><span></span><span></span><span></span></div>
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

    // --- Micro : enregistre la voix, Gemini la transcrit (toutes langues, detection auto) ---
    var micBtn = document.getElementById('mic');
    var recording = false, mediaRec = null, chunks = [], micStream = null;
    var vadCtx = null, vadTimer = null;

    if (!navigator.mediaDevices || !window.MediaRecorder) {
      micBtn.style.display = 'none';
    } else {
      micBtn.addEventListener('click', function () {
        if (recording) { stopRec(); } else { startRec(); }
      });
    }

    function startRec() {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        micStream = stream; chunks = [];
        mediaRec = new MediaRecorder(stream);
        mediaRec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
        mediaRec.onstop = handleStop;
        mediaRec.start();
        recording = true;
        micBtn.style.background = '#ED7373';
        input.placeholder = 'Parlez...';
        setupSilence(stream);
      }).catch(function () {
        addMessage('error', 'Microphone refuse. Autorisez l acces au micro.');
      });
    }

    // Detecte quand vous arretez de parler et stoppe automatiquement
    function setupSilence(stream) {
      try {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        vadCtx = new Ctx();
        var src = vadCtx.createMediaStreamSource(stream);
        var analyser = vadCtx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        var data = new Uint8Array(analyser.fftSize);
        var spoke = false, silenceStart = null, startTime = Date.now();
        vadTimer = setInterval(function () {
          analyser.getByteTimeDomainData(data);
          var sum = 0;
          for (var i = 0; i < data.length; i++) { var v = (data[i] - 128) / 128; sum += v * v; }
          var rms = Math.sqrt(sum / data.length);
          var now = Date.now();
          if (rms > 0.025) { spoke = true; silenceStart = null; }
          else if (spoke) {
            if (!silenceStart) silenceStart = now;
            else if (now - silenceStart > 1300) { stopRec(); }
          }
          if (now - startTime > 20000) { stopRec(); }
        }, 150);
      } catch (e) {}
    }

    function stopSilence() {
      if (vadTimer) { clearInterval(vadTimer); vadTimer = null; }
      if (vadCtx) { try { vadCtx.close(); } catch (e) {} vadCtx = null; }
    }

    function stopRec() {
      if (!recording) return;
      recording = false;
      stopSilence();
      micBtn.style.background = '';
      input.placeholder = 'Transcription...';
      input.disabled = true; sendBtn.disabled = true;
      if (mediaRec && mediaRec.state !== 'inactive') mediaRec.stop();
    }

    function handleStop() {
      if (micStream) micStream.getTracks().forEach(function (t) { t.stop(); });
      var blob = new Blob(chunks);
      blob.arrayBuffer().then(function (buf) {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        return new Ctx().decodeAudioData(buf);
      }).then(function (audioBuf) {
        var wavB64 = encodeWavBase64(audioBuf);
        return fetch('/api/transcribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: wavB64 })
        });
      }).then(function (r) { return r.json(); }).then(function (data) {
        input.disabled = false; sendBtn.disabled = false; input.placeholder = 'Ecrivez un message...';
        if (data.error) { addMessage('error', 'Erreur transcription : ' + data.error); return; }
        if (data.text) { input.value = data.text; }
        input.focus();
      }).catch(function (err) {
        input.disabled = false; sendBtn.disabled = false; input.placeholder = 'Ecrivez un message...';
        addMessage('error', 'Erreur micro : ' + err.message);
      });
    }

    function encodeWavBase64(audioBuf) {
      var ch = audioBuf.getChannelData(0), rate = audioBuf.sampleRate, len = ch.length;
      var buffer = new ArrayBuffer(44 + len * 2), view = new DataView(buffer);
      function ws(o, s) { for (var i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); }
      ws(0, 'RIFF'); view.setUint32(4, 36 + len * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
      ws(36, 'data'); view.setUint32(40, len * 2, true);
      var off = 44;
      for (var i = 0; i < len; i++) { var s = Math.max(-1, Math.min(1, ch[i])); view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true); off += 2; }
      var bytes = new Uint8Array(buffer), bin = '';
      for (var j = 0; j < bytes.length; j++) bin += String.fromCharCode(bytes[j]);
      return btoa(bin);
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
