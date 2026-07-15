# Chatbot IA — Dashboard Power BI "cliniqueeee"

Assistant IA qui répond avec les vraies données de la base SQL Server `csys`,
intégré dans le rapport Power BI.

## Architecture

Power BI (iframe) → Tunnel Cloudflare → Serveur Node.js (ce dossier) → SQL Server "csys" + API Google Gemini

## Fichiers

| Fichier | Rôle |
|---|---|
| `server.js` | Le cœur : interface de chat, logique IA + SQL, page portail |
| `.env` | Configuration (clé Gemini, identifiants SQL) — **CONTIENT DES SECRETS** |
| `package.json` | Librairies (express, mssql, dotenv) |
| `start-server.cmd` | Lance le serveur + le relance s'il plante |
| `start-tunnel.cmd` | Lance le tunnel Cloudflare + le relance s'il plante |
| `launcher.vbs` | Démarre les deux au démarrage de Windows (copié dans le dossier Démarrage) |

## Réinstaller / restaurer

1. Installer Node.js (https://nodejs.org) et Cloudflared (https://github.com/cloudflare/cloudflared).
2. Dans ce dossier, ouvrir un terminal et lancer : `npm install`
3. Vérifier le fichier `.env` (clé Gemini + mot de passe SQL).
4. Démarrer : `node server.js`  (le chat est sur http://localhost:3000/chatui)
5. Démarrer le tunnel : `cloudflared tunnel --url http://localhost:3000`
   → il affiche une URL publique https://xxxxx.trycloudflare.com

## Points d'entrée du serveur

- `/chatui`   → la fenêtre de chat
- `/portal`   → le rapport Power BI plein écran + chat flottant
- `/api/chatapi` → l'API interne (appelée par le chat)
- `/health`   → test de vie

## Prérequis côté base de données

- SQL Server avec un login lecture seule `chatbot_reader` (GRANT SELECT sur Client, Facture, MvtSto, Stock, FamArt, soureg, Represt)
- Port TCP fixe (1433)

## Limites connues

- Le serveur et le tunnel doivent tourner sur cette machine (allumée).
- L'URL du tunnel gratuit CHANGE à chaque redémarrage → il faut mettre à jour
  la mesure Power BI `Chatbot Widget HTML` avec la nouvelle URL.
  Pour une URL fixe : compte Cloudflare + nom de domaine (~10€/an).
- Modèle IA : Google Gemini, palier gratuit (~1000 questions/jour).
