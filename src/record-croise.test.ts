/**
 * WHAT A WEIGHT SHOWS IN THE SEALED RECORD, MEASURED WITH THE WRITER ITSELF AS THE ORACLE.
 *
 * What an observer of the record can know about a weight is the set of weights that would have written the SAME record. This
 * test measures that set: it runs `mesurer` (the real registry, the real `combiner`) on a fixed set of customers for a planted
 * weight w0, then for every weight on a lattice of 0.001 around it, and takes the widest run of weights, around w0, whose record
 * is identical to the record of w0. That run is the tightest bracket an observer can get from every number of the record, every
 * factor and every combination of the scores a weight enters, even when the observer knows the customers' attributes and the
 * formula of every factor and lacks only the weight. The sha256 of the tables is left out: it is the documented, unsalted
 * fingerprint (it can be guessed against), not a property of the grid.
 *
 * The record keeps, per factor, only its cell at the recall floor and the next threshold of a grid PAS_CLIENT apart. The tests:
 *   1. no weight narrows below the step by CROSSING two brackets of the same weight (an activity code; a country that enters
 *      geography alone and twice), which the full grid of version 1 allowed (the detector is proven on the full grid);
 *   2. what narrows is exact, and pinned: a kept threshold that falls between two scores of one factor that sit closer than the
 *      step (a product alone and with a cheap one, near a weight of 0.9); a weight that enters ONE score twice (residence is
 *      nationality), whose score is steeper than the weight; and records of the same data measured at different floors.
 * The claims of the tool (the report, the usage line, the README, the comment of PAS_CLIENT) say exactly these cases, and
 * grille-client.test.ts pins that they do.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PAS_CLIENT, combiner, TOLERANCE, POIDS, POIDS_CHEAP, CAS, base, course, largeur, enregistrement, grilleEntiere,
  encadrerGrille, inverseDeuxFois, type Groupe,
} from "./oracle-poids.ts";

test("no weight narrows below the step by crossing two brackets of the same weight, as the full grid let it", () => {
  const etroits: string[] = [];
  for (const cas of [CAS.activite, CAS.pays]) {
    for (const w0 of POIDS) {
      const l = largeur(course(enregistrement(), cas.groupes, cas.tablesDe, w0));
      if (l < PAS_CLIENT - TOLERANCE) etroits.push(`${cas.nom}, weight ${w0}: the record is the same on a run of weights ${l.toFixed(3)} wide`);
    }
  }
  assert.deepEqual(etroits, [], `${etroits.length} planted weight(s) read back tighter than the step ${PAS_CLIENT} from the sealed record`);
});

test("the detector sees it: the full grid of version 1 narrows the same country to under the step", () => {
  const l = largeur(course(grilleEntiere, CAS.pays.groupes, CAS.pays.tablesDe, 0.6173));
  assert.ok(l < PAS_CLIENT - TOLERANCE, `the full grid brackets the country in ${l.toFixed(3)}, under ${PAS_CLIENT}: the oracle must see it`);
});

test("a kept threshold between two scores closer than the step narrows a weight, exactly as far as the gap", () => {
  /* product {cash} scores w, product {cash, wire} scores 1 - (1 - w)(1 - 0.2). The record keeps the floor cell at threshold t and the
     next step t + 0.05. When the second score sits at or above the next step, the second group is counted there, and
     w >= 1 - (1 - (t + 0.05)) / (1 - 0.2) as well as w < t + 0.05. */
  for (const w0 of POIDS.slice(0, 4)) {
    const [bas, haut] = encadrerGrille(w0);
    const deuxieme = combiner([w0, POIDS_CHEAP]);
    const plancher = deuxieme >= haut ? Math.max(bas, 1 - (1 - haut) / (1 - POIDS_CHEAP)) : bas;
    const attendu = haut - plancher;
    const l = largeur(course(enregistrement(), CAS.produit.groupes, CAS.produit.tablesDe, w0));
    assert.ok(Math.abs(l - attendu) <= TOLERANCE, `product weight ${w0}: the record is the same on ${l.toFixed(3)}, the gap predicts ${attendu.toFixed(3)}`);
  }
  /* 0.8844 is the planted case where it bites: 0.025, half the step */
  assert.ok(largeur(course(enregistrement(), CAS.produit.groupes, CAS.produit.tablesDe, 0.8844)) < PAS_CLIENT - TOLERANCE);
});

