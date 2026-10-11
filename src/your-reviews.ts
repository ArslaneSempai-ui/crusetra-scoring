/**
 * LA MESURE SUR LES REVUES PÉRIODIQUES DU CLIENT — la question du contrat :
 *
 *     npm run measure:yours -- --customers=your-customers.csv --reviews=your-reviews.csv
 *     → which risk factor suffices, at which threshold, on your own periodic-review outcomes
 *
 * DEUX fichiers entrent : les revues conclues (`escalated` ou `maintained`) et les clients
 * revus tels que déclarés et observés. L'outil REJOINT les deux par `customer_id`,
 * reconstruit pour chaque revue le DOSSIER du contrat (l'ancienneté au jour de la revue,
 * le comportement des 365 jours qui précèdent), puis rejoue chaque facteur du registre à
 * chaque seuil : rappel sur les escalades confirmées, fausses alertes sur les revues
 * classées sans suite, n et Wilson partout.
 *
 * ─── JAMAIS UNE VALEUR ───
 *
 * Les sorties portent des comptes, des taux, des intervalles et un verdict par
 * `review_id` : JAMAIS un customer_id, un pays, un code d'activité ou un montant. Un test
 * plante des sentinelles dans chaque colonne et prouve d'abord que son détecteur voit.
 *
 * The risk tables of `--tables` are your risk policy, so the record carries each table as
 * a name and a sha256 only (see `sealTables`): a changed table shows, no weight and no
 * country code leaves. And its grid of thresholds is `SEUILS_CLIENT`, PAS_CLIENT apart: the
 * grid is a histogram of each factor's scores, so a weight shows in it no better than that
 * step (grille-client.test.ts plants weights and reads them back).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { isMain, refuserDrapeauxInconnus } from "./cli.ts";
import { lireTable, apercu, MONTRES } from "./csv.ts";
import { rate, type Rate } from "./interval.ts";
import { SEUILS_CLIENT, PAS_CLIENT, PALIERS, type PalierId, type Registre, type Tables } from "./facteur.ts";
import { KINDS, PEPS, PRODUITS, CANAUX, exigerDossier,
         type Dossier, type Kind, type Pep, type Produit, type Canal } from "./dossier.ts";
import { TABLES, tablesAvec } from "./assumptions.ts";
import { empreinteDuReleve } from "./empreinte.ts";
import { rendreRapport } from "./rapport.ts";
import { lignesEvaluationDe } from "./evaluation.ts";

export const COLONNES_REVUES = ["review_id", "customer_id", "reviewed_at", "outcome"] as const;
export const COLONNES_REVUES_OPT = ["rating_before"] as const;
export const COLONNES_CLIENTS = ["customer_id", "kind", "residence_country", "activity_code",
  "products", "pep", "onboarding_channel", "relationship_start",
  "declared_turnover", "observed_turnover", "cash_ratio", "cross_border_ratio"] as const;
export const COLONNES_CLIENTS_OPT = ["nationality_country", "adverse_media", "ownership_layers",
  "beneficial_owner_named", "opaque_jurisdiction", "dormant_days"] as const;

/** Sous ce nombre de revues, aucune cellule de la frontière ne peut être bornée : refus. */
export const MINIMUM_REVUES = 30;

export type Outcome = "escalated" | "maintained";

export type Revue = {
  id: string;
  client: string;              /* customer_id : la clé de jointure, NE SORT JAMAIS */
  dateRevue: string;
  outcome: Outcome;
  noteAvant?: string;
};

const JOUR_MS = 86_400_000;

function colonnes(noms: readonly string[], requises: readonly string[], optionnelles: readonly string[],
  quoi: string, aide: string): void {
  const connues = new Set<string>([...requises, ...optionnelles]);
  const inconnues = noms.filter((n) => !connues.has(n));
  if (inconnues.length > 0) {
    throw new Error(
      `Your ${quoi} header carries ${inconnues.length} column(s) this command does not know: `
      + `${apercu(inconnues.map((n) => `"${n}"`), MONTRES)}.\n`
      + `  Accepted: ${requises.join(", ")}`
      + (optionnelles.length ? `; then, optionally: ${optionnelles.join(", ")}.` : ".")
      + `\n  Left as they were, unknown columns would be read as something else or dropped in\n`
      + `  silence, and the rates would answer a different question than the one you asked.`);
  }
  const manquantes = requises.filter((n) => !noms.includes(n));
  if (manquantes.length > 0) {
    throw new Error(`Your ${quoi} header is missing ${manquantes.map((n) => `"${n}"`).join(", ")}.\n${aide}`);
  }
}

