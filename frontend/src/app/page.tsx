import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

async function getHistory() {
  try {
    const res = await fetch("http://backend:8000/history", { cache: "no-store" });
    if (!res.ok) return [];
    return await res.json();
  } catch (error) {
    console.error("Failed to fetch history:", error);
    return [];
  }
}

function scoreToColor(score: number): string {
  if (score > 0.3)  return "#10b981";
  if (score > 0.1)  return "#34d399";
  if (score > -0.1) return "#9ca3af";
  if (score > -0.3) return "#f87171";
  return "#ef4444";
}

function scoreToBadge(score: number) {
  if (score > 0.3)  return { bg: "rgba(16,185,129,0.12)",  border: "rgba(16,185,129,0.35)",  color: "#10b981" };
  if (score > 0.1)  return { bg: "rgba(52,211,153,0.10)",  border: "rgba(52,211,153,0.30)",  color: "#34d399" };
  if (score > -0.1) return { bg: "rgba(156,163,175,0.10)", border: "rgba(156,163,175,0.25)", color: "#9ca3af" };
  if (score > -0.3) return { bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.30)", color: "#f87171" };
  return                   { bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.35)",   color: "#ef4444" };
}

function riskColor(risk: string): string {
  const r = risk?.toLowerCase();
  if (r === "low")    return "#10b981";
  if (r === "medium") return "#f59e0b";
  return "#ef4444";
}

