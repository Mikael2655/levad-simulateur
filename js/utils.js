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

function fileName(state, ext) {
  const d = (state.client.date || todayISO()).replace(/-/g, "");
  return `Proposition_${slugify(state.client.name)}_${d}.${ext}`;
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
