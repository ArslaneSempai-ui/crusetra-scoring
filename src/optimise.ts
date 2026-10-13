/**
 * THE FRONTIER, from what the sealed record keeps and nothing else: the cells of ONE recall floor (`measure:yours --recall`, 0.90
 * by default), per factor its cell at the floor and the next threshold of the grid. The grid itself is not written: it is a
 * histogram of each factor's scores, which gave a risk-table weight back.
 *
 *     npm run optimise -- --from=<measured.json> --recall=0.90
 *       → among the kept cells whose Wilson LOWER BOUND holds the floor, the one with the FEWEST FALSE ALERTS (the rule of the tool);
 *         "none holds the floor" is said as it is.
 *
 * Another recall floor is refused, and so is `--review-budget` (it needs the whole frontier): both in words that name the floor of
 * the record and the gesture, running measure:yours again, here, on the same files. A record of version 1, which held every
 * threshold, is refused and says why. Every dollar and every hour shown carries its assumption beside it.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { isMain, refuserDrapeauxInconnus } from "./cli.ts";
import { scelleIntact, empreinteDuReleve } from "./empreinte.ts";
import { ASSUMPTIONS, UNITS, symboleDe, analystHourlyCost, ligneDHypothese } from "./assumptions.ts";
import type { MesureRevues, Cellule } from "./your-reviews.ts";
import type { PalierId } from "./facteur.ts";
import { lignesEvaluationDe } from "./evaluation.ts";

export type CellulePlacee = Cellule & { palier: PalierId; rang: number };

/**
 * Le plancher CONTRACTUEL du rappel : cité et optimisé dès CINQ escalades confirmées, à
 * la borne basse de Wilson ; sous cinq, rien ne se cite ni ne s'optimise. ET UN SEUL SENS
 * PAR DRAPEAU (le « -Infinity % » du rouge) : `reportable` garde son sens général ;
 * la citation et la sélection du rappel se décident sur MINIMUM_ESCALADES, explicitement.
 */
export const MINIMUM_ESCALADES = 5;

/** The cells a record keeps: per factor, its cell at the record's recall floor and the next threshold of the grid. */
export function cellulesDe(m: MesureRevues): CellulePlacee[] {
  return Object.entries(m.paliers).flatMap(([palier, p]) =>
    [p!.plancher, p!.suivant].filter((c): c is NonNullable<typeof c> => c !== null)
      .map((c) => ({ ...c, palier: palier as PalierId, rang: p!.rang })));
}

/** La règle de l'outil : borne basse >= exigence, puis le MOINS de fausses alertes,
 *  puis le moins de revues levées, puis le rang, puis le seuil strict. */
export function meilleureSousRappel(cellules: readonly CellulePlacee[], rappelMin: number): CellulePlacee | null {
  const tenables = cellules.filter((c) => c.rappel.n >= MINIMUM_ESCALADES && c.rappel.low >= rappelMin);
  if (tenables.length === 0) return null;
  return [...tenables].sort((a, b) =>
    a.faussesAlertes.successes - b.faussesAlertes.successes
    || a.tirees - b.tirees || a.rang - b.rang || b.seuil - a.seuil)[0]!;
}

export function meilleureSousBudget(
  cellules: readonly CellulePlacee[], budgetParMois: number, joursDePeriode: number,
): CellulePlacee | null {
  const parMois = (c: CellulePlacee) => c.tirees * (30 / joursDePeriode);
  const tenables = cellules.filter((c) => c.rappel.n >= MINIMUM_ESCALADES && parMois(c) <= budgetParMois);
  if (tenables.length === 0) return null;
  return [...tenables].sort((a, b) =>
    b.rappel.low - a.rappel.low
    || a.faussesAlertes.successes - b.faussesAlertes.successes || a.rang - b.rang)[0]!;
}

/** La plus forte borne basse ATTEIGNABLE, ou null : Math.max() sur un ensemble vide rend
 *  -Infinity, et « -Infinity % » est ce qu'un message d'échec a déjà imprimé une fois. */
export function plusForteBorne(cellules: readonly CellulePlacee[]): number | null {
  const bornees = cellules.filter((c) => c.rappel.n >= MINIMUM_ESCALADES);
  if (bornees.length === 0) return null;
  return Math.max(...bornees.map((c) => c.rappel.low));
}

