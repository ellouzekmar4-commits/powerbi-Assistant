# 🤖 Chatbot IA pour Power BI — Données SQL en direct, Voix, Gratuit

Un assistant IA intégré à un tableau de bord Power BI qui répond aux questions en langage naturel en interrogeant **votre vraie base de données SQL Server en direct** — avec **entrée vocale**, réponses multilingues et une **URL permanente gratuite**.

📖 **Guide complet pas-à-pas (tout le monde peut le suivre) : [GUIDE.md](GUIDE.md)**
🎤 **Guide dédié à l'entrée vocale (micro) : [GUIDE-MICRO.md](GUIDE-MICRO.md)**

---

## Aperçu rapide

```
Utilisateur (navigateur / Power BI)
        ▼
URL publique permanente  ── Tailscale Funnel (gratuit, ne change jamais)
        ▼
Serveur Node.js local (server.js)
    ▼          ▼
SQL Server   API Google Gemini
(vos données) (génère le SQL + répond)
```

## Fonctionnalités
- 💬 Chat flottant dans Power BI + portail web complet (`/portal`)
- 📊 Vraies réponses depuis des requêtes SQL en direct (lecture seule, n'invente jamais)
- 🎤 Entrée vocale — parlez dans n'importe quelle langue, transcrit par Gemini
- 🌍 Répond dans la langue de la question
- 🆓 100% gratuit (niveau gratuit Gemini + Tailscale Funnel)
- 🔗 URL permanente qui ne change jamais

## Contenu du dépôt
| Fichier / dossier | Description |
|---|---|
| [`GUIDE.md`](GUIDE.md) | **Guide de construction complet** — commencez ici |
| `server.js` | Le serveur du chatbot (interface, logique IA+SQL, transcription vocale, portail) |
| `.env.example` | Modèle de configuration (copier vers `.env`, remplir vos valeurs) |
| `docs/` | Pages de redirection GitHub Pages (couche d'alias stable optionnelle) |
| `template/` | Copie prête à remplir pour réutiliser sur une autre base |
| `start-server.cmd`, `launcher.vbs` | Démarrage automatique au boot de Windows |

## Pour commencer
1. Lisez **[GUIDE.md](GUIDE.md)**
2. Créez un utilisateur SQL en lecture seule
3. Remplissez `.env` (connexion SQL + clé API Gemini)
4. Décrivez le schéma de votre base dans `server.js` (`SYSTEM_PROMPT`)
5. `npm install && node server.js`
6. Exposez-le avec Tailscale Funnel → URL permanente
7. Intégrez l'URL dans Power BI via le visuel "HTML Content"

## Sécurité
Le `.env` (clé API + mot de passe base) est **exclu de git** — jamais versionné. L'utilisateur base est en **lecture seule** ; le serveur n'autorise que les `SELECT`.

---


