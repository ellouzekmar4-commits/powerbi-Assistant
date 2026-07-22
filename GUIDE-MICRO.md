# 🎤 Guide — Ajouter l'entrée vocale (micro) au chatbot

Ce guide explique, étape par étape, comment ajouter le **micro** : l'utilisateur parle, l'audio est transcrit automatiquement (dans n'importe quelle langue), et le texte apparaît dans le champ de saisie. **Gratuit** — c'est Gemini qui transcrit, aucun service vocal payant.

---

## 1. Le principe (et pourquoi ce choix)

Il existe deux façons de faire parler un chatbot web :

| Approche | Problème |
|---|---|
| **Reconnaissance du navigateur** (`SpeechRecognition`) | Doit connaître la langue à l'avance (il faut un sélecteur FR/EN/AR). Ne détecte pas la langue tout seul. |
| **✅ Enregistrer l'audio → l'envoyer à Gemini** | Gemini **détecte la langue automatiquement** et transcrit n'importe quelle langue. Aucun réglage. |

On retient la **2ᵉ approche** : on enregistre la voix dans le navigateur, on l'envoie au serveur, le serveur la fait transcrire par Gemini, et on récupère le texte.

### Le flux complet
```
Clic micro 🎤
   ▼
Enregistrement (MediaRecorder)
   ▼
Arrêt automatique au silence (détection de volume)
   ▼
Conversion en WAV (dans le navigateur)
   ▼
Envoi au serveur → Gemini transcrit (détecte la langue)
   ▼
Texte affiché dans le champ de saisie (on relit puis on envoie)
```

---

## 2. Prérequis

- Le chatbot de base fonctionne déjà (voir [GUIDE.md](GUIDE.md)).
- La page est servie en **HTTPS** (obligatoire pour accéder au micro). L'URL Tailscale (`https://...ts.net`) le fait automatiquement.
- Navigateur **Chrome** ou **Edge**.

---

## 3. Côté serveur — l'endpoint de transcription

Ajoutez dans `server.js` un endpoint qui reçoit l'audio (en base64) et le fait transcrire par Gemini.

⚠️ **Important** : augmentez la limite de taille du corps de requête (l'audio est volumineux) :
```js
app.use(express.json({ limit: '25mb' }));
```

Puis l'endpoint et la fonction de transcription :
```js
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
    const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=" + apiKey,
        {
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
        }
    );
    const data = await res.json();
    if (!res.ok) throw new Error((data.error && data.error.message) || "Erreur transcription Gemini");
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    return parts.filter(p => p.text && !p.thought).map(p => p.text).join("").trim();
}
```

> Gemini accepte l'audio au format **WAV** de façon fiable. C'est pourquoi on convertit l'enregistrement en WAV côté navigateur (étape 5).

---

## 4. Côté interface — le bouton micro

Dans le HTML de la fenêtre de chat, ajoutez un bouton micro à côté du bouton d'envoi :
```html
<div class="inputRow">
  <input id="input" type="text" placeholder="Ecrivez un message...">
  <button id="mic" title="Parler">
    <svg width="17" height="17" viewBox="0 0 24 24" fill="#fff">
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z"/>
      <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.93V21a1 1 0 1 0 2 0v-3.07A7 7 0 0 0 19 11z"/>
    </svg>
  </button>
  <button id="send">&#10148;</button>
</div>
```

---

## 5. Côté interface — enregistrer, détecter le silence, convertir en WAV

Voici le script complet (à placer dans la page de chat). Il gère : démarrage/arrêt, **arrêt automatique au silence**, conversion WAV, envoi au serveur, affichage du texte.

```js
var micBtn = document.getElementById('mic');
var input = document.getElementById('input');
var sendBtn = document.getElementById('send');
var recording = false, mediaRec = null, chunks = [], micStream = null;
var vadCtx = null, vadTimer = null;

// Le navigateur supporte-t-il l'enregistrement ?
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
    micBtn.style.background = '#ED7373';       // rouge = enregistre
    input.placeholder = 'Parlez...';
    setupSilence(stream);
  }).catch(function () {
    alert('Microphone refuse. Autorisez l acces au micro.');
  });
}

// Détection de silence : arrête l'enregistrement quand on arrête de parler
function setupSilence(stream) {
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
    var rms = Math.sqrt(sum / data.length);   // volume
    var now = Date.now();
    if (rms > 0.025) { spoke = true; silenceStart = null; }      // parle
    else if (spoke) {                                             // silence après avoir parlé
      if (!silenceStart) silenceStart = now;
      else if (now - silenceStart > 1300) { stopRec(); }         // 1,3 s de silence -> stop
    }
    if (now - startTime > 20000) { stopRec(); }                  // sécurité : 20 s max
  }, 150);
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
  if (mediaRec && mediaRec.state !== 'inactive') mediaRec.stop();
}

// Quand l'enregistrement s'arrête : convertir en WAV et envoyer
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
    input.placeholder = 'Ecrivez un message...';
    if (data.error) { alert('Erreur transcription : ' + data.error); return; }
    if (data.text) { input.value = data.text; }   // texte dans le champ (pas d'envoi auto)
    input.focus();
  }).catch(function (err) {
    input.placeholder = 'Ecrivez un message...';
    alert('Erreur micro : ' + err.message);
  });
}

// Encode un AudioBuffer en WAV 16-bit mono, retourne du base64
function encodeWavBase64(audioBuf) {
  var ch = audioBuf.getChannelData(0), rate = audioBuf.sampleRate, len = ch.length;
  var buffer = new ArrayBuffer(44 + len * 2), view = new DataView(buffer);
  function ws(o, s) { for (var i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); }
  ws(0, 'RIFF'); view.setUint32(4, 36 + len * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ws(36, 'data'); view.setUint32(40, len * 2, true);
  var off = 44;
  for (var i = 0; i < len; i++) {
    var s = Math.max(-1, Math.min(1, ch[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true); off += 2;
  }
  var bytes = new Uint8Array(buffer), bin = '';
  for (var j = 0; j < bytes.length; j++) bin += String.fromCharCode(bytes[j]);
  return btoa(bin);
}
```

---

## 6. Autoriser le micro dans les iframes

Si le chat est chargé dans une iframe (portail, GitHub Pages, widget Power BI), **chaque** iframe de la chaîne doit avoir l'attribut `allow="microphone"`, sinon le navigateur bloque le micro :
```html
<iframe src="/chatui" allow="microphone"></iframe>
```

---

## 7. Comportement final

1. Clic sur 🎤 → le bouton devient **rouge**, l'enregistrement démarre.
2. Vous parlez, puis vous vous taisez → après **~1,3 s de silence**, ça s'arrête tout seul.
3. L'audio est transcrit par Gemini (langue détectée automatiquement).
4. Le texte apparaît dans le champ → vous **relisez/corrigez**, puis vous envoyez.

---

## 8. Limites

- Fonctionne sur **Chrome / Edge** (Firefox : le support MediaRecorder/AudioContext varie).
- Nécessite **HTTPS** (le micro est bloqué en HTTP simple).
- Dans le **widget intégré à Power BI**, le micro est souvent bloqué par le bac à sable de sécurité → utilisez le **portail web** (`/portal`) pour la voix.
- Petite latence (~2-4 s) : l'audio est envoyé à Gemini pour transcription.

---

*Extrait du projet chatbot Power BI. Voir [GUIDE.md](GUIDE.md) pour la construction complète.*