test("a weight that enters ONE score twice is bracketed by the step in score, which is narrower in weight", () => {
  /* only the customers whose residence is their nationality are escalated: their score is 1 - (1 - w)^2, and the bracket of the
     step in that score is [inverse(t), inverse(t + 0.05)) in weight, narrower than the step where the score is steep */
  const groupes: Groupe[] = [{ ...base, residence: "NZ", nationalite: "NZ", taille: 80, outcome: "escalated" }, { ...base, taille: 40, outcome: "maintained" }];
  const w0 = 0.31;
  const [bas, haut] = encadrerGrille(combiner([w0, w0]));
  const attendu = inverseDeuxFois(haut) - inverseDeuxFois(bas);
  const l = largeur(course(enregistrement(), groupes, CAS.pays.tablesDe, w0));
  assert.ok(Math.abs(l - attendu) <= TOLERANCE, `the record is the same on ${l.toFixed(3)}, the slope of the score predicts ${attendu.toFixed(3)}`);
  assert.ok(l < PAS_CLIENT - TOLERANCE && l > PAS_CLIENT / 2, "narrower than the step, and never under half of it (the slope of 1 - (1 - w)^2 is under 2)");
});

test("two records of the same data measured at different recall floors can be combined", () => {
  /* 20 customers who score w and 60 who score 1 - (1 - w)^2, all escalated: the floor 0.90 keeps the cell where the first group
     drops, the floor 0.60 the cell where the second does: two brackets of the same weight in two records */
  const groupes: Groupe[] = [{ ...base, residence: "NZ", nationalite: "", taille: 20, outcome: "escalated" },
    { ...base, residence: "NZ", nationalite: "NZ", taille: 60, outcome: "escalated" }, { ...base, taille: 40, outcome: "maintained" }];
  const w0 = 0.6173;
  const [b1, h1] = course(enregistrement(0.9), groupes, CAS.pays.tablesDe, w0);
  const [b2, h2] = course(enregistrement(0.6), groupes, CAS.pays.tablesDe, w0);
  const seul = Math.min(largeur([b1, h1]), largeur([b2, h2]));
  const ensemble = largeur([Math.max(b1, b2), Math.min(h1, h2)]);
  assert.ok(seul >= PAS_CLIENT - TOLERANCE, `each record alone brackets the weight in ${seul.toFixed(3)}, at least the step`);
  assert.ok(ensemble < PAS_CLIENT - TOLERANCE, `the two together bracket it in ${ensemble.toFixed(3)}, under the step`);
});

test("two tables that carry the same weight narrow it for an observer who knows they are the same", () => {
  /* one escalated group reads the country twice (residence is nationality) and the activity code once: the record keeps the cell of
     geography, whose bracket in weight is the step in score through 1 - (1 - w)^2, and the cell of activity, whose bracket is the
     step itself. The record cannot say the two weights are equal; an observer who knows it intersects the two brackets. */
  const l = largeur(course(enregistrement(), CAS.partage.groupes, CAS.partage.tablesDe, 0.6173));
  assert.ok(l < PAS_CLIENT - TOLERANCE, `the two brackets of the same weight intersect in ${l.toFixed(3)}, under the step`);
  assert.ok(largeur(course(enregistrement(), CAS.partage.groupes, CAS.partage.tablesDe, 0.5127)) >= PAS_CLIENT - TOLERANCE, "not for every weight");
});
