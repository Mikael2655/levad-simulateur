#!/usr/bin/env python3
"""Extrait le catalogue Canon (gammes -> machines -> moteur/accessoires,
désignation + prix HT + descriptif) du PDF tarifaire fourni par LEVAD, et
génère assets/catalog.json (+ assets/catalog-meta.json) utilisés par le
configurateur du simulateur.

À relancer chaque mois quand LEVAD transmet un PDF tarifaire à jour.

Usage : python3 tools/parse_canon_catalog.py TARIFS.pdf [SORTIE.json]
Dépendance : PyMuPDF (pip install pymupdf)

Repérage dans le PDF (constaté sur l'édition novembre 2026, à revérifier si
la mise en page du PDF change d'une édition à l'autre — c'est déjà arrivé
entre juillet et novembre 2026, voir l'historique git de ce fichier pour
l'ancien format « taux de remise + Prix de Cession HT ») :
- en-tête de page (taille ~14, y<=45) : gamme à gauche (x<250), nom de la
  machine en cours à droite (x>=250) - présent sur CHAQUE page.
- titres de section (taille >=13.5, y>50, colonne de gauche) : "MOTEUR/
  SOLUTION D'IMPRESSION" et "ACCESSOIRES" sont conservés ; les autres
  ("SERVICES PROFESSIONNELS", "FORFAIT GESTION DU NIVEAU DE SERVICE",
  "ENCRE", "AGRAFES", "TAMBOUR", "TONER", "LOGICIEL"...) sont ignorés.
- dans une section conservée, chaque ligne d'article porte sur une seule
  ligne visuelle : désignation (x<385), puis "Unité", puis Prix base HT,
  Qté, Prix public HT (toujours identique au Prix base HT dans cette
  édition - les deux colonnes sont donc interchangeables, Prix base HT est
  retenu par convention). Le code article (ex. "7187C002AA") apparaît en
  marge gauche (x<120), sur la même ligne que le 1er paragraphe du
  descriptif qui suit - il est ignoré (non utilisé par le configurateur).
- contrairement à l'édition juillet 2026, le texte n'est plus brouillé
  (plus de police anti-copier/coller côté Canon) : l'extraction directe du
  texte du PDF suffit, aucun OCR n'est nécessaire.

Remise LEVAD : depuis novembre 2026, Canon ne fournit plus de taux de
remise par ligne dans le PDF (ancien format "juillet 2026", abandonné) —
seul le Prix base HT (= prix public) est donné. On applique donc nous-
mêmes une règle fixe, indépendante du PDF, décidée avec LEVAD :
- machine avec Wi-Fi intégré de base (pas en option) + tous ses
  accessoires : remise de 23 % sur le prix public.
- machine où le Wi-Fi ("Wireless LAN board") est une option (carte réseau
  sans fil en accessoire) : remise de 47 % sur la machine elle-même et les
  licences de vitesse (ppm), 45 % sur ses accessoires.
Le Wi-Fi intégré/en option est détecté automatiquement à partir du
descriptif Canon (voir classify_wifi ci-dessous) ; si c'est ambigu pour un
modèle (ni accessoire Wi-Fi identifié, ni mention Wi-Fi dans le moteur),
aucune remise n'est appliquée et le modèle est listé en fin d'exécution
pour vérification manuelle — mieux vaut un prix public visible (trop haut,
donc repéré) qu'une remise appliquée au hasard.
"""
import json
import os
import re
import sys
import unicodedata

import fitz

WIFI_ACCESSORY_RE = re.compile(r"wireless lan|carte r[ée]seau sans fil|carte wi-?fi|carte wifi", re.I)
WIFI_MENTION_RE = re.compile(r"wi-?fi|wlan", re.I)
RATE_WIFI_INCLUDED = 0.23
RATE_OPTIONAL_ENGINE = 0.47     # machine (imageFORCE/iR-Advance) + licences de vitesse (ppm)
RATE_OPTIONAL_ACCESSORY = 0.45  # accessoires de ces machines

MONTH_NAMES = {
    "janvier": 1, "fevrier": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6,
    "juillet": 7, "aout": 8, "septembre": 9, "octobre": 10, "novembre": 11, "decembre": 12,
}


