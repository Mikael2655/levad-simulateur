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


/* Complète un tableau (téléphonie : connectivités/mobiles/matériels) avec les
   éléments par défaut manquants, sans jamais tronquer une saisie existante —
   utile quand le nombre de lignes par défaut augmente d'une version à l'autre
   (ex. un article matériel supplémentaire) : les anciennes simus chargées
   (ou le brouillon auto-sauvegardé) gagnent les nouvelles lignes vides au
   lieu de rester bloquées sur l'ancien nombre. */
function padTelArr(arr, baseArr) {
  if (arr.length >= baseArr.length) return arr;
  return arr.concat(baseArr.slice(arr.length).map((x) => ({ ...x })));
}
/* Fusion défensive d'un état chargé avec les valeurs par défaut (schéma évolutif). */
function normalizeState(s) {
  const base = defaultState();
  // Compat anciennes simulations : avant la séparation financement / proposition,
  // une seule périodicité pilotait l'affichage. On la reprend telle quelle pour
  // la proposition afin de ne pas changer l'affichage d'une simu déjà en cours.
  const periodiciteProposition = s.periodiciteProposition || s.periodicite || base.periodiciteProposition;
  return {
    ...base, ...s,
    periodiciteProposition,
    client: { ...base.client, ...(s.client || {}) },
    company: { ...base.company, ...(s.company || {}) },
    machines: Array.isArray(s.machines) && s.machines.length
      ? s.machines.map((m) => {
          const mm = { ...defaultMachine(), ...m };
          if (!Array.isArray(mm.services) || !mm.services.length) mm.services = defaultServices();
          return mm;
        })
      : base.machines,
    telephonie: {
      ...base.telephonie, ...(s.telephonie || {}),
      centrex: { ...base.telephonie.centrex, ...((s.telephonie && s.telephonie.centrex) || {}) },
      trunk: { ...base.telephonie.trunk, ...((s.telephonie && s.telephonie.trunk) || {}) },
      connectivites: padTelArr((s.telephonie && Array.isArray(s.telephonie.connectivites) && s.telephonie.connectivites.length)
        ? s.telephonie.connectivites : base.telephonie.connectivites, base.telephonie.connectivites),
      mobiles: padTelArr((s.telephonie && Array.isArray(s.telephonie.mobiles) && s.telephonie.mobiles.length)
        ? s.telephonie.mobiles : base.telephonie.mobiles, base.telephonie.mobiles),
      materiels: padTelArr((s.telephonie && Array.isArray(s.telephonie.materiels) && s.telephonie.materiels.length)
        ? s.telephonie.materiels : base.telephonie.materiels, base.telephonie.materiels),
    },
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