/* ─────────────────────────────── les revues ─────────────────────────────── */

export function lireRevues(texte: string): { revues: Revue[]; avertissements: string[] } {
  const t = lireTable(texte);
  colonnes(t.noms, COLONNES_REVUES, COLONNES_REVUES_OPT, "reviews",
    `  review_id names the review, customer_id joins it to your customers file,\n`
    + `  reviewed_at is the ISO day the review concluded (behaviour read over the 365 days\n`
    + `  before it), outcome is the committee's decision: escalated (risk confirmed) or\n`
    + `  maintained (closed without action). Optional: rating_before.`);

  const avertissements: string[] = [];
  if (t.ecartees.length) avertissements.push(
    `${t.ecartees.length} review row(s) carried more cells than the header and were discarded: `
    + `line(s) ${t.ecartees.slice(0, 8).map((e) => e.ligne).join(", ")}.`);
  if (t.courtes.length) avertissements.push(
    `${t.courtes.length} review row(s) were shorter than the header; missing cells read as empty: `
    + `line(s) ${t.courtes.slice(0, 8).map((e) => e.ligne).join(", ")}.`);

  const col = Object.fromEntries(t.noms.map((n, i) => [n, i])) as Record<string, number>;
  const lire = (l: string[], nom: string): string => (l[col[nom]!] ?? "").trim();

  const horsVocabulaire = t.lignes
    .map((l, i) => ({ ligne: t.numeros[i]!, valeur: lire(l, "outcome") }))
    .filter((x) => !["escalated", "maintained"].includes(x.valeur.toLowerCase()));
  if (horsVocabulaire.length > 0) {
    const montre = horsVocabulaire.slice(0, 8).map((x) => `line ${x.ligne}: "${x.valeur}"`).join("; ");
    throw new Error(
      `${horsVocabulaire.length} review row(s) carry an outcome outside the vocabulary: ${montre}.\n`
      + `  This tool reads exactly two: "escalated" (risk confirmed: enhanced diligence, exit\n`
      + `  or filing) and "maintained" (closed without action). Anything else (pending, a\n`
      + `  typo) has no place in either rate. Map your outcomes to these two, or drop the\n`
      + `  undecided rows.`);
  }

  const datesIllisibles = t.lignes
    .map((l, i) => ({ ligne: t.numeros[i]!, valeur: lire(l, "reviewed_at") }))
    .filter((x) => !/^\d{4}-\d{2}-\d{2}$/.test(x.valeur) || Number.isNaN(Date.parse(x.valeur)));
  if (datesIllisibles.length > 0) {
    throw new Error(
      `${datesIllisibles.length} review row(s) carry an unreadable reviewed_at: `
      + `line(s) ${datesIllisibles.slice(0, 8).map((x) => x.ligne).join(", ")}.\n`
      + `  reviewed_at is the ISO day (YYYY-MM-DD) the review concluded; a review that\n`
      + `  cannot be placed in time cannot anchor the dossier's tenure or behaviour window.`);
  }

  const vides = t.lignes.map((l, i) => ({ ligne: t.numeros[i]!, id: lire(l, "review_id"), c: lire(l, "customer_id") }))
    .filter((x) => x.id === "" || x.c === "");
  if (vides.length > 0) {
    throw new Error(
      `${vides.length} review row(s) have an empty review_id or customer_id: line(s) `
      + `${vides.slice(0, 8).map((x) => x.ligne).join(", ")}.\n`
      + `  The verdicts are keyed by review_id and the join runs on customer_id.`);
  }

  const parId = new Map<string, number[]>();
  t.lignes.forEach((l, i) => {
    const id = lire(l, "review_id");
    parId.set(id, [...(parId.get(id) ?? []), t.numeros[i]!]);
  });
  const doublons = [...parId.entries()].filter(([, lignes]) => lignes.length > 1);
  if (doublons.length > 0) {
    const lignesDe = (lignes: number[]) => lignes.length <= 8
      ? lignes.join(", ") : `${lignes.slice(0, 8).join(", ")}, and ${lignes.length - 8} more`;
    const montre = doublons.slice(0, 6).map(([id, lignes]) => `"${id}" (rows ${lignesDe(lignes)})`).join("; ");
    throw new Error(
      `duplicate review_id(s): ${montre}.\n`
      + `  One row is one concluded review: a duplicate would count the same case twice in\n`
      + `  a rate without a word. Deduplicate the export, or give each row its own id.\n`
      + `  Nothing was measured.`);
  }

  if (t.lignes.length < MINIMUM_REVUES) {
    throw new Error(
      `Your file holds ${t.lignes.length} review(s); this measurement wants at least ${MINIMUM_REVUES}.\n`
      + `  Below that, no cell of the threshold frontier can be bounded: every interval\n`
      + `  spans most of the scale. Export a longer window of history and run again.`);
  }

  const revues: Revue[] = t.lignes.map((l) => ({
    id: lire(l, "review_id"),
    client: lire(l, "customer_id"),
    dateRevue: lire(l, "reviewed_at"),
    outcome: lire(l, "outcome").toLowerCase() as Outcome,
    ...(lire(l, "rating_before") !== "" ? { noteAvant: lire(l, "rating_before") } : {}),
  }));
  return { revues, avertissements };
}

