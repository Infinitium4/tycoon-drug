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
