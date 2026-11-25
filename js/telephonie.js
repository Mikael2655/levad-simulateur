/* ============================================================
   Simulateur Téléphonie — 4 blocs : Système (Centrex/Trunk), Lien
   internet, Forfait mobile, Matériel. Tarifs repris du fichier
   « Simulateur téléphonie KISS » fourni. Calcul en direct, affiché à
   l'écran uniquement (pas d'export Excel/PDF/PowerPoint pour l'instant).
   ============================================================ */

const TEL_MOBILE_FORFAITS = [
  { label: "5 Go Bouygues 5G", prix: 12 },
  { label: "5 Go Orange 4G", prix: 11 },
  { label: "10 Go Bouygues 5G", prix: 13.5 },
  { label: "10 Go Orange 4G", prix: 13.5 },
  { label: "30 Go Bouygues 5G", prix: 14.5 },
  { label: "30 Go Orange 4G", prix: 15 },
  { label: "50 Go Bouygues 5G", prix: 16.5 },
  { label: "50 Go Orange 4G", prix: 20 },
];
const TEL_MATERIEL_CATALOG = [
  { label: "Casque filaire mono", prix: 60 },
  { label: "Casque filaire double", prix: 70 },
  { label: "Casque sans fil mono", prix: 165 },
  { label: "Casque sans fil double", prix: 175 },
  { label: "Fixe T34W", prix: 91 },
  { label: "Fixe T74W", prix: 164 },
  { label: "Fixe T87W", prix: 239 },
  { label: "Sans fil W74P", prix: 110 },
];
const TEL_CONNECTIVITE_TYPES = ["FTTH 12 mois", "FTTH 24 mois", "FTTH 36 mois", "FTTO 12 mois", "FTTO 24 mois", "FTTO 36 mois"];
const TEL_OPERATEURS = ["Alphalink", "Axione", "Bouygues", "Covage", "Eurofiber", "ielo", "IFT - Free", "Nexloop", "Orange", "Prizz Telecom", "SFR"];
const TEL_GTR_RATE = 43, TEL_SECOURS4G_RATE = 25, TEL_SECOURS5G_RATE = 40;
const TEL_SDA_PRICE = 1, TEL_MNEMO_PRICE = 15, TEL_PORT_TRUNK_PRICE = 3, TEL_CARTE_SIM_PRICE = 2.5;
const TEL_BON_1ER_PRICE = 50, TEL_BON_SUIVANT_PRICE = 90;
const TEL_INSTALL_BASE = 450, TEL_INSTALL_SEUIL = 5, TEL_INSTALL_SUPP = 10;

function telMobilePrix(label) { const f = TEL_MOBILE_FORFAITS.find((x) => x.label === label); return f ? f.prix : 0; }
function telMaterielPrix(label) { const f = TEL_MATERIEL_CATALOG.find((x) => x.label === label); return f ? f.prix : 0; }
/* Tarif dégressif par palier d'utilisateurs (Centrex) / lignes simultanées (Trunk). */
function telCentrexUtilPrix(q) { if (q < 3.5) return 14; if (q < 6.5) return 13; if (q < 10.5) return 12; if (q < 20.5) return 11; return 9; }
function telTrunkLignesPrix(q) { if (q < 5.5) return 12; if (q < 10.5) return 11; if (q < 20.5) return 10; return 9; }
/* Petit tableau de rappel des barèmes, affiché à côté des champs de saisie
   du bloc Système (palier d'utilisateurs/lignes + les 3 autres options). */
