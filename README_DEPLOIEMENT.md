# Centrakor Déco Vision — version hébergeable

Cette version utilise une fonction serveur /api/generate afin que OPENAI_API_KEY ne soit jamais exposée au navigateur.

## Déploiement
1. Importer ce dépôt dans Vercel.
2. Dans Vercel → Settings → Environment Variables, créer OPENAI_API_KEY.
3. Redéployer après l'ajout de la variable.
4. Tester /api/health puis importer une photo.

GitHub Pages seul ne peut pas exécuter /api/generate. Pour la vraie génération IA, le front peut être sur GitHub Pages mais l'API doit être hébergée sur Vercel ou un autre serveur.

Ne mettez jamais la clé API dans index.html ou GitHub.