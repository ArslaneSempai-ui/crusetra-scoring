import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chargerDossiersEtiquetes, variantes, jeuSynthetique, tirage,
  NATURES_ESCALATED, NATURES_MAINTAINED, DOSSIERS_PRIVES, type DossierEtiquete,
} from "./synthetic.ts";
import { jeuPresent, raisonAbsent } from "./jeux.ts";
import { exigerDossier } from "./dossier.ts";

/** The full set is private: without it these cases skip with a named reason. */
const SKIP = jeuPresent(DOSSIERS_PRIVES) ? false : raisonAbsent(DOSSIERS_PRIVES);
const dossiers = SKIP ? [] : chargerDossiersEtiquetes();
const parNature = (n: string) => dossiers.filter((d) => d.nature === n);

test("au moins 40 escalated et 40 maintained, chaque nature du contrat présente, identifiants uniques", { skip: SKIP }, () => {
  const escalated = dossiers.filter((d) => (NATURES_ESCALATED as readonly string[]).includes(d.nature));
  const maintained = dossiers.filter((d) => (NATURES_MAINTAINED as readonly string[]).includes(d.nature));
  assert.ok(escalated.length >= 40, `${escalated.length} escalated : le contrat en demande 40`);
  assert.ok(maintained.length >= 40, `${maintained.length} maintained : le contrat en demande 40`);
  assert.equal(escalated.length + maintained.length, dossiers.length, "aucune nature hors contrat");
  const presentes = new Set(dossiers.map((d) => d.nature));
  for (const n of [...NATURES_ESCALATED, ...NATURES_MAINTAINED]) assert.ok(presentes.has(n), `nature absente : ${n}`);
  assert.equal(new Set(dossiers.map((d) => d.id)).size, dossiers.length, "identifiants en double");
});

test("chaque dossier écrit passe exigerDossier et porte une raison d'une phrase, sans cadratin", { skip: SKIP }, () => {
  for (const d of dossiers) {
    exigerDossier(d);
    assert.ok(d.raison.trim().length > 20, `raison trop courte pour ${d.id}`);
    assert.ok(!d.raison.includes("—"), `cadratin dans la raison de ${d.id}`);
  }
});

test("les sosies sont structurellement des sosies : les champs portent la différence, pas l'étiquette", { skip: SKIP }, () => {
  /* Chaque jumeau bénin se distingue de son suspect PAR LES DONNÉES ; six paires épinglées. */
  for (const d of parNature("shell-layers")) assert.ok(d.ownershipLayers >= 3 && d.opaqueJurisdiction, d.id);
  for (const d of parNature("domestic-sme")) {
    assert.ok(d.ownershipLayers <= 2 && d.beneficialOwnerNamed && !d.opaqueJurisdiction,
      `${d.id}: la PME domestique a des couches nommées, locales, peu nombreuses`);
  }
  for (const d of parNature("cash-intensive")) assert.ok(d.cashRatio > 0.55, d.id);
  for (const d of parNature("local-shop")) {
    assert.ok(d.cashRatio < 0.55 && d.observedTurnover / d.declaredTurnover < 1.3,
      `${d.id}: la boutique est en espèces mais SUR sa déclaration`);
  }
  for (const d of parNature("undeclared-turnover")) assert.ok(d.observedTurnover / d.declaredTurnover >= 4, d.id);
  for (const d of parNature("salaried")) {
    assert.ok(d.observedTurnover / d.declaredTurnover < 1.5, `${d.id}: le salarié vit sur son revenu déclaré`);
  }
  for (const d of parNature("remote-newcomer-burst")) {
    assert.ok(d.onboarding === "remote" && d.relationshipDays <= 150
      && d.observedTurnover / d.declaredTurnover >= 3, d.id);
  }
  for (const d of parNature("foreign-student")) {
    assert.ok(d.onboarding === "remote" && d.nationality !== undefined
      && d.observedTurnover / d.declaredTurnover < 1.5 && d.declaredTurnover < 30000,
      `${d.id}: l'étudiant est neuf et lointain mais petit et conforme`);
  }
  for (const d of parNature("offshore-structure")) assert.ok(d.opaqueJurisdiction && d.crossBorderRatio >= 0.5, d.id);
  for (const d of parNature("seasonal-exporter")) {
    assert.ok(!d.opaqueJurisdiction && d.crossBorderRatio >= 0.5 && d.beneficialOwnerNamed,
      `${d.id}: l'exportateur traverse les frontières SANS l'opacité`);
  }
  for (const d of parNature("pep-relative")) assert.equal(d.pep, "pep-relative", d.id);
  for (const d of parNature("retiree")) assert.equal(d.pep, "none", d.id);
});

