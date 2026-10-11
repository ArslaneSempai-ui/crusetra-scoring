/**
 * La frontière de l'améthyste : mêmes règles éprouvées que le bleu (borne basse, moins de
 * fausses alertes, plancher à cinq, jamais -Infinity), sur des cellules à la main.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  meilleureSousRappel, meilleureSousBudget, lireRappelMin, lireBudget, lireReleve,
  plusForteBorne, heuresDAnalyste, cellulesDe, MINIMUM_ESCALADES, type CellulePlacee,
} from "./optimise.ts";
import { rate } from "./interval.ts";
import { SEUILS_CLIENT } from "./facteur.ts";
import { empreinteDuReleve } from "./empreinte.ts";
import { ASSUMPTIONS, analystHourlyCost } from "./assumptions.ts";
import { mesurer, lireRevues, lireClients } from "./your-reviews.ts";
import { registreFactice } from "./your-reviews.test.ts";

function cellule(palier: string, rang: number, seuil: number, tirees: number,
  rappel: [number, number], fa: [number, number]): CellulePlacee {
  return {
    palier: palier as CellulePlacee["palier"], rang, seuil, tirees,
    rappel: rate(rappel[0], rappel[1]),
    faussesAlertes: rate(fa[0], fa[1]),
  };
}

test("sous l'exigence, la borne BASSE décide, puis le MOINS de fausses alertes gagne", () => {
  const pointHaut = cellule("geography", 1, 0.9, 50, [23, 24], [2, 100]);
  const bruyante = cellule("activity", 2, 0.8, 90, [24, 24], [40, 100]);
  const calme = cellule("behaviour", 6, 0.7, 60, [24, 24], [10, 100]);
  assert.equal(meilleureSousRappel([pointHaut, bruyante, calme], 0.85), calme);
});

test("dès CINQ escalades la borne peut tenir ; sous cinq, jamais ; vide : null, pas -Infinity", () => {
  assert.notEqual(meilleureSousRappel([cellule("geography", 1, 0.9, 10, [6, 6], [5, 100])], 0.5), null);
  assert.equal(meilleureSousRappel([cellule("geography", 1, 0.9, 10, [4, 4], [5, 100])], 0.5), null);
  const borne = plusForteBorne([cellule("geography", 1, 0.9, 10, [5, 6], [5, 100])]);
  assert.ok(borne !== null && Number.isFinite(borne));
  assert.equal(plusForteBorne([cellule("geography", 1, 0.9, 10, [4, 4], [5, 100])]), null);
});

test("sous budget mensuel : conversion par la période, borne basse maximisée", () => {
  const calme = cellule("geography", 1, 0.95, 60, [22, 24], [5, 100]);
  const fort = cellule("activity", 2, 0.80, 90, [24, 24], [30, 100]);
  assert.equal(meilleureSousBudget([calme, fort], 50, 60), fort);
  assert.equal(meilleureSousBudget([calme, fort], 35, 60), calme);
  assert.equal(meilleureSousBudget([calme, fort], 10, 60), null);
});

test("--recall et --review-budget stricts, refus en nommant ce qui a été reçu", () => {
  assert.equal(lireRappelMin("0.9"), 0.9);
  for (const brut of ["90", "90%", "", "abc", "1.5"]) assert.throws(() => lireRappelMin(brut), /not a recall/);
  assert.equal(lireBudget("200"), 200);
  for (const brut of ["0", "", "8.5", "1e3"]) assert.throws(() => lireBudget(brut), /not a budget/);
});

test("un relevé retouché est refusé AVANT la frontière, les deux empreintes citées", () => {
  const r = ["review_id,customer_id,reviewed_at,outcome"];
  const c = [("customer_id,kind,residence_country,activity_code,products,pep,"
    + "onboarding_channel,relationship_start,declared_turnover,observed_turnover,"
    + "cash_ratio,cross_border_ratio,nationality_country,ownership_layers,beneficial_owner_named")];
  for (let i = 0; i < 30; i++) {
    r.push(`x-${i},cli-${i},2026-08-30,${i < 6 ? "escalated" : "maintained"}`);
    c.push(`cli-${i},individual,FR,salaried,card,none,branch,2020-01-01,100,90,0.9,0.1,FR,,`);
  }
  const { revues } = lireRevues(r.join("\n") + "\n");
  const { parClient } = lireClients(c.join("\n") + "\n");
  const m = mesurer(revues, parClient, registreFactice(), {
    reviews: "r.csv", reviewsSha: "0".repeat(64), customers: "c.csv", customersSha: "1".repeat(64), customersRows: 30,
  }, null, undefined, undefined, 0.5);
  m.empreinte = empreinteDuReleve(m);

  const d = mkdtempSync(join(tmpdir(), "amethyste-opt-"));
  const sain = join(d, "x-measured.json");
  writeFileSync(sain, JSON.stringify(m));
  assert.equal(lireReleve(sain).source.reviews, 30);
  const gardees = cellulesDe(lireReleve(sain));
  assert.ok(gardees.length >= 2 && gardees.length <= 4, "deux facteurs factices : au plus leur cellule sous l'exigence et le seuil suivant chacun");
  assert.ok(gardees.every((c) => SEUILS_CLIENT.includes(c.seuil)), "chaque cellule gardée est sur la grille");

  const retouche = JSON.parse(JSON.stringify(m)) as typeof m;
  retouche.source.escalated = 26;
  const chemin = join(d, "retouche-measured.json");
  writeFileSync(chemin, JSON.stringify(retouche));
  assert.throws(() => lireReleve(chemin), /it carries [0-9a-f]{16}, its content computes to [0-9a-f]{16}/);
  writeFileSync(chemin, JSON.stringify({ kind: "autre-chose" }));
  assert.throws(() => lireReleve(chemin), /is not a scoring record/);
});

test("les heures d'analyste suivent les hypothèses déclarées, et le plancher vaut 5", () => {
  const h = heuresDAnalyste(40);
  assert.equal(h.heures, (40 * ASSUMPTIONS.minutesPerReview) / 60);
  assert.equal(h.usd, h.heures * analystHourlyCost());
  assert.equal(MINIMUM_ESCALADES, 5);
});

/* ─── the record keeps the cells of ONE recall floor: optimise answers that floor, and refuses the rest in words ─── */

