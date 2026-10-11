/**
 * LA COUTURE DE L'OUTIL AMÉTHYSTE : un FACTEUR de risque note un Dossier dans [0, 1].
 *
 * Sept facteurs, du plus bête (le pays contre une liste déclarée) au plus cher (l'écart du
 * comportement au profil déclaré), chacun dans son fichier sous `src/facteurs/` (lot L1),
 * enregistrés par `src/facteurs/index.ts` (`registre()`). La mesure (L4) et la mesure client
 * (L3) balaient chaque facteur sur les seuils de SEUILS (publique) ou de SEUILS_CLIENT (client) et lisent rappel et fausses
 * alertes par cellule. Un facteur ne lit JAMAIS une constante à lui : les listes, poids et
 * échelles arrivent par `Tables` (src/assumptions.ts, lot L3), remplaçables par celles du
 * client. A client's run seals each table's name and sha256, never its values.
 *
 * Déterministe, sans réseau, sans état : le même Dossier et les mêmes Tables rendent le
 * même score, sur toute machine.
 */
import type { Dossier } from "./dossier.ts";

/** dans [0, 1] ; 1 = le dossier le plus risqué que le facteur sache voir */
export type Score = number;

/** Les HYPOTHÈSES déclarées que les facteurs lisent (valeurs dans assumptions.ts, lot L3). */
export interface Tables {
  /** pays → poids dans [0, 1] ; un pays absent vaut 0 ; liste courte, déclarée, jamais une liste officielle recopiée */
  paysRisque: Readonly<Record<string, number>>;
  /** code d'activité → poids dans [0, 1] ; un code absent vaut 0 */
  activiteRisque: Readonly<Record<string, number>>;
  /** produit → poids dans [0, 1] ; le facteur combine les produits détenus */
  produitRisque: Readonly<Record<string, number>>;
  /** exposition → poids : pep, pep-relative, adverse-media */
  exposition: Readonly<{ pep: number; pepRelative: number; adverseMedia: number }>;
  /** structure : couches à partir desquelles l'opacité commence, et le poids de chaque signal */
  structure: Readonly<{ couchesOpaques: number; poidsCouche: number; poidsBeneficiaireInconnu: number; poidsJuridictionOpaque: number }>;
  /** comportement : échelles de l'écrasement 1 - exp(-x / echelle) pour l'écart de chiffre d'affaires, et poids des parts */
  comportement: Readonly<{ echelleEcartTurnover: number; poidsEspeces: number; poidsTransfrontiere: number }>;
  /** ancienneté : en dessous de jours, un client est « neuf » ; dormance qui compte, en jours ; poids du canal à distance */
  anciennete: Readonly<{ joursNeuf: number; joursDormance: number; poidsDistance: number }>;
}

export interface Facteur {
  readonly id: PalierId;
  /** une phrase pour le rapport : ce que le facteur regarde, et ce qu'il ne voit pas */
  readonly description: string;
  /** 1 (le plus bête) → 7 (le plus cher) */
  readonly rang: number;
  /** la table qu'il lit, nommée : `paysRisque`, `activiteRisque`, … ; une seule, ou plusieurs, jamais aucune */
  readonly tablesLues: readonly (keyof Tables)[];
  score(d: Dossier, tables: Tables): Score;
}

export const PALIERS = ["geography", "activity", "product", "exposure", "structure", "behaviour", "tenure"] as const;
export type PalierId = (typeof PALIERS)[number];

/** 0,50 → 1,00 par pas de 0,01 : 51 seuils, arrondis au centième, les mêmes que les trois autres outils. C'est la grille de la
 *  MESURE PUBLIQUE (measure.ts), scellée et signée : elle publie ses tables déclarées en entier, aucun poids de client n'y vit.
 *  Un relevé CLIENT, lui, suit `SEUILS_CLIENT` ci-dessous. */
export const SEUILS: readonly number[] = Array.from({ length: 51 }, (_, i) => Math.round((0.5 + i * 0.01) * 100) / 100);

