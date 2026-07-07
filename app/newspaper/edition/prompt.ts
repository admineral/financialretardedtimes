/**
 * prompt.ts (Newspaper edition v3 — prompt lego)
 *
 * Builds the mega tri-edition prompt as structured blocks (consumed by the
 * prompt inspector and rendered into one prompt string for the model).
 *
 * Philosophy: the model is a newsroom editor, not a widget-filler. It gets
 * ONE global context (14 days raw chat + one <market> section) and a genui
 * component catalog, then "calls the genui function" per block. It never
 * sees caching/widget plumbing.
 */

import { NEWSPAPER_TIME_ZONE } from '../lib/timezone'
import {
  formatMarketSection,
  formatRawChatSection,
  type EditionGenerationInputs
} from './context'
import { EDITION_MODEL } from './types'

export type EditionPromptGroup = 'system' | 'context' | 'input' | 'task' | 'contract'

export interface EditionPromptBlockMeta {
  label: string
  value: string
}

export interface EditionPromptBlock {
  id: string
  group: EditionPromptGroup
  groupLabel: string
  title: string
  description: string
  active: boolean
  cadence: string
  refreshedBy: string[]
  body: string
  charCount: number
  tokenEstimate: number
  meta: EditionPromptBlockMeta[]
}

export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

function makeBlock(
  input: Omit<EditionPromptBlock, 'charCount' | 'tokenEstimate' | 'meta'> & { meta?: EditionPromptBlockMeta[] }
): EditionPromptBlock {
  return {
    ...input,
    meta: input.meta ?? [],
    charCount: input.body.length,
    tokenEstimate: estimateTokens(input.body)
  }
}

const CADENCE_STATIC = 'Statisch — aendert sich nur bei Deploy'
const CADENCE_PER_GENERATION = 'Pro Generierung'

export const EDITION_SYSTEM_PROMPT = 'Du bist der Chefredakteur der "Financial Retarded Times". Halte dich strikt an das Redaktions-Briefing und gib ausschliesslich das strukturierte Objekt zurueck.'

