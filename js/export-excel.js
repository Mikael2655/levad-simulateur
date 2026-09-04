/* ============================================================
   Export Excel « SA / SP type » (ExcelJS) — reprend la mise en
   forme du fichier fourni : titre, client, 2 blocs Situation
   Actuelle / Solution Proposée côte à côte, une ligne par poste
   (chaque service séparé), total et économie annuelle.
   Périodicité (trimestre/mois) selon le choix.
   ============================================================ */

const GREEN = "FF8C9D8D";
const GREEN_LT = "FFE9F0E9";

function lineFor(side, div) {
  // renvoie [ [désig, qté, pu, total] ... ] pour un côté (sa/sp)
  const out = [];
  out.push(["Location — " + side.model, 1, side.loyer / div, side.loyer / div]);
  if (side.volNB || side.maintNB) out.push(["Impressions N/B", side.volNB / div, side.ccNB, side.maintNB / div]);
  if (side.volCoul || side.maintCoul) out.push(["Impressions couleurs", side.volCoul / div, side.ccCoul, side.maintCoul / div]);
  return out;
}

async function exportExcel(state, calc) {
  const div = calc.divisor;
  const unit = perUnit(state);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Comparatif", { views: [{ showGridLines: false }] });

  // largeurs de colonnes (A..L)
  const widths = [4.8, 4.7, 24, 12, 14, 14, 3, 24, 12, 14, 14, 4.7];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  // impression : paysage A4, ajusté sur 1 page, marges réduites
  ws.pageSetup = {
    orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1,
    horizontalCentered: true, verticalCentered: true,
    margins: { left: 0.2, right: 0.2, top: 0.2, bottom: 0.2, header: 0.1, footer: 0.1 },
  };

  // logo LEVAD : dans la case C2, aligné au 1er trait vertical du tableau et
  // au haut du titre « ÉTUDE COMPARATIVE DE COÛTS »
  try {
    const buf = await (await fetch("assets/logo.png")).arrayBuffer();
    const imgId = wb.addImage({ buffer: buf, extension: "png" });
    ws.addImage(imgId, { tl: { col: 2.0, row: 1.0 }, ext: { width: 150, height: 41 } });
  } catch (e) { /* logo indisponible : on continue sans */ }

  const center = { horizontal: "center", vertical: "middle", wrapText: true };
  const money = '#,##0.00" €"';
  const ccFmtX = '#,##0.000000" €"';
  const setBorder = (cell) => (cell.border = {
    top: { style: "thin", color: { argb: "FFBFC8BF" } }, bottom: { style: "thin", color: { argb: "FFBFC8BF" } },
    left: { style: "thin", color: { argb: "FFBFC8BF" } }, right: { style: "thin", color: { argb: "FFBFC8BF" } },
  });

  // Titre
  ws.mergeCells("C2:K2");
  let c = ws.getCell("C2"); c.value = "ÉTUDE COMPARATIVE DE COÛTS"; c.font = { size: 24, bold: false }; c.alignment = center;
  ws.mergeCells("C3:K3");
  c = ws.getCell("C3"); c.value = state.client.name || "Client"; c.font = { size: 20, bold: true }; c.alignment = center;

  // En-têtes de blocs
  ws.mergeCells("C5:F5"); ws.mergeCells("H5:K5");
  [["C5", "SITUATION ACTUELLE / " + unit + " (€ HT)"], ["H5", "SOLUTION PROPOSÉE / " + unit + " (€ HT)"]].forEach(([ref, txt]) => {
    const x = ws.getCell(ref); x.value = txt; x.font = { size: 14, bold: true, color: { argb: "FFFFFFFF" } };
    x.alignment = center; x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
  });

  // En-têtes de colonnes (ligne 6)
  const heads = ["Désignation", "Quantité", "Prix unitaire HT", "Total HT"];
  [["C", "D", "E", "F"], ["H", "I", "J", "K"]].forEach((cols) => cols.forEach((col, i) => {
    const x = ws.getCell(col + "6"); x.value = heads[i]; x.font = { bold: true, size: 11 }; x.alignment = center;
    x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_LT } }; setBorder(x);
  }));

  // Corps : lignes par machine
  let row = 7;
  const putLine = (col0, line) => {
    const [desig, qte, pu, total] = line;
    const cD = ws.getCell(col0[0] + row), cQ = ws.getCell(col0[1] + row), cP = ws.getCell(col0[2] + row), cT = ws.getCell(col0[3] + row);
    cD.value = desig; cD.alignment = center; cD.font = { size: 12 };
    cQ.value = qte; cQ.alignment = center; cQ.font = { size: 12 };
    cP.value = pu; cP.alignment = center; cP.font = { size: 12 };
    cP.numFmt = desig.startsWith("Impressions") ? ccFmtX : money;
    cT.value = total; cT.alignment = center; cT.font = { size: 12, bold: true }; cT.numFmt = money;
    [cD, cQ, cP, cT].forEach(setBorder);
  };

  calc.rows.forEach((r) => {
    const saLines = lineFor(r.sa, div);
    const spLines = lineFor(r.sp, div);
    // services actifs (mêmes lignes des 2 côtés)
    r.services.forEach((s) => {
      const lbl = s.label && s.label.trim() ? s.label : "Service";
      saLines.push([lbl, 1, s.sa / div, s.sa / div]);
      spLines.push([lbl, 1, s.sp / div, s.sp / div]);
    });
    const n = Math.max(saLines.length, spLines.length);
    for (let k = 0; k < n; k++) {
      if (saLines[k]) putLine(["C", "D", "E", "F"], saLines[k]);
      if (spLines[k]) putLine(["H", "I", "J", "K"], spLines[k]);
      row++;
    }
  });

  // Totaux
  ["C", "H"].forEach((col) => { const x = ws.getCell(col + row); x.value = "TOTAL"; x.font = { bold: true, size: 12 }; x.alignment = center; setBorder(x); });
  ["D", "E", "I", "J"].forEach((col) => setBorder(ws.getCell(col + row)));
  const tf = ws.getCell("F" + row); tf.value = calc.saTotal / div; tf.numFmt = money; tf.font = { bold: true, size: 14 }; tf.alignment = center;
  tf.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_LT } }; setBorder(tf);
  const tk = ws.getCell("K" + row); tk.value = calc.spTotal / div; tk.numFmt = money; tk.font = { bold: true, size: 14 }; tk.alignment = center;
  tk.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_LT } }; setBorder(tk);
  row += 2;

  // Économie annuelle
  ws.mergeCells(`C${row}:K${row}`);
  const eco = calc.savingYear;
  const e = ws.getCell("C" + row);
  e.value = eco >= 0 ? `Soit une économie de ${frNum(eco, 0)} € HT par an`
                     : `Soit un surcoût de ${frNum(-eco, 0)} € HT par an`;
  e.font = { size: 16, bold: true, color: { argb: "FF1F5132" } }; e.alignment = center;
  e.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_LT } };
  row += 2;

  // Pied LEVAD
  ws.mergeCells(`C${row}:K${row}`);
  const f = ws.getCell("C" + row);
  f.value = "LEVAD — 135 Chemin des Bassins 94000 Créteil — 01 70 72 19 40 — contact@levad.fr";
  f.font = { size: 10, italic: true }; f.alignment = center;

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    fileName(state, "xlsx"));
}
