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

const NUM = "num", TXT = "txt";

/* -------------------- Démarrage & connexion -------------------- */
async function start() {
  const scr = document.getElementById("screen");
  if (scr) scr.innerHTML = `<section class="card"><p class="muted">Chargement…</p></section>`;
  await Store.init();
  Store.onUpdate = () => { if (CURRENT_USER) { renderSaved(); if (ADMIN) renderUsers(); } };
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
  if (chip) { chip.textContent = CURRENT_USER ? (CURRENT_USER.name + (CURRENT_USER.isAdmin ? " · admin" : "")) : ""; chip.hidden = !CURRENT_USER; }
  if (out) out.hidden = !CURRENT_USER;
  if (usersBtn) usersBtn.hidden = !(CURRENT_USER && ADMIN);
}
function openUsersModal() {
  const modal = document.getElementById("users-modal"); if (!modal) return;
  modal.hidden = false; renderUsers();
}
function closeUsersModal() {
  const modal = document.getElementById("users-modal"); if (!modal) return;
  modal.hidden = true;
}

/* -------------------- Configurateur Canon -------------------- */
function configItemKey(section, designation) { return section + "||" + designation; }
function configTotal() {
  return Object.values(CONFIG_DRAFT.items).reduce((a, it) => a + it.price * it.qty, 0);
}
async function openConfigModal(mid) {
  if (!CATALOG) {
    try { CATALOG = await (await fetch("assets/catalog.json")).json(); }
    catch (e) { alert("Impossible de charger le catalogue Canon (assets/catalog.json)."); return; }
  }
  const m = mById(mid); if (!m) return;
  CONFIG_MID = mid;
  const cfg = m.machineConfig;
  CONFIG_DRAFT = { category: (cfg && cfg.category) || Object.keys(CATALOG)[0] || "", machine: (cfg && cfg.machine) || "", items: {} };
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
  if (!CONFIG_DRAFT.machine && machines.length) CONFIG_DRAFT.machine = machines[0].name;
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
      <span class="sim-name">${who}${esc(s.clientName || s.name || "Sans nom")}${s.archived ? ' <span class="tag">archivée</span>' : ""}
        <span class="muted small">${esc(s.savedAt || "")}</span></span>
      <span class="sim-actions">
        <button class="btn small" data-action="load-sim" data-sim="${s.id}">Charger</button>
        ${s.archived
          ? ((owner || ADMIN) ? `<button class="btn small ghost" data-action="unarch-sim" data-sim="${s.id}">Désarchiver</button>` : "")
          : ((owner || ADMIN) ? `<button class="btn small ghost" data-action="arch-sim" data-sim="${s.id}">Archiver</button>` : "")}
        ${ADMIN ? `<button class="btn small danger" data-action="del-sim" data-sim="${s.id}">Supprimer</button>` : ""}
      </span>
    </div>`;
  }).join("");
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
        <div class="grid">${SP_MAIN.map((f) => mField(m.id, f)).join("")}</div>
        <button class="btn small" data-action="open-config" data-mid="${m.id}">🛒 Configurateur Canon${m.machineConfig && m.machineConfig.machine ? " — " + esc(m.machineConfig.machine) : ""}</button>
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
    if (roC) roC.textContent = m.margeMode === "loyer" ? eur(r.marge) : eur(r.spLoyerT / div);
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
      <span>Marge : <b class="${r.marge < 0 ? "neg" : ""}">${eur(r.marge)}</b></span>`;
  });
  const res = document.getElementById("results"); if (!res) return;
  const c = computeAll(STATE), div = c.divisor, eco = c.savingYear;
  res.innerHTML = `
    <h2>Synthèse (${perAdj(STATE)})</h2>
    <div class="totals">
      <div class="tot"><span>Situation actuelle</span><b>${eur(c.saTotal / div)}</b><small>${perShort(STATE)}</small></div>
      <div class="tot"><span>Solution proposée</span><b>${eur(c.spTotal / div)}</b><small>${perShort(STATE)}</small></div>
      <div class="tot big ${eco >= 0 ? "pos" : "neg"}"><span>${eco >= 0 ? "Économie" : "Surcoût"} annuel</span>
        <b>${eur(Math.abs(eco))}</b><small>${eur(Math.abs(c.savingQuarter) / div)} ${perShort(STATE)}</small></div>
    </div>
    <p class="muted small">Loyer proposé total : ${eur(c.spLoyerTotal / div)} ${perShort(STATE)} · Rachat total : ${eur(c.rachatTotal)} · ${c.durationTrim} trimestres · ${esc(STATE.leaser)}${(ADMIN && COEFF_UNLOCKED) ? " · coeff " + frNum(baseCoeff(STATE, c.rows[0] ? c.rows[0].financed : 0), 3) : ""}</p>`;
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
  if (t.dataset && t.dataset.scope === "user") { // édition d'un profil utilisateur (au blur)
    updateUserProfile(t.dataset.uid, { [t.dataset.key]: t.value });
    if (CURRENT_USER && t.dataset.uid === CURRENT_USER.id) { CURRENT_USER[t.dataset.key] = t.value; if (t.dataset.key === "name") updateTopbar(); }
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
    if (t.checked) CONFIG_DRAFT.items[key] = { designation: t.dataset.desig, price: num(t.dataset.price), qty: 1 };
    else delete CONFIG_DRAFT.items[key];
    renderConfigBody();
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
    case "admin-unlock": COEFF_UNLOCKED = true; renderAdmin(); break;
    case "admin-lock": COEFF_UNLOCKED = false; renderAdmin(); break;
    case "admin-clear-override": STATE.coeffOverride = ""; saveState(STATE); renderAdmin(); renderResults(); break;
    case "retry-firebase": location.reload(); break;
    case "open-users": if (ADMIN) openUsersModal(); break;
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
