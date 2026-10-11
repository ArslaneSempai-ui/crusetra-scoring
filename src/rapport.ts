/**
 * LE RAPPORT : les sections du contrat (§6), dans son ordre : ce qui a été mesuré, les
 * cellules que le relevé garde par facteur (la sienne sous l'exigence, et le seuil suivant ;
 * la grille entière ne sort pas), la cellule recommandée sous l'exigence déclarée (« none
 * holds the floor » dit tel quel), le pas suivant en revues, la robustesse synthétique à part,
 * la provenance avec le nom et le sha256 des TABLES (jamais leurs valeurs). JAMAIS une valeur du client : ni
 * customer_id, ni pays, ni code d'activité, ni montant.
 */
import { table } from "./figures.ts";
import { rate, cellulesDeTaux, ENOUGH } from "./interval.ts";
import { cellule } from "./csv.ts";
import { SEUILS_CLIENT, PAS_CLIENT, DIT_LES_CAS, DIT_UN_AUTRE_PLANCHER } from "./facteur.ts";
import { ASSUMPTIONS, STATUSES, UNITS, TABLES_STATUS, symboleDe, ligneDHypothese } from "./assumptions.ts";
import { heuresDAnalyste, MINIMUM_ESCALADES } from "./optimise.ts";
import type { MesureRevues, Cellule } from "./your-reviews.ts";

export { MINIMUM_ESCALADES };
export const TROP_PEU_D_ESCALADES = "too few confirmed cases to bound recall";
export const NOTE_PETIT_N = "n below 20: read the interval, not the point";

/** La cellule du rappel suit le CONTRAT : sous cinq escalades, la phrase ; dès cinq, le
 *  taux AVEC son intervalle même sous ENOUGH, et la note sous chaque table concernée. */
function celluleRappel(c: Cellule, escalades: number): { taux: string; intervalle: string } {
  if (escalades < MINIMUM_ESCALADES) return { taux: `n/a: ${TROP_PEU_D_ESCALADES}`, intervalle: `n=${escalades}` };
  const r = rate(c.rappel.successes, c.rappel.n);
  if (r.reportable) return cellulesDeTaux(r);
  return {
    taux: `${(r.rate * 100).toFixed(1)} %`,
    intervalle: `[${(r.low * 100).toFixed(0)}–${(r.high * 100).toFixed(0)}]`,
  };
}

