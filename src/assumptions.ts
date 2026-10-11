/**
 * What is not measured — and never dressed as if it were.
 *
 * The measurement on a client's concluded periodic reviews produces rates with intervals;
 * everything else — the risk TABLES every factor reads, what an analyst costs, how many
 * customers the portfolio holds — nobody here can know. Those are ASSUMPTIONS, declared
 * with provenance, unit and bounds so a reader substitutes their own and sees what moves.
 *
 * THE TABLES ARE THE LOUDEST ASSUMPTION OF THIS TOOL, and the contract is explicit:
 * short DECLARED lists, never a copied official list. A country list here is not a claim
 * about any country: it is a knob whose default is arguable by construction, shipped so
 * the measurement machinery can run, and replaced by the client's own table with
 * `--tables=<json>`. The sealed record of a client's run carries the name and sha256 of
 * the tables it was measured under, never their values; the public record, which runs the
 * declared tables only, carries them whole.
 */
import type { Tables } from "./facteur.ts";

export type Provenance = "retrieved" | "measured" | "assumed" | "chosen" | "synthetic";

export type Assumptions = {
  /** Minutes an analyst spends on one periodic review. Assumed — yours differ. */
  minutesPerReview: number;
  /** Loaded annual cost of one analyst. Assumed. */
  analystAnnualCost: number;
  /** Hours genuinely productive per day. Assumed, and never eight. */
  productiveHoursPerDay: number;
  workingDaysPerYear: number;
  /** Customers in the portfolio when `--volume` is not supplied: budget arithmetic only,
   *  never a printed per-thousand rate. */
  portfolioCustomers: number;
  /** The recall a review programme is held to before anything else is weighed: the
   *  tool's rule (contract §6): lower bound at or above this, then fewest false alerts. */
  recallFloor: number;
};

export const ASSUMPTIONS: Assumptions = {
  minutesPerReview: 45,
  analystAnnualCost: 62_000,
  productiveHoursPerDay: 6,
  workingDaysPerYear: 220,
  portfolioCustomers: 50_000,
  recallFloor: 0.90,
};

export const STATUSES: Record<keyof Assumptions, Provenance> = {
  minutesPerReview: "assumed",
  analystAnnualCost: "assumed",
  productiveHoursPerDay: "assumed",
  workingDaysPerYear: "assumed",
  portfolioCustomers: "assumed",
  recallFloor: "assumed",
};

export const UNITS: Record<keyof Assumptions, string> = {
  minutesPerReview: "minutes/review",
  analystAnnualCost: "usd/year",
  productiveHoursPerDay: "hours/day",
  workingDaysPerYear: "days/year",
  portfolioCustomers: "customers/portfolio",
  recallFloor: "escalations recalled/confirmed escalation",
};

export const BOUNDS: Record<keyof Assumptions, [number, number]> = {
  minutesPerReview: [5, 480],
  analystAnnualCost: [20_000, 200_000],
  productiveHoursPerDay: [1, 8],
  workingDaysPerYear: [180, 260],
  portfolioCustomers: [100, 100_000_000],
  recallFloor: [0.5, 1],
};

/**
 * LES TABLES DÉCLARÉES que les facteurs lisent — courtes, arguables, remplaçables.
 *
 * Aucune n'est une liste officielle recopiée (le contrat le REFUSE : une liste FATF ou
 * UE recopiée figerait dans un dépôt public une position réglementaire datée, avec
 * l'autorité d'un outil) ; chacune est une hypothèse de démonstration dont la seule
 * promesse est d'être visible, scellée dans le relevé, et remplaçable par
 * `--tables=<json>`. Les codes pays sont ISO 3166-1 alpha-2 ; les poids vivent dans
 * [0, 1] et un pays ou un code absent vaut 0 : l'absence n'accuse personne.
 */
