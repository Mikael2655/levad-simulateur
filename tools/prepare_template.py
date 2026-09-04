#!/usr/bin/env python3
"""(Re)génère assets/template.pptx à partir de la présentation Offre_Commerciale
(29 diapositives, maquette 2026).

Remplace les champs dynamiques par des jetons {{…}} (run unique) et applique
les retouches statiques demandées. Le navigateur (export-pptx.js) fait ensuite
la substitution des jetons, clone les lignes de tableau par machine (slide 25)
et insère le logo du client (slide 1, si fourni dans le simulateur).

Usage : python3 tools/prepare_template.py [SOURCE.pptx] [SORTIE.pptx]
Dépendance : python-pptx
"""
import os
import sys
from copy import deepcopy
from lxml import etree
from pptx import Presentation
from pptx.oxml.ns import qn

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "Offre_Commerciale.pptx")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "assets", "template.pptx")


def shp(slide, name):
    for s in slide.shapes:
        if s.name == name:
            return s
    raise KeyError(name)


def set_para(paragraph, text):
    """Force un paragraphe à un seul run = text, en gardant le format du 1er
    run s'il y en a un ; sinon (paragraphe vide, ex. ligne prévue pour un
    champ optionnel) crée un run à partir du format de fin de paragraphe
    (endParaRPr) pour que le jeton hérite quand même de la bonne police."""
    runs = paragraph.runs
    if runs:
        runs[0].text = text
        for r in runs[1:]:
            r._r.getparent().remove(r._r)
        return
    p = paragraph._p
    endParaRPr = p.find(qn("a:endParaRPr"))
    r = p.makeelement(qn("a:r"), {})
    if endParaRPr is not None:
        rPr = deepcopy(endParaRPr)
        rPr.tag = qn("a:rPr")
        r.append(rPr)
        p.insert(list(p).index(endParaRPr), r)
    else:
        p.append(r)
    t = p.makeelement(qn("a:t"), {})
    t.text = text
    r.append(t)


def set_last_run(paragraph, text):
    """Remplace le texte du DERNIER run d'un paragraphe (garde les runs
    précédents et leur format intacts) — utile pour un paragraphe multi-runs
    dont seule la fin doit devenir un jeton."""
    runs = paragraph.runs
    if not runs:
        return
    runs[-1].text = text


def fr_all_text(prs):
    """Force lang="fr-FR" sur tous les runs (et fins de paragraphe) de toutes les
    diapositives : le modèle d'origine est tagué en anglais (lang="en-US"), ce qui
    fait souligner en rouge la quasi-totalité du texte français par le correcteur
    orthographique de PowerPoint."""
    for s in prs.slides:
        for el in s._element.iter():
            if etree.QName(el).localname in ("rPr", "defRPr", "endParaRPr"):
                el.set("lang", "fr-FR")