function telRateTableHtml(centrex) {
  const unitLabel = centrex ? "Utilisateurs" : "Lignes simultanées";
  const tierFn = centrex ? telCentrexUtilPrix : telTrunkLignesPrix;
  const tiers = (centrex
    ? [["1 à 3", 3], ["4 à 6", 6], ["7 à 10", 10], ["11 à 20", 20], ["21 et +", 21]]
    : [["1 à 5", 5], ["6 à 10", 10], ["11 à 20", 20], ["21 et +", 21]]
  ).map(([label, q]) => [label, tierFn(q)]);
  const portFas = centrex ? 0 : TEL_PORT_TRUNK_PRICE;
  return `<table class="tel-rate-table">
    <thead><tr><th colspan="2"></th><th>Prix mensuel</th><th>FAS</th></tr></thead>
    <tbody>
      ${tiers.map(([label, prix], i) => `<tr>${i === 0 ? `<td rowspan="${tiers.length}">${unitLabel}</td>` : ""}<td>${label}</td><td>${eur(prix)}</td><td>${eur(0)}</td></tr>`).join("")}
      <tr><td colspan="2">Numéros à porter</td><td>${eur(0)}</td><td>${eur(portFas)}</td></tr>
      <tr><td colspan="2">Numéro à créer</td><td>${eur(TEL_SDA_PRICE)}</td><td>${eur(0)}</td></tr>
      <tr><td colspan="2">Numéro mnémo</td><td>${eur(TEL_MNEMO_PRICE)}</td><td>${eur(0)}</td></tr>
    </tbody>
  </table>`;
}
/* Bons d'enregistrement : 1er bon à 50 €, chaque bon suivant à 90 €. */
function telBonsPrix(qty) { const q = num(qty); return q <= 0 ? 0 : TEL_BON_1ER_PRICE + Math.max(0, q - 1) * TEL_BON_SUIVANT_PRICE; }
/* Installation : 450 € jusqu'à 5 postes/lignes, +10 €/poste au-delà ; 0 si aucun poste/ligne saisi. */
function telInstallationPrix(n) {
  const q = num(n);
  if (q <= 0) return 0;
  return q <= TEL_INSTALL_SEUIL ? TEL_INSTALL_BASE : TEL_INSTALL_BASE + (q - TEL_INSTALL_SEUIL) * TEL_INSTALL_SUPP;
}

function defaultTelConnectivite() { return { type: "", quantite: 0, prix: 0, fas: 0, operateur: "" }; }
function defaultTelMobileLine() { return { forfait: "", quantite: 0 }; }
function defaultTelMateriel() { return { type: "", quantite: 0 }; }
function defaultTelephonie() {
  return {
    systeme: "centrex", // "centrex" | "trunk"
    centrex: { utilisateurs: 0, sdaACreer: 0, numerosMnemo: 0, numerosAPorter: 0 },
    trunk: { lignesSimultanees: 0, sdaACreer: 0, numerosMnemo: 0, numerosAPorter: 0 },
    // Un seul exemplaire par défaut ; "+ Ajouter" en rajoute autant que nécessaire
    // (plus de limite fixe — voir add-telarr/del-telarr dans app.js).
    connectivites: [defaultTelConnectivite()],
    gtrQty: 0, secours4gQty: 0, secours5gQty: 0,
    mobiles: [defaultTelMobileLine()],
    materiels: [defaultTelMateriel()],
    bonsEnregistrement: 0,
    rachat: 0, cadeaux: 0, cadeauxLabel: "",
    margeMode: "marge", // "marge" (on saisit la marge -> loyer calculé) | "loyer" (on saisit le loyer cible -> marge calculée)
    marge: 1500,
    loyerCible: 0,
  };
}

/* Moteur de calcul, en miroir du fichier Excel fourni :
   - Abonnements mensuels = système (Centrex OU Trunk) + Lien internet/options + Mobile.
   - FAS = frais d'accès au service, non récurrent (portage Trunk, FAS connectivité, cartes SIM).
   - Installation = frais de mise en service, non récurrent, selon le nombre d'utilisateurs/lignes.
   - Financement du matériel : même moteur que l'Impression (calc.js — leaser, durée, périodicité et
     coefficient du bloc Financement du haut, avec le même bascule marge -> loyer / loyer -> marge) —
     pas de barème séparé pour la Téléphonie.
   - Total mensuel tout inclus = location matériel (toujours ramenée au mois) + abonnements mensuels. */
