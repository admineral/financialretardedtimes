// Note: CandlestickChart and ChartWithOverlays use ApexCharts which requires window
// They should be imported dynamically if needed
// export { CandlestickChart } from './CandlestickChart'
// export { ChartWithOverlays } from './ChartWithOverlays'

// These are safe for SSR or use dynamic imports internally
export { QuoteCard, QuoteDot, typeConfig } from './QuoteCard'

// The reusable widgets (ChartTimelineWidget, SentimentWidget,
// PredictionWidget) live in @/components/market-widgets now.

// ChartJSCandlestick should be imported dynamically:
// const ChartJSCandlestick = dynamic(() => import('./ChartJSCandlestick').then(m => m.ChartJSCandlestick), { ssr: false })
