/* ============================================================
   Application — saisie, calcul en direct, exports Excel & PPTX.
   Tout reste dans le navigateur.
   ============================================================ */

let STATE = null;
let CURRENT_USER = null;
let ADMIN = false;
let SHOW_ARCHIVED = false;
let COEFF_UNLOCKED = false;   // barème masqué tant que non déverrouillé
let CATALOG = null;           // catalogue Canon (assets/catalog.json), chargé à la demande
let CONFIG_MID = null;        // machine en cours d'édition dans le configurateur
let CONFIG_DRAFT = null;      // { category, machine, items: { [clé]: {designation,price,qty} } }
let SHOW_MARGINS = false;     // écran « Marges » (cumul par utilisateur) affiché ?
let MARGINS_USER_FILTER = ""; // admin : userId sélectionné, "" = tous
let MARGINS_MONTH = "";       // mois consulté ("YYYY-MM"), "" = mois en cours
let MANUAL_SALE_OPEN = false; // formulaire « vente en saisie libre » ouvert ?
let DATE_MODAL_SIM = "";      // id de la simulation dont on édite la date de signature

const NUM = "num", TXT = "txt";

/* -------------------- Démarrage & connexion -------------------- */
async function start() {
  const scr = document.getElementById("screen");
  if (scr) scr.innerHTML = `<section class="card"><p class="muted">Chargement…</p></section>`;
  await Store.init();
  Store.onUpdate = () => {
    if (!CURRENT_USER) return;
    if (SHOW_MARGINS) { renderMargins(); return; }
    renderSaved(); if (ADMIN) renderUsers();
  };
  await initAuth();
  await boot();
}
async function boot() {
  CURRENT_USER = getCurrentUser();
  if (CURRENT_USER) {
    ADMIN = !!CURRENT_USER.isAdmin;
    STATE = loadDraftFor(CURRENT_USER);
    renderApp();
  } else {
    renderLogin();
  }
  updateTopbar();
}

function updateTopbar() {
  const chip = document.getElementById("user-chip");
  const out = document.getElementById("logout-btn");
  const usersBtn = document.getElementById("users-btn");
  const marginsBtn = document.getElementById("margins-btn");
  if (chip) { chip.textContent = CURRENT_USER ? (CURRENT_USER.name + (CURRENT_USER.isAdmin ? " · admin" : "")) : ""; chip.hidden = !CURRENT_USER; }
  if (out) out.hidden = !CURRENT_USER;
  if (usersBtn) usersBtn.hidden = !(CURRENT_USER && ADMIN);
  if (marginsBtn) {
    marginsBtn.hidden = !CURRENT_USER;
    marginsBtn.innerHTML = SHOW_MARGINS
      ? '↩ <span class="btn-label">Simulateur</span>'
      : '📊 <span class="btn-label">Marges</span>';
  }
}
function openUsersModal() {
  const modal = document.getElementById("users-modal"); if (!modal) return;
  modal.hidden = false; renderUsers();
}
function closeUsersModal() {
  const modal = document.getElementById("users-modal"); if (!modal) return;
  modal.hidden = true;
}

/* Modale de saisie de la date de signature (calendrier + bouton « Aujourd'hui »). */
function openDateModal(simId, defaultIso) {
  DATE_MODAL_SIM = simId;
  document.getElementById("date-modal-input").value = defaultIso || todayISO();
  document.getElementById("date-modal").hidden = false;
}
function closeDateModal() {
  DATE_MODAL_SIM = "";
  document.getElementById("date-modal").hidden = true;
}

/* -------------------- Configurateur Canon -------------------- */
const DEFAULT_CFG_CATEGORY = "OFFICE - SYSTEMES D'IMPRESSION COULEUR";
const DEFAULT_CFG_MACHINE = "imageFORCE C611";
function configItemKey(section, designation) { return section + "||" + designation; }
function configTotal() {
  return Object.values(CONFIG_DRAFT.items).reduce((a, it) => a + it.price * it.qty, 0);
}
function configMachine() {
  const machines = CATALOG && CATALOG[CONFIG_DRAFT.category];
  return machines && machines.find((x) => x.name === CONFIG_DRAFT.machine);
}
function configAllItems(mach) {
  return mach ? [...mach.engine, ...mach.accessories] : [];
}
function configSectionOf(mach, item) {
  return mach && mach.engine.includes(item) ? "engine" : "accessories";
}
function configCheckedDesigs() {
  return Object.values(CONFIG_DRAFT.items).map((it) => it.designation);
}

/* Repérage « OBLIGATOIRE : … » / « INCOMPATIBILITE : … » dans le descriptif
   (texte OCR, cf. tools/parse_canon_catalog.py) pour bloquer les sélections
   incompatibles et cocher automatiquement les articles requis. */
function normDesig(s) {
  return String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ").trim();
}
function matchDesignation(phrase, allItems) {
  const np = normDesig(phrase);
  if (!np) return null;
  let best = null;
  for (const it of allItems) {
    const nd = normDesig(it.designation);
    if (nd && (nd === np || np.includes(nd) || nd.includes(np))) {
      if (!best || nd.length > normDesig(best.designation).length) best = it;
    }
  }
  return best;
}
function extractClause(description, label) {
  if (!description) return "";
  const re = new RegExp(label + "\\s*:?\\s*([\\s\\S]*?)(?=(?:OBLIGATOIRE|INCOMPATIBILITE)\\s*:|$)", "i");
  const m = description.match(re);
  return m ? m[1].trim() : "";
}
function incompatibleDesignations(description, allItems) {
  const clause = extractClause(description, "INCOMPATIBILITE");
  if (!clause) return [];
  return clause.split(/\s+ET\s+|\/|,/i).map((p) => matchDesignation(p.trim(), allItems))
    .filter(Boolean).map((it) => it.designation);
}
function obligatoireGroups(description, allItems) {
  const clause = extractClause(description, "OBLIGATOIRE").replace(/\.\s*$/, "");
  if (!clause) return [];
  const parenGroups = [...clause.matchAll(/\(([^()]*)\)/g)].map((m) => m[1]);
  const rawGroups = parenGroups.length ? parenGroups : clause.split(/\s+ET\s+/i);
  return rawGroups
    .map((g) => g.split(/\s+OU\s+/i).map((p) => matchDesignation(p.trim(), allItems)).filter(Boolean).map((it) => it.designation))
    .filter((g) => g.length);
}
async function openConfigModal(mid) {
  if (!CATALOG) {
    try { CATALOG = await (await fetch("assets/catalog.json")).json(); }
    catch (e) { alert("Impossible de charger le catalogue Canon (assets/catalog.json)."); return; }
  }
  const m = mById(mid); if (!m) return;
  CONFIG_MID = mid;
  const cfg = m.machineConfig;
  const defaultCat = CATALOG[DEFAULT_CFG_CATEGORY] ? DEFAULT_CFG_CATEGORY : Object.keys(CATALOG)[0] || "";
  CONFIG_DRAFT = { category: (cfg && cfg.category) || defaultCat, machine: (cfg && cfg.machine) || "", items: {} };
  if (cfg) (cfg.items || []).forEach((it) => {
    // la section (moteur/accessoire) n'est pas stockée par article : on la retrouve
    // en cherchant la désignation dans le catalogue de la machine sélectionnée.
    const cat = CATALOG[cfg.category] || [];
    const mach = cat.find((x) => x.name === cfg.machine);
    const section = mach && mach.engine.some((e) => e.designation === it.designation) ? "engine" : "accessories";
    CONFIG_DRAFT.items[configItemKey(section, it.designation)] = { designation: it.designation, price: it.price, qty: it.qty };
  });
  document.getElementById("config-modal").hidden = false;
  renderConfigBody();
}
function closeConfigModal() {
  const modal = document.getElementById("config-modal"); if (modal) modal.hidden = true;
  closeConfigInfo();
  CONFIG_MID = null; CONFIG_DRAFT = null;
}
function closeConfigInfo() {
  const popup = document.getElementById("cfg-info-popup"); if (popup) popup.hidden = true;
}
function configItemRow(section, it) {
  const key = configItemKey(section, it.designation);
  const sel = CONFIG_DRAFT.items[key];
  const checked = !!sel;
  const qty = sel ? sel.qty : 1;
  const infoBtn = it.description
    ? `<button type="button" class="cfg-info-btn" data-action="cfg-info" data-desig="${esc(it.designation)}" data-desc="${esc(it.description)}" title="Descriptif">ⓘ</button>`
    : "";
  return `<div class="cfg-item">
    <label class="cfg-check">
      <input type="checkbox" data-cfg="check" data-key="${esc(key)}" data-price="${it.price}" data-desig="${esc(it.designation)}" ${checked ? "checked" : ""}>
      <span>${esc(it.designation)}</span>
    </label>
    ${infoBtn}
    <span class="cfg-price">${eur(it.price)}</span>
    <input class="cfg-qty" type="number" min="1" step="1" data-cfg="qty" data-key="${esc(key)}" value="${qty}" ${checked ? "" : "disabled"}>
  </div>`;
}
function renderConfigBody() {
  const body = document.getElementById("config-body"); if (!body || !CONFIG_DRAFT) return;
  closeConfigInfo();
  const cats = Object.keys(CATALOG);
  const machines = CATALOG[CONFIG_DRAFT.category] || [];
  if (!CONFIG_DRAFT.machine && machines.length) {
    const def = machines.find((x) => x.name === DEFAULT_CFG_MACHINE);
    CONFIG_DRAFT.machine = (def || machines[0]).name;
  }
  const mach = machines.find((x) => x.name === CONFIG_DRAFT.machine);
  body.innerHTML = `
    <div class="card-head"><h2>Configurateur — Canon</h2>
      <button class="btn ghost small" data-action="close-config">✕ Fermer</button></div>
    <div class="grid">
      <label class="fld"><span>Gamme</span>
        <select id="cfg-cat">${cats.map((c) => `<option value="${esc(c)}" ${c === CONFIG_DRAFT.category ? "selected" : ""}>${esc(c.replace(/^OFFICE - /, ""))}</option>`).join("")}</select></label>
      <label class="fld"><span>Machine</span>
        <select id="cfg-machine">${machines.map((mm) => `<option value="${esc(mm.name)}" ${mm.name === CONFIG_DRAFT.machine ? "selected" : ""}>${esc(mm.name)}</option>`).join("")}</select></label>
    </div>
    <div class="cfg-top-actions">
      <button class="btn primary small" data-action="apply-config">Valider → Prix machine</button>
    </div>
    ${mach ? `
    <div class="subgrid"><h4>Moteur / solution d'impression</h4>
      <div class="cfg-list">${mach.engine.map((it) => configItemRow("engine", it)).join("") || '<span class="muted small">Aucun article.</span>'}</div>
    </div>
    <div class="subgrid"><h4>Accessoires</h4>
      <div class="cfg-list">${mach.accessories.map((it) => configItemRow("accessories", it)).join("") || '<span class="muted small">Aucun article.</span>'}</div>
    </div>` : '<p class="muted small">Aucune machine dans cette gamme.</p>'}
    <div class="cfg-total">Total sélection : <b id="cfg-total-val">${eur(configTotal())}</b></div>
    <div class="actions">
      <button class="btn primary" data-action="apply-config">Valider → Prix machine</button>
      <button class="btn ghost" data-action="close-config">Annuler</button>
    </div>`;
}

