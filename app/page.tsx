"use client";

import React, { useMemo, useState } from "react";
import Papa from "papaparse";

/* -----------------------------
   TYPES
   ----------------------------- */

type Metric = "wobble" | "nose" | "spin" | "power"; // power = speed proxy

type Drill = {
  id: string;
  metric: Metric;
  title: string;
  description: string;
  url: string;
  credit: string;
};

type Row = {
  id?: string;
  time?: string;
  timeSeconds?: string | number;

  speedMph?: string | number;
  spinRpm?: string | number;
  noseAngle?: string | number;
  hyzerAngle?: string | number;
  wobbleAngle?: string | number;
  launchAngle?: string | number;

  throwType?: string;
  primaryThrowType?: string;
  tags?: string;
  notes?: string;
};

type Throw = {
  idx: number;
  time?: string;
  speed?: number;
  spin?: number;
  nose?: number;
  wobble?: number;
  launch?: number;
  hyzer?: number;
  primaryThrowType?: string;
  throwType?: string;
};

type Band = "Beginner" | "Intermediate" | "Advanced";

type Issue = {
  metric: Metric;
  priority: number;
  headline: string;
  detail: string;
  value?: number;
  unitText: string;
  goalText: string;
};

type GlobalStats = {
  speed: number[];
  spin: number[];
  nose: number[];
  wobble: number[];
  speedSorted: number[];
  spinSorted: number[];
  noseSorted: number[];
  wobbleSorted: number[];
};

/* -----------------------------
   DRILLS (links + credit)
   ----------------------------- */

const DRILLS: Drill[] = [
  {
    id: "wobble-plane",
    metric: "wobble",
    title: "Improve Nose Angle & Swing Plane",
    description: "Keeping the disc on-plane through the release to reduce OAT/wobble.",
    url: "https://www.youtube.com/watch?v=uDbfdt-LMyI",
    credit: "Disc Golf Pro Tour (YouTube)",
  },
  {
    id: "wobble-clean",
    metric: "wobble",
    title: "Backhand Form Basics",
    description: "Clean release mechanics to reduce off-axis torque.",
    url: "https://www.youtube.com/watch?v=RgVGkgnBxuM",
    credit: "Foundations Disc Golf (YouTube)",
  },
  {
    id: "nose-cheat",
    metric: "nose",
    title: "Simple Nose Angle Cheat Sheet",
    description: "Quick cues to control nose angle (avoid nose-up).",
    url: "https://www.youtube.com/watch?v=neeW-UlrZRg",
    credit: "Stepwise Disc Golf (YouTube)",
  },
  {
    id: "nose-drill",
    metric: "nose",
    title: "This Drill Fixed My Nose Angle",
    description: "A focused drill to reduce nose-up throws.",
    url: "https://www.youtube.com/watch?v=FZSyIbGRDZM",
    credit: "Nick Krush Disc Golf & Fitness (YouTube)",
  },
  {
    id: "spin-snap",
    metric: "spin",
    title: "How to Get Snap",
    description: "Late acceleration cues for better spin efficiency.",
    url: "https://www.youtube.com/watch?v=vL5UB1Srbsg",
    credit: "Ben’s Big Drive (YouTube)",
  },
  {
    id: "spin-basic",
    metric: "spin",
    title: "How To Get More Spin Into Your Disc",
    description: "Grip + timing cues for adding spin without muscling.",
    url: "https://www.youtube.com/watch?v=ZBLIBlzDokg",
    credit: "Decent Disc Golf (YouTube)",
  },
  {
    id: "power-pocket",
    metric: "power",
    title: "Power Pocket Shadow Swing Drill",
    description: "Sequencing and late acceleration for power (helps speed/spin).",
    url: "https://www.youtube.com/watch?v=bbAm8X3Upi4",
    credit: "Stepwise Disc Golf (YouTube)",
  },
];

/* -----------------------------
   HELPERS
   ----------------------------- */

const toNum = (v: any): number | undefined => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

const mean = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : undefined);

