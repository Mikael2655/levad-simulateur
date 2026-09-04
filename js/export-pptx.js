/* ============================================================
   Export PowerPoint : réutilise le modèle complet (29 slides)
   comme gabarit et n'injecte que les données.
   - slides 1 / 3 / 24 / 26 / 28 / 29 : jetons {{…}}
   - slide 25 : tableaux SA (haut) / SP (bas), une ligne par
     machine ; le bloc SP descend selon le nombre de lignes SA.
   - slide 1 : logo du client inséré comme image (si fourni).
   ============================================================ */

const ROW_H = 916791;
const SA_EXT_CY = 2589373;
const SP_EXT_CY = 2589373;
const SP_OFF_Y = 6671125;
const SP_TITLE_Y = 6167707;

/* Emplacement réservé au logo client sur la slide 1 (zone basse de
   « ZoneTexte 4 », sous le nom du client) — coordonnées EMU. */
const LOGO_BOX = { x: 645300, y: 1357137, maxW: 2367000, maxH: 517218 };

function xmlEsc(v) {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function moneyP(v, ht) {
  const n = num(v), dec = Number.isInteger(n) ? 0 : 2;
  return frNum(n, dec) + (ht ? " € HT" : " €");
}
function moneyPlain(v) { const n = num(v); return frNum(n, Number.isInteger(n) ? 0 : 2); }

/* Nombre de pages sans le mot « Pages » (slide 25). */
function pagesNum(v) { return num(v).toLocaleString("fr-FR", { maximumFractionDigits: 0 }); }

/* Total des abonnements & services pour un côté (sa/sp) d'une machine. */
function servicesTotal(r, side) {
  return (r.services || []).reduce((a, s) => a + num(s[side]), 0);
}

/* Jetons d'une ligne de tableau slide 25 (par période). */
function rowTokens(pfx, r, div) {
  const side = pfx === "SA" ? r.sa : r.sp;
  const svcTotal = servicesTotal(r, pfx === "SA" ? "sa" : "sp");
  return {
    [`${pfx}_TYPE`]: side.model, [`${pfx}_FIN`]: side.fin,
    [`${pfx}_LOYER`]: moneyP(side.loyer / div, false),
    [`${pfx}_VNB`]: pagesNum(side.volNB / div), [`${pfx}_VCOUL`]: pagesNum(side.volCoul / div),
    [`${pfx}_PASS`]: svcTotal ? moneyP(svcTotal / div, false) : "0",
    [`${pfx}_CCNB`]: ccFmt(side.ccNB), [`${pfx}_CCCOUL`]: ccFmt(side.ccCoul),
    [`${pfx}_MAINT`]: moneyP((side.total - side.loyer) / div, false),
    [`${pfx}_TOTAL`]: moneyP(side.total / div, false),
  };
}
function fillRow(xml, tokens) {
  let out = xml;
  for (const [k, v] of Object.entries(tokens)) out = out.split("{{" + k + "}}").join(xmlEsc(v));
  return out;
}
function expandTable(xml, pfx, rows, div) {
  const idx = xml.indexOf(`{{${pfx}_TYPE}}`);
  if (idx < 0) return { xml, count: 1 };
  const start = xml.lastIndexOf("<a:tr ", idx);
  const end = xml.indexOf("</a:tr>", idx) + "</a:tr>".length;
  const template = xml.slice(start, end);
  const built = rows.map((r) => fillRow(template, rowTokens(pfx, r, div))).join("");
  return { xml: xml.slice(0, start) + built + xml.slice(end), count: rows.length };
}
function buildSlide25(xml, calc) {
  const div = calc.divisor;
  let r = expandTable(xml, "SA", calc.rows, div); xml = r.xml; const nSA = r.count;
  r = expandTable(xml, "SP", calc.rows, div); xml = r.xml; const nSP = r.count;
  const dSA = (nSA - 1) * ROW_H;
  if (dSA > 0) {
    xml = xml.replace(`cy="${SA_EXT_CY}"`, `cy="${SA_EXT_CY + dSA}"`);
    xml = xml.replace(`y="${SP_OFF_Y}"`, `y="${SP_OFF_Y + dSA}"`);
    xml = xml.replace(`y="${SP_TITLE_Y}"`, `y="${SP_TITLE_Y + dSA}"`);
  }
  const dSP = (nSP - 1) * ROW_H;
  if (dSP > 0) xml = xml.replace(`cy="${SP_EXT_CY}"`, `cy="${SP_EXT_CY + dSP}"`);
  return xml;
}

/* Total des frais de livraison facturés (toutes machines) — montant HT
   ponctuel, non divisé par la périodicité. */
function livraisonPrixToken(calc) {
  const total = (calc.rows || []).reduce((a, r) => a + num(r.fraisLivraisonFacturer), 0);
  return total > 0 ? moneyP(total, true) : "offerte";
}

function scalarTokens(state, calc) {
  const c = state.client, co = state.company, div = calc.divisor;
  const props = state.machines.map((m) => m.proposedModel).filter(Boolean);
  const loyer = (i) => (calc.rows[i] ? moneyPlain(calc.rows[i].sp.loyer / div) : "");
  // e-maintenance (SP) cumulée
  let emaint = 0;
  state.machines.forEach((m) => {
    const s = (m.services || []).find((x) => /maint/i.test(x.label));
    if (s) emaint += num(s.sp);
  });
  const first = calc.rows[0] ? calc.rows[0].sp : { ccNB: 0, ccCoul: 0 };
  return {
    DATE: dateShort(c.date), DATE_LONG: dateLong(c.date),
    CLIENT_NAME: c.name || "Client", CLIENT_CONTACT: c.contact || "Madame, Monsieur,",
    CLIENT_ADDR1: c.addr1 || "", CLIENT_ADDR2: c.addr2 || "",
    MACHINE_HEADLINE: props.join(" / ") || "Solution proposée",
    REP_NAME: co.repName || "", REP_TITLE: co.repTitle || "",
    REP_EMAIL: repEmail(co), REP_PHONE: co.repPhone || "", REP_MOBILE: co.repMobile || "",
    REP_PHONELINE: repPhoneLine(co),
    PER_UNIT: perUnit(state), PER_ADJ: perAdj(state),
    PER_ADJ_MASC: perAdjMasc(state), PER_ADJ_CAP: perAdjCap(state),
    PER_ADJ_MASC_LC: perAdjMasc(state).toLowerCase(),
    DUR_TRIM: String(state.durationTrim),
    PROP_MACHINE_1: props[0] || "",
    PROP_LOYER_1: loyer(0),
    EMAINT_VAL: emaint > 0 ? moneyP(emaint / div, false) : "Offert",
    SUM_VALEUR: moneyPlain(calc.spLoyerTotal / div),
    SUM_CC_NB: ccPlain(first.ccNB), SUM_CC_COUL: ccPlain(first.ccCoul),
    LIVRAISON_PRIX: livraisonPrixToken(calc),
  };
}

/* Dimensions naturelles d'une image à partir de son data URL. */
function imageNaturalSize(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/* Insère le logo du client (data URL) sur la slide 1, dans la zone réservée
   sous le nom du client — ajout de l'image aux médias, de la relation, et
   du <p:pic> dans le XML de la slide. Ne fait rien si aucun logo fourni. */
async function insertClientLogo(zip, dataUrl) {
  if (!dataUrl) return;
  const m = /^data:image\/(png|jpe?g);base64,(.*)$/i.exec(dataUrl);
  if (!m) return;
  const ext = m[1].toLowerCase() === "jpg" ? "jpeg" : m[1].toLowerCase();
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  let { w: nw, h: nh } = await imageNaturalSize(dataUrl);
  if (!nw || !nh) { nw = 1; nh = 1; }
  const scale = Math.min(LOGO_BOX.maxW / nw, LOGO_BOX.maxH / nh);
  const cx = Math.round(nw * scale), cy = Math.round(nh * scale);
  const x = Math.round(LOGO_BOX.x + (LOGO_BOX.maxW - cx) / 2);
  const y = Math.round(LOGO_BOX.y + (LOGO_BOX.maxH - cy) / 2);

  const mediaName = `clientlogo.${ext}`;
  zip.file(`ppt/media/${mediaName}`, bytes);

  const relsPath = "ppt/slides/_rels/slide1.xml.rels";
  let rels = await zip.file(relsPath).async("string");
  const usedRids = [...rels.matchAll(/Id="rId(\d+)"/g)].map((mm) => parseInt(mm[1], 10));
  const nextRid = "rId" + (Math.max(0, ...usedRids) + 1);
  rels = rels.replace(
    "</Relationships>",
    `<Relationship Id="${nextRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaName}"/></Relationships>`
  );
  zip.file(relsPath, rels);

  const slidePath = "ppt/slides/slide1.xml";
  let xml = await zip.file(slidePath).async("string");
  const usedIds = [...xml.matchAll(/<p:cNvPr id="(\d+)"/g)].map((mm) => parseInt(mm[1], 10));
  const nextId = Math.max(0, ...usedIds) + 1;
  const pic = `<p:pic><p:nvPicPr><p:cNvPr id="${nextId}" name="Logo client"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${nextRid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  xml = xml.replace("</p:spTree>", pic + "</p:spTree>");
  zip.file(slidePath, xml);
}

async function exportPptx(state, calc) {
  const resp = await fetch("assets/template.pptx", { cache: "reload" });
  if (!resp.ok) throw new Error("Gabarit PowerPoint introuvable (assets/template.pptx)");
  const zip = await JSZip.loadAsync(await resp.arrayBuffer());

  const s25path = "ppt/slides/slide25.xml";
  zip.file(s25path, buildSlide25(await zip.file(s25path).async("string"), calc));

  await insertClientLogo(zip, state.client.logo);

  const scal = scalarTokens(state, calc);
  const slides = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p));
  for (const p of slides) {
    let x = await zip.file(p).async("string");
    if (x.indexOf("{{") < 0) continue;
    for (const [k, v] of Object.entries(scal)) x = x.split("{{" + k + "}}").join(xmlEsc(v));
    zip.file(p, x);
  }

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    compression: "DEFLATE",
  });
  downloadBlob(blob, fileName(state, "pptx", "Proposition"));
}