/**
 * The step of the grid of a CLIENT record. The grid is a histogram of each factor's scores (a group of customers that share a score
 * steps recall from 100 % to 0 between the two thresholds that bracket it), and a histogram gave a risk-table weight back, so the
 * record no longer holds the grid: it keeps, per factor, only the cell the rule of optimise picks under ONE recall floor and the next
 * threshold of this grid (`reduire`, your-reviews.ts), and the grid itself stays on the client's machine. Another floor means
 * running measure:yours again, here. What is left, measured with the writer as the oracle (record-croise.test.ts) and said exactly
 * by DIT_LES_CAS below: the step bounds each score, not each weight. A weight can still read tighter than the step when a kept
 * threshold falls between two scores of one factor that sit closer than the step (a product held alone and with a cheap one, near a
 * weight of 0.9), when it enters one score twice (geography counts a country twice when residence is nationality, so that score is
 * steeper than the weight), when two tables carry the same weight and the observer knows it (the record cannot say so, the observer
 * must), or when records of the same data measured at different floors are shared together. It does not narrow
 * by crossing two brackets inside one record, which the full grid allowed.
 *
 * WHY 0.05, the coarsest step that still serves the review. What the grid serves is the recommended cell: the strictest threshold
 * that holds the recall floor, with the fewest false alerts. `node src/pas-client.ts` prints that cell on the grids of 0.01, 0.05,
 * 0.10 and 0.25, for the recall floors 0.5 to 0.9 (the default), on both halves of the public record (42 + 42 written dossiers,
 * 126 + 126 generated), and pas-client.test.ts pins every figure quoted here. At the default floor no cell holds it on any grid.
 * For the floors 0.5 to 0.8, a step of 0.05 keeps the recommended factor and its false alerts and raises at most one review more
 * than the grid of 0.01 does; a step of 0.10 raises up to eleven more; a step of 0.25 adds ten false alerts. What a client loses
 * with 0.05: the recommended threshold sits on one of eleven values, up to one step under the finest optimum, and the cells
 * between are not written.
 */
export const PAS_CLIENT = 0.05;

/** What a client is told about how far a weight can be read back from the record: said once here, and quoted by the report, the
 *  usage line and the README. record-croise.test.ts measures each case it names; grille-client.test.ts pins that every place says it. */
export const DIT_LES_CAS = "The step bounds each score, not each weight: a weight can still read tighter than the step when a kept threshold falls "
  + "between two scores of one factor that sit closer than the step, when it enters one score twice (residence equal to nationality in "
  + "geography), when two tables carry the same weight and the observer knows it, or when records of the same data measured at different "
  + "floors are shared together.";
/** And what another recall floor takes. */
export const DIT_UN_AUTRE_PLANCHER = "The record cannot answer another recall floor: run measure:yours again, here, on the same files, with another --recall.";

/** 0,50 → 1,00 par pas de PAS_CLIENT : la grille d'un relevé CLIENT (`measure:yours`), onze seuils. */
export const SEUILS_CLIENT: readonly number[] = Array.from({ length: Math.round(0.5 / PAS_CLIENT) + 1 },
  (_, i) => Math.round((0.5 + i * PAS_CLIENT) * 1e6) / 1e6);

/** Un score hors [0, 1] est une erreur nommée, jamais un arrondi silencieux. */
export function exigerScore(s: number, id: string, d: Dossier): Score {
  if (typeof s !== "number" || Number.isNaN(s) || s < 0 || s > 1) {
    throw new Error(`factor ${id} scored ${s} on dossier ${d.id}: a score lives in [0, 1]`);
  }
  return s;
}

/** Un brut positif écrasé vers [0, 1] : 1 - exp(-x / echelle) ; l'échelle est une hypothèse déclarée, jamais tapée ici. */
export function ecraser(x: number, echelle: number): Score {
  if (!(echelle > 0)) throw new Error(`a scale must be > 0, got ${echelle}`);
  if (!(x >= 0)) throw new Error(`a raw value must be >= 0, got ${x}`);
  return 1 - Math.exp(-x / echelle);
}

/** Le maximum borné d'une liste de poids : plusieurs signaux ne dépassent jamais 1. */
export function combiner(poids: readonly number[]): Score {
  let s = 0;
  for (const p of poids) {
    if (!(p >= 0 && p <= 1)) throw new Error(`a weight lives in [0, 1], got ${p}`);
    s = 1 - (1 - s) * (1 - p);      // l'union de signaux indépendants : monotone, bornée, sans surprise
  }
  return s;
}

export type Registre = ReadonlyMap<PalierId, Facteur>;