def main():
    prs = Presentation(SRC)
    S = prs.slides

    # ---- Slide 1 (page de garde) ----
    s1 = S[0]
    set_para(shp(s1, "TextBox 13").text_frame.paragraphs[0], "{{DATE}}")
    # bloc commercial (bas gauche) : nom / fonction / mail / portable (si saisi)
    tb14 = shp(s1, "TextBox 14").text_frame
    set_para(tb14.paragraphs[0], "{{REP_NAME}}")
    set_para(tb14.paragraphs[1], "{{REP_TITLE}}")
    set_para(tb14.paragraphs[2], "{{REP_EMAIL}}")
    set_para(tb14.paragraphs[3], "{{REP_MOBILE}}")
    # bloc société LEVAD (bas droite, statique — inclut désormais le téléphone
    # fixe déplacé depuis le bloc commercial) : rien à tokeniser.

    # bloc client (haut gauche) : nom du client (jeton) + emplacement du logo
    # client (image insérée par export-pptx.js si fournie dans le simulateur —
    # la 2e ligne "LOGO" n'est qu'un repère de mise en page, on la vide).
    ztc = shp(s1, "ZoneTexte 4").text_frame
    set_para(ztc.paragraphs[0], "{{CLIENT_NAME}}")
    set_para(ztc.paragraphs[1], "")

    # ---- Slide 3 (lettre) ----
    s3 = S[2]
    tb5 = shp(s3, "TextBox 5").text_frame
    p0 = tb5.paragraphs[0]
    p0.runs[0].text = "Paris, le "
    p0.runs[1].text = "{{DATE_LONG}}"
    for r in p0.runs[2:]:
        r._r.getparent().remove(r._r)
    set_para(tb5.paragraphs[1], "{{CLIENT_CONTACT}}")
    set_para(shp(s3, "TextBox 6").text_frame.paragraphs[0], "{{MACHINE_HEADLINE}}")
    tb7 = shp(s3, "TextBox 7").text_frame
    set_para(tb7.paragraphs[0], "{{REP_NAME}}")
    set_para(tb7.paragraphs[1], "{{REP_TITLE}}")
    set_para(tb7.paragraphs[2], "{{REP_PHONELINE}}")
    set_para(tb7.paragraphs[3], "{{REP_EMAIL}}")
    tb9 = shp(s3, "TextBox 9").text_frame
    set_para(tb9.paragraphs[0], "{{CLIENT_NAME}}")
    set_para(tb9.paragraphs[1], "{{CLIENT_ADDR1}}")
    set_para(tb9.paragraphs[2], "{{CLIENT_ADDR2}}")

    # ---- Slide 24 (conditions financières + livraison/installation) ----
    s24 = S[23]
    tb8 = shp(s24, "TextBox 8").text_frame
    set_para(tb8.paragraphs[1], " Durée : {{DUR_TRIM}} trimestres")
    set_para(tb8.paragraphs[2], " Périodicité {{PER_ADJ}}, terme à échoir")
    # tableau référence machine / loyer (1 ligne, machine principale) — l'en-tête
    # "Loyer trimestriel" est statique dans la maquette : le rendre dynamique
    # (mensuel/trimestriel selon la périodicité choisie dans le simulateur).
    tbl24 = next(s.table for s in s24.shapes if s.has_table)
    set_para(tbl24.rows[0].cells[1].text_frame.paragraphs[0], "Loyer {{PER_ADJ_MASC_LC}}")
    set_para(tbl24.rows[1].cells[0].text_frame.paragraphs[0], "{{PROP_MACHINE_1}}")
    set_para(tbl24.rows[1].cells[1].text_frame.paragraphs[0], "{{PROP_LOYER_1}} € HT")
    # "Prix de la prestation : offerte" -> jeton (offerte, ou le montant facturé
    # si des frais de livraison ont été saisis dans le simulateur)
    zt14 = shp(s24, "ZoneTexte 14").text_frame
    set_last_run(zt14.paragraphs[2], ": {{LIVRAISON_PRIX}}")

    # ---- Slide 25 (tableaux SA / SP) ----
    s25 = S[24]
    set_para(shp(s25, "TextBox 5").text_frame.paragraphs[0], "SITUATION ACTUELLE € HT / {{PER_UNIT}}")
    set_para(shp(s25, "TextBox 6").text_frame.paragraphs[0], "SOLUTION PROPOSEE € HT / {{PER_UNIT}}")
    tables = [s.table for s in s25.shapes if s.has_table]
    mapping = {0: "TYPE", 1: "FIN", 2: "LOYER", 3: "VNB", 4: "VCOUL",
               5: "PASS", 6: "CCNB", 7: "CCCOUL", 8: "MAINT", 9: "TOTAL"}
    for tbl, pfx in zip(tables, ["SA", "SP"]):
        # en-têtes "Loyer / Trimestriel" et "TOTAL / Trimestriel" -> dynamiques
        set_para(tbl.rows[0].cells[2].text_frame.paragraphs[1], "{{PER_ADJ_MASC}}")
        set_para(tbl.rows[0].cells[9].text_frame.paragraphs[1], "{{PER_ADJ_MASC}}")
        cells = tbl.rows[1].cells
        for ci, key in mapping.items():
            set_para(cells[ci].text_frame.paragraphs[0], "{{%s_%s}}" % (pfx, key))

    # ---- Slide 26 (contrat de service maintenance) ----
    s26 = S[25]
    tb10 = shp(s26, "TextBox 10").text_frame
    set_para(tb10.paragraphs[0], "Coût Copie {{PROP_MACHINE_1}} ")
    set_para(tb10.paragraphs[1], "N&B : {{SUM_CC_NB}} € HT")
    set_para(tb10.paragraphs[2], "Couleur : {{SUM_CC_COUL}} € HT")

    # ---- Slide 27 (sécurité Canon) : contenu statique, rien à faire ----

    # ---- Slide 28 (e-maintenance) ----
    s28 = S[27]
    set_para(shp(s28, "TextBox 10").text_frame.paragraphs[0], "Service E-Maintenance : {{EMAINT_VAL}}")

    # ---- Slide 29 (bon pour accord) ----
    s29 = S[28]
    tb10 = shp(s29, "TextBox 10").text_frame
    set_para(tb10.paragraphs[0], "{{REP_NAME}}")
    set_para(tb10.paragraphs[1], "{{REP_TITLE}}")
    set_para(tb10.paragraphs[2], "{{REP_PHONELINE}}")
    set_para(tb10.paragraphs[3], "{{REP_EMAIL}}")
    tb11 = shp(s29, "TextBox 11").text_frame
    set_para(tb11.paragraphs[0], " Loyer {{PER_ADJ_MASC_LC}} : {{PROP_LOYER_1}} € HT")
    set_para(tb11.paragraphs[1], " Durée du leasing : {{DUR_TRIM}} Trimestres")
    set_para(tb11.paragraphs[3], " Coût à la page en Noir et Blanc : {{SUM_CC_NB}} € HT")
    set_para(tb11.paragraphs[4], " Coût à la page en Couleur : {{SUM_CC_COUL}} € HT")

    # Correcteur orthographique : tout le modèle est tagué en anglais (en-US),
    # ce qui souligne en rouge la quasi-totalité du texte français.
    fr_all_text(prs)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    prs.save(OUT)
    print("Gabarit écrit :", OUT)
    Presentation(OUT)  # vérifie la réouverture


if __name__ == "__main__":
    main()
