/* ============================================================
   Export PowerPoint — Offre Télécom : réutilise le modèle commercial
   complet (42 slides) fourni par LEVAD comme gabarit et n'injecte que
   les données du client + les chiffres calculés par le simulateur
   Téléphonie. Mêmes mécanismes que export-pptx.js (jetons {{…}}).
   - slide 1 : jetons de couverture (date, commercial)
   - slide 4 : lettre d'accompagnement (client, date, contact)
   - slide 39 : synthèse tarifaire (système, internet, mobile, financement)
   Les autres slides (catalogue produits, infrastructure, mentions
   légales…) sont génériques et ne changent pas d'un client à l'autre.
   Le tableau comparatif « situation actuelle / solution proposée »
   (slide 40) n'est pas rempli automatiquement : le simulateur ne suit
   pas le contrat actuel du client, il reste à compléter à la main. */

function xmlEscTel(v) {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* Première ligne non vide d'un tableau connectivités/mobiles — le gabarit
   n'affiche qu'une seule ligne Internet / Mobile en synthèse (comme
   PROP_MACHINE_1 côté Impression pour la première machine). */
function firstNonEmpty(arr, pred) { return (arr || []).find(pred) || null; }

function scalarTokensTelephonie(state, r) {
  const c = state.client, co = state.company, t = state.telephonie;
  const centrex = t.systeme !== "trunk";
  const qty = num(centrex ? t.centrex.utilisateurs : t.trunk.lignesSimultanees);

  const conn = firstNonEmpty(t.connectivites, (x) => x.type);
  const mobile = firstNonEmpty(t.mobiles, (m) => m.forfait && num(m.quantite) > 0);
  const mobileMontant = mobile ? num(mobile.quantite) * telMobilePrix(mobile.forfait) : 0;

  return {
    DATE: dateShort(c.date), DATE_LONG: dateLong(c.date),
    CLIENT_NAME: c.name || "Client", CLIENT_ADDR1: c.addr1 || "", CLIENT_ADDR2: c.addr2 || "",
    CLIENT_CONTACT: c.contact || "nos services",
    REP_NAME: co.repName || "", REP_PHONE: co.repPhone || "", REP_MOBILE: co.repMobile || "",
    REP_EMAIL: repEmail(co),
    TEL_DUREE: String(state.durationTrim),
    TEL_QTY: String(qty),
    TEL_UNIT_PRICE: frNum(qty > 0 ? r.totalMensuel / qty : 0, 2),
    TEL_INTERNET_TYPE: conn ? conn.type : "—",
    TEL_INTERNET_PRIX: eur(conn ? num(conn.prix) : 0),
    TEL_MOBILE_LABEL: mobile ? `${num(mobile.quantite)}x ${mobile.forfait}` : "—",
    TEL_MOBILE_PRIX: eur(mobileMontant),
    TEL_LEASING_MENSUEL: eur(r.totalLocationMensuel),
    TEL_ABOS_MENSUEL: eur(r.abonnementsMensuels),
  };
}

async function exportPptxTelephonie(state, r) {
  const resp = await fetch("assets/template-telephonie.pptx", { cache: "reload" });
  if (!resp.ok) throw new Error("Gabarit PowerPoint Télécom introuvable (assets/template-telephonie.pptx)");
  const zip = await JSZip.loadAsync(await resp.arrayBuffer());

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
