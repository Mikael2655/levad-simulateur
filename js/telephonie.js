/* ============================================================
   Simulateur Téléphonie (Centrex/Trunk + Data + Mobile + Matériel).
   Tarifs repris du fichier « Simulateur téléphonie KISS » fourni.
   Calcul en direct, affiché à l'écran uniquement (pas d'export
   Excel/PDF/PowerPoint pour l'instant).
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
const TEL_DUREE_COEFF = { 3: 9.7, 4: 7.5, 5: 6.05 };
const TEL_GTR_RATE = 43, TEL_SECOURS4G_RATE = 25, TEL_SECOURS5G_RATE = 40;
const TEL_SDA_PRICE = 1, TEL_MNEMO_PRICE = 15, TEL_PORT_TRUNK_PRICE = 3, TEL_CARTE_SIM_PRICE = 2.5;

function telMobilePrix(label) { const f = TEL_MOBILE_FORFAITS.find((x) => x.label === label); return f ? f.prix : 0; }
function telMaterielPrix(label) { const f = TEL_MATERIEL_CATALOG.find((x) => x.label === label); return f ? f.prix : 0; }
/* Tarif dégressif par palier d'utilisateurs (Centrex) / lignes simultanées (Trunk). */
function telCentrexUtilPrix(q) { if (q < 5.5) return 14; if (q < 10.5) return 13; if (q < 20.5) return 12; return 11; }
function telTrunkLignesPrix(q) { if (q < 5.5) return 12; if (q < 10.5) return 11; if (q < 20.5) return 10; return 9; }

function defaultTelConnectivite() { return { type: TEL_CONNECTIVITE_TYPES[0], quantite: 0, prix: 0, fas: 0, operateur: "" }; }
function defaultTelMobileLine() { return { forfait: "", quantite: 0 }; }
function defaultTelMateriel() { return { type: "", quantite: 0 }; }
function defaultTelephonie() {
  return {
    systeme: "centrex", // "centrex" | "trunk"
    centrex: { utilisateurs: 0, sdaACreer: 0, numerosMnemo: 0, numerosAPorter: 0 },
    trunk: { lignesSimultanees: 0, sdaACreer: 0, numerosMnemo: 0, numerosAPorter: 0 },
    connectivites: [defaultTelConnectivite(), defaultTelConnectivite()],
    gtrQty: 0, secours4gQty: 0, secours5gQty: 0,
    mobiles: [defaultTelMobileLine(), defaultTelMobileLine(), defaultTelMobileLine(), defaultTelMobileLine()],
    carteSimQty: 0,
    materiels: [defaultTelMateriel(), defaultTelMateriel(), defaultTelMateriel(), defaultTelMateriel(),
                defaultTelMateriel(), defaultTelMateriel(), defaultTelMateriel()],
    bonsEnregistrement: 0,
    rachat: 0, cadeaux: 0, cadeauxLabel: "",
    marge: 1500,
    dureeAnnee: 5,
  };
}

/* Moteur de calcul, en miroir du fichier Excel fourni :
   - Abonnements mensuels = système (Centrex OU Trunk) + Data/options + Mobile.
   - FAS = frais d'accès au service, non récurrent (portage Trunk, FAS connectivité, cartes SIM).
   - Installation = frais de mise en service, non récurrent, selon le nombre d'utilisateurs/lignes.
   - Matériel financé = matériel + bons d'enregistrement + installation + FAS + rachat + cadeaux + marge,
     loué mensuellement via un coefficient dépendant de la durée (3/4/5 ans).
   - Total mensuel tout inclus = location matériel + abonnements mensuels. */