export const TABLES: Tables = {
  paysRisque: { "KY": 0.7, "PA": 0.6, "AE": 0.5, "TR": 0.4, "MC": 0.4, "VG": 0.7 },
  /* Arbitrage du chef, 8/09 (lot A-L4) : la table ne partageait AUCUN code avec les 84
     dossiers écrits (vocabulaire L2 ∩ L3 = ∅), donc `activity` était aveugle sur la mesure
     publique : rappel 0 partout, fausses alertes 0 partout, une ligne morte qui ne disait
     rien de l'outil. Une table d'activités déclarée doit porter les codes qu'un portefeuille
     ordinaire porte : holdings et sociétés de négoce (les structures des archétypes), le
     commerce à espèces DES DEUX CÔTÉS (restaurant, station de lavage, supérette, mais aussi
     boulangerie, épicerie, café : les sosies bénins pèsent AUSSI, et c'est ce que la mesure
     doit montrer), le bâtiment, le gros, la logistique, le conseil, le numérique à distance,
     l'export. Les codes de la table de départ restent. Retraités, étudiants, salariés,
     ateliers : absents, donc 0. `geography` reste aveugle sur les dossiers écrits, et c'est
     VOULU : tous résident dans l'Union, aucune liste de pays ne les touche ; le relevé le dit. */
  activiteRisque: { "casino": 0.8, "crypto-exchange": 0.8, "money-services": 0.7,
                    "art-dealer": 0.6, "real-estate": 0.5, "import-export": 0.4,
                    "defense": 0.6, "precious-metals": 0.6,
                    "holding": 0.5, "trading-co": 0.5, "construction": 0.4, "wholesale": 0.35,
                    "logistics": 0.3, "consultant": 0.25,
                    "restaurant": 0.4, "car-wash": 0.5, "mini-market": 0.4,
                    "bakery": 0.3, "grocery": 0.3, "cafe": 0.3,
                    "web-services": 0.3, "e-commerce": 0.3,
                    "wine-export": 0.3, "fruit-export": 0.3, "textile-export": 0.3 },
  produitRisque: { cash: 0.5, wire: 0.2, card: 0.1, correspondent: 0.7, private: 0.5,
                   crypto: 0.7, safe: 0.4, trade: 0.3 },
  exposition: { pep: 0.8, pepRelative: 0.5, adverseMedia: 0.6 },
  structure: { couchesOpaques: 2, poidsCouche: 0.2, poidsBeneficiaireInconnu: 0.6,
               poidsJuridictionOpaque: 0.5 },
  comportement: { echelleEcartTurnover: 2, poidsEspeces: 0.5, poidsTransfrontiere: 0.3 },
  anciennete: { joursNeuf: 180, joursDormance: 365, poidsDistance: 0.3 },
};

/** La provenance des tables, en un mot chacune : toutes `assumed`, et c'est la thèse. */
export const TABLES_STATUS: Record<keyof Tables, Provenance> = {
  paysRisque: "assumed",
  activiteRisque: "assumed",
  produitRisque: "assumed",
  exposition: "assumed",
  structure: "assumed",
  comportement: "assumed",
  anciennete: "assumed",
};

/**
 * Les tables du CLIENT (`--tables=<json>`), fusionnées CLÉ À CLÉ sur les déclarées :
 * une clé de premier niveau donnée remplace la table ENTIÈRE (moitié de table fusionnée
 * = une hypothèse hybride que personne n'a déclarée) ; une clé inconnue est refusée en
 * la nommant ; les poids sont bornés à [0, 1] avant toute mesure.
 */
export function tablesAvec(brut: string): Tables {
  let lu: unknown;
  try { lu = JSON.parse(brut); } catch (e) {
    throw new Error(`--tables is not readable JSON: ${(e as Error).message}`);
  }
  const o = lu as Partial<Record<keyof Tables, unknown>>;
  const connues = Object.keys(TABLES) as (keyof Tables)[];
  const inconnues = Object.keys(o).filter((k) => !connues.includes(k as keyof Tables));
  if (inconnues.length > 0) {
    throw new Error(`--tables carries ${inconnues.length} unknown table(s): `
      + `${inconnues.map((k) => `"${k}"`).join(", ")}.\n`
      + `  Declared tables: ${connues.join(", ")}. A table this tool does not read would\n`
      + `  change nothing and look like it did.`);
  }
  const fusion = { ...TABLES, ...(o as Partial<Tables>) } as Tables;
  const plates: [string, number][] = [
    ...Object.entries(fusion.paysRisque), ...Object.entries(fusion.activiteRisque),
    ...Object.entries(fusion.produitRisque), ...Object.entries(fusion.exposition),
    ["structure.poidsCouche", fusion.structure.poidsCouche],
    ["structure.poidsBeneficiaireInconnu", fusion.structure.poidsBeneficiaireInconnu],
    ["structure.poidsJuridictionOpaque", fusion.structure.poidsJuridictionOpaque],
    ["comportement.poidsEspeces", fusion.comportement.poidsEspeces],
    ["comportement.poidsTransfrontiere", fusion.comportement.poidsTransfrontiere],
    ["anciennete.poidsDistance", fusion.anciennete.poidsDistance],
  ];
  const hors = plates.filter(([, v]) => !(typeof v === "number" && v >= 0 && v <= 1));
  if (hors.length > 0) {
    throw new Error(`--tables carries ${hors.length} weight(s) outside [0, 1]: `
      + `${hors.slice(0, 6).map(([k, v]) => `${k}=${v}`).join(", ")}.\n`
      + `  A weight outside the scale would push a score outside [0, 1] and the factor\n`
      + `  would refuse mid-measurement; refused here instead, before anything runs.`);
  }
  return fusion;
}

/** usd → $ : le seul endroit du dépôt où ce couple est écrit. */
export function symboleDe(unite: string): string {
  if (unite.startsWith("usd")) return "$";
  throw new Error(`no display symbol declared for unit "${unite}": declare it here rather than typing one at the render site.`);
}

export function analystHourlyCost(a: Assumptions = ASSUMPTIONS): number {
  return a.analystAnnualCost / (a.workingDaysPerYear * a.productiveHoursPerDay);
}

export function ligneDHypothese(cle: keyof Assumptions, a: Assumptions = ASSUMPTIONS): string {
  return `${cle} = ${a[cle]} ${UNITS[cle]} (${STATUSES[cle]})`;
}