function computeTelephonie(state) {
  const t = state.telephonie;
  const centrex = t.systeme !== "trunk";
  const c = t.centrex, tr = t.trunk;

  const centrexTotal = num(c.utilisateurs) * telCentrexUtilPrix(num(c.utilisateurs))
    + num(c.sdaACreer) * TEL_SDA_PRICE + num(c.numerosMnemo) * TEL_MNEMO_PRICE;
  const trunkTotal = num(tr.lignesSimultanees) * telTrunkLignesPrix(num(tr.lignesSimultanees))
    + num(tr.sdaACreer) * TEL_SDA_PRICE + num(tr.numerosMnemo) * TEL_MNEMO_PRICE;
  const systemeTotal = centrex ? centrexTotal : trunkTotal; // mensuel
  const systemeFas = centrex ? 0 : num(tr.numerosAPorter) * TEL_PORT_TRUNK_PRICE; // FAS (porter un numéro est gratuit en Centrex)

  const connectivites = (t.connectivites || []).map((x) => ({ ...x }));
  const connPrixTotal = connectivites.reduce((a, x) => a + num(x.prix), 0);
  const connFasTotal = connectivites.reduce((a, x) => a + num(x.fas), 0);
  const gtrTotal = num(t.gtrQty) * TEL_GTR_RATE;
  const secours4gTotal = num(t.secours4gQty) * TEL_SECOURS4G_RATE;
  const secours5gTotal = num(t.secours5gQty) * TEL_SECOURS5G_RATE;
  const dataTotal = connPrixTotal + gtrTotal + secours4gTotal + secours5gTotal; // mensuel
  const dataFas = connFasTotal; // FAS

  const mobiles = (t.mobiles || []).map((m) => ({ ...m, montant: num(m.quantite) * telMobilePrix(m.forfait) }));
  const mobileTotal = mobiles.reduce((a, m) => a + m.montant, 0); // mensuel
  // Une carte SIM par ligne mobile commandée : plus de case séparée, déduite des quantités.
  const carteSimQty = mobiles.reduce((a, m) => a + num(m.quantite), 0);
  const carteSimTotal = carteSimQty * TEL_CARTE_SIM_PRICE; // FAS

  const abonnementsMensuels = systemeTotal + dataTotal + mobileTotal;
  const fas = systemeFas + dataFas + carteSimTotal; // FAS totaux des 3 blocs ci-dessus

  const materiels = (t.materiels || []).map((m) => ({ ...m, montant: num(m.quantite) * telMaterielPrix(m.type) }));
  const materielTotal = materiels.reduce((a, m) => a + m.montant, 0);
  const bonsTotal = telBonsPrix(t.bonsEnregistrement);
  const usersForInstall = centrex ? num(c.utilisateurs) : num(tr.lignesSimultanees);
  const installation = telInstallationPrix(usersForInstall);
  const materielDisplay = materielTotal + bonsTotal; // matériel + bons d'enregistrement
  const baseCost = materielDisplay + installation + fas; // équivalent du "prixComplet" côté Impression
  // Total "hors marge" du bloc Matériel : matériel + bons + installation + rachat +
  // cadeaux + FAS des 3 blocs au-dessus (Système, Lien internet, Forfait mobile).
  const financedBase = materielDisplay + installation + num(t.rachat) + num(t.cadeaux) + fas;

  // Financement : même moteur que l'Impression (leaser/durée/périodicité/coefficient du bloc du haut).
  const div = perDivisor(state);
  let financed, marge, loyerT;
  if (t.margeMode === "loyer") {
    loyerT = num(t.loyerCible) * div;
    financed = financedFromLoyer(state, loyerT);
    marge = financed - baseCost - num(t.rachat) - num(t.cadeaux);
  } else {
    marge = num(t.marge);
    financed = baseCost + marge + num(t.rachat) + num(t.cadeaux);
    loyerT = financed * effCoeff(state, financed) / 100;
  }
  const coeffT = baseCoeff(state, financed);
  const totalLocation = loyerT / div;      // affiché selon la périodicité de la proposition (comme l'Impression)
  const totalLocationMensuel = loyerT / 3; // toujours ramené au mois, pour le total "tout inclus"

  const totalMensuel = totalLocationMensuel + abonnementsMensuels;

  return {
    systemeTotal, systemeFas, connectivites, connPrixTotal, connFasTotal, dataFas,
    gtrTotal, secours4gTotal, secours5gTotal, dataTotal,
    mobiles, mobileTotal, carteSimQty, carteSimTotal,
    abonnementsMensuels, fas,
    materiels, materielTotal, bonsTotal, installation, materielDisplay, financedBase,
    rachat: num(t.rachat), cadeaux: num(t.cadeaux),
    financed, coeffT, marge, totalLocation, totalLocationMensuel, totalMensuel,
  };
}

