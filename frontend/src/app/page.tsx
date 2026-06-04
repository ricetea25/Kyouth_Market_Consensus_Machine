"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
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

// Fetches 30-day daily OHLCV data from Yahoo Finance (public, no key needed)
async function fetchPriceHistory(symbol: string): Promise<PricePoint[]> {
  try {
    const end = Math.floor(Date.now() / 1000);
    const start = end - 60 * 60 * 24 * 90; // 90 days back
    const url = `/api/yf/v8/finance/chart/${symbol}?interval=1d&period1=${start}&period2=${end}`;
    // Use a CORS proxy since Yahoo blocks direct browser requests
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
        volume: Math.round((volumes[i] ?? 0) / 1_000_000), // millions
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

// ─── Stock Chart Component ───────────────────────────────────────────────────

function StockChart({
  priceHistory,
  ticker,
  sentiment,
  sentimentScore,
}: {
  priceHistory: PricePoint[];
  ticker: string;
  sentiment: "bullish" | "bearish" | "neutral";
  sentimentScore: number;
}) {
  const [activeView, setActiveView] = useState<"price" | "change" | "volume">("price");

  const sentimentLineColor =
    sentiment === "bullish" ? "#22c55e" : sentiment === "bearish" ? "#ef4444" : "#eab308";

  const priceColor = "#22c55e";
  const changeColor = "#f59e0b";
  const volumeColor = "#6366f1";

  if (priceHistory.length === 0) {
    return (
      <div className="bg-[#0f140f] border border-gray-800 rounded-2xl p-6 flex items-center justify-center h-64">
        <p className="text-gray-600 text-sm">Price history unavailable</p>
      </div>
    );
  }

  const latestPrice = priceHistory[priceHistory.length - 1]?.price ?? 0;
  const firstPrice = priceHistory[0]?.price ?? 0;
  const totalChange = ((latestPrice - firstPrice) / firstPrice * 100).toFixed(2);
  const isPositive = parseFloat(totalChange) >= 0;

  return (
    <div className="bg-[#0f140f] border border-gray-800 rounded-2xl p-6">
      {/* Chart Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h3 className="font-bold text-white text-base uppercase tracking-widest">{ticker}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isPositive ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
              {isPositive ? "▲" : "▼"} {Math.abs(parseFloat(totalChange))}% (90d)
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white">${latestPrice.toFixed(2)}</span>
            <span className="text-gray-500 text-xs">Current Price</span>
          </div>
          {/* Sentiment overlay indicator */}
          <div className="flex items-center gap-2 mt-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: sentimentLineColor }} />
            <span className="text-xs text-gray-500">
              AI Sentiment: <span style={{ color: sentimentLineColor }} className="font-semibold capitalize">{sentiment}</span>
              {" "}·{" "}
              <span style={{ color: sentimentLineColor }}>{Math.round(sentimentScore * 100)}% confidence</span>
            </span>
          </div>
        </div>

        {/* View Switcher */}
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
              {v === "change" ? "% Change" : v}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={priceHistory} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
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

            {/* Price / Change left axis */}
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

            {/* Volume axis */}
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

            {/* Zero reference line for % change view */}
            {activeView === "change" && (
              <ReferenceLine yAxisId="main" y={0} stroke="#374151" strokeDasharray="4 2" />
            )}

            {/* PRICE line */}
            {activeView === "price" && (
              <Line
                yAxisId="main"
                type="monotone"
                dataKey="price"
                name="Price"
                stroke={priceColor}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: priceColor, stroke: "#0f140f", strokeWidth: 2 }}
              />
            )}

            {/* CHANGE line */}
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

            {/* VOLUME bars */}
            {activeView === "volume" && (
              <Bar
                yAxisId="vol"
                dataKey="volume"
                name="Volume"
                fill={volumeColor}
                opacity={0.7}
                radius={[2, 2, 0, 0]}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Quick stats strip */}
      <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-800/60">
        {[
          {
            label: "90d High",
            value: `$${Math.max(...priceHistory.map(p => p.price)).toFixed(2)}`,
            color: "text-green-400",
          },
          {
            label: "90d Low",
            value: `$${Math.min(...priceHistory.map(p => p.price)).toFixed(2)}`,
            color: "text-red-400",
          },
          {
            label: "Avg Volume",
            value: `${(priceHistory.reduce((a, p) => a + p.volume, 0) / priceHistory.length).toFixed(1)}M`,
            color: "text-indigo-400",
          },
        ].map((stat) => (
          <div key={stat.label} className="text-center">
            <p className={`text-sm font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Home() {
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [consensus, setConsensus] = useState<NormalisedConsensus | null>(null);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  const handleSearch = async () => {
    if (!ticker.trim()) return;
    setLoading(true);
    setError("");
    setConsensus(null);
    setPriceHistory([]);

    try {
      const res = await fetch(`http://localhost:8000/ticker/${ticker.trim()}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Something went wrong");
      }
      const raw: StockConsensus = await res.json();
      const companyName = SUPPORTED_TICKERS[ticker.trim()] || ticker.trim();
      setConsensus(normalise(raw, companyName));

      // Fetch price history in parallel (non-blocking)
      setChartLoading(true);
      fetchPriceHistory(ticker.trim()).then((history) => {
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

  return (
    <main className="min-h-screen bg-[#0a0e0a] text-white font-sans">

      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4 bg-[#0a0e0a]/80 backdrop-blur border-b border-gray-800/50">
        <div className="flex items-center gap-3">
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
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
          Live Analysis
        </div>
      </nav>

      {/* Hero */}
      <div className="relative min-h-[480px] flex items-center justify-center overflow-hidden pt-16">
        <div className="absolute left-0 top-0 bottom-0 w-2/5 pointer-events-none">
          <Image src="/bull.jpg" alt="Bull" fill className="object-cover object-center" style={{ opacity: 0.35 }} priority />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a0e0a]/20 via-transparent to-[#0a0e0a]" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0e0a]/60 to-[#0a0e0a]/60" />
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-2/5 pointer-events-none">
          <Image src="/bear.jpg" alt="Bear" fill className="object-cover object-center" style={{ opacity: 0.35 }} priority />
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
              onClick={handleSearch}
              disabled={loading || !ticker}
              className="bg-green-500 hover:bg-green-400 active:bg-green-600 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed px-8 py-4 rounded-xl font-bold text-black transition-all text-sm whitespace-nowrap"
            >
              {loading ? "Analysing..." : "Analyze"}
            </button>
          </div>
        </div>
      </div>

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

        {/* Error */}
        {error && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5 text-red-400 text-center text-sm mt-4">
            ⚠ {error}
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

            {/* ── STOCK CHART ── */}
            {chartLoading ? (
              <div className="bg-[#0f140f] border border-gray-800 rounded-2xl p-6 flex items-center justify-center h-[420px]">
                <div className="text-center">
                  <div className="relative inline-block mb-4">
                    <div className="w-10 h-10 border-2 border-green-500/20 rounded-full" />
                    <div className="w-10 h-10 border-2 border-green-500 border-t-transparent rounded-full animate-spin absolute inset-0" />
                  </div>
                  <p className="text-gray-500 text-xs">Loading price history…</p>
                </div>
              </div>
            ) : (
              <StockChart
                priceHistory={priceHistory}
                ticker={consensus.ticker}
                sentiment={consensus.overall_sentiment}
                sentimentScore={consensus.confidence_score}
              />
            )}

            {/* Metric Cards */}
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
                <p className="text-gray-500 text-xs uppercase tracking-widest mb-4">Confidence Score</p>
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
                <p className="text-gray-500 text-xs uppercase tracking-widest mb-4">Risk Rating</p>
                <div className={`text-5xl font-bold capitalize mb-4 ${riskColor(consensus.risk_rating)}`}>
                  {consensus.risk_rating}
                </div>
                <div className="relative w-full h-1.5 rounded-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500">
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg border-2 border-[#0f140f] transition-all duration-700"
                    style={{
                      left: consensus.risk_rating === "low"
                        ? "12%"
                        : consensus.risk_rating === "high"
                        ? "88%"
                        : "50%",
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
                </div>
                <p className="text-gray-300 leading-relaxed text-sm">{consensus.market_psychology_perspective}</p>
              </div>

              <div className="bg-[#0f140f] border border-gray-800 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-md bg-blue-500/20 flex items-center justify-center">
                    <span className="text-blue-400 text-xs">◈</span>
                  </div>
                  <h3 className="font-semibold text-sm uppercase tracking-widest text-gray-300">Accounting Perspective</h3>
                </div>
                <p className="text-gray-300 leading-relaxed text-sm">{consensus.accounting_perspective}</p>
              </div>
            </div>

            {/* Bull vs Bear */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

              {/* Positive */}
              <div className="relative overflow-hidden bg-[#0a120a] border border-green-900/40 rounded-2xl p-6">
                <div className="absolute inset-0 pointer-events-none">
                  <Image src="/bull.jpg" alt="" fill className="object-cover object-center opacity-10" />
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

              {/* Negative */}
              <div className="relative overflow-hidden bg-[#120a0a] border border-red-900/40 rounded-2xl p-6">
                <div className="absolute inset-0 pointer-events-none">
                  <Image src="/bear.jpg" alt="" fill className="object-cover object-center opacity-10" />
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
                  <h3 className="font-semibold text-sm uppercase tracking-widest text-gray-300">
                    Key News Sources
                  </h3>
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