export function heuresDAnalyste(nRevues: number): { heures: number; usd: number } {
  const heures = (nRevues * ASSUMPTIONS.minutesPerReview) / 60;
  return { heures, usd: heures * analystHourlyCost() };
}

export function lireReleve(chemin: string): MesureRevues {
  const brut = JSON.parse(readFileSync(chemin, "utf8")) as MesureRevues;
  if (brut?.kind !== "scoring-client-record") {
    throw new Error(`${basename(chemin)} is not a scoring record: its kind is `
      + `${JSON.stringify((brut as { kind?: unknown })?.kind ?? null)}.\n`
      + `  Point --from at the <file>-measured.json that measure:yours wrote.`);
  }
  if (brut.version !== 2) {
    throw new Error(`${basename(chemin)} is version ${JSON.stringify((brut as { version?: unknown }).version ?? null)} of the scoring record; this command reads version 2,\n`
      + `  which keeps only the cells for one recall floor. Version 1 held every threshold of the grid (a histogram\n`
      + `  of the scores) and is no longer written. Re-run measure:yours on the same files.`);
  }
  if (typeof brut.empreinte !== "string" || !brut.empreinte) {
    throw new Error(`${basename(chemin)} carries no seal; a hand-made record would enter\n`
      + `  the frontier with the authority of a measurement. Re-run measure:yours.`);
  }
  if (!scelleIntact(brut as unknown as Record<string, unknown>)) {
    throw new Error(`${basename(chemin)} does not match its own content hash: it carries `
      + `${brut.empreinte}, its content computes to ${empreinteDuReleve(brut)}.\n`
      + `  The file changed after it was sealed. Nothing was optimised.`);
  }
  return brut;
}

export function lireRappelMin(brut: string): number {
  if (!/^(0(\.\d+)?|1(\.0+)?)$/.test(brut)) {
    throw new Error(`--recall=${brut} is not a recall this tool reads. It wants a number\n`
      + `  between 0 and 1, like --recall=0.90, the floor your compliance committee owns.`);
  }
  return Number(brut);
}

export function lireBudget(brut: string): number {
  if (!/^\d{1,9}$/.test(brut) || Number(brut) < 1) {
    throw new Error(`--review-budget=${brut} is not a budget this tool reads. It wants a whole\n`
      + `  number of reviews per month your analysts can conclude, like --review-budget=200.`);
  }
  return Number(brut);
}

function decrire(c: CellulePlacee, m: MesureRevues): string[] {
  const l: string[] = [];
  l.push(`  factor ${c.palier} at threshold ${c.seuil.toFixed(2)}`);
  l.push(`  recall on confirmed escalations  ${(c.rappel.rate * 100).toFixed(1)} % `
    + `[${(c.rappel.low * 100).toFixed(0)}–${(c.rappel.high * 100).toFixed(0)}], n=${c.rappel.n}`);
  l.push(`  false-alert rate on maintained   ${(c.faussesAlertes.rate * 100).toFixed(1)} % `
    + `[${(c.faussesAlertes.low * 100).toFixed(0)}–${(c.faussesAlertes.high * 100).toFixed(0)}], n=${c.faussesAlertes.n}`);
  l.push(`  reviews raised on this history   ${c.tirees} of ${m.source.reviews}`);
  if (c.pourMille !== undefined) l.push(`  reviews per thousand customers   ${c.pourMille}`);
  return l;
}

