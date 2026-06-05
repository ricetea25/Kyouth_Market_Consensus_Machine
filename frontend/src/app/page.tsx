"use client";

import { useState, useEffect } from "react";
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
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {}
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

// ─── helpers ────────────────────────────────────────────────────────────────

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
  return text
    .split(/\.\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10)
    .map((s) => (s.endsWith(".") ? s : s + "."));
}

function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace("www.", "");
  } catch {
    return url;
  }
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
  } catch {
    return [];
  }
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0f140f] border border-gray-700 rounded-xl p-3 shadow-2xl text-xs">
      <p className="text-gray-400 font-semibold mb-2">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-400">{entry.name}:</span>
          <span className="text-white font-bold">
            {entry.name === "Price" ? `$${entry.value.toFixed(2)}`
              : entry.name === "Volume" ? `${entry.value}M`
              : `${entry.value > 0 ? "+" : ""}${entry.value}%`}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Big Price Chart (top of results) ────────────────────────────────────────

function BigPriceChart({
  priceHistory,
  ticker,
  sentiment,
  sentimentScore,
  chartLoading,
}: {
  priceHistory: PricePoint[];
  ticker: string;
  sentiment: "bullish" | "bearish" | "neutral";
  sentimentScore: number;
  chartLoading: boolean;
}) {
  const [activeView, setActiveView] = useState<"price" | "change" | "volume">("price");

  const sentimentLineColor =
    sentiment === "bullish" ? "#22c55e" : sentiment === "bearish" ? "#ef4444" : "#eab308";
  const priceColor = "#22c55e";
  const changeColor = "#f59e0b";

  const latestPrice = priceHistory[priceHistory.length - 1]?.price ?? 0;
  const firstPrice = priceHistory[0]?.price ?? 0;
  const totalChange = priceHistory.length > 0
    ? ((latestPrice - firstPrice) / firstPrice * 100).toFixed(2)
    : "0.00";
  const isPositive = parseFloat(totalChange) >= 0;

  const high90 = priceHistory.length > 0 ? Math.max(...priceHistory.map(p => p.price)) : 0;
  const low90 = priceHistory.length > 0 ? Math.min(...priceHistory.map(p => p.price)) : 0;

  return (
    <div className="bg-[#0f140f] border border-gray-800 rounded-2xl p-6">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h3 className="font-bold text-white text-base uppercase tracking-widest">{ticker}</h3>
            {!chartLoading && priceHistory.length > 0 && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isPositive ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                {isPositive ? "▲" : "▼"} {Math.abs(parseFloat(totalChange))}% (90d)
              </span>
            )}
          </div>
          {!chartLoading && priceHistory.length > 0 ? (
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white">${latestPrice.toFixed(2)}</span>
              <span className="text-gray-500 text-xs">Current Price</span>
            </div>
          ) : (
            <div className="h-9 w-32 bg-gray-800/50 rounded-lg animate-pulse" />
          )}
          <div className="flex items-center gap-2 mt-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: sentimentLineColor }} />
            <span className="text-xs text-gray-500">
              AI Sentiment:{" "}
              <span style={{ color: sentimentLineColor }} className="font-semibold capitalize">{sentiment}</span>
              {" "}·{" "}
              <span style={{ color: sentimentLineColor }}>{Math.round(sentimentScore * 100)}% confidence</span>
            </span>
          </div>
        </div>

        {/* View switcher */}
        <div className="flex bg-[#0a0e0a] border border-gray-800 rounded-xl p-1 gap-1 self-start">
          {(["price", "change", "volume"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setActiveView(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${
                activeView === v
                  ? "bg-green-500/20 text-green-400 border border-green-500/30"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {v === "change" ? "% Change" : v === "volume" ? "Volume" : "Price"}
            </button>
          ))}
        </div>
      </div>

      {/* Chart area */}
      {chartLoading ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <div className="relative w-10 h-10">
            <div className="w-10 h-10 border-2 border-green-500/20 rounded-full" />
            <div className="w-10 h-10 border-2 border-green-500 border-t-transparent rounded-full animate-spin absolute inset-0" />
          </div>
          <p className="text-gray-600 text-xs">Loading price data…</p>
        </div>
      ) : priceHistory.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-600 text-sm">Price data unavailable</p>
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
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2a1f" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: "#4b5563", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={Math.floor(priceHistory.length / 6)}
              />
              {activeView !== "volume" && (
                <YAxis
                  yAxisId="main"
                  domain={["auto", "auto"]}
                  tick={{ fill: "#4b5563", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={55}
                  tickFormatter={(v: number) => activeView === "price" ? `$${v}` : `${v}%`}
                />
              )}
              {activeView === "volume" && (
                <YAxis
                  yAxisId="vol"
                  tick={{ fill: "#4b5563", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={45}
                  tickFormatter={(v: number) => `${v}M`}
                />
              )}
              <Tooltip content={<ChartTooltip />} />
              {activeView === "change" && (
                <ReferenceLine yAxisId="main" y={0} stroke="#374151" strokeDasharray="4 2" />
              )}
              {activeView === "price" && (
                <Area
                  yAxisId="main"
                  type="monotone"
                  dataKey="price"
                  name="Price"
                  stroke={priceColor}
                  strokeWidth={2}
                  fill="url(#priceAreaGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: priceColor, stroke: "#0f140f", strokeWidth: 2 }}
                />
              )}
              {activeView === "change" && (
                <Line
                  yAxisId="main"
                  type="monotone"
                  dataKey="change"
                  name="% Change"
                  stroke={changeColor}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: changeColor, stroke: "#0f140f", strokeWidth: 2 }}
                />
              )}
              {activeView === "volume" && (
                <Bar
                  yAxisId="vol"
                  dataKey="volume"
                  name="Volume"
                  fill="#6366f1"
                  opacity={0.7}
                  radius={[2, 2, 0, 0]}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Stats strip */}
      {!chartLoading && priceHistory.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-800/60">
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
              <p className="text-[10px] text-gray-600 mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Info Tooltip ─────────────────────────────────────────────────────────────

function InfoTooltip({ content }: { content: string }) {
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
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-56 bg-[#1a221a] border border-gray-700 rounded-xl p-3 text-[11px] text-gray-300 leading-relaxed shadow-2xl z-50 pointer-events-none">
          {content}
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#1a221a] border-r border-b border-gray-700 rotate-45" />
        </div>
      )}
    </div>
  );
}

// ─── Search History Panel ─────────────────────────────────────────────────────

function SearchHistoryPanel({
  history,
  onSelect,
}: {
  history: HistoryEntry[];
  onSelect: (ticker: string) => void;
}) {
  if (history.length === 0) return null;

  const sentimentBg = (s: "bullish" | "bearish" | "neutral") => {
    if (s === "bullish") return "bg-green-500/10 border-green-500/20";
    if (s === "bearish") return "bg-red-500/10 border-red-500/20";
    return "bg-yellow-500/10 border-yellow-500/20";
  };

  const sentimentDot = (s: "bullish" | "bearish" | "neutral") => {
    if (s === "bullish") return "bg-green-400";
    if (s === "bearish") return "bg-red-400";
    return "bg-yellow-400";
  };

  const sentimentTextColor = (s: "bullish" | "bearish" | "neutral") => {
    if (s === "bullish") return "text-green-400";
    if (s === "bearish") return "text-red-400";
    return "text-yellow-400";
  };

  function timeAgo(isoString: string): string {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 pt-2 pb-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs uppercase tracking-widest">Recent Searches</span>
          <span className="text-[10px] bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded-full">{history.length}</span>
        </div>
        <div className="flex-1 h-px bg-gray-800/60" />
        <span className="text-[10px] text-gray-700">Shared across all users</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {history.map((entry) => (
          <button
            key={entry.ticker}
            onClick={() => onSelect(entry.ticker)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all hover:scale-105 hover:shadow-lg ${sentimentBg(entry.sentiment)}`}
          >
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sentimentDot(entry.sentiment)}`} />
            <span className="text-white text-xs font-bold tracking-wide">{entry.ticker}</span>
            <span className="text-gray-500 text-[10px] hidden sm:inline">{entry.company}</span>
            <span className={`text-[10px] font-semibold capitalize ${sentimentTextColor(entry.sentiment)}`}>
              {Math.round(entry.confidence * 100)}%
            </span>
            <span className="text-gray-700 text-[10px]">{timeAgo(entry.searchedAt)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Error Page ───────────────────────────────────────────────────────────────

function ErrorPage({ message, onReset }: { message: string; onReset: () => void }) {
  return (
    <div className="min-h-screen bg-[#0a0e0a] text-white font-sans flex flex-col items-center justify-center px-4">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-red-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 text-center max-w-md">
        <div className="w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
            <path d="M12 9v4M12 17h.01" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#ef4444" strokeWidth="1.5" fill="none"/>
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
        <p className="text-gray-500 text-sm mb-2 leading-relaxed">
          {message || "An unexpected error occurred while loading this page."}
        </p>
        <p className="text-gray-700 text-xs mb-8">
          This may be a bad URL, a missing resource, or the backend is unavailable.
        </p>

        <div className="inline-flex items-center gap-2 bg-red-500/5 border border-red-500/15 rounded-xl px-4 py-2 mb-8">
          <span className="text-red-500/60 text-xs font-mono">ERROR</span>
          <span className="text-red-400/40 text-xs">·</span>
          <span className="text-red-400/60 text-xs font-mono">{message.slice(0, 40)}{message.length > 40 ? "…" : ""}</span>
        </div>

        <button
          onClick={onReset}
          className="flex items-center gap-3 mx-auto bg-[#0f140f] hover:bg-[#141e14] border border-gray-700 hover:border-green-500/40 text-white px-6 py-3 rounded-xl transition-all font-semibold text-sm group"
        >
          <div className="w-7 h-7 rounded-lg bg-green-500/20 border border-green-500/40 flex items-center justify-center group-hover:bg-green-500/30 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" stroke="#22c55e" strokeWidth="1.5" fill="none"/>
              <path d="M12 8v8M8 10l4-2 4 2" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          Return to Sentinel
        </button>
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

  useEffect(() => {
    try {
      setSearchHistory(loadHistory());
    } catch {}

    const handler = (e: ErrorEvent) => {
      setPageError(e.message || "Unknown error");
    };
    window.addEventListener("error", handler);
    return () => window.removeEventListener("error", handler);
  }, []);

  const handleSearch = async (overrideTicker?: string) => {
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
        ticker: target,
        company: companyName,
        sentiment: norm.overall_sentiment,
        confidence: norm.confidence_score,
        searchedAt: new Date().toISOString(),
      };
      const updated = addToHistory(newEntry);
      setSearchHistory(updated);

      setChartLoading(true);
      fetchPriceHistory(target).then((history) => {
        setPriceHistory(history);
        setChartLoading(false);
      });
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to fetch consensus. Is the backend running?");
      }
    } finally {
      setLoading(false);
    }
  };

  const sentimentColor = (s: "bullish" | "bearish" | "neutral") => {
    if (s === "bullish") return "text-green-400";
    if (s === "bearish") return "text-red-400";
    return "text-yellow-400";
  };

  const riskColor = (r: "low" | "medium" | "high") => {
    if (r === "low") return "text-green-400";
    if (r === "high") return "text-red-400";
    return "text-yellow-400";
  };

  if (pageError) {
    return <ErrorPage message={pageError} onReset={() => setPageError("")} />;
  }

  return (
    <main className="min-h-screen bg-[#0a0e0a] text-white font-sans">

      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-8 py-4 bg-[#0a0e0a]/80 backdrop-blur border-b border-gray-800/50">
        <button
          onClick={() => { setConsensus(null); setError(""); setTicker(""); }}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <div className="w-9 h-9 rounded-lg bg-green-500/20 border border-green-500/40 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" stroke="#22c55e" strokeWidth="1.5" fill="none"/>
              <path d="M12 8v8M8 10l4-2 4 2" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div className="text-sm font-bold tracking-widest text-white">SENTINEL</div>
            <div className="text-[10px] text-gray-500 -mt-0.5">AI Market Sentiment</div>
          </div>
        </button>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
          Live Analysis
        </div>
      </nav>

      {/* Hero */}
      <div className="relative min-h-[480px] flex items-center justify-center overflow-hidden pt-16">
        <div className="absolute left-0 top-0 bottom-0 w-2/5 pointer-events-none">
          <Image src="/bull.jpg" alt="Bull" fill sizes="40vw" className="object-cover object-center" style={{ opacity: 0.35 }} priority />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a0e0a]/20 via-transparent to-[#0a0e0a]" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0e0a]/60 to-[#0a0e0a]/60" />
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-2/5 pointer-events-none">
          <Image src="/bear.jpg" alt="Bear" fill sizes="40vw" className="object-cover object-center" style={{ opacity: 0.35 }} priority />
          <div className="absolute inset-0 bg-gradient-to-l from-[#0a0e0a]/20 via-transparent to-[#0a0e0a]" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0e0a]/60 to-[#0a0e0a]/60" />
        </div>

        <div className="relative z-10 text-center px-4 w-full max-w-2xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold mb-3 tracking-tight">Market Sentiment Analyzer</h1>
          <p className="text-gray-400 mb-10">AI-powered insights for smarter investment decisions</p>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
              <select
                className="w-full bg-[#111811] border border-gray-700 hover:border-gray-600 focus:border-green-500 rounded-xl pl-10 pr-4 py-4 text-white focus:outline-none transition-colors appearance-none text-sm"
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
              className="bg-green-500 hover:bg-green-400 active:bg-green-600 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed px-8 py-4 rounded-xl font-bold text-black transition-all text-sm whitespace-nowrap"
            >
              {loading ? "Analysing..." : "Analyze"}
            </button>
          </div>
        </div>
      </div>

      {/* Search History — shown only when no results */}
      {!consensus && !loading && (
        <SearchHistoryPanel
          history={searchHistory}
          onSelect={(t) => handleSearch(t)}
        />
      )}

      <div className="max-w-6xl mx-auto px-4 pb-16">

        {/* Loading */}
        {loading && (
          <div className="text-center py-24">
            <div className="relative inline-block mb-6">
              <div className="w-16 h-16 border-4 border-green-500/20 rounded-full" />
              <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin absolute inset-0" />
            </div>
            <p className="text-gray-300 text-lg font-medium">Running AI Analysis</p>
            <p className="text-gray-600 text-sm mt-2">Fetching data · Analysing fundamentals · Synthesising consensus</p>
            <p className="text-gray-700 text-xs mt-1">This may take 30–60 seconds</p>
          </div>
        )}

        {/* Inline Error */}
        {error && !loading && (
          <div className="mt-6 rounded-2xl overflow-hidden border border-red-500/20 bg-red-500/5">
            <div className="flex items-start gap-4 p-6">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 9v4M12 17h.01" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#ef4444" strokeWidth="1.5" fill="none"/>
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-red-400 font-semibold text-sm mb-1">Analysis Failed</p>
                <p className="text-red-400/70 text-sm">{error}</p>
                <p className="text-gray-600 text-xs mt-2">Check that your backend server is running at localhost:8000</p>
              </div>
              <button
                onClick={() => setError("")}
                className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center text-red-400 hover:text-red-300 transition-colors flex-shrink-0 text-xs"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Results */}
        {consensus && (
          <div className="space-y-4 mt-2">

            {/* Company Header */}
            <div className="text-center py-4">
              <h2 className="text-3xl font-bold">{consensus.company_name}</h2>
              <p className="text-gray-500 text-sm mt-1">Stock Market · {consensus.ticker}</p>
            </div>

            {/* ── BIG PRICE CHART (top) ── */}
            <BigPriceChart
              priceHistory={priceHistory}
              ticker={consensus.ticker}
              sentiment={consensus.overall_sentiment}
              sentimentScore={consensus.confidence_score}
              chartLoading={chartLoading}
            />

            {/* ── 3-COLUMN METRIC CARDS ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

              {/* Sentiment */}
              <div className="bg-[#0f140f] border border-gray-800 rounded-2xl p-6 hover:border-gray-700 transition-colors">
                <p className="text-gray-500 text-xs uppercase tracking-widest mb-4">Overall Sentiment</p>
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl ${
                    consensus.overall_sentiment === "bullish"
                      ? "bg-green-500/10 border border-green-500/20"
                      : consensus.overall_sentiment === "bearish"
                      ? "bg-red-500/10 border border-red-500/20"
                      : "bg-yellow-500/10 border border-yellow-500/20"
                  }`}>
                    {consensus.overall_sentiment === "bullish" ? "🐂" : consensus.overall_sentiment === "bearish" ? "🐻" : "➡️"}
                  </div>
                  <div>
                    <div className={`text-2xl font-bold capitalize ${sentimentColor(consensus.overall_sentiment)}`}>
                      {consensus.overall_sentiment}
                    </div>
                    <div className="text-gray-600 text-xs mt-0.5">
                      {consensus.overall_sentiment === "bullish"
                        ? "Market outlook positive"
                        : consensus.overall_sentiment === "bearish"
                        ? "Market outlook negative"
                        : "Market outlook mixed"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Confidence */}
              <div className="bg-[#0f140f] border border-gray-800 rounded-2xl p-6 hover:border-gray-700 transition-colors">
                <div className="flex items-center gap-2 mb-4">
                  <p className="text-gray-500 text-xs uppercase tracking-widest">Confidence Score</p>
                  <InfoTooltip content="The AI's certainty in its sentiment call. Derived from averaging sentiment scores across all analyzed news and financial signals — 0% = fully bearish consensus, 100% = fully bullish. Above 70% = high confidence." />
                </div>
                <div className="text-5xl font-bold text-white mb-4">
                  {Math.round(consensus.confidence_score * 100)}
                  <span className="text-2xl text-gray-500">%</span>
                </div>
                <div className="w-full bg-gray-800/60 rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full bg-gradient-to-r from-green-600 to-green-400 transition-all duration-700"
                    style={{ width: `${consensus.confidence_score * 100}%` }}
                  />
                </div>
                <p className="text-gray-600 text-xs mt-2">
                  {consensus.confidence_score >= 0.7
                    ? "High Confidence"
                    : consensus.confidence_score >= 0.4
                    ? "Moderate Confidence"
                    : "Low Confidence"}
                </p>
              </div>

              {/* Risk */}
              <div className="bg-[#0f140f] border border-gray-800 rounded-2xl p-6 hover:border-gray-700 transition-colors">
                <div className="flex items-center gap-2 mb-4">
                  <p className="text-gray-500 text-xs uppercase tracking-widest">Risk Rating</p>
                  <InfoTooltip content="Structural risk based on the AI's analysis of debt levels, earnings volatility, market sentiment extremes, and news uncertainty. Low = stable fundamentals with mild sentiment. Medium = mixed signals. High = elevated debt, negative news cycle, or extreme sentiment swings." />
                </div>
                <div className={`text-5xl font-bold capitalize mb-4 ${riskColor(consensus.risk_rating)}`}>
                  {consensus.risk_rating}
                </div>
                <div className="relative w-full h-1.5 rounded-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500">
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg border-2 border-[#0f140f] transition-all duration-700"
                    style={{
                      left: consensus.risk_rating === "low" ? "12%" : consensus.risk_rating === "high" ? "88%" : "50%",
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-gray-700 mt-2">
                  <span>Low</span><span>Medium</span><span>High</span>
                </div>
              </div>
            </div>

            {/* Market Psychology + Accounting */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-[#0f140f] border border-gray-800 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-md bg-green-500/20 flex items-center justify-center">
                    <span className="text-green-400 text-xs">✦</span>
                  </div>
                  <h3 className="font-semibold text-sm uppercase tracking-widest text-gray-300">Market Psychology</h3>
                  <InfoTooltip content="Analyses crowd behaviour, social sentiment, and emotional drivers behind the stock's current momentum. Looks at FOMO cycles, fear indicators, institutional accumulation patterns, and retail investor sentiment from social platforms." />
                </div>
                <p className="text-gray-300 leading-relaxed text-sm">{consensus.market_psychology_perspective}</p>
              </div>

              <div className="bg-[#0f140f] border border-gray-800 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-md bg-blue-500/20 flex items-center justify-center">
                    <span className="text-blue-400 text-xs">◈</span>
                  </div>
                  <h3 className="font-semibold text-sm uppercase tracking-widest text-gray-300">Accounting Perspective</h3>
                  <InfoTooltip content="Evaluates the company's financial health through its fundamentals — revenue growth, profit margins, debt-to-equity ratio, cash flow, and earnings consistency. Provides a data-driven view of whether the stock's valuation is justified." />
                </div>
                <p className="text-gray-300 leading-relaxed text-sm">{consensus.accounting_perspective}</p>
              </div>
            </div>

            {/* Bull vs Bear */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="relative overflow-hidden bg-[#0a120a] border border-green-900/40 rounded-2xl p-6">
                <div className="absolute inset-0 pointer-events-none">
                  <Image src="/bull.jpg" alt="" fill sizes="50vw" className="object-cover object-center opacity-10" />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#0a120a]/95 via-[#0a120a]/80 to-[#0a120a]/60" />
                </div>
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-5">
                    <span className="text-green-400 text-lg font-bold">↗</span>
                    <h3 className="font-bold text-green-400 uppercase tracking-widest text-sm">Positive Factors</h3>
                  </div>
                  <ul className="space-y-3">
                    {consensus.bull_case.map((point, i) => (
                      <li key={i} className="flex gap-3 text-sm text-gray-300 leading-snug">
                        <span className="text-green-500 mt-0.5 flex-shrink-0 font-bold">✓</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="relative overflow-hidden bg-[#120a0a] border border-red-900/40 rounded-2xl p-6">
                <div className="absolute inset-0 pointer-events-none">
                  <Image src="/bear.jpg" alt="" fill sizes="50vw" className="object-cover object-center opacity-10" />
                  <div className="absolute inset-0 bg-gradient-to-l from-[#120a0a]/95 via-[#120a0a]/80 to-[#120a0a]/60" />
                </div>
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-5">
                    <span className="text-red-400 text-lg font-bold">↘</span>
                    <h3 className="font-bold text-red-400 uppercase tracking-widest text-sm">Negative Factors</h3>
                  </div>
                  <ul className="space-y-3">
                    {consensus.bear_case.map((point, i) => (
                      <li key={i} className="flex gap-3 text-sm text-gray-300 leading-snug">
                        <span className="text-red-500 mt-0.5 flex-shrink-0 font-bold">✗</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Key News Sources */}
            {consensus.key_news_sources && consensus.key_news_sources.length > 0 && (
              <div className="bg-[#0f140f] border border-gray-800 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-6 h-6 rounded-md bg-gray-800 flex items-center justify-center">
                    <span className="text-gray-400 text-xs">▤</span>
                  </div>
                  <h3 className="font-semibold text-sm uppercase tracking-widest text-gray-300">Key News Sources</h3>
                  <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full ml-auto">
                    {consensus.key_news_sources.length} sources
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {consensus.key_news_sources.map((sourceUrl, i) => (
                    <div
                      key={i}
                      onClick={() => window.open(sourceUrl, "_blank")}
                      className="bg-[#0a0e0a] border border-gray-800/60 rounded-xl p-4 hover:border-green-500/40 hover:bg-[#0a120a] transition-all group cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center text-xs font-bold text-gray-300 flex-shrink-0 group-hover:bg-green-500/20 group-hover:text-green-400 transition-colors">
                          {extractDomain(sourceUrl).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-gray-400 group-hover:text-green-400 transition-colors truncate">
                            {extractDomain(sourceUrl)}
                          </p>
                          <p className="text-[10px] text-gray-600 truncate">{sourceUrl}</p>
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
    </main>
  );
}