/**
 * NO PLANTED WEIGHT CAN BE NARROWED, FROM THE SEALED RECORD ALONE, TIGHTER THAN THE GRID'S STEP.
 *
 * What an observer of the record can know about a weight is the set of weights that would have written the SAME record. This
 * test measures that set with the writer itself as the oracle: it runs `mesurer` (the real registry, the real `combiner`) on a
 * fixed set of customers for a planted weight w0, then for every weight on a lattice of 0.001 around it, and takes the widest run
 * of weights, around w0, whose record is identical to the record of w0. That run is the tightest bracket an observer can get from
 * every number of the record, every factor and every combination of the scores a weight enters, even when the observer knows
 * the customers' attributes and the formula of every factor and lacks only the weight. The sha256 of the tables is left out: it is
 * the documented, unsalted fingerprint (it can be guessed against), not a property of the grid.
 *
 * Three fixtures, each with weights across the range of the grid:
 *   - an activity code, read directly by one score (the activity score of a customer IS the weight of their code);
 *   - a country, entering geography twice for a customer whose residence is their nationality (noisy-OR of the two) and once for
 *     a customer whose nationality is unknown: two scores of the same weight, one of them escalated at each level;
 *   - a product, alone for a customer who holds only it and combined with another product for a customer who holds both.
 * In each of the last two, the two escalated groups score differently, so a record that showed both brackets would narrow w.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mesurer, lireRevues, lireClients } from "./your-reviews.ts";
import { registre } from "./facteurs/index.ts";
import { tablesAvec } from "./assumptions.ts";
import { PAS_CLIENT } from "./facteur.ts";

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

/** The record written for these customers under these tables, without what is not a property of the grid. */
function enregistrement(groupes: Groupe[], tables: unknown): string {
  const { revues, clients } = jeu(groupes);
  const { parClient } = lireClients(clients);
  const m = mesurer(lireRevues(revues).revues, parClient, registre(), {
    reviews: "r.csv", reviewsSha: "0".repeat(64), customers: "c.csv", customersSha: "1".repeat(64), customersRows: parClient.size,
  }, null, tablesAvec(JSON.stringify(tables)), "2026-10-11T00:00:00.000Z");
  const { tables: _empreintes, code: _commit, ...reste } = m;
  return JSON.stringify(reste);
}

/** The width of the widest run of weights, around w0, that write the same record as w0. */
function largeur(groupes: Groupe[], tablesDe: (w: number) => unknown, w0: number): number {
  const reference = enregistrement(groupes, tablesDe(w0));
  const identique = (k: number): boolean => enregistrement(groupes, tablesDe(k * RESEAU)) === reference;
  const k0 = Math.round(w0 / RESEAU);
  assert.ok(identique(k0), `the lattice point next to ${w0} writes another record: the oracle cannot start`);
  let bas = k0, haut = k0;
  while (bas > 0 && identique(bas - 1)) bas--;
  while (haut < 1 / RESEAU && identique(haut + 1)) haut++;
  return (haut - bas + 1) * RESEAU;
}

const CAS: { nom: string; groupes: Groupe[]; tablesDe: (w: number) => unknown; poids: number[] }[] = [
  { nom: "an activity code, read directly",
    groupes: [{ ...base, activite: "code-x", taille: 80, outcome: "escalated" }, { ...base, taille: 40, outcome: "maintained" }],
    tablesDe: (w) => ({ activiteRisque: { "code-x": w } }), poids: POIDS },
  { nom: "a country, alone and twice (residence is nationality)",
    groupes: [{ ...base, residence: "NZ", nationalite: "", taille: 40, outcome: "escalated" },
      { ...base, residence: "NZ", nationalite: "NZ", taille: 40, outcome: "escalated" }, { ...base, taille: 40, outcome: "maintained" }],
    tablesDe: (w) => ({ paysRisque: { NZ: w } }), poids: POIDS },
  { nom: "a product, alone and combined with another",
    groupes: [{ ...base, produits: "cash", taille: 40, outcome: "escalated" }, { ...base, produits: "cash;wire", taille: 40, outcome: "escalated" },
      { ...base, taille: 40, outcome: "maintained" }],
    tablesDe: (w) => ({ produitRisque: { cash: w, wire: 0.2 } }), poids: POIDS.slice(0, 4) },
];

test("no planted weight can be narrowed, from the record alone, tighter than the grid's step", () => {
  const etroits: string[] = [];
  for (const cas of CAS) {
    for (const w0 of cas.poids) {
      const l = largeur(cas.groupes, cas.tablesDe, w0);
      if (l < PAS_CLIENT - TOLERANCE) etroits.push(`${cas.nom}, weight ${w0}: the record is the same on a run of weights ${l.toFixed(3)} wide, under the step ${PAS_CLIENT}`);
    }
  }
  assert.deepEqual(etroits, [], `${etroits.length} planted weight(s) read back tighter than the step from the sealed record`);
});
