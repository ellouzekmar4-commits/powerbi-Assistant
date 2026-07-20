# Modèle réutilisable — Chatbot IA pour dashboard Power BI

Ce dossier est un **modèle générique**. Pour créer un chatbot sur une nouvelle base,
il n'y a **rien à coder** : on remplit juste 2 fichiers.

## Étapes pour une nouvelle base / un nouveau dashboard

### 1. Copier ce dossier
Copiez tout le dossier `template` ailleurs, par ex. `mon-nouveau-chatbot`.

### 2. Créer un accès SQL en lecture seule (sur la nouvelle base)
```sql
CREATE LOGIN chatbot_reader WITH PASSWORD = 'un_mot_de_passe_fort';
USE VotreBase;
CREATE USER chatbot_reader FOR LOGIN chatbot_reader;
GRANT SELECT ON dbo.Table1 TO chatbot_reader;
GRANT SELECT ON dbo.Table2 TO chatbot_reader;
-- ... une ligne par table utile
```

### 3. Remplir `.env`
Copiez `.env.example` en `.env` et renseignez :
- la connexion SQL (serveur, base, login/mot de passe ci-dessus)
- la clé Gemini (https://aistudio.google.com → Get API key)
- le nom de l'assistant
- le lien d'incorporation du rapport Power BI

### 4. Remplir `schema.txt`  ← le seul vrai travail
Copiez `schema.example.txt` en `schema.txt` et décrivez VOTRE base :
tables, colonnes, comment calculer les indicateurs, quelles jointures utiliser.
Plus c'est précis, plus l'assistant répond juste. (Un exemple réel est fourni dans le fichier.)

### 5. Installer et lancer
```
npm install
node server.js
```
- Chat : http://localhost:3000/chatui
- Portail (rapport + chat) : http://localhost:3000/portal

### 6. Rendre accessible sur Internet (gratuit)
```
cloudflared tunnel --url http://localhost:3000
```
→ donne une URL publique. (Voir le projet principal pour l'URL fixe via GitHub Pages.)

## Faire tourner PLUSIEURS chatbots en même temps
Chaque chatbot = une copie de ce dossier avec un **PORT différent** dans son `.env`
(3000, 3001, 3002...) et son propre tunnel.

## Sécurité
- Ne mettez JAMAIS `.env` ni `schema.txt` (s'il contient des infos sensibles) sur un dépôt public.
- Le login SQL doit être **lecture seule**.
