import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface StockConsensus {
  ticker: string;
  aggregate_sentiment: string;
  average_sentiment_score: number;
  consensus_risk_level: string;
  accounting_perspective: string;
  market_psychology_perspective: string;
  the_bull_case: string;
  the_bear_case: string;
  fetched_at: string;
}

async function getConsensusData(symbol: string): Promise<StockConsensus> {
  const res = await fetch(`http://backend:8000/ticker/${symbol}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Failed to pull analytical stream for ticker: ${symbol}`);
  return res.json();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parsePoints(text: string): string[] {
  // Split on newlines, numbered lists, or sentences ending with period
  const lines = text
    .split(/\n|(?<=\.)\s+(?=[A-Z])/)
    .map(s => s.replace(/^\d+[\.\)]\s*/, '').trim())
    .filter(s => s.length > 10);
  return lines.length >= 2 ? lines : [text];
}

function scoreToLabel(score: number) {
  if (score > 0.3) return { label: 'STRONGLY BULLISH', color: '#10b981' };
  if (score > 0.1) return { label: 'BULLISH', color: '#34d399' };
  if (score > -0.1) return { label: 'NEUTRAL', color: '#f59e0b' };
  if (score > -0.3) return { label: 'BEARISH', color: '#f87171' };
  return { label: 'STRONGLY BEARISH', color: '#ef4444' };
}

