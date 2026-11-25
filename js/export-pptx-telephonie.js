/* ============================================================
   Export PowerPoint — Offre Télécom : réutilise le modèle commercial
   fourni par LEVAD (10 slides) comme gabarit et n'injecte que les
   données du client + les chiffres calculés par le simulateur
   Téléphonie. Mêmes mécanismes que export-pptx.js (jetons {{…}}).
   - slide 1 : jetons de couverture (client, date, commercial) + logo
     client inséré dans le badge (si fourni), sinon badge retiré.
   - slide 2 : lettre d'accompagnement (client, date, contact).
   - slide 5 : flotte mobile — retirée si aucun forfait mobile proposé.
   - slide 8 : budget mensuel total (HT uniquement, pas de TTC).
   - slide 9 : « Ce que vous économisez » — retirée si la Situation
     Actuelle (Téléphonie → carte « Situation actuelle ») n'a pas été
     saisie (telSaIsFilled).
   Les autres slides (infrastructure, matériel type, fonctionnalités,
   installation/maintenance) sont génériques et ne changent pas d'un
   client à l'autre — à adapter à la main si besoin (ex. slide 4,
   matériel installé, reste un exemple type). */

function xmlEscTel(v) {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* Première ligne non vide d'un tableau connectivités — le gabarit
   n'affiche qu'une seule ligne Internet en synthèse (slide 8). */
function firstNonEmpty(arr, pred) { return (arr || []).find(pred) || null; }
function telFirstMobile(t) { return (t.mobiles || []).find((m) => m.forfait && num(m.quantite) > 0) || null; }
function telMobileHasAny(t) { return (t.mobiles || []).some((m) => m.forfait && num(m.quantite) > 0); }

/* Description courte du matériel proposé (slide 8) — liste les articles
   choisis ; repli générique si rien n'est encore saisi. */
function telMaterielDesc(t) {
  const parts = (t.materiels || []).filter((m) => m.type && num(m.quantite) > 0).map((m) => `${m.type} \u00d7${num(m.quantite)}`);
  return parts.length ? parts.join(", ") : "Postes téléphoniques et accessoires";
}
/* Description courte du bloc "Communications & maintenance" (slide 8) :
   système choisi + nombre d'utilisateurs/lignes — maintenance illimitée
   est toujours incluse (modèle LEVAD, cf. slide 7). */
function telCommsDesc(state) {
  const t = state.telephonie;
  const centrex = t.systeme !== "trunk";
  const qty = centrex ? num(t.centrex.utilisateurs) : num(t.trunk.lignesSimultanees);
  const unit = centrex ? "utilisateurs" : "lignes simultanées";
  return `${centrex ? "Centrex" : "Trunk"}, ${qty} ${unit}, mobiles, maintenance illimitée`;
}

function scalarTokensTelephonie(state, r) {
  const c = state.client, co = state.company, t = state.telephonie;
  const rates = currentTelRates();
  const sa = r.sa;

  const conn = firstNonEmpty(t.connectivites, (x) => x.type);
  const mobile = telFirstMobile(t);
  const mobileQty = mobile ? num(mobile.quantite) : 0;
  const mobileUnitPrice = mobile ? telMobilePrix(mobile.forfait) : 0;

  const sysQty = t.systeme !== "trunk" ? num(t.centrex.utilisateurs) : num(t.trunk.lignesSimultanees);
  // Répartition du budget mensuel (slide 8) en 3 postes, cohérente avec la
  // Synthèse de l'écran : Location (financement matériel) + Internet (lien(s)
  // seuls) + Communications & maintenance (tout le reste des abonnements).
  const budgetLocation = r.totalLocationMensuel;
  const budgetInternet = r.connPrixTotal;
  const budgetComms = r.systemeTotal + r.mobileTotal + r.gtrTotal + r.secours4gTotal + r.secours5gTotal;
  const budgetTotal = r.totalMensuel;
  const saCommsHT = sa.abosMonthly + sa.maintMonthly;
  const TVA = 1.20;

  return {
    DATE: dateShort(c.date), DATE_LONG: dateLong(c.date),
    CLIENT_NAME: c.name || "Client", CLIENT_CONTACT: c.contact || "Madame, Monsieur,",
    CLIENT_ADDR_FULL: [c.addr1, c.addr2].filter(Boolean).join(", "),
    REP_NAME: co.repName || "", REP_PHONE: co.repPhone || "", REP_MOBILE: co.repMobile || "",
    REP_EMAIL: repEmail(co),
    DUR_TRIM: String(state.durationTrim),

    TEL_MOBILE_QTY: String(mobileQty),
    TEL_MOBILE_FORFAIT_LABEL: mobile ? mobile.forfait : "",
    TEL_MOBILE_UNIT_PRICE: eur(mobileUnitPrice) + " HT",
    TEL_MOBILE_TOTAL: eur(mobileQty * mobileUnitPrice) + " HT",
    TEL_SIM_FAS: eur(rates.carteSim) + " HT",

    TEL_BUDGET_TOTAL: eur(budgetTotal),
    TEL_BUDGET_TOTAL_TTC: eur(budgetTotal * TVA),
    TEL_INTERNET_NOTE: conn ? `Internet ${conn.operateur || conn.type} inclus dans ce total` : "Connectivité incluse dans ce total",
    TEL_MATERIEL_DESC: telMaterielDesc(t),
    TEL_BUDGET_LOCATION: eur(budgetLocation),
    TEL_COMMS_DESC: telCommsDesc(state),
    TEL_BUDGET_COMMS: eur(budgetComms),
    TEL_INTERNET_TYPE: conn ? conn.type : "Internet",
    TEL_INTERNET_OPERATEUR: conn ? (conn.operateur || "") : "Votre lien actuel",
    TEL_BUDGET_INTERNET: eur(budgetInternet),
    TEL_SYS_QTY: String(sysQty),

    SA_LOC_HT: eur(sa.locMonthly),
    SA_COMMS_HT: eur(saCommsHT),
    SA_TOTAL_HT: eur(sa.totalMensuel),
    SA_TOTAL_TTC: eur(sa.totalMensuel * TVA),
    SA_RACHAT_TOTAL: frNum(sa.rachatTotal, 2),
    TEL_ECO_ANNUELLE_HT: eur(r.economieAnnuelle),
    TEL_ECO_ANNUELLE_TTC: eur(r.economieAnnuelle * TVA),
    TEL_ECO_MENSUELLE_HT: eur(r.economieMensuelle),
    TEL_ECO_MENSUELLE_TTC: eur(r.economieMensuelle * TVA),
    TEL_ECO_CONTRAT_HT: frNum(r.economieMensuelle * 3 * state.durationTrim, 0),
  };
}

/* Logo client sur la slide 1 : inséré dans le badge blanc arrondi
   ("Blason") prévu par le gabarit, à la place du blason d'exemple —
   redimensionné en conservant ses proportions (contain, centré). Le
   logo client est toujours un PNG (re-encodé au chargement, cf.
   loadClientLogo dans app.js), donc pas besoin de détecter le format.
   Sans logo fourni, le badge (fond blanc + image) est retiré du gabarit. */
async function layoutClientLogoTelephonie(zip, state) {
  const slidePath = "ppt/slides/slide1.xml";
  let xml = await zip.file(slidePath).async("string");
  const picRe = /<p:pic>(?:(?!<\/p:pic>)[\s\S])*r:embed="rId4"(?:(?!<\/p:pic>)[\s\S])*<\/p:pic>/;
  const picMatch = picRe.exec(xml);
  if (!picMatch) return; // gabarit inattendu : on laisse tel quel

  const dataUrl = state.client.logo;
  const m = dataUrl && /^data:image\/png;base64,(.*)$/i.exec(dataUrl);
  if (!m) {
    xml = xml.replace(/<p:sp>(?:(?!<\/p:sp>)[\s\S])*name="Blason"(?:(?!<\/p:sp>)[\s\S])*<\/p:sp>/, "");
    xml = xml.replace(picMatch[0], "");
    zip.file(slidePath, xml);
    return;
  }

  const bin = atob(m[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  let { w: nw, h: nh } = await imageNaturalSize(dataUrl);
  const BOX_X = 617220, BOX_Y = 3598164, BOX_W = 731520, BOX_H = 801929; // zone du badge, cf. gabarit
  let cx = BOX_W, cy = BOX_H;
  if (nw && nh) {
    const scale = Math.min(BOX_W / nw, BOX_H / nh);
    cx = Math.round(nw * scale); cy = Math.round(nh * scale);
  }
  const x = Math.round(BOX_X + (BOX_W - cx) / 2), y = Math.round(BOX_Y + (BOX_H - cy) / 2);

  zip.file("ppt/media/image3.png", bytes);
  const newPic = picMatch[0].replace(
    /<a:off x="\d+" y="\d+"\/><a:ext cx="\d+" cy="\d+"\/>/,
    `<a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/>`
  );
  xml = xml.replace(picMatch[0], newPic);
  zip.file(slidePath, xml);
}

/* Retire une slide du gabarit (sldIdLst, relations, Content_Types et les
   parties elles-mêmes) — utilisé pour la flotte mobile (slide 5, si
   aucun forfait proposé) et "Ce que vous économisez" (slide 9, si la SA
   n'a pas été saisie). Sans effet si la slide est déjà absente. */
async function removeSlideByFilename(zip, fileName) {
  const relsPath = "ppt/_rels/presentation.xml.rels";
  let rels = await zip.file(relsPath).async("string");
  const relRe = new RegExp(`<Relationship Id="(rId\\d+)"[^>]*Target="slides/${fileName}"\\s*/>`);
  const relMatch = relRe.exec(rels);
  if (!relMatch) return;
  const rId = relMatch[1];
  zip.file(relsPath, rels.replace(relMatch[0], ""));

  let pres = await zip.file("ppt/presentation.xml").async("string");
  pres = pres.replace(new RegExp(`<p:sldId id="\\d+" r:id="${rId}"\\s*/>`), "");
  zip.file("ppt/presentation.xml", pres);

  let ct = await zip.file("[Content_Types].xml").async("string");
  ct = ct.replace(new RegExp(`<Override PartName="/ppt/slides/${fileName}"[^>]*/>`), "");
  zip.file("[Content_Types].xml", ct);

  zip.remove(`ppt/slides/${fileName}`);
  zip.remove(`ppt/slides/_rels/${fileName}.rels`);
}

async function exportPptxTelephonie(state, r) {
  const resp = await fetch("assets/template-telephonie.pptx", { cache: "reload" });
  if (!resp.ok) throw new Error("Gabarit PowerPoint Télécom introuvable (assets/template-telephonie.pptx)");
  const zip = await JSZip.loadAsync(await resp.arrayBuffer());

  if (!telMobileHasAny(state.telephonie)) await removeSlideByFilename(zip, "slide5.xml");
  if (!r.saFilled) await removeSlideByFilename(zip, "slide9.xml");

  await layoutClientLogoTelephonie(zip, state);

  const scal = scalarTokensTelephonie(state, r);
  const slides = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p));
  for (const p of slides) {
    let x = await zip.file(p).async("string");
    if (x.indexOf("{{") < 0) continue;
    for (const [k, v] of Object.entries(scal)) x = x.split("{{" + k + "}}").join(xmlEscTel(v));
    zip.file(p, x);
  }

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    compression: "DEFLATE",
  });
  downloadBlob(blob, fileName(state, "pptx", "Offre_Telecom"));
}
