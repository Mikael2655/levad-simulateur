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

/* Bloc « nom du client + logo » sur la slide 1 (« ZoneTexte 4 ») —
   coordonnées EMU. Largeur fixe (celle de la zone d'origine) ; hauteur du
   logo cible légèrement supérieure à celle du logo LEVAD de la même page
   (779564 EMU, « Image 16 ») pour qu'il ne paraisse pas plus petit, largeur
   plafonnée pour ne pas déborder. Le nom et le logo sont centrés ensemble
   sur le même axe vertical que la mise en page d'origine (centre du bloc
   nom 1-2 lignes + logo tel que conçu initialement). */
const NAME_BOX_X = 495300, NAME_BOX_W = 2667000;
const LOGO_CENTER_X = NAME_BOX_X + NAME_BOX_W / 2; // 1828800
const GROUP_CENTER_Y = 1507137;
const LOGO_TARGET_H = 800000;
const LOGO_MAX_W = 3600000;
const NAME_MAX_PT = 32, NAME_MIN_PT = 14, NAME_MAX_LINES = 2;
const NAME_LINE_HEIGHT_FACTOR = 1.2;
const NAME_LOGO_GAP = 60000;
const EMU_PER_PT = 12700;

/* Contexte canvas 2D pour mesurer le texte (largeur réelle selon la police) ;
   null si indisponible (ex. environnement de test sans support canvas) —
   un repli par estimation de largeur de caractère est alors utilisé. */
function get2dContext() {
  try {
    const c = document.createElement("canvas");
    return c.getContext && c.getContext("2d");
  } catch (e) { return null; }
}
function emuToPx(emu) { return (emu / EMU_PER_PT) * (96 / 72); }
function textWidthPx(ctx2d, text, fontSizePt) {
  if (ctx2d) {
    ctx2d.font = `bold ${Math.round(fontSizePt * (96 / 72))}px Arial, sans-serif`;
    return ctx2d.measureText(text).width;
  }
  // repli sans canvas : largeur moyenne approximative d'un caractère en gras
  return text.length * fontSizePt * (96 / 72) * 0.55;
}
/* Retour à la ligne (mot par mot) pour tenir dans `maxWidthPx`. */
function wrapTextLines(ctx2d, text, fontSizePt, maxWidthPx) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (!cur || textWidthPx(ctx2d, test, fontSizePt) <= maxWidthPx) cur = test;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}
/* Cherche la plus grande taille de police (entre NAME_MAX_PT et NAME_MIN_PT)
   qui tient dans NAME_MAX_LINES lignes ; à défaut, garde la taille minimale
   (avec autant de lignes que nécessaire) plutôt que de tronquer. */
function fitClientName(name, boxWidthEMU) {
  const ctx2d = get2dContext();
  const boxWidthPx = emuToPx(boxWidthEMU);
  let last = { pt: NAME_MIN_PT, lines: wrapTextLines(ctx2d, name, NAME_MIN_PT, boxWidthPx) };
  for (let pt = NAME_MAX_PT; pt >= NAME_MIN_PT; pt--) {
    const lines = wrapTextLines(ctx2d, name, pt, boxWidthPx);
    last = { pt, lines };
    if (lines.length <= NAME_MAX_LINES) return last;
  }
  return last;
}

