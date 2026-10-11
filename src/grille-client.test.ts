/**
 * A CLIENT'S TABLE WEIGHT SHOWS IN EACH SCORE NO BETTER THAN THE GRID'S STEP, in the sealed record and in the report.
 *
 * The record writes no weight, but its grid of thresholds is a histogram of each factor's scores. The `activity` factor scores a
 * customer with the weight of their activity code, as it stands in the client's own table, so a group of customers that share a
 * code steps `tirees` down between the two thresholds that bracket that weight. On a grid of 0.01 the weight is known to a
 * hundredth; the step `PAS_CLIENT` says how coarse the grid of a CLIENT record must be so that a score shows no better than that.
 * The first test reads the step from the code, plants weights across the range, runs the real registry through `executer`, reads
 * back the JSON and the Markdown that would leave the client's machine, and works out from them alone, for every planted weight,
 * between which two thresholds it sits. It also checks that nothing printed (the thresholds shown, the recommended threshold, the
 * next step) is finer than the grid. The second test pins that the step is a bound per SCORE and not per weight: a weight that
 * enters several scores narrows when they are combined, and the claims must say so.
 *
 * The detector is proven on a fabricated record first, on a grid of 0.01, so that a green here means "looked, found no bracket
 * tighter than the step" and not "could not look".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executer } from "./your-reviews.ts";
import { registre } from "./facteurs/index.ts";
import { tablesAvec } from "./assumptions.ts";
import { PAS_CLIENT, combiner } from "./facteur.ts";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TOLERANCE = 1e-9;

/** The client's activity table: five codes, five weights across the range of the grid, each in its own bracket of 0.05 and of
 *  0.01. The sizes are powers of two, so that the drop of `tirees` between two thresholds names the group that made it. */
const GROUPES = [
  { code: "code-a", poids: 0.5127, taille: 4, outcome: "maintained" },
  { code: "code-b", poids: 0.6173, taille: 8, outcome: "maintained" },
  { code: "code-c", poids: 0.7291, taille: 16, outcome: "escalated" },
  { code: "code-d", poids: 0.8844, taille: 32, outcome: "escalated" },
  { code: "code-e", poids: 0.9563, taille: 64, outcome: "escalated" },
] as const;

function jeu(): { revues: string; clients: string } {
  const r = ["review_id,customer_id,reviewed_at,outcome"];
  const c = ["customer_id,kind,residence_country,activity_code,products,pep,onboarding_channel,relationship_start,"
    + "declared_turnover,observed_turnover,cash_ratio,cross_border_ratio,nationality_country,ownership_layers,beneficial_owner_named"];
  for (const g of GROUPES) {
    for (let i = 0; i < g.taille; i++) {
      r.push(`${g.code}-${i},cust-${g.code}-${i},2026-08-30,${g.outcome}`);
      c.push(`cust-${g.code}-${i},individual,FR,${g.code},card;wire,none,branch,2020-01-01,50000,48000,0.1,0.1,FR,,`);
    }
  }
  return { revues: r.join("\n") + "\n", clients: c.join("\n") + "\n" };
}

type Cellule = { seuil: number; tirees: number };
type Releve = { paliers: Record<string, { cellules: Cellule[] }> };

/** For each planted group: the two thresholds its weight sits between, read from the cells alone (the drop of `tirees` that
 *  has the size of the group), or undefined when no drop names it. */
function encadrements(releve: Releve): { code: string; poids: number; bas?: number; haut?: number }[] {
  const cellules = releve.paliers.activity!.cellules;
  return GROUPES.map((g) => {
    for (let k = 0; k + 1 < cellules.length; k++) {
      if (cellules[k]!.tirees - cellules[k + 1]!.tirees === g.taille) {
        return { code: g.code, poids: g.poids, bas: cellules[k]!.seuil, haut: cellules[k + 1]!.seuil };
      }
    }
    return { code: g.code, poids: g.poids };
  });
}

/** The leaks found: a weight bracketed tighter than the bound, or a grid whose thresholds are closer than the bound. */
function fuites(releve: Releve): string[] {
  const trouvees: string[] = [];
  const cellules = releve.paliers.activity!.cellules;
  for (let k = 0; k + 1 < cellules.length; k++) {
    if (cellules[k + 1]!.seuil - cellules[k]!.seuil < PAS_CLIENT - TOLERANCE) {
      trouvees.push(`thresholds ${cellules[k]!.seuil} and ${cellules[k + 1]!.seuil} are ${Math.round((cellules[k + 1]!.seuil - cellules[k]!.seuil) * 1000) / 1000} apart`);
      break;
    }
  }
  for (const e of encadrements(releve)) {
    if (e.bas !== undefined && e.haut !== undefined && e.haut - e.bas < PAS_CLIENT - TOLERANCE) {
      trouvees.push(`the weight ${e.poids} of ${e.code} sits between ${e.bas} and ${e.haut}`);
    }
  }
  return trouvees;
}