function riskStyle(risk: string) {
  const r = risk?.toLowerCase();
  if (r === 'low') return { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)', color: '#10b981' };
  if (r === 'medium') return { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', color: '#f59e0b' };
  return { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', color: '#ef4444' };
}

function confidencePct(score: number): number {
  // Map score from [-1, 1] to [0, 100] with more nuance
  return Math.min(100, Math.max(0, Math.round((score + 1) / 2 * 100)));
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function TickerPage({ params }: { params: { symbol: string } }) {
  const data = await getConsensusData(params.symbol);

  const sentiment = scoreToLabel(data.average_sentiment_score);
  const risk = riskStyle(data.consensus_risk_level);
  const isBullish = data.average_sentiment_score > 0;
  const confidence = confidencePct(data.average_sentiment_score);
  const bullPoints = parsePoints(data.the_bull_case);
  const bearPoints = parsePoints(data.the_bear_case);
  const syncTime = new Date(data.fetched_at).toLocaleString('en-US', {
    month: 'short', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=Bebas+Neue&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap');

        :root {
          --bg: #0a0a0b;
          --surface: #111113;
          --surface-2: #18181c;
          --surface-3: #1e1e24;
          --border: #2a2a30;
          --border-bright: #3a3a42;
          --amber: #f59e0b;
          --amber-dim: #92600a;
          --text: #f0f0f2;
          --text-dim: #b0b0b8;
          --text-muted: #606068;
          --green: #10b981;
          --red: #ef4444;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background: var(--bg);
          color: var(--text);
          font-family: 'IBM Plex Sans', sans-serif;
          min-height: 100vh;
        }

        /* ── Grid background ── */
        .grid-bg {
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(var(--border) 1px, transparent 1px),
            linear-gradient(90deg, var(--border) 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: radial-gradient(ellipse 80% 50% at 50% 0%, black 20%, transparent 100%);
          pointer-events: none;
          z-index: 0;
        }

        .page {
          position: relative;
          z-index: 1;
          max-width: 1400px;
          margin: 0 auto;
          padding: 32px 48px 80px;
        }

        @media (max-width: 900px) {
          .page { padding: 24px 20px 60px; }
        }

        /* ── Topbar ── */
        .topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 40px;
          padding-bottom: 20px;
          border-bottom: 1px solid var(--border);
        }

        .topbar-left {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .back-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: var(--text-muted);
          text-decoration: none;
          transition: color 0.15s;
        }

        .back-btn:hover { color: var(--amber); }

        .topbar-logo {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 22px;
          letter-spacing: 0.15em;
          color: var(--amber);
        }

        .topbar-divider {
          width: 1px;
          height: 20px;
          background: var(--border-bright);
        }

        .topbar-ticker {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 14px;
          font-weight: 600;
          color: var(--text);
          letter-spacing: 0.1em;
        }

        .topbar-right {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px;
          color: var(--text-muted);
          letter-spacing: 0.05em;
        }

        .live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--green);
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        /* ── Hero card ── */
        .hero-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 28px 32px;
          margin-bottom: 20px;
        }

        .hero-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 20px;
          flex-wrap: wrap;
          gap: 12px;
        }

        .hero-name {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 72px;
          letter-spacing: 0.03em;
          line-height: 1;
          color: var(--text);
        }

        .hero-sub {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          color: var(--text-muted);
          letter-spacing: 0.15em;
          margin-top: 6px;
        }

        .hero-badges {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }

        .badge {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          padding: 5px 12px;
          border-radius: 3px;
          border: 1px solid;
        }

        /* ── Confidence bar ── */
        .confidence-section {
          margin-bottom: 20px;
        }

        .confidence-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .confidence-label {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 9px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--text-muted);
        }

        .confidence-pct {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-dim);
        }

        .bar-track {
          width: 100%;
          height: 4px;
          background: var(--surface-3);
          border-radius: 2px;
          overflow: hidden;
        }

        .bar-fill {
          height: 100%;
          border-radius: 2px;
          transition: width 1s ease;
        }

        /* ── Score row ── */
        .score-row {
          display: flex;
          align-items: center;
          gap: 16px;
          padding-top: 16px;
          border-top: 1px solid var(--border);
          flex-wrap: wrap;
        }

        .score-item {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .score-key {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 9px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: var(--text-muted);
        }

        .score-val {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 16px;
          font-weight: 600;
        }

        .score-divider {
          width: 1px;
          height: 32px;
          background: var(--border);
        }

        .summary-text {
          font-size: 13px;
          color: var(--text-dim);
          line-height: 1.7;
          font-weight: 300;
          flex: 1;
          min-width: 200px;
        }

        /* ── 2-col grid ── */
        .two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 20px;
        }

        @media (max-width: 800px) {
          .two-col { grid-template-columns: 1fr; }
          .hero-name { font-size: 52px; }
        }

        /* ── Bull / Bear cards ── */
        .bull-card, .bear-card {
          border-radius: 6px;
          border: 1px solid;
          padding: 24px;
        }

        .bull-card {
          background: rgba(16,185,129,0.04);
          border-color: rgba(16,185,129,0.2);
        }

        .bear-card {
          background: rgba(239,68,68,0.04);
          border-color: rgba(239,68,68,0.2);
        }

        .case-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
        }

        .case-icon {
          font-size: 16px;
        }

        .case-title {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }

        .bull-card .case-title { color: var(--green); }
        .bear-card .case-title { color: var(--red); }

        .case-points {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .case-point {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          font-size: 14px;
          color: var(--text-dim);
          line-height: 1.6;
        }

        .point-marker {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          font-weight: 600;
          margin-top: 1px;
          flex-shrink: 0;
        }

        .bull-card .point-marker { color: var(--green); }
        .bear-card .point-marker { color: var(--red); }

        /* ── Perspectives ── */
        .perspectives {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 20px;
        }

        @media (max-width: 800px) {
          .perspectives { grid-template-columns: 1fr; }
        }

        .perspective-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 24px;
        }

        .perspective-label {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 9px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .perspective-label::before {
          content: '';
          display: block;
          width: 3px;
          height: 12px;
          border-radius: 1px;
        }

        .accounting .perspective-label::before { background: #60a5fa; }
        .psychology .perspective-label::before { background: #a78bfa; }

        .perspective-text {
          font-size: 14px;
          color: var(--text-dim);
          line-height: 1.75;
          font-weight: 400;
        }

        /* ── Metadata strip ── */
        .meta-strip {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 16px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }

        .meta-item {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .meta-key {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 9px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: var(--text-muted);
        }

        .meta-val {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 13px;
          color: var(--text-dim);
        }

        .meta-divider {
          width: 1px;
          height: 28px;
          background: var(--border);
        }
      `}</style>

      <div className="grid-bg" />

      <div className="page">

        {/* Topbar */}
        <div className="topbar">
          <div className="topbar-left">
            <Link href="/" className="back-btn">
              <ArrowLeft size={12} /> Back
            </Link>
            <div className="topbar-logo">SENTINEL</div>
            <div className="topbar-divider" />
            <div className="topbar-ticker">{data.ticker}</div>
          </div>
          <div className="topbar-right">
            <div className="live-dot" />
            LIVE ANALYSIS
          </div>
        </div>

        {/* Hero card */}
        <div className="hero-card">
          <div className="hero-top">
            <div>
              <div className="hero-name">{data.ticker}</div>
              <div className="hero-sub">SENTIMENT ANALYSIS REPORT</div>
            </div>
            <div className="hero-badges">
              <span
                className="badge"
                style={{
                  background: risk.bg,
                  borderColor: risk.border,
                  color: risk.color,
                }}
              >
                {data.consensus_risk_level} Risk
              </span>
              <span
                className="badge"
                style={{
                  background: `${sentiment.color}18`,
                  borderColor: `${sentiment.color}40`,
                  color: sentiment.color,
                }}
              >
                {data.aggregate_sentiment}
              </span>
            </div>
          </div>

          {/* Confidence bar */}
          <div className="confidence-section">
            <div className="confidence-header">
              <span className="confidence-label">Consensus Confidence</span>
              <span className="confidence-pct">{confidence}%</span>
            </div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{
                  width: `${confidence}%`,
                  background: isBullish
                    ? 'linear-gradient(90deg, #059669, #10b981)'
                    : 'linear-gradient(90deg, #dc2626, #ef4444)',
                }}
              />
            </div>
          </div>

          {/* Score row */}
          <div className="score-row">
            <div className="score-item">
              <span className="score-key">Sentiment Vector</span>
              <span className="score-val" style={{ color: sentiment.color }}>
                {data.average_sentiment_score >= 0 ? '+' : ''}{data.average_sentiment_score.toFixed(4)}
              </span>
            </div>
            <div className="score-divider" />
            <div className="score-item">
              <span className="score-key">Signal</span>
              <span className="score-val" style={{ color: sentiment.color }}>
                {sentiment.label}
              </span>
            </div>
            <div className="score-divider" />
            <div className="score-item">
              <span className="score-key">Risk Level</span>
              <span className="score-val" style={{ color: risk.color }}>
                {data.consensus_risk_level.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Bull / Bear */}
        <div className="two-col">
          {/* Bull */}
          <div className="bull-card">
            <div className="case-header">
              <span className="case-icon">🐂</span>
              <span className="case-title">Bull Case</span>
            </div>
            <ul className="case-points">
              {bullPoints.map((point, i) => (
                <li key={i} className="case-point">
                  <span className="point-marker">✓</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Bear */}
          <div className="bear-card">
            <div className="case-header">
              <span className="case-icon">🐻</span>
              <span className="case-title">Bear Case</span>
            </div>
            <ul className="case-points">
              {bearPoints.map((point, i) => (
                <li key={i} className="case-point">
                  <span className="point-marker">✕</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Perspectives */}
        <div className="perspectives">
          <div className="perspective-card accounting">
            <div className="perspective-label">Accounting & Balance Sheet</div>
            <p className="perspective-text">{data.accounting_perspective}</p>
          </div>
          <div className="perspective-card psychology">
            <div className="perspective-label">Market Psychology</div>
            <p className="perspective-text">{data.market_psychology_perspective}</p>
          </div>
        </div>

        {/* Meta strip */}
        <div className="meta-strip">
          <div className="meta-item">
            <span className="meta-key">Ticker</span>
            <span className="meta-val" style={{ color: 'var(--amber)', fontWeight: 600 }}>{data.ticker}</span>
          </div>
          <div className="meta-divider" />
          <div className="meta-item">
            <span className="meta-key">Last Synced</span>
            <span className="meta-val">{syncTime}</span>
          </div>
          <div className="meta-divider" />
          <div className="meta-item">
            <span className="meta-key">Cache Policy</span>
            <span className="meta-val">1-HOUR REVALIDATION</span>
          </div>
          <div className="meta-divider" />
          <div className="meta-item">
            <span className="meta-key">Pipeline</span>
            <span className="meta-val" style={{ color: 'var(--green)' }}>DUAL-ENGINE ACTIVE</span>
          </div>
        </div>

      </div>
    </>
  );
}