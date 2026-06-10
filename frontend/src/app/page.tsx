"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
} from "recharts";

// ─── Tickers ─────────────────────────────────────────────────────────────────

const SUPPORTED_TICKERS: Record<string, string> = {
  "AAPL": "Apple",
  "AMZN": "Amazon",
  "GOOGL": "Google",
  "MSFT": "Microsoft",
  "NVDA": "Nvidia",
  "TSLA": "Tesla",
  "META": "Meta",
  "NFLX": "Netflix",
};

const TRENDING = ["NVDA", "TSLA", "AAPL", "MSFT", "GOOGL"];

// ─── Watchlist Storage ────────────────────────────────────────────────────────

const WATCHLIST_KEY = "sentinel_watchlist";

interface WatchlistEntry {
  ticker: string;
  company: string;
  addedAt: string;
  sentiment?: "bullish" | "bearish" | "neutral";
  confidence?: number;
}

function loadWatchlist(): WatchlistEntry[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveWatchlist(entries: WatchlistEntry[]) {
  try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(entries)); } catch {}
}

// ─── Search History ───────────────────────────────────────────────────────────

const HISTORY_KEY = "sentinel_search_history";
const MAX_HISTORY = 10;

interface HistoryEntry {
  ticker: string;
  company: string;
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number;
  searchedAt: string;
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveHistory(entries: HistoryEntry[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(entries)); } catch {}
}

