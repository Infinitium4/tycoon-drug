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