/* ─────────────────────────────── les clients ─────────────────────────────── */

export type ClientRevu = {
  kind: Kind; residence: string; nationality?: string; activity: string;
  products: Produit[]; pep: Pep; adverseMedia: boolean;
  ownershipLayers: number; beneficialOwnerNamed: boolean; opaqueJurisdiction: boolean;
  onboarding: Canal; relationshipStart: string;
  declaredTurnover: number; observedTurnover: number;
  cashRatio: number; crossBorderRatio: number; dormantDays: number;
};

export function lireClients(texte: string): { parClient: Map<string, ClientRevu>; avertissements: string[] } {
  const t = lireTable(texte);
  colonnes(t.noms, COLONNES_CLIENTS, COLONNES_CLIENTS_OPT, "customers",
    `  Each row is one reviewed customer, as declared at onboarding and as observed over\n`
    + `  the 365 days before the review: see the contract table for each column's meaning.`);

  const avertissements: string[] = [];
  if (t.ecartees.length) avertissements.push(
    `${t.ecartees.length} customer row(s) carried more cells than the header and were discarded: `
    + `line(s) ${t.ecartees.slice(0, 8).map((e) => e.ligne).join(", ")}.`);

  const col = Object.fromEntries(t.noms.map((n, i) => [n, i])) as Record<string, number>;
  const lire = (l: string[], nom: string): string => (l[col[nom]!] ?? "").trim();

  const fautes: { quoi: string; lignes: number[] }[] = [];
  const releve = (quoi: string, ligne: number) => {
    const f = fautes.find((x) => x.quoi === quoi) ?? fautes[fautes.push({ quoi, lignes: [] }) - 1]!;
    f.lignes.push(ligne);
  };

  const parClient = new Map<string, ClientRevu>();
  t.lignes.forEach((l, i) => {
    const ligne = t.numeros[i]!;
    const id = lire(l, "customer_id");
    if (id === "") { releve("an empty customer_id", ligne); return; }
    const kind = lire(l, "kind").toLowerCase();
    if (!KINDS.includes(kind as Kind)) { releve(`a kind outside ${KINDS.join("/")}`, ligne); return; }
    const pep = lire(l, "pep").toLowerCase();
    if (!PEPS.includes(pep as Pep)) { releve(`a pep outside ${PEPS.join("/")}`, ligne); return; }
    const canal = lire(l, "onboarding_channel").toLowerCase();
    if (!CANAUX.includes(canal as Canal)) { releve(`an onboarding_channel outside ${CANAUX.join("/")}`, ligne); return; }
    const produits = lire(l, "products").split(";").map((p) => p.trim().toLowerCase()).filter((p) => p !== "");
    if (produits.length === 0 || produits.some((p) => !PRODUITS.includes(p as Produit))) {
      releve(`a products list outside ${PRODUITS.join(";")}`, ligne); return;
    }
    /* Les nombres : le motif décide, la conversion ne voit que ce qu'il accepte :
       Number("") vaut 0 et un vide converti d'abord entrerait comme une mesure lue. */
    const brutDeclare = lire(l, "declared_turnover");
    if (brutDeclare === "" || !/^\d+(\.\d+)?$/.test(brutDeclare) || Number(brutDeclare) <= 0) {
      releve("a non-positive or unreadable declared_turnover", ligne); return;
    }
    const brutObserve = lire(l, "observed_turnover");
    if (brutObserve === "" || !/^\d+(\.\d+)?$/.test(brutObserve)) {
      releve("a negative or unreadable observed_turnover", ligne); return;
    }
    const ratios: number[] = [];
    for (const nom of ["cash_ratio", "cross_border_ratio"]) {
      const brut = lire(l, nom);
      if (brut === "" || !/^(0(\.\d+)?|1(\.0+)?)$/.test(brut)) { releve(`a ${nom} outside [0, 1]`, ligne); return; }
      ratios.push(Number(brut));
    }
    const debut = lire(l, "relationship_start");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(debut) || Number.isNaN(Date.parse(debut))) {
      releve("an unreadable relationship_start", ligne); return;
    }
    const nat = lire(l, "nationality_country");
    const pays = lire(l, "residence_country");
    const bool01 = (nom: string, defaut: string): boolean | null => {
      const brut = lire(l, nom) || defaut;
      if (brut !== "0" && brut !== "1") { releve(`a ${nom} outside 0/1`, ligne); return null; }
      return brut === "1";
    };
    const adverse = bool01("adverse_media", "0"); if (adverse === null) return;
    const opaque = bool01("opaque_jurisdiction", "0"); if (opaque === null) return;
    let couches = 0, beneficiaire = true;
    if (kind === "entity") {
      const brutCouches = lire(l, "ownership_layers");
      if (!/^\d+$/.test(brutCouches)) { releve("an entity without ownership_layers", ligne); return; }
      couches = Number(brutCouches);
      const bn = lire(l, "beneficial_owner_named");
      if (bn !== "0" && bn !== "1") { releve("an entity without beneficial_owner_named", ligne); return; }
      beneficiaire = bn === "1";
    }
    const brutDormance = lire(l, "dormant_days");
    if (brutDormance !== "" && !/^\d+$/.test(brutDormance)) { releve("an unreadable dormant_days", ligne); return; }
    parClient.set(id, {
      kind: kind as Kind, residence: pays, ...(nat !== "" ? { nationality: nat } : {}),
      activity: lire(l, "activity_code"), products: produits as Produit[],
      pep: pep as Pep, adverseMedia: adverse,
      ownershipLayers: couches, beneficialOwnerNamed: beneficiaire, opaqueJurisdiction: opaque,
      onboarding: canal as Canal, relationshipStart: debut,
      declaredTurnover: Number(brutDeclare), observedTurnover: Number(brutObserve),
      cashRatio: ratios[0]!, crossBorderRatio: ratios[1]!,
      dormantDays: brutDormance === "" ? 0 : Number(brutDormance),
    });
  });
  if (fautes.length > 0) {
    const montre = fautes.map((f) => `${f.lignes.length} row(s) with ${f.quoi} `
      + `(line(s) ${f.lignes.slice(0, 6).join(", ")}${f.lignes.length > 6 ? `, and ${f.lignes.length - 6} more` : ""})`).join(";\n  ");
    throw new Error(
      `The customers file cannot be read as measured data:\n  ${montre}.\n`
      + `  A malformed customer would silently move a dossier's score, so nothing is\n`
      + `  measured until the export is clean. Fix the rows and run again.`);
  }
  return { parClient, avertissements };
}