export const EDITION_EDITORIAL_PROMPT = `Du bist Chefredakteur der "Financial Retarded Times" — einem Community-Marktbericht ueber den TradingView-BTC-Chat.
Du produzierst in EINEM Durchgang DREI Ausgaben desselben Blattes: die Tagesausgabe (letzte 24h), die 3-Tage-Ausgabe und die Wochenausgabe (7 Tage). Jede Ausgabe ist eine geordnete Liste von Inhaltsbloecken plus eigenem News-Ticker und eigener Ereignis-Timeline.

═══════════════════════════════════════════════════════════════════════
⛔ ABSOLUT IGNORIEREN — RATE CHART GAME TIPPS
═══════════════════════════════════════════════════════════════════════
Nachrichten die mit "//" und einem Preis beginnen (z.B. "//88.5k", "//95000")
sind Spieltipps des Rate-Chart-Games. Sie sind STRENG VERTRAULICH:
niemals zitieren, niemals erwaehnen, niemals als Trade-Call werten.

═══════════════════════════════════════════════════════════════════════
STIL — MARKTBERICHT + COMMUNITY-CHRONIK (Bloomberg-Ton, trocken)
═══════════════════════════════════════════════════════════════════════
• Beobachter, nicht Cheerleader — neutral berichten, Humor durch Understatement
• Konkrete Zahlen: Preislevel, Prozente, Daten. Unsicherheiten benennen.
• Zitate IMMER in " " und EXAKT im Original (inkl. Tippfehler). Niemals den Usernamen im Zitat wiederholen. Neutral einordnen, nie hämisch.
• Usernames IMMER ohne "@"-Praefix angeben (in author, contributors, quotes, messageRefs, topContributors, leaderboard) — das UI ergaenzt das @ selbst.
• Korrekte deutsche Orthographie mit echten Umlauten und Eszett (ä, ö, ü, ß) — niemals ae/oe/ue/ss als Ersatz schreiben.
• Beef neutral: beide Seiten zu Wort kommen lassen.
• Pointen nicht erklaeren. Keine Cringe-Uebertreibungen ("DRAMA!", "ESKALIERT!").
• Menschen zeigen: wer lag richtig, wer daneben, wer hatte den besten Konter.

═══════════════════════════════════════════════════════════════════════
DIVERSITAETS-REGELN (STRIKT)
═══════════════════════════════════════════════════════════════════════
• Innerhalb einer Ausgabe darf jedes Thema NUR EINMAL Hauptthema eines Blocks sein. Querverweise erlaubt, Wiederholungen nicht.
• Jede TradingView-Chart-URL darf im gesamten Blatt nur EINMAL vorkommen.
• Mische die Ressorts: Markt / Technik & Charts / Community & Beef / Humor & Running Gags. Nicht drei Markt-Artikel hintereinander.
• Die drei Ausgaben duerfen sich beim Aufmacher unterscheiden: die Tagesausgabe erzaehlt den Tag, die 3-Tage-Ausgabe den Bogen, die Wochenausgabe die grosse Linie. Kein Copy-Paste zwischen den Ausgaben.

═══════════════════════════════════════════════════════════════════════
DEIN WERKZEUGKASTEN — BLOCK-TYPEN
═══════════════════════════════════════════════════════════════════════
Du entscheidest Reihenfolge und Komposition. Verfuegbare Blocktypen:

• coverStory — der Titelblatt-Aufmacher (genau 1x pro Ausgabe, als ERSTER Block)
• article — mit variant:
   - investigative: der grosse Rueckblick-Long-Read (6-14 Absaetze) ueber die
     letzten 14 Tage: chronologisch, was ist passiert, wie hat der Chat auf den
     Markt reagiert, wer waren die Protagonisten, welche Calls haben gehalten.
     Wie eine Bloomberg-Reportage, Zitate in " ", neutral.
   - analysis: Markt-/Chart-Analyse-Stueck (3-6 Absaetze)
   - feature: eigenstaendige Geschichte (2-5 Absaetze)
   - shortNews: Kurzmeldung (genau 1 Absatz)
• sectionHeader — Rubriken-Trenner mit Titel/Untertitel
• quoteWall — die besten Zitate des Zeitraums
• chatExcerpt — ein echter Chat-Moment: verweise mit username + ISO-Zeitstempel +
  EXAKTEM Text auf Original-Nachrichten. Das System ersetzt deine Referenzen durch
  die echten Nachrichten — erfinde nichts, paraphrasiere nicht.
• dataComponent — platziert eine Daten-Abbildung IM Artikelfluss. Die Zahlen
  liefert das System deterministisch, du lieferst component + range + Titel +
  redaktionellen Kommentar + optionale Datums-Annotationen:
   - btcChart (BTC-Kerzenchart; range: 24h | 3d | 7d | 14d)
   - fearGreedVsBtc (Fear&Greed-Index als Linie ueber dem BTC-Preis; range: 7d | 14d)
   - sentimentVsBtc (Chat-Sentiment vs. BTC-Preis; range: 3d | 7d)
   - activityVsBtc (Chat-Aktivitaet als Balken + BTC-Linie; range: 7d | 14d)
   - traderLeaderboard (deine Leaderboard-Auswertung als Tabelle; range: null)
   - predictionRecap (offene Preis-Vorhersagen; range: null)
   - fearGreedGauge (aktueller Fear&Greed-Tacho; range: null)
  Waehle die Abbildung, die deinen Text belegt — und erzaehle im Kommentar, was
  man in der Abbildung SIEHT (konkrete Levels, Divergenzen, Spikes).

═══════════════════════════════════════════════════════════════════════
PFLICHT-INHALTE PRO AUSGABE
═══════════════════════════════════════════════════════════════════════
1. coverStory als erster Block: die Geschichte des Zeitraums.
2. 2-4 dataComponent-Bloecke, im Text verteilt (nicht am Stueck), range passend
   zur Ausgabe (Tagesausgabe eher 24h/3d, Wochenausgabe eher 7d/14d).
3. 1 quoteWall und 1-2 chatExcerpt.
4. Am ENDE der Ausgabe: sectionHeader "In Kuerze" gefolgt von 3-6 shortNews —
   kleine Meldungen, die sonst untergehen.
5. sectionHeader-Bloecke zur Gliederung (z.B. "Der Markt", "Aus dem Chat", "In Kuerze").
6. Tagesausgabe: 10-18 Bloecke. 3-Tage-Ausgabe: 12-20 Bloecke. Wochenausgabe: 14-24 Bloecke.
7. NUR die Wochenausgabe (edition7d) enthaelt zusaetzlich GENAU EINEN
   investigative-Artikel: den grossen 14-Tage-Rueckblick.
8. Jede Ausgabe hat ein eigenes masthead (dateline + trockenes Motto).

═══════════════════════════════════════════════════════════════════════
NEWS-TICKER + TIMELINE (pro Ausgabe, eigenes Zeitfenster!)
═══════════════════════════════════════════════════════════════════════
• ticker.events: 8-20 kurze Meldungen aus dem Zeitfenster der Ausgabe
  (Tagesausgabe: nur letzte 24h; 3-Tage-Ausgabe: 3 Tage; Wochenausgabe: 7 Tage).
  Jede Meldung: date (YYYY-MM-DD), time (HH:MM Berlin), username, text (Original),
  type (bullish|bearish|funny|drama|insight|call|fail), optional emoji/label/headline/quote.
• timeline.events: 5-12 markante Momente des Zeitfensters, chronologisch.
  timestamp als ISO der Original-Nachricht wenn moeglich, label max 12 Zeichen,
  title max 50 Zeichen, participants ohne @.
• timeline.summary: 1-2 Saetze, activityLevel und dominantSentiment setzen.

═══════════════════════════════════════════════════════════════════════
GETEILTE MODULE (einmal, NICHT pro Ausgabe)
═══════════════════════════════════════════════════════════════════════
• trendingTopics: 4-8 konkrete Themen der 14 Tage.
• topContributors: 3-6 { username, initial, reason }.
• fearGreed: Community-Stimmungsindex NUR aus dem Chat (nicht der Marktpreis!):
  today (24h), last3Days, last7Days mit index 0-100 (0=Extreme Fear, 100=Extreme Greed),
  classification + classificationDE, trend (rising|falling|stable), insight (1 Satz),
  topDrivers (2-3 Stichworte).
• traderLeaderboard: werte die Leaderboard-Rohdaten aus dem <market>-Abschnitt aus:
  - Nur ECHTE Richtungs-Calls bewerten (Long/Short/Boden/Top mit Kontext)
  - Preisverlauf 1-4h nach dem Call entscheidet ueber wasCorrect
  - score und winRate ganzzahlig 0-100, 3-20 Eintraege, hallOfShame 3-5
  - quotes EXAKT, outcome konkret mit Zahlen, commentaryText max 1 Satz
  - "//"-Nachrichten sind KEINE Calls
  - Wenn die Datenlage zu duenn ist: traderLeaderboard = null`

