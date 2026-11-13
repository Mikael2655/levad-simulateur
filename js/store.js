/* ============================================================
   Couche de stockage : Firestore (partagé entre postes) si une
   config Firebase est renseignée, sinon localStorage (par poste).

   Gère les COMPTES (users) et les SIMULATIONS enregistrées (sims).
   Les brouillons en cours restent locaux (voir auth.js / utils.js).

   Modèle « confort » : connexion applicative (identifiant + mot de
   passe haché) + connexion anonyme Firebase pour l'écriture.
   ============================================================ */

const Store = {
  mode: "local",
  db: null, auth: null, uid: null,
  users: [], sims: [], settings: [], // caches en mémoire (lecture synchrone)
  onUpdate: null,                // callback de rafraîchissement (temps réel)
  lastError: "",                 // raison d'un repli en local (diagnostic)

  async init() {
    if (FIREBASE_READY && typeof firebase === "undefined") {
      this.lastError = "SDK Firebase non chargé (réseau bloqué ?)";
    }
    if (FIREBASE_READY && typeof firebase !== "undefined") {
      try {
        if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
        this.db = firebase.firestore();
        this.auth = firebase.auth();
        await new Promise((resolve, reject) => {
          this.auth.onAuthStateChanged((u) => { if (u) { this.uid = u.uid; resolve(); } });
          this.auth.signInAnonymously().catch(reject);
        });
        await this._loadFirebase();   // confirme que les règles autorisent la lecture
        this.mode = "firebase";
        this._listen();
        return;
      } catch (e) {
        this.lastError = (e && (e.code || e.message)) ? (e.code || e.message) : String(e);
        console.error("Firebase indisponible, repli local :", e);
        this.mode = "local";
      }
    }
    this._loadLocal();
  },

  async _loadFirebase() {
    // users/simulations sont indispensables (toute erreur ici fait basculer en
    // local, voir init()) ; settings est tolérée en échec (ex. règles Firestore
    // pas encore republiées après l'ajout de cette collection) pour ne JAMAIS
    // priver tout le monde de comptes/simulations juste parce que ce réglage,
    // lui, n'est pas encore accessible.
    const [us, ss] = await Promise.all([
      this.db.collection("users").get(),
      this.db.collection("simulations").get(),
    ]);
    this.users = us.docs.map((d) => d.data());
    this.sims = ss.docs.map((d) => d.data());
    try {
      const cs = await this.db.collection("settings").get();
      this.settings = cs.docs.map((d) => d.data());
    } catch (e) {
      console.error("Collection 'settings' indisponible (règles Firestore à republier ?) :", e);
      this.settings = [];
    }
  },
  _loadLocal() { this.users = read(USERS_KEY); this.sims = read(SIMS_KEY); this.settings = read(SETTINGS_KEY); },

  _listen() {
    this.db.collection("users").onSnapshot((s) => {
      this.users = s.docs.map((d) => d.data());
      if (this.onUpdate) this.onUpdate();
    });
    this.db.collection("simulations").onSnapshot((s) => {
      this.sims = s.docs.map((d) => d.data());
      if (this.onUpdate) this.onUpdate();
    });
    this.db.collection("settings").onSnapshot(
      (s) => { this.settings = s.docs.map((d) => d.data()); if (this.onUpdate) this.onUpdate(); },
      (e) => console.error("Écoute 'settings' indisponible (règles Firestore à republier ?) :", e)
    );
  },

  async putUser(u) {
    upsert(this.users, u);
    if (this.mode === "firebase") await this.db.collection("users").doc(u.id).set(clone(u));
    else write(USERS_KEY, this.users);
  },
  async removeUser(id) {
    this.users = this.users.filter((x) => x.id !== id);
    if (this.mode === "firebase") await this.db.collection("users").doc(id).delete();
    else write(USERS_KEY, this.users);
  },
  async putSim(s) {
    upsert(this.sims, s);
    if (this.mode === "firebase") await this.db.collection("simulations").doc(s.id).set(clone(s));
    else write(SIMS_KEY, this.sims);
  },
  async removeSim(id) {
    this.sims = this.sims.filter((x) => x.id !== id);
    if (this.mode === "firebase") await this.db.collection("simulations").doc(id).delete();
    else write(SIMS_KEY, this.sims);
  },
  async putSetting(doc) {
    upsert(this.settings, doc);
    if (this.mode === "firebase") await this.db.collection("settings").doc(doc.id).set(clone(doc));
    else write(SETTINGS_KEY, this.settings);
  },
};

function read(k) { try { return JSON.parse(localStorage.getItem(k)) || []; } catch (e) { return []; } }
function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function upsert(arr, item) {
  const i = arr.findIndex((x) => x.id === item.id);
  if (i >= 0) arr[i] = item; else arr.unshift(item);
}