const RACINE = fileURLToPath(new URL("..", import.meta.url));

/** A sealed record of 30 reviews (6 escalated) measured at a recall floor, written to a file; `version` 1 is the old shape's number. */
function releveScelle(rappelMin: number, version = 2): string {
  const r = ["review_id,customer_id,reviewed_at,outcome"];
  const c = [("customer_id,kind,residence_country,activity_code,products,pep,"
    + "onboarding_channel,relationship_start,declared_turnover,observed_turnover,"
    + "cash_ratio,cross_border_ratio,nationality_country,ownership_layers,beneficial_owner_named")];
  for (let i = 0; i < 30; i++) {
    r.push(`x-${i},cli-${i},2026-08-30,${i < 6 ? "escalated" : "maintained"}`);
    c.push(`cli-${i},individual,FR,salaried,card,none,branch,2020-01-01,100,90,0.9,0.1,FR,,`);
  }
  const { parClient } = lireClients(c.join("\n") + "\n");
  const m = mesurer(lireRevues(r.join("\n") + "\n").revues, parClient, registreFactice(), {
    reviews: "r.csv", reviewsSha: "0".repeat(64), customers: "c.csv", customersSha: "1".repeat(64), customersRows: 30,
  }, null, undefined, undefined, rappelMin);
  const ouvert = m as unknown as { version: number; empreinte?: string };
  ouvert.version = version;
  ouvert.empreinte = empreinteDuReleve(m);
  const chemin = join(mkdtempSync(join(tmpdir(), "amethyste-opt-cli-")), "x-measured.json");
  writeFileSync(chemin, JSON.stringify(m));
  return chemin;
}

function optimise(chemin: string, ...args: string[]): { status: number | null; sortie: string; erreur: string } {
  const maison = mkdtempSync(join(tmpdir(), "amethyste-opt-maison-"));
  const r = spawnSync(process.execPath, [join(RACINE, "src", "optimise.ts"), `--from=${chemin}`, ...args],
    { cwd: RACINE, encoding: "utf8", timeout: 120_000, env: { ...process.env, HOME: maison, USERPROFILE: maison } });
  return { status: r.status, sortie: r.stdout, erreur: r.stderr };
}

test("optimise --recall at the floor of the record prints the cell the record keeps", () => {
  const r = optimise(releveScelle(0.5), "--recall=0.5");
  assert.equal(r.status, 0, `${r.sortie}${r.erreur}`);
  assert.match(r.sortie, /recall floor 0\.5/);
  assert.match(r.sortie, /Fewest false alerts with the recall lower bound at or above 0\.5/);
  assert.match(r.sortie, /factor (geography|behaviour) at threshold 0\.\d\d/);
});

test("optimise --recall at another floor is refused in words, naming the floor of the record and the gesture, and answers nothing", () => {
  const r = optimise(releveScelle(0.5), "--recall=0.8");
  assert.equal(r.status, 2);
  assert.match(r.erreur, /only the cells for the recall floor it was measured under, 0\.5; it holds no cell for 0\.8/);
  assert.match(r.erreur, /run measure:yours again/i);
  assert.doesNotMatch(r.sortie, /Fewest false alerts/, "a refusal must not print a cell of another floor");
});

test("optimise --review-budget is refused: it needs the whole frontier, which the record no longer keeps", () => {
  const r = optimise(releveScelle(0.5), "--review-budget=200");
  assert.equal(r.status, 2);
  assert.match(r.erreur, /needs the whole frontier/);
  assert.match(r.erreur, /--recall=0\.5/, "it names the floor the record does answer");
  assert.doesNotMatch(r.sortie, /Highest bounded recall/);
});

test("a record of version 1, which held every threshold of the grid, is refused and says why", () => {
  const r = optimise(releveScelle(0.5, 1), "--recall=0.5");
  assert.equal(r.status, 2);
  assert.match(r.erreur, /is version 1 of the scoring record; this command reads version 2/);
  assert.match(r.erreur, /Re-run measure:yours/);
});