/* ─────────────── la reconstruction : une revue devient un Dossier ─────────────── */

export function reconstruire(r: Revue, c: ClientRevu): Dossier {
  const jours = Math.max(0, Math.round(
    (Date.parse(r.dateRevue) - Date.parse(c.relationshipStart)) / JOUR_MS));
  return exigerDossier({
    id: r.id, kind: c.kind, residence: c.residence,
    ...(c.nationality !== undefined ? { nationality: c.nationality } : {}),
    activity: c.activity, products: c.products, pep: c.pep, adverseMedia: c.adverseMedia,
    ownershipLayers: c.ownershipLayers, beneficialOwnerNamed: c.beneficialOwnerNamed,
    opaqueJurisdiction: c.opaqueJurisdiction, onboarding: c.onboarding,
    relationshipDays: jours, declaredTurnover: c.declaredTurnover,
    observedTurnover: c.observedTurnover, cashRatio: c.cashRatio,
    crossBorderRatio: c.crossBorderRatio, dormantDays: c.dormantDays,
    reviewedAt: r.dateRevue,
  });
}

/* ───────────────────────────── la mesure elle-même ───────────────────────────── */

export type Cellule = {
  seuil: number;
  tirees: number;
  rappel: Rate;
  faussesAlertes: Rate;
  pourMille?: number;
};