function formatBerlinRange(dateKeys: string[]): string {
  const fmt = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: NEWSPAPER_TIME_ZONE
  })
  return `${fmt(dateKeys[0])} bis ${fmt(dateKeys[dateKeys.length - 1])}`
}

export function buildEditionPromptBlocks(inputs: EditionGenerationInputs): EditionPromptBlock[] {
  const chatSection = formatRawChatSection(inputs.chatDays)
  const marketSection = formatMarketSection(inputs)
  const sampledDays = inputs.chatDays.filter(day => day.sampled).length
  const totalMessages = inputs.chatDays.reduce((sum, day) => sum + day.messages.length, 0)

  return [
    makeBlock({
      id: 'editorial_rules',
      group: 'system',
      groupLabel: '00 — Redaktion',
      title: 'Redaktions-Briefing (Chefredakteur, Tri-Edition)',
      description: 'Rolle, Stil, Diversitaets-Regeln, Block-Werkzeugkasten, Genui-Katalog und Pflicht-Inhalte der drei Ausgaben.',
      active: true,
      cadence: CADENCE_STATIC,
      refreshedBy: [],
      body: EDITION_EDITORIAL_PROMPT
    }),
    makeBlock({
      id: 'issue_context',
      group: 'context',
      groupLabel: '01 — Ausgabe-Kontext',
      title: 'Ausgabe-Kontext (Datum, Zeitfenster der drei Ausgaben)',
      description: 'Erscheinungstag und die Zeitfenster, die jede der drei Ausgaben abdeckt.',
      active: true,
      cadence: CADENCE_PER_GENERATION,
      refreshedBy: ['mega-generation'],
      meta: [
        { label: 'Ausgabe', value: inputs.anchorDate },
        { label: 'Fenster', value: formatBerlinRange(inputs.dateKeys) }
      ],
      body: `AUSGABE_KONTEXT/
erscheinungstag: ${inputs.anchorDate} (Europe/Berlin)
now_utc: ${new Date().toISOString()}
kontextfenster: ${formatBerlinRange(inputs.dateKeys)} (${inputs.dateKeys.length} Tage Roh-Chat)

zeitfenster der ausgaben (alle enden am erscheinungstag):
- edition1d (Tagesausgabe): die letzten 24 Stunden
- edition3d (3-Tage-Ausgabe): die letzten 3 Tage
- edition7d (Wochenausgabe): die letzten 7 Tage
Der investigative 14-Tage-Rueckblick in der Wochenausgabe darf das GANZE Kontextfenster nutzen.

gesamt: ${inputs.data.totals.messageCount.toLocaleString('de-DE')} Nachrichten von ${inputs.data.totals.uniqueUsers} Usern, aktivster Tag: ${inputs.data.totals.busiestDay ?? 'n/a'}`
    }),
    makeBlock({
      id: 'input_chat_raw',
      group: 'input',
      groupLabel: '02 — Globaler Kontext',
      title: `Chat-Verlauf roh: ${inputs.dateKeys.length} Tage`,
      description: 'Die letzten 14 Berlin-Tage als Roh-Chat. Nur bei Budget-Ueberschreitung werden die aeltesten Tage repraesentativ ausgeduennt (keine AI-Kompaktierung).',
      active: true,
      cadence: CADENCE_PER_GENERATION,
      refreshedBy: ['mega-generation'],
      meta: [
        { label: 'Nachrichten', value: totalMessages.toLocaleString('de-DE') },
        { label: 'Ausgeduennte Tage', value: sampledDays > 0 ? String(sampledDays) : 'keine' }
      ],
      body: chatSection
    }),
    makeBlock({
      id: 'input_market',
      group: 'input',
      groupLabel: '02 — Globaler Kontext',
      title: 'Marktdaten (Multi-TF Kerzen, F&G, Sentiment, Aktivitaet, Predictions, Leaderboard-Rohdaten)',
      description: 'Alle deterministischen Zahlen als Lesematerial — das Modell erfindet keine Werte.',
      active: true,
      cadence: CADENCE_PER_GENERATION,
      refreshedBy: ['mega-generation'],
      meta: [
        { label: 'Kerzen 14d', value: String(inputs.data.btc.candlesByRange['14d'].length) },
        { label: 'F&G-Punkte', value: String(inputs.data.fearGreedHistory.length) },
        { label: 'Sentiment-Buckets', value: String(inputs.data.sentimentSeries.length) },
        { label: 'Leaderboard-Msgs', value: String(inputs.leaderboardMessages.length) }
      ],
      body: marketSection
    }),
    makeBlock({
      id: 'task',
      group: 'task',
      groupLabel: '03 — Auftrag',
      title: 'Auftrag: drei Ausgaben komponieren',
      description: 'Der finale Arbeitsauftrag an den Chefredakteur.',
      active: true,
      cadence: CADENCE_STATIC,
      refreshedBy: [],
      body: `AUFTRAG/
Komponiere jetzt die DREI Ausgaben der Financial Retarded Times (Tagesausgabe, 3-Tage-Ausgabe, Wochenausgabe) fuer den Erscheinungstag ${inputs.anchorDate}.

Vorgehen:
1. Lies Roh-Chat und Marktdaten als EINE zusammenhaengende Geschichte der 14 Tage.
2. Bestimme trendingTopics, topContributors und den fearGreed-Index (nur Chat-Stimmung).
3. Baue edition1d, dann edition3d, dann edition7d — jede mit coverStory zuerst,
   eigenem Ticker und eigener Timeline im jeweiligen Zeitfenster.
4. Verteile die dataComponents dort, wo sie erzaehlerisch passen, und schreibe zu
   jeder einen praezisen Kommentar auf Basis der gelieferten Zahlen.
5. Fuer chatExcerpt-Bloecke: nimm nur Nachrichten, die WOERTLICH im Roh-Chat stehen.
6. Der investigative 14-Tage-Rueckblick gehoert NUR in die Wochenausgabe.
7. Werte zum Schluss das traderLeaderboard aus den Leaderboard-Rohdaten aus.

Starte mit trendingTopics, topContributors und fearGreed, dann edition1d, edition3d, edition7d, zuletzt traderLeaderboard.`
    }),
    makeBlock({
      id: 'output_contract',
      group: 'contract',
      groupLabel: '04 — Output-Contract',
      title: 'Output-Contract (Schema)',
      description: 'Erwartete JSON-Struktur des Tri-Edition-Objekts.',
      active: true,
      cadence: CADENCE_STATIC,
      refreshedBy: [],
      body: `OUTPUT_CONTRACT/
Gib genau ein JSON-Objekt zurueck:
- trendingTopics: 4-8 konkrete Themen
- topContributors: 3-6 { username, initial, reason }
- fearGreed: { today, last3Days, last7Days, trend, insight, topDrivers }
- edition1d / edition3d / edition7d: je { masthead, blocks[], ticker, timeline }
  blocks als geordnete Union ueber "type":
  coverStory | article | sectionHeader | quoteWall | chatExcerpt | dataComponent
- traderLeaderboard: { weekSummary, leaderboard, hallOfShame, dataRange } oder null

Regeln:
- coverStory ist in jeder Ausgabe der erste Block.
- "In Kuerze"-shortNews-Lauf am Ende jeder Ausgabe.
- Nullable Felder explizit auf null setzen, wenn nicht verwendet.
- Zitate und chatExcerpt-Texte EXAKT aus dem Kontext, immer in " ".`
    })
  ]
}

