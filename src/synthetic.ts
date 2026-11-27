/**
 * Les variantes SYNTHÉTIQUES des dossiers écrits : la moitié `synthetic` du relevé améthyste.
 *
 * Le contrat (§4) : montants, ratios et ancienneté gigués ; pays et produits permutés DANS
 * LEUR CLASSE ; déclarées `synthetic`, réparties sur toutes les natures, jamais fusionnées.
 * Déterministe : graine explicite, et la graine de chaque dossier dérive de son identifiant
 * — retirer un dossier ne recompose pas les variantes des autres.
 *
 * ─── LE GIGAGE PRÉSERVE LA NATURE, comme au bleu ───
 *
 * Ce qui FAIT la nature d'un dossier est un rapport ou un seuil, et un gigage aveugle le
 * défait :
 *
 *   undeclared-turnover / remote-newcomer-burst : l'essence est observé/déclaré. Les deux
 *     montants se gigent par des facteurs LIÉS (même base ±10 %) : le rapport survit.
 *   cash-intensive garde sa part d'espèces au-dessus de la ligne haute ; local-shop reste
 *     dessous : le jumeau ne traverse pas chez son suspect en gigant.
 *   shell-layers garde ≥ 3 couches ; domestic-sme ≤ 2 ; une personne physique reste à 0.
 *   remote-newcomer-burst reste un NOUVEAU : l'ancienneté giguée plafonne sous 150 jours.
 *
 * Les pays permutent dans leur classe (ordinaires entre eux, lointains entre eux) ; les
 * produits permutent dans leur classe de paiement (card↔wire, correspondent↔trade), et ce
 * qui porte la nature (cash, private, crypto) ne permute pas.
 */
import { readFileSync } from "node:fs";
import { cheminPrive, jeuPresent, JeuPriveAbsent } from "./jeux.ts";
import { exigerDossier, type Dossier, type Produit } from "./dossier.ts";

export const NATURES_ESCALATED = [
  "shell-layers", "pep-relative", "cash-intensive", "offshore-structure", "remote-newcomer-burst", "undeclared-turnover",
] as const;
export const NATURES_MAINTAINED = [
  "local-shop", "salaried", "domestic-sme", "retiree", "foreign-student", "seasonal-exporter",
] as const;
export type NatureDossier = (typeof NATURES_ESCALATED)[number] | (typeof NATURES_MAINTAINED)[number];

export type DossierEtiquete = Dossier & { nature: NatureDossier; raison: string };

/** Le générateur : même forme que les autres pierres, graine explicite. */
export function tirage(graine: number): () => number {
  let etat = graine >>> 0;
  return () => {
    etat = (etat * 1_664_525 + 1_013_904_223) >>> 0;
    return etat / 4_294_967_296;
  };
}

/* Les classes de permutation : un pays ordinaire se remplace par un ordinaire, un lointain
   par un lointain — jamais l'un par l'autre, la distance FAIT une partie des natures. */
export const PAYS_ORDINAIRES = ["FR", "DE", "ES", "IT", "BE", "NL", "PT", "PL", "AT", "IE", "DK", "SE"] as const;
export const PAYS_LOINTAINS = ["BR", "IN", "VN", "MX", "ID", "PH", "CO"] as const;

/* card↔wire (paiement courant) et correspondent↔trade (institutionnel) permutent ;
   cash, private, crypto et safe PORTENT des natures et restent en place. */
const PERMUTABLES: Partial<Record<Produit, Produit[]>> = {
  card: ["card", "wire"], wire: ["wire", "card"],
  correspondent: ["correspondent", "trade"], trade: ["trade", "correspondent"],
};

/** The full authored set is private: see jeux.ts. Its public sample is echantillons/dossiers-20.json. */
export const DOSSIERS_PRIVES = "src/dossiers-etiquetes.json";

/** Les dossiers écrits, relus et revalidés un par un : la couture de L4. */
export function chargerDossiersEtiquetes(): DossierEtiquete[] {
  if (!jeuPresent(DOSSIERS_PRIVES)) throw new JeuPriveAbsent(DOSSIERS_PRIVES);
  const chemin = cheminPrive(DOSSIERS_PRIVES);
  const brut = JSON.parse(readFileSync(chemin, "utf8")) as { dossiers: DossierEtiquete[] };
  const toutes = new Set<string>([...NATURES_ESCALATED, ...NATURES_MAINTAINED]);
  for (const d of brut.dossiers) {
    exigerDossier(d);
    if (!toutes.has(d.nature)) throw new Error(`dossier ${d.id}: unknown nature "${d.nature}"`);
    if (!d.raison || !d.raison.trim()) throw new Error(`dossier ${d.id} carries no raison`);
  }
  return brut.dossiers;
}