test("aucune liste officielle recopiée : les faits de risque vivent dans les champs, pas dans les pays", { skip: SKIP }, () => {
  /* Le contrat refuse une liste officielle recopiée. Structurellement : l'opacité est un
     BOOLÉEN déclaré, et les pays des dossiers restent dans les deux classes ordinaires du
     générateur — aucun code n'est réservé aux suspects. */
  const paysSuspects = new Set(dossiers.filter((d) => (NATURES_ESCALATED as readonly string[]).includes(d.nature)).map((d) => d.residence));
  const paysBenins = new Set(dossiers.filter((d) => !(NATURES_ESCALATED as readonly string[]).includes(d.nature)).map((d) => d.residence));
  const communs = [...paysSuspects].filter((p) => paysBenins.has(p));
  assert.ok(communs.length >= 8,
    `${communs.length} pays partagés entre suspects et bénins : un pays qui n'apparaît que chez les suspects redevient une liste`);
});

test("le générateur et les variantes sont déterministes", { skip: SKIP }, () => {
  const a = tirage(4), b = tirage(4);
  assert.deepEqual([a(), a()], [b(), b()]);
  const ecrit = dossiers.find((d) => d.nature === "shell-layers")!;
  assert.deepEqual(variantes(ecrit, 20260906, 3), variantes(ecrit, 20260906, 3));
  assert.notDeepEqual(variantes(ecrit, 20260906, 3), variantes(ecrit, 20260907, 3));
});

test("chaque variante passe exigerDossier, garde sa nature, rend exactement n, se déclare synthétique", { skip: SKIP }, () => {
  for (const nature of [...NATURES_ESCALATED, ...NATURES_MAINTAINED]) {
    const ecrit = dossiers.find((d) => d.nature === nature)!;
    const vs = variantes(ecrit, 11, 4);
    assert.equal(vs.length, 4, `${nature}: variantes() rend exactement n`);
    for (const v of vs) {
      exigerDossier(v);
      assert.equal(v.nature, nature);
      assert.match(v.id, new RegExp(`^${ecrit.id}~v\\d+$`));
      assert.match(v.raison, /^synthetic variant/);
    }
  }
});

test("le gigage préserve la nature : rapports liés, seuils tenus, classes de pays et de produits", { skip: SKIP }, () => {
  const cas: [string, (v: DossierEtiquete) => boolean, string][] = [
    ["undeclared-turnover", (v) => v.observedTurnover / v.declaredTurnover >= 3.5, "le rapport observé/déclaré s'effondre en gigant"],
    ["salaried", (v) => v.observedTurnover / v.declaredTurnover < 1.8, "le salarié gigué se met à cacher du chiffre"],
    ["cash-intensive", (v) => v.cashRatio > 0.55, "la part d'espèces passe sous la ligne"],
    ["local-shop", (v) => v.cashRatio <= 0.55, "la boutique giguée traverse chez son jumeau suspect"],
    ["shell-layers", (v) => v.ownershipLayers >= 3, "les couches giguées descendent sous trois"],
    ["domestic-sme", (v) => v.ownershipLayers <= 2, "la PME giguée gagne les couches d'un écran"],
    ["remote-newcomer-burst", (v) => v.relationshipDays <= 150, "le nouveau gigué devient un ancien"],
    ["pep-relative", (v) => v.pep === "pep-relative", "le drapeau pep disparaît en gigant"],
  ];
  for (const [nature, ok, message] of cas) {
    const ecrit = dossiers.filter((d) => d.nature === nature);
    for (const e of ecrit) {
      for (const v of variantes(e, 123, 5)) assert.ok(ok(v), `${v.id}: ${message}`);
    }
  }
  /* Les classes : un pays ordinaire reste ordinaire, un lointain lointain ; une personne
     physique reste sans couches ; les produits porteurs (cash, private, crypto) restent. */
  const stu = dossiers.find((d) => d.nature === "foreign-student")!;
  for (const v of variantes(stu, 7, 6)) {
    assert.ok(["BR", "IN", "VN", "MX", "ID", "PH", "CO"].includes(v.nationality!),
      `${v.id}: la nationalité lointaine a quitté sa classe`);
    assert.equal(v.ownershipLayers, 0);
  }
  const cai = dossiers.find((d) => d.nature === "cash-intensive")!;
  for (const v of variantes(cai, 7, 6)) {
    assert.ok(v.products.includes("cash"), `${v.id}: le produit cash, porteur de la nature, a permuté`);
  }
});

test("le jeu synthétique couvre toutes les natures et reste stable sous retrait d'un dossier", { skip: SKIP }, () => {
  const jeu = jeuSynthetique(dossiers, 20260906, 2);
  assert.equal(jeu.length, dossiers.length * 2);
  const natures = new Set(jeu.map((d) => d.nature));
  for (const n of [...NATURES_ESCALATED, ...NATURES_MAINTAINED]) assert.ok(natures.has(n), `absente : ${n}`);
  const sans = jeuSynthetique(dossiers.filter((d) => d.id !== "a-shl-01"), 20260906, 2);
  assert.deepEqual(sans, jeu.filter((d) => !d.id.startsWith("a-shl-01~")),
    "retirer un dossier recompose les variantes des autres : la graine ne dérive pas du dossier");
});