export type MesurePalier = { description: string; rang: number; cellules: Cellule[] };

export type MesureRevues = {
  kind: "scoring-client-record";
  version: 1;
  measuredAt: string;
  source: {
    file: string; sha256: string;
    reviews: number; escalated: number; maintained: number;
    /** dossiers sans nationalité connue : `geography` lit la résidence seule, et le
     *  compte voyage avec les taux plutôt que de se fondre dedans */
    sansNationalite: number;
    periode: { from: string; to: string; jours: number } | null;
  };
  customers: { file: string; sha256: string; rows: number };
  volume: { origine: "volume"; n: number } | null;
  /** The tables UNDER WHICH this record was measured, by name and sha256 and never by
   *  value: changing a table changes the scores, and the sha256 shows it. */
  tables: TableSeal[];
  paliers: Partial<Record<PalierId, MesurePalier>>;
  absents: PalierId[];
  /** By review_id: the committee's outcome and whether the nationality was unknown, never
   *  a score (a score can equal a weight of the client's risk tables). */
  verdicts: Record<string, { outcome: Outcome; sansNationalite: boolean }>;
  code: { commit: string } | null;
  empreinte?: string;
};

/** One risk table as the record holds it: its name and the sha256 of its content. */
export type TableSeal = { name: string; sha256: string };

/** The same JSON with every object's keys sorted, so a table hashes the same whatever
 *  order its author wrote the keys in. */
function sortedKeys(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(sortedKeys);
  if (x && typeof x === "object") {
    return Object.fromEntries(Object.entries(x as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => [k, sortedKeys(v)]));
  }
  return x;
}

/** The name and sha256 of each table, sorted by name. The values stay with the client. The
 *  sha256 is unsalted: it proves which table was used, it does not hide it. */
export function sealTables(tables: Tables): TableSeal[] {
  return Object.keys(tables).sort().map((name) => ({
    name,
    sha256: createHash("sha256")
      .update(JSON.stringify(sortedKeys((tables as unknown as Record<string, unknown>)[name])))
      .digest("hex"),
  }));
}

export function periodeDe(revues: readonly Revue[]): MesureRevues["source"]["periode"] {
  const dates = revues.map((r) => Date.parse(r.dateRevue));
  if (dates.length === 0) return null;
  const from = new Date(Math.min(...dates)).toISOString().slice(0, 10);
  const to = new Date(Math.max(...dates)).toISOString().slice(0, 10);
  const jours = Math.max(1, Math.round((Math.max(...dates) - Math.min(...dates)) / JOUR_MS));
  return { from, to, jours };
}