const borne = (v: number, bas: number, haut: number): number => Math.min(haut, Math.max(bas, v));

function permuterPays(code: string, r: () => number): string {
  const classe = (PAYS_ORDINAIRES as readonly string[]).includes(code) ? PAYS_ORDINAIRES
    : (PAYS_LOINTAINS as readonly string[]).includes(code) ? PAYS_LOINTAINS : undefined;
  if (!classe) return code;                     /* un code hors classes voyage inchangé */
  return classe[Math.floor(r() * classe.length)]!;
}

/**
 * `n` variantes d'un dossier écrit, déterministes à graine donnée, nature conservée,
 * chacune revalidée par `exigerDossier` avant de sortir. Rend EXACTEMENT n.
 */
export function variantes(dossier: DossierEtiquete, graine: number, n: number): DossierEtiquete[] {
  const resultat: DossierEtiquete[] = [];
  for (let v = 0; v < n; v++) {
    const r = tirage((graine ^ (v * 2_654_435_761)) >>> 0);
    const base = 0.8 + r() * 0.4;               /* le facteur LIÉ des deux montants */
    const declared = Math.max(1, Math.round(dossier.declaredTurnover * base));
    const observed = Math.round(dossier.observedTurnover * base * (0.9 + r() * 0.2));

    let cash = borne(dossier.cashRatio + (r() * 0.1 - 0.05), 0, 1);
    if (dossier.nature === "cash-intensive") cash = borne(cash, 0.56, 0.9);
    if (dossier.nature === "local-shop") cash = borne(cash, 0.3, 0.55);

    let couches = dossier.ownershipLayers;
    if (dossier.kind === "entity") {
      couches = Math.max(0, couches + (r() < 0.33 ? -1 : r() < 0.5 ? 1 : 0));
      if (dossier.nature === "shell-layers") couches = Math.max(couches, 3);
      if (dossier.nature === "domestic-sme") couches = borne(couches, 1, 2);
    }

    let anciennete = Math.round(dossier.relationshipDays * (0.8 + r() * 0.4));
    if (dossier.nature === "remote-newcomer-burst") anciennete = borne(anciennete, 15, 150);
    if (dossier.nature === "foreign-student") anciennete = borne(anciennete, 20, 260);

    const revue = new Date(dossier.reviewedAt + "T00:00:00Z");
    revue.setUTCDate(revue.getUTCDate() + Math.round(r() * 40) - 20);

    const variante: DossierEtiquete = {
      ...dossier,
      id: `${dossier.id}~v${v + 1}`,
      residence: permuterPays(dossier.residence, r),
      ...(dossier.nationality ? { nationality: permuterPays(dossier.nationality, r) } : {}),
      products: dossier.products.map((p) => {
        const classe = PERMUTABLES[p];
        return classe ? classe[Math.floor(r() * classe.length)]! : p;
      }).filter((p, i, l) => l.indexOf(p) === i) as Produit[],
      declaredTurnover: declared,
      observedTurnover: observed,
      cashRatio: cash,
      crossBorderRatio: borne(dossier.crossBorderRatio + (r() * 0.1 - 0.05), 0, 1),
      ownershipLayers: couches,
      relationshipDays: anciennete,
      dormantDays: Math.round(dossier.dormantDays * (0.8 + r() * 0.4)),
      reviewedAt: revue.toISOString().slice(0, 10),
      raison: `synthetic variant of ${dossier.id}: amounts, ratios and tenure jittered, classes kept`,
    };
    exigerDossier(variante);
    resultat.push(variante);
  }
  return resultat;
}

/**
 * Le jeu synthétique complet : graine dérivée par dossier — retirer un dossier laisse les
 * variantes des autres STRICTEMENT identiques.
 */
export function jeuSynthetique(
  dossiers: readonly DossierEtiquete[], graine: number, parDossier = 3,
): DossierEtiquete[] {
  const jeu: DossierEtiquete[] = [];
  for (const d of dossiers) {
    let h = graine >>> 0;
    for (const c of d.id) h = ((h * 31) + c.codePointAt(0)!) >>> 0;
    jeu.push(...variantes(d, h, parDossier));
  }
  return jeu;
}
