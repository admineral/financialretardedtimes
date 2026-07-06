/**
 * prompt.ts (Newspaper v2 — Stage 2 prompt)
 *
 * Builds the full monthly-issue prompt as structured blocks (also consumed by
 * the v2 prompt inspector). Philosophy: the model is a newsroom editor, not a
 * widget-filler. It gets ONE global context and returns an ordered list of
 * content blocks; the required editorial sections are content requirements,
 * not schema slots.
 */

import {
  describeIssueRange,
  formatDigestsSection,
  formatMarketSection,
  formatRecentChatSection,
  getWeekWindows,
  type V2GenerationInputs
} from './context'

export type V2PromptGroup = 'system' | 'context' | 'input' | 'task' | 'contract'

export interface V2PromptBlockMeta {
  label: string
  value: string
}

export interface V2PromptBlock {
  id: string
  group: V2PromptGroup
  groupLabel: string
  title: string
  description: string
  active: boolean
  cadence: string
  refreshedBy: string[]
  body: string
  charCount: number
  tokenEstimate: number
  meta: V2PromptBlockMeta[]
}

export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

function makeBlock(
  input: Omit<V2PromptBlock, 'charCount' | 'tokenEstimate' | 'meta'> & { meta?: V2PromptBlockMeta[] }
): V2PromptBlock {
  return {
    ...input,
    meta: input.meta ?? [],
    charCount: input.body.length,
    tokenEstimate: estimateTokens(input.body)
  }
}

const CADENCE_STATIC = 'Statisch — aendert sich nur bei Deploy'
const CADENCE_DAILY = 'Taeglich (Digest-Backfill)'
const CADENCE_PER_GENERATION = 'Pro Generierung'

export const V2_EDITORIAL_PROMPT = `Du bist Chefredakteur der "Financial Retarded Times" — Monatsausgabe.
Die Leser sind Trader, die den TradingView-BTC-Chat verfolgen (oder verpasst haben). Du komponierst eine komplette Monatszeitung als geordnete Liste von Inhaltsbloecken.

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
• Zitate EXAKT im Original (inkl. Tippfehler). Niemals den Usernamen im Zitat wiederholen.
• Usernames IMMER ohne "@"-Praefix angeben (in author, contributors, quotes, messageRefs, topContributors, leaderboard) — das UI ergaenzt das @ selbst.
• Korrekte deutsche Orthographie mit echten Umlauten und Eszett (ä, ö, ü, ß) — niemals ae/oe/ue/ss als Ersatz schreiben.
• Beef neutral: beide Seiten zu Wort kommen lassen.
• Pointen nicht erklaeren. Keine Cringe-Uebertreibungen ("DRAMA!", "ESKALIERT!").
• Menschen zeigen: wer lag richtig, wer daneben, wer hatte den besten Konter.
• Jedes Thema darf im gesamten Blatt NUR EINMAL Hauptthema sein. Querverweise sind erlaubt, Wiederholungen nicht.

═══════════════════════════════════════════════════════════════════════
DEIN WERKZEUGKASTEN — BLOCK-TYPEN
═══════════════════════════════════════════════════════════════════════
Du entscheidest Reihenfolge und Komposition. Verfuegbare Blocktypen:

• coverStory — der Titelblatt-Aufmacher (genau 1x, als ERSTER Block)
• article — mit variant:
   - investigative: der grosse Monats-Long-Read (6-12 Absaetze), chronologisch:
     was ist diesen Monat passiert, wie hat der Chat auf den Markt reagiert,
     wer waren die Protagonisten. Wie eine Bloomberg-Monatsreportage.
   - monthlyFocus: der Monatsfokus — DAS dominierende Thema des Monats vertieft (4-6 Absaetze)
   - weeklyRecap: Wochen-Rueckblick (2-4 Absaetze, weekLabel setzen!)
   - feature: eigenstaendige Geschichte (2-5 Absaetze)
   - shortNews: Kurzmeldung (genau 1 Absatz)
• sectionHeader — Rubriken-Trenner mit Titel/Untertitel
• quoteWall — die besten Zitate des Monats
• statsBox — markante Zahlen des Monats (nur Zahlen aus dem Kontext!)
• chatExcerpt — ein echter Chat-Moment: verweise mit username + ISO-Zeitstempel +
  EXAKTEM Text auf Original-Nachrichten. Das System ersetzt deine Referenzen durch
  die echten Nachrichten — erfinde nichts, paraphrasiere nicht.
• dataComponent — platziert eine Daten-Abbildung. Die Zahlen liefert das System,
  du lieferst Titel + redaktionellen Kommentar + optionale Datums-Annotationen:
   - btcChart (30-Tage-Kerzenchart)
   - sentimentTimeline (Chat-Sentiment vs. BTC ueber 30 Tage)
   - traderLeaderboard (deine Leaderboard-Auswertung, siehe unten)
   - fearGreed (Fear & Greed Verlauf)
   - predictionRecap (offene Preis-Vorhersagen)
   - activityHeatmap (Chat-Aktivitaet pro Tag)

═══════════════════════════════════════════════════════════════════════
PFLICHT-INHALTE DER MONATSAUSGABE
═══════════════════════════════════════════════════════════════════════
1. coverStory als erster Block: die Geschichte des Monats.
2. Genau 1 investigative-Artikel (der Monats-Long-Read).
3. Genau 1 monthlyFocus-Artikel.
4. Genau 4 weeklyRecap-Artikel (einer pro Woche, aelteste zuerst, weekLabel gemaess Wochenfenstern).
5. 4-6 feature-Artikel.
6. 5-8 shortNews (gruppiert hinter einem sectionHeader "In Kuerze").
7. 1 quoteWall, 1-2 statsBox, 2-3 chatExcerpt.
8. Jede dataComponent GENAU EINMAL (alle 6), sinnvoll im Blatt verteilt
   (z.B. btcChart frueh im Marktteil, traderLeaderboard bei den Trader-Geschichten).
9. sectionHeader-Bloecke zur Gliederung (z.B. "Der Monat", "Rueckblicke",
   "Monatsfokus", "Aus dem Chat", "Markt & Daten", "In Kuerze").
10. Insgesamt 22-35 Bloecke, davon 14-18 Artikel (inkl. coverStory).

═══════════════════════════════════════════════════════════════════════
TRADER LEADERBOARD (separates Feld "traderLeaderboard")
═══════════════════════════════════════════════════════════════════════
Werte die Leaderboard-Rohdaten aus dem <market>-Abschnitt aus:
- Nur ECHTE Richtungs-Calls bewerten (Long/Short/Boden/Top mit Kontext)
- Preisverlauf 1-4h nach dem Call entscheidet ueber wasCorrect
- score und winRate ganzzahlig 0-100, 3-20 Eintraege, hallOfShame 3-5
- quotes EXAKT, outcome konkret mit Zahlen, commentaryText max 1 Satz
- "//"-Nachrichten sind KEINE Calls`

