/** Shared palette for the people network (canvas + DOM). */

export const QUOTE_COLOR = 'hsl(43 96% 56%)'
export const MENTION_COLOR = 'hsl(199 89% 60%)'
export const MIXED_COLOR = 'hsl(268 80% 72%)'

/** Group hues, picked to stay apart from gold/blue relation colours where possible. */
export const GROUP_COLORS = [
  'hsl(152 62% 52%)',
  'hsl(330 78% 66%)',
  'hsl(24 92% 60%)',
  'hsl(268 80% 72%)',
  'hsl(186 72% 50%)',
  'hsl(52 90% 60%)',
  'hsl(4 80% 64%)',
  'hsl(222 80% 70%)'
]

export function groupColor(group: number) {
  return group < 0 ? 'hsl(220 8% 55%)' : GROUP_COLORS[group % GROUP_COLORS.length]
}

export function relationColor(quotes: number, mentions: number) {
  if (!mentions) return QUOTE_COLOR
  if (!quotes) return MENTION_COLOR
  const share = quotes / (quotes + mentions)
  return share > 0.7 ? QUOTE_COLOR : share < 0.3 ? MENTION_COLOR : MIXED_COLOR
}