function renderLogin() {
  document.getElementById("screen").innerHTML = `
    <section class="card login-card">
      <h2>Connexion</h2>
      <div class="grid">
        <label class="fld"><span>Identifiant</span>
          <input type="text" id="login-user" autocomplete="username"></label>
        <label class="fld"><span>Mot de passe</span>
          <input type="password" id="login-pass" autocomplete="current-password"></label>
      </div>
      <div class="actions">
        <button class="btn primary" data-action="login">Se connecter</button>
        <span id="login-msg" class="status err"></span>
      </div>
      <p class="muted small">Chaque utilisateur ne voit que ses simulations. L'administrateur gère les comptes.</p>
      ${(FIREBASE_READY && Store.mode !== "firebase")
        ? `<p class="diag">⚠️ Partage en ligne inactif — raison : <b>${esc(Store.lastError || "inconnue")}</b>. Mode local pour l'instant.</p>`
        : ""}
    </section>`;
  const pass = document.getElementById("login-pass");
  if (pass) pass.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
}

async function doLogin() {
  const u = document.getElementById("login-user").value;
  const p = document.getElementById("login-pass").value;
  const user = await tryLogin(u, p);
  if (!user) { const m = document.getElementById("login-msg"); if (m) m.textContent = "Identifiant ou mot de passe incorrect."; return; }
  await boot();
}

/* Champs SA (situation actuelle) hors services — ordre demandé. */
const SA_MAIN = [
  { k: "currentModel", label: "Machine actuelle", t: TXT, wide: true },
  { k: "loyerActuel", label: "Loyer actuel / trim (€)", t: NUM },
  { k: "trimRestants", label: "Trimestres restants", t: NUM },
];
const SA_NB = [
  { k: "forfaitNB", label: "Forfait pages N&B engagé", t: NUM },
  { k: "depassNB", label: "Dépassement N&B (pages)", t: NUM },
  { k: "volNBreel", label: "Volume réel N&B (pages)", t: NUM },
  { k: "ccNBactuel", label: "Coût page N&B (€)", t: NUM },
];
const SA_COUL = [
  { k: "forfaitCoul", label: "Forfait pages couleur engagé", t: NUM },
  { k: "depassCoul", label: "Dépassement couleur (pages)", t: NUM },
  { k: "volCoulReel", label: "Volume réel couleur (pages)", t: NUM },
  { k: "ccCoulActuel", label: "Coût page couleur (€)", t: NUM },
];
/* Champs SP (solution proposée) — ordre de la maquette. */
const SP_MAIN = [
  { k: "proposedModel", label: "Machine proposée", t: TXT, wide: true },
  { k: "prixMachine", label: "Prix machine (€)", t: NUM },
  { k: "derogationMikael", label: "Dérogation Mikael, négatif (€)", t: NUM },
  { k: "installation", label: "Installation (€)", t: NUM },
  { k: "livraison", label: "Livraison (dont portage) (€)", t: NUM },
  { k: "retrait", label: "Retrait (dont portage) (€)", t: NUM },
];
const SP_CC = [
  { k: "ccNBpropose", label: "Coût page N&B proposé (€)", t: NUM },
  { k: "ccCoulPropose", label: "Coût page couleur proposé (€)", t: NUM },
];

/* -------------------- Helpers -------------------- */
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function mById(id) { return STATE.machines.find((m) => m.id === id); }
function getPath(o, p) { return p.split(".").reduce((a, k) => (a ? a[k] : undefined), o); }
function setPath(o, p, v) { const a = p.split("."); const l = a.pop(); a.reduce((x, k) => x[k], o)[l] = v; }

/* Charge le logo client depuis un fichier, le redimensionne (max 500 px de
   large) et le stocke en data URL PNG — évite de gonfler le stockage
   (localStorage / Firestore) avec une image trop lourde. */
function loadClientLogo(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 500 / img.naturalWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      STATE.client.logo = canvas.toDataURL("image/png");
      saveState(STATE);
      renderApp();
    };
    img.onerror = () => flash("Image illisible.", true);
    img.src = reader.result;
  };
  reader.onerror = () => flash("Impossible de lire le fichier.", true);
  reader.readAsDataURL(file);
}

/* Enveloppe un champ numérique en € : retire « (€) » du libellé et affiche
   le symbole € dans la case. */
function euroWrap(inp) { return `<div class="money-wrap">${inp}<span class="euro">€</span></div>`; }
function isMoney(label) { return /\(€\)/.test(label); }
function stripEuro(label) { return label.replace(/\s*\(€\)/, "").trim(); }

function mField(id, f) {
  const m = mById(id), val = m[f.k];
  const money = isMoney(f.label);
  const cls = "fld" + (f.wide ? " wide" : "") + (money ? " money" : "");
  const label = money ? stripEuro(f.label) : f.label;
  if (f.t === TXT) {
    return `<label class="${cls}"><span>${label}</span>
      <input type="text" data-scope="machine" data-mid="${id}" data-key="${f.k}" value="${esc(val)}"></label>`;
  }
  const inp = `<input type="number" step="any" inputmode="decimal" data-scope="machine" data-mid="${id}" data-key="${f.k}" value="${esc(val)}">`;
  return `<label class="${cls}"><span>${label}</span>${money ? euroWrap(inp) : inp}</label>`;
}
function topField(scope, k, label, type, extra) {
  const val = getPath(STATE, `${scope}.${k}`);
  const t = type === NUM ? 'type="number" step="any" inputmode="decimal"' : (type || 'type="text"');
  return `<label class="fld${extra ? " " + extra : ""}"><span>${label}</span>
    <input ${t} data-scope="${scope}" data-key="${k}" value="${esc(val)}"></label>`;
}

/* -------------------- Rendu principal -------------------- */
function renderApp() {
  const s = STATE;
  document.getElementById("screen").innerHTML = `
    <section class="card saved-card">
      <div class="card-head"><h2>Simulations enregistrées
        <span class="mode-chip ${Store.mode === "firebase" ? "on" : "off"}">${Store.mode === "firebase" ? "synchronisé" : "local (ce poste)"}</span></h2>
        <div class="head-actions">
          ${(FIREBASE_READY && Store.mode !== "firebase") ? `<button class="btn ghost small" data-action="retry-firebase">↻ Reconnecter</button>` : ""}
          <button class="btn ghost small" data-action="toggle-arch">${SHOW_ARCHIVED ? "Masquer les archives" : "Voir les archives"}</button>
          <button class="btn ghost small" data-action="new-sim">＋ Nouvelle</button>
          <button class="btn" data-action="save-sim">💾 Enregistrer</button>
        </div>
      </div>
      ${(FIREBASE_READY && Store.mode !== "firebase")
        ? `<p class="diag">⚠️ Partage en ligne inactif — raison : <b>${esc(Store.lastError || "inconnue")}</b>. Les données restent locales à ce poste.</p>`
        : ""}
      <div id="saved-list" class="saved"></div>
    </section>
    <section class="card">
      <h2>Client</h2>
      <div class="grid">
        ${topField("client", "name", "Nom du client / société", TXT)}
        ${topField("client", "contact", "Contact (ex. Monsieur Dupont)", TXT)}
        ${topField("client", "addr1", "Adresse", TXT)}
        ${topField("client", "addr2", "Code postal & ville", TXT)}
        ${topField("client", "date", "Date", 'type="date"')}
        ${topField("client", "phone", "Téléphone", TXT)}
        ${topField("client", "mobile", "Portable", TXT)}
        ${topField("client", "email", "Email", TXT)}
      </div>
      <div class="subgrid"><h4>Détails livraison</h4>
        <div class="grid">
          ${topField("client", "deliveryCode", "Code / interphone", TXT)}
          ${topField("client", "floor", "Étage", TXT)}
          <label class="fld chk"><input type="checkbox" data-scope="client" data-key="elevator" ${s.client.elevator ? "checked" : ""}>
            <span>Avec ascenseur</span></label>
        </div>
      </div>
      <div class="subgrid"><h4>Logo client <small>(inséré page 1 du PowerPoint)</small></h4>
        <div class="logo-row">
          ${s.client.logo ? `<img class="logo-preview" src="${esc(s.client.logo)}" alt="Logo client">` : ""}
          <input type="file" accept="image/png,image/jpeg" id="client-logo-input">
          ${s.client.logo ? `<button class="btn ghost small" data-action="remove-client-logo">✕ Retirer</button>` : ""}
        </div>
      </div>
    </section>

    <section class="card">
      <h2>Commercial</h2>
      <div class="grid">
        ${topField("company", "repName", "Nom (Prénom Nom)", TXT)}
        ${topField("company", "repTitle", "Fonction", TXT)}
        ${topField("company", "repPhone", "Téléphone fixe", TXT)}
        ${topField("company", "repMobile", "Portable (optionnel)", TXT)}
        <label class="fld"><span>Email ${s.company.repEmailManual ? "(manuel)" : "(auto)"}</span>
          <input type="text" id="rep-email" data-scope="company" data-key="repEmail"
            value="${esc(repEmail(s.company))}"></label>
      </div>
    </section>

    <section class="card">
      <h2>Financement</h2>
      <div class="grid">
        <label class="fld"><span>Leaser</span>
          <select data-scope="root" data-key="leaser">
            ${LEASERS.map((l) => `<option value="${l}" ${s.leaser === l ? "selected" : ""}>${l}</option>`).join("")}
          </select></label>
        <label class="fld"><span>Durée</span>
          <select data-scope="root" data-key="durationTrim">
            ${DURATIONS.map((d) => `<option value="${d.trim}" ${s.durationTrim == d.trim ? "selected" : ""}>${d.trim} trimestres (${d.mois} mois)</option>`).join("")}
          </select></label>
        <label class="fld"><span>Périodicité</span>
          <select data-scope="root" data-key="periodicite">
            <option value="T" ${s.periodicite === "T" ? "selected" : ""}>Trimestrielle</option>
            <option value="M" ${s.periodicite === "M" ? "selected" : ""}>Mensuelle</option>
          </select></label>
      </div>
      <div id="admin-panel"></div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Machines</h2>
        <button class="btn" data-action="add-machine">＋ Ajouter une machine</button></div>
      <div id="machines"></div>
    </section>

    <section class="card results" id="results"></section>

    <section class="card actions">
      <button class="btn primary" data-action="export-xlsx">⬇︎ Excel SA/SP</button>
      <button class="btn primary" data-action="export-pptx">⬇︎ Powerpoint Proposition commerciale</button>
      <button class="btn primary" data-action="export-pdf">⬇︎ PDF Descriptif</button>
      <button class="btn ghost" data-action="reset">Réinitialiser</button>
      <span id="status" class="status"></span>
    </section>`;
  renderMachines(); renderAdmin(); renderResults(); renderSaved();
  if (ADMIN) renderUsers();
}

function renderSaved() {
  const box = document.getElementById("saved-list"); if (!box) return;
  let list = loadSims();
  if (!ADMIN) list = list.filter((s) => s.userId === CURRENT_USER.id);
  if (!SHOW_ARCHIVED) list = list.filter((s) => !s.archived);
  // tri : nom de la personne puis nom du client
  list.sort((a, b) => (a.userName || "").localeCompare(b.userName || "") ||
    (a.clientName || a.name || "").localeCompare(b.clientName || b.name || "") ||
    (b.savedAt || "").localeCompare(a.savedAt || ""));
  if (!list.length) {
    box.innerHTML = `<span class="muted small">Aucune simulation${SHOW_ARCHIVED ? "" : " active"} enregistrée. « Enregistrer » sauvegarde la saisie en cours pour la reprendre plus tard.</span>`;
    return;
  }
  box.innerHTML = list.map((s) => {
    const owner = s.userId === CURRENT_USER.id;
    const who = ADMIN ? `<b>${esc(s.userName || "—")}</b> · ` : "";
    return `<div class="sim-row${s.archived ? " arch" : ""}">
      <span class="sim-name">${who}${esc(s.clientName || s.name || "Sans nom")}${s.archived ? ' <span class="tag">archivée</span>' : ""}${s.sold ? ' <span class="tag sold">dossier signé</span>' : ""}
        <span class="muted small">${esc(s.savedAt || "")}${s.sold ? " · signé le " + esc(dateShort(s.soldAt)) +
          ((owner || ADMIN) ? ` <button class="btn tiny ghost" data-action="edit-sold-date" data-sim="${s.id}" title="Modifier la date de signature">✎</button>` : "") : ""}</span></span>
      <span class="sim-actions">
        <button class="btn small" data-action="load-sim" data-sim="${s.id}">Charger</button>
        ${(owner || ADMIN)
          ? (s.sold
            ? `<button class="btn small ghost" data-action="unsell-sim" data-sim="${s.id}">↺ Repasser en proposition</button>`
            : `<button class="btn small" data-action="sell-sim" data-sim="${s.id}">✔ Dossier signé</button>`)
          : ""}
        ${s.archived
          ? ((owner || ADMIN) ? `<button class="btn small ghost" data-action="unarch-sim" data-sim="${s.id}">Désarchiver</button>` : "")
          : ((owner || ADMIN) ? `<button class="btn small ghost" data-action="arch-sim" data-sim="${s.id}">Archiver</button>` : "")}
        ${ADMIN ? `<button class="btn small danger" data-action="del-sim" data-sim="${s.id}">Supprimer</button>` : ""}
      </span>
    </div>`;
  }).join("");
}

/* -------------------- Marges (cumul par utilisateur) --------------------
   Une ligne par machine des simulations marquées « dossier signé »
   (les propositions non converties ne comptent pas dans les cumuls). */
const MOIS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

function periodKeys(iso) {
  const parts = String(iso || "").split("-").map(Number);
  const y = parts[0], mo = parts[1];
  if (!y || !mo) return null;
  const q = Math.ceil(mo / 3);
  return {
    month: `${y}-${String(mo).padStart(2, "0")}`, monthLabel: `${MOIS_FR[mo - 1]} ${y}`,
    quarter: `${y}-T${q}`, quarterLabel: `T${q} ${y}`,
    year: String(y), yearLabel: String(y),
  };
}

/* Construit une ligne de rapport par machine, pour les dossiers signés
   visibles par l'utilisateur courant (les siens, ou tous si admin). Inclut
   aussi les ventes saisies librement (s.manual === true). */
function marginRows() {
  let sims = loadSims().filter((s) => s.sold);
  if (!ADMIN) sims = sims.filter((s) => s.userId === CURRENT_USER.id);
  else if (MARGINS_USER_FILTER) sims = sims.filter((s) => s.userId === MARGINS_USER_FILTER);
  const rows = [];
  sims.forEach((s) => {
    if (s.manual) {
      rows.push({
        simId: s.id, userName: s.userName || "—", date: s.soldAt || "", manual: true,
        client: s.clientName || "—", type: s.prospect ? "Prospect" : "Client", machine: s.machine || "—",
        financed: num(s.financed), livraison: num(s.livraison),
        prixCession: num(s.prixCession), logistique: num(s.logistique),
        rachatLocation: num(s.rachatLocation), rachatMaintenance: num(s.rachatMaintenance),
        marge: num(s.marge),
      });
      return;
    }
    let st; try { st = normalizeState(JSON.parse(JSON.stringify(s.state))); } catch (e) { return; }
    const calc = computeAll(st);
    st.machines.forEach((m, i) => {
      const r = calc.rows[i]; if (!r) return;
      const logistique = num(m.installation) + num(m.livraison) + num(m.portageLivraison) + num(m.retrait) + num(m.portageRetrait);
      rows.push({
        simId: s.id, userName: s.userName || "—", date: s.soldAt || st.client.date || "", manual: false,
        client: st.client.name || s.clientName || "—",
        type: m.prospect ? "Prospect" : "Client",
        machine: m.proposedModel || "—",
        financed: r.financed, livraison: r.fraisLivraisonFacturer,
        prixCession: r.prixMachineEff, logistique,
        rachatLocation: r.rachatLocation, rachatMaintenance: r.rachatMaintenance,
        marge: r.margeFinale,
      });
    });
  });
  rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return rows;
}

const MARGIN_COLS = [
  ["financed", "Montant financé"], ["livraison", "Frais livraison"],
  ["prixCession", "Prix de cession"], ["logistique", "Livraison installation"],
  ["rachatLocation", "Rachat location"], ["rachatMaintenance", "Rachat maintenance"], ["marge", "Marge"],
];

function sumRows(rows) {
  const out = { count: rows.length };
  MARGIN_COLS.forEach(([k]) => { out[k] = rows.reduce((a, r) => a + r[k], 0); });
  return out;
}
function rowsInPeriod(rows, kind, key) {
  return rows.filter((r) => { const pk = periodKeys(r.date); return pk && pk[kind] === key; });
}
/* Tableau à une seule ligne (le total de la période) : le titre porte déjà
   la période, inutile de la répéter dans une colonne. */
function periodTotalTable(title, totals) {
  return `<section class="card">
    <h2>${esc(title)}</h2>
    <div class="table-wrap"><table class="margins-table">
      <thead><tr><th>Ventes</th>${MARGIN_COLS.map(([, l]) => `<th>${l}</th>`).join("")}</tr></thead>
      <tbody><tr><td>${totals.count}</td>${MARGIN_COLS.map(([k]) => `<td>${eur(totals[k])}</td>`).join("")}</tr></tbody>
    </table></div>
  </section>`;
}

function manualSaleForm() {
  return `<div class="subgrid"><h4>Nouvelle vente en saisie libre</h4>
    <p class="hint">À utiliser si un dossier a été signé sans passer par une proposition du simulateur,
      ou pour rattraper une vente d'un mois déjà écoulé.</p>
    <div class="grid">
      <label class="fld"><span>Date de la vente</span><input type="date" id="ms-date" value="${esc(todayISO())}"></label>
      <label class="fld"><span>Client</span><input type="text" id="ms-client" placeholder="Nom du client"></label>
      <label class="fld"><span>Type</span><select id="ms-type"><option value="client">Client</option><option value="prospect">Prospect</option></select></label>
      <label class="fld"><span>Machine</span><input type="text" id="ms-machine" placeholder="Référence machine"></label>
    </div>
    <div class="grid">
      ${MARGIN_COLS.map(([k, l]) => `<label class="fld money"><span>${l}</span>${euroWrap(`<input type="number" step="any" inputmode="decimal" id="ms-${k}" value="0">`)}</label>`).join("")}
    </div>
    <div class="actions">
      <button class="btn primary small" data-action="save-manual-sale">Enregistrer la vente</button>
      <button class="btn ghost small" data-action="cancel-manual-sale">Annuler</button>
    </div>
  </div>`;
}

function renderMargins() {
  const rows = marginRows();
  const userOptions = ADMIN
    ? `<label class="fld"><span>Utilisateur</span>
        <select id="margins-user-select">
          <option value="">Tous les utilisateurs</option>
          ${loadUsers().map((u) => `<option value="${u.id}" ${u.id === MARGINS_USER_FILTER ? "selected" : ""}>${esc(u.name || u.username)}</option>`).join("")}
        </select></label>`
    : "";

  // mois consulté : celui sélectionné, sinon le mois en cours par défaut.
  // Pour un commercial, ses propres ventes ; pour l'admin, celles de
  // l'utilisateur sélectionné (ou de tous par défaut).
  const now = new Date();
  const curMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const curMonth = periodKeys((MARGINS_MONTH || curMonthKey) + "-01");
  const monthRows = rowsInPeriod(rows, "month", curMonth.month);
  // cumul « à date » : les ventes du trimestre/de l'année jusqu'au mois
  // consulté inclus (pas les mois suivants, même si le trimestre/l'année
  // en contient déjà) — reproduit le total tel qu'il était à cette période.
  const quarterRows = rows.filter((r) => { const pk = periodKeys(r.date); return pk && pk.quarter === curMonth.quarter && pk.month <= curMonth.month; });
  const yearRows = rows.filter((r) => { const pk = periodKeys(r.date); return pk && pk.year === curMonth.year && pk.month <= curMonth.month; });
  const monthTotals = sumRows(monthRows);
  const hasManual = monthRows.some((r) => r.manual);
  const scopeLabel = ADMIN
    ? (MARGINS_USER_FILTER ? (loadUsers().find((u) => u.id === MARGINS_USER_FILTER) || {}).name || "" : "tous les utilisateurs")
    : "";

  // mois disponibles dans le sélecteur : toute l'année civile en cours et
  // toute l'année civile précédente (même sans vente), plus tout mois plus
  // ancien qui contiendrait déjà une vente — triés du plus récent au plus
  // ancien.
  const monthKeySet = new Set();
  [now.getFullYear(), now.getFullYear() - 1].forEach((y) => {
    for (let mo = 1; mo <= 12; mo++) monthKeySet.add(`${y}-${String(mo).padStart(2, "0")}`);
  });
  rows.forEach((r) => { const pk = periodKeys(r.date); if (pk) monthKeySet.add(pk.month); });
  const monthKeys = [...monthKeySet].sort((a, b) => b.localeCompare(a));
  const monthSelectOptions = `<label class="fld"><span>Mois consulté</span>
    <select id="margins-month-select">
      ${monthKeys.map((mk) => `<option value="${mk}" ${mk === curMonth.month ? "selected" : ""}>${esc(periodKeys(mk + "-01").monthLabel)}${mk === curMonthKey ? " (en cours)" : ""}</option>`).join("")}
    </select></label>`;

  document.getElementById("screen").innerHTML = `
    <section class="card">
      <div class="card-head"><h2>Marges — dossiers signés</h2>
        <button class="btn ghost small" data-action="close-margins">← Retour au simulateur</button></div>
      <p class="muted small">Seules les simulations marquées « dossier signé » comptent dans ces cumuls —
        une proposition non convertie ne fausse pas les totaux.</p>
      <div class="grid">${userOptions}${monthSelectOptions}</div>
      <div class="month-margin-tile">
        <span>Marge de ${esc(curMonth.monthLabel)}${scopeLabel ? " — " + esc(scopeLabel) : ""}</span>
        <b>${eur(monthTotals.marge, 0)}</b>
      </div>
      <div class="subgrid actions">
        ${MANUAL_SALE_OPEN
          ? ""
          : `<button class="btn ghost small" data-action="open-manual-sale">＋ Ajouter une vente en saisie libre</button>`}
      </div>
      ${MANUAL_SALE_OPEN ? manualSaleForm() : ""}
      ${rows.length ? "" : '<p class="muted">Aucun dossier signé enregistré pour l\'instant.</p>'}
    </section>
    ${rows.length ? `
    <section class="card">
      <h2>Détail des ventes — ${esc(curMonth.monthLabel)}</h2>
      ${monthRows.length ? `<div class="table-wrap"><table class="margins-table">
        <thead><tr>${ADMIN ? "<th>Commercial</th>" : ""}<th>Client</th><th>Type</th><th>Machine</th>
          ${MARGIN_COLS.map(([, l]) => `<th>${l}</th>`).join("")}${hasManual ? "<th></th>" : ""}</tr></thead>
        <tbody>${monthRows.map((r) => `<tr>
          ${ADMIN ? `<td>${esc(r.userName)}</td>` : ""}
          <td>${esc(r.client)}</td><td>${esc(r.type)}</td><td>${esc(r.machine)}${r.manual ? ' <span class="tag">manuel</span>' : ""}</td>
          ${MARGIN_COLS.map(([k]) => `<td>${eur(r[k])}</td>`).join("")}
          ${hasManual ? `<td>${r.manual ? `<button class="btn ghost small" data-action="del-manual-sale" data-sim="${r.simId}">✕</button>` : ""}</td>` : ""}
        </tr>`).join("")}
        <tr class="total-row"><td><b>Total</b></td>${ADMIN ? "<td></td>" : ""}<td></td><td>${monthTotals.count} vente${monthTotals.count > 1 ? "s" : ""}</td>
          ${MARGIN_COLS.map(([k]) => `<td><b>${eur(monthTotals[k])}</b></td>`).join("")}${hasManual ? "<td></td>" : ""}
        </tr></tbody>
      </table></div>` : '<p class="muted small">Aucune vente ce mois-ci.</p>'}
    </section>
    ${periodTotalTable("Cumul " + curMonth.quarterLabel, sumRows(quarterRows))}
    ${periodTotalTable("Cumul " + curMonth.yearLabel, sumRows(yearRows))}` : ""}`;
}

function renderUsers() {
  const box = document.getElementById("users-list"); if (!box) return;
  const uf = (u, k, label, extra) => `<label class="fld"><span>${label}</span>
    <input type="text" data-scope="user" data-uid="${u.id}" data-key="${k}" value="${esc(u[k] || "")}" ${extra || ""}></label>`;
  box.innerHTML = loadUsers().map((u) => `
    <div class="user-row">
      <div class="user-head"><b>${esc(u.name || u.username)}</b>
        <span class="muted small">identifiant : ${esc(u.username)}${u.isAdmin ? " · admin" : ""}${u.id === CURRENT_USER.id ? " · vous" : ""}</span></div>
      <div class="grid">
        ${uf(u, "name", "Nom affiché")}
        ${uf(u, "title", "Fonction")}
        ${uf(u, "phone", "Téléphone fixe")}
        ${uf(u, "mobile", "Portable")}
        ${uf(u, "email", "Email")}
      </div>
      <div class="sim-actions">
        <button class="btn small ghost" data-action="reset-pw" data-uid="${u.id}">Réinitialiser mot de passe</button>
        ${u.id === CURRENT_USER.id ? "" : `<button class="btn small danger" data-action="del-user" data-uid="${u.id}">Supprimer l'utilisateur</button>`}
      </div>
    </div>`).join("");
}

function renderMachines() {
  document.getElementById("machines").innerHTML = STATE.machines.map((m, i) => machineCard(m, i)).join("");
}

/* Services & abonnements — un bloc par côté. Le libellé est éditable des 2
   côtés (partagé) ; `side` = "sa" ou "sp" pour la valeur affichée. */
function svcRowsSide(m, side) {
  return `<div class="svc-grid">` + m.services.map((sv, idx) => `
    <div class="svc-item">
      <input class="svc-label" type="text" placeholder="${idx < 4 ? "Libellé" : "Autre"}"
        data-scope="svc" data-mid="${m.id}" data-idx="${idx}" data-field="label" value="${esc(sv.label)}">
      <input class="svc-val" type="number" step="any" inputmode="decimal" placeholder="€"
        data-scope="svc" data-mid="${m.id}" data-idx="${idx}" data-field="${side}" value="${esc(sv[side])}">
    </div>`).join("") + `</div>`;
}

function machineCard(m, i) {
  return `<div class="machine" data-mid="${m.id}">
    <div class="machine-head">
      <strong>Machine ${i + 1}</strong>
      <div class="machine-actions">
        <button class="btn small" data-action="dup-machine" data-mid="${m.id}">Dupliquer</button>
        <button class="btn small danger" data-action="del-machine" data-mid="${m.id}" ${STATE.machines.length <= 1 ? "disabled" : ""}>Supprimer</button>
      </div>
    </div>
    <div class="machine-cols">
      <div class="col">
        <h3>Situation actuelle</h3>
        <div class="grid">${SA_MAIN.map((f) => mField(m.id, f)).join("")}</div>
        <label class="fld chk"><input type="checkbox" data-scope="machine" data-mid="${m.id}" data-key="prospect" ${m.prospect ? "checked" : ""}>
          <span>Prospect (chez un concurrent) — sinon client Levad</span></label>
        <div class="subgrid"><h4>N&B</h4><div class="grid">${SA_NB.map((f) => mField(m.id, f)).join("")}</div></div>
        <div class="subgrid"><h4>Couleur</h4><div class="grid">${SA_COUL.map((f) => mField(m.id, f)).join("")}</div></div>
        <div class="subgrid"><h4>Service &amp; abonnements <small>(actuel)</small></h4>
          ${svcRowsSide(m, "sa")}
        </div>
      </div>
      <div class="col">
        <h3>Solution proposée</h3>
        <div class="grid">${mField(m.id, SP_MAIN[0])}</div>
        <div class="grid sp-price-row">${SP_MAIN.slice(1).map((f) => {
          const html = mField(m.id, f);
          if (f.k !== "prixMachine") return html;
          return `<div class="fld-with-btn">${html}
            <button class="btn small cfg-inline" data-action="open-config" data-mid="${m.id}">🛒 Configurateur${m.machineConfig && m.machineConfig.machine ? " — " + esc(m.machineConfig.machine) : ""}</button></div>`;
        }).join("")}</div>
        <div class="subgrid"><h4>Rachat, cadeau &amp; marge</h4>
          <div class="grid">
            <div class="fld"><span>Rachat (calculé)</span><div class="ro" id="ro-rachat-${m.id}"></div></div>
            <label class="fld money"><span>Cadeau / autre</span>
              ${euroWrap(`<input type="number" step="any" inputmode="decimal" data-scope="machine" data-mid="${m.id}" data-key="cadeaux" value="${esc(m.cadeaux)}">`)}</label>
            <label class="fld wide"><span>Descriptif cadeau / autre</span>
              <input type="text" data-scope="machine" data-mid="${m.id}" data-key="cadeauxLabel" value="${esc(m.cadeauxLabel)}"></label>
            <label class="fld"><span>Mode de calcul</span>
              <select data-scope="machine-sel" data-mid="${m.id}" data-key="margeMode">
                <option value="marge" ${m.margeMode !== "loyer" ? "selected" : ""}>Marge → loyer</option>
                <option value="loyer" ${m.margeMode === "loyer" ? "selected" : ""}>Loyer → marge</option>
              </select></label>
            ${m.margeMode === "loyer"
              ? `<label class="fld money"><span>Loyer proposé ${perShort(STATE)}</span>
                   ${euroWrap(`<input type="number" step="any" inputmode="decimal" data-scope="machine" data-mid="${m.id}" data-key="loyerCible" value="${esc(m.loyerCible)}">`)}</label>
                 <div class="fld"><span>Marge (calculée)</span><div class="ro" id="ro-calc-${m.id}"></div></div>`
              : `<label class="fld money"><span>Marge commerciale</span>
                   ${euroWrap(`<input type="number" step="any" inputmode="decimal" data-scope="machine" data-mid="${m.id}" data-key="marge" value="${esc(m.marge)}">`)}</label>
                 <div class="fld"><span>Loyer proposé (calculé) ${perShort(STATE)}</span><div class="ro" id="ro-calc-${m.id}"></div></div>`}
            ${ADMIN ? `<div class="fld"><span>Coefficient leaser</span><div class="ro" id="coeff-${m.id}"></div></div>` : ""}
          </div>
        </div>
        <div class="subgrid"><h4>Volumes proposés <small>(calcul auto · modifiables)</small></h4>
          <div class="grid">
            <label class="fld"><span>Volume N&B proposé (pages)</span>
              <input type="number" step="any" inputmode="decimal" data-scope="spvol" data-mid="${m.id}" data-key="spVolNB" id="spvol-nb-${m.id}" value="${esc(m.spVolNB)}"></label>
            <label class="fld"><span>Volume couleur proposé (pages)</span>
              <input type="number" step="any" inputmode="decimal" data-scope="spvol" data-mid="${m.id}" data-key="spVolCoul" id="spvol-coul-${m.id}" value="${esc(m.spVolCoul)}"></label>
          </div>
        </div>
        <div class="subgrid"><h4>Coûts page proposés</h4>
          <div class="grid">${SP_CC.map((f) => mField(m.id, f)).join("")}</div></div>
        <div class="subgrid"><h4>Service &amp; abonnements <small>(proposé)</small></h4>
          ${svcRowsSide(m, "sp")}
        </div>
        <div class="subgrid">
          <label class="fld money"><span>Frais de livraison à facturer</span>
            ${euroWrap(`<input type="number" step="any" inputmode="decimal" data-scope="machine" data-mid="${m.id}" data-key="fraisLivraisonFacturer" value="${esc(m.fraisLivraisonFacturer)}">`)}</label>
          <p class="hint">Facturé au client à part (hors financement), s'ajoute à la marge du dossier.</p>
        </div>
      </div>
    </div>
    <div class="machine-sum" id="msum-${m.id}"></div>
  </div>`;
}

function renderAdmin() {
  const panel = document.getElementById("admin-panel");
  if (!panel) return;
  if (!ADMIN) { panel.innerHTML = ""; return; } // coefficient masqué aux non-admin
  if (!COEFF_UNLOCKED) {
    panel.innerHTML = `<button class="btn ghost small" data-action="admin-unlock">🔒 Accès admin</button>`;
    return;
  }
  panel.innerHTML = `
    <div class="admin">
      <div class="admin-head">Réglage admin — coefficient
        <button class="btn ghost small" data-action="admin-lock">Masquer</button></div>
      <div class="grid">
        <label class="fld"><span>Valeur libre (laisser vide = barème ${esc(STATE.leaser)})</span>
          <input type="number" step="any" inputmode="decimal" data-scope="root" data-key="coeffOverride"
            value="${esc(STATE.coeffOverride)}" placeholder="barème automatique"></label>
      </div>
      <div class="admin-actions">
        <button class="btn ghost small" data-action="admin-clear-override">Revenir au barème</button>
      </div>
    </div>`;
}

function renderResults() {
  STATE.machines.forEach((m) => {
    const el = document.getElementById("msum-" + m.id); if (!el) return;
    const r = computeMachine(m, STATE), div = perDivisor(STATE);
    const roR = document.getElementById("ro-rachat-" + m.id);
    if (roR) roR.textContent = eur(r.rachat);
    const roC = document.getElementById("ro-calc-" + m.id);
    if (roC) roC.textContent = m.margeMode === "loyer" ? eur(r.margeFinale) : eur(r.spLoyerT / div);
    const coeffEl = document.getElementById("coeff-" + m.id);
    if (coeffEl) coeffEl.textContent = frNum(r.coeffT, 3) + " %";
    // volumes proposés auto : reflète la valeur calculée tant qu'il n'y a pas d'override
    const nbEl = document.getElementById("spvol-nb-" + m.id);
    if (nbEl && (m.spVolNB === "" || m.spVolNB == null) && document.activeElement !== nbEl) nbEl.value = Math.round(r.sp.volNB);
    const coulEl = document.getElementById("spvol-coul-" + m.id);
    if (coulEl && (m.spVolCoul === "" || m.spVolCoul == null) && document.activeElement !== coulEl) coulEl.value = Math.round(r.sp.volCoul);
    // ligne récap : rachat, prix machine, logistique, cadeau, marge
    const logistique = num(m.livraison) + num(m.retrait) + num(m.installation) + num(m.portageLivraison) + num(m.portageRetrait);
    el.innerHTML = `
      <span>Rachat total : <b>${eur(r.rachat)}</b></span>
      <span>Prix machine : <b>${eur(num(m.prixMachine))}</b></span>
      <span>Livraison + retrait + installation : <b>${eur(logistique)}</b></span>
      <span>Cadeau / autre : <b>${eur(r.cadeaux)}</b></span>
      <span>Marge : <b class="${r.margeFinale < 0 ? "neg" : ""}">${eur(r.margeFinale)}</b></span>`;
  });
  const res = document.getElementById("results"); if (!res) return;
  const c = computeAll(STATE), div = c.divisor, eco = c.savingYear;
  res.innerHTML = `
    <h2>Synthèse (${perAdj(STATE)})</h2>
    <div class="totals">
      <div class="tot"><span>Situation actuelle</span><b>${eur(c.saTotal / div)}</b><small>${perShort(STATE)}</small></div>
      <div class="tot"><span>Solution proposée</span><b>${eur(c.spTotal / div)}</b><small>${perShort(STATE)}</small></div>
      <div class="tot big ${eco >= 0 ? "pos" : "neg"}"><span>${eco >= 0 ? "Économie" : "Surcoût"} annuel</span>
        <b>${eur(Math.abs(eco))}</b><small>${eur(Math.abs(c.savingQuarter) / div)} ${perShort(STATE)} · ${frNum(Math.abs(c.savingPct), 1)} %</small></div>
    </div>
    <p class="muted small">Loyer proposé total : ${eur(c.spLoyerTotal / div)} ${perShort(STATE)} · Coût total de la maintenance : ${eur(c.spMaintTotal / div)} ${perShort(STATE)} · ${c.durationTrim} trimestres · ${esc(STATE.leaser)}</p>`;
}

/* -------------------- Événements -------------------- */
function commit() { saveState(STATE); renderResults(); }

document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.cfg === "qty") {
    if (CONFIG_DRAFT && CONFIG_DRAFT.items[t.dataset.key]) {
      CONFIG_DRAFT.items[t.dataset.key].qty = Math.max(1, Math.round(num(t.value)) || 1);
      const totalEl = document.getElementById("cfg-total-val");
      if (totalEl) totalEl.textContent = eur(configTotal());
    }
    return;
  }
  if (!t.dataset || !t.dataset.scope) return;
  if (t.dataset.scope === "user") return; // édité au blur (voir "change")
  const scope = t.dataset.scope, key = t.dataset.key;
  const val = t.type === "checkbox" ? t.checked : (t.type === "number" ? (t.value === "" ? 0 : num(t.value)) : t.value);
  if (scope === "machine") {
    const m = mById(t.dataset.mid); if (m) m[key] = val;
  } else if (scope === "svc") {
    const m = mById(t.dataset.mid); const sv = m.services[+t.dataset.idx];
    sv[t.dataset.field] = t.dataset.field === "label" ? t.value : (t.value === "" ? 0 : num(t.value));
    if (t.dataset.field === "label") { // libellé partagé : synchronise les 2 blocs
      document.querySelectorAll(`input.svc-label[data-mid="${t.dataset.mid}"][data-idx="${t.dataset.idx}"]`)
        .forEach((el) => { if (el !== t) el.value = t.value; });
    }
  } else if (scope === "spvol") {
    const m = mById(t.dataset.mid); if (m) m[t.dataset.key] = t.value; // "" = auto
  } else if (scope === "root") {
    STATE[key] = (key === "durationTrim") ? parseInt(t.value, 10) : t.value;
  } else if (scope === "company") {
    STATE.company[key] = val;
    if (key === "repName" && !STATE.company.repEmailManual) {
      const em = document.getElementById("rep-email"); if (em) em.value = repEmail(STATE.company);
    }
    if (key === "repEmail") STATE.company.repEmailManual = true;
  } else {
    setPath(STATE, `${scope}.${key}`, val);
  }
  commit();
});
document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "client-logo-input") {
    const file = t.files && t.files[0];
    if (file) loadClientLogo(file);
    return;
  }
  if (t.dataset && t.dataset.scope === "user") { // édition d'un profil utilisateur (au blur)
    updateUserProfile(t.dataset.uid, { [t.dataset.key]: t.value });
    if (CURRENT_USER && t.dataset.uid === CURRENT_USER.id) { CURRENT_USER[t.dataset.key] = t.value; if (t.dataset.key === "name") updateTopbar(); }
    return;
  }
  if (t.id === "margins-user-select") {
    MARGINS_USER_FILTER = t.value;
    renderMargins();
    return;
  }
  if (t.id === "margins-month-select") {
    const now = new Date();
    const curMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    MARGINS_MONTH = t.value === curMonthKey ? "" : t.value;
    renderMargins();
    return;
  }
  if (t.id === "cfg-cat" || t.id === "cfg-machine") {
    if (t.id === "cfg-cat") CONFIG_DRAFT.category = t.value; else CONFIG_DRAFT.machine = t.value;
    CONFIG_DRAFT.machine = t.id === "cfg-cat" ? "" : CONFIG_DRAFT.machine;
    CONFIG_DRAFT.items = {};
    renderConfigBody();
    return;
  }
  if (t.dataset && t.dataset.cfg === "check") {
    const key = t.dataset.key;
    const desig = t.dataset.desig;
    if (!t.checked) {
      delete CONFIG_DRAFT.items[key];
      renderConfigBody();
      return;
    }
    const mach = configMachine();
    const allItems = configAllItems(mach);
    const thisItem = allItems.find((it) => it.designation === desig);
    // incompatibilité déclarée par cet article, ou par un article déjà coché
    let conflict = thisItem ? incompatibleDesignations(thisItem.description, allItems).find((d) => configCheckedDesigs().includes(d)) : null;
    if (!conflict) {
      conflict = configCheckedDesigs().find((d) => {
        const other = allItems.find((it) => it.designation === d);
        return other && incompatibleDesignations(other.description, allItems).includes(desig);
      });
    }
    if (conflict) {
      t.checked = false;
      alert(`« ${desig} » est incompatible avec « ${conflict} », déjà sélectionné. Décochez-le d'abord si besoin.`);
      return;
    }
    CONFIG_DRAFT.items[key] = { designation: desig, price: num(t.dataset.price), qty: 1 };
    // obligatoire : un seul article requis -> coché automatiquement ; un choix entre
    // plusieurs (groupe "ou") -> seulement un message, l'utilisateur choisit lui-même
    const autoChecked = [];
    const choices = [];
    if (thisItem && mach) {
      obligatoireGroups(thisItem.description, allItems).forEach((group) => {
        if (group.some((d) => configCheckedDesigs().includes(d))) return;
        if (group.length > 1) { choices.push(group); return; }
        const pickDesig = group[0];
        const pickItem = allItems.find((it) => it.designation === pickDesig);
        if (!pickItem) return;
        const pkey = configItemKey(configSectionOf(mach, pickItem), pickDesig);
        CONFIG_DRAFT.items[pkey] = { designation: pickDesig, price: pickItem.price, qty: 1 };
        autoChecked.push(pickDesig);
      });
    }
    renderConfigBody();
    const msgs = [];
    if (autoChecked.length) msgs.push(`coché(e) automatiquement : ${autoChecked.join(", ")}`);
    choices.forEach((group) => msgs.push(`à choisir : ${group.join(" ou ")}`));
    if (msgs.length) alert(`Obligatoire avec « ${desig} » — ${msgs.join(" · ")}.`);
    return;
  }
  if (t.tagName !== "SELECT") return;
  if (t.dataset.scope === "root") {
    STATE[t.dataset.key] = t.dataset.key === "durationTrim" ? parseInt(t.value, 10) : t.value;
    saveState(STATE);
    if (t.dataset.key === "leaser") renderAdmin();
    renderMachines(); renderResults(); // périodicité/leaser : rafraîchit les libellés
  } else if (t.dataset.scope === "machine-sel") {
    const m = mById(t.dataset.mid); if (m) m[t.dataset.key] = t.value;
    saveState(STATE); renderMachines(); renderResults(); // bascule marge/loyer
  }
});


