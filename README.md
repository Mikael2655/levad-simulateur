# Levad — Simulateur de proposition commerciale

Disponible en ligne : **https://simulateur.levad.fr**

Outil web (sans installation, **fonctionne hors-ligne**) pour préparer une
proposition commerciale d'impression : on saisit le client et chaque machine,
l'outil calcule le comparatif **Situation Actuelle (SA)** vs **Solution
Proposée (SP)**, puis génère :

- le **fichier Excel** « SA / SP type » (étude comparative de coûts, à la mise
  en forme du modèle fourni) ;
- la **présentation PowerPoint** de l'offre (votre modèle complet de 29 slides,
  charte conservée).

Aucune donnée n'est envoyée : tout reste dans le navigateur (localStorage).

## Comptes & connexion

L'accès est protégé par **identifiant + mot de passe**. **Mikael** est
l'**administrateur** (mot de passe initial `231912`) : il crée / supprime les
utilisateurs, réinitialise leurs mots de passe, et **voit toutes les
simulations** (triées par personne puis par client). Chaque utilisateur ne voit
que **ses** simulations, peut les **archiver** (mais pas les supprimer) et ne
peut pas gérer les comptes. Le **profil** de chaque compte (nom, fonction,
téléphones, email) pré-remplit automatiquement la partie « Commercial ».

> Par défaut (sans Firebase configuré), comptes et données restent **dans le
> navigateur de chaque poste**. Une pastille indique le mode : **local (ce
> poste)** ou **synchronisé**.

### Activer le partage en ligne (Firebase)

Pour que **tous les commerciaux partagent** comptes et simulations (et que
l'admin voie tout depuis n'importe quel appareil) :

1. Créez un projet sur https://console.firebase.google.com (gratuit).
2. **Build → Firestore Database** → *Créer une base* (mode production).
3. **Build → Authentication** → *Sign-in method* → activez **Anonyme**.
4. **Paramètres du projet** → *Vos applications* → ajoutez une **application Web**
   et copiez l'objet `firebaseConfig`.
5. Collez ses valeurs dans `js/config.js` (objet `FIREBASE_CONFIG`), à la place
   des « VOTRE_… ».
6. Dans **Firestore → Règles**, collez le contenu de `firestore.rules` et publiez.

Au prochain chargement, la pastille passe à **synchronisé** et les données sont
partagées en temps réel. Tant que la config n'est pas renseignée (ou hors-ligne),
l'outil retombe automatiquement en mode local.

> Modèle « confort » : la connexion (identifiant + mot de passe) et le rôle
> admin sont gérés côté application ; Firestore n'exige qu'une connexion
> anonyme. Pour un cloisonnement infaillible au niveau de la base, il faudrait
> de vrais comptes Firebase Auth + Cloud Functions.

## Saisie

- **Plusieurs machines** : chaque ligne = un remplacement (machine actuelle →
  proposée) avec ses propres loyers, trimestres restants, volumes et coûts copie.
- **Situation actuelle** : machine, loyer, forfait N&B engagé, dépassement,
  volume réel, coût page — idem couleur ; puis les **services & abonnements**
  (Service Pass, Abonnement service/TAS, Recyclage, E-maintenance) **dont les
  libellés sont modifiables**, plus 2 champs libres. Chaque service a une valeur
  actuelle (SA) et proposée (SP).
- **Solution proposée** : machine, prix machine, installation, **livraison
  (dont portage)**, **retrait (dont portage)**, coûts copie proposés, **Cadeaux
  / autres** avec descriptif, et le **rachat calculé**. Les volumes N&B /
  couleur de la SP reprennent automatiquement le volume facturé.
- **Service & abonnements** (Service Pass, Abonnement service, Recyclage,
  E-maintenance + 2 « Autre ») affichés des **deux côtés** : libellé modifiable
  côté SA, valeur actuelle (SA) et proposée (SP).
- **Commercial** : nom, fonction, **téléphone fixe** (01 70 72 19 40 par
  défaut), **portable** (optionnel), **email calculé automatiquement**
  (1re lettre du prénom + nom complet @levad.fr, modifiable).
- **Récapitulatif par machine** : rachat total, prix machine (livraison +
  installation incluses), marge, total SA, total SP, économie/surcoût.

## Calcul

Par machine, au **trimestre** :

- **Volume facturé** (maintenance SA/SP) :
  - dépassement > 0 → `forfait + dépassement` (pages réellement imprimées) ;
  - sous-consommation (réel < forfait) → `volume réel`, mais au coût page du
    forfait engagé.
- **Rachat** : se base, lui, sur le **volume le plus élevé** des deux
  (`forfait + dépassement` vs `réel`).
