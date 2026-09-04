/* ============================================================
   Moteur de calcul SA / SP.

   Tous les montants internes sont calculés au TRIMESTRE. La
   périodicité (T/M) ne change que l'affichage (÷3 pour le mois),
   sauf le loyer proposé dont le coefficient est majoré de 1,5 %
   en paiement mensuel.
   ============================================================ */

function num(v) {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(",", ".").replace(/\s/g, ""));
  return isFinite(n) ? n : 0;
}

/* Volume le plus élevé des 2 (forfait+dépassement vs réel) — utilisé pour le rachat. */
function maxVol(forfait, depass, reel) {
  return Math.max(num(forfait) + num(depass), num(reel));
}
/* Volume facturé en maintenance :
   - dépassement > 0  -> forfait + dépassement (pages réellement imprimées) ;
   - sinon            -> volume réel (sous-consommation : on ne facture que le réel),
     à défaut le forfait. Le coût page saisi est celui du forfait engagé. */
function billedMaint(forfait, depass, reel) {
  forfait = num(forfait); depass = num(depass); reel = num(reel);
  if (depass > 0) return forfait + depass;
  return reel > 0 ? reel : forfait;
}

/* Tranche (index 0/1/2) pour un montant financé. */
function trancheIndex(financed) {
  for (let i = 0; i < TRANCHES.length; i++) if (financed < TRANCHES[i]) return i;
  return TRANCHES.length - 1;
}

/* Coefficient trimestriel de base : override admin sinon barème. */
function baseCoeff(state, financed) {
  const ov = num(state.coeffOverride);
  if (state.coeffOverride !== "" && ov > 0) return ov;
  const table = BAREME[state.leaser] || BAREME.GRENKE;
  const row = table[state.durationTrim];
  if (!row) return 0;
  return row[trancheIndex(financed)];
}
/* Coefficient effectif (majoré en mensuel). */
function effCoeff(state, financed) {
  return baseCoeff(state, financed) * (state.periodicite === "M" ? MAJ_MENSUEL : 1);
}

/* Rachat du contrat actuel. */
function rachatMachine(m) {
  const loyer = num(m.loyerActuel), trim = num(m.trimRestants);
  const base = loyer * trim;
  if (!m.prospect) return base; // client Levad : solde des loyers restants
  // prospect (chez un concurrent) : loyers + 10% + maintenance + abonnements.
  // Le rachat se base sur le volume le plus élevé des 2.
  const maintNB = maxVol(m.forfaitNB, m.depassNB, m.volNBreel) * num(m.ccNBactuel);
  const maintCoul = maxVol(m.forfaitCoul, m.depassCoul, m.volCoulReel) * num(m.ccCoulActuel);
  const abos = (m.services || []).reduce((a, s) => a + num(s.sa), 0);
  return base * 1.10 + (maintNB + maintCoul + abos) * trim;
}

/* Montant financé déduit d'un loyer trimestriel cible (mode "loyer -> marge").
   Le coefficient dépend de la tranche du montant financé : on cherche la tranche
   auto-cohérente ; en cas d'ambiguïté (bord de tranche) on retient le meilleur
   (montant financé le plus élevé = plus de marge). */
function financedFromLoyer(state, loyerT) {
  const majo = state.periodicite === "M" ? MAJ_MENSUEL : 1;
  const ov = num(state.coeffOverride);
  if (state.coeffOverride !== "" && ov > 0) return loyerT * 100 / (ov * majo);
  const row = (BAREME[state.leaser] || BAREME.GRENKE)[state.durationTrim];
  if (!row) return 0;
  const cands = [];
  row.forEach((cb, ti) => { const fin = loyerT * 100 / (cb * majo); if (trancheIndex(fin) === ti) cands.push(fin); });
  if (cands.length) return Math.max(...cands);
  // aucune tranche cohérente : on prend celle dont le montant est le plus proche d'une borne
  let best = 0, bestErr = Infinity;
  row.forEach((cb, ti) => {
    const fin = loyerT * 100 / (cb * majo);
    const lo = ti === 0 ? 0 : TRANCHES[ti - 1], hi = TRANCHES[ti];
    const err = fin < lo ? lo - fin : (fin >= hi ? fin - hi : 0);
    if (err < bestErr) { bestErr = err; best = fin; }
  });
  return best;
}

