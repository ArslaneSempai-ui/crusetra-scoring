/**
 * THE ORACLE BEHIND WHAT A WEIGHT SHOWS IN THE SEALED RECORD (used by record-croise.test.ts and grille-client.test.ts).
 *
 * What an observer of the record can know about a weight is the set of weights that would have written the SAME record. This
 * module measures that set with the writer itself: it runs `mesurer` (the real registry, the real `combiner`) on a fixed set of
 * customers for a planted weight w0, then for every weight on a lattice of 0.001 around it, and takes the widest run of weights,
 * around w0, whose record is identical to the record of w0. That run is the tightest bracket an observer can get from every
 * number of the record, every factor and every combination of the scores a weight enters, even when the observer knows the
 * customers' attributes and the formula of every factor and lacks only the weight. The sha256 of the tables is left out: it is
 * the documented, unsalted fingerprint (it can be guessed against), not a property of the grid.
 */
import assert from "node:assert/strict";
import { mesurer, mesurerGrille, lireRevues, lireClients } from "./your-reviews.ts";
import { registre } from "./facteurs/index.ts";
import { tablesAvec } from "./assumptions.ts";
import { PAS_CLIENT, SEUILS_CLIENT, combiner } from "./facteur.ts";

export { PAS_CLIENT, SEUILS_CLIENT, combiner };
export const RESEAU = 0.001;           /* the lattice of the oracle */
export const TOLERANCE = 0.0025;       /* two lattice steps and the floating point at the edges of a bracket */
export const POIDS = [0.5127, 0.6173, 0.7291, 0.8844, 0.9563];

export type Groupe = { residence: string; nationalite: string; produits: string; activite: string; taille: number; outcome: "escalated" | "maintained" };
export const base = { residence: "FR", nationalite: "FR", produits: "card", activite: "salaried" };

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
export type Ecrivain = (groupes: Groupe[], tables: unknown) => string;
const FICHIERS = { reviews: "r.csv", reviewsSha: "0".repeat(64), customers: "c.csv", customersSha: "1".repeat(64) };
const entrees = (groupes: Groupe[]) => {
  const { revues, clients } = jeu(groupes);
  const { parClient } = lireClients(clients);
  return { revues: lireRevues(revues).revues, parClient, fichiers: { ...FICHIERS, customersRows: parClient.size } };
};
/** The sealed record, as `mesurer` writes it at a recall floor. */
export const enregistrement = (rappelMin?: number): Ecrivain => (groupes, tables) => {
  const { revues, parClient, fichiers } = entrees(groupes);
  const { tables: _empreintes, code: _commit, ...reste } = mesurer(revues, parClient, registre(), fichiers, null,
    tablesAvec(JSON.stringify(tables)), "2026-10-11T00:00:00.000Z", rappelMin);
  return JSON.stringify(reste);
};
/** The grid that version 1 wrote and that `reduire` now cuts down: every threshold of every factor. */
export const grilleEntiere: Ecrivain = (groupes, tables) => {
  const { revues, parClient } = entrees(groupes);
  const { grille, verdicts } = mesurerGrille(revues, parClient, registre(), null, tablesAvec(JSON.stringify(tables)));
  return JSON.stringify({ grille, verdicts });
};

/** The run of lattice points, around w0, that write the same as w0: [low, high] in lattice units. */
export function course(ecrire: Ecrivain, groupes: Groupe[], tablesDe: (w: number) => unknown, w0: number): [number, number] {
  const reference = ecrire(groupes, tablesDe(w0));
  const identique = (k: number): boolean => ecrire(groupes, tablesDe(k * RESEAU)) === reference;
  const k0 = Math.round(w0 / RESEAU);
  assert.ok(identique(k0), `the lattice point next to ${w0} writes another record: the oracle cannot start`);
  let bas = k0, haut = k0;
  while (bas > 0 && identique(bas - 1)) bas--;
  while (haut < 1 / RESEAU && identique(haut + 1)) haut++;
  return [bas, haut];
}
export const largeur = ([bas, haut]: [number, number]): number => (haut - bas + 1) * RESEAU;

export const CAS = {
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
export const POIDS_CHEAP = 0.2;

/** The two thresholds of the grid around a score: the strictest that is not above it, and the next. */
export const encadrerGrille = (score: number): [number, number] => {
  const bas = [...SEUILS_CLIENT].reverse().find((t) => t <= score + 1e-9)!;
  return [bas, SEUILS_CLIENT[SEUILS_CLIENT.indexOf(bas) + 1]!];
};
/** The weight w with combiner([w, w]) = score (a weight that enters one score twice), by bisection on the code's own combiner. */
export function inverseDeuxFois(score: number): number {
  let bas = 0, haut = 1;
  for (let i = 0; i < 60; i++) { const m = (bas + haut) / 2; if (combiner([m, m]) < score) bas = m; else haut = m; }
  return bas;
}


/** The three exact cases in which a weight reads tighter than the step, and the one that the version 1 grid had. Each is measured, not assumed. */
export function faits(): { proche: boolean; double: boolean; enregistrements: boolean; croisement: boolean } {
  const etroit = (l: number): boolean => l < PAS_CLIENT - TOLERANCE;
  /* a kept threshold between two scores of one factor closer than the step: a product alone and with a cheap one, near 0.9 */
  const proche = POIDS.slice(0, 4).some((w0) => etroit(largeur(course(enregistrement(), CAS.produit.groupes, CAS.produit.tablesDe, w0))));
  /* a weight that enters ONE score twice: residence is nationality, only those customers escalated */
  const groupes: Groupe[] = [{ ...base, residence: "NZ", nationalite: "NZ", taille: 80, outcome: "escalated" }, { ...base, taille: 40, outcome: "maintained" }];
  const double = etroit(largeur(course(enregistrement(), groupes, CAS.pays.tablesDe, 0.31)));
  /* records of the same data at two floors */
  const deux: Groupe[] = [{ ...base, residence: "NZ", nationalite: "", taille: 20, outcome: "escalated" },
    { ...base, residence: "NZ", nationalite: "NZ", taille: 60, outcome: "escalated" }, { ...base, taille: 40, outcome: "maintained" }];
  const [b1, h1] = course(enregistrement(0.9), deux, CAS.pays.tablesDe, 0.6173);
  const [b2, h2] = course(enregistrement(0.6), deux, CAS.pays.tablesDe, 0.6173);
  const enregistrements = etroit(largeur([Math.max(b1, b2), Math.min(h1, h2)]));
  /* crossing two brackets of the same weight inside ONE record, which the full grid of version 1 allowed */
  const croisement = [CAS.activite, CAS.pays].some((cas) => POIDS.some((w0) => etroit(largeur(course(enregistrement(), cas.groupes, cas.tablesDe, w0)))));
  return { proche, double, enregistrements, croisement };
}
