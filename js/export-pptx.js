/* ============================================================
   Export PowerPoint : réutilise le modèle complet (31 slides)
   comme gabarit et n'injecte que les données.
   - slides 1 / 4 / 27 / 30 / 31 : jetons {{…}}
   - slide 26 : tableaux SA (haut) / SP (bas), une ligne par
     machine ; le bloc SP descend selon le nombre de lignes SA.
   ============================================================ */

const ROW_H = 573542;
const SA_EXT_CY = 2586982;
const SP_EXT_CY = 2635026;
const SP_OFF_Y = 6942042;
const SP_TITLE_Y = 6167707;

function xmlEsc(v) {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function moneyP(v, ht) {
  const n = num(v), dec = Number.isInteger(n) ? 0 : 2;
  return frNum(n, dec) + (ht ? " € HT" : " €");
}
function moneyPlain(v) { const n = num(v); return frNum(n, Number.isInteger(n) ? 0 : 2); }

/* Nombre de pages sans le mot « Pages » (slide 26). */
function pagesNum(v) { return num(v).toLocaleString("fr-FR", { maximumFractionDigits: 0 }); }

/* Total des abonnements & services pour un côté (sa/sp) d'une machine. */
function servicesTotal(r, side) {
  return (r.services || []).reduce((a, s) => a + num(s[side]), 0);
}

/* Jetons d'une ligne de tableau slide 26 (par période). */
function rowTokens(pfx, r, div) {
  const side = pfx === "SA" ? r.sa : r.sp;
  const svcTotal = servicesTotal(r, pfx === "SA" ? "sa" : "sp");
  return {
    [`${pfx}_TYPE`]: side.model, [`${pfx}_FIN`]: side.fin,
    [`${pfx}_LOYER`]: moneyP(side.loyer / div, false),
    [`${pfx}_VNB`]: pagesNum(side.volNB / div), [`${pfx}_VCOUL`]: pagesNum(side.volCoul / div),
    [`${pfx}_PASS`]: svcTotal ? moneyP(svcTotal / div, false) : "0",
    [`${pfx}_FNB`]: "0", [`${pfx}_FCOUL`]: "0",
    [`${pfx}_CCNB`]: ccFmt(side.ccNB), [`${pfx}_CCCOUL`]: ccFmt(side.ccCoul),
    [`${pfx}_CE`]: moneyP((side.total - side.loyer) / div, false),
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
function buildSlide26(xml, calc) {
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
    DUR_TRIM: String(state.durationTrim),
    PROP_MACHINE_1: props[0] || "",
    PROP_LOYER_1: loyer(0),
    EMAINT_VAL: emaint > 0 ? moneyP(emaint / div, false) : "Offert",
    SUM_VALEUR: moneyPlain(calc.spLoyerTotal / div),
    SUM_CC_NB: ccPlain(first.ccNB), SUM_CC_COUL: ccPlain(first.ccCoul),
  };
}

async function exportPptx(state, calc) {
  const resp = await fetch("assets/template.pptx", { cache: "reload" });
  if (!resp.ok) throw new Error("Gabarit PowerPoint introuvable (assets/template.pptx)");
  const zip = await JSZip.loadAsync(await resp.arrayBuffer());

  const s26path = "ppt/slides/slide26.xml";
  zip.file(s26path, buildSlide26(await zip.file(s26path).async("string"), calc));

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
  downloadBlob(blob, fileName(state, "pptx"));
}