function computeMachine(m, state) {
  const rachat = rachatMachine(m);
  const prixComplet = num(m.prixMachine) + num(m.livraison) + num(m.portageLivraison) +
                      num(m.retrait) + num(m.portageRetrait) + num(m.installation);
  const div = perDivisor(state);

  let financed, marge, spLoyer;
  if (m.margeMode === "loyer") {
    // on saisit le loyer proposé (par période) -> on en déduit la marge
    const loyerT = num(m.loyerCible) * div;
    financed = financedFromLoyer(state, loyerT);
    marge = financed - rachat - prixComplet - num(m.cadeaux);
    spLoyer = loyerT;
  } else {
    // on saisit la marge -> on calcule le loyer
    marge = num(m.marge);
    financed = rachat + prixComplet + marge + num(m.cadeaux);
    spLoyer = financed * effCoeff(state, financed) / 100;
  }
  const coeffT = baseCoeff(state, financed);

  // volume AFFICHÉ (réel) : dépassement -> forfait+dépass, sinon volume réel
  const billedNB = billedMaint(m.forfaitNB, m.depassNB, m.volNBreel);
  const billedCoul = billedMaint(m.forfaitCoul, m.depassCoul, m.volCoulReel);
  // volume de COÛT (le plus élevé) : max(forfait+dépass, réel)
  const maxNB = maxVol(m.forfaitNB, m.depassNB, m.volNBreel);
  const maxCoul = maxVol(m.forfaitCoul, m.depassCoul, m.volCoulReel);
  // volumes proposés : auto (facturé) sauf si l'utilisateur a saisi un override
  const has = (v) => v !== "" && v !== null && v !== undefined;
  const spVolNB = has(m.spVolNB) ? num(m.spVolNB) : billedNB;
  const spVolCoul = has(m.spVolCoul) ? num(m.spVolCoul) : billedCoul;

  // SA : coût calculé sur le volume le plus élevé, mais on affichera le volume réel
  const saMaintNB = maxNB * num(m.ccNBactuel);
  const saMaintCoul = maxCoul * num(m.ccCoulActuel);
  const spMaintNB = spVolNB * num(m.ccNBpropose);
  const spMaintCoul = spVolCoul * num(m.ccCoulPropose);

  const services = (m.services || []).map((s) => ({ label: s.label, sa: num(s.sa), sp: num(s.sp) }))
    .filter((s) => s.sa || s.sp); // seulement les services avec un montant
  const saServ = services.reduce((a, s) => a + s.sa, 0);
  const spServ = services.reduce((a, s) => a + s.sp, 0);

  const saTotal = num(m.loyerActuel) + saMaintNB + saMaintCoul + saServ;
  const spTotal = spLoyer + spMaintNB + spMaintCoul + spServ;

  return {
    rachat, financed, coeffT, prixComplet, marge, spLoyerT: spLoyer,
    cadeaux: num(m.cadeaux), cadeauxLabel: m.cadeauxLabel || "",
    billedNB, billedCoul, services,
    sa: {
      model: m.currentModel || "Machine actuelle", fin: "Location",
      loyer: num(m.loyerActuel), volNB: billedNB, volCoul: billedCoul,
      ccNB: num(m.ccNBactuel), ccCoul: num(m.ccCoulActuel),
      maintNB: saMaintNB, maintCoul: saMaintCoul, servTotal: saServ, total: saTotal,
    },
    sp: {
      model: m.proposedModel || "Machine proposée", fin: "Location",
      loyer: spLoyer, volNB: spVolNB, volCoul: spVolCoul,
      ccNB: num(m.ccNBpropose), ccCoul: num(m.ccCoulPropose),
      maintNB: spMaintNB, maintCoul: spMaintCoul, servTotal: spServ, total: spTotal,
    },
  };
}

function computeAll(state) {
  const rows = state.machines.map((m) => computeMachine(m, state));
  const sum = (side, key) => rows.reduce((a, r) => a + r[side][key], 0);
  const saTotal = sum("sa", "total"), spTotal = sum("sp", "total");
  const savingQuarter = saTotal - spTotal;
  return {
    rows, saTotal, spTotal,
    savingQuarter, savingYear: savingQuarter * 4,
    spLoyerTotal: sum("sp", "loyer"),
    rachatTotal: rows.reduce((a, r) => a + r.rachat, 0),
    durationTrim: state.durationTrim,
    divisor: state.periodicite === "M" ? 3 : 1,
  };
}

/* -------- Périodicité -------- */
function perDivisor(state) { return state.periodicite === "M" ? 3 : 1; }
function perUnit(state) { return state.periodicite === "M" ? "MOIS" : "TRIMESTRE"; }
function perAdj(state) { return state.periodicite === "M" ? "mensuelle" : "trimestrielle"; }
function perAdjCap(state) { return state.periodicite === "M" ? "Mensuelle" : "Trimestrielle"; }
function perAdjMasc(state) { return state.periodicite === "M" ? "Mensuel" : "Trimestriel"; }
function perShort(state) { return state.periodicite === "M" ? "/ mois" : "/ trim"; }

/* -------- Formatage à la française -------- */
function frNum(v, dec = 2) {
  return num(v).toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function moneySmart(v, ht) {
  const n = num(v), dec = Number.isInteger(n) ? 0 : 2;
  return frNum(n, dec) + (ht ? " € HT" : " €");
}
function eur(v, dec = 2) { return frNum(v, dec) + " €"; }
function pages(v) { return num(v).toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " Pages"; }
function ccFmt(v) { return num(v).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 6 }) + " €"; }
function ccPlain(v) { return num(v).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 6 }); }

/* -------- Email & téléphone du commercial -------- */
function autoEmail(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 1 || !parts[0]) return "";
  const strip = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9-]/g, "").toLowerCase();
  const prenom = strip(parts[0]);
  const nom = parts.slice(1).map(strip).join("");
  if (!prenom) return "";
  return (nom ? prenom[0] + nom : prenom) + "@levad.fr";
}
function repEmail(company) {
  if (company.repEmailManual && company.repEmail) return company.repEmail;
  return autoEmail(company.repName) || company.repEmail || "";
}
/* Ligne téléphone : fixe seul, ou "fixe / portable" si portable saisi. */
function repPhoneLine(company) {
  const fixe = company.repPhone || "";
  const mob = company.repMobile || "";
  return mob ? (fixe ? fixe + " / " + mob : mob) : fixe;
}

/* -------- Dates -------- */
function dateLong(iso) {
  if (!iso) return "";
  const [y, mo, d] = iso.split("-").map(Number);
  const mois = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  return `${d} ${mois[mo - 1]} ${y}`;
}
function dateShort(iso) {
  if (!iso) return "";
  const [y, mo, d] = iso.split("-");
  return `${d}/${mo}/${y}`;
}