function computeTelephonie(state) {
  const t = state.telephonie;
  const centrex = t.systeme !== "trunk";
  const c = t.centrex, tr = t.trunk;

  const centrexTotal = num(c.utilisateurs) * telCentrexUtilPrix(num(c.utilisateurs))
    + num(c.sdaACreer) * TEL_SDA_PRICE + num(c.numerosMnemo) * TEL_MNEMO_PRICE;
  const trunkTotal = num(tr.lignesSimultanees) * telTrunkLignesPrix(num(tr.lignesSimultanees))
    + num(tr.sdaACreer) * TEL_SDA_PRICE + num(tr.numerosMnemo) * TEL_MNEMO_PRICE;
  const systemeTotal = centrex ? centrexTotal : trunkTotal;
  const portageFas = centrex ? 0 : num(tr.numerosAPorter) * TEL_PORT_TRUNK_PRICE; // porter un numéro est gratuit en Centrex

  const connectivites = (t.connectivites || []).map((x) => ({ ...x }));
  const connPrixTotal = connectivites.reduce((a, x) => a + num(x.prix), 0);
  const connFasTotal = connectivites.reduce((a, x) => a + num(x.fas), 0);
  const gtrTotal = num(t.gtrQty) * TEL_GTR_RATE;
  const secours4gTotal = num(t.secours4gQty) * TEL_SECOURS4G_RATE;
  const secours5gTotal = num(t.secours5gQty) * TEL_SECOURS5G_RATE;
  const dataTotal = connPrixTotal + gtrTotal + secours4gTotal + secours5gTotal;

  const mobiles = (t.mobiles || []).map((m) => ({ ...m, montant: num(m.quantite) * telMobilePrix(m.forfait) }));
  const mobileTotal = mobiles.reduce((a, m) => a + m.montant, 0);
  const carteSimTotal = num(t.carteSimQty) * TEL_CARTE_SIM_PRICE;

  const abonnementsMensuels = systemeTotal + dataTotal + mobileTotal;
  const fas = portageFas + connFasTotal + carteSimTotal;

  const materiels = (t.materiels || []).map((m) => ({ ...m, montant: num(m.quantite) * telMaterielPrix(m.type) }));
  const materielTotal = materiels.reduce((a, m) => a + m.montant, 0);
  const bonsTotal = num(t.bonsEnregistrement) < 2 ? 0 : (num(t.bonsEnregistrement) - 1) * 150;
  const usersForInstall = centrex ? num(c.utilisateurs) : num(tr.lignesSimultanees);
  const installation = usersForInstall < 4.5 ? 450 : 550;

  const totalMaterielFas = materielTotal + bonsTotal + installation + fas + num(t.rachat) + num(t.cadeaux) + num(t.marge);

  const coeff = TEL_DUREE_COEFF[num(t.dureeAnnee)] || 0;
  const totalLocation = totalMaterielFas * coeff / 300;

  const totalMensuel = totalLocation + abonnementsMensuels;

  return {
    systemeTotal, portageFas, connectivites, connPrixTotal, connFasTotal,
    gtrTotal, secours4gTotal, secours5gTotal, dataTotal,
    mobiles, mobileTotal, carteSimTotal,
    abonnementsMensuels, fas,
    materiels, materielTotal, bonsTotal, installation,
    totalMaterielFas, coeff, totalLocation, totalMensuel,
  };
}

