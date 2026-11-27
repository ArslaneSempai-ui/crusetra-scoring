/**
 * LA MESURE PUBLIQUE DE L'AMÉTHYSTE, ÉPROUVÉE — l'arithmétique refaite au crayon, les
 * absents DÉRIVÉS, les deux moitiés jamais fusionnées, le scellé qui refuse la retouche.
 * Les témoins nourrissent les fonctions PURES de facteurs scriptés et de dossiers écrits
 * ICI, jamais ceux du lot A-L2.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PALIERS, type Registre, type Facteur } from "./facteur.ts";
import { exigerDossier } from "./dossier.ts";
import { registre } from "./facteurs/index.ts";
import { chargerDossiersEtiquetes, jeuSynthetique, DOSSIERS_PRIVES, type DossierEtiquete } from "./synthetic.ts";
import { jeuPresent, raisonAbsent } from "./jeux.ts";
import { empreinteDuReleve, scelleIntact } from "./empreinte.ts";
import { TABLES } from "./assumptions.ts";
import {
  ASSEZ_PAR_ISSUE, GRAINE_PUBLIQUE, VARIANTES_PAR_DOSSIER, PHRASE_PROVENANCE,
  celluleRecommandee, construireReleve, estEscalade, exigerDroitDEcraser, mesurerDossiers,
} from "./measure.ts";

/** Un facteur scripté : le score est lu dans une table par identifiant de dossier. */
const scripte = (id: (typeof PALIERS)[number], rang: number, notes: Record<string, number>): Facteur => ({
  id, rang, description: `scripted witness factor ${id}`, tablesLues: ["paysRisque"],
  score: (d) => notes[d.id] ?? 0,
});

/** Un dossier minimal valide, la nature demandée. */
const dossierMinimal = (id: string, nature: DossierEtiquete["nature"]): DossierEtiquete => ({
  ...exigerDossier({
    id, kind: "individual", residence: "FR", activity: "salaried", products: ["card"],
    pep: "none", adverseMedia: false, ownershipLayers: 0, beneficialOwnerNamed: true,
    opaqueJurisdiction: false, onboarding: "branch", relationshipDays: 1_000,
    declaredTurnover: 30_000, observedTurnover: 31_000, cashRatio: 0.1,
    crossBorderRatio: 0.1, dormantDays: 0, reviewedAt: "2026-09-01",
  }), nature, raison: "hand-written witness dossier",
});

function jeuTemoin(assez = ASSEZ_PAR_ISSUE, marqueur = ""): DossierEtiquete[] {
  return [
    ...Array.from({ length: assez }, (_, i) => dossierMinimal(`e-${i}${marqueur}`, "shell-layers")),
    ...Array.from({ length: assez }, (_, i) => dossierMinimal(`m-${i}${marqueur}`, "salaried")),
  ];
}
const enVariantes = (jeu: DossierEtiquete[]): DossierEtiquete[] => jeu.map((d) => ({ ...d, id: `${d.id}~v1` }));

test("mesurerDossiers : l'arithmétique d'une cellule se refait au crayon, et la grille est complète", () => {
  const dossiers = [
    dossierMinimal("e-a", "shell-layers"), dossierMinimal("e-b", "cash-intensive"),
    dossierMinimal("m-a", "salaried"), dossierMinimal("m-b", "retiree"), dossierMinimal("m-c", "local-shop"),
  ];
  const r: Registre = new Map([["geography", scripte("geography", 1, { "e-a": 0.9, "e-b": 0.6, "m-a": 0.55, "m-b": 0.1, "m-c": 0.95 })]]);
  const t = mesurerDossiers(r, dossiers, TABLES)["geography"]!;
  assert.deepEqual({ succes: t["0.60"]!.rappel.succes, n: t["0.60"]!.rappel.n }, { succes: 2, n: 2 });
  assert.deepEqual({ succes: t["0.60"]!.fauxPositifs.succes, n: t["0.60"]!.fauxPositifs.n }, { succes: 1, n: 3 });
  assert.equal(t["0.95"]!.rappel.succes, 0);
  assert.equal(t["0.95"]!.fauxPositifs.succes, 1, ">= est la règle : 0,95 tire encore au seuil 0,95");
  assert.equal(Object.keys(t).length, 51);
  let precedent = Number.POSITIVE_INFINITY;
  for (const seuil of Object.keys(t)) {
    assert.ok(t[seuil]!.rappel.succes <= precedent, `rappel remonte au seuil ${seuil}`);
    precedent = t[seuil]!.rappel.succes;
  }
});

test("les absents sont DÉRIVÉS : amputer le registre change la liste, sans toucher au code", () => {
  const deux: Registre = new Map([["geography", scripte("geography", 1, {})], ["tenure", scripte("tenure", 7, {})]]);
  const m = construireReleve(jeuTemoin(), enVariantes(jeuTemoin()), deux, TABLES, "2026-09-08", "temoin");
  assert.deepEqual(m.paliers.presents, ["geography", "tenure"]);
  assert.deepEqual(m.paliers.absents, PALIERS.filter((p) => p !== "geography" && p !== "tenure"));
  const complet = construireReleve(jeuTemoin(), enVariantes(jeuTemoin()), registre(), TABLES, "2026-09-08", "temoin");
  assert.deepEqual(complet.paliers.absents, [], "le registre du lot A-L1 est complet : aucun absent");
});