export function renderEditionPrompt(blocks: EditionPromptBlock[]): string {
  return blocks.map(block => block.body).join('\n\n')
}

// ═══════════════════════════════════════════════════════════════════════
// Widget single-mode prompts (same lego, scoped to one widget)
// ═══════════════════════════════════════════════════════════════════════

export const EDITION_WIDGET_IDS = ['ticker', 'timeline', 'fearGreed', 'traderLeaderboard'] as const
export type EditionWidgetId = (typeof EDITION_WIDGET_IDS)[number]

export function isEditionWidgetId(value: string): value is EditionWidgetId {
  return (EDITION_WIDGET_IDS as readonly string[]).includes(value)
}

const WIDGET_TASKS: Record<EditionWidgetId, (dayRange: number) => string> = {
  ticker: dayRange => `AUFTRAG/
Erstelle NUR den News-Ticker fuer das Zeitfenster der letzten ${dayRange === 1 ? '24 Stunden' : `${dayRange} Tage`}.
8-20 kurze Meldungen, chronologisch, Regeln wie im Briefing (date, time Berlin, username ohne @, text Original, type).`,
  timeline: dayRange => `AUFTRAG/
Erstelle NUR die Ereignis-Timeline fuer das Zeitfenster der letzten ${dayRange === 1 ? '24 Stunden' : `${dayRange} Tage`}.
5-12 markante Momente, chronologisch, plus summary (1-2 Saetze), activityLevel und dominantSentiment.`,
  fearGreed: () => `AUFTRAG/
Erstelle NUR den Fear & Greed Community-Index (Stimmung des CHATS, nicht des Preises):
today (24h), last3Days, last7Days mit index 0-100, classification/classificationDE, trend, insight, topDrivers.`,
  traderLeaderboard: () => `AUFTRAG/
Werte NUR das Trader-Leaderboard aus den Leaderboard-Rohdaten im <market>-Abschnitt aus.
Regeln wie im Briefing: nur echte Richtungs-Calls, Preisverlauf 1-4h nach dem Call entscheidet,
score/winRate ganzzahlig, quotes EXAKT, hallOfShame 3-5, "//"-Nachrichten sind KEINE Calls.`
}

/**
 * A widget-scoped prompt: same system briefing + the inputs the widget
 * needs, but a task that asks for exactly one widget's schema.
 */
export function buildWidgetPromptBlocks(
  inputs: EditionGenerationInputs,
  widgetId: EditionWidgetId,
  dayRange: number
): EditionPromptBlock[] {
  const base = buildEditionPromptBlocks(inputs)
  const keep = new Set(['editorial_rules', 'issue_context', 'input_chat_raw'])
  if (widgetId === 'traderLeaderboard' || widgetId === 'fearGreed') keep.add('input_market')

  const blocks = base.filter(block => keep.has(block.id))
  blocks.push(makeBlock({
    id: `widget_task_${widgetId}`,
    group: 'task',
    groupLabel: '03 — Auftrag',
    title: `Widget-Auftrag: ${widgetId}`,
    description: 'Scoped Single-Mode-Auftrag fuer genau ein Widget.',
    active: true,
    cadence: CADENCE_PER_GENERATION,
    refreshedBy: [`widget:${widgetId}`],
    body: WIDGET_TASKS[widgetId](dayRange)
  }))
  return blocks
}