def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def classify_wifi(machine):
    """True = Wi-Fi inclus de base (23 %) ; False = Wi-Fi en option (47 %/45 %) ;
    None = ambigu, remise non appliquée (à vérifier à la main)."""
    has_wifi_accessory = any(
        WIFI_ACCESSORY_RE.search(it["designation"]) or WIFI_ACCESSORY_RE.search(it.get("description", ""))
        for it in machine["accessories"]
    )
    if has_wifi_accessory:
        return False
    if any(WIFI_MENTION_RE.search(it.get("description", "")) for it in machine["engine"]):
        return True
    return None


def apply_discount(machine, wifi_included):
    for section, rate in (
        ("engine", RATE_WIFI_INCLUDED if wifi_included else RATE_OPTIONAL_ENGINE),
        ("accessories", RATE_WIFI_INCLUDED if wifi_included else RATE_OPTIONAL_ACCESSORY),
    ):
        for it in machine[section]:
            it["price"] = round(it["price"] * (1 - rate), 2)


def parse_tariff_month(doc):
    """Lit « <Mois> <Année> » (ex. "Novembre 2026") sur la page de couverture -> "2026-11"."""
    if doc.page_count == 0:
        return ""
    text = strip_accents(doc[0].get_text()).lower()
    m = re.search(r"(" + "|".join(MONTH_NAMES) + r")\s+(\d{4})", text)
    return f"{m.group(2)}-{MONTH_NAMES[m.group(1)]:02d}" if m else ""

CATEGORIES = [
    "OFFICE - IMPRIMANTES LASER",
    "OFFICE - MULTIFONCTIONS I-SENSYS",
    "OFFICE - SYSTEMES D'IMPRESSION NOIR & BLANC",
    "OFFICE - SYSTEMES D'IMPRESSION COULEUR",
]
KEEP_SECTIONS = {"MOTEUR/SOLUTION D'IMPRESSION", "ACCESSOIRES"}
SECTION_MIN_SIZE = 13.5
DESC_LEFT_MARGIN = 120  # sous cette abscisse : code article (marge gauche), ignoré


def norm(s):
    return re.sub(r"\s+", " ", s).strip().upper()


def page_spans(page):
    """Tous les segments de texte de la page, aplatis : (y, x, size, texte)."""
    spans = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                t = span["text"].strip()
                if t:
                    spans.append((span["bbox"][1], span["bbox"][0], span["size"], t))
    return spans


def group_rows(spans, ytol=2.0):
    """Regroupe les segments par ligne visuelle (même y), triés gauche->droite."""
    rows = []
    for s in sorted(spans, key=lambda s: (s[0], s[1])):
        y = s[0]
        for row in rows:
            if abs(row["y"] - y) <= ytol:
                row["spans"].append(s)
                break
        else:
            rows.append({"y": y, "spans": [s]})
    rows.sort(key=lambda r: r["y"])
    for row in rows:
        row["spans"].sort(key=lambda s: s[1])
    return rows


def running_header(spans):
    """Gamme + nom de machine courants, lus dans l'en-tête de page."""
    left, right = [], []
    for y, x, size, t in spans:
        if size < SECTION_MIN_SIZE or y > 45:
            continue
        (left if x < 250 else right).append((y, x, t))
    left.sort()
    right.sort()
    return " ".join(t for _, _, t in left).strip(), " ".join(t for _, _, t in right).strip()


def parse_amount(text):
    """'1 156,13 €' / '425,35 €' -> 1156.13 / 425.35 ; None si non reconnu."""
    cleaned = text.replace("€", "").replace("\xa0", " ")
    cleaned = re.sub(r"\s+", "", cleaned)
    if not re.fullmatch(r"\d+,\d+", cleaned):
        return None
    return round(float(cleaned.replace(",", ".")), 2)


