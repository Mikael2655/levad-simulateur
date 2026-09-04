/* ============================================================
   Configuration & valeurs par défaut
   ------------------------------------------------------------
   Tout est stocké côté navigateur (localStorage). Rien n'est
   envoyé sur un serveur.

   Barème « Location 2025 » (commerciaux) : coefficient TRIMESTRIEL
   par leaser (GRENKE / SOLUBAIL), durée (en trimestres) et tranche
   de montant financé. Loyer = montant financé × coefficient ÷ 100.
   L'accès admin permet de saisir un coefficient libre (override).
   ============================================================ */

const STORE_KEY = "levad_proposition_v2";
const ADMIN_KEY = "levad_proposition_admin_v1";

/* ------------------------------------------------------------
   Firebase (partage en ligne des comptes & simulations).
   Tant que ces valeurs restent des exemples « VOTRE_… », l'outil
   fonctionne en LOCAL (par poste). Pour activer le partage entre
   postes : créez un projet sur https://console.firebase.google.com,
   activez Firestore + l'authentification « Anonyme », copiez ici
   l'objet firebaseConfig de votre application Web, puis publiez les
   règles du fichier firestore.rules.
   ------------------------------------------------------------ */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDfcSakKcNujuO3ZOlLIqiVj1KpzB9Ss2s",
  authDomain: "levad-simulateur.firebaseapp.com",
  projectId: "levad-simulateur",
  storageBucket: "levad-simulateur.firebasestorage.app",
  messagingSenderId: "684104508767",
  appId: "1:684104508767:web:37f013f19184cb262d02ea",
  measurementId: "G-5QMH6D63C4",
};
const FIREBASE_READY = (function (c) {
  return !!c && !!c.apiKey && c.apiKey.indexOf("VOTRE_") !== 0
    && !!c.projectId && c.projectId.indexOf("VOTRE_") !== 0;
})(FIREBASE_CONFIG);

/* Durées proposées (en trimestres) et leur équivalent mois. */
const DURATIONS = [
  { trim: 12, mois: 36 },
  { trim: 13, mois: 39 },
  { trim: 16, mois: 48 },
  { trim: 17, mois: 51 },
  { trim: 20, mois: 60 },
  { trim: 21, mois: 63 },
];

/* Tranches de montant financé (borne haute exclue). */
const TRANCHES = [10000, 25000, Infinity]; // 0-10k / 10k-25k / +25k

/* Barème Location 2025 — coefficient trimestriel (%).
   [tranche0, tranche1, tranche2] pour chaque durée (trimestres). */
const BAREME = {
  GRENKE: {
    12: [9.85, 9.70, 9.65], 13: [9.35, 9.15, 9.05],
    16: [7.60, 7.45, 7.40], 17: [7.20, 7.10, 7.00],
    20: [6.30, 6.15, 6.10], 21: [6.05, 5.95, 5.85],
  },
  SOLUBAIL: {
    12: [10.70, 10.55, 10.45], 13: [10.15, 9.95, 9.85],
    16: [8.25, 8.15, 8.05], 17: [7.85, 7.75, 7.65],
    20: [6.85, 6.70, 6.65], 21: [6.60, 6.50, 6.40],
  },
};
const LEASERS = ["GRENKE", "SOLUBAIL"];

/* Majoration du coefficient en paiement mensuel. */
const MAJ_MENSUEL = 1.015;

/* Mot de passe admin par défaut (modifiable une fois déverrouillé). */
const DEFAULT_ADMIN_PASSWORD = "231912";

/* Coordonnées commerciales / société par défaut. */
const DEFAULT_COMPANY = {
  repName: "",
  repTitle: "Ingénieur(e) Commercial(e)",
  repPhone: "01 70 72 19 40",  // fixe par défaut
  repMobile: "",               // portable (optionnel)
  repEmail: "",                // calculé auto depuis le nom
  repEmailManual: false,       // true si saisi à la main
};

/* Libellés de services par défaut (renommables). Les 2 derniers
   sont des champs libres (libellé vide = ligne ignorée). */
function defaultServices() {
  return [
    { label: "Service Pass", sa: 0, sp: 0 },
    { label: "Abonnement service", sa: 0, sp: 0 },
    { label: "E-maintenance", sa: 0, sp: 0 },
    { label: "Recyclage", sa: 0, sp: 0 },
    { label: "Autre", sa: 0, sp: 0 },   // champ libre 1
    { label: "Autre", sa: 0, sp: 0 },   // champ libre 2
  ];
}

/* Une ligne = un remplacement (machine actuelle -> machine proposée). */
function defaultMachine() {
  return {
    id: cryptoId(),
    // ---- Situation actuelle (SA) ----
    currentModel: "",
    prospect: false,        // false = client Levad, true = prospect (concurrent)
    loyerActuel: 0,         // loyer trimestriel actuel (€)
    trimRestants: 0,        // trimestres restants sur le contrat actuel
    forfaitNB: 0, depassNB: 0, volNBreel: 0, ccNBactuel: 0,
    forfaitCoul: 0, depassCoul: 0, volCoulReel: 0, ccCoulActuel: 0,
    services: defaultServices(),
    // ---- Solution proposée (SP) ----
    proposedModel: "",
    prixMachine: 0,
    livraison: 0, portageLivraison: 0,
    retrait: 0, portageRetrait: 0,
    installation: 0,
    margeMode: "marge",     // "marge" = marge -> loyer ; "loyer" = loyer -> marge
    marge: 0,
    loyerCible: 0,          // loyer proposé saisi (par période) en mode "loyer"
    cadeaux: 0, cadeauxLabel: "",
    ccNBpropose: 0, ccCoulPropose: 0,
    spVolNB: "", spVolCoul: "",   // volumes proposés : "" = auto (facturé), sinon override
    machineConfig: null,   // { category, machine, items:[{designation,price,qty}] } — configurateur Canon
  };
}

function defaultState() {
  return {
    client: { name: "", contact: "", addr1: "", addr2: "", date: todayISO() },
    company: { ...DEFAULT_COMPANY },
    leaser: "GRENKE",
    durationTrim: 21,       // trimestres
    periodicite: "T",       // "T" = trimestre, "M" = mois
    coeffOverride: "",      // coefficient libre admin ("" = barème)
    machines: [defaultMachine()],
  };
}

function cryptoId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "m" + Math.random().toString(36).slice(2, 10);
}
function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
