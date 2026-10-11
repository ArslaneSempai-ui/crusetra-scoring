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
import { mesurer, mesurerGrille, lireRevues, lireClients } from "./your-reviews.ts";
import { registre } from "./facteurs/index.ts";
import { tablesAvec } from "./assumptions.ts";
import { PAS_CLIENT, SEUILS_CLIENT, combiner } from "./facteur.ts";

const RESEAU = 0.001;           /* the lattice of the oracle */
const TOLERANCE = 0.0025;       /* two lattice steps and the floating point at the edges of a bracket */
const POIDS = [0.5127, 0.6173, 0.7291, 0.8844, 0.9563];

type Groupe = { residence: string; nationalite: string; produits: string; activite: string; taille: number; outcome: "escalated" | "maintained" };
const base = { residence: "FR", nationalite: "FR", produits: "card", activite: "salaried" };

function jeu(groupes: Groupe[]): { revues: string; clients: string } {
  const r = ["review_id,customer_id,reviewed_at,outcome"];
  const c = ["customer_id,kind,residence_country,activity_code,products,pep,onboarding_channel,relationship_start,"
    + "declared_turnover,observed_turnover,cash_ratio,cross_border_ratio,nationality_country,ownership_layers,beneficial_owner_named"];
  groupes.forEach((g, k) => {
    for (let i = 0; i < g.taille; i++) {
      r.push(`g${k}-${i},c${k}-${i},2026-08-30,${g.outcome}`);
      c.push(`c${k}-${i},individual,${g.residence},${g.activite},${g.produits},none,branch,2020-01-01,50000,48000,0.1,0.1,${g.nationalite},,`);
    }
  });
  return { revues: r.join("\n") + "\n", clients: c.join("\n") + "\n" };
}

/** A writer: the part of what a measurement writes that does not depend on anything but the customers and the weights. */
type Ecrivain = (groupes: Groupe[], tables: unknown) => string;
const FICHIERS = { reviews: "r.csv", reviewsSha: "0".repeat(64), customers: "c.csv", customersSha: "1".repeat(64) };
const entrees = (groupes: Groupe[]) => {
  const { revues, clients } = jeu(groupes);
  const { parClient } = lireClients(clients);
  return { revues: lireRevues(revues).revues, parClient, fichiers: { ...FICHIERS, customersRows: parClient.size } };
};
/** The sealed record, as `mesurer` writes it at a recall floor. */
const enregistrement = (rappelMin?: number): Ecrivain => (groupes, tables) => {
  const { revues, parClient, fichiers } = entrees(groupes);
  const { tables: _empreintes, code: _commit, ...reste } = mesurer(revues, parClient, registre(), fichiers, null,
    tablesAvec(JSON.stringify(tables)), "2026-10-11T00:00:00.000Z", rappelMin);
  return JSON.stringify(reste);
};
/** The grid that version 1 wrote and that `reduire` now cuts down: every threshold of every factor. */
const grilleEntiere: Ecrivain = (groupes, tables) => {
  const { revues, parClient } = entrees(groupes);
  const { grille, verdicts } = mesurerGrille(revues, parClient, registre(), null, tablesAvec(JSON.stringify(tables)));
  return JSON.stringify({ grille, verdicts });
};

/** The run of lattice points, around w0, that write the same as w0: [low, high] in lattice units. */
function course(ecrire: Ecrivain, groupes: Groupe[], tablesDe: (w: number) => unknown, w0: number): [number, number] {
  const reference = ecrire(groupes, tablesDe(w0));
  const identique = (k: number): boolean => ecrire(groupes, tablesDe(k * RESEAU)) === reference;
  const k0 = Math.round(w0 / RESEAU);
  assert.ok(identique(k0), `the lattice point next to ${w0} writes another record: the oracle cannot start`);
  let bas = k0, haut = k0;
  while (bas > 0 && identique(bas - 1)) bas--;
  while (haut < 1 / RESEAU && identique(haut + 1)) haut++;
  return [bas, haut];
}
const largeur = ([bas, haut]: [number, number]): number => (haut - bas + 1) * RESEAU;

const CAS = {
  activite: { nom: "an activity code, read directly",
    groupes: [{ ...base, activite: "code-x", taille: 80, outcome: "escalated" }, { ...base, taille: 40, outcome: "maintained" }] as Groupe[],
    tablesDe: (w: number) => ({ activiteRisque: { "code-x": w } }) },
  pays: { nom: "a country, alone and twice (residence is nationality)",
    groupes: [{ ...base, residence: "NZ", nationalite: "", taille: 40, outcome: "escalated" },
      { ...base, residence: "NZ", nationalite: "NZ", taille: 40, outcome: "escalated" }, { ...base, taille: 40, outcome: "maintained" }] as Groupe[],
    tablesDe: (w: number) => ({ paysRisque: { NZ: w } }) },
  produit: { nom: "a product, alone and combined with a cheap one",
    groupes: [{ ...base, produits: "cash", taille: 40, outcome: "escalated" }, { ...base, produits: "cash;wire", taille: 40, outcome: "escalated" },
      { ...base, taille: 40, outcome: "maintained" }] as Groupe[],
    tablesDe: (w: number) => ({ produitRisque: { cash: w, wire: POIDS_CHEAP } }) },
};
const POIDS_CHEAP = 0.2;

/** The two thresholds of the grid around a score: the strictest that is not above it, and the next. */
const encadrerGrille = (score: number): [number, number] => {
  const bas = [...SEUILS_CLIENT].reverse().find((t) => t <= score + 1e-9)!;
  return [bas, SEUILS_CLIENT[SEUILS_CLIENT.indexOf(bas) + 1]!];
};
/** The weight w with combiner([w, w]) = score (a weight that enters one score twice), by bisection on the code's own combiner. */
function inverseDeuxFois(score: number): number {
  let bas = 0, haut = 1;
  for (let i = 0; i < 60; i++) { const m = (bas + haut) / 2; if (combiner([m, m]) < score) bas = m; else haut = m; }
  return bas;
}

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