export function buildStage2Blocks(inputs: V2GenerationInputs): V2PromptBlock[] {
  const digestsSection = formatDigestsSection(inputs.dateKeys, inputs.digests)
  const recentSection = formatRecentChatSection(inputs.rawDateKeys, inputs.recentMessages)
  const marketSection = formatMarketSection({
    btcContext: inputs.btcContext,
    v2Data: inputs.v2Data,
    leaderboardPrompt: inputs.leaderboardPrompt
  })
  const weekWindows = getWeekWindows(inputs.dateKeys)
  const digestCount = inputs.dateKeys.filter(key => inputs.digests.has(key)).length

  return [
    makeBlock({
      id: 'editorial_rules',
      group: 'system',
      groupLabel: '00 — Redaktion',
      title: 'Redaktions-Briefing (Chefredakteur)',
      description: 'Rolle, Stil, Blocktypen-Werkzeugkasten und Pflicht-Inhalte der Monatsausgabe.',
      active: true,
      cadence: CADENCE_STATIC,
      refreshedBy: [],
      body: V2_EDITORIAL_PROMPT
    }),
    makeBlock({
      id: 'issue_context',
      group: 'context',
      groupLabel: '01 — Ausgabe-Kontext',
      title: 'Ausgabe-Kontext (Zeitraum, Wochenfenster)',
      description: 'Erscheinungsdatum, 30-Tage-Zeitraum und die vier Wochenfenster fuer die Rueckblicke.',
      active: true,
      cadence: CADENCE_PER_GENERATION,
      refreshedBy: ['full-issue'],
      meta: [
        { label: 'Ausgabe', value: inputs.issueDate },
        { label: 'Zeitraum', value: describeIssueRange(inputs.dateKeys) }
      ],
      body: `AUSGABE_KONTEXT/
issue_date: ${inputs.issueDate} (Europe/Berlin)
zeitraum: ${describeIssueRange(inputs.dateKeys)} (letzte ${inputs.dateKeys.length} Tage)
now_utc: ${new Date().toISOString()}

wochenfenster (fuer die 4 weeklyRecap-Artikel, aelteste zuerst):
${weekWindows.map(w => `- ${w.label}: ${w.start} bis ${w.end}`).join('\n')}

gesamt: ${inputs.v2Data.totals.messageCount.toLocaleString('de-DE')} Nachrichten im Zeitraum, aktivster Tag: ${inputs.v2Data.totals.busiestDay ?? 'n/a'}`
    }),
    makeBlock({
      id: 'input_digests',
      group: 'input',
      groupLabel: '02 — Globaler Kontext',
      title: `Chat-Historie: ${inputs.dateKeys.length} Tagesdigests`,
      description: 'Stage-1-Digests aller 30 Tage — komprimierte, aber reichhaltige Tages-Chroniken.',
      active: true,
      cadence: CADENCE_DAILY,
      refreshedBy: ['digest-backfill', 'full-issue'],
      meta: [
        { label: 'Digests', value: `${digestCount}/${inputs.dateKeys.length}` },
        { label: 'Fehlend', value: inputs.digestsMissing.length > 0 ? inputs.digestsMissing.join(', ') : 'keine' }
      ],
      body: digestsSection
    }),
    makeBlock({
      id: 'input_recent_raw',
      group: 'input',
      groupLabel: '02 — Globaler Kontext',
      title: `Chat-Verlauf roh: letzte ${inputs.rawDateKeys.length} Tage (ungekuerzt)`,
      description: 'Voller Text ohne Zeichenlimit und ohne Cap — die juengsten Tage im Original.',
      active: true,
      cadence: CADENCE_PER_GENERATION,
      refreshedBy: ['full-issue'],
      meta: [
        { label: 'Tage', value: inputs.rawDateKeys.join(', ') },
        { label: 'Nachrichten', value: inputs.recentMessages.length.toLocaleString('de-DE') }
      ],
      body: recentSection
    }),
    makeBlock({
      id: 'input_market',
      group: 'input',
      groupLabel: '02 — Globaler Kontext',
      title: 'Marktdaten (30d Kerzen, Sentiment, F&G, Predictions, Leaderboard-Rohdaten)',
      description: 'Alle deterministischen Zahlen als Lesematerial — das Modell erfindet keine Werte.',
      active: true,
      cadence: CADENCE_PER_GENERATION,
      refreshedBy: ['full-issue'],
      meta: [
        { label: 'Kerzen', value: String(inputs.v2Data.btc.candles.length) },
        { label: 'Sentiment-Punkte', value: String(inputs.v2Data.sentimentSeries.length) },
        { label: 'Leaderboard-Msgs', value: String(inputs.leaderboardMessages.length) }
      ],
      body: marketSection
    }),
    makeBlock({
      id: 'task',
      group: 'task',
      groupLabel: '03 — Auftrag',
      title: 'Auftrag: Monatsausgabe komponieren',
      description: 'Der finale Arbeitsauftrag an den Chefredakteur.',
      active: true,
      cadence: CADENCE_STATIC,
      refreshedBy: [],
      body: `AUFTRAG/
Komponiere jetzt die komplette Monatsausgabe der Financial Retarded Times fuer den Zeitraum ${describeIssueRange(inputs.dateKeys)}.

Vorgehen:
1. Lies Digests, Roh-Chat und Marktdaten als EINE zusammenhaengende Geschichte des Monats.
2. Waehle die Geschichte des Monats fuer die coverStory.
3. Baue das Blatt als geordnete Block-Liste gemaess Pflicht-Inhalten.
4. Verteile die 6 dataComponents dort, wo sie erzaehlerisch passen, und schreibe zu jeder einen praezisen Kommentar auf Basis der gelieferten Zahlen.
5. Fuer chatExcerpt-Bloecke: nimm nur Nachrichten, die WOERTLICH im Kontext stehen (Roh-Chat oder Digest-Zitate mit Zeitstempel).
6. Werte zum Schluss das traderLeaderboard-Feld aus den Leaderboard-Rohdaten aus.

Starte mit masthead, dann trendingTopics und topContributors, dann blocks (coverStory zuerst), zuletzt traderLeaderboard.`
    }),
    makeBlock({
      id: 'output_contract',
      group: 'contract',
      groupLabel: '04 — Output-Contract',
      title: 'Output-Contract (Schema)',
      description: 'Erwartete JSON-Struktur der Monatsausgabe.',
      active: true,
      cadence: CADENCE_STATIC,
      refreshedBy: [],
      body: `OUTPUT_CONTRACT/
Gib genau ein JSON-Objekt zurueck:
- masthead: { issueTitle, dateline, motto }
- trendingTopics: 4-8 konkrete Themen des Monats
- topContributors: 3-6 { username, reason }
- blocks: 22-35 geordnete Bloecke (discriminated union ueber "type"):
  coverStory | article | sectionHeader | quoteWall | statsBox | chatExcerpt | dataComponent
- traderLeaderboard: { weekSummary, leaderboard, hallOfShame, dataRange } oder null

Regeln:
- coverStory ist der erste Block.
- Jede dataComponent (btcChart, sentimentTimeline, traderLeaderboard, fearGreed, predictionRecap, activityHeatmap) genau einmal.
- weeklyRecap-Artikel brauchen weekLabel.
- Nullable Felder explizit auf null setzen, wenn nicht verwendet.
- Zitate und chatExcerpt-Texte EXAKT aus dem Kontext.`
    })
  ]
}

export function renderPromptBlocks(blocks: V2PromptBlock[]): string {
  return blocks.map(block => block.body).join('\n\n')
}

export const V2_SYSTEM_PROMPT = 'Du bist der Chefredakteur der Financial Retarded Times Monatsausgabe. Halte dich strikt an das Redaktions-Briefing und gib ausschliesslich das strukturierte Objekt zurueck.'
