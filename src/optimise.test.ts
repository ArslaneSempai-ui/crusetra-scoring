/**
 * La frontière de l'améthyste : mêmes règles éprouvées que le bleu (borne basse, moins de
 * fausses alertes, plancher à cinq, jamais -Infinity), sur des cellules à la main.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
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
  }, null);
  m.empreinte = empreinteDuReleve(m);

  const d = mkdtempSync(join(tmpdir(), "amethyste-opt-"));
  const sain = join(d, "x-measured.json");
  writeFileSync(sain, JSON.stringify(m));
  assert.equal(lireReleve(sain).source.reviews, 30);
  assert.equal(cellulesDe(lireReleve(sain)).length, 2 * SEUILS_CLIENT.length,
    "deux facteurs factices, la grille entière chacun : le compte est TENU par la constante");

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
