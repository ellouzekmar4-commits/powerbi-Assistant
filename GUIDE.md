# 🤖 Créer votre propre chatbot IA pour un tableau de bord Power BI (Gratuit, avec Voix)

Guide complet, étape par étape, pour construire un assistant IA qui répond en langage naturel en interrogeant **votre vraie base de données SQL Server en direct** — intégré à votre rapport Power BI, avec **entrée vocale** et une **URL permanente gratuite**.

> Ce guide est générique. Il a été construit pour une clinique (base `csys`) mais fonctionne pour **n'importe quel projet SQL Server + Power BI**. Tout le monde peut le suivre.

---

## Ce que vous obtenez

- 💬 Un assistant de chat dans votre rapport Power BI (bouton flottant) **et** un portail web complet
- 📊 Des réponses construites à partir de vos **vraies données** (requêtes SQL en direct), pas inventées
- 🎤 **Entrée vocale** — parlez votre question dans n'importe quelle langue, elle est transcrite puis répondue
- 🌍 Multilingue (répond dans la langue de la question)
- 🆓 **100% gratuit** (Google Gemini niveau gratuit + tunnel d'hébergement gratuit)
- 🔗 Une **URL permanente** qui ne change jamais

## Comment ça marche (architecture)

```
Utilisateur (navigateur / Power BI)
        │
        ▼
URL publique permanente  ── Tailscale Funnel (gratuit, stable)
        │
        ▼
Serveur Node.js local  (tourne sur votre PC)
        │
   ┌────┴─────┐
   ▼          ▼
SQL Server   API Google Gemini
(vos données) (le "cerveau")
```

Le **cerveau** : Gemini reçoit la question + le schéma de votre base, génère une requête SQL, le serveur l'exécute (lecture seule), puis Gemini transforme le résultat en une réponse/tableau clair.

---

## Prérequis

- Un PC Windows avec votre base **SQL Server** et **Power BI Desktop**
- [Node.js](https://nodejs.org) (version LTS)
- Un compte gratuit [Google AI Studio](https://aistudio.google.com) (pour la clé API Gemini)
- Un compte gratuit [Tailscale](https://tailscale.com) (pour l'URL permanente)
- (Optionnel) Un compte gratuit [GitHub](https://github.com) (pour sauvegarder le code)

---

## ÉTAPE 1 — Créer un utilisateur base de données en lecture seule

Le chatbot ne doit que **lire** les données, jamais les modifier. Dans SQL Server Management Studio (ou `sqlcmd`), exécutez :

```sql
CREATE LOGIN chatbot_reader WITH PASSWORD = 'ChangezMoi_MotDePasseFort!';
USE VotreBase;
CREATE USER chatbot_reader FOR LOGIN chatbot_reader;
-- une ligne GRANT par table que le bot peut lire :
GRANT SELECT ON dbo.Table1 TO chatbot_reader;
GRANT SELECT ON dbo.Table2 TO chatbot_reader;
```

Vérifiez que SQL Server accepte l'**authentification SQL** (mode mixte) et a un **port TCP** accessible (1433 par défaut). Pour une instance nommée, fixez un port statique dans *Gestionnaire de configuration SQL Server → TCP/IP → IPAll → Port TCP = 1433*, puis redémarrez le service SQL.

---

## ÉTAPE 2 — Récupérer le code du serveur

Créez un dossier `powerbi-chatbot-server` et ajoutez les fichiers ci-dessous.

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

### `.env` (vos secrets — ne partagez JAMAIS ce fichier)
```
PORT=3000
SQL_HOST=localhost
SQL_PORT=1433
SQL_DATABASE=VotreBase
SQL_USER=chatbot_reader
SQL_PASSWORD=ChangezMoi_MotDePasseFort!
GEMINI_API_KEY=votre_cle_gemini_ici
```

Obtenez la clé Gemini sur **aistudio.google.com → Get API key → Create API key** (gratuit, sans carte bancaire).

### `server.js`
Le serveur complet, prêt à l'emploi, est dans ce dépôt (`server.js`). Il contient :
- `/chatui` — la fenêtre de chat (avec bouton micro)
- `/portal` — le rapport Power BI plein écran + chat flottant
- `/api/chatapi` — la logique IA + SQL (function calling)
- `/api/transcribe` — voix → texte via Gemini

**La seule partie que vous personnalisez est la description du schéma** (voir ÉTAPE 3).

Installez les dépendances :
```bash
npm install
```

---

## ÉTAPE 3 — Décrire VOTRE base de données (le seul vrai travail)

Dans `server.js`, modifiez le `SYSTEM_PROMPT` pour décrire vos tables, colonnes et règles métier. Exemple :

```
Schéma (lecture seule) :
- dbo.Client : CodCli, Nom (nom du client)
- dbo.Facture : numbon, codcli (-> Client.CodCli), datesys (date)
- dbo.MvtSto : numbon (-> Facture.numbon), montht (montant), typmvt ('S'=vente, 'E'=retour)

Définitions métier :
- Chiffre d'affaires = SUM(montht) WHERE typmvt='S'
- Ventes Nettes = CA - Retours (typmvt='E')

Règles :
- Toujours ajouter WITH (NOLOCK) après chaque table.
- Ne joindre que les tables nécessaires à la question.
- Requêtes SELECT uniquement, ne jamais modifier les données.
```

**Plus vous décrivez précisément le schéma, meilleures sont les réponses.** C'est la clé de la justesse.

---

## ÉTAPE 4 — Lancer et tester en local

```bash
node server.js
```
Ouvrez **http://localhost:3000/chatui** dans Chrome ou Edge. Posez une question — il doit répondre à partir de vos vraies données.

---

## ÉTAPE 5 — Rendre public avec une URL permanente gratuite (Tailscale Funnel)

Le chat doit être joignable depuis Power BI (qui le charge depuis le cloud). Tailscale Funnel fournit une **URL publique stable qui ne change jamais** — gratuit.

1. Installer Tailscale : `winget install Tailscale.Tailscale`
2. Se connecter (crée votre compte gratuit) :
   ```
   tailscale up
   ```
   (ouvrez le lien affiché, connectez-vous)
3. Activer Funnel (une seule fois, ouvrez le lien affiché) :
   ```
   tailscale funnel --bg 3000
   ```
   S'il indique *"Funnel is not enabled"*, ouvrez le lien, cliquez sur Enable, et relancez la commande.
4. Il affiche votre **URL permanente**, par exemple :
   ```
   https://votre-pc.votre-tailnet.ts.net
   ```
   Cette URL est **fixe pour toujours** et le service Tailscale démarre automatiquement avec Windows.

Testez : ouvrez `https://votre-pc.votre-tailnet.ts.net/portal` depuis n'importe quel appareil.

> **Alternative (test rapide uniquement) :** `cloudflared tunnel --url http://localhost:3000` donne une URL temporaire, mais elle **change à chaque redémarrage** — utilisez Tailscale pour la production.

---

## ÉTAPE 6 — Ajouter le chat dans Power BI

Le chatbot vit dans une mesure utilisant le visuel personnalisé gratuit **"HTML Content"** (depuis AppSource).

1. Dans Power BI Desktop, ajoutez le visuel **HTML Content** à votre page.
2. Créez une mesure (remplacez l'URL par VOTRE URL Tailscale) :

```dax
Chatbot Widget HTML =
"<div style='display:flex;justify-content:flex-end;align-items:flex-end;width:100%;height:100%;'>"
& "<details><summary style='list-style:none;width:56px;height:56px;border-radius:50%;background:#48b096;color:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.35);'>"
& UNICHAR(128172) & "</summary>"
& "<div style='width:320px;height:440px;background:#fff;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.3);margin-top:8px;overflow:hidden;'>"
& "<iframe src='https://votre-pc.votre-tailnet.ts.net/chatui' style='border:0;width:100%;height:100%;'></iframe>"
& "</div></details></div>"
```

3. Placez cette mesure dans le champ du visuel HTML Content. Un bouton flottant 💬 apparaît ; cliquer dessus ouvre le chat.
4. (Optionnel) Copiez le visuel sur chaque page pour que le chat soit toujours disponible.

> **Note :** le micro fonctionne dans le **portail web** (`/portal`), mais souvent **pas** dans le widget intégré à Power BI (le bac à sable de sécurité de Power BI bloque le microphone). Utilisez l'URL du portail pour la voix.

---

## ÉTAPE 7 (optionnel) — Démarrage automatique au boot

Créez `start-server.cmd` :
```bat
@echo off
cd /d C:\chemin\vers\powerbi-chatbot-server
:loop
node server.js
timeout /t 5 /nobreak >nul
goto loop
```
Placez un raccourci vers ce fichier (ou un lanceur `.vbs`) dans le dossier **Démarrage** de Windows (`shell:startup`). Tailscale démarre déjà automatiquement comme service.

---

## Comment fonctionne la voix

- Cliquez sur le bouton 🎤 → il enregistre votre voix.
- Il **s'arrête automatiquement** quand vous arrêtez de parler (détection de silence).
- L'audio est envoyé à Gemini, qui le **transcrit dans n'importe quelle langue** (détectée automatiquement).
- Le texte apparaît dans le champ de saisie — relisez-le, puis envoyez.

Aucun service vocal payant nécessaire — Gemini fait la transcription gratuitement.

---

## Coût

Avec le modèle **Flash-Lite** de Google Gemini (niveau gratuit : ~1000 requêtes/jour) :
- Une question type ≈ **0,001 $** (un dixième de centime) si vous étiez sur le niveau payant
- En pratique : **0 $** pour un usage normal (dans le quota quotidien gratuit)

Voir le document `Resume_Projet` pour une comparaison détaillée des modèles et des coûts (Flash-Lite vs Flash vs Pro).

---

## Notes de sécurité

- Le fichier `.env` (clé API + mot de passe base) ne doit **jamais** être versionné sur GitHub. Le `.gitignore` de ce dépôt l'exclut déjà.
- L'utilisateur base est en **lecture seule** et le serveur n'autorise que les requêtes `SELECT`.
- Ajoutez une authentification (mot de passe) sur le chat si vous exposez des données sensibles à grande échelle.

---

## Réutiliser pour un autre projet

Tout ce qui dépend de la base est à **deux endroits** : le `.env` (connexion) et la description du schéma `SYSTEM_PROMPT` dans `server.js`. Changez ces deux éléments, pointez l'iframe Power BI vers votre URL, et vous avez un chatbot pour n'importe quelle autre base. Un modèle prêt à remplir est dans le dossier `/template`.

---

## Limites

- Le PC qui héberge le serveur doit rester **allumé**.
- La voix fonctionne sur Chrome/Edge, dans le portail web (pas dans le widget intégré à Power BI).
- Le niveau gratuit de Gemini a une limite quotidienne de requêtes (généreuse pour la plupart des usages).

---

*Construit étape par étape avec Claude. Gratuit, ouvert, réutilisable.*