export default async function Home() {
  const history = await getHistory();

  async function handleSearch(formData: FormData) {
    "use server";
    const ticker = formData.get("ticker")?.toString().trim().toUpperCase();
    if (ticker) redirect(`/ticker/${ticker}`);
  }

  const bullish  = history.filter((r: any) => r.average_sentiment_score > 0.15).length;
  const bearish  = history.filter((r: any) => r.average_sentiment_score <= -0.1).length;
  const avgScore = history.length
    ? history.reduce((a: number, r: any) => a + r.average_sentiment_score, 0) / history.length
    : 0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=Bebas+Neue&family=IBM+Plex+Sans:wght@300;400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg:            #09090b;
          --surface:       #111113;
          --surface-2:     #17171a;
          --border:        #27272d;
          --border-bright: #3d3d46;
          --amber:         #f59e0b;
          --amber-dim:     #78490a;
          --text:          #f2f2f4;
          --text-dim:      #b4b4bc;
          --text-muted:    #64646c;
          --green:         #10b981;
        }

        body {
          background: var(--bg);
          color: var(--text);
          font-family: 'IBM Plex Sans', sans-serif;
          min-height: 100vh;
          overflow-x: hidden;
        }

        /* ── Grid background ── */
        .grid-bg {
          position: fixed; inset: 0;
          background-image:
            linear-gradient(var(--border) 1px, transparent 1px),
            linear-gradient(90deg, var(--border) 1px, transparent 1px);
          background-size: 56px 56px;
          mask-image: radial-gradient(ellipse 80% 55% at 50% 0%, black 20%, transparent 100%);
          pointer-events: none; z-index: 0;
        }

        .amber-glow {
          position: fixed; top: -240px; left: 50%;
          transform: translateX(-50%);
          width: 900px; height: 500px;
          background: radial-gradient(ellipse, rgba(245,158,11,0.07) 0%, transparent 70%);
          pointer-events: none; z-index: 0;
        }

        .page {
          position: relative; z-index: 1;
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 40px 80px;
        }

        /* ── Topbar ── */
        .topbar {
          display: flex; justify-content: space-between; align-items: center;
          padding: 22px 0;
          border-bottom: 1px solid var(--border);
          margin-bottom: 64px;
        }

        .topbar-logo {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 24px; letter-spacing: 0.18em; color: var(--amber);
        }

        .topbar-right {
          display: flex; align-items: center; gap: 8px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px; letter-spacing: 0.12em;
          text-transform: uppercase; color: var(--text-muted);
        }

        .live-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--green);
          animation: blink 2s ease-in-out infinite;
        }

        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.25} }

        /* ── Hero ── */
        .hero {
			display: flex;
			justify-content: space-between;
			align-items: flex-end; /* This aligns the bottom of Title with bottom of Search */
			gap: 40px;
			margin-bottom: 48px;
			flex-wrap: wrap;
		}

		/* Add a helper for the search bar container */
		.hero-right {
			padding-bottom: 12px; /* Slight adjustment to match visual baseline of font */
		}

        .eyebrow {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 9px; letter-spacing: 0.28em;
          text-transform: uppercase; color: var(--amber);
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 16px;
        }

        .eyebrow::before {
          content: ''; width: 20px; height: 1px; background: var(--amber);
        }

        .hero-title {
          font-family: 'Bebas Neue', sans-serif;
          font-size: clamp(72px, 9vw, 108px);
          line-height: 0.88; letter-spacing: 0.02em; color: var(--text);
        }

        .hero-title span { color: var(--amber); }

        .hero-sub {
          font-size: 14px; color: var(--text-dim);
          line-height: 1.75; font-weight: 400;
          margin-top: 18px; max-width: 400px;
        }

        /* ── Search ── */
        .search-wrap {
          display: flex;
          border: 1px solid var(--border-bright);
          border-radius: 4px; overflow: hidden;
          transition: border-color 0.2s, box-shadow 0.2s;
          min-width: 380px;
        //  align-self: flex-end;
        }

        .search-wrap:focus-within {
          border-color: var(--amber);
          box-shadow: 0 0 0 1px var(--amber-dim), 0 0 28px rgba(245,158,11,0.09);
        }

        .search-prefix {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px; color: var(--amber);
          background: var(--surface-2);
          padding: 0 14px;
          display: flex; align-items: center;
          border-right: 1px solid var(--border);
          letter-spacing: 0.05em; white-space: nowrap; user-select: none;
        }

        .search-input {
          flex: 1; background: var(--surface);
          border: none; outline: none;
          padding: 14px 14px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 14px; font-weight: 500;
          color: var(--text); letter-spacing: 0.1em; text-transform: uppercase;
        }

        .search-input::placeholder {
          color: var(--text-muted); font-weight: 300;
          letter-spacing: 0.04em; text-transform: none;
        }

        .search-btn {
          background: var(--amber); color: #000;
          border: none; padding: 0 28px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px; font-weight: 700;
          letter-spacing: 0.16em; text-transform: uppercase;
          cursor: pointer; transition: background 0.15s; white-space: nowrap;
        }

        .search-btn:hover { background: #fbbf24; }

        /* ── Stats strip ── */
        .stats-strip {
          display: flex;
          gap: 1px;
          background: var(--border);
          border: 1px solid var(--border);
          border-radius: 5px;
          overflow: hidden;
          margin-bottom: 36px;
        }

        .stat {
			flex: 1;
			background: var(--surface);
			padding: 20px 24px;
			display: flex;
			align-items: center; /* Centers number and text block vertically */
			gap: 16px;
		}

		.stat-value {
		font-family: 'Bebas Neue', sans-serif;
		font-size: 42px; /* Slightly larger */
		color: var(--amber);
		line-height: 1;
		}

        .stat-info { display: flex; flex-direction: column; gap: 2px; }

        .stat-label {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 9px; letter-spacing: 0.2em;
          text-transform: uppercase; color: var(--text-muted);
        }

        .stat-sub {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px; color: var(--text-dim);
        }

        /* ── Table section ── */
        .table-section { }

        .table-header {
          display: flex; align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
        }

        .table-title {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px; letter-spacing: 0.22em;
          text-transform: uppercase; color: var(--text-dim);
          display: flex; align-items: center; gap: 10px;
        }

        .table-title::before {
          content: ''; width: 3px; height: 14px;
          background: var(--amber); border-radius: 1px;
        }

        .table-count {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px; color: var(--text-muted);
          background: var(--surface-2);
          border: 1px solid var(--border);
          padding: 3px 12px; border-radius: 20px;
        }

        .table-wrap {
          border: 1px solid var(--border);
          border-radius: 6px; overflow: hidden;
        }

        .tbl { width: 100%; border-collapse: collapse; }

        .tbl thead tr { background: var(--surface-2); }

        .tbl thead th {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 9px; letter-spacing: 0.22em;
          text-transform: uppercase; color: var(--text-muted);
          padding: 14px 24px; text-align: left; font-weight: 500;
          border-bottom: 1px solid var(--border);
          white-space: nowrap;
        }

        .tbl thead th:last-child { text-align: right; }

        .tbl tbody tr {
          border-bottom: 1px solid var(--border);
          transition: background 0.12s;
        }

        .tbl tbody tr:last-child { border-bottom: none; }
        .tbl tbody tr:hover { background: rgba(245,158,11,0.035); }

        .tbl td { padding: 20px 24px; vertical-align: middle; }
        .tbl td:last-child { text-align: right; }

        .ticker-cell {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 20px; font-weight: 600;
          color: var(--text); letter-spacing: 0.06em;
        }

        .sentiment-badge {
          display: inline-block;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 9px; font-weight: 600;
          letter-spacing: 0.18em; text-transform: uppercase;
          padding: 5px 11px; border-radius: 2px; border: 1px solid;
        }

        .score-cell {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 16px; font-weight: 500; letter-spacing: 0.04em;
        }

        .risk-cell {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px; font-weight: 700;
          letter-spacing: 0.22em; text-transform: uppercase;
        }

        .date-cell {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px; color: var(--text-dim);
        }

        .analysis-btn {
          display: inline-flex; align-items: center; gap: 7px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px; font-weight: 700;
          letter-spacing: 0.16em; text-transform: uppercase;
          color: #000; text-decoration: none;
          background: var(--amber);
          padding: 9px 18px; border-radius: 3px;
          transition: background 0.15s, transform 0.1s;
          white-space: nowrap;
        }

        .analysis-btn:hover { background: #fbbf24; transform: translateY(-1px); }
        .analysis-btn:active { transform: translateY(0); }

        /* ── Empty ── */
        .empty {
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 80px 24px; gap: 14px;
        }

        .empty-hex { font-size: 40px; opacity: 0.1; }

        .empty-text {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px; color: var(--text-muted);
          letter-spacing: 0.15em; text-align: center; line-height: 1.8;
        }

        @media (max-width: 768px) {
          .page { padding: 0 20px 60px; }
          .hero { flex-direction: column; align-items: flex-start; }
          .search-wrap { min-width: 0; width: 100%; }
          .stats-strip { flex-direction: column; }
          .hero-title { font-size: 72px; }
        }
      `}</style>

      <div className="grid-bg" />
      <div className="amber-glow" />

      <div className="page">

        {/* Topbar */}
        <div className="topbar">
          <div className="topbar-logo">SENTINEL</div>
          <div className="topbar-right">
            <div className="live-dot" />
            PIPELINE ACTIVE · DUAL-ANALYSIS ENGINE v1.0
          </div>
        </div>

        {/* Hero row: title left, search right */}
        <div className="hero">
          
          <div className="hero-left">
            <div className="eyebrow">Market Intelligence System</div>
            <div className="hero-title">
              <div>Sentinel</div>
              <span>Consensus</span>
            </div>
            <p className="hero-sub">
              Real-time synthesis of market psychology and fundamental accounting data.
              Enter any ticker to trigger the dual-analysis pipeline.
            </p>
          </div>

          <div className="hero-right">
            {/* Search Bar moved to the right side */}
            <form action={handleSearch}>
              <div className="search-wrap">
                <div className="search-prefix">TICKER://</div>
                <input
                  type="text" name="ticker"
                  className="search-input"
                  placeholder="NVDA, AAPL, TSLA…"
                  required maxLength={10}
                  autoComplete="off" spellCheck={false}
                />
                <button type="submit" className="search-btn">RUN ANALYSIS →</button>
              </div>
            </form>
          </div>

        </div>

        {/* Stats strip */}
        {history.length > 0 && (
          <div className="stats-strip">
            <div className="stat">
              <div className="stat-value">{history.length}</div>
              <div className="stat-info">
                <div className="stat-label">Pipelines Run</div>
                <div className="stat-sub">Total assets analyzed</div>
              </div>
            </div>
            <div className="stat">
              <div className="stat-value" style={{ color: "#10b981" }}>{bullish}</div>
              <div className="stat-info">
                <div className="stat-label">Bullish</div>
                <div className="stat-sub">{Math.round(bullish / history.length * 100)}% of watchlist</div>
              </div>
            </div>
            <div className="stat">
              <div className="stat-value" style={{ color: "#ef4444" }}>{bearish}</div>
              <div className="stat-info">
                <div className="stat-label">Bearish</div>
                <div className="stat-sub">{Math.round(bearish / history.length * 100)}% of watchlist</div>
              </div>
            </div>
            <div className="stat">
              <div className="stat-value" style={{ color: avgScore >= 0 ? "#10b981" : "#ef4444" }}>
                {avgScore >= 0 ? "+" : ""}{avgScore.toFixed(3)}
              </div>
              <div className="stat-info">
                <div className="stat-label">Avg Sentiment</div>
                <div className="stat-sub">Composite index vector</div>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="table-section">
          <div className="table-header">
            <div className="table-title">Recent Pipeline Executions</div>
            <div className="table-count">{history.length} record{history.length !== 1 ? "s" : ""}</div>
          </div>

          <div className="table-wrap">
            {history.length === 0 ? (
              <div className="empty">
                <div className="empty-hex">⬡</div>
                <div className="empty-text">
                  NO DATABASE RECORDS<br />
                  SEARCH A TICKER ABOVE TO INITIATE THE PIPELINE
                </div>
              </div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Consensus</th>
                    <th>Score</th>
                    <th>Risk</th>
                    <th>Last Synced</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((record: any) => {
                    const badge = scoreToBadge(record.average_sentiment_score);
                    const color = scoreToColor(record.average_sentiment_score);
                    return (
                      <tr key={record.id}>
                        <td><span className="ticker-cell">{record.ticker}</span></td>
                        <td>
                          <span
                            className="sentiment-badge"
                            style={{ background: badge.bg, borderColor: badge.border, color: badge.color }}
                          >
                            {record.aggregate_sentiment}
                          </span>
                        </td>
                        <td>
                          <span className="score-cell" style={{ color }}>
                            {record.average_sentiment_score >= 0 ? "+" : ""}
                            {record.average_sentiment_score.toFixed(4)}
                          </span>
                        </td>
                        <td>
                          <span className="risk-cell" style={{ color: riskColor(record.consensus_risk_level) }}>
                            {record.consensus_risk_level}
                          </span>
                        </td>
                        <td>
                          <span className="date-cell">
                            {new Date(record.fetched_at).toLocaleDateString("en-US", {
                              month: "short", day: "2-digit", year: "numeric"
                            })}
                          </span>
                        </td>
                        <td>
                          <Link href={`/ticker/${record.ticker}`} className="analysis-btn">
                            ANALYSIS →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </>
  );
}