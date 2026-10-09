import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { NARRATIVE_TYPES } from '@ds/shared';
import * as z from 'zod/v4';

/** Ce que l'analyseur sait de la campagne pour relier la transcription aux bonnes entités. */
export interface AnalysisContext {
  campaign: { name: string; synopsis: string; tone: string };
  sessionNo: number;
  characters: { id: string; name: string; kind: 'pc' | 'npc'; player: string | null }[];
  nodes: { id: string; name: string; kind: string }[];
  /** Derniers événements de la session (pour éviter les doublons et relier les suites). */
  recentEvents: { id: string; type: string; title: string; text: string }[];
  /** Fin de la transcription déjà analysée : contexte seulement. */
  previous: AnalysisSegment[];
  /** La fenêtre à analyser. */
  segments: AnalysisSegment[];
}

export interface AnalysisSegment {
  seq: number;
  speaker: string | null;
  text: string;
  /** Minutes écoulées depuis le début de l'enregistrement. */
  minute: number;
}

// Les énumérations deviennent de simples chaînes décrites dans le schéma JSON envoyé au modèle :
// une valeur hors liste est corrigée par le service plutôt que de faire échouer toute la fenêtre.
const refSchema = z.object({
  kind: z.string().describe('character | node | free'),
  id: z.string().nullable(),
  name: z.string(),
});

const proposedEventSchema = z.object({
  type: z.string().describe(NARRATIVE_TYPES.map((t) => t.type).join(' | ')),
  title: z.string(),
  text: z.string(),
  importance: z.number().int(),
  gmOnly: z.boolean(),
  actors: z.array(refSchema),
  targets: z.array(refSchema),
  places: z.array(z.string()),
  inGameDate: z.string().nullable(),
  fromSeq: z.number().int(),
  toSeq: z.number().int(),
  confidence: z.number(),
  relatedEventIds: z.array(z.string()),
});

export const analysisResultSchema = z.object({ events: z.array(proposedEventSchema) });
export type ProposedEvent = z.infer<typeof proposedEventSchema>;