document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]"); if (!btn) return;
  const a = btn.dataset.action, mid = btn.dataset.mid;
  switch (a) {
    case "add-machine": STATE.machines.push(defaultMachine()); saveState(STATE); renderMachines(); renderResults(); break;
    case "dup-machine": {
      const src = mById(mid); const copy = JSON.parse(JSON.stringify(src)); copy.id = cryptoId();
      STATE.machines.splice(STATE.machines.indexOf(src) + 1, 0, copy);
      saveState(STATE); renderMachines(); renderResults(); break;
    }
    case "del-machine":
      if (STATE.machines.length <= 1) break;
      STATE.machines = STATE.machines.filter((x) => x.id !== mid);
      saveState(STATE); renderMachines(); renderResults(); break;
    case "reset":
      if (confirm("Réinitialiser toute la saisie ?")) { STATE = defaultState(); saveState(STATE); renderApp(); } break;
    case "export-xlsx":
      try { await exportExcel(STATE, computeAll(STATE)); flash("Excel généré."); }
      catch (err) { flash("Erreur Excel : " + err.message, true); console.error(err); } break;
    case "export-pptx":
      flash("Génération du PowerPoint…");
      try { await exportPptx(STATE, computeAll(STATE)); flash("PowerPoint généré."); }
      catch (err) { flash("Erreur PowerPoint : " + err.message, true); console.error(err); } break;
    case "export-pdf":
      try { await exportPdf(STATE, computeAll(STATE)); flash("PDF généré."); }
      catch (err) { flash("Erreur PDF : " + err.message, true); console.error(err); } break;
    case "admin-unlock": COEFF_UNLOCKED = true; renderAdmin(); break;
    case "admin-lock": COEFF_UNLOCKED = false; renderAdmin(); break;
    case "admin-clear-override": STATE.coeffOverride = ""; saveState(STATE); renderAdmin(); renderResults(); break;
    case "retry-firebase": location.reload(); break;
    case "open-users": if (ADMIN) openUsersModal(); break;
    case "toggle-margins":
      SHOW_MARGINS = !SHOW_MARGINS;
      if (SHOW_MARGINS) renderMargins(); else renderApp();
      updateTopbar();
      window.scrollTo(0, 0);
      break;
    case "close-margins":
      SHOW_MARGINS = false; renderApp(); updateTopbar();
      window.scrollTo(0, 0);
      break;
    case "close-users": closeUsersModal(); break;
    case "open-config": await openConfigModal(mid); break;
    case "close-config": closeConfigModal(); break;
    case "cfg-info": {
      const popup = document.getElementById("cfg-info-popup");
      document.getElementById("cfg-info-text").innerHTML = `<b>${esc(btn.dataset.desig)}</b><br>${esc(btn.dataset.desc)}`;
      popup.hidden = false;
      const r = btn.getBoundingClientRect();
      popup.style.left = Math.max(8, Math.min(r.left, window.innerWidth - popup.offsetWidth - 8)) + "px";
      popup.style.top = Math.min(r.bottom + 6, window.innerHeight - popup.offsetHeight - 8) + "px";
      break;
    }
    case "close-cfg-info": closeConfigInfo(); break;
    case "apply-config": {
      const m = mById(CONFIG_MID); if (!m || !CONFIG_DRAFT) break;
      const items = Object.values(CONFIG_DRAFT.items);
      m.machineConfig = { category: CONFIG_DRAFT.category, machine: CONFIG_DRAFT.machine, items };
      m.prixMachine = configTotal();
      saveState(STATE); closeConfigModal(); renderMachines(); renderResults();
      flash("Prix machine mis à jour depuis le configurateur.");
      break;
    }
    case "remove-client-logo": STATE.client.logo = ""; saveState(STATE); renderApp(); break;
    case "login": await doLogin(); break;
    case "logout": logout(); CURRENT_USER = null; ADMIN = false; STATE = null; renderLogin(); updateTopbar(); break;
    case "new-sim": {
      if (!confirm("Démarrer une nouvelle simulation vierge ? (la saisie en cours non enregistrée sera perdue)")) break;
      const fresh = defaultState();
      fresh.company = {
        ...fresh.company, repName: CURRENT_USER.name || "", repTitle: CURRENT_USER.title || "",
        repPhone: CURRENT_USER.phone || "01 70 72 19 40", repMobile: CURRENT_USER.mobile || "",
        repEmail: CURRENT_USER.email || "", repEmailManual: !!CURRENT_USER.email,
      };
      STATE = fresh; saveState(STATE); renderApp(); flash("Nouvelle simulation.");
      break;
    }
    case "toggle-arch": SHOW_ARCHIVED = !SHOW_ARCHIVED; renderApp(); break;
    case "save-sim": {
      const def = ((STATE.client.name || "Simulation") + " — " + dateShort(STATE.client.date || todayISO()));
      const name = prompt("Nom de la simulation :", def); if (!name) break;
      const existing = loadSims().find((x) => x.userId === CURRENT_USER.id && x.name === name);
      const snap = {
        id: existing ? existing.id : cryptoId(),
        userId: CURRENT_USER.id, userName: CURRENT_USER.name,
        name, clientName: STATE.client.name || "", savedAt: new Date().toLocaleString("fr-FR"),
        archived: existing ? !!existing.archived : false,
        state: JSON.parse(JSON.stringify(STATE)),
      };
      await Store.putSim(snap); renderSaved(); flash("Simulation enregistrée.");
      break;
    }
    case "load-sim": {
      const s = loadSims().find((x) => x.id === btn.dataset.sim); if (!s) break;
      if (!ADMIN && s.userId !== CURRENT_USER.id) break;
      STATE = normalizeState(JSON.parse(JSON.stringify(s.state)));
      saveState(STATE); renderApp(); flash("Simulation chargée.");
      break;
    }
    case "arch-sim": case "unarch-sim": {
      const s = loadSims().find((x) => x.id === btn.dataset.sim); if (!s) break;
      if (!ADMIN && s.userId !== CURRENT_USER.id) break;
      s.archived = (a === "arch-sim"); await Store.putSim(s); renderSaved();
      break;
    }
    case "open-manual-sale": MANUAL_SALE_OPEN = true; renderMargins(); break;
    case "cancel-manual-sale": MANUAL_SALE_OPEN = false; renderMargins(); break;
    case "save-manual-sale": {
      const val = (id) => document.getElementById(id).value;
      const client = val("ms-client").trim();
      if (!client) { alert("Le nom du client est obligatoire."); break; }
      const sale = {
        id: cryptoId(), userId: CURRENT_USER.id, userName: CURRENT_USER.name,
        manual: true, sold: true, soldAt: val("ms-date") || todayISO(),
        clientName: client, prospect: val("ms-type") === "prospect", machine: val("ms-machine").trim(),
      };
      MARGIN_COLS.forEach(([k]) => { sale[k] = num(val("ms-" + k)); });
      await Store.putSim(sale);
      MANUAL_SALE_OPEN = false;
      renderMargins();
      flash("Vente ajoutée.");
      break;
    }
    case "del-manual-sale": {
      const s = loadSims().find((x) => x.id === btn.dataset.sim); if (!s) break;
      if (!ADMIN && s.userId !== CURRENT_USER.id) break;
      if (!confirm("Supprimer cette vente saisie manuellement ?")) break;
      await Store.removeSim(s.id);
      renderMargins();
      break;
    }
    case "sell-sim": case "edit-sold-date": {
      const s = loadSims().find((x) => x.id === btn.dataset.sim); if (!s) break;
      if (!ADMIN && s.userId !== CURRENT_USER.id) break;
      const defaultDate = s.soldAt || (s.state && s.state.client && s.state.client.date) || todayISO();
      openDateModal(s.id, defaultDate);
      break;
    }
    case "unsell-sim": {
      const s = loadSims().find((x) => x.id === btn.dataset.sim); if (!s) break;
      if (!ADMIN && s.userId !== CURRENT_USER.id) break;
      s.sold = false;
      await Store.putSim(s); renderSaved();
      flash("Repassée en proposition.");
      break;
    }
    case "date-modal-today":
      document.getElementById("date-modal-input").value = todayISO();
      break;
    case "date-modal-cancel":
      closeDateModal();
      break;
    case "date-modal-confirm": {
      const iso = document.getElementById("date-modal-input").value;
      if (!iso) { alert("Merci de choisir une date."); break; }
      const s = loadSims().find((x) => x.id === DATE_MODAL_SIM);
      if (s && (ADMIN || s.userId === CURRENT_USER.id)) {
        s.sold = true; s.soldAt = iso;
        await Store.putSim(s);
      }
      closeDateModal();
      renderSaved();
      flash("Date de signature enregistrée.");
      break;
    }
    case "del-sim": {
      if (!ADMIN) break;
      if (!confirm("Supprimer définitivement cette simulation ?")) break;
      await Store.removeSim(btn.dataset.sim); renderSaved();
      break;
    }
    case "add-user": {
      if (!ADMIN) break;
      const username = prompt("Identifiant (pour se connecter) :"); if (!username) break;
      const name = prompt("Nom affiché :", username) || username;
      const pw = prompt("Mot de passe initial :"); if (!pw) break;
      const title = prompt("Fonction (optionnel) :", "Ingénieur(e) Commercial(e)") || "";
      const phone = prompt("Téléphone fixe :", "01 70 72 19 40") || "";
      const mobile = prompt("Portable (optionnel) :", "") || "";
      const email = prompt("Email (vide = auto prénom+nom) :", "") || "";
      try { await createUser({ username, name, title, phone, mobile, email, password: pw, isAdmin: false });
        renderUsers(); flash("Utilisateur créé."); }
      catch (err) { alert(err.message); }
      break;
    }
    case "del-user": {
      if (!ADMIN) break;
      const u = getUserById(btn.dataset.uid); if (!u) break;
      if (!confirm(`Supprimer l'utilisateur « ${u.name} » ?`)) break;
      deleteUser(u.id); renderUsers();
      break;
    }
    case "reset-pw": {
      if (!ADMIN) break;
      const u = getUserById(btn.dataset.uid); if (!u) break;
      const pw = prompt(`Nouveau mot de passe pour « ${u.name} » :`); if (!pw) break;
      await resetUserPassword(u.id, pw); flash("Mot de passe réinitialisé.");
      break;
    }
  }
});
document.addEventListener("click", (e) => {
  const popup = document.getElementById("cfg-info-popup");
  if (popup && !popup.hidden && !e.target.closest("#cfg-info-popup") && !e.target.closest(".cfg-info-btn")) {
    popup.hidden = true;
  }
});

function flash(msg, err) {
  const el = document.getElementById("status"); if (!el) return;
  el.textContent = msg; el.className = "status" + (err ? " err" : " ok");
  clearTimeout(flash._t); flash._t = setTimeout(() => { el.textContent = ""; el.className = "status"; }, 4000);
}

/* -------------------- Thème -------------------- */
(function theme() {
  const saved = localStorage.getItem("levad_theme");
  if (saved) document.documentElement.dataset.theme = saved;
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#theme-toggle")) return;
    const cur = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = cur; localStorage.setItem("levad_theme", cur);
  });
})();

start();
