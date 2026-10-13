/**
 * WHAT A COARSER GRID COSTS THE REVIEW: the cell the tool recommends, on the public record, on each grid.
 *
 *     node src/pas-client.ts
 *
 * The grid of a client record is PAS_CLIENT apart (facteur.ts), and the record keeps only a few cells of it. What the grid
 * serves is the recommended cell: the strictest threshold that holds the recall floor, with the fewest false alerts (the rule of
 * `optimise`, `meilleureSousRappel`, applied here, not copied). This reads the sealed public record (42 + 42 written dossiers,
 * 126 + 126 generated), keeps the thresholds that sit on each grid, and prints for every recall floor from 0.5 to the default
 * 0.90 the factor, the threshold, the false alerts and the reviews raised that the rule picks. The comment of PAS_CLIENT quotes
 * the result; pas-client.test.ts pins what it quotes. Nothing of a client is read.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isMain } from "./cli.ts";
import { PALIERS, PAS_CLIENT, type PalierId } from "./facteur.ts";
import { ASSUMPTIONS } from "./assumptions.ts";
import { ENOUGH, type Rate } from "./interval.ts";
import { meilleureSousRappel, type CellulePlacee } from "./optimise.ts";

export const PLANCHERS: readonly number[] = [0.5, 0.6, 0.7, 0.8, ASSUMPTIONS.recallFloor];
export const PAS: readonly number[] = [0.01, PAS_CLIENT, 0.10, 0.25];
export type Moitie = "authored" | "synthetic";

export type Ligne = {
  moitie: Moitie; plancher: number; pas: number;
  cellule: { facteur: string; seuil: number; fausses: number; levees: number } | null;
};

type CelluleScellee = { succes: number; n: number; taux: number; bas: number; haut: number };
type Table = Record<string, { rappel: CelluleScellee; fauxPositifs: CelluleScellee }>;
type ReleveDuPublic = Record<Moitie, { tables: Record<string, Table>; nEscalated: number; nMaintained: number }>;

const releve = (): ReleveDuPublic =>
  JSON.parse(readFileSync(fileURLToPath(new URL("../releve-public.json", import.meta.url)), "utf8")) as ReleveDuPublic;

const taux = (c: CelluleScellee): Rate =>
  ({ successes: c.succes, n: c.n, rate: c.taux, low: c.bas, high: c.haut, precision: ((c.haut - c.bas) / 2) * 100, reportable: c.n >= ENOUGH });

/** The cells of one half on the grid of a given step, in the shape `optimise` reads. */
function cellules(r: ReleveDuPublic, moitie: Moitie, pas: number): CellulePlacee[] {
  const sortie: CellulePlacee[] = [];
  for (const [facteur, table] of Object.entries(r[moitie].tables)) {
    for (const [cle, c] of Object.entries(table)) {
      const seuil = Number(cle);
      if (Math.abs(Math.round((seuil - 0.5) / pas) * pas - (seuil - 0.5)) > 1e-9) continue;
      sortie.push({ seuil, tirees: c.rappel.succes + c.fauxPositifs.succes, rappel: taux(c.rappel), faussesAlertes: taux(c.fauxPositifs),
        palier: facteur as PalierId, rang: PALIERS.indexOf(facteur as PalierId) + 1 });
    }
  }
  return sortie;
}

/** Every recall floor and every step, on both halves of the public record. */
export function comparer(): Ligne[] {
  const r = releve();
  const lignes: Ligne[] = [];
  for (const moitie of ["authored", "synthetic"] as const) {
    for (const plancher of PLANCHERS) {
      for (const pas of PAS) {
        const c = meilleureSousRappel(cellules(r, moitie, pas), plancher);
        lignes.push({ moitie, plancher, pas,
          cellule: c ? { facteur: c.palier, seuil: c.seuil, fausses: c.faussesAlertes.successes, levees: c.tirees } : null });
      }
    }
  }
  return lignes;
}

if (isMain(import.meta)) {
  const r = releve();
  const toutes = comparer();
  for (const moitie of ["authored", "synthetic"] as const) {
    console.log(`\n${moitie}: ${r[moitie].nEscalated} escalated, ${r[moitie].nMaintained} maintained`);
    for (const plancher of PLANCHERS) {
      const parPas = toutes.filter((l) => l.moitie === moitie && l.plancher === plancher).map((l) =>
        `step ${l.pas.toFixed(2)}: ${l.cellule ? `${l.cellule.facteur} at ${l.cellule.seuil.toFixed(2)}, ${l.cellule.fausses} false alert(s), ${l.cellule.levees} raised` : "no cell holds the floor"}`);
      console.log(`  recall floor ${plancher}${plancher === ASSUMPTIONS.recallFloor ? " (the default)" : ""}:\n    ${parPas.join("\n    ")}`);
    }
  }
}