export interface AnalysisResult {
  events: ProposedEvent[];
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

/** Port d'analyse : transforme une fenêtre de transcription en événements de la Chronique. */
export interface SessionAnalyzer {
  readonly model: string;
  analyze(context: AnalysisContext): Promise<AnalysisResult>;
}

export class AnalysisError extends Error {}

const TYPE_GUIDE = NARRATIVE_TYPES.map((t) => `- ${t.type} : ${t.label}`).join('\n');

const INSTRUCTIONS = `Tu es le chroniqueur d'une table de jeu de rôle (Donjons & Dragons 5e). Tu lis la transcription automatique d'une session en cours, morceau par morceau, et tu inscris dans la Chronique de la campagne les événements qui s'y produisent, pour qu'il reste une trace complète et fiable de la session.

La transcription vient d'une reconnaissance vocale : elle est brute, sans ponctuation fiable, avec des erreurs sur les noms propres, des répétitions et des voix mêlées (MJ, joueurs, discussions hors jeu). Rapproche les noms mal transcrits des personnages et entités connus quand c'est vraisemblable.

Ce qu'il faut consigner : ce qui arrive dans la fiction. Arrivée dans un lieu, rencontre, découverte, quête reçue ou accomplie, combat (son enjeu et son issue, pas chaque coup), mort, promesse, aide, insulte, agression, trahison, décision marquante d'un personnage, révélation, objet important obtenu. Une note (narrative.note) peut garder un détail utile qui ne rentre dans aucun autre type.

Ce qu'il ne faut pas consigner : les règles, les jets de dés et le décompte des points de vie (déjà journalisés par l'application), les discussions hors jeu (pizza, horaires, blagues sur la vraie vie), les hésitations et ce qui est seulement envisagé sans être fait, et tout ce qui figure déjà parmi les événements récents. N'invente rien : chaque événement doit être appuyé par la transcription. Une fenêtre sans rien de notable donne une liste vide.

Types d'événements :
${TYPE_GUIDE}

Pour chaque événement :
- title : une phrase courte au passé composé ou au présent narratif, en français (« Les héros entrent dans la crypte de Valombre »).
- text : deux ou trois phrases qui racontent ce qui s'est passé, avec les détails utiles pour s'en souvenir dans six mois (noms, lieux, enjeux, paroles marquantes). Pas de méta (« d'après la transcription… »).
- importance de 1 à 5 : 1 détail d'ambiance, 2 fait ordinaire, 3 fait notable pour l'histoire, 4 tournant de la session, 5 moment clé de la campagne (mort, trahison majeure, révélation centrale). La plupart des événements valent 2 ou 3.
- actors / targets : qui agit et sur qui. Pour un personnage connu, kind « character » et son id ; pour une entité connue de la Constellation, kind « node » et son id ; sinon kind « free », id null, et le nom tel qu'il est dit. Ne mets jamais un id qui n'est pas dans les listes fournies.
- places : les lieux nommés.
- inGameDate : la date dans le monde du jeu si elle est donnée, sinon null.
- fromSeq / toSeq : les numéros des segments qui rapportent l'événement.
- confidence de 0 à 1 : ta certitude que l'événement a bien eu lieu tel que tu le décris (transcription confuse = confiance basse).
- gmOnly : true seulement si l'information est clairement réservée au MJ (aparté du MJ, secret dont les joueurs ne doivent pas avoir connaissance).
- relatedEventIds : les id des événements récents dont celui-ci est la suite directe ou la conséquence (sinon liste vide).`;

function formatContext(c: AnalysisContext): string {
  const characters = c.characters.length
    ? c.characters.map((ch) => `- ${ch.name} (id ${ch.id}, ${ch.kind === 'pc' ? `personnage joueur${ch.player ? ` de ${ch.player}` : ''}` : 'PNJ'})`).join('\n')
    : '(aucun)';
  const nodes = c.nodes.length ? c.nodes.map((n) => `- ${n.name} (id ${n.id}, ${n.kind})`).join('\n') : '(aucune)';
  return `Campagne « ${c.campaign.name} » — ton : ${c.campaign.tone}.
${c.campaign.synopsis ? `Synopsis : ${c.campaign.synopsis}\n` : ''}
Personnages connus :
${characters}

Entités de la Constellation (PNJ, lieux, factions…) :
${nodes}`;
}

const line = (s: AnalysisSegment) => `[${s.seq}] (${s.minute} min)${s.speaker ? ` ${s.speaker} :` : ''} ${s.text}`;

function formatWindow(c: AnalysisContext): string {
  const recent = c.recentEvents.length ? c.recentEvents.map((e) => `- (id ${e.id}) [${e.type}] ${e.title}${e.text ? ` — ${e.text.slice(0, 240)}` : ''}`).join('\n') : '(aucun)';
  return `Session ${c.sessionNo}.

Événements récents déjà inscrits (ne pas les répéter) :
${recent}

${c.previous.length ? `Fin de la transcription déjà analysée (contexte, ne pas la consigner à nouveau) :\n${c.previous.map(line).join('\n')}\n\n` : ''}Transcription à analyser :
${c.segments.map(line).join('\n')}`;
}

/** Analyseur fondé sur Claude : sortie structurée validée par un schéma, repli serveur en cas de refus. */
export class ClaudeSessionAnalyzer implements SessionAnalyzer {
  private readonly client: Anthropic;

  constructor(
    readonly model: string,
    client?: Anthropic,
  ) {
    this.client = client ?? new Anthropic();
  }

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: betaZodOutputFormat(analysisResultSchema) },
      // Consignes et contexte de campagne d'abord, stables d'une fenêtre à l'autre : mis en cache.
      system: [
        { type: 'text', text: INSTRUCTIONS },
        { type: 'text', text: formatContext(context), cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: formatWindow(context) }],
    });
    if (response.stop_reason === 'refusal') throw new AnalysisError('L’analyse a été refusée par le modèle.');
    if (response.stop_reason === 'max_tokens') throw new AnalysisError('Réponse tronquée : fenêtre trop longue.');
    const parsed = response.parsed_output;
    if (!parsed) throw new AnalysisError('Réponse illisible du modèle.');
    return {
      events: parsed.events,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0),
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