export function mesurer(
  revues: readonly Revue[],
  parClient: ReadonlyMap<string, ClientRevu>,
  registre: Registre,
  fichiers: { reviews: string; reviewsSha: string; customers: string; customersSha: string; customersRows: number },
  volume: MesureRevues["volume"],
  tables: Tables = TABLES,
  measuredAt = new Date().toISOString(),
): MesureRevues {
  /* Une revue dont le client n'est pas dans le fichier des clients est un refus du
     contrat : un dossier ne se reconstruit pas sur du vide, et un score inventé
     déplacerait les deux taux. Nommé, avec le geste qui corrige. */
  const orphelines = revues.filter((r) => !parClient.has(r.client)).map((r) => r.id);
  if (orphelines.length > 0) {
    throw new Error(
      `${orphelines.length} review(s) have no matching customer row: review(s) `
      + `${apercu(orphelines, 8)}.\n`
      + `  A dossier cannot be rebuilt from a missing customer, and inventing one would\n`
      + `  move both rates. Export the customers covering every review and run again.`);
  }

  const dossiers = new Map<string, Dossier>(
    revues.map((r) => [r.id, reconstruire(r, parClient.get(r.client)!)]));
  const escalades = revues.filter((r) => r.outcome === "escalated");
  const maintenues = revues.filter((r) => r.outcome === "maintained");
  const sansNationalite = [...dossiers.values()].filter((d) => d.nationality === undefined).length;

  const paliers: Partial<Record<PalierId, MesurePalier>> = {};
  const verdicts: MesureRevues["verdicts"] = Object.fromEntries(revues.map((r) => [r.id, {
    outcome: r.outcome,
    sansNationalite: dossiers.get(r.id)!.nationality === undefined,
  }]));

  for (const f of [...registre.values()].sort((x, y) => x.rang - y.rang)) {
    /* Le score d'un dossier se calcule UNE fois et voyage BRUT : un arrondi avant la
       comparaison ferait tirer au seuil 1,00 un score de 0,99996 (payé chez le rouge).
       The scores stay here and feed the cells only: a score can equal a weight of the
       client's tables (the activity score of a customer IS the weight of their code), so
       none is written per review in the record. */
    const scores = new Map<string, number>(
      revues.map((r) => [r.id, f.score(dossiers.get(r.id)!, tables)]));
    const cellules: Cellule[] = SEUILS_CLIENT.map((seuil) => {
      const tire = (r: Revue) => scores.get(r.id)! >= seuil;
      const tirees = revues.filter(tire).length;
      return {
        seuil, tirees,
        rappel: rate(escalades.filter(tire).length, escalades.length),
        faussesAlertes: rate(maintenues.filter(tire).length, maintenues.length),
        ...(volume ? { pourMille: Math.round((tirees / volume.n) * 1000 * 100) / 100 } : {}),
      };
    });
    paliers[f.id] = { description: f.description, rang: f.rang, cellules };
  }

  return {
    kind: "scoring-client-record", version: 1, measuredAt,
    source: {
      file: basename(fichiers.reviews), sha256: fichiers.reviewsSha,
      reviews: revues.length, escalated: escalades.length, maintained: maintenues.length,
      sansNationalite, periode: periodeDe(revues),
    },
    customers: { file: basename(fichiers.customers), sha256: fichiers.customersSha,
      rows: fichiers.customersRows },
    volume, tables: sealTables(tables), paliers,
    absents: PALIERS.filter((p) => !registre.has(p)),
    verdicts,
    code: commitCourant(),
  };
}