function addToHistory(entry: HistoryEntry) {
  const current = loadHistory().filter(e => e.ticker !== entry.ticker);
  const updated = [entry, ...current].slice(0, MAX_HISTORY);
  saveHistory(updated);
  return updated;
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface StockConsensus {
  id: number;
  ticker: string;
  aggregate_sentiment: string;
  average_sentiment_score: number;
  accounting_perspective: string;
  market_psychology_perspective: string;
  the_bull_case: string;
  the_bear_case: string;
  consensus_risk_level: string;
  key_news_sources: string[];
  raw_source_meta: Record<string, unknown>[];
  fetched_at: string;
}

interface NormalisedConsensus {
  ticker: string;
  company_name: string;
  overall_sentiment: "bullish" | "bearish" | "neutral";
  confidence_score: number;
  bull_case: string[];
  bear_case: string[];
  risk_rating: "low" | "medium" | "high";
  accounting_perspective: string;
  market_psychology_perspective: string;
  key_news_sources: string[];
}

interface PricePoint {
  date: string;
  price: number;
  volume: number;
  change: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normaliseSentiment(s: string): "bullish" | "bearish" | "neutral" {
  const lower = s.toLowerCase();
  if (lower.includes("bullish")) return "bullish";
  if (lower.includes("bearish")) return "bearish";
  return "neutral";
}

function normaliseRisk(r: string): "low" | "medium" | "high" {
  const lower = r.toLowerCase();
  if (lower === "low") return "low";
  if (lower === "high") return "high";
  return "medium";
}

function splitIntoBullets(text: string): string[] {
  return text.split(/\.\s+/).map(s => s.trim()).filter(s => s.length > 10).map(s => s.endsWith(".") ? s : s + ".");
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
}

function normalise(raw: StockConsensus, companyName: string): NormalisedConsensus {
  return {
    ticker: raw.ticker,
    company_name: companyName,
    overall_sentiment: normaliseSentiment(raw.aggregate_sentiment),
    confidence_score: raw.average_sentiment_score,
    bull_case: splitIntoBullets(raw.the_bull_case),
    bear_case: splitIntoBullets(raw.the_bear_case),
    risk_rating: normaliseRisk(raw.consensus_risk_level),
    accounting_perspective: raw.accounting_perspective,
    market_psychology_perspective: raw.market_psychology_perspective,
    key_news_sources: raw.key_news_sources || [],
  };
}

async function fetchPriceHistory(symbol: string): Promise<PricePoint[]> {
  try {
    const end = Math.floor(Date.now() / 1000);
    const start = end - 60 * 60 * 24 * 90;
    const url = `/api/yf/v8/finance/chart/${symbol}?interval=1d&period1=${start}&period2=${end}`;
    const res = await fetch(url);
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return [];
    const timestamps: number[] = result.timestamp;
    const closes: number[] = result.indicators.quote[0].close;
    const volumes: number[] = result.indicators.quote[0].volume;
    return timestamps.map((ts, i) => {
      const price = closes[i] ?? 0;
      const prev = closes[i - 1] ?? price;
      return {
        date: new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        price: parseFloat(price.toFixed(2)),
        volume: Math.round((volumes[i] ?? 0) / 1_000_000),
        change: parseFloat(((price - prev) / prev * 100).toFixed(2)),
      };
    }).filter(p => p.price > 0);
  } catch { return []; }
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Theme CSS ────────────────────────────────────────────────────────────────

const darkTheme = {
  bg: "bg-[#13151a]",
  sidebar: "bg-[#0e1015] border-[#1e2229]",
  card: "bg-[#181b22] border-[#1e2229]",
  cardHover: "hover:border-green-500/25 hover:shadow-[0_0_24px_rgba(34,197,94,0.06)]",
  text: "text-[#e8eaf0]",
  textMuted: "text-[#8b92a5]",
  textFaint: "text-[#4a5168]",
  input: "bg-[#0e1015] border-[#1e2229] text-[#e8eaf0] placeholder-[#4a5168]",
  inputFocus: "focus:border-green-500/50",
  bullBg: "bg-[#0f1a12] border-[#1a3320]",
  bearBg: "bg-[#1a0f0f] border-[#331a1a]",
  skeletonBase: "bg-[#1e2229]/80",
  skeletonShimmer: "bg-gradient-to-r from-[#1e2229]/80 via-[#252932]/60 to-[#1e2229]/80",
  divider: "border-[#1e2229]",
  badge: "bg-[#1e2229] text-[#8b92a5]",
  tagBg: "bg-[#1e2229]/60 text-[#8b92a5]",
};

const lightTheme = {
  bg: "bg-[#f0ebe4]",
  sidebar: "bg-[#e8e2da] border-[#d4cec6]",
  card: "bg-[#f5f0ea] border-[#ddd8d0]",
  cardHover: "hover:border-green-500/40 hover:shadow-[0_0_20px_rgba(34,197,94,0.08)]",
  text: "text-[#1a1814]",
  textMuted: "text-[#5c5650]",
  textFaint: "text-[#9c9690]",
  input: "bg-[#ede8e1] border-[#d4cec6] text-[#1a1814] placeholder-[#9c9690]",
  inputFocus: "focus:border-green-600/50",
  bullBg: "bg-[#eaf2ec] border-[#c8deca]",
  bearBg: "bg-[#f2eaea] border-[#dec8c8]",
  skeletonBase: "bg-[#d8d3cc]/80",
  skeletonShimmer: "bg-gradient-to-r from-[#d8d3cc]/80 via-[#e0dbd4]/60 to-[#d8d3cc]/80",
  divider: "border-[#d4cec6]",
  badge: "bg-[#ddd8d0] text-[#5c5650]",
  tagBg: "bg-[#ddd8d0]/60 text-[#5c5650]",
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────

type NavPage = "dashboard" | "watchlist" | "news" | "chat" | "settings";

function Sidebar({
  activePage, onNavigate, darkMode, onToggleDark, onHome,
}: {
  activePage: NavPage;
  onNavigate: (p: NavPage) => void;
  darkMode: boolean;
  onToggleDark: () => void;
  onHome: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const t = darkMode ? darkTheme : lightTheme;

  const navItems: { id: NavPage; label: string; icon: React.ReactNode }[] = [
    {
      id: "dashboard", label: "Dashboard",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/></svg>,
    },
    {
      id: "watchlist", label: "Watchlist",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>,
    },
    {
      id: "news", label: "News Feed",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 4h16a1 1 0 011 1v11a2 2 0 01-2 2H5a2 2 0 01-2-2V5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5"/><path d="M8 8h8M8 12h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    },
    {
      id: "settings", label: "Settings",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="1.5"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="1.5"/></svg>,
    },
    {
      id: "chat" as NavPage, label: "AI Chat",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none"/></svg>,
    },
  ];

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className={`fixed left-0 top-0 bottom-0 z-50 flex flex-col border-r transition-all duration-300 ease-in-out ${t.sidebar} ${expanded ? "w-52" : "w-16"}`}
    >
      {/* Logo */}
      <button
        onClick={onHome}
        className="flex items-center gap-3 px-4 py-5 border-b border-inherit overflow-hidden hover:opacity-80 transition-opacity"
      >
        <div className="w-8 h-8 rounded-lg bg-green-500/20 border border-green-500/40 flex items-center justify-center flex-shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" stroke="#22c55e" strokeWidth="1.5" fill="none"/>
            <path d="M12 8v8M8 10l4-2 4 2" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        {expanded && (
          <div className="overflow-hidden">
            <div className={`text-xs font-bold tracking-widest ${t.text} whitespace-nowrap`}>SENTINEL</div>
            <div className={`text-[9px] ${t.textFaint} -mt-0.5 whitespace-nowrap`}>AI Market Sentiment</div>
          </div>
        )}
      </button>

      {/* Nav Items */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        {navItems.map((item) => {
          const active = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-2 py-2.5 rounded-xl transition-all overflow-hidden ${
                active
                  ? "bg-green-500/15 text-green-400 border border-green-500/20"
                  : `${t.textMuted} hover:bg-green-500/8 hover:text-green-400`
              }`}
            >
              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                {item.icon}
              </div>
              {expanded && (
                <span className="text-xs font-medium whitespace-nowrap">{item.label}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom — theme toggle + live indicator */}
      <div className="px-2 pb-4 space-y-2 border-t border-inherit pt-3">
        <button
          onClick={onToggleDark}
          className={`w-full flex items-center gap-3 px-2 py-2.5 rounded-xl transition-all overflow-hidden ${t.textMuted} hover:bg-green-500/8 hover:text-green-400`}
        >
          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
            {darkMode ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.5"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
            )}
          </div>
          {expanded && (
            <span className="text-xs font-medium whitespace-nowrap">{darkMode ? "Light Mode" : "Dark Mode"}</span>
          )}
        </button>

        {expanded && (
          <div className="flex items-center gap-2 px-2 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
            <span className="text-[9px] text-green-600 font-medium">Live Analysis</span>
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Info Tooltip ─────────────────────────────────────────────────────────────

function InfoTooltip({ content, darkMode }: { content: string; darkMode: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={(e) => { e.stopPropagation(); setVisible(v => !v); }}
        className="w-4 h-4 rounded-full border border-gray-600 text-gray-500 hover:border-green-500/60 hover:text-green-400 transition-colors flex items-center justify-center text-[10px] font-bold leading-none"
      >
        i
      </button>
      {visible && (
        <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 w-56 rounded-xl p-3 text-[11px] leading-relaxed shadow-2xl z-50 pointer-events-none border ${darkMode ? "bg-[#1a221a] border-gray-700 text-gray-300" : "bg-white border-gray-200 text-gray-600"}`}>
          {content}
          <div className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border-r border-b ${darkMode ? "bg-[#1a221a] border-gray-700" : "bg-white border-gray-200"}`} />
        </div>
      )}
    </div>
  );
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────

function SkeletonCard({ darkMode, className = "" }: { darkMode: boolean; className?: string }) {
  const t = darkMode ? darkTheme : lightTheme;
  return (
    <div className={`rounded-2xl border p-6 overflow-hidden relative ${t.card} ${className}`}>
      <div className={`absolute inset-0 ${t.skeletonShimmer} animate-pulse`} />
      <div className={`h-3 w-24 rounded-full ${t.skeletonBase} mb-4`} />
      <div className={`h-10 w-32 rounded-xl ${t.skeletonBase} mb-3`} />
      <div className={`h-2 w-full rounded-full ${t.skeletonBase}`} />
    </div>
  );
}

function SkeletonResults({ darkMode }: { darkMode: boolean }) {
  const t = darkMode ? darkTheme : lightTheme;
  return (
    <div className="space-y-4 mt-2 animate-pulse">
      <div className="text-center py-4">
        <div className={`h-8 w-48 rounded-xl ${t.skeletonBase} mx-auto mb-2`} />
        <div className={`h-3 w-32 rounded-full ${t.skeletonBase} mx-auto`} />
      </div>
      <div className={`rounded-2xl border p-6 ${t.card}`}>
        <div className={`h-64 w-full rounded-xl ${t.skeletonBase}`} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[0,1,2].map(i => <SkeletonCard key={i} darkMode={darkMode} />)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[0,1].map(i => <SkeletonCard key={i} darkMode={darkMode} className="h-40" />)}
      </div>
    </div>
  );
}

// ─── Trending Cards ───────────────────────────────────────────────────────────

// NOTE: These change values are mock/display-only for the landing page quick-view.
// Once you click a ticker, it hits your real backend at localhost:8000.
const MOCK_TRENDING: Record<string, { sentiment: "bullish" | "bearish" | "neutral"; confidence: number; change: string; positive: boolean }> = {
  "NVDA": { sentiment: "bullish", confidence: 93, change: "+2.4%", positive: true },
  "TSLA": { sentiment: "bearish", confidence: 61, change: "-1.8%", positive: false },
  "AAPL": { sentiment: "bullish", confidence: 78, change: "+0.9%", positive: true },
  "MSFT": { sentiment: "bullish", confidence: 85, change: "+1.2%", positive: true },
  "GOOGL": { sentiment: "neutral", confidence: 52, change: "+0.3%", positive: true },
};

function TrendingCards({ onSelect, darkMode }: { onSelect: (t: string) => void; darkMode: boolean }) {
  const t = darkMode ? darkTheme : lightTheme;
  return (
    <div className="max-w-4xl mx-auto px-4 pt-6 pb-4">
      <div className="flex items-center gap-2 mb-3">
        <p className={`text-xs uppercase tracking-widest ${t.textFaint}`}>Trending Now</p>
        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${darkMode ? "border-yellow-500/30 text-yellow-600 bg-yellow-500/5" : "border-yellow-400/40 text-yellow-600 bg-yellow-50"}`}>
          Preview data — click to run live AI analysis
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {TRENDING.map((tkr) => {
          const info = MOCK_TRENDING[tkr];
          const sentColor = info.sentiment === "bullish" ? "text-green-400" : info.sentiment === "bearish" ? "text-red-400" : "text-yellow-400";
          const sentBg = info.sentiment === "bullish" ? "bg-green-500/10 border-green-500/20" : info.sentiment === "bearish" ? "bg-red-500/10 border-red-500/20" : "bg-yellow-500/10 border-yellow-500/20";
          return (
            <button
              key={tkr}
              onClick={() => onSelect(tkr)}
              className={`flex flex-col items-start p-4 rounded-2xl border transition-all group ${t.card} ${t.cardHover}`}
            >
              <div className="flex items-center justify-between w-full mb-2">
                <span className={`text-sm font-bold ${t.text}`}>{tkr}</span>
                <span className={`text-[10px] font-semibold ${info.positive ? "text-green-400" : "text-red-400"}`}>{info.change}</span>
              </div>
              <span className={`text-[10px] ${t.textFaint} mb-3`}>{SUPPORTED_TICKERS[tkr]}</span>
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border ${sentBg}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${sentColor.replace("text-", "bg-")}`} />
                <span className={`text-[10px] font-semibold capitalize ${sentColor}`}>{info.sentiment}</span>
              </div>
              <span className={`text-[10px] ${t.textFaint} mt-2`}>{info.confidence}% confidence</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Search History Panel ─────────────────────────────────────────────────────

function SearchHistoryPanel({ history, onSelect, darkMode }: { history: HistoryEntry[]; onSelect: (t: string) => void; darkMode: boolean }) {
  const t = darkMode ? darkTheme : lightTheme;
  if (history.length === 0) return null;

  const sentBg = (s: "bullish" | "bearish" | "neutral") => {
    if (s === "bullish") return `border ${darkMode ? "bg-green-500/10 border-green-500/20" : "bg-green-50 border-green-200"}`;
    if (s === "bearish") return `border ${darkMode ? "bg-red-500/10 border-red-500/20" : "bg-red-50 border-red-200"}`;
    return `border ${darkMode ? "bg-yellow-500/10 border-yellow-500/20" : "bg-yellow-50 border-yellow-200"}`;
  };
  const sentDot = (s: "bullish" | "bearish" | "neutral") =>
    s === "bullish" ? "bg-green-400" : s === "bearish" ? "bg-red-400" : "bg-yellow-400";
  const sentText = (s: "bullish" | "bearish" | "neutral") =>
    s === "bullish" ? "text-green-400" : s === "bearish" ? "text-red-400" : "text-yellow-400";

  return (
    <div className="max-w-4xl mx-auto px-4 pt-2 pb-6">
      <div className="flex items-center gap-3 mb-3">
        <span className={`text-xs uppercase tracking-widest ${t.textFaint}`}>Recent Searches</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${darkMode ? "bg-gray-800 text-gray-500" : "bg-gray-100 text-gray-400"}`}>{history.length}</span>
        <div className={`flex-1 h-px ${darkMode ? "bg-gray-800/60" : "bg-gray-200"}`} />
      </div>
      <div className="flex flex-wrap gap-2">
        {history.map((entry) => (
          <button
            key={entry.ticker}
            onClick={() => onSelect(entry.ticker)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all hover:scale-105 ${sentBg(entry.sentiment)}`}
          >
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sentDot(entry.sentiment)}`} />
            <span className={`text-xs font-bold tracking-wide ${t.text}`}>{entry.ticker}</span>
            <span className={`text-[10px] hidden sm:inline ${t.textFaint}`}>{entry.company}</span>
            <span className={`text-[10px] font-semibold capitalize ${sentText(entry.sentiment)}`}>{Math.round(entry.confidence * 100)}%</span>
            <span className={`text-[10px] ${t.textFaint}`}>{timeAgo(entry.searchedAt)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Chart Tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, darkMode }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string; darkMode: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={`rounded-xl p-3 shadow-2xl text-xs border ${darkMode ? "bg-[#0f140f] border-gray-700" : "bg-white border-gray-200"}`}>
      <p className={`font-semibold mb-2 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
          <span className={darkMode ? "text-gray-400" : "text-gray-500"}>{entry.name}:</span>
          <span className={`font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>
            {entry.name === "Price" ? `$${entry.value.toFixed(2)}` : entry.name === "Volume" ? `${entry.value}M` : `${entry.value > 0 ? "+" : ""}${entry.value}%`}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Big Price Chart ──────────────────────────────────────────────────────────

function BigPriceChart({ priceHistory, ticker, sentiment, sentimentScore, chartLoading, darkMode }: {
  priceHistory: PricePoint[]; ticker: string; sentiment: "bullish" | "bearish" | "neutral";
  sentimentScore: number; chartLoading: boolean; darkMode: boolean;
}) {
  const [activeView, setActiveView] = useState<"price" | "change" | "volume">("price");
  const t = darkMode ? darkTheme : lightTheme;

  const sentimentLineColor = sentiment === "bullish" ? "#22c55e" : sentiment === "bearish" ? "#ef4444" : "#eab308";
  const priceColor = "#22c55e";
  const changeColor = "#f59e0b";

  const latestPrice = priceHistory[priceHistory.length - 1]?.price ?? 0;
  const firstPrice = priceHistory[0]?.price ?? 0;
  const totalChange = priceHistory.length > 0 ? ((latestPrice - firstPrice) / firstPrice * 100).toFixed(2) : "0.00";
  const isPositive = parseFloat(totalChange) >= 0;
  const high90 = priceHistory.length > 0 ? Math.max(...priceHistory.map(p => p.price)) : 0;
  const low90 = priceHistory.length > 0 ? Math.min(...priceHistory.map(p => p.price)) : 0;

  return (
    <div className={`rounded-2xl border p-6 transition-all ${t.card} ${t.cardHover}`}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h3 className={`font-bold text-base uppercase tracking-widest ${t.text}`}>{ticker}</h3>
            {!chartLoading && priceHistory.length > 0 && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isPositive ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                {isPositive ? "▲" : "▼"} {Math.abs(parseFloat(totalChange))}% (90d)
              </span>
            )}
          </div>
          {!chartLoading && priceHistory.length > 0 ? (
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-bold ${t.text}`}>${latestPrice.toFixed(2)}</span>
              <span className={`text-xs ${t.textFaint}`}>Current Price</span>
            </div>
          ) : (
            <div className={`h-9 w-32 rounded-lg animate-pulse ${t.skeletonBase}`} />
          )}
          <div className="flex items-center gap-2 mt-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: sentimentLineColor }} />
            <span className={`text-xs ${t.textFaint}`}>
              AI Sentiment: <span style={{ color: sentimentLineColor }} className="font-semibold capitalize">{sentiment}</span>
              {" · "}<span style={{ color: sentimentLineColor }}>{Math.round(sentimentScore * 100)}% confidence</span>
            </span>
          </div>
        </div>
        <div className={`flex rounded-xl p-1 gap-1 self-start border ${darkMode ? "bg-[#0a0e0a] border-gray-800" : "bg-gray-100 border-gray-200"}`}>
          {(["price", "change", "volume"] as const).map((v) => (
            <button key={v} onClick={() => setActiveView(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${activeView === v ? "bg-green-500/20 text-green-400 border border-green-500/30" : `${t.textFaint} hover:text-green-400`}`}>
              {v === "change" ? "% Change" : v === "volume" ? "Volume" : "Price"}
            </button>
          ))}
        </div>
      </div>

      {chartLoading ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <div className="relative w-10 h-10">
            <div className="w-10 h-10 border-2 border-green-500/20 rounded-full" />
            <div className="w-10 h-10 border-2 border-green-500 border-t-transparent rounded-full animate-spin absolute inset-0" />
          </div>
          <p className={`text-xs ${t.textFaint}`}>Loading price data…</p>
        </div>
      ) : priceHistory.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <p className={`text-sm ${t.textFaint}`}>Price data unavailable</p>
        </div>
      ) : (
        <div style={{ height: "280px", width: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={priceHistory} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="priceAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={priceColor} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={priceColor} stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#1f2a1f" : "#e5e7eb"} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: darkMode ? "#4b5563" : "#9ca3af", fontSize: 10 }} axisLine={false} tickLine={false} interval={Math.floor(priceHistory.length / 6)} />
              {activeView !== "volume" && (
                <YAxis yAxisId="main" domain={["auto", "auto"]} tick={{ fill: darkMode ? "#4b5563" : "#9ca3af", fontSize: 10 }} axisLine={false} tickLine={false} width={55}
                  tickFormatter={(v: number) => activeView === "price" ? `$${v}` : `${v}%`} />
              )}
              {activeView === "volume" && (
                <YAxis yAxisId="vol" tick={{ fill: darkMode ? "#4b5563" : "#9ca3af", fontSize: 10 }} axisLine={false} tickLine={false} width={45} tickFormatter={(v: number) => `${v}M`} />
              )}
              <Tooltip
                content={(props) => (
                  <ChartTooltip
                    active={props.active}
                    payload={props.payload?.map((p) => ({
                      name: String(p.name),
                      value: Number(p.value),
                      color: String(p.color),
                    }))}
                    label={props.label !== undefined ? String(props.label) : undefined}
                    darkMode={darkMode}
                  />
                )}
              />
              {activeView === "change" && <ReferenceLine yAxisId="main" y={0} stroke="#374151" strokeDasharray="4 2" />}
              {activeView === "price" && (
                <Area yAxisId="main" type="monotone" dataKey="price" name="Price" stroke={priceColor} strokeWidth={2} fill="url(#priceAreaGrad)" dot={false} activeDot={{ r: 4, fill: priceColor, stroke: darkMode ? "#0f140f" : "#fff", strokeWidth: 2 }} />
              )}
              {activeView === "change" && (
                <Line yAxisId="main" type="monotone" dataKey="change" name="% Change" stroke={changeColor} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: changeColor, stroke: darkMode ? "#0f140f" : "#fff", strokeWidth: 2 }} />
              )}
              {activeView === "volume" && (
                <Bar yAxisId="vol" dataKey="volume" name="Volume" fill="#6366f1" opacity={0.7} radius={[2, 2, 0, 0]} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {!chartLoading && priceHistory.length > 0 && (
        <div className={`grid grid-cols-3 gap-3 mt-4 pt-4 border-t ${darkMode ? "border-gray-800/60" : "border-gray-100"}`}>
          {(activeView === "volume" ? [
            { label: "Avg Volume", value: `${(priceHistory.reduce((a, p) => a + p.volume, 0) / priceHistory.length).toFixed(1)}M`, color: "text-indigo-400" },
            { label: "Peak Volume", value: `${Math.max(...priceHistory.map(p => p.volume))}M`, color: "text-indigo-300" },
            { label: "90d Return", value: `${isPositive ? "+" : ""}${totalChange}%`, color: isPositive ? "text-green-400" : "text-red-400" },
          ] : [
            { label: "90d High", value: `$${high90.toFixed(2)}`, color: "text-green-400" },
            { label: "90d Low", value: `$${low90.toFixed(2)}`, color: "text-red-400" },
            { label: "90d Return", value: `${isPositive ? "+" : ""}${totalChange}%`, color: isPositive ? "text-green-400" : "text-red-400" },
          ]).map((stat) => (
            <div key={stat.label} className="text-center">
              <p className={`text-sm font-bold ${stat.color}`}>{stat.value}</p>
              <p className={`text-[10px] mt-0.5 ${t.textFaint}`}>{stat.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AI Analysis Log ──────────────────────────────────────────────────────────
// Shows during loading so users can see the real AI pipeline working

const AI_STEPS = [
  { label: "Connecting to backend", detail: "localhost:8000/ticker/{ticker}", duration: 400 },
  { label: "Fetching live news sources", detail: "Scanning financial feeds & press releases", duration: 900 },
  { label: "Running sentiment analysis", detail: "Claude AI scoring each source independently", duration: 700 },
  { label: "Aggregating perspectives", detail: "Accounting + market psychology synthesis", duration: 600 },
  { label: "Computing bull / bear cases", detail: "Extracting key arguments from raw data", duration: 500 },
  { label: "Finalising consensus", detail: "Weighted average across all sources", duration: 400 },
];

function AIAnalysisLog({ ticker, darkMode }: { ticker: string; darkMode: boolean }) {
  const [step, setStep] = useState(0);
  const t = darkMode ? darkTheme : lightTheme;

  useEffect(() => {
    let current = 0;
    function advance() {
      if (current >= AI_STEPS.length - 1) return;
      const delay = AI_STEPS[current].duration;
      setTimeout(() => {
        current++;
        setStep(current);
        advance();
      }, delay);
    }
    advance();
  }, []);

  return (
    <div className={`rounded-2xl border p-6 ${t.card} mt-6`}>
      <div className="flex items-center gap-3 mb-5">
        <div className="relative w-8 h-8 flex-shrink-0">
          <div className="w-8 h-8 border-2 border-green-500/20 rounded-full" />
          <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin absolute inset-0" />
        </div>
        <div>
          <p className={`text-sm font-semibold ${t.text}`}>Live AI Analysis Running</p>
          <p className={`text-xs ${t.textFaint}`}>Hitting your backend at localhost:8000 · ticker: {ticker}</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] text-green-500 font-medium">LIVE</span>
        </div>
      </div>
      <div className="space-y-3">
        {AI_STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <div key={i} className={`flex items-start gap-3 transition-opacity duration-300 ${i > step ? "opacity-25" : "opacity-100"}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-bold transition-all ${
                done ? "bg-green-500/20 text-green-400 border border-green-500/30"
                : active ? "border-2 border-green-500 bg-green-500/10 text-green-400"
                : `border ${darkMode ? "border-gray-700 text-gray-700" : "border-gray-300 text-gray-300"}`
              }`}>
                {done ? "✓" : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold ${done ? "text-green-400" : active ? t.text : t.textFaint}`}>
                  {s.label}
                  {active && <span className="ml-2 inline-block w-1 h-3 bg-green-400 animate-pulse rounded-sm align-middle" />}
                </p>
                <p className={`text-[10px] ${t.textFaint} truncate`}>{s.detail.replace("{ticker}", ticker)}</p>
              </div>
              {done && <span className="text-[10px] text-green-500 flex-shrink-0 mt-0.5">done</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Watchlist Page ────────────────────────────────────────────────────────────

function WatchlistPage({
  darkMode, onAnalyze, searchHistory,
}: {
  darkMode: boolean;
  onAnalyze: (ticker: string) => void;
  searchHistory: HistoryEntry[];
}) {
  const t = darkMode ? darkTheme : lightTheme;
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addTicker, setAddTicker] = useState("");

  useEffect(() => { setWatchlist(loadWatchlist()); }, []);

  const addToWatchlist = (ticker: string) => {
    const existing = watchlist.find(w => w.ticker === ticker);
    if (existing) return;
    const histEntry = searchHistory.find(h => h.ticker === ticker);
    const entry: WatchlistEntry = {
      ticker,
      company: SUPPORTED_TICKERS[ticker] || ticker,
      addedAt: new Date().toISOString(),
      sentiment: histEntry?.sentiment,
      confidence: histEntry?.confidence,
    };
    const updated = [...watchlist, entry];
    setWatchlist(updated);
    saveWatchlist(updated);
    setShowAdd(false);
    setAddTicker("");
  };

  const removeFromWatchlist = (ticker: string) => {
    const updated = watchlist.filter(w => w.ticker !== ticker);
    setWatchlist(updated);
    saveWatchlist(updated);
  };

  const sentColor = (s?: "bullish" | "bearish" | "neutral") =>
    s === "bullish" ? "text-green-400" : s === "bearish" ? "text-red-400" : "text-yellow-400";
  const sentBg = (s?: "bullish" | "bearish" | "neutral") =>
    s === "bullish" ? (darkMode ? "bg-green-500/10 border-green-500/20" : "bg-green-50 border-green-200")
    : s === "bearish" ? (darkMode ? "bg-red-500/10 border-red-500/20" : "bg-red-50 border-red-200")
    : (darkMode ? "bg-yellow-500/10 border-yellow-500/20" : "bg-yellow-50 border-yellow-200");

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className={`text-2xl font-bold ${t.text}`}>Watchlist</h2>
          <p className={`text-sm mt-0.5 ${t.textFaint}`}>Track stocks you care about</p>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-black font-bold px-4 py-2 rounded-xl transition-all text-sm"
        >
          <span className="text-lg leading-none">+</span> Add Ticker
        </button>
      </div>

      {/* Add ticker panel */}
      {showAdd && (
        <div className={`rounded-2xl border p-4 mb-4 ${t.card}`}>
          <p className={`text-xs uppercase tracking-widest mb-3 ${t.textFaint}`}>Add to Watchlist</p>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(SUPPORTED_TICKERS)
              .filter(([code]) => !watchlist.find(w => w.ticker === code))
              .map(([code, name]) => (
                <button
                  key={code}
                  onClick={() => addToWatchlist(code)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all hover:border-green-500/40 hover:text-green-400 ${t.card} ${t.textMuted}`}
                >
                  {code} <span className={`font-normal ${t.textFaint}`}>— {name}</span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {watchlist.length === 0 && (
        <div className={`rounded-2xl border p-12 text-center ${t.card}`}>
          <div className="text-4xl mb-4">⭐</div>
          <p className={`text-lg font-semibold mb-2 ${t.text}`}>Your watchlist is empty</p>
          <p className={`text-sm ${t.textFaint} mb-4`}>Add tickers to track them here, then run AI analysis at any time.</p>
          <button
            onClick={() => setShowAdd(true)}
            className="bg-green-500 hover:bg-green-400 text-black font-bold px-6 py-2.5 rounded-xl text-sm transition-all"
          >
            Add your first ticker
          </button>
        </div>
      )}

      {/* Watchlist items */}
      {watchlist.length > 0 && (
        <div className="space-y-3">
          {watchlist.map((entry) => {
            const histEntry = searchHistory.find(h => h.ticker === entry.ticker);
            const sentiment = histEntry?.sentiment || entry.sentiment;
            const confidence = histEntry?.confidence || entry.confidence;
            return (
              <div key={entry.ticker} className={`rounded-2xl border p-5 flex items-center gap-4 transition-all ${t.card} ${t.cardHover}`}>
                {/* Ticker badge */}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 ${darkMode ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-900"}`}>
                  {entry.ticker.slice(0, 2)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold text-sm ${t.text}`}>{entry.ticker}</span>
                    <span className={`text-xs ${t.textFaint}`}>{entry.company}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {sentiment && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-lg border font-semibold capitalize ${sentBg(sentiment)} ${sentColor(sentiment)}`}>
                        {sentiment}
                      </span>
                    )}
                    {confidence !== undefined && (
                      <span className={`text-[10px] ${t.textFaint}`}>{Math.round(confidence * 100)}% confidence</span>
                    )}
                    {histEntry ? (
                      <span className={`text-[10px] ${t.textFaint}`}>Analysed {timeAgo(histEntry.searchedAt)}</span>
                    ) : (
                      <span className={`text-[10px] ${darkMode ? "text-yellow-600" : "text-yellow-500"}`}>Not yet analysed</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => onAnalyze(entry.ticker)}
                    className="flex items-center gap-1.5 bg-green-500/15 hover:bg-green-500/25 text-green-400 border border-green-500/20 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Analyse
                  </button>
                  <button
                    onClick={() => removeFromWatchlist(entry.ticker)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-all ${darkMode ? "text-gray-600 hover:text-red-400 hover:bg-red-500/10" : "text-gray-400 hover:text-red-500 hover:bg-red-50"}`}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tip */}
      <div className={`mt-6 rounded-xl p-4 border text-xs ${darkMode ? "border-gray-800 bg-gray-800/20 text-gray-500" : "border-gray-200 bg-gray-50 text-gray-400"}`}>
        <span className="font-semibold text-green-500">Tip:</span> Watchlist sentiment is pulled from your most recent analysis. Click <strong>Analyse</strong> on any ticker to fetch fresh AI-powered sentiment from your backend.
      </div>
    </div>
  );
}

// ─── News Feed Page ───────────────────────────────────────────────────────────

// Real news links from financial sources — not mock
const REAL_NEWS_FEEDS: { label: string; url: string; description: string; category: string }[] = [
  { label: "Reuters Markets", url: "https://www.reuters.com/markets/", description: "Breaking markets & financial news", category: "Markets" },
  { label: "Bloomberg Markets", url: "https://www.bloomberg.com/markets", description: "Global financial data & news", category: "Markets" },
  { label: "CNBC Finance", url: "https://www.cnbc.com/finance/", description: "US market news & analysis", category: "Markets" },
  { label: "Financial Times", url: "https://www.ft.com/markets", description: "In-depth global markets coverage", category: "Markets" },
  { label: "Yahoo Finance", url: "https://finance.yahoo.com/", description: "Stock quotes, charts, and news", category: "Data" },
  { label: "MarketWatch", url: "https://www.marketwatch.com/", description: "Real-time stocks, bonds, funds", category: "Data" },
  { label: "Seeking Alpha", url: "https://seekingalpha.com/", description: "Crowdsourced investment analysis", category: "Analysis" },
  { label: "Motley Fool", url: "https://www.fool.com/investing-news/", description: "Long-term investing perspectives", category: "Analysis" },
  { label: "Investopedia News", url: "https://www.investopedia.com/financial-news-and-analysis-5114636", description: "Educational financial journalism", category: "Analysis" },
  { label: "Wall Street Journal", url: "https://www.wsj.com/market-data", description: "Business & finance journalism", category: "Markets" },
  { label: "Barron's", url: "https://www.barrons.com/", description: "Investment-focused weekly coverage", category: "Analysis" },
  { label: "The Economist", url: "https://www.economist.com/finance-and-economics", description: "Macro economic analysis & commentary", category: "Macro" },
];

const TICKER_NEWS: Record<string, { label: string; url: string }[]> = {
  "AAPL": [
    { label: "Apple newsroom", url: "https://www.apple.com/newsroom/" },
    { label: "Apple on Reuters", url: "https://www.reuters.com/companies/AAPL.OQ/news/" },
  ],
  "NVDA": [
    { label: "Nvidia investor relations", url: "https://investor.nvidia.com/news/default.aspx" },
    { label: "Nvidia on Reuters", url: "https://www.reuters.com/companies/NVDA.OQ/news/" },
  ],
  "TSLA": [
    { label: "Tesla IR blog", url: "https://ir.tesla.com/" },
    { label: "Tesla on Reuters", url: "https://www.reuters.com/companies/TSLA.OQ/news/" },
  ],
  "MSFT": [
    { label: "Microsoft news", url: "https://news.microsoft.com/" },
    { label: "MSFT on Reuters", url: "https://www.reuters.com/companies/MSFT.OQ/news/" },
  ],
  "GOOGL": [
    { label: "Google blog", url: "https://blog.google/inside-google/company-announcements/" },
    { label: "Alphabet IR", url: "https://abc.xyz/investor/" },
  ],
  "AMZN": [
    { label: "Amazon press room", url: "https://press.aboutamazon.com/" },
    { label: "Amazon IR", url: "https://ir.aboutamazon.com/news-releases/default.aspx" },
  ],
  "META": [
    { label: "Meta newsroom", url: "https://about.fb.com/news/" },
    { label: "Meta IR", url: "https://investor.fb.com/ir-news/default.aspx" },
  ],
  "NFLX": [
    { label: "Netflix media centre", url: "https://media.netflix.com/en/" },
    { label: "Netflix IR", url: "https://ir.netflix.net/ir/news-events/press-releases/default.aspx" },
  ],
};

function NewsFeedPage({ darkMode, lastAnalysed }: { darkMode: boolean; lastAnalysed: NormalisedConsensus | null }) {
  const t = darkMode ? darkTheme : lightTheme;
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const categories = ["All", "Markets", "Data", "Analysis", "Macro"];

  const filtered = activeCategory === "All"
    ? REAL_NEWS_FEEDS
    : REAL_NEWS_FEEDS.filter(n => n.category === activeCategory);

  const tickerLinks = lastAnalysed ? TICKER_NEWS[lastAnalysed.ticker] : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 w-full">
      {/* Header */}
      <div className="mb-6">
        <h2 className={`text-2xl font-bold ${t.text}`}>News Feed</h2>
        <p className={`text-sm mt-0.5 ${t.textFaint}`}>Curated financial news sources powering Sentinel's AI analysis</p>
      </div>

      {/* Banner explaining the data flow */}
      <div className={`rounded-2xl border p-5 mb-6 ${darkMode ? "bg-green-500/5 border-green-500/20" : "bg-green-50 border-green-200"}`}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-green-400 text-sm">✦</span>
          </div>
          <div>
            <p className={`text-sm font-semibold text-green-400 mb-1`}>How Sentinel's AI reads the news</p>
            <p className={`text-xs leading-relaxed ${t.textMuted}`}>
              When you run an analysis, your backend at <code className="bg-green-500/10 text-green-400 px-1 rounded">localhost:8000</code> scrapes these financial sources in real time, extracts relevant articles, and passes them to Claude AI for independent sentiment scoring. The bull/bear cases and confidence score you see are synthesised entirely from live articles — not pre-computed.
            </p>
          </div>
        </div>
      </div>

      {/* If there's a last-analysed ticker, show its source links */}
      {lastAnalysed && (
        <div className={`rounded-2xl border p-5 mb-6 ${t.card}`}>
          <p className={`text-xs uppercase tracking-widest mb-3 ${t.textFaint}`}>Sources used in your last analysis — {lastAnalysed.ticker}</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {lastAnalysed.key_news_sources.length > 0 ? lastAnalysed.key_news_sources.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-all ${darkMode ? "border-gray-800 text-gray-400 hover:border-green-500/40 hover:text-green-400" : "border-gray-200 text-gray-500 hover:border-green-400 hover:text-green-600"}`}>
                <span className="w-4 h-4 rounded bg-green-500/10 text-green-400 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                  {extractDomain(url).charAt(0).toUpperCase()}
                </span>
                {extractDomain(url)}
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </a>
            )) : (
              <p className={`text-xs ${t.textFaint}`}>No source URLs returned by backend for this ticker.</p>
            )}
          </div>
          {tickerLinks && (
            <div>
              <p className={`text-[10px] uppercase tracking-widest mb-2 ${t.textFaint}`}>Official {lastAnalysed.ticker} sources</p>
              <div className="flex flex-wrap gap-2">
                {tickerLinks.map((link, i) => (
                  <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green-500/20 bg-green-500/5 text-green-400 text-xs hover:bg-green-500/10 transition-all">
                    {link.label}
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Category filter */}
      <div className={`flex gap-2 mb-4 p-1 rounded-xl w-fit border ${darkMode ? "bg-[#0a0e0a] border-gray-800" : "bg-gray-100 border-gray-200"}`}>
        {categories.map(cat => (
          <button key={cat} onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeCategory === cat ? "bg-green-500/20 text-green-400 border border-green-500/30" : `${t.textFaint} hover:text-green-400`}`}>
            {cat}
          </button>
        ))}
      </div>

      {/* News grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((item, i) => (
          <a
            key={i}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`rounded-2xl border p-5 group transition-all block ${t.card} ${t.cardHover}`}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 transition-colors ${darkMode ? "bg-gray-800 text-gray-300 group-hover:bg-green-500/20 group-hover:text-green-400" : "bg-gray-100 text-gray-500 group-hover:bg-green-100 group-hover:text-green-600"}`}>
                {item.label.charAt(0)}
              </div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-widest ${darkMode ? "border-gray-800 text-gray-600" : "border-gray-200 text-gray-400"}`}>
                {item.category}
              </span>
            </div>
            <p className={`text-sm font-semibold mb-1 group-hover:text-green-400 transition-colors ${t.text}`}>{item.label}</p>
            <p className={`text-xs leading-relaxed ${t.textFaint}`}>{item.description}</p>
            <div className={`flex items-center gap-1 mt-3 text-[10px] ${t.textFaint} group-hover:text-green-400 transition-colors`}>
              {extractDomain(item.url)}
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

// ─── Settings Page ────────────────────────────────────────────────────────────

function SettingsPage({ darkMode, onToggleDark, onClearHistory }: {
  darkMode: boolean;
  onToggleDark: () => void;
  onClearHistory: () => void;
}) {
  const t = darkMode ? darkTheme : lightTheme;
  const [backendUrl, setBackendUrl] = useState("http://localhost:8000");
  const [saved, setSaved] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [watchlistCount, setWatchlistCount] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem("sentinel_backend_url");
    if (stored) setBackendUrl(stored);
    setHistoryCount(loadHistory().length);
    setWatchlistCount(loadWatchlist().length);
  }, []);

  const saveBackendUrl = () => {
    try { localStorage.setItem("sentinel_backend_url", backendUrl); } catch {}
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const clearHistory = () => {
    try { localStorage.removeItem(HISTORY_KEY); } catch {}
    setHistoryCount(0);
    onClearHistory();
  };

  const clearWatchlist = () => {
    try { localStorage.removeItem(WATCHLIST_KEY); } catch {}
    setWatchlistCount(0);
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className={`rounded-2xl border p-6 ${t.card}`}>
      <h3 className={`text-xs uppercase tracking-widest mb-5 ${t.textFaint}`}>{title}</h3>
      {children}
    </div>
  );

  const Row = ({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) => (
    <div className={`flex items-center justify-between py-4 border-b last:border-b-0 ${t.divider}`}>
      <div>
        <p className={`text-sm font-medium ${t.text}`}>{label}</p>
        {description && <p className={`text-xs mt-0.5 ${t.textFaint}`}>{description}</p>}
      </div>
      {children}
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 w-full space-y-4">
      <div className="mb-6">
        <h2 className={`text-2xl font-bold ${t.text}`}>Settings</h2>
        <p className={`text-sm mt-0.5 ${t.textFaint}`}>Configure Sentinel to match your setup</p>
      </div>

      {/* Backend */}
      <Section title="Backend Connection">
        <Row label="Backend URL" description="Your FastAPI server running the AI pipeline">
          <div className="flex items-center gap-2">
            <input
              value={backendUrl}
              onChange={e => setBackendUrl(e.target.value)}
              className={`text-xs rounded-lg border px-3 py-2 w-52 focus:outline-none transition-colors ${t.input} ${t.inputFocus}`}
              placeholder="http://localhost:8000"
            />
            <button
              onClick={saveBackendUrl}
              className={`text-xs font-semibold px-3 py-2 rounded-lg transition-all ${saved ? "bg-green-500/20 text-green-400 border border-green-500/20" : "bg-green-500 hover:bg-green-400 text-black"}`}
            >
              {saved ? "Saved ✓" : "Save"}
            </button>
          </div>
        </Row>
        <div className={`mt-4 rounded-xl p-3 text-xs ${darkMode ? "bg-gray-800/30 text-gray-500" : "bg-gray-50 text-gray-400"}`}>
          <p className="font-semibold text-green-500 mb-1">Backend status note</p>
          <p>Sentinel calls <code className="bg-green-500/10 text-green-400 px-1 rounded">{backendUrl}/ticker/{"<TICKER>"}</code> for each analysis. Make sure your FastAPI server is running. The URL saved here is for reference — to make it dynamic, update the <code className="bg-green-500/10 text-green-400 px-1 rounded">handleSearch</code> fetch call in the code.</p>
        </div>
      </Section>

      {/* Appearance */}
      <Section title="Appearance">
        <Row label="Dark Mode" description="Switch between dark and light theme">
          <button
            onClick={onToggleDark}
            className={`relative w-10 h-5.5 rounded-full transition-colors border ${darkMode ? "bg-green-500/20 border-green-500/30" : "bg-gray-200 border-gray-300"}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full shadow transition-all ${darkMode ? "left-5 bg-green-400" : "left-0.5 bg-gray-400"}`} />
          </button>
        </Row>
      </Section>

      {/* Data */}
      <Section title="Local Data">
        <Row label="Search History" description={`${historyCount} searches stored locally in your browser`}>
          <button
            onClick={clearHistory}
            disabled={historyCount === 0}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${historyCount > 0 ? "border-red-500/30 text-red-400 hover:bg-red-500/10" : `${t.textFaint} border-transparent cursor-not-allowed`}`}
          >
            Clear history
          </button>
        </Row>
        <Row label="Watchlist" description={`${watchlistCount} tickers saved`}>
          <button
            onClick={clearWatchlist}
            disabled={watchlistCount === 0}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${watchlistCount > 0 ? "border-red-500/30 text-red-400 hover:bg-red-500/10" : `${t.textFaint} border-transparent cursor-not-allowed`}`}
          >
            Clear watchlist
          </button>
        </Row>
        <div className={`mt-4 rounded-xl p-3 text-xs ${darkMode ? "bg-gray-800/30 text-gray-500" : "bg-gray-50 text-gray-400"}`}>
          All data is stored in your browser's <code className="bg-green-500/10 text-green-400 px-1 rounded">localStorage</code>. Nothing is sent to any server except your own backend at the URL above.
        </div>
      </Section>

      {/* About */}
      <Section title="About Sentinel">
        <div className="space-y-3">
          <div className={`flex justify-between text-sm`}>
            <span className={t.textFaint}>Version</span>
            <span className={`font-medium ${t.text}`}>1.0.0</span>
          </div>
          <div className={`flex justify-between text-sm`}>
            <span className={t.textFaint}>AI Model</span>
            <span className="font-medium text-green-400">Claude (via your backend)</span>
          </div>
          <div className={`flex justify-between text-sm`}>
            <span className={t.textFaint}>Price data</span>
            <span className={`font-medium ${t.text}`}>Yahoo Finance proxy</span>
          </div>
          <div className={`flex justify-between text-sm`}>
            <span className={t.textFaint}>Sentiment data</span>
            <span className={`font-medium ${t.text}`}>Live via localhost:8000</span>
          </div>
        </div>
      </Section>
    </div>
  );
}

// ─── AI Chat Page ─────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tickers: string[];
  loading?: boolean;
  error?: boolean;
  timestamp: string;
}

interface ChatContext {
  ticker: string;
  company_name: string;
  overall_sentiment: string;
  confidence_score: number;
  bull_case: string[];
  bear_case: string[];
  risk_rating: string;
  accounting_perspective: string;
  market_psychology_perspective: string;
}

function buildSuggestedPrompts(analysedTickers: ChatContext[]): string[] {
  const prompts: string[] = [];
  if (analysedTickers.length === 0) return [
    "Analyse Apple stock for me",
    "What makes Nvidia bullish right now?",
    "Which stocks should I watch?",
  ];

  const first = analysedTickers[0];
  prompts.push(`Why is ${first.company_name} ${first.overall_sentiment}?`);
  prompts.push(`What are the key risks of ${first.ticker}?`);
  prompts.push(`Summarise ${first.ticker} in one paragraph`);

  if (analysedTickers.length >= 2) {
    const second = analysedTickers[1];
    prompts.push(`Compare ${first.ticker} vs ${second.ticker}`);
  }

  if (analysedTickers.length >= 3) {
    prompts.push("Which of my analysed stocks has the highest confidence?");
  }

  return prompts.slice(0, 4);
}

async function callSentinelChat(
  question: string,
  context: ChatContext[]
): Promise<string> {
  // Build a rich context block from all analysed tickers
  const contextBlock = context.map(c => `
Ticker: ${c.ticker} (${c.company_name})
Sentiment: ${c.overall_sentiment} | Confidence: ${Math.round(c.confidence_score * 100)}% | Risk: ${c.risk_rating}
Bull Case: ${c.bull_case.join(". ")}
Bear Case: ${c.bear_case.join(". ")}
Market Psychology: ${c.market_psychology_perspective}
Accounting: ${c.accounting_perspective}
  `.trim()).join("\n\n---\n\n");

  const response = await fetch("http://localhost:8000/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      context: contextBlock,
    }),
  });

  if (!response.ok) throw new Error("Chat request failed");
  const data = await response.json();
  return data.response;
}

function AIChatPage({
  darkMode,
  analysedTickers,
  onAnalyze,
}: {
  darkMode: boolean;
  analysedTickers: ChatContext[];
  onAnalyze: (ticker: string) => void;
}) {
  const t = darkMode ? darkTheme : lightTheme;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const suggestedPrompts = buildSuggestedPrompts(analysedTickers);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
      tickers: [],
      timestamp: new Date().toISOString(),
    };

    const loadingMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "",
      tickers: [],
      loading: true,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const answer = await callSentinelChat(text.trim(), analysedTickers);
      const referencedTickers = analysedTickers
        .map(c => c.ticker)
        .filter(ticker => answer.toUpperCase().includes(ticker));

      setMessages(prev => prev.map(m =>
        m.id === loadingMsg.id
          ? { ...m, content: answer, tickers: referencedTickers, loading: false }
          : m
      ));
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === loadingMsg.id
          ? { ...m, content: "Sorry, I couldn't connect to the AI. Check your backend is running.", tickers: [], loading: false, error: true }
          : m
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => setMessages([]);

  return (
    <div className="flex flex-col h-screen max-h-screen">

      {/* Header */}
      <div className={`flex items-center justify-between px-6 py-4 border-b flex-shrink-0 ${darkMode ? "border-gray-800 bg-[#0a0e0a]" : "border-gray-200 bg-white"}`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-green-500/20 border border-green-500/30 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" fill="#22c55e" opacity="0.8"/>
              <circle cx="12" cy="12" r="10" stroke="#22c55e" strokeWidth="1.5" fill="none"/>
            </svg>
          </div>
          <div>
            <h2 className={`text-sm font-bold ${t.text}`}>Sentinel AI</h2>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-green-500">
                {analysedTickers.length > 0
                  ? `${analysedTickers.length} stock${analysedTickers.length > 1 ? "s" : ""} in context`
                  : "No stocks analysed yet"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {analysedTickers.length > 0 && (
            <div className="flex gap-1.5">
              {analysedTickers.slice(0, 4).map(c => (
                <span key={c.ticker} className={`text-[10px] px-2 py-0.5 rounded-lg border font-semibold ${
                  c.overall_sentiment === "bullish"
                    ? "bg-green-500/10 border-green-500/20 text-green-400"
                    : c.overall_sentiment === "bearish"
                    ? "bg-red-500/10 border-red-500/20 text-red-400"
                    : "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
                }`}>
                  {c.ticker}
                </span>
              ))}
            </div>
          )}
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${darkMode ? "border-gray-800 text-gray-500 hover:text-red-400 hover:border-red-500/30" : "border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-300"}`}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">

        {/* Empty state */}
        {messages.length === 0 && (
          <div className="max-w-2xl mx-auto">

            {/* Intro card */}
            <div className={`rounded-2xl border p-6 mb-6 text-center ${t.card}`}>
              <div className="w-14 h-14 rounded-2xl bg-green-500/15 border border-green-500/20 flex items-center justify-center mx-auto mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="#22c55e" strokeWidth="1.5" strokeLinejoin="round" fill="none"/>
                </svg>
              </div>
              <h3 className={`text-lg font-bold mb-2 ${t.text}`}>Ask Sentinel AI</h3>
              <p className={`text-sm leading-relaxed ${t.textMuted}`}>
                I can answer questions about any stock you've analysed in Sentinel.
                {analysedTickers.length === 0
                  ? " Run an analysis on any ticker first, then come back to ask questions."
                  : ` I currently have data on ${analysedTickers.map(c => c.ticker).join(", ")}.`}
              </p>
            </div>

            {/* No tickers analysed yet */}
            {analysedTickers.length === 0 && (
              <div className={`rounded-2xl border p-5 mb-4 ${darkMode ? "border-yellow-500/20 bg-yellow-500/5" : "border-yellow-200 bg-yellow-50"}`}>
                <div className="flex items-start gap-3">
                  <span className="text-yellow-400 text-lg flex-shrink-0">⚠</span>
                  <div>
                    <p className={`text-sm font-semibold mb-1 ${darkMode ? "text-yellow-400" : "text-yellow-700"}`}>No stocks analysed yet</p>
                    <p className={`text-xs leading-relaxed ${darkMode ? "text-yellow-600" : "text-yellow-600"}`}>
                      Sentinel AI only answers questions based on real data from your analyses. Go to Dashboard, search a ticker, then come back here.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {["AAPL", "AMZN", "NVDA"].map(tkr => (
                        <button
                          key={tkr}
                          onClick={() => onAnalyze(tkr)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-400 text-black font-semibold transition-all"
                        >
                          Analyse {tkr}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Suggested prompts */}
            {analysedTickers.length > 0 && (
              <div>
                <p className={`text-xs uppercase tracking-widest mb-3 ${t.textFaint}`}>Suggested questions</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {suggestedPrompts.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(prompt)}
                      className={`text-left p-4 rounded-xl border text-sm transition-all group ${t.card} ${t.cardHover}`}
                    >
                      <span className="text-green-400 mr-2">→</span>
                      <span className={`group-hover:text-green-400 transition-colors ${t.textMuted}`}>{prompt}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Chat messages */}
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>

              {/* AI avatar */}
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-xl bg-green-500/20 border border-green-500/30 flex items-center justify-center flex-shrink-0 mt-1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="#22c55e" strokeWidth="1.5"/>
                    <path d="M8 12l2 2 4-4" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}

              {/* Message bubble */}
              <div className={`max-w-[80%] ${msg.role === "user" ? "order-first" : ""}`}>
                <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-green-500 text-black font-medium rounded-br-sm"
                    : msg.error
                    ? `border ${darkMode ? "bg-red-500/5 border-red-500/20 text-red-400" : "bg-red-50 border-red-200 text-red-600"}`
                    : `border ${t.card} ${t.textMuted} rounded-bl-sm`
                }`}>
                  {msg.loading ? (
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {[0, 1, 2].map(i => (
                          <div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce"
                            style={{ animationDelay: `${i * 0.15}s` }}
                          />
                        ))}
                      </div>
                      <span className={`text-xs ${t.textFaint}`}>Sentinel AI is thinking…</span>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  )}
                </div>

                {/* Referenced tickers */}
                {msg.role === "assistant" && !msg.loading && msg.tickers.length > 0 && (
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    <span className={`text-[10px] ${t.textFaint}`}>Referenced:</span>
                    {msg.tickers.map(ticker => (
                      <span key={ticker} className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 font-semibold">
                        {ticker}
                      </span>
                    ))}
                  </div>
                )}

                {/* Timestamp */}
                <p className={`text-[10px] mt-1 ${t.textFaint} ${msg.role === "user" ? "text-right" : "text-left"}`}>
                  {new Date(msg.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>

              {/* User avatar */}
              {msg.role === "user" && (
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-1 text-xs font-bold ${darkMode ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-600"}`}>
                  U
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className={`flex-shrink-0 border-t px-4 py-4 ${darkMode ? "border-gray-800 bg-[#0a0e0a]" : "border-gray-200 bg-white"}`}>
        <div className="max-w-2xl mx-auto">

          {/* Quick prompts shown above input when chat has started */}
          {messages.length > 0 && analysedTickers.length > 0 && (
            <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
              {suggestedPrompts.slice(0, 3).map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(prompt)}
                  disabled={isLoading}
                  className={`text-xs px-3 py-1.5 rounded-lg border whitespace-nowrap transition-all flex-shrink-0 ${darkMode ? "border-gray-800 text-gray-500 hover:border-green-500/30 hover:text-green-400" : "border-gray-200 text-gray-400 hover:border-green-400 hover:text-green-600"} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
              placeholder={analysedTickers.length > 0 ? `Ask about ${analysedTickers.map(c => c.ticker).join(", ")}…` : "Analyse a stock first to start chatting…"}
              disabled={isLoading || analysedTickers.length === 0}
              className={`flex-1 border rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors ${t.input} ${t.inputFocus} disabled:opacity-50 disabled:cursor-not-allowed`}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={isLoading || !input.trim() || analysedTickers.length === 0}
              className="bg-green-500 hover:bg-green-400 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed w-12 h-12 rounded-xl flex items-center justify-center transition-all flex-shrink-0"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          </div>

          <p className={`text-[10px] mt-2 text-center ${t.textFaint}`}>
            Sentinel AI only uses data from your analyses · Not financial advice
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Error Page ───────────────────────────────────────────────────────────────

function ErrorPage({ message, onReset, darkMode }: { message: string; onReset: () => void; darkMode: boolean }) {
  const t = darkMode ? darkTheme : lightTheme;
  return (
    <div className={`min-h-screen ${t.bg} ${t.text} font-sans flex flex-col items-center justify-center px-4`}>
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
            <path d="M12 9v4M12 17h.01" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#ef4444" strokeWidth="1.5" fill="none"/>
          </svg>
        </div>
        <h1 className={`text-2xl font-bold mb-2 ${t.text}`}>Something went wrong</h1>
        <p className={`text-sm mb-8 ${t.textMuted}`}>{message}</p>
        <button onClick={onReset} className="bg-green-500 hover:bg-green-400 text-black font-bold px-6 py-3 rounded-xl transition-all">
          Return to Sentinel
        </button>
      </div>
    </div>
  );
}

// ─── Compact Search Bar (shown after first analysis, replacing the hero) ───────

function CompactSearchBar({
  ticker, onTickerChange, onSearch, loading, darkMode,
}: {
  ticker: string;
  onTickerChange: (v: string) => void;
  onSearch: () => void;
  loading: boolean;
  darkMode: boolean;
}) {
  const t = darkMode ? darkTheme : lightTheme;
  return (
    <div className={`sticky top-0 z-40 border-b px-4 py-3 flex items-center gap-3 ${darkMode ? "bg-[#080c08]/95 border-gray-800/60" : "bg-gray-50/95 border-gray-200"} backdrop-blur-sm`}>
      {/* Sentinel wordmark */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="w-6 h-6 rounded-md bg-green-500/20 border border-green-500/40 flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" stroke="#22c55e" strokeWidth="1.5" fill="none"/>
            <path d="M12 8v8M8 10l4-2 4 2" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <span className={`text-xs font-bold tracking-widest ${t.text} hidden sm:inline`}>SENTINEL</span>
      </div>

      <div className={`h-5 w-px ${darkMode ? "bg-gray-800" : "bg-gray-300"} flex-shrink-0`} />

      {/* Compact search */}
      <div className="flex gap-2 flex-1 max-w-sm">
        <select
          className={`flex-1 border rounded-xl pl-3 pr-2 py-2 focus:outline-none transition-colors appearance-none text-xs ${t.input} ${t.inputFocus}`}
          value={ticker}
          onChange={(e) => onTickerChange(e.target.value)}
        >
          <option value="">Change ticker…</option>
          {Object.entries(SUPPORTED_TICKERS).map(([code, name]) => (
            <option key={code} value={code}>{code} — {name}</option>
          ))}
        </select>
        <button
          onClick={onSearch}
          disabled={loading || !ticker}
          className="bg-green-500 hover:bg-green-400 active:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed px-4 py-2 rounded-xl font-bold text-black transition-all text-xs whitespace-nowrap"
        >
          {loading ? "..." : "Analyze"}
        </button>
      </div>

      <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        <span className={`text-[9px] text-green-600 font-medium hidden sm:inline`}>Live</span>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Home() {
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pageError, setPageError] = useState("");
  const [consensus, setConsensus] = useState<NormalisedConsensus | null>(null);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState<HistoryEntry[]>([]);
  const [darkMode, setDarkMode] = useState(true);
  const [activePage, setActivePage] = useState<NavPage>("dashboard");
  const [chatTickers, setChatTickers] = useState<ChatContext[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("sentinel_dark_mode");
      if (stored !== null) setDarkMode(stored === "true");
      setSearchHistory(loadHistory());
    } catch {}
    const handler = (e: ErrorEvent) => setPageError(e.message || "Unknown error");
    window.addEventListener("error", handler);
    return () => window.removeEventListener("error", handler);
  }, []);

  const toggleDark = () => {
    const next = !darkMode;
    setDarkMode(next);
    try { localStorage.setItem("sentinel_dark_mode", String(next)); } catch {}
  };

  const handleSearch = useCallback(async (overrideTicker?: string) => {
    const target = (overrideTicker ?? ticker).trim();
    if (!target) return;
    setActivePage("dashboard");
    setLoading(true);
    setError("");
    setConsensus(null);
    setPriceHistory([]);
    if (overrideTicker) setTicker(overrideTicker);

    try {
      const res = await fetch(`http://localhost:8000/ticker/${target}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: "Server error" }));
        throw new Error(data.detail || `Server returned ${res.status}`);
      }
      const raw: StockConsensus = await res.json();
      const companyName = SUPPORTED_TICKERS[target] || target;
      const norm = normalise(raw, companyName);
      setConsensus(norm);

      const newEntry: HistoryEntry = {
        ticker: target, company: companyName,
        sentiment: norm.overall_sentiment, confidence: norm.confidence_score,
        searchedAt: new Date().toISOString(),
      };
      setSearchHistory(addToHistory(newEntry));

      setChartLoading(true);
      fetchPriceHistory(target).then((history) => {
        setPriceHistory(history);
        setChartLoading(false);
      });

      // Update chat context with all analysed tickers
      setChatTickers(prev => {
        const exists = prev.find(c => c.ticker === norm.ticker);
        if (exists) return prev.map(c => c.ticker === norm.ticker ? {
          ticker: norm.ticker,
          company_name: norm.company_name,
          overall_sentiment: norm.overall_sentiment,
          confidence_score: norm.confidence_score,
          bull_case: norm.bull_case,
          bear_case: norm.bear_case,
          risk_rating: norm.risk_rating,
          accounting_perspective: norm.accounting_perspective,
          market_psychology_perspective: norm.market_psychology_perspective,
        } : c);
        return [...prev, {
          ticker: norm.ticker,
          company_name: norm.company_name,
          overall_sentiment: norm.overall_sentiment,
          confidence_score: norm.confidence_score,
          bull_case: norm.bull_case,
          bear_case: norm.bear_case,
          risk_rating: norm.risk_rating,
          accounting_perspective: norm.accounting_perspective,
          market_psychology_perspective: norm.market_psychology_perspective,
        }];
      });

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch consensus. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  const t = darkMode ? darkTheme : lightTheme;

  // Whether we're in a "post-search" state — hero should be hidden
  const hasSearched = consensus !== null || loading;

  const sentimentColor = (s: "bullish" | "bearish" | "neutral") =>
    s === "bullish" ? "text-green-400" : s === "bearish" ? "text-red-400" : "text-yellow-400";

  const riskColor = (r: "low" | "medium" | "high") =>
    r === "low" ? "text-green-400" : r === "high" ? "text-red-400" : "text-yellow-400";

  if (pageError) return <ErrorPage message={pageError} onReset={() => setPageError("")} darkMode={darkMode} />;

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} font-sans flex`}>

      {/* Sidebar */}
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        darkMode={darkMode}
        onToggleDark={toggleDark}
        onHome={() => { setConsensus(null); setError(""); setTicker(""); setActivePage("dashboard"); }}
      />

      {/* Main content — offset for sidebar */}
      <div className="flex-1 ml-16 min-h-screen flex flex-col">

        {/* ── Non-dashboard pages ── */}
        {activePage === "watchlist" && (
          <div className="flex-1">
            <WatchlistPage
              darkMode={darkMode}
              onAnalyze={(t) => handleSearch(t)}
              searchHistory={searchHistory}
            />
          </div>
        )}
        {activePage === "news" && (
          <div className="flex-1">
            <NewsFeedPage darkMode={darkMode} lastAnalysed={consensus} />
          </div>
        )}
        {activePage === "settings" && (
          <div className="flex-1">
            <SettingsPage
              darkMode={darkMode}
              onToggleDark={toggleDark}
              onClearHistory={() => setSearchHistory([])}
            />
          </div>
        )}

        {activePage === "chat" && (
          <div className="flex-1 overflow-hidden">
            <AIChatPage
              darkMode={darkMode}
              analysedTickers={chatTickers}
              onAnalyze={(t) => { handleSearch(t); setActivePage("dashboard"); }}
            />
          </div>
        )}

        {/* ── Dashboard ── */}
        {activePage === "dashboard" && (
          <>
            {/* ── HERO — only shown on landing (before any search) ── */}
            {/* ── HERO — only shown on landing (before any search) ── */}
            {/* ── HERO — only shown on landing (before any search) ── */}
            {/* ── HERO — only shown on landing (before any search) ── */}
            {!hasSearched && (
              <div className="relative min-h-[500px] flex items-center justify-center overflow-hidden">
                {/* Background image - different for dark and light mode */}
                <div className="absolute inset-0 w-full h-full pointer-events-none">
                  <Image 
                    src={darkMode ? "/candle.png" : "/candle1.png"} 
                    alt="Market candles background" 
                    fill 
                    className="object-cover object-center"
                    style={{ opacity: darkMode ? 0.1 : 0.2 }}
                    priority 
                  />
                </div>

                <div className="relative z-10 text-center px-4 w-full max-w-3xl mx-auto">
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border mb-6 backdrop-blur-sm ${
                    darkMode 
                      ? "bg-green-500/10 border-green-500/20" 
                      : "bg-green-500/10 border-green-500/20"
                  }`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[11px] font-medium text-green-600 dark:text-green-400">
                      AI-Powered Market Intelligence
                    </span>
                  </div>

                  <h1 className={`text-5xl md:text-6xl font-bold tracking-tight mb-4 ${
                    darkMode ? "text-white" : "text-gray-900"
                  }`}>
                    Market Sentiment
                    <span className="text-green-600 dark:text-green-500"> Analyzer</span>
                  </h1>

                  <p className={`text-base md:text-lg max-w-xl mx-auto mb-10 ${
                    darkMode ? "text-gray-400" : "text-gray-600"
                  }`}>
                    AI-powered insights for smarter investment decisions
                  </p>

                  <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                    <div className="relative flex-1">
                      <span className={`absolute left-4 top-1/2 -translate-y-1/2 text-sm ${
                        darkMode ? "text-gray-500" : "text-gray-400"
                      }`}>🔍</span>
                      <select
                        className={`w-full border rounded-xl pl-10 pr-4 py-4 focus:outline-none transition-colors appearance-none text-sm ${
                          darkMode 
                            ? "bg-[#111111] border-[#222222] text-white placeholder-gray-500 focus:border-green-500/60" 
                            : "bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-green-500"
                        }`}
                        value={ticker}
                        onChange={(e) => setTicker(e.target.value)}
                      >
                        <option value="">Search for a company or stock (e.g. Apple, Amazon)</option>
                        {Object.entries(SUPPORTED_TICKERS).map(([code, name]) => (
                          <option key={code} value={code}>{code} — {name}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={() => handleSearch()}
                      disabled={loading || !ticker}
                      className="bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed px-8 py-4 rounded-xl font-bold text-white transition-all text-sm whitespace-nowrap"
                    >
                      {loading ? "Analysing..." : "Analyze"}
                    </button>
                  </div>

                  <div className="flex flex-wrap justify-center gap-3 mt-8">
                    {TRENDING.map((tkr) => (
                      <button
                        key={tkr}
                        onClick={() => handleSearch(tkr)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          darkMode 
                            ? "bg-white/5 hover:bg-white/10 text-gray-300" 
                            : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                        }`}
                      >
                        {tkr}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── COMPACT SEARCH BAR — replaces hero once analysis starts ── */}
            {hasSearched && (
              <CompactSearchBar
                ticker={ticker}
                onTickerChange={setTicker}
                onSearch={() => handleSearch()}
                loading={loading}
                darkMode={darkMode}
              />
            )}

            {/* Trending + History — shown only on landing before any search */}
            {!hasSearched && !loading && (
              <>
                <TrendingCards onSelect={handleSearch} darkMode={darkMode} />
                <SearchHistoryPanel history={searchHistory} onSelect={handleSearch} darkMode={darkMode} />
              </>
            )}

            <div className="max-w-6xl mx-auto w-full px-4 pb-16">

              {/* AI Analysis Log while loading */}
              {loading && (
                <AIAnalysisLog ticker={ticker || "—"} darkMode={darkMode} />
              )}

              {/* Skeleton while loading */}
              {loading && <SkeletonResults darkMode={darkMode} />}

              {/* Error */}
              {error && !loading && (
                <div className={`mt-6 rounded-2xl overflow-hidden border ${darkMode ? "border-red-500/20 bg-red-500/5" : "border-red-200 bg-red-50"}`}>
                  <div className="flex items-start gap-4 p-6">
                    <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M12 9v4M12 17h.01" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#ef4444" strokeWidth="1.5" fill="none"/>
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-red-400 font-semibold text-sm mb-1">Analysis Failed</p>
                      <p className="text-red-400/70 text-sm">{error}</p>
                      <p className={`text-xs mt-2 ${t.textFaint}`}>Check that your backend server is running at localhost:8000</p>
                    </div>
                    <button onClick={() => setError("")} className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center text-red-400 transition-colors text-xs">✕</button>
                  </div>
                </div>
              )}

              {/* Results */}
              {consensus && !loading && (
                <div className="space-y-4 mt-2">

                  {/* Company Header — clean, no hero */}
                  <div className="flex items-center justify-between pt-4 pb-2">
                    <div>
                      <h2 className={`text-2xl font-bold ${t.text}`}>{consensus.company_name}</h2>
                      <p className={`text-sm mt-0.5 ${t.textFaint}`}>
                        {consensus.ticker} · analysed {timeAgo(searchHistory[0]?.searchedAt || new Date().toISOString())}
                      </p>
                    </div>
                    {/* Add to watchlist shortcut */}
                    <button
                      onClick={() => {
                        const wl = loadWatchlist();
                        if (!wl.find(w => w.ticker === consensus.ticker)) {
                          const updated = [...wl, {
                            ticker: consensus.ticker,
                            company: consensus.company_name,
                            addedAt: new Date().toISOString(),
                            sentiment: consensus.overall_sentiment,
                            confidence: consensus.confidence_score,
                          }];
                          saveWatchlist(updated);
                        }
                        setActivePage("watchlist");
                      }}
                      className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl border transition-all ${darkMode ? "border-gray-800 text-gray-500 hover:border-green-500/30 hover:text-green-400" : "border-gray-200 text-gray-400 hover:border-green-400 hover:text-green-600"}`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
                      Add to Watchlist
                    </button>
                  </div>

                  {/* Price Chart */}
                  <BigPriceChart
                    priceHistory={priceHistory}
                    ticker={consensus.ticker}
                    sentiment={consensus.overall_sentiment}
                    sentimentScore={consensus.confidence_score}
                    chartLoading={chartLoading}
                    darkMode={darkMode}
                  />

                  {/* 3-Column Metric Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

                    {/* Sentiment */}
                    <div className={`rounded-2xl border p-6 transition-all ${t.card} ${t.cardHover}`}>
                      <p className={`text-xs uppercase tracking-widest mb-4 ${t.textFaint}`}>Overall Sentiment</p>
                      <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl ${
                          consensus.overall_sentiment === "bullish" ? "bg-green-500/10 border border-green-500/20"
                          : consensus.overall_sentiment === "bearish" ? "bg-red-500/10 border border-red-500/20"
                          : "bg-yellow-500/10 border border-yellow-500/20"
                        }`}>
                          
                          <Image
                            src={
                              consensus.overall_sentiment === "bullish" ? "/bullnew.png"
                              : consensus.overall_sentiment === "bearish" ? "/bearnew.png"
                              : "/neutralnew.png"
                            }
                            alt={consensus.overall_sentiment}
                            width={40}
                            height={40}
                            className="object-contain"
                          />

                        </div>
                        <div>
                          <div className={`text-2xl font-bold capitalize ${sentimentColor(consensus.overall_sentiment)}`}>
                            {consensus.overall_sentiment}
                          </div>
                          <div className={`text-xs mt-0.5 ${t.textFaint}`}>
                            {consensus.overall_sentiment === "bullish" ? "Market outlook positive" : consensus.overall_sentiment === "bearish" ? "Market outlook negative" : "Market outlook mixed"}
                          </div>
                          <div className="mt-3 space-y-1">
                            {consensus.bull_case.slice(0, 2).map((point, i) => (
                              <div key={i} className="flex items-center gap-1.5">
                                <span className="text-green-500 text-[10px] font-bold">✓</span>
                                <span className={`text-[10px] leading-tight ${t.textFaint}`}>{point.split(" ").slice(0, 5).join(" ")}…</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Confidence */}
                    <div className={`rounded-2xl border p-6 transition-all ${t.card} ${t.cardHover}`}>
                      <div className="flex items-center gap-2 mb-4">
                        <p className={`text-xs uppercase tracking-widest ${t.textFaint}`}>Confidence Score</p>
                        <InfoTooltip darkMode={darkMode} content="How strongly the news sources agree with each other. 100% = complete agreement, 0% = completely split. Above 70% = high confidence in the direction." />
                      </div>
                      <div className={`text-5xl font-bold mb-4 ${t.text}`}>
                        {Math.round(consensus.confidence_score * 100)}
                        <span className={`text-2xl ${t.textFaint}`}>%</span>
                      </div>
                      <div className={`w-full rounded-full h-1.5 mb-2 ${darkMode ? "bg-gray-800/60" : "bg-gray-200"}`}>
                        <div className="h-1.5 rounded-full bg-gradient-to-r from-green-600 to-green-400 transition-all duration-700"
                          style={{ width: `${consensus.confidence_score * 100}%` }} />
                      </div>
                      <p className={`text-xs ${t.textFaint}`}>
                        {consensus.confidence_score >= 0.7 ? "High Confidence" : consensus.confidence_score >= 0.4 ? "Moderate Confidence" : "Low Confidence"}
                      </p>
                    </div>

                    {/* Risk */}
                    <div className={`rounded-2xl border p-6 transition-all ${t.card} ${t.cardHover}`}>
                      <div className="flex items-center gap-2 mb-4">
                        <p className={`text-xs uppercase tracking-widest ${t.textFaint}`}>Risk Rating</p>
                        <InfoTooltip darkMode={darkMode} content="Structural risk based on the AI's analysis of debt levels, earnings volatility, market sentiment extremes, and news uncertainty. Low = stable. Medium = mixed signals. High = elevated concern." />
                      </div>
                      <div className={`text-5xl font-bold capitalize mb-4 ${riskColor(consensus.risk_rating)}`}>
                        {consensus.risk_rating}
                      </div>
                      <div className="relative w-full h-1.5 rounded-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500">
                        <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg border-2 border-gray-900 transition-all duration-700"
                          style={{ left: consensus.risk_rating === "low" ? "12%" : consensus.risk_rating === "high" ? "88%" : "50%" }} />
                      </div>
                      <div className={`flex justify-between text-[10px] mt-2 ${t.textFaint}`}>
                        <span>Low</span><span>Medium</span><span>High</span>
                      </div>
                    </div>
                  </div>

                  {/* Market Psychology + Accounting */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className={`rounded-2xl border p-6 transition-all ${t.card} ${t.cardHover}`}>
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-6 h-6 rounded-md bg-green-500/20 flex items-center justify-center">
                          <span className="text-green-400 text-xs">✦</span>
                        </div>
                        <h3 className={`font-semibold text-sm uppercase tracking-widest ${t.textMuted}`}>Market Psychology</h3>
                        <InfoTooltip darkMode={darkMode} content="Analyses crowd behaviour, social sentiment, and emotional drivers. Looks at FOMO cycles, fear indicators, and institutional accumulation patterns." />
                      </div>
                      <p className={`leading-relaxed text-sm ${t.textMuted}`}>{consensus.market_psychology_perspective}</p>
                    </div>

                    <div className={`rounded-2xl border p-6 transition-all ${t.card} ${t.cardHover}`}>
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-6 h-6 rounded-md bg-blue-500/20 flex items-center justify-center">
                          <span className="text-blue-400 text-xs">◈</span>
                        </div>
                        <h3 className={`font-semibold text-sm uppercase tracking-widest ${t.textMuted}`}>Accounting Perspective</h3>
                        <InfoTooltip darkMode={darkMode} content="Evaluates financial health through fundamentals — revenue growth, profit margins, debt-to-equity ratio, cash flow, and earnings consistency." />
                      </div>
                      <p className={`leading-relaxed text-sm ${t.textMuted}`}>{consensus.accounting_perspective}</p>
                    </div>
                  </div>

                  {/* Bull vs Bear */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className={`rounded-2xl border p-6 transition-all ${t.bullBg} ${t.cardHover}`}>
                      <div className="flex items-center gap-2 mb-5">
                        <span className="text-green-400 text-lg font-bold">↗</span>
                        <h3 className="font-bold text-green-400 uppercase tracking-widest text-sm">Positive Factors</h3>
                      </div>
                      <ul className="space-y-3">
                        {consensus.bull_case.map((point, i) => (
                          <li key={i} className="flex gap-3 text-sm leading-snug">
                            <span className="text-green-500 mt-0.5 flex-shrink-0 font-bold">✓</span>
                            <span className={`${t.textMuted}`}>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className={`rounded-2xl border p-6 transition-all ${t.bearBg} ${t.cardHover}`}>
                      <div className="flex items-center gap-2 mb-5">
                        <span className="text-red-400 text-lg font-bold">↘</span>
                        <h3 className="font-bold text-red-400 uppercase tracking-widest text-sm">Negative Factors</h3>
                      </div>
                      <ul className="space-y-3">
                        {consensus.bear_case.map((point, i) => (
                          <li key={i} className="flex gap-3 text-sm leading-snug">
                            <span className="text-red-500 mt-0.5 flex-shrink-0 font-bold">✗</span>
                            <span className={`${t.textMuted}`}>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Key News Sources */}
                  {consensus.key_news_sources && consensus.key_news_sources.length > 0 && (
                    <div className={`rounded-2xl border p-6 transition-all ${t.card} ${t.cardHover}`}>
                      <div className="flex items-center gap-2 mb-5">
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center ${darkMode ? "bg-gray-800" : "bg-gray-100"}`}>
                          <span className={`text-xs ${t.textFaint}`}>▤</span>
                        </div>
                        <h3 className={`font-semibold text-sm uppercase tracking-widest ${t.textMuted}`}>Key News Sources</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ml-auto ${darkMode ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-500"}`}>
                          {consensus.key_news_sources.length} sources
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {consensus.key_news_sources.map((sourceUrl, i) => (
                          <div
                            key={i}
                            onClick={() => window.open(sourceUrl, "_blank")}
                            className={`rounded-xl p-4 cursor-pointer group transition-all border ${darkMode ? "bg-[#0a0e0a] border-gray-800/60 hover:border-green-500/40 hover:bg-[#0a120a]" : "bg-gray-50 border-gray-200 hover:border-green-400/50 hover:bg-green-50/50"}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${darkMode ? "bg-gray-800 text-gray-300 group-hover:bg-green-500/20 group-hover:text-green-400" : "bg-gray-200 text-gray-500 group-hover:bg-green-100 group-hover:text-green-600"}`}>
                                {extractDomain(sourceUrl).charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className={`text-xs truncate transition-colors ${darkMode ? "text-gray-400 group-hover:text-green-400" : "text-gray-500 group-hover:text-green-600"}`}>
                                  {extractDomain(sourceUrl)}
                                </p>
                                <p className={`text-[10px] truncate ${t.textFaint}`}>{sourceUrl}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}