test("les deux moitiés ne se fusionnent JAMAIS, et le mélange est un refus nommé dans les deux sens", () => {
  const r: Registre = new Map([["geography", scripte("geography", 1, {})]]);
  const ecrits = jeuTemoin();
  const variantes = enVariantes(jeuTemoin());
  const seul = mesurerDossiers(r, ecrits, TABLES);
  const m = construireReleve(ecrits, variantes, r, TABLES, "2026-09-08", "temoin");
  assert.deepEqual(m.authored.tables, seul, "la table authored est IDENTIQUE avec ou sans moitié synthétique à côté");
  assert.equal(m.authored.nEscalated, ASSEZ_PAR_ISSUE);
  assert.equal(m.synthetic.nMaintained, ASSEZ_PAR_ISSUE);
  assert.throws(() => construireReleve([...ecrits, variantes[0]!], variantes, r, TABLES, "d", "c"), /never merged/);
  assert.throws(() => construireReleve(ecrits, [...variantes, ecrits[0]!], r, TABLES, "d", "c"), /never merged/);
  const maigre = ecrits.filter(estEscalade).slice(0, ASSEZ_PAR_ISSUE - 1).concat(ecrits.filter((d) => !estEscalade(d)));
  assert.throws(() => construireReleve(maigre, variantes, r, TABLES, "d", "c"),
    new RegExp(`at least ${ASSEZ_PAR_ISSUE} of EACH`));
});

test("le scellé refuse la retouche d'un seul succès", () => {
  const r: Registre = new Map([["geography", scripte("geography", 1, {})]]);
  const m = construireReleve(jeuTemoin(), enVariantes(jeuTemoin()), r, TABLES, "2026-09-08", "temoin");
  m.empreinte = empreinteDuReleve(m);
  assert.equal(scelleIntact(m as unknown as Record<string, unknown>), true);
  const retouche = JSON.parse(JSON.stringify(m)) as typeof m;
  retouche.authored.tables["geography"]!["0.50"]!.rappel.succes += 1;
  assert.equal(scelleIntact(retouche as unknown as Record<string, unknown>), false);
});

test("la moitié synthétique est déterministe à graine fixe, sur le jeu écrit",
  { skip: jeuPresent(DOSSIERS_PRIVES) ? false : raisonAbsent(DOSSIERS_PRIVES) }, () => {
  const ecrits = chargerDossiersEtiquetes();
  const a = jeuSynthetique(ecrits, GRAINE_PUBLIQUE, VARIANTES_PAR_DOSSIER);
  const b = jeuSynthetique(ecrits, GRAINE_PUBLIQUE, VARIANTES_PAR_DOSSIER);
  assert.equal(empreinteDuReleve(a), empreinteDuReleve(b));
  assert.equal(a.length, ecrits.length * VARIANTES_PAR_DOSSIER);
});

test("l'écrasement d'un relevé scellé exige le drapeau ; un relevé abîmé se réécrit sans cérémonie", () => {
  const dossier = mkdtempSync(join(tmpdir(), "amethyste-releve-"));
  try {
    const chemin = join(dossier, "releve-public.json");
    assert.doesNotThrow(() => exigerDroitDEcraser(chemin, []));
    const releve: Record<string, unknown> = { version: 1, valeur: 42 };
    releve.empreinte = empreinteDuReleve(releve);
    writeFileSync(chemin, JSON.stringify(releve));
    assert.throws(() => exigerDroitDEcraser(chemin, []), /--yes-overwrite/);
    assert.doesNotThrow(() => exigerDroitDEcraser(chemin, ["--yes-overwrite"]));
    releve.valeur = 43;
    writeFileSync(chemin, JSON.stringify(releve));
    assert.doesNotThrow(() => exigerDroitDEcraser(chemin, []));
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});

test("la cellule recommandée applique la règle d'optimise : zéro fausse alerte bat le rang moins cher", () => {
  /* geography traîne UN maintenu au-dessus de tous ses escaladés (0,99 contre 0,96) ;
     tenure sépare parfaitement mais coûte plus cher. La règle préfère tenure. */
  const dossiers = jeuTemoin();
  const fuite: Record<string, number> = {};
  const parfait: Record<string, number> = {};
  for (const d of dossiers) {
    fuite[d.id] = estEscalade(d) ? 0.96 : (d.id === "m-0" ? 0.99 : 0.2);
    parfait[d.id] = estEscalade(d) ? 0.96 : 0.2;
  }
  const r: Registre = new Map([
    ["geography", scripte("geography", 1, fuite)], ["tenure", scripte("tenure", 7, parfait)],
  ]);
  const m = construireReleve(dossiers, enVariantes(dossiers), r, TABLES, "2026-09-08", "temoin");
  const choix = celluleRecommandee(m, r, 0.8);
  assert.ok(choix);
  assert.equal(choix.palier, "tenure");
  assert.equal(choix.faussesAlertes.successes, 0);
  assert.equal(celluleRecommandee(m, r, 0.999), null, "une exigence que rien ne tient rend null");
});

test("le relevé porte la phrase de provenance en toutes lettres, et la photo des TABLES voyage avec lui", () => {
  const r: Registre = new Map([["geography", scripte("geography", 1, {})]]);
  const m = construireReleve(jeuTemoin(), enVariantes(jeuTemoin()), r, TABLES, "2026-09-08", "temoin");
  assert.ok(m.authored.provenance.includes(PHRASE_PROVENANCE));
  assert.ok(m.synthetic.provenance.includes(PHRASE_PROVENANCE));
  assert.deepEqual(m.tables, TABLES, "les tables photographiées : les changer change les scores");
});
