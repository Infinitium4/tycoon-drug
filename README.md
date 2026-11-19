# TYCOON-DRUG

Idle tycoon multijoueur (4-6 joueurs) en 3D isométrique. Monde permanent, pas de sauvegarde : si tu quittes, tu perds tout.

## Lancer en local

```bash
cd client
npm install
npm run dev
```
Puis ouvrir http://localhost:5173

## Structure

```
client/
  src/sim/      logique du jeu pure (économie, ouvriers, camionnettes) -> partira côté serveur
  src/render/   scène Three.js (caméra iso, modèles low-poly générés en code)
  src/ui/       interface HTML (cash, labels, panneau d'amélioration)
server/         (à venir) Node + Colyseus, une room permanente de 4-6 joueurs
```

## État actuel (v0.6)
- **Base en grille** : champ (un jardinier par rangée) -> tapis -> séchoir -> tapis -> table (emballeurs à poste fixe) -> tapis -> stock ; labos au nord, voies séparées pour chariots, soldats et pick-up
- **23 produits** avec prix de rue réalistes (€/g, €/cachet, €/boîte, €/flacon) :
  - Cannabis : Shit, Beuh, Amnesia, Haze, Filtré
  - Pharmacie : Prégabaline, Lexomil, Alprazolam, Xanax, Rivotril, Sirop codéiné, Tramadol, Subutex, Méthadone, Oxycodone
  - Labo : Ecstasy, Speed, Kétamine, MDMA, Crack, Héroïne, Cocaïne, Meth
- **Police** : pression en 5 niveaux (Calme -> Perquisition imminente)
  - la BAC (voitures banalisées) tourne dans la ville, plus nombreuse quand la pression monte, et contrôle les charbonneurs (marchandise saisie)
  - les Stups perquisitionnent la base : convoi de 2 voitures + 3 agents au portail ; arranger via l'avocat ou les faire fuir avec le QG
- **Équipe** : les infos arrivent par SMS (Momo, Bilel, l'avocat, le guetteur…), bandes rivales nommées
- Montants en euros ; touche **P** = +10 000 € (test) ; `?debug` expose `game` dans la console

## Prochaines étapes
- Bases des autres joueurs (bots d'abord) visibles de l'extérieur, concurrence sur les quartiers
- Serveur Colyseus (room permanente 4-6 joueurs), la sim tourne côté serveur
- Remplacer les modèles placeholder par Kenney / Blender

## Multijoueur (v1.3)
- Double-clique sur **lancer-serveur.bat** (il faut Node.js : https://nodejs.org). La fenêtre affiche les adresses.
- Toi : le jeu s'ouvre sur `http://localhost:2567`. Tes potes sur le même wifi : `http://<ton-ip>:2567` (adresse affichée par le serveur).
- Une ville, 6 joueurs max, partie infinie. Pas de sauvegarde : si tu quittes ou si tu tombes, ta base disparaît.
- Les bases des autres sont visibles de l'extérieur. Le PC du repaire montre leurs profils et permet de payer un contrat sur leur base (vol de 15 % du cash).
- Les quartiers sont partagés : vendre au même endroit qu'un autre fait baisser les prix pour les deux. Le quartier affiche qui le domine.
- Pour jouer avec des potes hors de chez toi : ouvre le port 2567 sur ta box, ou utilise un tunnel (ex : playit.gg).

## Déployer avec Docker
Sur la machine (Docker + Docker Compose installés) :
```bash
git clone <ton-repo> && cd TYCOON-DRUG
docker compose up -d --build      # build du jeu + serveur, port 2567
docker compose logs -f            # voir les connexions
```
- Le jeu et le multijoueur sont sur le même port : ouvre `http://<ip-de-la-machine>:2567`.
- Autre port : `PORT=8080 docker compose up -d` (l'URL devient `:8080`).
- Santé : `curl http://localhost:2567/healthz`.
- Derrière un reverse proxy HTTPS (Nginx, Traefik, Caddy) : pense à laisser passer les WebSockets (`Upgrade` / `Connection`). Le jeu passe tout seul en `wss://`.
- Mise à jour : `git pull && docker compose up -d --build`.

## Sécurité du serveur
- Tailles et débits limités (8 Ko par message, ~10 messages/s, 1 état/s), connexions muettes coupées après 10 s, connexions mortes après 30 s.
- Textes nettoyés (pas de HTML), nombres bornés, issue des attaques tirée par le serveur, butin plafonné à 20 % et réclamable une seule fois.
- Variables d'environnement utiles :
  - `MAX_PER_IP=3` : connexions simultanées par IP.
  - `TRUST_PROXY=1` : derrière un reverse proxy (lit `X-Forwarded-For`).
  - `ALLOWED_ORIGINS=https://jeu.mondomaine.fr` : n'accepte que les WebSockets venant de ton domaine.
- Limite connue : l'économie tourne chez chaque joueur (le serveur ne recalcule pas l'argent). Un joueur qui modifie le code peut gonfler son propre cash ; il ne peut pas toucher à celui des autres au-delà des règles ci-dessus.

## Panneau admin (F9)
- En jeu, appuie sur **F9**. En solo il s'ouvre direct ; en ligne il demande le mot de passe, vérifié **par le serveur**.
- Sur la VM, mets le mot de passe dans un fichier `.env` à côté du `docker-compose.yml` (jamais sur GitHub) :
  ```bash
  echo "ADMIN_PASSWORD=ton-mot-de-passe" > .env
  docker compose up -d
  ```
- Sans `ADMIN_PASSWORD`, le panneau est désactivé en ligne. 5 essais par minute max, chaque connexion est loguée (`docker compose logs`).
- Le panneau : ajouter / fixer le cash, mettre un bâtiment à n'importe quel niveau, tout au niveau 25 / 50, pression à 0, tout débloquer, château + toutes les folies. La touche P (+10 k€) marche aussi une fois admin.