const sd = (arr: number[]) => {
  if (arr.length < 2) return undefined;
  const m = mean(arr)!;
  const v = arr.reduce((acc, x) => acc + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
};

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function formatMetric(metric: Metric) {
  if (metric === "power") return "Power (Speed)";
  if (metric === "spin") return "Spin";
  if (metric === "nose") return "Nose";
  return "Wobble";
}

function metricUnit(metric: Metric) {
  if (metric === "power") return "mph";
  if (metric === "spin") return "rpm";
  return "°";
}

function goalForMetric(metric: Metric) {
  if (metric === "wobble") return "< 3.0°";
  if (metric === "nose") return "~ +1° to +3°";
  if (metric === "spin") return "≥ 950 rpm";
  return "≥ 52 mph";
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

/* -----------------------------
   SKILL BANDS
   ----------------------------- */

function bandForMetric(metric: Metric, value: number | undefined): { band: Band; note: string; score01: number } {
  if (value === undefined) return { band: "Beginner", note: "No data", score01: 0 };

  if (metric === "wobble") {
    if (value < 3) return { band: "Advanced", note: "Very clean release", score01: 0.9 };
    if (value < 4.5) return { band: "Intermediate", note: "Some OAT; manageable", score01: 0.6 };
    return { band: "Beginner", note: "High OAT/wobble", score01: 0.25 };
  }

  if (metric === "nose") {
    if (value >= 1 && value <= 3) return { band: "Advanced", note: "Driver-friendly nose", score01: 0.9 };
    if (value > 3 && value <= 5) return { band: "Intermediate", note: "Slightly nose-up", score01: 0.55 };
    if (value > 5) return { band: "Beginner", note: "Nose-up (distance leak)", score01: 0.2 };
    if (Math.abs(value) <= 1) return { band: "Intermediate", note: "Near neutral", score01: 0.6 };
    return { band: "Intermediate", note: "Slightly nose-down/neutral", score01: 0.65 };
  }

  if (metric === "spin") {
    if (value >= 1100) return { band: "Advanced", note: "Elite spin", score01: 0.9 };
    if (value >= 950) return { band: "Intermediate", note: "Solid spin", score01: 0.65 };
    return { band: "Beginner", note: "Low spin (timing/clamp)", score01: 0.3 };
  }

  if (value >= 60) return { band: "Advanced", note: "Elite speed", score01: 0.9 };
  if (value >= 52) return { band: "Intermediate", note: "Strong speed", score01: 0.65 };
  return { band: "Beginner", note: "Developing speed", score01: 0.35 };
}

/* -----------------------------
   DIAGNOSIS
   ----------------------------- */

function buildIssues(stats: {
  avgSpeed?: number;
  avgSpin?: number;
  avgNose?: number;
  avgWobble?: number;
}): Issue[] {
  const issues: Issue[] = [];
  const wobble = stats.avgWobble;
  const nose = stats.avgNose;
  const spin = stats.avgSpin;
  const speed = stats.avgSpeed;

  if ((wobble ?? 0) > 4) {
    issues.push({
      metric: "wobble",
      priority: 100,
      value: wobble,
      unitText: "°",
      goalText: "< 3.0°",
      headline: "Wobble is costing you clean flight",
      detail:
        `Avg wobble: ${(wobble ?? 0).toFixed(1)}°. ` +
        "High wobble usually means off-axis torque (release not matching swing plane).",
    });
  } else if ((wobble ?? 0) > 3) {
    issues.push({
      metric: "wobble",
      priority: 60,
      value: wobble,
      unitText: "°",
      goalText: "< 3.0°",
      headline: "Some wobble present",
      detail: `Avg wobble: ${(wobble ?? 0).toFixed(1)}°. Tightening release plane can add consistency and keep spin.`,
    });
  }

  if ((nose ?? 0) > 4) {
    issues.push({
      metric: "nose",
      priority: 90,
      value: nose,
      unitText: "°",
      goalText: "~ +1° to +3°",
      headline: "Nose angle is too high (nose-up)",
      detail:
        `Avg nose: ${(nose ?? 0).toFixed(1)}°. ` +
        "Nose-up bleeds distance even with good speed/spin. Fixing this often adds easy carry.",
    });
  }

  if ((spin ?? 0) > 0 && (spin ?? 0) < 900) {
    issues.push({
      metric: "spin",
      priority: 70,
      value: spin,
      unitText: "rpm",
      goalText: "≥ 950 rpm",
      headline: "Spin is on the low side",
      detail:
        `Avg spin: ${(spin ?? 0).toFixed(0)} rpm. ` +
        "Often improved by later acceleration + cleaner hit (don’t muscle early).",
    });
  }

  if ((speed ?? 0) > 0 && (speed ?? 0) < 50) {
    issues.push({
      metric: "power",
      priority: 40,
      value: speed,
      unitText: "mph",
      goalText: "≥ 52 mph",
      headline: "Speed (power) has room to grow",
      detail:
        `Avg speed: ${(speed ?? 0).toFixed(1)} mph. ` +
        "Sequencing + a later hit usually increases speed without increasing wobble.",
    });
  }

  return issues.sort((a, b) => b.priority - a.priority);
}

/* -----------------------------
   SYNTHETIC GLOBAL STATS (LOCAL FAKE DATA)
   ----------------------------- */

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randNormal(rng: () => number) {
  let u = 0,
    v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function generateSyntheticGlobalStats(nSessions = 6000, seed = 1337): GlobalStats {
  const rng = mulberry32(seed);

  const speed: number[] = [];
  const spin: number[] = [];
  const nose: number[] = [];
  const wobble: number[] = [];

  for (let i = 0; i < nSessions; i++) {
    const skill = randNormal(rng);

    const spd = clamp(47 + 4.2 * skill + 3.8 * randNormal(rng), 25, 68);
    const wob = clamp(4.3 - 0.9 * skill + 0.9 * Math.abs(randNormal(rng)), 0.8, 11.0);
    const nos = clamp(3.0 - 0.4 * skill + 0.55 * (wob - 3.5) + 1.8 * randNormal(rng), -6, 14);
    const spn = clamp(860 + 10.5 * (spd - 45) + 70 * skill - 20 * (wob - 3.5) + 85 * randNormal(rng), 350, 1250);

    speed.push(spd);
    wobble.push(wob);
    nose.push(nos);
    spin.push(spn);
  }

  const speedSorted = [...speed].sort((a, b) => a - b);
  const spinSorted = [...spin].sort((a, b) => a - b);
  const noseSorted = [...nose].sort((a, b) => a - b);
  const wobbleSorted = [...wobble].sort((a, b) => a - b);

  return { speed, spin, nose, wobble, speedSorted, spinSorted, noseSorted, wobbleSorted };
}

function percentileOf(value: number, sortedAsc: number[], higherIsBetter: boolean) {
  if (!sortedAsc.length) return undefined;
  let lo = 0;
  let hi = sortedAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  const frac = lo / sortedAsc.length;
  const p = higherIsBetter ? frac : 1 - frac;
  return Math.round(p * 100);
}

/* -----------------------------
   HISTOGRAM GRAPH (SVG)
   ----------------------------- */

function computeHistogram(values: number[], bins: number, min: number, max: number) {
  const counts = new Array(bins).fill(0);
  const span = max - min;
  if (span <= 0) return { counts, min, max };

  for (const v of values) {
    const t = (v - min) / span;
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(t * bins)));
    counts[idx]++;
  }
  return { counts, min, max };
}

function valueToX(value: number, min: number, max: number, width: number) {
  if (max <= min) return 0;
  return ((value - min) / (max - min)) * width;
}

function niceRange(metric: Metric, values: number[]) {
  // Uses data range but pads a bit for nicer visuals.
  const vmin = Math.min(...values);
  const vmax = Math.max(...values);
  const pad = (vmax - vmin) * 0.08 || 1;

  // For each metric, keep a sensible clamp so outliers don't ruin chart
  if (metric === "spin") return { min: Math.max(300, vmin - pad), max: Math.min(1300, vmax + pad) };
  if (metric === "power") return { min: Math.max(20, vmin - pad), max: Math.min(75, vmax + pad) };
  if (metric === "nose") return { min: Math.max(-10, vmin - pad), max: Math.min(18, vmax + pad) };
  return { min: Math.max(0, vmin - pad), max: Math.min(12, vmax + pad) };
}

function metricToGlobalArray(metric: Metric, g: GlobalStats) {
  if (metric === "spin") return g.spin;
  if (metric === "power") return g.speed;
  if (metric === "nose") return g.nose;
  return g.wobble;
}

function metricToSortedArray(metric: Metric, g: GlobalStats) {
  if (metric === "spin") return g.spinSorted;
  if (metric === "power") return g.speedSorted;
  if (metric === "nose") return g.noseSorted;
  return g.wobbleSorted;
}

function metricMean(metric: Metric, g: GlobalStats) {
  const arr = metricToGlobalArray(metric, g);
  return mean(arr);
}

// For nose percentile we treat closeness to +2 as better, so we build a "distance" distribution
function nosePercentileFromAvg(avgNose: number, g: GlobalStats) {
  const target = 2;
  const distArr = g.nose.map((n) => Math.abs(n - target)).sort((a, b) => a - b);
  const userDist = Math.abs(avgNose - target);
  return percentileOf(userDist, distArr, false);
}

/* -----------------------------
   STYLES
   ----------------------------- */

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: 28,
    background:
      "radial-gradient(1200px 700px at 10% 10%, rgba(40,60,90,0.35) 0%, rgba(10,10,14,1) 55%, rgba(6,6,8,1) 100%)",
    color: "#eef3ff",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
  },
  container: { maxWidth: 1020, margin: "0 auto" },
  title: { fontSize: 36, margin: 0, letterSpacing: "-0.03em" },
  subtitle: { margin: "6px 0 18px", color: "rgba(238,243,255,0.70)", fontSize: 14 },

  controlsCard: {
    padding: 14,
    borderRadius: 18,
    background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
    border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  button: {
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "#eef3ff",
    cursor: "pointer",
    fontSize: 13,
  },

  grid: { display: "grid", gridTemplateColumns: "1fr", gap: 14 },

  card: {
    padding: 18,
    borderRadius: 20,
    background: "rgba(0,0,0,0.35)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 22px 70px rgba(0,0,0,0.55)",
  },
  cardTitle: { margin: 0, fontSize: 18, letterSpacing: "-0.01em" },

  pillRow: { marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 },
  pill: {
    padding: "7px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    fontSize: 12,
    color: "rgba(238,243,255,0.92)",
  },

  metricGrid: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: 12,
  },
  metricCard: {
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  metricName: { margin: 0, fontSize: 14, color: "rgba(238,243,255,0.85)" },
  metricValue: { margin: "6px 0 6px", fontSize: 22, letterSpacing: "-0.02em" },
  metricSub: { margin: 0, fontSize: 12, color: "rgba(238,243,255,0.65)", lineHeight: 1.35 },

  barWrap: {
    marginTop: 10,
    height: 10,
    borderRadius: 999,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, rgba(188,215,255,0.9), rgba(140,255,210,0.7))",
  },

  diagHeadline: { fontSize: 24, margin: "10px 0 6px", letterSpacing: "-0.02em" },
  diagDetail: { margin: 0, color: "rgba(238,243,255,0.78)", lineHeight: 1.45 },

  metricBadge: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(188,215,255,0.14)",
    border: "1px solid rgba(188,215,255,0.25)",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },

  drillsGrid: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: 12,
  },
  drillCard: {
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  drillTitle: { margin: 0, fontSize: 15, letterSpacing: "-0.01em" },
  drillDesc: { margin: "8px 0 10px", fontSize: 13, color: "rgba(238,243,255,0.78)", lineHeight: 1.4 },
  link: { color: "#bcd7ff", textDecoration: "none", fontSize: 13 },
  credit: { display: "block", marginTop: 6, color: "rgba(238,243,255,0.55)", fontSize: 12 },

  tableWrap: {
    marginTop: 12,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    overflow: "hidden",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left",
    padding: "10px 10px",
    background: "rgba(255,255,255,0.06)",
    borderBottom: "1px solid rgba(255,255,255,0.10)",
    color: "rgba(238,243,255,0.85)",
    position: "sticky",
    top: 0,
  },
  td: {
    padding: "9px 10px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    color: "rgba(238,243,255,0.82)",
    whiteSpace: "nowrap",
  },
  muted: { color: "rgba(238,243,255,0.55)" },

  footer: { marginTop: 18, textAlign: "center", color: "rgba(238,243,255,0.45)", fontSize: 12 },
};