/* -------------------- Rendu -------------------- */
/* 4 blocs distincts (chacun sa carte) : Système, Lien internet, Forfait
   mobile, Matériel — comme la SA (bleu/gris) et la SP (vert) côté Impression,
   mais séparés en blocs plutôt qu'en 2 colonnes puisqu'il n'y a pas de
   situation actuelle / proposée en téléphonie. */
function renderTelephonie() {
  const box = document.getElementById("telephonie"); if (!box) return;
  const t = STATE.telephonie;
  const centrex = t.systeme !== "trunk";
  const chosenLabel = centrex ? "Centrex / softphonie Lebigo" : "Trunk (matériel conservé avec iPBX)";
  box.innerHTML = `
    <section class="card tel-card">
      <h2>Système</h2>
      <div class="grid">
        <label class="fld narrow"><span>Système</span>
          <select data-scope="telephonie" data-key="systeme">
            <option value="centrex" ${centrex ? "selected" : ""}>Centrex / softphonie Lebigo</option>
            <option value="trunk" ${!centrex ? "selected" : ""}>Trunk (matériel conservé avec iPBX)</option>
          </select></label>
        <div class="fld"><span>&nbsp;</span><span class="tel-system-chosen">${chosenLabel}</span></div>
      </div>
      <div class="tel-sys-body">
        <div class="tel-sys-fields">
          ${centrex ? `
            <label class="fld"><span>Utilisateurs</span>
              <input type="number" step="1" min="0" data-scope="telephonie" data-key="centrex.utilisateurs" value="${esc(t.centrex.utilisateurs)}"></label>
            <label class="fld"><span>Numéros à porter</span>
              <input type="number" step="1" min="0" data-scope="telephonie" data-key="centrex.numerosAPorter" value="${esc(t.centrex.numerosAPorter)}"></label>
            <label class="fld"><span>SDA à créer</span>
              <input type="number" step="1" min="0" data-scope="telephonie" data-key="centrex.sdaACreer" value="${esc(t.centrex.sdaACreer)}"></label>
            <label class="fld"><span>Numéros mnémo</span>
              <input type="number" step="1" min="0" data-scope="telephonie" data-key="centrex.numerosMnemo" value="${esc(t.centrex.numerosMnemo)}"></label>
          ` : `
            <label class="fld"><span>Lignes simultanées</span>
              <input type="number" step="1" min="0" data-scope="telephonie" data-key="trunk.lignesSimultanees" value="${esc(t.trunk.lignesSimultanees)}"></label>
            <label class="fld"><span>Numéros à porter</span>
              <input type="number" step="1" min="0" data-scope="telephonie" data-key="trunk.numerosAPorter" value="${esc(t.trunk.numerosAPorter)}"></label>
            <label class="fld"><span>SDA à créer</span>
              <input type="number" step="1" min="0" data-scope="telephonie" data-key="trunk.sdaACreer" value="${esc(t.trunk.sdaACreer)}"></label>
            <label class="fld"><span>Numéros mnémo</span>
              <input type="number" step="1" min="0" data-scope="telephonie" data-key="trunk.numerosMnemo" value="${esc(t.trunk.numerosMnemo)}"></label>
          `}
        </div>
        ${telRateTableHtml(centrex)}
      </div>
      <div class="machine-sum">
        <span>Coût total mensuel : <b id="tel-sys-mensuel"></b></span>
        <span>FAS totaux : <b id="tel-sys-fas"></b></span>
      </div>
    </section>

    <section class="card tel-card">
      <h2>Lien internet</h2>
      ${t.connectivites.map((cn, i) => `
        <div class="grid sp-price-row">
          <label class="fld"><span>Lien ${i + 1}</span>
            <select data-scope="telarr" data-arr="connectivites" data-idx="${i}" data-field="type">
              <option value="">—</option>
              ${TEL_CONNECTIVITE_TYPES.map((ty) => `<option value="${ty}" ${cn.type === ty ? "selected" : ""}>${ty}</option>`).join("")}
            </select></label>
          <label class="fld"><span>Opérateur</span>
            <select data-scope="telarr" data-arr="connectivites" data-idx="${i}" data-field="operateur">
              <option value="">—</option>
              ${TEL_OPERATEURS.map((op) => `<option value="${op}" ${cn.operateur === op ? "selected" : ""}>${op}</option>`).join("")}
            </select></label>
          <label class="fld"><span>Quantité</span>
            <input type="number" step="1" min="0" data-scope="telarr" data-arr="connectivites" data-idx="${i}" data-field="quantite" value="${esc(cn.quantite)}"></label>
          <label class="fld money"><span>Prix mensuel</span>${euroWrap(`<input type="number" step="any" inputmode="decimal" data-scope="telarr" data-arr="connectivites" data-idx="${i}" data-field="prix" value="${esc(cn.prix)}">`)}</label>
          <label class="fld money"><span>FAS</span>${euroWrap(`<input type="number" step="any" inputmode="decimal" data-scope="telarr" data-arr="connectivites" data-idx="${i}" data-field="fas" value="${esc(cn.fas)}">`)}</label>
          <div class="tel-row-del"><button class="btn small danger" data-action="del-telarr" data-arr="connectivites" data-idx="${i}" ${t.connectivites.length <= 1 ? "disabled" : ""}>✕</button></div>
        </div>`).join("")}
      <button class="btn small" data-action="add-telarr" data-arr="connectivites">＋ Ajouter un lien</button>
      <div class="subgrid"><h4>Options</h4>
        <div class="grid">
          <label class="fld"><span>GTR 4h 7/24 (quantité) <small>(${eur(TEL_GTR_RATE)} / mois)</small></span>
            <input type="number" step="1" min="0" data-scope="telephonie" data-key="gtrQty" value="${esc(t.gtrQty)}"></label>
          <label class="fld"><span>Secours 4G illimité (quantité) <small>(${eur(TEL_SECOURS4G_RATE)} / mois)</small></span>
            <input type="number" step="1" min="0" data-scope="telephonie" data-key="secours4gQty" value="${esc(t.secours4gQty)}"></label>
          <label class="fld"><span>Secours 5G illimité (quantité) <small>(${eur(TEL_SECOURS5G_RATE)} / mois)</small></span>
            <input type="number" step="1" min="0" data-scope="telephonie" data-key="secours5gQty" value="${esc(t.secours5gQty)}"></label>
        </div>
      </div>
      <div class="machine-sum">
        <span>Coût total mensuel : <b id="tel-net-mensuel"></b></span>
        <span>FAS totaux : <b id="tel-net-fas"></b></span>
      </div>
    </section>

    <section class="card tel-card">
      <h2>Forfait mobile</h2>
      <div class="tel-pair-2">
        ${t.mobiles.map((m, i) => `
          <div class="grid sp-price-row tel-item-row">
            <label class="fld"><span>Forfait ${i + 1}</span>
              <select data-scope="telarr" data-arr="mobiles" data-idx="${i}" data-field="forfait">
                <option value="">—</option>
                ${TEL_MOBILE_FORFAITS.map((f) => `<option value="${esc(f.label)}" ${m.forfait === f.label ? "selected" : ""}>${f.label} (${eur(f.prix)})</option>`).join("")}
              </select></label>
            <label class="fld"><span>Quantité</span>
              <input type="number" step="1" min="0" data-scope="telarr" data-arr="mobiles" data-idx="${i}" data-field="quantite" value="${esc(m.quantite)}"></label>
            <div class="fld"><span>Montant</span><div class="ro" id="tel-mob-montant-${i}"></div></div>
            <div class="tel-row-del"><button class="btn small danger" data-action="del-telarr" data-arr="mobiles" data-idx="${i}" ${t.mobiles.length <= 1 ? "disabled" : ""}>✕</button></div>
          </div>`).join("")}
      </div>
      <button class="btn small" data-action="add-telarr" data-arr="mobiles">＋ Ajouter un forfait</button>
      <div class="machine-sum">
        <span>Coût total mensuel : <b id="tel-mob-mensuel"></b></span>
        <span>FAS totaux <small>(${eur(TEL_CARTE_SIM_PRICE)} / carte SIM)</small> : <b id="tel-mob-fas"></b></span>
      </div>
    </section>

    <section class="card tel-card">
      <h2>Matériel / location</h2>
      <div class="tel-pair-3">
        ${t.materiels.map((m, i) => `
          <div class="grid sp-price-row tel-item-row">
            <label class="fld"><span>Article ${i + 1}</span>
              <select data-scope="telarr" data-arr="materiels" data-idx="${i}" data-field="type">
                <option value="">—</option>
                ${TEL_MATERIEL_CATALOG.map((c) => `<option value="${esc(c.label)}" ${m.type === c.label ? "selected" : ""}>${c.label} (${eur(c.prix)})</option>`).join("")}
              </select></label>
            <label class="fld"><span>Quantité</span>
              <input type="number" step="1" min="0" data-scope="telarr" data-arr="materiels" data-idx="${i}" data-field="quantite" value="${esc(m.quantite)}"></label>
            <div class="fld"><span>Montant</span><div class="ro" id="tel-mat-montant-${i}"></div></div>
            <div class="tel-row-del"><button class="btn small danger" data-action="del-telarr" data-arr="materiels" data-idx="${i}" ${t.materiels.length <= 1 ? "disabled" : ""}>✕</button></div>
          </div>`).join("")}
      </div>
      <button class="btn small" data-action="add-telarr" data-arr="materiels">＋ Ajouter un article</button>
      <div class="grid tel-bons-row">
        <label class="fld"><span>Bons d'enregistrement (qté) <small>(${eur(TEL_BON_1ER_PRICE)} le 1er, ${eur(TEL_BON_SUIVANT_PRICE)} les suivants)</small></span>
          <input type="number" step="1" min="0" data-scope="telephonie" data-key="bonsEnregistrement" value="${esc(t.bonsEnregistrement)}"></label>
        <div class="fld"><span>Bons (calculé)</span><div class="ro" id="tel-bons-calc"></div></div>
        <div class="fld"><span>Installation <small>(${eur(TEL_INSTALL_BASE)} jusqu'à ${TEL_INSTALL_SEUIL} postes, +${eur(TEL_INSTALL_SUPP)} / poste au-delà)</small></span><div class="ro" id="tel-installation-calc"></div></div>
      </div>
      <div class="subgrid"><h4>Financement</h4>
        <div class="grid">
          <label class="fld money"><span>Rachat contrat actuel</span>${euroWrap(`<input type="number" step="any" inputmode="decimal" data-scope="telephonie" data-key="rachat" value="${esc(t.rachat)}">`)}</label>
          <label class="fld money"><span>Cadeaux</span>${euroWrap(`<input type="number" step="any" inputmode="decimal" data-scope="telephonie" data-key="cadeaux" value="${esc(t.cadeaux)}">`)}</label>
          <label class="fld"><span>Détail des cadeaux</span>
            <input type="text" data-scope="telephonie" data-key="cadeauxLabel" value="${esc(t.cadeauxLabel)}"></label>
        </div>
        <div class="machine-sum">
          <span>Total <small>(matériel + bons + installation + rachat + cadeaux + FAS des blocs ci-dessus)</small> : <b id="tel-financed-base"></b></span>
        </div>
        <div class="grid">
          <label class="fld"><span>Mode</span>
            <select data-scope="telephonie" data-key="margeMode">
              <option value="marge" ${t.margeMode !== "loyer" ? "selected" : ""}>Marge → Loyer (calculé)</option>
              <option value="loyer" ${t.margeMode === "loyer" ? "selected" : ""}>Loyer cible → Marge (calculée)</option>
            </select></label>
          ${t.margeMode === "loyer" ? `
          <label class="fld money"><span>Loyer proposé</span>${euroWrap(`<input type="number" step="any" inputmode="decimal" data-scope="telephonie" data-key="loyerCible" value="${esc(t.loyerCible)}">`)}</label>
          <div class="fld"><span>Marge (calculée)</span><div class="ro" id="tel-fin-calc"></div></div>` : `
          <label class="fld money"><span>Marge</span>${euroWrap(`<input type="number" step="any" inputmode="decimal" data-scope="telephonie" data-key="marge" value="${esc(t.marge)}">`)}</label>
          <div class="fld"><span>Loyer proposé (calculé)</span><div class="ro" id="tel-fin-calc"></div></div>`}
        </div>
      </div>
    </section>`;
  renderTelResults();
}