export function commitCourant(): { commit: string } | null {
  try {
    const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"],
      { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" }).trim();
    return commit ? { commit } : null;
  } catch { return null; }
}

export function lireVolume(brut: string): number {
  if (!/^\d{1,12}$/.test(brut) || Number(brut) < 1) {
    throw new Error(
      `--volume=${brut} is not a number of customers this tool reads. It wants a whole\n`
      + `  number of customers in the portfolio, like --volume=50000.`);
  }
  return Number(brut);
}

/* ─────────────────────────────── l'exécution entière ─────────────────────────────── */

export function executer(
  cheminRevues: string,
  cheminClients: string,
  registre: Registre,
  volume: MesureRevues["volume"],
  tables: Tables = TABLES,
): { mesure: MesureRevues; cheminMd: string; cheminJson: string; avertissements: string[] } {
  const texteRevues = readFileSync(cheminRevues, "utf8");
  const texteClients = readFileSync(cheminClients, "utf8");
  const { revues, avertissements: a1 } = lireRevues(texteRevues);
  const { parClient, avertissements: a2 } = lireClients(texteClients);

  if (registre.size === 0) {
    throw new Error(
      `The factor registry is empty: there is nothing to measure with.\n`
      + `  The factors live in src/facteurs/ and register themselves in src/facteurs/index.ts.`);
  }

  const m = mesurer(revues, parClient, registre, {
    reviews: cheminRevues, reviewsSha: createHash("sha256").update(texteRevues).digest("hex"),
    customers: cheminClients, customersSha: createHash("sha256").update(texteClients).digest("hex"),
    customersRows: parClient.size,
  }, volume, tables);
  m.empreinte = empreinteDuReleve(m);

  const base = cheminRevues.replace(/\.csv$/i, "");
  const cheminJson = `${base}-measured.json`;
  const cheminMd = `${base}-measured.md`;
  writeFileSync(cheminJson, JSON.stringify(m, null, 2) + "\n");
  writeFileSync(cheminMd, rendreRapport(m));
  return { mesure: m, cheminMd, cheminJson, avertissements: [...a1, ...a2] };
}

async function principal(): Promise<void> {
  for (const l of lignesEvaluationDe("scoring")) console.log(l);
  refuserDrapeauxInconnus(["--customers", "--reviews", "--volume", "--tables"]);
  const arg = (nom: string) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.split("=").slice(1).join("=");
  const cheminRevues = arg("reviews");
  const cheminClients = arg("customers");
  if (!cheminRevues || !cheminClients) {
    console.log(`
Which risk factor suffices, at which threshold, on your own periodic-review outcomes.

  npm run measure:yours -- --customers=your-customers.csv --reviews=your-reviews.csv [--volume=N] [--tables=t.json]

The REVIEWS file wants: review_id,customer_id,reviewed_at,outcome[,rating_before]
  outcome is the committee's decision: escalated or maintained.

The CUSTOMERS file carries each reviewed customer as declared and observed: see the
contract table (kind, residence_country, activity_code, products, pep,
onboarding_channel, relationship_start, turnovers, ratios, and the entity fields).

--volume=N     customers in the portfolio: buys reviews-per-thousand, never estimated.
--tables=f     your own risk tables (JSON, whole tables only): replaces the declared
               demonstration tables, which are short, assumed, and never an official list.
               The record seals each table's name and sha256, never a weight or a code.
               The sha256 is unsalted: it proves which table was used, it does not hide it,
               and a short table could be recovered by guessing its values. The thresholds
               are ${PAS_CLIENT.toFixed(2)} apart, so a weight shows in the record and the report no better
               than within that step.

It writes, next to your reviews file and nowhere else:
  <file>-measured.md     the report (no customer, no country, no amount of yours)
  <file>-measured.json   the sealed record: counts, rates, verdicts by review_id,
                         the sha256 of each risk table

Then: npm run optimise -- --from=<file>-measured.json --recall=0.90
Nothing about your files leaves this machine.
`);
    return;
  }
  const brutVolume = arg("volume");
  const volume: MesureRevues["volume"] =
    brutVolume !== undefined ? { origine: "volume", n: lireVolume(brutVolume) } : null;
  const brutTables = arg("tables");
  const tables = brutTables !== undefined ? tablesAvec(readFileSync(brutTables, "utf8")) : TABLES;

  let registre: Registre;
  {
    const { registre: charger } = await import("./facteurs/index.ts");
    registre = charger();
  }

  const { mesure, cheminMd, cheminJson, avertissements } = executer(cheminRevues, cheminClients, registre, volume, tables);
  for (const a of avertissements) console.warn(`⚠ ${a}`);

  console.log(`\n${mesure.source.reviews} review(s): ${mesure.source.escalated} escalated, `
    + `${mesure.source.maintained} maintained, ${mesure.source.sansNationalite} without nationality; `
    + `${Object.keys(mesure.paliers).length} factor(s), ${SEUILS_CLIENT.length} thresholds each.`);
  if (mesure.absents.length) {
    console.log(`  ${mesure.absents.length} contract factor(s) not in the registry: `
      + `${mesure.absents.join(", ")}; said in the report, not guessed.`);
  }
  console.log(`  ${cheminMd}`);
  console.log(`  ${cheminJson}`);
  console.log(`\nNext: npm run optimise -- --from=${basename(cheminJson)} --recall=0.90\n`);
}

/* Un refus destiné au client ne sort pas en trace de pile. */
if (isMain(import.meta)) {
  try {
    await principal();
  } catch (e) {
    console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(2);
  }
}