- **Marge ↔ loyer** : par machine, deux modes — saisir la **marge** (l'outil
  calcule le loyer), ou saisir le **loyer proposé** (l'outil calcule la marge).
- **Rachat du contrat actuel**
  - *Client Levad* : `loyer actuel × trimestres restants`.
  - *Prospect (chez un concurrent)* : `loyer × trim × 1,10` (pénalité 10 %)
    `+ (maintenance N&B + maintenance couleur + abonnements) × trim`.
- **Montant financé** = rachat + prix machine + livraison + portages + retrait
  + installation + marge + cadeaux.
- **Loyer proposé** = `montant financé × coefficient ÷ 100`.
- **Total SA** = loyer actuel + maintenance + services actuels.
- **Total SP** = loyer proposé + coûts copie proposés + services proposés.
- **Économie annuelle** = `(Total SA − Total SP) × 4`.

### Barème & leaser (Location 2025)

Le loyer utilise le **coefficient trimestriel** du barème selon le **leaser**
(GRENKE ou SOLUBAIL), la **durée** (12 / 13 / 16 / 17 / 20 / 21 trimestres) et
la **tranche de montant financé** (0–10 k / 10–25 k / +25 k €). En **paiement
mensuel**, le coefficient est majoré de **1,5 %** (note du barème).

L'**accès admin** permet de saisir un **coefficient libre** (override du
barème) — utile pour un cas particulier. Le terme « coefficient » n'apparaît
pas dans l'interface commerciale.

### Périodicité

Un sélecteur **Trimestrielle / Mensuelle** pilote l'affichage de tous les
documents (les montants sont divisés par 3 au mois) ; le loyer proposé applique
en plus la majoration mensuelle de 1,5 %.

## Accès admin

Bouton **🔒 Accès admin** (mot de passe par défaut : `231912`, modifiable,
stocké haché). Débloque le champ coefficient libre. ⚠️ Sécurité « de confort ».

## Exports

- **Excel SA/SP** (ExcelJS) : reprend la mise en forme du modèle (titre, client,
  blocs SA / SP côte à côte, une ligne par poste — **chaque service séparé**,
  pas d'addition), total et économie annuelle. En-têtes selon la périodicité.
- **PowerPoint** : `assets/template.pptx` est votre présentation d'origine dont
  les champs dynamiques sont des jetons `{{…}}`. À l'export, le navigateur
  (JSZip) injecte les valeurs et clone une ligne de tableau par machine.
  Champs injectés :
  - **Page 1** : date ; en bas à gauche nom / fixe / portable (si saisi) /
    email ; en bas à droite adresse + `www.levad.fr` (téléphone retiré).
  - **Page 4** : date, client, machine(s) en titre, commercial (téléphone =
    fixe seul ou fixe / portable).
  - **Page 26** : tableaux SA / SP par machine (sans « soit …/mois »), unité
    selon la périodicité.
  - **Page 27** : durée et périodicité du simulateur ; références des machines
    proposées et loyers SP selon la périodicité.
  - **Page 30** : montant e-maintenance proposé (ou « Offert » si vide).
  - **Page 31** : périodicité + valeur SP, durée, coûts copie proposés ;
    signature = commercial ; cadre « bon pour accord » agrandi.

  > Régénérer le modèle : `python3 tools/prepare_template.py SOURCE.pptx assets/template.pptx`.
  > Le texte figé dans une **image** (ex. « achat » dans le petit tableau image
  > de la page 27) n'est pas modifiable par l'outil.

## Structure

```
index.html
css/style.css
js/config.js        modèle de données, barème, valeurs par défaut
js/utils.js         stockage local, téléchargement
js/calc.js          moteur de calcul SA/SP + formatage
js/export-excel.js  génération du .xlsx (ExcelJS)
js/export-pptx.js   injection dans le gabarit .pptx (JSZip)
js/app.js           interface & événements
vendor/             JSZip, ExcelJS (locaux, hors-ligne)
assets/template.pptx   votre modèle PowerPoint tokenisé
assets/catalog.json    catalogue Canon (configurateur), extrait du tarif
tools/prepare_template.py     (re)génère le gabarit PowerPoint
tools/parse_canon_catalog.py  (re)génère le catalogue Canon depuis le PDF tarifaire
sw.js, manifest.webmanifest, icon.png
CNAME                  domaine personnalisé GitHub Pages (simulateur.levad.fr)
```

## Déploiement

Site statique publié via **GitHub Pages** (Settings → Pages → Deploy from a
branch → `main` → `/ (root)`), avec le domaine personnalisé
`simulateur.levad.fr` (fichier `CNAME` à la racine + enregistrement DNS
`CNAME simulateur → mikael2655.github.io`). Chaque `git push` sur `main`
republie automatiquement le site (délai de quelques dizaines de secondes à
quelques minutes).

Ouvrez `index.html` dans un navigateur, ou ajoutez la page à l'écran d'accueil
pour l'utiliser comme une application.