function renderTelResults() {
  const t = STATE.telephonie; if (!t) return;
  const r = computeTelephonie(STATE);
  r.mobiles.forEach((m, i) => {
    const el = document.getElementById("tel-mob-montant-" + i); if (el) el.textContent = eur(m.montant);
  });
  r.materiels.forEach((m, i) => {
    const el = document.getElementById("tel-mat-montant-" + i); if (el) el.textContent = eur(m.montant);
  });
  const finCalcEl = document.getElementById("tel-fin-calc");
  if (finCalcEl) finCalcEl.textContent = t.margeMode === "loyer" ? eur(r.marge) : eur(r.totalLocation);
  const installEl = document.getElementById("tel-installation-calc");
  if (installEl) installEl.textContent = eur(r.installation);
  const bonsEl = document.getElementById("tel-bons-calc");
  if (bonsEl) bonsEl.textContent = eur(r.bonsTotal);
  const financedBaseEl = document.getElementById("tel-financed-base");
  if (financedBaseEl) financedBaseEl.textContent = eur(r.financedBase);
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setText("tel-sys-mensuel", eur(r.systemeTotal));
  setText("tel-sys-fas", eur(r.systemeFas));
  setText("tel-net-mensuel", eur(r.dataTotal));
  setText("tel-net-fas", eur(r.dataFas));
  setText("tel-mob-mensuel", eur(r.mobileTotal));
  setText("tel-mob-fas", eur(r.carteSimTotal));
  const res = document.getElementById("tel-results"); if (!res) return;
  res.innerHTML = `
    <h2>Synthèse Téléphonie</h2>
    <div class="totals">
      <div class="tot"><span>Abonnements</span><b>${eur(r.abonnementsMensuels)}</b>
        <small class="tot-detail">Système : ${eur(r.systemeTotal)}</small>
        <small class="tot-detail">Lien internet : ${eur(r.dataTotal)}</small>
        <small class="tot-detail">Mobile : ${eur(r.mobileTotal)}</small></div>
      <div class="tot"><span>Matériel <small>(en location)</small></span><b>${eur(r.totalLocation)} <small class="unit">${perShort(STATE)}</small></b>
        <small class="tot-detail tel-synth-grid">
          <span>Matériel : ${eur(r.materielDisplay)}</span><span>Installation : ${eur(r.installation)}</span>
          <span>FAS : ${eur(r.fas)}</span><span>Rachat : ${eur(r.rachat)}</span>
          <span>Cadeau : ${eur(r.cadeaux)}</span><span>Marge : ${eur(r.marge)}</span>
        </small>
        <small class="tot-detail">TOTAL (avec marge) : ${eur(r.financed)}</small></div>
      <div class="tot big tel"><span>Total mensuel tout inclus</span><b>${eur(r.totalMensuel)}</b></div>
    </div>`;
}