export function rendreRapport(m: MesureRevues): string {
  const l: string[] = [`# Scoring measurement on your own periodic-review outcomes`, ``];

  l.push(`## What was measured`, ``);
  l.push(`${m.source.reviews} concluded review(s) from ${cellule(m.source.file)} (sha256 ${m.source.sha256.slice(0, 16)}…), `
    + `rebuilt into dossiers from ${cellule(m.customers.file)} `
    + `(${m.customers.rows} customer row(s), sha256 ${m.customers.sha256.slice(0, 16)}…), `
    + `measured on this machine on ${m.measuredAt.slice(0, 10)}. Nothing left it.`);
  l.push(``);
  l.push(`- confirmed escalations: ${m.source.escalated}`);
  l.push(`- maintained (closed without action): ${m.source.maintained}`);
  l.push(`- dossiers without a known nationality: ${m.source.sansNationalite}. The geography factor`);
  l.push(`  reads residence alone there; the count travels with the rates rather than dissolving`);
  l.push(`  into them.`);
  if (m.source.periode) {
    l.push(`- period, from reviewed_at: ${m.source.periode.from} to ${m.source.periode.to} `
      + `(${m.source.periode.jours} day(s))`);
  }
  l.push(m.volume
    ? `- customers in the portfolio: ${m.volume.n} (declared with --volume)`
    : `- customers in the portfolio: not supplied. The reviews-per-thousand column does not appear; it is never estimated in silence.`);
  l.push(``);
  l.push(`One limit, stated up front: this history contains only the reviews your programme`);
  l.push(`concluded. A risk your committee never reviewed is invisible to this file. Robustness`);
  l.push(`on manufactured dossiers is measured separately, on the public record, which is`);
  l.push(`entirely fabricated and says so (section 4).`);
  l.push(``);

  l.push(`## The cells the record keeps, factor by factor`, ``);
  l.push(`Recall floor of this record: ${m.rappelMin} (\`measure:yours -- --recall=<min>\`, default ${ASSUMPTIONS.recallFloor}). The grid of thresholds`);
  l.push(`is ${SEUILS_CLIENT.map((s) => s.toFixed(2)).join(", ")}, ${PAS_CLIENT.toFixed(2)} apart. The record keeps, per factor, only its cell at that`);
  l.push(`floor (the strictest threshold that holds it, with the fewest false alerts) and the next threshold of the grid. The full grid`);
  l.push(`stays on your machine and is not written: to re-optimize at another floor, run \`measure:yours\` again, here, on the same`);
  l.push(`files, with another \`--recall\`. The sealed record cannot answer it, and \`optimise\` says so.`);
  l.push(``);
  const paliers = Object.entries(m.paliers).sort(([, a], [, b]) => a!.rang - b!.rang);
  for (const [id, p] of paliers) {
    l.push(`### ${cellule(id)}: ${p!.description}`, ``);
    if (!p!.plancher) {
      l.push(m.source.escalated < MINIMUM_ESCALADES
        ? `No cell is kept: ${TROP_PEU_D_ESCALADES} (${m.source.escalated}).`
        : `No cell holds the floor of ${m.rappelMin}: nothing is kept for this factor.`, ``);
      continue;
    }
    const entetes = ["cell", "threshold", "reviews raised", `recall (n=${m.source.escalated})`, "interval",
      `false alerts (n=${m.source.maintained})`, "interval"];
    if (m.volume) entetes.push("per 1000 customers");
    const ligne = (nom: string, c: Cellule): (string | number)[] => {
      const r = celluleRappel(c, m.source.escalated);
      const f = cellulesDeTaux(rate(c.faussesAlertes.successes, c.faussesAlertes.n));
      const out: (string | number)[] = [nom, c.seuil.toFixed(2), c.tirees, r.taux, r.intervalle, f.taux, f.intervalle];
      if (m.volume) out.push(c.pourMille ?? "");
      return out;
    };
    l.push(table(entetes, [ligne("at your floor", p!.plancher), ...(p!.suivant ? [ligne("next step", p!.suivant)] : [])]));
    if (m.source.escalated >= MINIMUM_ESCALADES && m.source.escalated < ENOUGH) {
      l.push(``, `*${NOTE_PETIT_N}.*`);
    }
    l.push(``);
  }
  if (m.absents.length) {
    l.push(`Contract factors absent from the registry, named here, not guessed: `
      + `${m.absents.map((a) => cellule(a)).join(", ")}. The cells above cover what was measured.`);
    l.push(``);
  }

  l.push(`## The recommended cell, under the declared recall floor`, ``);
  if (m.source.escalated < MINIMUM_ESCALADES) {
    l.push(`No recommendation: ${TROP_PEU_D_ESCALADES} (${m.source.escalated} confirmed escalation(s) in`);
    l.push(`this file). A cell recommended on that would be a guess wearing a threshold.`);
  } else {
    const rec = m.recommande ? m.paliers[m.recommande] : undefined;
    const c = m.recommande && rec?.plancher ? { ...rec.plancher, palier: m.recommande } : null;
    l.push(`The rule of the tool: recall lower bound at or above ${m.rappelMin} (the floor of this record),`);
    l.push(`then the fewest false alerts; yours to set with \`measure:yours -- --recall=<min>\`, which runs here, on your files.`);
    l.push(``);
    if (!c) {
      l.push(`None holds the floor: no cell keeps a recall lower bound of ${m.rappelMin} on this`);
      l.push(`sample (${m.source.escalated} confirmed escalations). The record keeps no other cell: lower the floor`);
      l.push(`knowingly and measure again, or measure a longer window of history: the bound tightens with n.`);
    } else {
      l.push(`Fewest false alerts with the bound held: ${cellule(c.palier)} at threshold ${c.seuil.toFixed(2)}; `
        + `${c.faussesAlertes.successes} false alert(s) of ${c.faussesAlertes.n} maintained review(s), `
        + `${c.tirees} of ${m.source.reviews} historical reviews raised, recall `
        + `${(c.rappel.rate * 100).toFixed(1)} % [${(c.rappel.low * 100).toFixed(0)}–${(c.rappel.high * 100).toFixed(0)}], n=${c.rappel.n}.`);
      const economisees = m.source.reviews - c.tirees;
      const h = heuresDAnalyste(economisees);
      l.push(``);
      l.push(`Against your current programme's history: ${economisees} review(s) fewer over the file's`);
      l.push(`period, ${h.heures.toFixed(1)} analyst hour(s), ${symboleDe(UNITS.analystAnnualCost)}${h.usd.toFixed(0)}, computed from assumptions shown here:`);
      l.push(`- ${ligneDHypothese("minutesPerReview")}`);
      l.push(`- ${ligneDHypothese("analystAnnualCost")}, over ${ASSUMPTIONS.workingDaysPerYear} days/year × ${ASSUMPTIONS.productiveHoursPerDay} h/day`);
      const suivant = rec!.suivant;       /* the next threshold of the grid, kept in the record: never a finer one */
      if (suivant) {
        const dr = celluleRappel(suivant, m.source.escalated);
        l.push(``);
        l.push(`The next step (threshold ${suivant.seuil.toFixed(2)}) would drop ${c.tirees - suivant.tirees} more review(s)`);
        l.push(`and put the recall at ${dr.taux} ${dr.intervalle}: what tightening costs, before you pay it.`);
      }
    }
  }
  l.push(``);

  l.push(`## Synthetic robustness, kept apart`, ``);
  l.push(`Not measured in this run: no real customer file is public, so the public record of`);
  l.push(`this tool is ENTIRELY fabricated (authored dossiers of risk with their benign`);
  l.push(`look-alikes, plus seeded variants) and it says so on every figure. It never merges`);
  l.push(`with the rates above. Provenance keeps the words apart: those figures are`);
  l.push(`\`synthetic\` or \`authored\`, never \`measured\`.`);
  l.push(``);

  l.push(`## Provenance`, ``);
  l.push(`- measured: every rate above, on your files, n and interval attached.`);
  l.push(`- assumed: ${(Object.keys(STATUSES) as (keyof typeof STATUSES)[])
    .map((k) => ligneDHypothese(k)).join("; ")}.`);
  l.push(`- the risk TABLES are the loudest assumption of this tool (short, declared, never`);
  l.push(`  an official list) and the sealed record carries the name and the sha256 of each`);
  l.push(`  table this run was measured under (${(Object.keys(TABLES_STATUS) as string[]).join(", ")}:`);
  l.push(`  all assumed), never a weight or a code, so a changed table shows as a changed sha256;`);
  l.push(`  replace them with yours: \`--tables=<json>\`. Your tables decide every score, and`);
  l.push(`  they stay on your machine: the record seals their sha256 and none of their values.`);
  l.push(`  The sha256 is unsalted: it proves which table was used, it does not hide it, and a`);
  l.push(`  short table could be recovered by guessing its values.`);
  l.push(`- the grid is not written: the record keeps, per factor, its cell at the recall floor and the next`);
  l.push(`  threshold of a grid ${PAS_CLIENT.toFixed(2)} apart. A grid of cells is a histogram of a factor's scores, and it gave a`);
  l.push(`  risk-table weight back to the step of the grid; a few cells at one position per factor give it back less.`);
  l.push(`  ${DIT_LES_CAS}`);
  l.push(`  ${DIT_UN_AUTRE_PLANCHER}`);
  l.push(`- seal: ${m.empreinte ?? "(sealed after rendering; see the .json beside this file)"} · `
    + `measured ${m.measuredAt.slice(0, 10)}`
    + (m.code ? ` · code at commit ${m.code.commit}` : ""));
  l.push(``);
  l.push(`No value from your files (no customer_id, no country, no activity code, no amount)`);
  l.push(`appears in this report or in the sealed record; verdicts are keyed by your review_id`);
  l.push(`and carry the committee's outcome and whether the nationality was known, never a`);
  l.push(`score. The review ids and the file names are yours and DO survive:`);
  l.push(`choose them opaque.`);
  l.push(``);
  return l.join("\n");
}
