/* ============================================================
   Comptes utilisateurs & simulations.
   Les données (comptes + simulations) transitent par `Store`
   (Firestore si configuré, sinon localStorage). La connexion et
   les brouillons en cours restent locaux au poste.
   ============================================================ */

const USERS_KEY = "levad_users_v1";
const SIMS_KEY = "levad_sims_v1";
const SETTINGS_KEY = "levad_settings_v1";
const CURRENT_KEY = "levad_current_user_v1";

async function sha256(str) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/* Lecture (cache Store, synchrone) */
function loadUsers() { return Store.users; }
function loadSims() { return Store.sims; }
function findUserByName(username) {
  const u = String(username || "").trim().toLowerCase();
  return Store.users.find((x) => x.username.toLowerCase() === u);
}
function getUserById(id) { return Store.users.find((x) => x.id === id); }

/* Crée l'administrateur (Mikael) au premier lancement. */
async function initAuth() {
  if (Store.users.length) return;
  await Store.putUser({
    id: cryptoId(), username: "Mikael", name: "Mikael", title: "",
    phone: "01 70 72 19 40", mobile: "", email: "", isAdmin: true,
    passHash: await sha256("231912"),
  });
}

/* Session (locale au poste) */
function currentUserId() { return localStorage.getItem(CURRENT_KEY) || ""; }
function setCurrentUserId(id) { if (id) localStorage.setItem(CURRENT_KEY, id); else localStorage.removeItem(CURRENT_KEY); }
function getCurrentUser() { const id = currentUserId(); return id ? getUserById(id) : null; }

async function tryLogin(username, password) {
  const u = findUserByName(username); if (!u) return null;
  if ((await sha256(password || "")) !== u.passHash) return null;
  setCurrentUserId(u.id); return u;
}
function logout() { setCurrentUserId(""); }

/* --- Administration des comptes (réservé à l'admin) --- */
async function createUser(d) {
  if (!d.username || !d.username.trim()) throw new Error("Identifiant obligatoire.");
  if (findUserByName(d.username)) throw new Error("Cet identifiant existe déjà.");
  await Store.putUser({
    id: cryptoId(), username: d.username.trim(), name: d.name || d.username.trim(),
    title: d.title || "", phone: d.phone || "", mobile: d.mobile || "", email: d.email || "",
    isAdmin: !!d.isAdmin, passHash: await sha256(d.password || "levad"),
  });
}
async function deleteUser(id) { await Store.removeUser(id); }
async function resetUserPassword(id, pw) {
  const u = getUserById(id); if (!u) return;
  u.passHash = await sha256(pw || ""); await Store.putUser(u);
}
async function updateUserProfile(id, patch) {
  const u = getUserById(id); if (!u) return;
  Object.assign(u, patch); await Store.putUser(u);
}

/* --- Taux de remise Canon (réservé admin, onglet Administration) ---
   Deux taux par gamme : "commercial" (celui réellement appliqué aux prix
   machine dans les propositions — configurateur, marge, exports) et "reel"
   (le vrai taux LEVAD, avant son propre markup, utilisé uniquement pour la
   marge réelle d'un dossier signé, onglet Marges / vue Réalité). `version`
   sert à détecter qu'un taux a changé depuis la configuration d'une machine
   (même mécanisme que tariffMonth pour une hausse de tarif Canon), afin de
   réactualiser les propositions en cours au chargement et à la signature. */
const DISCOUNT_SETTINGS_ID = "canon-discount-rates";
function defaultDiscountRates() {
  return {
    id: DISCOUNT_SETTINGS_ID,
    wifiIncluded: { commercial: 23, reel: 23 },
    optionEngine: { commercial: 47, reel: 47 },
    optionAccessory: { commercial: 45, reel: 45 },
    version: 0,
    updatedAt: "",
  };
}
function currentDiscountRates() {
  const stored = Store.settings.find((x) => x.id === DISCOUNT_SETTINGS_ID);
  return stored || defaultDiscountRates();
}
async function saveDiscountRates(patch) {
  const cur = currentDiscountRates();
  const next = {
    id: DISCOUNT_SETTINGS_ID,
    wifiIncluded: patch.wifiIncluded,
    optionEngine: patch.optionEngine,
    optionAccessory: patch.optionAccessory,
    version: (cur.version || 0) + 1,
    updatedAt: new Date().toLocaleString("fr-FR"),
  };
  await Store.putSetting(next);
  return next;
}

/* --- Brouillon en cours (par utilisateur, local au poste) --- */
function draftKey(uid) { return "levad_draft_" + uid; }
