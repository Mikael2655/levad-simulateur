/* ============================================================
   Export « PDF Descriptif » (jsPDF) — récapitulatif de la
   simulation : client, commercial, financement, puis pour chaque
   machine : machine & accessoires (configurateur), maintenance,
   détail de la marge.
   ============================================================ */

const PDF_MARGIN = 15;
const PDF_WIDTH = 210;
const PDF_CONTENT_W = PDF_WIDTH - PDF_MARGIN * 2;
const PDF_BOTTOM = 282;

function pdfEnsureSpace(doc, y, needed) {
  if (y + needed > PDF_BOTTOM) { doc.addPage(); return PDF_MARGIN; }
  return y;
}
function pdfSectionTitle(doc, y, text) {
  y = pdfEnsureSpace(doc, y, 14);
  doc.setFillColor(47, 82, 51);
  doc.rect(PDF_MARGIN, y, PDF_CONTENT_W, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont(undefined, "bold");
  doc.setFontSize(11);
  doc.text(text, PDF_MARGIN + 2, y + 5);
  doc.setTextColor(20, 20, 20);
  doc.setFont(undefined, "normal");
  return y + 7 + 4;
}
/* La police par défaut de jsPDF (Helvetica / WinAnsi) n'a pas de glyphe pour
   l'espace fine insécable ( / ) que toLocaleString("fr-FR") utilise comme
   séparateur de milliers : sans ce nettoyage elle s'affiche en « / ». */
function pdfSanitize(s) {
  return String(s == null ? "" : s).replace(/[  ]/g, " ");
}
function pdfLine(doc, y, label, value) {
  y = pdfEnsureSpace(doc, y, 6);
  doc.setFontSize(9.5);
  doc.setFont(undefined, "bold");
  doc.text(pdfSanitize(label) + " :", PDF_MARGIN + 2, y);
  doc.setFont(undefined, "normal");
  const text = pdfSanitize(value == null || value === "" ? "—" : value);
  doc.text(text, PDF_MARGIN + 62, y, { maxWidth: PDF_CONTENT_W - 62 });
  return y + 6;
}

function pdfMachineAccessoiresBlock(doc, y, m) {
  y = pdfSectionTitle(doc, y, "Machine & accessoires");
  const cfg = m.machineConfig;
  if (cfg && cfg.items && cfg.items.length) {
    y = pdfLine(doc, y, "Gamme", (cfg.category || "").replace(/^OFFICE - /, ""));
    y = pdfLine(doc, y, "Machine", cfg.machine);
    cfg.items.forEach((it) => {
      y = pdfLine(doc, y, "  " + it.designation, `${it.qty} × ${eur(it.price)} = ${eur(it.qty * it.price)}`);
    });
  } else {
    y = pdfLine(doc, y, "Machine proposée", m.proposedModel || "—");
    y = pdfLine(doc, y, "Prix machine", eur(num(m.prixMachine)));
  }
  return y + 2;
}

function pdfMaintenanceBlock(doc, y, m, r, div) {
  y = pdfSectionTitle(doc, y, "Maintenance");
  y = pdfLine(doc, y, "Volume N&B proposé", pages(r.sp.volNB / div));
  y = pdfLine(doc, y, "Volume couleur proposé", pages(r.sp.volCoul / div));
  y = pdfLine(doc, y, "Coût copie N&B", ccFmt(r.sp.ccNB));
  y = pdfLine(doc, y, "Coût copie couleur", ccFmt(r.sp.ccCoul));
  const activeServices = (m.services || []).filter((s) => num(s.sp));
  if (activeServices.length) {
    activeServices.forEach((s) => { y = pdfLine(doc, y, s.label || "Abonnement", eur(num(s.sp))); });
  } else {
    y = pdfLine(doc, y, "Abonnements", "aucun");
  }
  return y + 2;
}

function pdfMargeBlock(doc, y, m, r) {
  y = pdfSectionTitle(doc, y, "Détail de la marge");
  y = pdfLine(doc, y, "1. Montant financé", eur(r.financed));
  y = pdfLine(doc, y, "2. Frais de livraison facturés", eur(r.fraisLivraisonFacturer));
  y = pdfLine(doc, y, "3. Prix machine", eur(r.prixMachineEff));
  if (num(m.derogationMikael)) y = pdfLine(doc, y, "   dont dérogation Mikael", eur(num(m.derogationMikael)));
  const logistique = num(m.installation) + num(m.livraison) + num(m.portageLivraison) + num(m.retrait) + num(m.portageRetrait);
  y = pdfLine(doc, y, "4. Installation, livraison, retrait", eur(logistique));
  y = pdfLine(doc, y, "5. Rachat location", eur(r.rachatLocation));
  y = pdfLine(doc, y, "6. Rachat maintenance", eur(r.rachatMaintenance));
  y = pdfLine(doc, y, "7. Cadeau", eur(r.cadeaux));
  if (r.cadeauxLabel) y = pdfLine(doc, y, "   descriptif", r.cadeauxLabel);
  y = pdfLine(doc, y, "8. Marge", eur(r.margeFinale));
  return y + 2;
}

async function exportPdf(state, calc) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const div = calc.divisor;
  let y = PDF_MARGIN;

  doc.setFontSize(18);
  doc.setFont(undefined, "bold");
  doc.text("Descriptif de la proposition", PDF_MARGIN, y + 4);
  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  doc.text(dateShort(state.client.date), PDF_WIDTH - PDF_MARGIN, y + 4, { align: "right" });
  y += 14;

  // ---- Client ----
  const c = state.client;
  y = pdfSectionTitle(doc, y, "Client");
  y = pdfLine(doc, y, "Nom / société", c.name);
  y = pdfLine(doc, y, "Contact", c.contact);
  y = pdfLine(doc, y, "Adresse", [c.addr1, c.addr2].filter(Boolean).join(" — "));
  y = pdfLine(doc, y, "Téléphone", c.phone);
  y = pdfLine(doc, y, "Portable", c.mobile);
  y = pdfLine(doc, y, "Email", c.email);
  y = pdfLine(doc, y, "Code / interphone", c.deliveryCode);
  y = pdfLine(doc, y, "Étage", c.floor);
  y = pdfLine(doc, y, "Ascenseur", c.elevator ? "Oui" : "Non");
  y += 2;

  // ---- Commercial ----
  const co = state.company;
  y = pdfSectionTitle(doc, y, "Commercial");
  y = pdfLine(doc, y, "Nom", co.repName);
  y = pdfLine(doc, y, "Date", dateShort(c.date));
  y += 2;

  // ---- Financement ----
  y = pdfSectionTitle(doc, y, "Financement");
  y = pdfLine(doc, y, "Leaser", state.leaser);
  y = pdfLine(doc, y, "Durée", state.durationTrim + " trimestres");
  y = pdfLine(doc, y, "Périodicité", perAdjCap(state));
  y = pdfLine(doc, y, "Loyer proposé total", eur(calc.spLoyerTotal / div) + " " + perShort(state));
  y += 2;

  // ---- Par machine ----
  state.machines.forEach((m, i) => {
    const r = calc.rows[i];
    y = pdfEnsureSpace(doc, y, 10);
    doc.setFontSize(13);
    doc.setFont(undefined, "bold");
    doc.text(`Machine ${i + 1}`, PDF_MARGIN, y + 5);
    doc.setFont(undefined, "normal");
    y += 10;
    y = pdfMachineAccessoiresBlock(doc, y, m);
    y = pdfMaintenanceBlock(doc, y, m, r, div);
    y = pdfMargeBlock(doc, y, m, r);
    y += 4;
  });

  doc.save(fileName(state, "pdf"));
}