def parse(src):
    doc = fitz.open(src)
    catalog = {cat: {} for cat in CATEGORIES}
    cur_machine_key = None

    for pno in range(doc.page_count):
        page = doc[pno]
        spans = page_spans(page)
        cat, name = running_header(spans)
        cat_match = next((c for c in CATEGORIES if norm(c) == norm(cat)), None)
        if cat_match is None or not name:
            continue

        machine_key = (cat_match, name)
        if machine_key != cur_machine_key:
            cur_machine_key = machine_key
            catalog[cat_match].setdefault(name, {"engine": [], "accessories": []})
        machine = catalog[cat_match][name]

        section_ys = []  # [(y, nom_section, conservée?)]
        for y, x, size, t in spans:
            if size >= SECTION_MIN_SIZE and y > 50:
                section_ys.append((round(y, 1), norm(t)))

        rows = group_rows(spans)

        # 1re passe : repère chaque ligne d'article (désignation + prix), dans
        # l'ordre de la page, sans encore lire son descriptif.
        cur_section = None
        found = []  # [{y, section, designation, price, target}]
        for row in rows:
            y = round(row["y"], 1)
            for sy, sname in section_ys:
                if abs(sy - y) <= 2.0:
                    cur_section = sname
                    break
            texts = [s[3] for s in row["spans"]]
            if "Unité" not in texts or "Désignation" in texts:
                continue  # pas une ligne d'article (ou ligne d'en-tête de colonnes)
            if cur_section not in KEEP_SECTIONS:
                continue
            idx = texts.index("Unité")
            designation = " ".join(texts[:idx]).strip()
            rest = texts[idx + 1:]
            if len(rest) < 3:
                continue
            price = parse_amount(rest[0])
            qty_ok = re.fullmatch(r"\d+", rest[1])
            if not designation or price is None or not qty_ok:
                continue
            target = machine["engine"] if cur_section == "MOTEUR/SOLUTION D'IMPRESSION" else machine["accessories"]
            found.append({"y": row["y"], "designation": designation, "price": price, "target": target})

        # 2e passe : le descriptif de chaque article va de sa propre ligne
        # jusqu'à la ligne de l'article suivant (ou un titre de section, ou le
        # bas de page) - jamais au-delà, quelle que soit la mise en forme du
        # titre d'article. Le code article en marge gauche (x<120) est exclu.
        boundaries = sorted({sy for sy, _ in section_ys} | {page.rect.height})
        for i, it in enumerate(found):
            next_item_y = found[i + 1]["y"] if i + 1 < len(found) else page.rect.height
            next_b = min([next_item_y] + [b for b in boundaries if b > it["y"] + 4])
            desc_spans = [s for s in spans if it["y"] + 4 < s[0] < next_b and s[1] >= DESC_LEFT_MARGIN]
            desc_rows = group_rows(desc_spans)
            description = " ".join(" ".join(s[3] for s in row["spans"]) for row in desc_rows).strip()
            target = it["target"]
            if not any(x["designation"] == it["designation"] and x["price"] == it["price"] for x in target):
                target.append({"designation": it["designation"], "price": it["price"], "description": description})

    doc.close()
    out = {}
    for cat, machines in catalog.items():
        out[cat] = [
            {"name": name, "engine": data["engine"], "accessories": data["accessories"]}
            for name, data in machines.items()
            if data["engine"] or data["accessories"]
        ]
    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    src = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) > 2 else "assets/catalog.json"
    meta_path = os.path.join(os.path.dirname(out_path), "catalog-meta.json") if os.path.dirname(out_path) else "catalog-meta.json"

    doc = fitz.open(src)
    tariff_month = parse_tariff_month(doc)
    doc.close()

    catalog = parse(src)

    ambiguous = []
    for cat, machines in catalog.items():
        for m in machines:
            wifi = classify_wifi(m)
            m["wifiIncluded"] = wifi
            if wifi is None:
                ambiguous.append(f"{cat} / {m['name']}")
            else:
                apply_discount(m, wifi)

    with open(out_path, "w", encoding="utf8") as f:
        json.dump(catalog, f, ensure_ascii=False, separators=(",", ":"))
    with open(meta_path, "w", encoding="utf8") as f:
        json.dump({"tariffMonth": tariff_month}, f, ensure_ascii=False)

    total = sum(len(m["engine"]) + len(m["accessories"]) for ms in catalog.values() for m in ms)
    print(f"Catalogue écrit : {out_path}")
    print(f"Métadonnées écrites : {meta_path} (tariffMonth = {tariff_month or '??? non détecté'})")
    for cat, machines in catalog.items():
        print(f"  {cat} : {len(machines)} machines")
    print(f"Total articles : {total}")
    if ambiguous:
        print("\nATTENTION — Wi-Fi ambigu (ni accessoire Wi-Fi, ni mention Wi-Fi au moteur) : AUCUNE remise "
              "appliquée sur ces modèles, prix publics bruts à vérifier et corriger à la main :")
        for a in ambiguous:
            print("  -", a)


if __name__ == "__main__":
    main()
