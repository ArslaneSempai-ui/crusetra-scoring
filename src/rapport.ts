/**
 * LE RAPPORT — les sections du contrat (§6), dans son ordre : ce qui a été mesuré, la
 * grille facteur × seuil, la cellule recommandée sous l'exigence déclarée (« none holds
 * the floor » dit tel quel), le pas suivant en revues, la robustesse synthétique à part,
 * la provenance avec le nom et le sha256 des TABLES (jamais leurs valeurs). JAMAIS une valeur du client : ni
 * customer_id, ni pays, ni code d'activité, ni montant.
 */
import { table } from "./figures.ts";
import { rate, cellulesDeTaux, ENOUGH } from "./interval.ts";
import { cellule } from "./csv.ts";
import { SEUILS_CLIENT, PAS_CLIENT } from "./facteur.ts";
import { ASSUMPTIONS, STATUSES, UNITS, TABLES_STATUS, symboleDe, ligneDHypothese } from "./assumptions.ts";
import { cellulesDe, meilleureSousRappel, heuresDAnalyste, MINIMUM_ESCALADES } from "./optimise.ts";
import type { MesureRevues, Cellule } from "./your-reviews.ts";

export { MINIMUM_ESCALADES };
export const TROP_PEU_D_ESCALADES = "too few confirmed cases to bound recall";
export const NOTE_PETIT_N = "n below 20: read the interval, not the point";

export const SEUILS_MONTRES: readonly number[] = SEUILS_CLIENT;

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

  l.push(`## The frontier, factor by factor`, ``);
  l.push(`Thresholds shown: ${SEUILS_MONTRES.map((s) => s.toFixed(2)).join(", ")}; the same grid`);
  l.push(`lives in the sealed record beside this file. It is ${PAS_CLIENT.toFixed(2)} apart on purpose: the steps of a`);
  l.push(`factor's recall show each of its scores no better than within that step. A weight that enters`);
  l.push(`several scores can be narrowed by combining them.`);
  l.push(``);
  const paliers = Object.entries(m.paliers).sort(([, a], [, b]) => a!.rang - b!.rang);
  for (const [id, p] of paliers) {
    l.push(`### ${cellule(id)}: ${p!.description}`, ``);
    const entetes = ["threshold", "reviews raised", `recall (n=${m.source.escalated})`, "interval",
      `false alerts (n=${m.source.maintained})`, "interval"];
    if (m.volume) entetes.push("per 1000 customers");
    const lignes = p!.cellules
      .filter((c) => SEUILS_MONTRES.includes(c.seuil))
      .map((c) => {
        const r = celluleRappel(c, m.source.escalated);
        const f = cellulesDeTaux(rate(c.faussesAlertes.successes, c.faussesAlertes.n));
        const ligne: (string | number)[] = [c.seuil.toFixed(2), c.tirees, r.taux, r.intervalle, f.taux, f.intervalle];
        if (m.volume) ligne.push(c.pourMille ?? "");
        return ligne;
      });
    l.push(table(entetes, lignes));
    if (m.source.escalated >= MINIMUM_ESCALADES && m.source.escalated < ENOUGH) {
      l.push(``, `*${NOTE_PETIT_N}.*`);
    }
    l.push(``);
  }
  if (m.absents.length) {
    l.push(`Contract factors absent from the registry, named here, not guessed: `
      + `${m.absents.map((a) => cellule(a)).join(", ")}. The frontier above covers what was measured.`);
    l.push(``);
  }

  l.push(`## The recommended cell, under the declared recall floor`, ``);
  if (m.source.escalated < MINIMUM_ESCALADES) {
    l.push(`No recommendation: ${TROP_PEU_D_ESCALADES} (${m.source.escalated} confirmed escalation(s) in`);
    l.push(`this file). A cell recommended on that would be a guess wearing a threshold.`);
  } else {
    const c = meilleureSousRappel(cellulesDe(m), ASSUMPTIONS.recallFloor);
    l.push(`The rule of the tool: recall lower bound at or above ${ligneDHypothese("recallFloor")},`);
    l.push(`then the fewest false alerts; yours to set with \`optimise -- --recall=<min>\`.`);
    l.push(``);
    if (!c) {
      l.push(`None holds the floor: no cell keeps a recall lower bound of ${ASSUMPTIONS.recallFloor} on this`);
      l.push(`sample (${m.source.escalated} confirmed escalations). Lower the floor knowingly, or measure`);
      l.push(`a longer window of history: the bound tightens with n.`);
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
      const suivant = m.paliers[c.palier]!.cellules.find((x) => x.seuil > c.seuil);     /* the next step of the grid, never a finer one */
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
  l.push(`- measured: every rate in section 2, on your files, n and interval attached.`);
  l.push(`- assumed: ${(Object.keys(STATUSES) as (keyof typeof STATUSES)[])
    .map((k) => ligneDHypothese(k)).join("; ")}.`);
  l.push(`- the risk TABLES are the loudest assumption of this tool (short, declared, never`);
  l.push(`  an official list) and the sealed record carries the name and the sha256 of each`);
  l.push(`  table this run was measured under (${(Object.keys(TABLES_STATUS) as string[]).join(", ")}:`);
  l.push(`  all assumed), never a weight or a code, so a changed table shows as a changed sha256;`);
  l.push(`  replace them with yours: \`--tables=<json>\`. Your tables decide every score, and`);
  l.push(`  they stay on your machine: the record seals their sha256 and none of their values.`);
  l.push(`  The sha256 is unsalted: it proves which table was used, it does not hide it, and a`);
  l.push(`  short table could be recovered by guessing its values. The grid of thresholds is`);
  l.push(`  ${PAS_CLIENT.toFixed(2)} apart, so a score shows in this file no better than within that step; a weight`);
  l.push(`  that enters several scores can be narrowed by combining them.`);
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
