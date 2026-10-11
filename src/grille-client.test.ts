/**
 * THE REPORT AND THE RECORD OF A CLIENT RUN NAME ONLY THRESHOLDS OF THE GRID.
 *
 * `PAS_CLIENT` (facteur.ts) is the step of the grid of a CLIENT record. The record keeps, per factor, its cell at the recall floor
 * and the next threshold of that grid (record-croise.test.ts measures what that lets an observer know of a weight); the report is
 * written from the record. This test runs the real registry through `executer`, reads back the Markdown and the JSON that would
 * leave the client's machine, and checks that every threshold either of them names is a threshold of the grid, never a finer
 * one: the recommended threshold, the next step, the thresholds of the cells. The detector is proven on a fabricated line first.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executer } from "./your-reviews.ts";
import { registre } from "./facteurs/index.ts";
import { tablesAvec } from "./assumptions.ts";
import { PAS_CLIENT, SEUILS_CLIENT } from "./facteur.ts";

const surLaGrille = (t: number): boolean => Math.abs(Math.round((t - SEUILS_CLIENT[0]!) / PAS_CLIENT) * PAS_CLIENT - (t - SEUILS_CLIENT[0]!)) < 1e-6;

/** Every threshold a Markdown report names: the rows of its tables and the sentences that say "threshold 0.xx". */
const seuilsImprimes = (md: string): number[] => [
  ...[...md.matchAll(/^\| (?:at your floor|next step) \| (\d\.\d+) \|/gm)].map((m) => Number(m[1])),
  ...[...md.matchAll(/threshold (\d\.\d+)/g)].map((m) => Number(m[1])),
];

test("the report and the record name only thresholds of the grid", () => {
  /* THE DETECTOR FIRST: a line that names a threshold between two steps of the grid is seen */
  assert.deepEqual(seuilsImprimes("| next step | 0.86 | 3 |\nat threshold 0.72").filter((t) => !surLaGrille(t)), [0.86, 0.72]);
  assert.deepEqual(seuilsImprimes("| at your floor | 0.85 | 3 |\nat threshold 0.90").filter((t) => !surLaGrille(t)), []);

  /* 124 customers on activity codes whose weights sit across the range; the escalated ones carry the three highest */
  const groupes = [["code-a", 0.5127, 4, "maintained"], ["code-b", 0.6173, 8, "maintained"], ["code-c", 0.7291, 16, "escalated"],
    ["code-d", 0.8844, 32, "escalated"], ["code-e", 0.9563, 64, "escalated"]] as const;
  const r = ["review_id,customer_id,reviewed_at,outcome"];
  const c = ["customer_id,kind,residence_country,activity_code,products,pep,onboarding_channel,relationship_start,"
    + "declared_turnover,observed_turnover,cash_ratio,cross_border_ratio,nationality_country,ownership_layers,beneficial_owner_named"];
  for (const [code, , taille, outcome] of groupes) {
    for (let i = 0; i < taille; i++) {
      r.push(`${code}-${i},cust-${code}-${i},2026-08-30,${outcome}`);
      c.push(`cust-${code}-${i},individual,FR,${code},card;wire,none,branch,2020-01-01,50000,48000,0.1,0.1,FR,,`);
    }
  }
  const d = mkdtempSync(join(tmpdir(), "grille-client-"));
  writeFileSync(join(d, "revues.csv"), r.join("\n") + "\n");
  writeFileSync(join(d, "clients.csv"), c.join("\n") + "\n");
  const tables = tablesAvec(JSON.stringify({ activiteRisque: Object.fromEntries(groupes.map(([code, poids]) => [code, poids])) }));
  const { cheminJson, cheminMd, mesure } = executer(join(d, "revues.csv"), join(d, "clients.csv"), registre(), null, tables);
  const md = readFileSync(cheminMd, "utf8");

  assert.ok(mesure.recommande !== null, "the fixture reaches a recommendation, so its next step is printed");
  assert.match(md, /next step \(threshold/);
  const imprimes = seuilsImprimes(md);
  assert.ok(imprimes.length >= 4, "the report names thresholds");
  assert.deepEqual(imprimes.filter((t) => !surLaGrille(t)), [], "the report names a threshold between two steps of the grid");

  /* the record: every threshold of every kept cell, and no other number that looks like a threshold off the grid */
  const releve = JSON.parse(readFileSync(cheminJson, "utf8")) as { paliers: Record<string, { plancher: { seuil: number } | null; suivant: { seuil: number } | null }> };
  const seuils = Object.values(releve.paliers).flatMap((p) => [p.plancher?.seuil, p.suivant?.seuil]).filter((x): x is number => x !== undefined && x !== null);
  assert.ok(seuils.length >= 2, "the record keeps cells");
  assert.deepEqual(seuils.filter((t) => !surLaGrille(t)), [], "the record keeps a cell at a threshold between two steps of the grid");
});