function xmlEsc(v) {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function moneyP(v, ht) {
  const n = num(v), dec = Number.isInteger(n) ? 0 : 2;
  return frNum(n, dec) + (ht ? " € HT" : " €");
}
function moneyPlain(v) { const n = num(v); return frNum(n, Number.isInteger(n) ? 0 : 2); }

/* Nombre de pages sans le mot « Pages » (slide 25). */
function pagesNum(v) { return frLocale(num(v), { maximumFractionDigits: 0 }); }

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

/* Nom du client + logo sur la slide 1 (« ZoneTexte 4 ») : le nom est réduit
   autant que nécessaire pour tenir sur 1-2 lignes dans la largeur de la
   zone, et le logo (si fourni) est placé juste en dessous, redimensionné
   comme avant. Les deux sont ensuite centrés ensemble sur GROUP_CENTER_Y,
   qu'il y ait 1, 2 lignes de nom (ou plus, pour un nom extrêmement long).
   Si le nom tient tel quel (taille pleine, ≤2 lignes) et qu'il n'y a pas de
   logo, la zone d'origine du modèle n'est pas modifiée. */
async function layoutClientNameAndLogo(zip, state) {
  const name = state.client.name || "Client";
  const dataUrl = state.client.logo;
  const m = dataUrl && /^data:image\/(png|jpe?g);base64,(.*)$/i.exec(dataUrl);
  const hasLogo = !!m;

  const fit = fitClientName(name, NAME_BOX_W);
  const needsLayout = hasLogo || fit.pt < NAME_MAX_PT || fit.lines.length > NAME_MAX_LINES;
  if (!needsLayout) return;

  let logoCx = 0, logoCy = 0, logoBytes = null, logoExt = "";
  if (hasLogo) {
    logoExt = m[1].toLowerCase() === "jpg" ? "jpeg" : m[1].toLowerCase();
    const bin = atob(m[2]);
    logoBytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) logoBytes[i] = bin.charCodeAt(i);
    let { w: nw, h: nh } = await imageNaturalSize(dataUrl);
    if (!nw || !nh) { nw = 1; nh = 1; }
    let scale = LOGO_TARGET_H / nh;
    logoCx = Math.round(nw * scale); logoCy = LOGO_TARGET_H;
    if (logoCx > LOGO_MAX_W) { scale = LOGO_MAX_W / nw; logoCx = LOGO_MAX_W; logoCy = Math.round(nh * scale); }
  }

  const lineHeightEMU = Math.round(fit.pt * NAME_LINE_HEIGHT_FACTOR * EMU_PER_PT);
  const nameHeight = fit.lines.length * lineHeightEMU;
  const gap = hasLogo ? NAME_LOGO_GAP : 0;
  const total = nameHeight + gap + logoCy;
  const top = Math.round(GROUP_CENTER_Y - total / 2);
  const nameBoxY = top;
  const logoY = top + nameHeight + gap;

  const slidePath = "ppt/slides/slide1.xml";
  let xml = await zip.file(slidePath).async("string");

  // remplace la zone de texte du nom (position/taille + un <a:p> par ligne)
  const nameIdx = xml.indexOf('name="ZoneTexte 4"');
  const spStart = xml.lastIndexOf("<p:sp>", nameIdx);
  const spEnd = xml.indexOf("</p:sp>", nameIdx) + "</p:sp>".length;
  const oldSp = xml.slice(spStart, spEnd);
  const newParas = fit.lines.map((line) =>
    `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="fr-FR" sz="${Math.round(fit.pt * 100)}" b="1" dirty="0"/><a:t>${xmlEsc(line)}</a:t></a:r></a:p>`
  ).join("");
  let newSp = oldSp.replace(
    /<a:xfrm><a:off x="495300" y="\d+"\/><a:ext cx="2667000" cy="\d+"\/><\/a:xfrm>/,
    `<a:xfrm><a:off x="${NAME_BOX_X}" y="${nameBoxY}"/><a:ext cx="${NAME_BOX_W}" cy="${nameHeight}"/></a:xfrm>`
  );
  newSp = newSp.replace(/<p:txBody>[\s\S]*<\/p:txBody>/, (whole) => {
    const bodyPrMatch = /^<p:txBody><a:bodyPr[^>]*>(?:<a:spAutoFit\/>)?<\/a:bodyPr>/.exec(whole);
    const bodyPr = bodyPrMatch ? bodyPrMatch[0] : "<p:txBody><a:bodyPr wrap=\"square\" rtlCol=\"0\"><a:spAutoFit/></a:bodyPr>";
    return `${bodyPr}<a:lstStyle/>${newParas}</p:txBody>`;
  });
  xml = xml.slice(0, spStart) + newSp + xml.slice(spEnd);

  if (hasLogo) {
    const x = Math.round(LOGO_CENTER_X - logoCx / 2), y = logoY;
    const mediaName = `clientlogo.${logoExt}`;
    zip.file(`ppt/media/${mediaName}`, logoBytes);

    const relsPath = "ppt/slides/_rels/slide1.xml.rels";
    let rels = await zip.file(relsPath).async("string");
    const usedRids = [...rels.matchAll(/Id="rId(\d+)"/g)].map((mm) => parseInt(mm[1], 10));
    const nextRid = "rId" + (Math.max(0, ...usedRids) + 1);
    rels = rels.replace(
      "</Relationships>",
      `<Relationship Id="${nextRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaName}"/></Relationships>`
    );
    zip.file(relsPath, rels);

    const usedIds = [...xml.matchAll(/<p:cNvPr id="(\d+)"/g)].map((mm) => parseInt(mm[1], 10));
    const nextId = Math.max(0, ...usedIds) + 1;
    const pic = `<p:pic><p:nvPicPr><p:cNvPr id="${nextId}" name="Logo client"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
      `<p:blipFill><a:blip r:embed="${nextRid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
      `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${logoCx}" cy="${logoCy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
    xml = xml.replace("</p:spTree>", pic + "</p:spTree>");
  }

  zip.file(slidePath, xml);
}

async function exportPptx(state, calc) {
  const resp = await fetch("assets/template.pptx", { cache: "reload" });
  if (!resp.ok) throw new Error("Gabarit PowerPoint introuvable (assets/template.pptx)");
  const zip = await JSZip.loadAsync(await resp.arrayBuffer());

  const s25path = "ppt/slides/slide25.xml";
  zip.file(s25path, buildSlide25(await zip.file(s25path).async("string"), calc));

  await layoutClientNameAndLogo(zip, state);

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
