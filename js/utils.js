/* Utilitaires partagés : téléchargement, nom de fichier, stockage. */

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function slugify(s) {
  return (s || "client").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "client";
}

function fileName(state, ext, label) {
  const d = (state.client.date || todayISO()).replace(/-/g, "");
  return `${label || "Proposition"}_${slugify(state.client.name)}_${d}.${ext}`;
}

/* "12/03/2026" -> "2026-03-12" (ISO), ou null si invalide. */
function parseFrDate(str) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(str || "").trim());
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/* Demande une date en jj/mm/aaaa (pré-remplie), retourne l'ISO ou null si
   annulé/invalide (message d'erreur affiché dans ce cas). */
function promptDate(label, defaultIso) {
  const input = prompt(label, dateShort(defaultIso || todayISO()));
  if (input === null) return null;
  const iso = parseFrDate(input);
  if (!iso) { alert("Date invalide. Format attendu : jj/mm/aaaa."); return null; }
  return iso;
}

/* Fusion défensive d'un état chargé avec les valeurs par défaut (schéma évolutif). */
function normalizeState(s) {
  const base = defaultState();
  return {
    ...base, ...s,
    client: { ...base.client, ...(s.client || {}) },
    company: { ...base.company, ...(s.company || {}) },
    machines: Array.isArray(s.machines) && s.machines.length
      ? s.machines.map((m) => {
          const mm = { ...defaultMachine(), ...m };
          if (!Array.isArray(mm.services) || !mm.services.length) mm.services = defaultServices();
          return mm;
        })
      : base.machines,
  };
}
/* Brouillon de l'utilisateur courant (auto-sauvegarde). */
function saveState(state) {
  const id = currentUserId();
  if (!id) return;
  try { localStorage.setItem(draftKey(id), JSON.stringify(state)); } catch (e) {}
}
/* Charge le brouillon d'un utilisateur, ou un état neuf pré-rempli avec son profil. */
function loadDraftFor(user) {
  try {
    const raw = localStorage.getItem(draftKey(user.id));
    if (raw) return normalizeState(JSON.parse(raw));
  } catch (e) {}
  const s = defaultState();
  s.company = {
    ...s.company,
    repName: user.name || "", repTitle: user.title || "",
    repPhone: user.phone || "01 70 72 19 40", repMobile: user.mobile || "",
    repEmail: user.email || "", repEmailManual: !!user.email,
  };
  return s;
}
