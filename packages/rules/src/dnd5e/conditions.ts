export interface ConditionDef {
  id: string;
  name: string;
  color: string;
  summary: string;
  /** États officiels du SRD ; les autres sont des marqueurs d'aide au suivi. */
  official: boolean;
}

const C = (id: string, name: string, color: string, summary: string, official = true): ConditionDef => ({ id, name, color, summary, official });

/** Les 14 états du SRD 5.1 + épuisement, puis des marqueurs courants (concentration, bénédiction…). */
export const CONDITIONS: ConditionDef[] = [
  C('prone', 'À terre', '#a79c8a', 'Se déplace en rampant ; désavantage aux attaques ; attaques au contact contre lui avec avantage.'),
  C('grappled', 'Agrippé', '#c9a96a', 'Vitesse réduite à 0.'),
  C('deafened', 'Assourdi', '#a79c8a', "N'entend rien ; échoue aux tests basés sur l'ouïe."),
  C('blinded', 'Aveuglé', '#a79c8a', 'Ne voit rien ; désavantage à ses attaques, avantage contre lui.'),
  C('charmed', 'Charmé', '#e07aa8', "Ne peut attaquer le charmeur ; celui-ci a l'avantage en interaction sociale."),
  C('frightened', 'Effrayé', '#e07aa8', 'Désavantage tant que la source de sa peur est visible ; ne peut s’en approcher.'),
  C('poisoned', 'Empoisonné', '#8fbf6a', 'Désavantage aux jets d’attaque et tests de caractéristique.'),
  C('restrained', 'Entravé', '#c9a96a', 'Vitesse 0 ; désavantage à ses attaques et aux JS de DEX ; avantage contre lui.'),
  C('stunned', 'Étourdi', '#e8d3a0', 'Neutralisé ; échoue aux JS de FOR et DEX ; avantage contre lui.'),
  C('incapacitated', 'Neutralisé', '#a79c8a', 'Ne peut ni agir ni réagir.'),
  C('unconscious', 'Inconscient', '#b0306a', 'Neutralisé, à terre ; critique automatique au contact.'),
  C('invisible', 'Invisible', '#bfe4ff', 'Impossible à voir sans magie ; avantage à ses attaques.'),
  C('paralyzed', 'Paralysé', '#e8d3a0', 'Neutralisé ; critique automatique au contact.'),
  C('petrified', 'Pétrifié', '#a79c8a', 'Transformé en pierre ; résistance à tous les dégâts.'),
  C('exhaustion', 'Épuisement', '#b0306a', 'Six niveaux cumulatifs : désavantages, vitesse réduite… puis la mort.'),
  C('concentration', 'Concentration', '#7cc6ff', 'Maintient un sort ; JS de CON (DD 10 ou moitié des dégâts) quand il est blessé.', false),
  C('marked', 'Marqué', '#e07aa8', 'Ciblé par une marque (ex. Marque du chasseur).', false),
  C('blessed', 'Béni', '#e8d3a0', '+1d4 aux jets d’attaque et de sauvegarde.', false),
  C('dodging', 'Esquive', '#7cc6ff', 'Les attaques contre lui ont un désavantage.', false),
  C('disengaged', 'Désengagé', '#7cc6ff', 'Ses déplacements ne provoquent pas d’attaque d’opportunité.', false),
  C('barkskin', "Peau d'écorce", '#8fbf6a', 'CA minimale de 16.', false),
];

export function getCondition(idOrName: string): ConditionDef | undefined {
  const k = idOrName.toLowerCase();
  return CONDITIONS.find((c) => c.id === k || c.name.toLowerCase() === k);
}