async function principal(): Promise<void> {
  for (const l of lignesEvaluationDe("scoring")) console.log(l);
  refuserDrapeauxInconnus(["--from", "--recall", "--review-budget"]);
  const arg = (nom: string) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.split("=").slice(1).join("=");

  const chemin = arg("from");
  const brutRappel = arg("recall");
  const brutBudget = arg("review-budget");
  if (!chemin || (brutRappel === undefined && brutBudget === undefined)) {
    console.log(`
The frontier, from a sealed measurement:

  npm run optimise -- --from=<file>-measured.json --recall=<min>
      the cell the record keeps for its recall floor: among cells whose recall LOWER BOUND
      holds the floor, the fewest false alerts. <min> must be the floor the record was
      measured under; for another floor, run measure:yours again with --recall=<min>.
      (--review-budget needs the whole frontier, which the record no longer keeps.)

The record comes from: npm run measure:yours -- --customers=<csv> --reviews=<csv>
`);
    process.exit(2);
  }
  if (brutRappel !== undefined && brutBudget !== undefined) {
    console.error(`\nGive --recall OR --review-budget, not both: they are the two directions of the\n`
      + `  same frontier, and answering both at once would answer neither.\n`);
    process.exit(2);
  }

  const m = lireReleve(chemin);
  const cellules = cellulesDe(m);
  console.log(`\n${m.source.reviews} review(s) measured on ${m.measuredAt.slice(0, 10)}, seal ${m.empreinte}, recall floor ${m.rappelMin}: `
    + `${Object.keys(m.paliers).length} factor(s), ${cellules.length} kept cell(s).`);
  if (m.absents.length) console.log(`contract factor(s) absent from that record: ${m.absents.join(", ")}`);

  /* The record keeps the cells for ONE recall floor and nothing else: it is not a grid any more, so it answers neither another
     floor nor a budget. Said, with the gesture that does answer: run measure:yours again, here, on the same files. */
  if (brutBudget !== undefined) {
    console.error(`\n--review-budget needs the whole frontier, and this record keeps only the cells for its recall floor ${m.rappelMin}\n`
      + `  (a grid of cells is a histogram of the scores: it gave a risk-table weight back to the step of the grid, so it stays on\n`
      + `  your machine and is not written). Nothing was answered. Ask for the floor the record was measured under with\n`
      + `  --recall=${m.rappelMin}, or run measure:yours again with another --recall.\n`);
    process.exit(2);
  }
  const min = lireRappelMin(brutRappel!);
  if (min !== m.rappelMin) {
    console.error(`\nThis record keeps only the cells for the recall floor it was measured under, ${m.rappelMin}; it holds no cell for ${min},\n`
      + `  and answering from the cells it has would be a guess. Nothing was answered. Run measure:yours again, on the same\n`
      + `  files and here, with --recall=${min}: the full grid stays on your machine and is not written.\n`);
    process.exit(2);
  }

  if (m.source.escalated < MINIMUM_ESCALADES) {
    console.error(`\n${m.source.escalated} confirmed escalation(s) in the record: too few confirmed\n`
      + `  cases to bound recall (the contract cites and optimises recall from ${MINIMUM_ESCALADES}). Export a\n`
      + `  longer window of history and re-measure.\n`);
    process.exit(2);
  }

  const palier = m.recommande ? m.paliers[m.recommande] : undefined;
  const c: CellulePlacee | null = m.recommande && palier?.plancher ? { ...palier.plancher, palier: m.recommande, rang: palier.rang } : null;
  if (!c) {
    console.error(`\nNo cell holds a recall lower bound of ${min} on this sample `
      + `(${m.source.escalated} confirmed escalations).`);
    console.error(`  The record keeps no other cell: lower the floor knowingly and run measure:yours again with a lower --recall,`);
    console.error(`  or measure a wider window.`);
    console.error("");
    process.exit(1);
  }
  console.log(`\nFewest false alerts with the recall lower bound at or above ${min}:\n`);
  for (const l of decrire(c, m)) console.log(l);
  const economisees = m.source.reviews - c.tirees;
  const h = heuresDAnalyste(economisees);
  console.log(`\nAgainst your current programme's history: ${economisees} review(s) fewer over the`);
  console.log(`file's period, ${h.heures.toFixed(1)} analyst hour(s), ${symboleDe(UNITS.analystAnnualCost)}${h.usd.toFixed(0)}, computed from:`);
  console.log(`  ${ligneDHypothese("minutesPerReview")}`);
  console.log(`  ${ligneDHypothese("analystAnnualCost")} over ${ASSUMPTIONS.workingDaysPerYear} days × ${ASSUMPTIONS.productiveHoursPerDay} h`);
  console.log(`Change the assumptions and the dollars move; the recall bound does not.\n`);
}

if (isMain(import.meta)) {
  try {
    await principal();
  } catch (e) {
    console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(2);
  }
}
