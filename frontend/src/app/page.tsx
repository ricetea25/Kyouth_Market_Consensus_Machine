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
  navbar: "bg-[#0e1015]/95 border-[#1e2229]",
};

const lightTheme = {
  bg: "bg-[#f0ebe4]",
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
  navbar: "bg-[#f0ebe4]/95 border-[#d4cec6]",
};

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
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${darkMode ? "bg-[#1e2229] text-[#4a5168]" : "bg-[#ddd8d0] text-[#9c9690]"}`}>{history.length}</span>
        <div className={`flex-1 h-px ${darkMode ? "bg-[#1e2229]" : "bg-[#d4cec6]"}`} />
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
    <div className={`rounded-xl p-3 shadow-2xl text-xs border ${darkMode ? "bg-[#181b22] border-[#1e2229]" : "bg-white border-[#ddd8d0]"}`}>
      <p className={`font-semibold mb-2 ${darkMode ? "text-[#8b92a5]" : "text-[#5c5650]"}`}>{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
          <span className={darkMode ? "text-[#8b92a5]" : "text-[#5c5650]"}>{entry.name}:</span>
          <span className={`font-bold ${darkMode ? "text-[#e8eaf0]" : "text-[#1a1814]"}`}>
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
        <div className={`flex rounded-xl p-1 gap-1 self-start border ${darkMode ? "bg-[#0e1015] border-[#1e2229]" : "bg-[#e8e2da] border-[#d4cec6]"}`}>
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
              <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#1e2229" : "#ddd8d0"} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: darkMode ? "#4a5168" : "#9c9690", fontSize: 10 }} axisLine={false} tickLine={false} interval={Math.floor(priceHistory.length / 6)} />
              {activeView !== "volume" && (
                <YAxis yAxisId="main" domain={["auto", "auto"]} tick={{ fill: darkMode ? "#4a5168" : "#9c9690", fontSize: 10 }} axisLine={false} tickLine={false} width={55}
                  tickFormatter={(v: number) => activeView === "price" ? `$${v}` : `${v}%`} />
              )}
              {activeView === "volume" && (
                <YAxis yAxisId="vol" tick={{ fill: darkMode ? "#4a5168" : "#9c9690", fontSize: 10 }} axisLine={false} tickLine={false} width={45} tickFormatter={(v: number) => `${v}M`} />
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
                <Area yAxisId="main" type="monotone" dataKey="price" name="Price" stroke={priceColor} strokeWidth={2} fill="url(#priceAreaGrad)" dot={false} activeDot={{ r: 4, fill: priceColor, stroke: darkMode ? "#181b22" : "#fff", strokeWidth: 2 }} />
              )}
              {activeView === "change" && (
                <Line yAxisId="main" type="monotone" dataKey="change" name="% Change" stroke={changeColor} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: changeColor, stroke: darkMode ? "#181b22" : "#fff", strokeWidth: 2 }} />
              )}
              {activeView === "volume" && (
                <Bar yAxisId="vol" dataKey="volume" name="Volume" fill="#6366f1" opacity={0.7} radius={[2, 2, 0, 0]} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {!chartLoading && priceHistory.length > 0 && (
        <div className={`grid grid-cols-3 gap-3 mt-4 pt-4 border-t ${darkMode ? "border-[#1e2229]" : "border-[#ddd8d0]"}`}>
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

const AI_STEPS = [
  { label: "Connecting to backend", detail: "localhost:8000/ticker/{ticker}", duration: 400 },
  { label: "Fetching live news sources", detail: "Scanning financial feeds & press releases", duration: 900 },
  { label: "Running sentiment analysis", detail: "AI scoring each source independently", duration: 700 },
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
          <p className={`text-xs ${t.textFaint}`}>Ticker: {ticker}</p>
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
                : `border ${darkMode ? "border-[#1e2229] text-[#4a5168]" : "border-[#d4cec6] text-[#9c9690]"}`
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

// ─── Compact Search Bar ───────────────────────────────────────────────────────

function CompactSearchBar({
  ticker, onTickerChange, onSearch, loading, darkMode, onToggleDark,
}: {
  ticker: string;
  onTickerChange: (v: string) => void;
  onSearch: () => void;
  loading: boolean;
  darkMode: boolean;
  onToggleDark: () => void;
}) {
  const t = darkMode ? darkTheme : lightTheme;
  return (
    <div className={`sticky top-0 z-40 border-b px-4 py-3 flex items-center gap-3 ${t.navbar} backdrop-blur-sm`}>
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="w-6 h-6 rounded-md bg-green-500/20 border border-green-500/40 flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" stroke="#22c55e" strokeWidth="1.5" fill="none"/>
            <path d="M12 8v8M8 10l4-2 4 2" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <span className={`text-xs font-bold tracking-widest ${t.text} hidden sm:inline`}>SENTINEL</span>
      </div>

      <div className={`h-5 w-px ${darkMode ? "bg-[#1e2229]" : "bg-[#d4cec6]"} flex-shrink-0`} />

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
          className="bg-green-500 hover:bg-green-400 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed px-4 py-2 rounded-xl font-bold text-black transition-all text-xs whitespace-nowrap"
        >
          {loading ? "..." : "Analyze"}
        </button>
      </div>

      <div className="ml-auto flex items-center gap-3 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className={`text-[9px] text-green-600 font-medium hidden sm:inline`}>Live</span>
        </div>
        {/* Dark/Light toggle */}
        <button
          onClick={onToggleDark}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${darkMode ? "bg-[#1e2229] text-[#8b92a5] hover:text-green-400" : "bg-[#ddd8d0] text-[#5c5650] hover:text-green-600"}`}
        >
          {darkMode ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.5"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch consensus. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  const t = darkMode ? darkTheme : lightTheme;
  const hasSearched = consensus !== null || loading;

  const sentimentColor = (s: "bullish" | "bearish" | "neutral") =>
    s === "bullish" ? "text-green-400" : s === "bearish" ? "text-red-400" : "text-yellow-400";

  const riskColor = (r: "low" | "medium" | "high") =>
    r === "low" ? "text-green-400" : r === "high" ? "text-red-400" : "text-yellow-400";

  if (pageError) return <ErrorPage message={pageError} onReset={() => setPageError("")} darkMode={darkMode} />;

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} font-sans`}>

      {/* ── HERO — shown before any search ── */}
      {!hasSearched && (
        <div className="relative min-h-[500px] flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 w-full h-full pointer-events-none">
            <Image
              src={darkMode ? "/candle.png" : "/candle1.png"}
              alt="Market candles background"
              fill
              className="object-cover object-center"
              style={{ opacity: darkMode ? 0.1 : 0.3 }}
              priority
            />
          </div>

          {/* Dark/Light toggle — top right of hero */}
          <div className="absolute top-4 right-4 z-20 flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[9px] text-green-500 font-medium">Live Analysis</span>
            </div>
            <button
              onClick={toggleDark}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all border ${darkMode ? "bg-[#1e2229]/80 border-[#1e2229] text-[#8b92a5] hover:text-green-400 hover:border-green-500/30" : "bg-white/80 border-[#d4cec6] text-[#5c5650] hover:text-green-600 hover:border-green-400"} backdrop-blur-sm`}
            >
              {darkMode ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.5"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
              )}
            </button>
          </div>

          {/* Logo — top left */}
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-500/20 border border-green-500/40 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" stroke="#22c55e" strokeWidth="1.5" fill="none"/>
                <path d="M12 8v8M8 10l4-2 4 2" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div className={`text-xs font-bold tracking-widest ${t.text}`}>SENTINEL</div>
              <div className={`text-[9px] ${t.textFaint} -mt-0.5`}>AI Market Sentiment</div>
            </div>
          </div>

          <div className="relative z-10 text-center px-4 w-full max-w-3xl mx-auto">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border mb-6 backdrop-blur-sm ${
              darkMode ? "bg-green-500/10 border-green-500/20" : "bg-green-500/10 border-green-500/20"
            }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[11px] font-medium text-green-500">AI-Powered Market Intelligence</span>
            </div>

            <h1 className={`text-5xl md:text-6xl font-bold tracking-tight mb-4 ${t.text}`}>
              Market Sentiment
              <span className="text-green-500"> Analyzer</span>
            </h1>

            <p className={`text-base md:text-lg max-w-xl mx-auto mb-10 ${t.textMuted}`}>
              AI-powered insights for smarter investment decisions
            </p>

            <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <div className="relative flex-1">
                <span className={`absolute left-4 top-1/2 -translate-y-1/2 text-sm ${t.textFaint}`}>🔍</span>
                <select
                  className={`w-full border rounded-xl pl-10 pr-4 py-4 focus:outline-none transition-colors appearance-none text-sm ${t.input} ${t.inputFocus}`}
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                >
                  <option value="">Search for a company or stock…</option>
                  {Object.entries(SUPPORTED_TICKERS).map(([code, name]) => (
                    <option key={code} value={code}>{name} ({code})</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => handleSearch()}
                disabled={loading || !ticker}
                className="bg-green-500 hover:bg-green-400 active:bg-green-600 disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed px-8 py-4 rounded-xl font-bold text-black transition-all text-sm whitespace-nowrap"
              >
                {loading ? "Analysing..." : "Analyze"}
              </button>
            </div>

            <div className="flex flex-wrap justify-center gap-2 mt-6">
              {TRENDING.map((tkr) => (
                <button
                  key={tkr}
                  onClick={() => handleSearch(tkr)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    darkMode
                      ? "bg-[#1e2229]/60 border-[#1e2229] text-[#8b92a5] hover:border-green-500/30 hover:text-green-400"
                      : "bg-white/60 border-[#d4cec6] text-[#5c5650] hover:border-green-400 hover:text-green-600"
                  } backdrop-blur-sm`}
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
          onToggleDark={toggleDark}
        />
      )}

      {/* Trending + History — landing only */}
      {!hasSearched && !loading && (
        <>
          <TrendingCards onSelect={handleSearch} darkMode={darkMode} />
          <SearchHistoryPanel history={searchHistory} onSelect={handleSearch} darkMode={darkMode} />
        </>
      )}

      <div className="max-w-6xl mx-auto w-full px-4 pb-16">

        {/* AI Analysis Log */}
        {loading && <AIAnalysisLog ticker={ticker || "—"} darkMode={darkMode} />}

        {/* Skeleton */}
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

            {/* Company Header */}
            <div className="flex items-center justify-between pt-4 pb-2">
              <div>
                <h2 className={`text-2xl font-bold ${t.text}`}>{consensus.company_name}</h2>
                <p className={`text-sm mt-0.5 ${t.textFaint}`}>
                  {consensus.ticker} · analysed {timeAgo(searchHistory[0]?.searchedAt || new Date().toISOString())}
                </p>
              </div>
              <button
                onClick={() => { setConsensus(null); setError(""); setTicker(""); }}
                className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl border transition-all ${darkMode ? "border-[#1e2229] text-[#4a5168] hover:border-green-500/30 hover:text-green-400" : "border-[#d4cec6] text-[#9c9690] hover:border-green-400 hover:text-green-600"}`}
              >
                ← New Search
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
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
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
                <div className={`w-full rounded-full h-1.5 mb-2 ${darkMode ? "bg-[#1e2229]" : "bg-[#ddd8d0]"}`}>
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
                      <span className={t.textMuted}>{point}</span>
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
                      <span className={t.textMuted}>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Key News Sources */}
            {consensus.key_news_sources && consensus.key_news_sources.length > 0 && (
              <div className={`rounded-2xl border p-6 transition-all ${t.card} ${t.cardHover}`}>
                <div className="flex items-center gap-2 mb-5">
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center ${darkMode ? "bg-[#1e2229]" : "bg-[#ddd8d0]"}`}>
                    <span className={`text-xs ${t.textFaint}`}>▤</span>
                  </div>
                  <h3 className={`font-semibold text-sm uppercase tracking-widest ${t.textMuted}`}>Key News Sources</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ml-auto ${darkMode ? "bg-[#1e2229] text-[#8b92a5]" : "bg-[#ddd8d0] text-[#5c5650]"}`}>
                    {consensus.key_news_sources.length} sources
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {consensus.key_news_sources.map((sourceUrl, i) => (
                    <div
                      key={i}
                      onClick={() => window.open(sourceUrl, "_blank")}
                      className={`rounded-xl p-4 cursor-pointer group transition-all border ${darkMode ? "bg-[#0e1015] border-[#1e2229] hover:border-green-500/30 hover:bg-[#0f1a12]" : "bg-[#ede8e1] border-[#d4cec6] hover:border-green-400/50 hover:bg-[#eaf2ec]"}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${darkMode ? "bg-[#1e2229] text-[#8b92a5] group-hover:bg-green-500/20 group-hover:text-green-400" : "bg-[#ddd8d0] text-[#5c5650] group-hover:bg-green-100 group-hover:text-green-600"}`}>
                          {extractDomain(sourceUrl).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-xs truncate transition-colors ${darkMode ? "text-[#8b92a5] group-hover:text-green-400" : "text-[#5c5650] group-hover:text-green-600"}`}>
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
    </div>
  );
}