/* -------------------- Rendu -------------------- */
function renderTelephonie() {
  const box = document.getElementById("telephonie"); if (!box) return;
  const t = STATE.telephonie;
  const centrex = t.systeme !== "trunk";
  box.innerHTML = `
    <div class="grid">
      <label class="fld"><span>Système</span>
        <select data-scope="telephonie" data-key="systeme">
          <option value="centrex" ${centrex ? "selected" : ""}>Centrex (avec appli)</option>
          <option value="trunk" ${!centrex ? "selected" : ""}>Trunk (sans appli)</option>
        </select></label>
    </div>
    ${centrex ? `
    <div class="subgrid"><h4>Centrex (avec appli)</h4>
      <div class="grid">
        <label class="fld"><span>Utilisateurs</span>
          <input type="number" step="1" min="0" data-scope="telephonie" data-key="centrex.utilisateurs" value="${esc(t.centrex.utilisateurs)}"></label>
        <label class="fld"><span>SDA à créer</span>
          <input type="number" step="1" min="0" data-scope="telephonie" data-key="centrex.sdaACreer" value="${esc(t.centrex.sdaACreer)}"></label>
        <label class="fld"><span>Numéros mnémo</span>
          <input type="number" step="1" min="0" data-scope="telephonie" data-key="centrex.numerosMnemo" value="${esc(t.centrex.numerosMnemo)}"></label>
        <label class="fld"><span>Numéros à porter <small>(gratuit)</small></span>
          <input type="number" step="1" min="0" data-scope="telephonie" data-key="centrex.numerosAPorter" value="${esc(t.centrex.numerosAPorter)}"></label>
      </div>
    </div>` : `
    <div class="subgrid"><h4>Trunk (sans appli)</h4>
      <div class="grid">
        <label class="fld"><span>Lignes simultanées</span>
          <input type="number" step="1" min="0" data-scope="telephonie" data-key="trunk.lignesSimultanees" value="${esc(t.trunk.lignesSimultanees)}"></label>
        <label class="fld"><span>SDA à créer</span>
          <input type="number" step="1" min="0" data-scope="telephonie" data-key="trunk.sdaACreer" value="${esc(t.trunk.sdaACreer)}"></label>
        <label class="fld"><span>Numéros mnémo</span>
          <input type="number" step="1" min="0" data-scope="telephonie" data-key="trunk.numerosMnemo" value="${esc(t.trunk.numerosMnemo)}"></label>
        <label class="fld"><span>Numéros à porter <small>(3 € / numéro)</small></span>
          <input type="number" step="1" min="0" data-scope="telephonie" data-key="trunk.numerosAPorter" value="${esc(t.trunk.numerosAPorter)}"></label>
      </div>
    </div>`}

    <div class="subgrid"><h4>Data / Connectivité</h4>
      ${t.connectivites.map((cn, i) => `
        <div class="grid">
          <label class="fld"><span>Type (ligne ${i + 1})</span>
            <select data-scope="telarr" data-arr="connectivites" data-idx="${i}" data-field="type">
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
        </div>`).join("")}
    </div>

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

    <div class="subgrid"><h4>Mobile</h4>
      ${t.mobiles.map((m, i) => `
        <div class="grid">
          <label class="fld wide"><span>Forfait (ligne ${i + 1})</span>
            <select data-scope="telarr" data-arr="mobiles" data-idx="${i}" data-field="forfait">
              <option value="">—</option>
              ${TEL_MOBILE_FORFAITS.map((f) => `<option value="${esc(f.label)}" ${m.forfait === f.label ? "selected" : ""}>${f.label} (${eur(f.prix)})</option>`).join("")}
            </select></label>
          <label class="fld"><span>Quantité</span>
            <input type="number" step="1" min="0" data-scope="telarr" data-arr="mobiles" data-idx="${i}" data-field="quantite" value="${esc(m.quantite)}"></label>
          <div class="fld"><span>Montant</span><div class="ro" id="tel-mob-montant-${i}"></div></div>
        </div>`).join("")}
      <div class="grid">
        <label class="fld"><span>Cartes SIM (quantité) <small>(${eur(TEL_CARTE_SIM_PRICE)} / carte)</small></span>
          <input type="number" step="1" min="0" data-scope="telephonie" data-key="carteSimQty" value="${esc(t.carteSimQty)}"></label>
      </div>
    </div>

    <div class="subgrid"><h4>Matériel</h4>
      ${t.materiels.map((m, i) => `
        <div class="grid">
          <label class="fld wide"><span>Article ${i + 1}</span>
            <select data-scope="telarr" data-arr="materiels" data-idx="${i}" data-field="type">
              <option value="">—</option>
              ${TEL_MATERIEL_CATALOG.map((c) => `<option value="${esc(c.label)}" ${m.type === c.label ? "selected" : ""}>${c.label} (${eur(c.prix)})</option>`).join("")}
            </select></label>
          <label class="fld"><span>Quantité</span>
            <input type="number" step="1" min="0" data-scope="telarr" data-arr="materiels" data-idx="${i}" data-field="quantite" value="${esc(m.quantite)}"></label>
          <div class="fld"><span>Montant</span><div class="ro" id="tel-mat-montant-${i}"></div></div>
        </div>`).join("")}
      <div class="grid">
        <label class="fld"><span>Bons d'enregistrement (quantité) <small>(gratuit le 1er, 150 € au-delà)</small></span>
          <input type="number" step="1" min="0" data-scope="telephonie" data-key="bonsEnregistrement" value="${esc(t.bonsEnregistrement)}"></label>
      </div>
    </div>

    <div class="subgrid"><h4>Financement du matériel</h4>
      <div class="grid">
        <label class="fld money"><span>Rachat contrat actuel</span>${euroWrap(`<input type="number" step="any" inputmode="decimal" data-scope="telephonie" data-key="rachat" value="${esc(t.rachat)}">`)}</label>
        <label class="fld money"><span>Cadeaux</span>${euroWrap(`<input type="number" step="any" inputmode="decimal" data-scope="telephonie" data-key="cadeaux" value="${esc(t.cadeaux)}">`)}</label>
        <label class="fld"><span>Détail des cadeaux</span>
          <input type="text" data-scope="telephonie" data-key="cadeauxLabel" value="${esc(t.cadeauxLabel)}"></label>
        <label class="fld money"><span>Marge</span>${euroWrap(`<input type="number" step="any" inputmode="decimal" data-scope="telephonie" data-key="marge" value="${esc(t.marge)}">`)}</label>
        <label class="fld"><span>Durée</span>
          <select data-scope="telephonie" data-key="dureeAnnee">
            <option value="3" ${num(t.dureeAnnee) === 3 ? "selected" : ""}>3 ans</option>
            <option value="4" ${num(t.dureeAnnee) === 4 ? "selected" : ""}>4 ans</option>
            <option value="5" ${num(t.dureeAnnee) === 5 ? "selected" : ""}>5 ans</option>
          </select></label>
      </div>
    </div>`;
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
  const res = document.getElementById("tel-results"); if (!res) return;
  res.innerHTML = `
    <h2>Synthèse Téléphonie</h2>
    <div class="totals">
      <div class="tot"><span>Abonnements mensuels</span><b>${eur(r.abonnementsMensuels)}</b>
        <small class="tot-detail">Système : ${eur(r.systemeTotal)} · Data/options : ${eur(r.dataTotal)} · Mobile : ${eur(r.mobileTotal)}</small></div>
      <div class="tot"><span>FAS <small>(non récurrent)</small></span><b>${eur(r.fas)}</b></div>
      <div class="tot"><span>Installation <small>(non récurrent)</small></span><b>${eur(r.installation)}</b></div>
      <div class="tot"><span>Matériel financé (total)</span><b>${eur(r.totalMaterielFas)}</b>
        <small class="tot-detail">Matériel : ${eur(r.materielTotal)} · Bons d'enregistrement : ${eur(r.bonsTotal)}</small></div>
      <div class="tot"><span>Location mensuelle matériel</span><b>${eur(r.totalLocation)}</b>
        <small class="tot-detail">Coefficient ${frNum(r.coeff, 2)} · ${esc(t.dureeAnnee)} ans</small></div>
      <div class="tot big pos"><span>Total mensuel tout inclus</span><b>${eur(r.totalMensuel)}</b></div>
    </div>`;
}
