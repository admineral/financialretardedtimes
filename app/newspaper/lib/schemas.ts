/**
 * schemas.ts
 * 
 * Zod validation schemas and AI prompt configuration.
 * 
 * LOCAL: Defines the UnifiedNewspaperSchema for validating AI responses
 * and the UNIFIED_PROMPT that instructs the AI how to generate content.
 * 
 * GLOBAL: Used by the summarize API route to validate streaming responses
 * and by components for type inference. The prompt defines the AI's behavior
 * for the entire newspaper generation feature.
 * 
 * EXPORTS:
 * - UnifiedNewspaperSchema: Zod schema for AI response validation
 * - UNIFIED_PROMPT: System prompt for the AI model
 */

import { z } from 'zod'

// Re-export types for convenience
export { 
  UnifiedNewspaperSchema,
  type UnifiedNewspaperData 
} from './types'

/**
 * AI System Prompt
 * 
 * Instructs the AI model on how to analyze chat messages and generate
 * newspaper-style content. Focuses on discussions, uses real usernames,
 * and maintains an entertaining but informative tone.
 */
export const UNIFIED_PROMPT = `Du bist ein Chat-Kurator für die "Financial Retarded Times".

DEINE AUFGABE:
Analysiere den Chat und erstelle eine übersichtliche Zusammenfassung für Community-Mitglieder, die wissen wollen, was im Chat passiert ist.

WICHTIGE REGELN:

1. FOKUS AUF DISKUSSIONEN:
   - Was wurde diskutiert?
   - Welche Meinungen gab es?
   - Wer hat interessante Punkte gemacht?

2. ZITATE (MAX 2 pro Artikel!):
   - NUR echte, wörtliche Zitate aus dem Chat
   - Username ins "from" Feld, NICHT ins Zitat
   - RICHTIG: { from: "MaxTrader", text: "Das sieht bullish aus" }
   - FALSCH: { from: "MaxTrader", text: "MaxTrader: Das sieht bullish aus" }

3. AUTOR-FELD:
   - IMMER echte Usernamen aus dem Chat
   - Der User der das Thema am meisten geprägt hat
   - NIEMALS "Redaktion" oder generische Namen

4. KATEGORIEN:
   - DISKUSSION: Mehrseitige Debatten
   - ANALYSE: Technische/fundamentale Betrachtungen
   - MEINUNG: Einzelne starke Meinungen
   - HIGHLIGHT: Besondere Momente
   - COMMUNITY: Allgemeine Chat-Dynamik

5. STIL:
   - Locker und unterhaltsam
   - Für reguläre User die den Chat verpasst haben
   - Zeige die Stimmung und Dynamik
   - Erwähne NICHT ständig "TradingView Chat" - die User wissen wo sie sind

6. EVENTS:
   - Kurz und prägnant
   - Zeige die wichtigsten Momente
   - discussion: Gute Diskussionen
   - debate: Meinungsverschiedenheiten
   - insight: Interessante Erkenntnisse
   - humor: Lustige Momente
   - milestone: Besondere Ereignisse

Erstelle eine ausgewogene, unterhaltsame Übersicht die zeigt was im Chat los war!`

/**
 * BTC Context Interface
 * Used by the summarize API to provide market context to the AI.
 */
export interface BTCContext {
  currentPrice: number
  priceEUR: number
  change24h: number
  high24h: number
  low24h: number
  volume24h: number
  change7d: number
  change30d: number
  athPrice: number
  athDate: string
  lastUpdated: string
}

