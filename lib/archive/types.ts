export interface ArchiveFilter {
  room: string;
  username?: string;
  from?: string;
  to?: string;
}

export interface ArchiveMessage {
  id: string;
  sourceId: string | null;
  room: string;
  username: string;
  timestamp: string | null;
  date: string | null;
  rawTime: string;
  originalText: string;
  text: string;
  sources: Array<{
    table: "tv_chat_messages" | "tv_user_activity_messages";
    key: string;
    rawTime: string;
  }>;
}

export interface ArchiveCoverage {
  messageCount: number;
  participantCount: number;
  firstDate: string | null;
  lastDate: string | null;
  undatedCount: number;
  duplicateCount: number;
  conflictCount: number;
  days: Array<{ date: string; count: number }>;
  participants: Array<{ username: string; count: number }>;
  notes: string[];
}

export interface ArchiveCorpus {
  messages: ArchiveMessage[];
  coverage: ArchiveCoverage;
  fingerprint: string;
  readAt: string;
}

export interface BtcCandle {
  id: string;
  openTime: string;
  closeTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BtcHistory {
  source: "Binance";
  symbol: "BTCUSDT";
  quoteCurrency: "USDT";
  interval: "1h";
  candles: BtcCandle[];
  missingHours: number;
  notes: string[];
}

export interface ArchiveOverview {
  rooms: string[];
  filter: ArchiveFilter;
  available: ArchiveCoverage;
  selected: ArchiveCoverage;
  fingerprint: string;
  readAt: string;
}