/** A record as a grid of the given step would write it, for the detector's own proof. */
function fabrique(pas: number): Releve {
  const seuils: number[] = [];
  for (let t = 0.5; t <= 1.0000001; t += pas) seuils.push(Math.round(t * 1000) / 1000);
  return { paliers: { activity: { cellules: seuils.map((seuil) => ({
    seuil, tirees: GROUPES.filter((g) => g.poids >= seuil).reduce((s, g) => s + g.taille, 0) })) } } };
}

test("a client's table weight is bracketed no tighter than the grid's step, in the record and in the report", () => {
  /* THE DETECTOR FIRST: on a grid of 0.01 it finds every planted weight, between thresholds 0.01 apart; on the grid of the bound, none. */
  assert.equal(encadrements(fabrique(0.01)).filter((e) => e.bas !== undefined).length, GROUPES.length,
    "the detector must bracket each planted weight on a fine grid");
  assert.ok(fuites(fabrique(0.01)).length >= GROUPES.length, "the detector must call a grid of 0.01 a leak");
  assert.deepEqual(fuites(fabrique(PAS_CLIENT)), [], "a grid at the bound is not a leak");

  const { revues, clients } = jeu();
  const d = mkdtempSync(join(tmpdir(), "grille-client-"));
  const cheminR = join(d, "revues.csv");
  const cheminC = join(d, "clients.csv");
  writeFileSync(cheminR, revues);
  writeFileSync(cheminC, clients);
  const tables = tablesAvec(JSON.stringify({ activiteRisque: Object.fromEntries(GROUPES.map((g) => [g.code, g.poids])) }));
  const { cheminJson, cheminMd } = executer(cheminR, cheminC, registre(), null, tables);
  const emis = JSON.parse(readFileSync(cheminJson, "utf8")) as Releve;

  /* the record: every planted weight is found, and none is bracketed tighter than the bound */
  const trouves = encadrements(emis);
  assert.equal(trouves.filter((e) => e.bas !== undefined).length, GROUPES.length, "each weight still shows as a step of the grid");
  for (const e of trouves) assert.ok(e.bas! <= e.poids && e.poids < e.haut!, `${e.code}: the bracket contains the weight`);
  assert.deepEqual(fuites(emis), [],
    `a score of the client reads back tighter than ${PAS_CLIENT} from the sealed record: the grid is finer than the step the code declares`);

  /* the report: the thresholds it shows and the ones it recommends are on the grid, never between two of its steps */
  const md = readFileSync(cheminMd, "utf8");
  const imprimes = [
    ...[...md.matchAll(/^\| (\d\.\d+) \|/gm)].map((m) => Number(m[1])),
    ...[...md.matchAll(/threshold (\d\.\d+)/g)].map((m) => Number(m[1])),
    ...[...(md.match(/Thresholds shown: ([\d., ]+);/)?.[1] ?? "").split(",")].map((x) => x.trim()).filter(Boolean).map(Number),
  ];
  assert.ok(imprimes.length > 8, "the report shows thresholds, including a recommended cell and its next step");
  assert.match(md, /next step \(threshold/, "the fixture reaches a recommendation, so the next step is printed");
  const horsGrille = imprimes.filter((t) => Math.abs(Math.round((t - 0.5) / PAS_CLIENT) * PAS_CLIENT - (t - 0.5)) > 1e-6);
  assert.deepEqual(horsGrille, [], `the report prints thresholds finer than the grid: ${horsGrille.join(", ")}`);
});

/* ─── the bound holds per score, not per weight: combining the scores a weight enters narrows it ─── */

/** geography is `combiner` of the weight of the residence and the weight of the nationality, the nationality left out when it is
 *  unknown. A group whose nationality is unknown scores w; a group whose nationality IS its residence scores 1 - (1 - w)^2. Both
 *  brackets are read from the same record, and each of them is `PAS_CLIENT` wide: together they say more than either. */
const POIDS_PAYS = 0.6173;
const PAYS = [
  { nom: "residence only", nationalite: "", taille: 8 },
  { nom: "residence and nationality", nationalite: "NZ", taille: 16 },
  { nom: "elsewhere", nationalite: "FR", taille: 8 },
] as const;

/** The weight w such that combiner([w, w]) = score, by bisection on the code's own `combiner`. */
function inverseDeuxFois(score: number): number {
  let bas = 0, haut = 1;
  for (let i = 0; i < 60; i++) {
    const milieu = (bas + haut) / 2;
    if (combiner([milieu, milieu]) < score) bas = milieu; else haut = milieu;
  }
  return bas;
}

test("the bound holds per score, not per weight: the claims say that a weight that enters several scores can be narrowed", () => {
  const r = ["review_id,customer_id,reviewed_at,outcome"];
  const c = ["customer_id,kind,residence_country,activity_code,products,pep,onboarding_channel,relationship_start,"
    + "declared_turnover,observed_turnover,cash_ratio,cross_border_ratio,nationality_country,ownership_layers,beneficial_owner_named"];
  for (const g of PAYS) {
    for (let i = 0; i < g.taille; i++) {
      const residence = g.nom === "elsewhere" ? "FR" : "NZ";
      r.push(`${g.nom.replace(/ /g, "-")}-${i},cust-${g.nom.replace(/ /g, "-")}-${i},2026-08-30,${i % 2 ? "escalated" : "maintained"}`);
      c.push(`cust-${g.nom.replace(/ /g, "-")}-${i},individual,${residence},salaried,card;wire,none,branch,2020-01-01,50000,48000,0.1,0.1,${g.nationalite},,`);
    }
  }
  const d = mkdtempSync(join(tmpdir(), "grille-combinee-"));
  writeFileSync(join(d, "revues.csv"), r.join("\n") + "\n");
  writeFileSync(join(d, "clients.csv"), c.join("\n") + "\n");
  const tables = tablesAvec(JSON.stringify({ paysRisque: { NZ: POIDS_PAYS } }));
  const { cheminJson, cheminMd } = executer(join(d, "revues.csv"), join(d, "clients.csv"), registre(), null, tables);
  const cellules = (JSON.parse(readFileSync(cheminJson, "utf8")) as Releve).paliers.geography!.cellules;
  const encadre = (taille: number): [number, number] => {
    for (let k = 0; k + 1 < cellules.length; k++) {
      if (cellules[k]!.tirees - cellules[k + 1]!.tirees === taille) return [cellules[k]!.seuil, cellules[k + 1]!.seuil];
    }
    throw new Error(`no drop of ${taille} in the geography cells`);
  };

  /* each score alone keeps the bound: a bracket of the grid's own step */
  const [basA, hautA] = encadre(8);
  const [basB, hautB] = encadre(16);
  assert.ok(hautA - basA >= PAS_CLIENT - TOLERANCE && hautB - basB >= PAS_CLIENT - TOLERANCE, "each score alone is bracketed by one step of the grid");
  /* the weight in each: [basA, hautA) from the residence-only group, [inverse(basB), inverse(hautB)) from the other */
  const bas = Math.max(basA, inverseDeuxFois(basB));
  const haut = Math.min(hautA, inverseDeuxFois(hautB));
  assert.ok(bas <= POIDS_PAYS && POIDS_PAYS < haut, "the weight lies in the intersection (the detector is sound)");
  const largeur = haut - bas;
  assert.ok(largeur < PAS_CLIENT - TOLERANCE,
    `the intersection of the two brackets is ${largeur.toFixed(4)} wide, under the step ${PAS_CLIENT}: combining narrows it`);

  /* so no claim may say that a weight shows no better than the step, in any place where it is made: each must carry the caveat,
     exactly when the combination does narrow the weight (if a mechanism ever restores a per-weight bound, the caveat must go) */
  const racine = fileURLToPath(new URL("..", import.meta.url));
  const maison = mkdtempSync(join(tmpdir(), "grille-maison-"));
  const usage = spawnSync(process.execPath, [join(racine, "src/your-reviews.ts")],
    { cwd: racine, encoding: "utf8", env: { ...process.env, HOME: maison, USERPROFILE: maison } });
  const source = readFileSync(join(racine, "src/facteur.ts"), "utf8");
  const lieux: Record<string, string> = {
    "the Markdown report": readFileSync(cheminMd, "utf8"),
    "the usage line of measure:yours": `${usage.stdout}${usage.stderr}`,
    "the README": readFileSync(join(racine, "README.md"), "utf8"),
    "the comment of PAS_CLIENT": source.slice(source.lastIndexOf("/**", source.indexOf("export const PAS_CLIENT")), source.indexOf("export const PAS_CLIENT")),
  };
  const narrows = largeur < PAS_CLIENT - TOLERANCE;
  for (const [lieu, texte] of Object.entries(lieux)) {
    assert.equal(/narrowed by combining/.test(texte), narrows,
      `${lieu} must say that a weight that enters several scores can be narrowed by combining them, exactly when it can (it can: ${narrows})`);
  }
});