/* -----------------------------
   SMALL SVG COMPONENT
   ----------------------------- */

function Histogram({
  metric,
  globalValues,
  globalAvg,
  userValue,
  width = 520,
  height = 140,
}: {
  metric: Metric;
  globalValues: number[];
  globalAvg: number;
  userValue?: number;
  width?: number;
  height?: number;
}) {
  const bins = 24;
  const { min, max } = niceRange(metric, globalValues);
  const { counts } = computeHistogram(globalValues, bins, min, max);
  const maxCount = Math.max(...counts, 1);

  const padding = { left: 10, right: 10, top: 10, bottom: 22 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const barW = plotW / bins;

  const xGlobal = valueToX(globalAvg, min, max, plotW);
  const xUser = userValue !== undefined ? valueToX(userValue, min, max, plotW) : undefined;

  // optional "goal band" (subtle)
  let goalBand: { from: number; to: number } | null = null;
  if (metric === "nose") goalBand = { from: 1, to: 3 };
  if (metric === "wobble") goalBand = { from: 0, to: 3 };
  if (metric === "spin") goalBand = { from: 950, to: 1200 };
  if (metric === "power") goalBand = { from: 52, to: 75 };

  const bandX1 = goalBand ? valueToX(goalBand.from, min, max, plotW) : 0;
  const bandX2 = goalBand ? valueToX(goalBand.to, min, max, plotW) : 0;

  const labelMin = min;
  const labelMax = max;

  const tickStyle = { fill: "rgba(238,243,255,0.55)", fontSize: 11 };

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${metric} global distribution`}>
      {/* background */}
      <rect x="0" y="0" width={width} height={height} rx="14" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.10)" />

      <g transform={`translate(${padding.left},${padding.top})`}>
        {/* goal band */}
        {goalBand && (
          <rect
            x={Math.min(bandX1, bandX2)}
            y={0}
            width={Math.abs(bandX2 - bandX1)}
            height={plotH}
            fill="rgba(140,255,210,0.10)"
          />
        )}

        {/* bars */}
        {counts.map((c, i) => {
          const h = (c / maxCount) * plotH;
          return (
            <rect
              key={i}
              x={i * barW + 1}
              y={plotH - h}
              width={Math.max(1, barW - 2)}
              height={h}
              rx="2"
              fill="rgba(188,215,255,0.22)"
            />
          );
        })}

        {/* global avg line */}
        <line x1={xGlobal} y1={0} x2={xGlobal} y2={plotH} stroke="rgba(188,215,255,0.95)" strokeWidth="2" />
        <text x={xGlobal + 4} y={12} fill="rgba(188,215,255,0.95)" fontSize="11" fontWeight="700">
          Global avg
        </text>

        {/* user line */}
        {xUser !== undefined && (
          <>
            <line x1={xUser} y1={0} x2={xUser} y2={plotH} stroke="rgba(140,255,210,0.95)" strokeWidth="2" />
            <text x={xUser + 4} y={28} fill="rgba(140,255,210,0.95)" fontSize="11" fontWeight="700">
              You
            </text>
          </>
        )}

        {/* x-axis labels */}
        <text x={0} y={plotH + 18} {...tickStyle}>
          {labelMin.toFixed(metric === "spin" ? 0 : 1)}
        </text>
        <text x={plotW - 42} y={plotH + 18} {...tickStyle}>
          {labelMax.toFixed(metric === "spin" ? 0 : 1)}
        </text>
      </g>
    </svg>
  );
}

/* -----------------------------
   PAGE
   ----------------------------- */

export default function Page() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Synthetic global stats created on load
  const globalStats = useMemo(() => generateSyntheticGlobalStats(6000, 1337), []);

  const globalAverages = useMemo(() => {
    return {
      speed: mean(globalStats.speed) ?? 0,
      spin: mean(globalStats.spin) ?? 0,
      nose: mean(globalStats.nose) ?? 0,
      wobble: mean(globalStats.wobble) ?? 0,
    };
  }, [globalStats]);

  const throws: Throw[] = useMemo(
    () =>
      rows.map((r, idx) => ({
        idx: idx + 1,
        time: r.time,
        speed: toNum(r.speedMph),
        spin: toNum(r.spinRpm),
        nose: toNum(r.noseAngle),
        wobble: toNum(r.wobbleAngle),
        launch: toNum(r.launchAngle),
        hyzer: toNum(r.hyzerAngle),
        primaryThrowType: r.primaryThrowType,
        throwType: r.throwType,
      })),
    [rows]
  );

  const cleanThrows = useMemo(() => throws.filter((t) => t.speed !== undefined || t.spin !== undefined), [throws]);

  const stats = useMemo(() => {
    const speeds = cleanThrows.map((t) => t.speed).filter((v): v is number => typeof v === "number");
    const spins = cleanThrows.map((t) => t.spin).filter((v): v is number => typeof v === "number");
    const noses = cleanThrows.map((t) => t.nose).filter((v): v is number => typeof v === "number");
    const wobbles = cleanThrows.map((t) => t.wobble).filter((v): v is number => typeof v === "number");

    return {
      count: cleanThrows.length,
      avgSpeed: mean(speeds),
      avgSpin: mean(spins),
      avgNose: mean(noses),
      avgWobble: mean(wobbles),
      sdSpeed: sd(speeds),
      sdSpin: sd(spins),
      sdNose: sd(noses),
      sdWobble: sd(wobbles),
      bestSpeed: speeds.length ? Math.max(...speeds) : undefined,
      bestSpin: spins.length ? Math.max(...spins) : undefined,
    };
  }, [cleanThrows]);

  const issues = useMemo(() => buildIssues(stats), [stats]);

  const drillsByMetric = useMemo(() => {
    const map = new Map<Metric, Drill[]>();
    (["wobble", "nose", "spin", "power"] as Metric[]).forEach((m) => map.set(m, []));
    DRILLS.forEach((d) => {
      map.get(d.metric)?.push(d);
    });
    return map;
  }, []);

  const percentiles = useMemo(() => {
    const out: Partial<Record<Metric, number>> = {};
    if (stats.avgSpeed !== undefined) out.power = percentileOf(stats.avgSpeed, globalStats.speedSorted, true);
    if (stats.avgSpin !== undefined) out.spin = percentileOf(stats.avgSpin, globalStats.spinSorted, true);
    if (stats.avgWobble !== undefined) out.wobble = percentileOf(stats.avgWobble, globalStats.wobbleSorted, false);
    if (stats.avgNose !== undefined) out.nose = nosePercentileFromAvg(stats.avgNose, globalStats);
    return out;
  }, [stats.avgSpeed, stats.avgSpin, stats.avgWobble, stats.avgNose, globalStats]);

  const parseCsv = (file: File) => {
    setError(null);
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        if (res.errors?.length) {
          setError(res.errors[0].message || "CSV parse error");
          return;
        }
        setRows(res.data ?? []);
      },
    });
  };

  const hasUserData = cleanThrows.length > 0;

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>Throwlytics – Disc Golf Throw Analytics</h1>
        <p style={styles.subtitle}>
          Upload throws.csv. All analysis runs locally in your browser. Global distributions below are currently simulated (synthetic data) for UI/testing.
        </p>

        <div style={styles.controlsCard}>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) parseCsv(f);
            }}
          />
          <button
            style={styles.button}
            onClick={() => {
              setRows([]);
              setError(null);
            }}
          >
            Clear
          </button>
          {error && <span style={{ color: "#ffb4b4", fontSize: 13 }}>{error}</span>}
        </div>

        {/* Global overview (shown even before upload) */}
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Global Benchmarks (Simulated)</h2>
          <p style={styles.diagDetail}>
            These are synthetic “site-wide” distributions so we can build and test the UI without collecting any real user data.
          </p>

          <div style={styles.pillRow}>
            <span style={styles.pill}>Global avg speed: <b>{globalAverages.speed.toFixed(1)} mph</b></span>
            <span style={styles.pill}>Global avg spin: <b>{globalAverages.spin.toFixed(0)} rpm</b></span>
            <span style={styles.pill}>Global avg nose: <b>{globalAverages.nose.toFixed(1)}°</b></span>
            <span style={styles.pill}>Global avg wobble: <b>{globalAverages.wobble.toFixed(1)}°</b></span>
          </div>

          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
            {(["power", "spin", "nose", "wobble"] as Metric[]).map((m) => {
              const gArr = metricToGlobalArray(m, globalStats);
              const gAvg = metricMean(m, globalStats) ?? 0;

              const userVal =
                m === "power" ? stats.avgSpeed :
                m === "spin" ? stats.avgSpin :
                m === "nose" ? stats.avgNose :
                stats.avgWobble;

              const p = percentiles[m];

              return (
                <div key={m} style={styles.metricCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <p style={styles.metricName}>{formatMetric(m)}</p>
                      <p style={{ ...styles.metricSub, marginTop: 6 }}>
                        Global avg: <b>{m === "spin" ? gAvg.toFixed(0) : gAvg.toFixed(1)} {metricUnit(m)}</b>
                        {hasUserData && userVal !== undefined ? (
                          <>
                            {" "}• You:{" "}
                            <b>{m === "spin" ? userVal.toFixed(0) : userVal.toFixed(1)} {metricUnit(m)}</b>
                            {" "}• Percentile: <b>{p !== undefined ? `${p}th` : "—"}</b>
                          </>
                        ) : (
                          <>
                            {" "}• Upload a CSV to see your marker + percentile
                          </>
                        )}
                      </p>
                    </div>
                    <div style={{ ...styles.pill, opacity: 0.9 }}>
                      Goal: <b>{goalForMetric(m)}</b>
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <Histogram
                      metric={m}
                      globalValues={gArr}
                      globalAvg={gAvg}
                      userValue={hasUserData ? userVal : undefined}
                    />
                    <p style={{ ...styles.metricSub, marginTop: 8 }}>
                      <span style={styles.muted}>
                        Blue line = global avg • Green line = you • Shaded area ≈ goal range
                      </span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {hasUserData ? (
          <div style={styles.grid}>
            {/* Session Summary */}
            <section style={styles.card}>
              <h2 style={styles.cardTitle}>Session Summary</h2>
              <div style={styles.pillRow}>
                <span style={styles.pill}>Throws: {stats.count}</span>
                <span style={styles.pill}>Avg Speed: {stats.avgSpeed?.toFixed(1) ?? "—"} mph</span>
                <span style={styles.pill}>Avg Spin: {stats.avgSpin?.toFixed(0) ?? "—"} rpm</span>
                <span style={styles.pill}>Avg Nose: {stats.avgNose?.toFixed(1) ?? "—"}°</span>
                <span style={styles.pill}>Avg Wobble: {stats.avgWobble?.toFixed(1) ?? "—"}°</span>
                <span style={styles.pill}>Best Speed: {stats.bestSpeed?.toFixed(1) ?? "—"} mph</span>
                <span style={styles.pill}>Best Spin: {stats.bestSpin?.toFixed(0) ?? "—"} rpm</span>
              </div>

              {/* Metric Breakdown */}
              <div style={styles.metricGrid}>
                {([
                  { metric: "wobble" as Metric, value: stats.avgWobble },
                  { metric: "nose" as Metric, value: stats.avgNose },
                  { metric: "spin" as Metric, value: stats.avgSpin },
                  { metric: "power" as Metric, value: stats.avgSpeed },
                ]).map(({ metric, value }) => {
                  const b = bandForMetric(metric, value);
                  const p = percentiles[metric];
                  const unit = metricUnit(metric);

                  let displayValue = "—";
                  if (value !== undefined) displayValue = metric === "spin" ? `${value.toFixed(0)} ${unit}` : `${value.toFixed(1)} ${unit}`;

                  return (
                    <div key={metric} style={styles.metricCard}>
                      <p style={styles.metricName}>{formatMetric(metric)}</p>
                      <div style={styles.metricValue}>{displayValue}</div>
                      <p style={styles.metricSub}>
                        <b>{b.band}</b> • {b.note}
                      </p>
                      <div style={styles.barWrap}>
                        <div style={{ ...styles.barFill, width: `${clamp01(b.score01) * 100}%` }} />
                      </div>
                      <p style={{ ...styles.metricSub, marginTop: 8 }}>
                        <span style={styles.muted}>
                          Simulated global percentile:{" "}
                          <b style={{ color: "rgba(238,243,255,0.85)" }}>{p !== undefined ? `${p}th` : "—"}</b>{" "}
                          • Goal: {goalForMetric(metric)}
                        </span>
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Diagnosis */}
            <section style={styles.card}>
              <h2 style={styles.cardTitle}>Diagnosis</h2>

              {issues.length === 0 ? (
                <>
                  <div style={styles.diagHeadline}>No major issues detected</div>
                  <p style={styles.diagDetail}>
                    Your averages don’t trigger red flags. Next gains usually come from tighter variability (same release every time) and small angle tuning.
                  </p>
                </>
              ) : (
                <>
                  <div style={styles.diagHeadline}>Top opportunities (ranked)</div>
                  <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
                    {issues.map((iss) => {
                      const p = percentiles[iss.metric];
                      const niceMetric = formatMetric(iss.metric);

                      return (
                        <div key={iss.metric} style={{ ...styles.metricCard, background: "rgba(255,255,255,0.035)" }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={styles.metricBadge}>{iss.metric}</span>
                            <span style={{ fontWeight: 900, fontSize: 15 }}>{iss.headline}</span>

                            <span style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <span style={styles.pill}>
                                {niceMetric} avg:{" "}
                                <b>
                                  {iss.value === undefined
                                    ? "—"
                                    : iss.metric === "spin"
                                      ? `${iss.value.toFixed(0)} ${iss.unitText}`
                                      : `${iss.value.toFixed(1)} ${iss.unitText}`}
                                </b>
                              </span>
                              <span style={{ ...styles.pill, opacity: 0.85 }}>Goal: {iss.goalText}</span>
                              <span style={{ ...styles.pill, opacity: 0.85 }}>
                                Percentile: <b>{p !== undefined ? `${p}th` : "—"}</b>
                              </span>
                            </span>
                          </div>

                          <p style={{ ...styles.diagDetail, marginTop: 10 }}>{iss.detail}</p>

                          <div style={{ marginTop: 12, fontWeight: 800, fontSize: 13 }}>Recommended Drills</div>
                          <div style={styles.drillsGrid}>
                            {(drillsByMetric.get(iss.metric) ?? []).map((d) => (
                              <div key={d.id} style={styles.drillCard}>
                                <h3 style={styles.drillTitle}>{d.title}</h3>
                                <p style={styles.drillDesc}>{d.description}</p>
                                <a style={styles.link} href={d.url} target="_blank" rel="noreferrer">
                                  Watch on YouTube →
                                </a>
                                <small style={styles.credit}>Credit: {d.credit}</small>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </section>

            {/* All Throws */}
            <section style={styles.card}>
              <h2 style={styles.cardTitle}>All Throws</h2>
              <p style={styles.diagDetail}>Every row from your CSV (local only).</p>

              <div style={styles.tableWrap}>
                <div style={{ maxHeight: 340, overflow: "auto" }}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>#</th>
                        <th style={styles.th}>Time</th>
                        <th style={styles.th}>Type</th>
                        <th style={styles.th}>Speed</th>
                        <th style={styles.th}>Spin</th>
                        <th style={styles.th}>Nose</th>
                        <th style={styles.th}>Wobble</th>
                        <th style={styles.th}>Launch</th>
                        <th style={styles.th}>Hyzer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cleanThrows.map((t) => (
                        <tr key={t.idx}>
                          <td style={styles.td}>{t.idx}</td>
                          <td style={styles.td}>{t.time ?? <span style={styles.muted}>—</span>}</td>
                          <td style={styles.td}>{t.primaryThrowType ?? t.throwType ?? <span style={styles.muted}>—</span>}</td>
                          <td style={styles.td}>{t.speed !== undefined ? `${t.speed.toFixed(1)} mph` : <span style={styles.muted}>—</span>}</td>
                          <td style={styles.td}>{t.spin !== undefined ? `${t.spin.toFixed(0)} rpm` : <span style={styles.muted}>—</span>}</td>
                          <td style={styles.td}>{t.nose !== undefined ? `${t.nose.toFixed(1)}°` : <span style={styles.muted}>—</span>}</td>
                          <td style={styles.td}>{t.wobble !== undefined ? `${t.wobble.toFixed(1)}°` : <span style={styles.muted}>—</span>}</td>
                          <td style={styles.td}>{t.launch !== undefined ? `${t.launch.toFixed(1)}°` : <span style={styles.muted}>—</span>}</td>
                          <td style={styles.td}>{t.hyzer !== undefined ? `${t.hyzer.toFixed(1)}°` : <span style={styles.muted}>—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        <footer style={styles.footer}>
          Drill videos are linked from YouTube. Credit belongs to the original creators. Percentiles/graphs are currently simulated with synthetic data.
        </footer>
      </div>
    </main>
  );
}
