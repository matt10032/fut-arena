# 🏆 FUT ARENA - Guide d'installation

## Étape 1 : Installer Node.js (une seule fois)

1. Va sur **https://nodejs.org**
2. Clique sur le **gros bouton vert** (version LTS)
3. Ouvre le fichier téléchargé
4. Clique **Suivant → Suivant → Suivant → Installer → Terminer**
5. C'est tout !

## Étape 2 : Lancer FUT Arena

1. Ouvre le dossier **fut-arena**
2. **Double-clique sur LANCER.bat**
3. Une fenêtre noire s'ouvre avec le message "FUT ARENA - Serveur lancé !"
4. L'adresse de ton site s'affiche (ex: `http://192.168.1.42:3000`)

## Étape 3 : Accéder au site

- **Sur ton PC** : ouvre ton navigateur → tape `http://localhost:3000`
- **Sur ton téléphone** : ouvre ton navigateur → tape l'adresse IP affichée (ex: `http://192.168.1.42:3000`)
- **Pour tes potes** : envoie-leur l'adresse IP par WhatsApp/Discord

⚠️ **IMPORTANT** : Tes potes doivent être sur le **même réseau WiFi** que toi.
Si tes potes sont chez eux (pas le même WiFi), il faut faire un "port forwarding" sur ta box internet (plus avancé).

## Étape 4 : Arrêter le serveur

- Ferme la fenêtre noire, ou appuie sur **Ctrl+C**

## FAQ

**Mes potes ne peuvent pas se connecter ?**
- Vérifie que tout le monde est sur le même WiFi
- Vérifie que ton pare-feu Windows ne bloque pas (il peut demander l'autorisation au premier lancement → clique "Autoriser")

**Le site ne marche plus après un redémarrage ?**
- Double-clique sur LANCER.bat à chaque fois que tu veux relancer le serveur
- Tes données sont sauvegardées (fichier fut-arena.db), elles ne disparaissent pas

**Comment mettre à jour le site ?**
- Remplace les fichiers et relance LANCER.bat
