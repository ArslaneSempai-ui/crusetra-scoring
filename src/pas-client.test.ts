/**
 * THE FIGURES BEHIND "WHY 0.05" ARE REPRODUCIBLE, AND PINNED.
 *
 * The comment of PAS_CLIENT (facteur.ts) says what a coarser grid costs the review, measured on the public record: for recall
 * floors from 0.5 to the default 0.90, which cell the tool recommends on the grid of 0.01, of 0.05, of 0.10 and of 0.25. This
 * test reads the same public record through `comparer()` (the function `node src/pas-client.ts` prints) and pins every figure
 * the comment quotes, so that the comment cannot drift from the record and anyone can print the table.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { comparer, PLANCHERS, PAS, type Ligne } from "./pas-client.ts";
import { ASSUMPTIONS } from "./assumptions.ts";
import { PAS_CLIENT } from "./facteur.ts";

const lignes: Ligne[] = comparer();
const cas = (moitie: string, plancher: number, pas: number): Ligne =>
  lignes.find((l) => l.moitie === moitie && l.plancher === plancher && l.pas === pas)!;
const MOITIES = ["authored", "synthetic"] as const;

/** For one step, against the grid of 0.01: the most reviews it raises more, the most false alerts it adds, and whether it ever
 *  changes the recommended factor or loses the cell altogether. */
function perte(pas: number): { plusDeRevues: number; plusDeFausses: number; autreFacteur: boolean; cellulePerdue: boolean } {
  let plusDeRevues = 0, plusDeFausses = 0, autreFacteur = false, cellulePerdue = false;
  for (const m of MOITIES) for (const f of PLANCHERS) {
    const fine = cas(m, f, 0.01).cellule, grosse = cas(m, f, pas).cellule;
    if (!fine) continue;
    if (!grosse) { cellulePerdue = true; continue; }
    plusDeRevues = Math.max(plusDeRevues, grosse.levees - fine.levees);
    plusDeFausses = Math.max(plusDeFausses, grosse.fausses - fine.fausses);
    if (grosse.facteur !== fine.facteur) autreFacteur = true;
  }
  return { plusDeRevues, plusDeFausses, autreFacteur, cellulePerdue };
}

test("the table covers the floors 0.5 to the default 0.90 and the four steps, on both halves of the public record", () => {
  assert.deepEqual(PLANCHERS, [0.5, 0.6, 0.7, 0.8, ASSUMPTIONS.recallFloor], "the default floor is the last one");
  assert.deepEqual(PAS, [0.01, PAS_CLIENT, 0.10, 0.25]);
  assert.equal(lignes.length, MOITIES.length * PLANCHERS.length * PAS.length);
  assert.ok(lignes.some((l) => l.cellule !== null), "some floor has a recommended cell");
});

test("at the default floor no cell holds the recall lower bound on the public record, whatever the grid", () => {
  for (const m of MOITIES) for (const pas of PAS) {
    assert.equal(cas(m, ASSUMPTIONS.recallFloor, pas).cellule, null, `${m}, step ${pas}: a cell holds the default floor`);
  }
});

test("0.05 keeps the recommended factor and its false alerts and raises at most one review more than 0.01", () => {
  const p = perte(PAS_CLIENT);
  assert.deepEqual(p, { plusDeRevues: 1, plusDeFausses: 0, autreFacteur: false, cellulePerdue: false });
});

test("0.10 raises up to eleven reviews more, and 0.25 adds ten false alerts: the steps that were not taken", () => {
  assert.equal(perte(0.10).plusDeRevues, 11);
  assert.equal(perte(0.25).plusDeFausses, 10);
});
