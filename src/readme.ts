/**
 * Le README qui ne peut pas périmer : ses tables sont GÉNÉRÉES, jamais tapées.
 *
 *   npm run figures            réécrit les blocs entre marqueurs
 *   node src/readme.ts --check refuse si un bloc ne correspond plus au code (la suite le lance)
 *
 * Deux blocs pour commencer, la forme de cascade-routing :
 *   commandes  la table des commandes, dans l'ordre où elles ont un sens
 *   tests      « N tests across M files » compté EN LANÇANT LA SUITE (les tests d'une boucle
 *              n'existent qu'à l'exécution), les fichiers lus dans le script `test` ; jamais recopié
 *
 * Chaque commande ajoutée par un lot ajoute sa ligne ICI, pas dans le README : le README
 * suit. Un lot qui ajoute un test n'a rien à faire : le compte suit tout seul.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { run, table } from "./figures.ts";
import { PAS_CLIENT } from "./facteur.ts";

/* ─── les commandes, dans l'ordre où elles ont un sens ─── */
export const COMMANDES: [string, string][] = [
  ["npm ci --ignore-scripts", "install exactly the versions the lockfile pins, and run no install script from any dependency; the only command that needs the network: this tool downloads nothing else, ever"],
  ["npm run test", "types, the README blocks, the licence inventory, and the suite. Start here; it runs with the network cut"],
  ["npm run measure [-- --yes-overwrite]", "the public measure: every risk factor at every threshold on dossiers we wrote (retained files included) plus declared generated variants, sealed into `releve-public.json` and readable in `RELEVE-PUBLIC.md`: no real customer is public, and the record says so; it refuses to overwrite a sealed one without the flag"],
  ["npm run measure:yours -- --customers=<csv> --reviews=<csv> [--volume=N]", `your own periodic reviews, rebuilt into dossiers from your customer attributes: recall on escalated customers and false-alert rate on maintained ones per risk factor and threshold, with n and interval; a sealed record and a report beside your file, with no value of yours written out: the thresholds are ${PAS_CLIENT.toFixed(2)} apart, so each score shows in them no better than within that step, and a risk-table weight that enters several scores can be narrowed by combining them`],
  ["npm run optimise -- --from=<record> --recall=<min>", "the best trade-off: fewest alerts with the recall lower bound held, or `--review-budget=<N>` for the highest bounded recall under a yearly review budget"],
  ["npm run sceller -- <record.json>", "seal a record: the content hash that makes a silently edited measurement fail loudly; the same content hash as Crusetra Routing"],
  ["npm run verify -- <report>", "check that a report was issued by the holder of the suite's public key, `cle-publique.pem`, without asking us"],
  ["npm run licences", "regenerate `LICENCES.md`, the licence of every shipped package; `--check` fails the suite when the table drifts"],
];

/* ─── le compte des tests, lu dans les sources ─── */
const dossier = fileURLToPath(new URL(".", import.meta.url));

/** Les extensions de fichiers de test que le script `test` de package.json lance vraiment. */
export function extensionsLancees(scriptTest: string): string[] {
  return [...scriptTest.matchAll(/src\/\*(\.test\.[a-z]+)/g)].map((m) => m[1]!);
}

/** Compte les `test(` dans les fichiers que la commande de test lance — pas dans ceux qu'on
 *  aurait choisis ici. */
export function compterLesCas(dossierSrc: string, scriptTest: string): { n: number; fichiers: string[] } {
  const extensions = extensionsLancees(scriptTest);
  const fichiers = readdirSync(dossierSrc).filter((f) => extensions.some((e) => f.endsWith(e))).sort();
  let n = 0;
  for (const f of fichiers) {
    const src = readFileSync(join(dossierSrc, f), "utf8");
    n += [...src.matchAll(/^\s*test\s*\(/gm)].length;
  }
  return { n, fichiers };
}

const scriptTest = String(JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
).scripts?.test ?? "");

/* TÉMOIN AVANT LE COMPTE : si le motif cesse de lire le script, le compte porterait sur un
   ensemble choisi ici plutôt que sur celui qui tourne. */
if (extensionsLancees(scriptTest).length < 2) {
  throw new Error("the `test` script in package.json no longer names the test extensions it runs; the count would lie.");
}
const { n: nEcrits, fichiers } = compterLesCas(dossier, scriptTest);
if (nEcrits < 5) throw new Error(`${nEcrits} tests counted across ${fichiers.length} file(s): the reading failed.`);

/** Le compte que `npm test` IMPRIME : les tests écrits dans une boucle (un par scénario, un
 *  par nature) n'existent qu'à l'exécution, et le lecteur qui lance la suite lit ce chiffre-là,
 *  pas celui des `test(` dans les sources. Le 7/09 les sources en comptaient 95 quand la
 *  suite en passait 110 : le README et le site publiaient un chiffre que la commande
 *  invitée à vérifier contredisait. Une suite rouge ne publie aucun compte. */
export function compterEnLancant(dossierSrc: string, fichiersTest: string[]): number {
  const r = spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...fichiersTest.map((f) => join(dossierSrc, f))],
    { encoding: "utf8", env: process.env, maxBuffer: 64 * 1024 * 1024 });
  const m = r.stdout.match(/^# tests (\d+)$/m);
  if (!m) throw new Error(`the test run printed no \`# tests N\` line; the count would be a guess. stderr: ${r.stderr.slice(0, 400)}`);
  if (r.status !== 0) throw new Error(`the suite fails (exit ${r.status}); no test count is published on a red suite.`);
  return Number(m[1]);
}

const n = compterEnLancant(dossier, fichiers);
if (n < nEcrits) throw new Error(`${n} tests ran but ${nEcrits} are written: a loop can only add tests, the reading failed.`);

const blocs = {
  commandes: table(["Command", "What it does, in the order that makes sense"],
    COMMANDES.map(([c, quoi]) => [`\`${c}\``, quoi])),
  tests: `**${n} tests** across ${fichiers.length} files, counted by running the suite rather than typed here.`,
};

run(fileURLToPath(new URL("../README.md", import.meta.url)), blocs);
