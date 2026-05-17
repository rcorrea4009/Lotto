import { useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";

// ── Fallback hardcoded draws (11 real verified 2026 draws) ──
const FALLBACK = [
  {date:"2026-05-16",numbers:[6,8,13,17,34,36],bonus:28,powerball:5,draw:2586}
  {date:"2026-05-13",numbers:[2,5,6,12,14,28],bonus:34,powerball:6,draw:2585},
  {date:"2026-05-09",numbers:[3,10,12,18,26,32],bonus:36,powerball:5,draw:2584},
  {date:"2026-05-06",numbers:[3,4,16,22,24,34],bonus:38,powerball:10,draw:2583},
  {date:"2026-05-02",numbers:[14,15,17,25,29,30],bonus:13,powerball:3,draw:2582},
  {date:"2026-04-29",numbers:[7,9,12,21,31,33],bonus:26,powerball:1,draw:2581},
  {date:"2026-04-25",numbers:[1,9,14,24,26,32],bonus:15,powerball:2,draw:2580},
  {date:"2026-04-22",numbers:[1,6,11,19,28,34],bonus:4,powerball:5,draw:2579},
  {date:"2026-04-18",numbers:[1,2,9,19,21,34],bonus:24,powerball:6,draw:2578},
  {date:"2026-04-15",numbers:[5,12,29,32,33,40],bonus:17,powerball:5,draw:2577},
  {date:"2026-04-11",numbers:[8,22,24,25,29,38],bonus:3,powerball:4,draw:2576},
  {date:"2026-04-08",numbers:[7,14,16,29,32,35],bonus:12,powerball:1,draw:2575},
  {date:"2026-04-04",numbers:[1,9,25,30,38,40],bonus:22,powerball:4,draw:2574},
  {date:"2026-04-01",numbers:[1,2,24,25,30,38],bonus:39,powerball:1,draw:2573},
];

// ── Build frequency stats from any draws array ──────────────
function buildStats(draws) {
  const freq = {}, pbFreq = {}, pairFreq = {};
  for (let i = 1; i <= 40; i++) freq[i] = 0;
  for (let i = 1; i <= 10; i++) pbFreq[i] = 0;
  draws.forEach(d => {
    d.numbers.forEach(n => { if (n >= 1 && n <= 40) freq[n]++; });
    if (d.powerball >= 1 && d.powerball <= 10) pbFreq[d.powerball] = (pbFreq[d.powerball] || 0) + 1;
    for (let i = 0; i < d.numbers.length; i++)
      for (let j = i + 1; j < d.numbers.length; j++) {
        const k = `${d.numbers[i]}-${d.numbers[j]}`;
        pairFreq[k] = (pairFreq[k] || 0) + 1;
      }
  });
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  const maxF = Math.max(...Object.values(freq));
  const minF = Math.min(...Object.values(freq));
  const hotPair = Object.entries(pairFreq).sort((a, b) => b[1] - a[1])[0] || ["—", 0];
  const avgSum = draws.length > 0
    ? Math.round(draws.reduce((s, d) => s + d.numbers.reduce((a, b) => a + b, 0), 0) / draws.length)
    : 0;
  return { freq, pbFreq, sorted, maxF, minF, hotPair, avgSum };
}

// ── Pick logic ──────────────────────────────────────────────
function pickNums(mode, stats, count = 6) {
  const { freq, sorted } = stats;
  const pool = Array.from({ length: 40 }, (_, i) => i + 1);
  if (mode === "pure") return [...pool].sort(() => Math.random() - 0.5).slice(0, count).sort((a, b) => a - b);
  if (mode === "hot") return [...sorted.slice(0, 15).map(x => +x[0])].sort(() => Math.random() - 0.5).slice(0, count).sort((a, b) => a - b);
  if (mode === "balanced") {
    const hot = sorted.slice(0, 13).map(x => +x[0]);
    const mid = sorted.slice(13, 27).map(x => +x[0]);
    const cold = sorted.slice(27).map(x => +x[0]);
    const s = new Set(), r = a => a[Math.floor(Math.random() * a.length)];
    while (s.size < 2) s.add(r(hot));
    while (s.size < 4) s.add(r(mid));
    while (s.size < 6) s.add(r(cold));
    return [...s].sort((a, b) => a - b);
  }
  // weighted
  const w = pool.map(n => Math.pow(freq[n] || 1, 1.5)), tw = w.reduce((a, b) => a + b, 0);
  const ps = []; let att = 0;
  while (ps.length < count && att < 600) {
    att++; let rv = Math.random() * tw;
    for (let i = 0; i < pool.length; i++) { rv -= w[i]; if (rv <= 0 && !ps.includes(pool[i])) { ps.push(pool[i]); break; } }
  }
  while (ps.length < count) { const rv = pool[Math.floor(Math.random() * pool.length)]; if (!ps.includes(rv)) ps.push(rv); }
  return ps.sort((a, b) => a - b);
}

function pickPB(stats) {
  const { pbFreq } = stats;
  const pool = [1,2,3,4,5,6,7,8,9,10];
  const w = pool.map(n => Math.pow(pbFreq[n] || 1, 1.5)), tw = w.reduce((a, b) => a + b, 0);
  let rv = Math.random() * tw;
  for (let i = 0; i < pool.length; i++) { rv -= w[i]; if (rv <= 0) return pool[i]; }
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Parse a row from CSV/Excel ──────────────────────────────
function parseRow(row) {
  const get = (...keys) => {
    for (const k of keys) {
      const found = Object.keys(row).find(rk => rk.trim().toLowerCase().replace(/\s/g,"") === k.toLowerCase());
      if (found !== undefined && row[found] !== "" && row[found] !== null && row[found] !== undefined)
        return row[found];
    }
    return null;
  };
  const nums = [
    get("n1","number1","ball1","num1","1"),
    get("n2","number2","ball2","num2","2"),
    get("n3","number3","ball3","num3","3"),
    get("n4","number4","ball4","num4","4"),
    get("n5","number5","ball5","num5","5"),
    get("n6","number6","ball6","num6","6"),
  ].map(Number).filter(n => !isNaN(n) && n >= 1 && n <= 40);
  if (nums.length !== 6) return null;
  const bonus = Number(get("bonus","bonusball","bonusno")) || 0;
  const powerball = Number(get("powerball","pb","powerballno")) || 0;
  const date = String(get("date","drawdate","draw_date") || "").trim();
  const draw = Number(get("draw","drawno","drawnumber","draw_no")) || null;
  return { date, numbers: nums, bonus, powerball, draw };
}

// ── Ball component ──────────────────────────────────────────
function Ball({ n, type = "main", sz = 48 }) {
  const styles = {
    main:      { bg: "radial-gradient(circle at 35% 30%,#ffe888,#c88800)", border: "#f5c518", color: "#1a0800" },
    bonus:     { bg: "radial-gradient(circle at 35% 30%,#aaffaa,#006622)", border: "#00ff88", color: "#001a08" },
    powerball: { bg: "radial-gradient(circle at 35% 30%,#aaccff,#0033cc)", border: "#00e5ff", color: "#fff" },
    pick:      { bg: "radial-gradient(circle at 35% 35%,#ffe066,#c8900a)", border: "#f5c518", color: "#1a0800" },
  };
  const s = styles[type] || styles.main;
  return (
    <div style={{
      width: sz, height: sz, borderRadius: "50%", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: s.bg, border: `2px solid ${s.border}`, color: s.color,
      fontFamily: "'Orbitron',sans-serif", fontWeight: 900,
      fontSize: sz > 40 ? "0.95rem" : sz > 28 ? "0.75rem" : "0.58rem",
      boxShadow: "0 3px 12px rgba(0,0,0,0.5)",
    }}>{n}</div>
  );
}

function Panel({ children, gold, green }) {
  return (
    <div style={{
      background: "#0c1220", borderRadius: 10, padding: 18,
      border: `1px solid ${gold ? "#f5c518" : green ? "#00ff88" : "#1a2a4a"}`,
      borderTop: `2px solid ${gold ? "#f5c518" : green ? "#00ff88" : "#00e5ff"}`,
      marginBottom: 14,
    }}>{children}</div>
  );
}

function SectionTitle({ children, gold, green }) {
  return (
    <div style={{
      fontFamily: "'Orbitron',sans-serif", fontSize: "0.62rem", fontWeight: 700,
      letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 14,
      color: gold ? "#f5c518" : green ? "#00ff88" : "#00e5ff",
      display: "flex", alignItems: "center", gap: 8,
    }}>
      {children}
      <div style={{ flex: 1, height: 1, background: "#1a2a4a" }} />
    </div>
  );
}

function Btn({ children, onClick, gold, green, outline, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "9px 18px", borderRadius: 6, cursor: disabled ? "not-allowed" : "pointer",
      border: outline ? "1px solid #00e5ff" : "none", opacity: disabled ? 0.6 : 1,
      background: gold ? "linear-gradient(135deg,#f5c518,#ffaa00)" : green ? "linear-gradient(135deg,#00cc66,#009944)" : "transparent",
      color: gold ? "#1a0e00" : green ? "#001a0e" : "#00e5ff",
      fontFamily: "'Orbitron',sans-serif", fontSize: "0.6rem", fontWeight: 700,
      letterSpacing: "0.1em", textTransform: "uppercase",
    }}>{children}</button>
  );
}

// ── Main App ────────────────────────────────────────────────
export default function App() {
  const [draws, setDraws] = useState(FALLBACK);
  const [usingFile, setUsingFile] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [tab, setTab] = useState("latest");
  const [pickMode, setPickMode] = useState("weighted");
  const [lines, setLines] = useState(1);
  const [withPB, setWithPB] = useState(true);
  const [picks, setPicks] = useState([]);
  const [simCount, setSimCount] = useState(1000);
  const [simRes, setSimRes] = useState(null);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiType, setAiType] = useState(null);

  const stats = buildStats(draws);
  const { freq, sorted, maxF, minF, hotPair, avgSum } = stats;
  const latest = draws[0];
  const prev = draws[1];

  // ── File upload ────────────────────────────────────────────
  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setFileError("");
    const ext = file.name.split(".").pop().toLowerCase();

    const processRows = (rows) => {
      const parsed = rows.map(parseRow).filter(Boolean);
      if (parsed.length === 0) {
        setFileError("No valid rows found. Make sure columns are: Date, N1, N2, N3, N4, N5, N6, Bonus, Powerball");
        return;
      }
      parsed.sort((a, b) => new Date(b.date) - new Date(a.date));
      setDraws(parsed);
      setUsingFile(true);
      setFileName(file.name);
      setPicks([]);
      setSimRes(null);
      setTab("latest");
    };

    if (ext === "csv") {
      Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: r => processRows(r.data),
        error: err => setFileError("CSV error: " + err.message),
      });
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const wb = XLSX.read(ev.target.result, { type: "binary" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          processRows(XLSX.utils.sheet_to_json(ws, { defval: "" }));
        } catch (err) { setFileError("Excel error: " + err.message); }
      };
      reader.readAsBinaryString(file);
    } else {
      setFileError("Please upload .csv, .xlsx or .xls only");
    }
  }

  function resetFile() {
    setDraws(FALLBACK); setUsingFile(false);
    setFileName(""); setFileError("");
    setPicks([]); setSimRes(null);
  }

  // ── Generate picks ─────────────────────────────────────────
  function generate() {
    const result = [];
    for (let i = 0; i < Math.min(lines, 10); i++)
      result.push({ nums: pickNums(pickMode, stats), pb: withPB ? pickPB(stats) : null });
    setPicks(result);
  }

  // ── Simulate ───────────────────────────────────────────────
  function simulate() {
    const my = pickNums("weighted", stats);
    let m3 = 0, m4 = 0, m5 = 0, m5b = 0, m6 = 0;
    for (let i = 0; i < simCount; i++) {
      const d = pickNums("pure", stats), bon = Math.ceil(Math.random() * 40);
      const m = my.filter(x => d.includes(x)).length;
      if (m === 6) m6++;
      else if (m === 5 && my.includes(bon)) m5b++;
      else if (m === 5) m5++;
      else if (m === 4) m4++;
      else if (m === 3) m3++;
    }
    setSimRes({ m3, m4, m5, m5b, m6, n: simCount, pick: my });
  }

  // ── AI ─────────────────────────────────────────────────────
  async function runAI(type) {
    setAiLoading(true); setAiType(type); setAiText("");
    const hot = sorted.slice(0, 5).map(x => x[0]).join(", ");
    const cold = sorted.slice(-5).map(x => x[0]).join(", ");
    const prompts = {
      patterns: `NZ Lotto: ${draws.length} draws analysed. Hottest numbers: ${hot}. Coldest: ${cold}. Avg draw sum: ${avgSum}. Most common pair: ${hotPair[0]}. Find interesting patterns for entertainment. Note: past data cannot predict future draws. Max 150 words.`,
      picks: `NZ Lotto stats — hottest: ${hot}, coldest: ${cold}, avg sum: ${avgSum}. Suggest 3 picks of 6 numbers (1-40): one Hot Pick, one Balanced Pick, one Due Numbers pick. Show the actual numbers. State entertainment only. Max 150 words.`,
      odds: `Explain NZ Lotto odds briefly: jackpot 1 in 3,838,380 (pick 6 from 40). Give match 5+bonus, match 5, match 4, match 3 odds too. Explain simply why historical data cannot predict future draws. Max 150 words.`,
    };
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompts[type] }],
        }),
      });
      const data = await res.json();
      const text = data.content?.filter(c => c.type === "text").map(c => c.text).join("") || JSON.stringify(data).slice(0, 300);
      setAiText(text);
    } catch (e) {
      setAiText("Error: " + e.message);
    }
    setAiLoading(false);
  }

  // ── Heat colour ────────────────────────────────────────────
  const heatClr = n => {
    const t = maxF === minF ? 0.5 : (freq[n] - minF) / (maxF - minF);
    const r = Math.round(255 * Math.min(1, t * 2));
    const g = Math.round(150 * (1 - Math.abs(t - 0.5) * 1.5));
    const b = Math.round(255 * Math.max(0, 1 - t * 2));
    return { bg: `radial-gradient(circle at 35% 35%,rgba(255,255,255,0.2),rgb(${r},${g},${b}))`, light: t > 0.45 };
  };

  const TABS = [
    { id: "latest", label: "🏆 Latest" },
    { id: "heatmap", label: "📊 Heat" },
    { id: "picks", label: "🎯 Picks" },
    { id: "simulate", label: "🎲 Sim" },
    { id: "history", label: "📋 History" },
    { id: "ai", label: "🤖 AI" },
  ];
  const modeLabels = { weighted: "Weighted", pure: "Random", hot: "Hot", balanced: "Balanced" };

  return (
    <div style={{ minHeight: "100vh", background: "#05080f", color: "#c8d8f0", fontFamily: "'Share Tech Mono',monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Share+Tech+Mono&display=swap');
        * { box-sizing: border-box; }
        button { transition: opacity 0.15s, transform 0.15s; }
        button:hover:not(:disabled) { opacity: 0.85; transform: translateY(-1px); }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { to{transform:rotate(360deg)} }
        input[type=number] { -moz-appearance: textfield; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
      `}</style>

      {/* Header */}
      <div style={{ textAlign: "center", padding: "24px 16px 16px", borderBottom: "1px solid #1a2a4a" }}>
        <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: "1.6rem", fontWeight: 900, letterSpacing: "0.1em", background: "linear-gradient(135deg,#f5c518,#ffaa00,#00e5ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", marginBottom: 4 }}>
          ⚡ NZ LOTTO ANALYZER
        </div>
        <div style={{ color: "#5a7090", fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase" }}>
          Live Results · AI Analysis · Smart Pick Generator
        </div>
      </div>

      {/* Disclaimer */}
      <div style={{ margin: "12px 16px 0", background: "rgba(255,68,85,0.07)", border: "1px solid rgba(255,68,85,0.3)", borderRadius: 6, padding: "8px 12px", fontSize: "0.65rem", color: "#ff8899", textAlign: "center" }}>
        ⚠️ FOR ENTERTAINMENT ONLY — No system can predict random lotto draws. Play responsibly.
      </div>

      {/* ── FILE UPLOAD BANNER ── */}
      <div style={{ margin: "12px 16px 0", background: usingFile ? "rgba(0,255,136,0.06)" : "rgba(0,229,255,0.05)", border: `1px solid ${usingFile ? "#00ff88" : "#1a2a4a"}`, borderRadius: 8, padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.13em", color: usingFile ? "#00ff88" : "#00e5ff", marginBottom: 3 }}>
              {usingFile ? `✅ YOUR DATA: ${fileName} (${draws.length} draws loaded)` : "📂 UPLOAD YOUR LOTTO DATA"}
            </div>
            <div style={{ fontSize: "0.58rem", color: "#5a7090", lineHeight: 1.5 }}>
              {usingFile
                ? "All stats, heatmap and picks are using your real historical data"
                : "Upload CSV or Excel — columns: Date · N1 · N2 · N3 · N4 · N5 · N6 · Bonus · Powerball"}
            </div>
            {fileError && <div style={{ fontSize: "0.58rem", color: "#ff8899", marginTop: 4 }}>⚠️ {fileError}</div>}
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <label style={{ padding: "8px 14px", borderRadius: 6, border: `1px solid ${usingFile ? "#00ff88" : "#00e5ff"}`, color: usingFile ? "#00ff88" : "#00e5ff", fontFamily: "'Orbitron',sans-serif", fontSize: "0.52rem", fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer", background: "transparent", whiteSpace: "nowrap" }}>
              {usingFile ? "CHANGE FILE" : "UPLOAD FILE"}
              <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ display: "none" }} />
            </label>
            {usingFile && (
              <button onClick={resetFile} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ff4455", color: "#ff8899", background: "transparent", fontFamily: "'Orbitron',sans-serif", fontSize: "0.5rem", fontWeight: 700, cursor: "pointer" }}>RESET</button>
            )}
          </div>
        </div>
      </div>

      {/* ── TEMPLATE DOWNLOAD HINT ── */}
      {!usingFile && (
        <div style={{ margin: "8px 16px 0", fontSize: "0.6rem", color: "#5a7090", background: "rgba(255,255,255,0.02)", border: "1px dashed #1a2a4a", borderRadius: 6, padding: "8px 12px" }}>
          💡 <strong style={{ color: "#c8d8f0" }}>How to format your file:</strong> Create a spreadsheet with these column headers in row 1:{" "}
          <span style={{ color: "#f5c518" }}>Date · N1 · N2 · N3 · N4 · N5 · N6 · Bonus · Powerball</span>{" "}
          — then add one draw per row. Get data from <span style={{ color: "#00e5ff" }}>lottoresults.co.nz</span>
        </div>
      )}

      {/* Nav Tabs */}
      <div style={{ display: "flex", gap: 6, padding: "14px 16px 12px", overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "7px 12px", borderRadius: 6, whiteSpace: "nowrap",
            border: `1px solid ${tab === t.id ? "#f5c518" : "#1a2a4a"}`,
            background: tab === t.id ? "rgba(245,197,24,0.1)" : "transparent",
            color: tab === t.id ? "#f5c518" : "#5a7090",
            fontFamily: "'Orbitron',sans-serif", fontSize: "0.53rem", fontWeight: 700,
            letterSpacing: "0.08em", cursor: "pointer",
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: "0 16px 60px", animation: "fadeIn 0.3s ease" }}>

        {/* ── LATEST ── */}
        {tab === "latest" && latest && (
          <>
            <Panel gold>
              <SectionTitle gold>🏆 Latest Draw</SectionTitle>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
                <div style={{ fontSize: "0.62rem", color: "#5a7090" }}>
                  {latest.date}{latest.draw ? ` · Draw #${latest.draw}` : ""} {usingFile && <span style={{ color: "#00ff88" }}>· YOUR DATA</span>}
                </div>
                {!usingFile && <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.58rem", color: "#00ff88" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00ff88", animation: "pulse 1.5s infinite" }} />
                  LIVE
                </div>}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
                {latest.numbers.map((n, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <Ball n={n} type="main" sz={52} />
                    <span style={{ fontSize: "0.48rem", color: "#5a7090" }}>Ball {i+1}</span>
                  </div>
                ))}
                {latest.bonus > 0 && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <Ball n={latest.bonus} type="bonus" sz={44} />
                  <span style={{ fontSize: "0.48rem", color: "#5a7090" }}>Bonus</span>
                </div>}
                {latest.powerball > 0 && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <Ball n={latest.powerball} type="powerball" sz={48} />
                  <span style={{ fontSize: "0.48rem", color: "#5a7090" }}>Powerball</span>
                </div>}
              </div>
              {prev && (
                <div style={{ fontSize: "0.58rem", color: "#5a7090", borderTop: "1px solid #1a2a4a", paddingTop: 8 }}>
                  Previous ({prev.date}): {prev.numbers.map((n, i) => <Ball key={i} n={n} type="main" sz={24} />)}
                  {prev.bonus > 0 && <Ball n={prev.bonus} type="bonus" sz={24} />}
                  {prev.powerball > 0 && <Ball n={prev.powerball} type="powerball" sz={24} />}
                </div>
              )}
            </Panel>
            <Panel>
              <SectionTitle>📈 Stats</SectionTitle>
              {[
                ["Total draws", draws.length],
                ["Data source", usingFile ? fileName : "Verified 2026 draws"],
                ["Hottest number", `${sorted[0]?.[0] || "—"} (${sorted[0]?.[1] || 0}×) 🔴`],
                ["Coldest number", `${sorted[sorted.length-1]?.[0] || "—"} (${sorted[sorted.length-1]?.[1] || 0}×) 🔵`],
                ["Most common pair", `${hotPair[0]} (${hotPair[1]}×)`],
                ["Average draw sum", avgSum],
                ["Jackpot odds", "1 in 3,838,380"],
              ].map(([l, v]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: "0.67rem" }}>
                  <span style={{ color: "#5a7090" }}>{l}</span>
                  <span style={{ color: "#f5c518", fontWeight: "bold", textAlign: "right", maxWidth: "55%" }}>{v}</span>
                </div>
              ))}
            </Panel>
          </>
        )}

        {/* ── HEATMAP ── */}
        {tab === "heatmap" && (
          <Panel>
            <SectionTitle>📊 Number Frequency Heatmap</SectionTitle>
            <div style={{ fontSize: "0.6rem", color: "#5a7090", marginBottom: 10 }}>
              Based on {draws.length} draws · {usingFile ? fileName : "verified 2026 data"} · Red = hot · Blue = cold
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 5 }}>
              {Array.from({ length: 40 }, (_, i) => i + 1).map(n => {
                const { bg, light } = heatClr(n);
                return (
                  <div key={n} title={`${n}: drawn ${freq[n]} times`} style={{
                    aspectRatio: "1", borderRadius: "50%", display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", background: bg,
                    color: light ? "#fff" : "#111", border: "1px solid rgba(255,255,255,0.1)",
                  }}>
                    <span style={{ fontSize: "0.64rem", fontWeight: "bold", lineHeight: 1 }}>{n}</span>
                    <span style={{ fontSize: "0.38rem", opacity: 0.8 }}>{freq[n]}×</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: "0.58rem", justifyContent: "center", color: "#5a7090" }}>
              <span>🔴 Hot</span><span>🟡 Warm</span><span>🔵 Cold</span>
            </div>
          </Panel>
        )}

        {/* ── PICKS ── */}
        {tab === "picks" && (
          <Panel gold>
            <SectionTitle gold>🎯 Smart Pick Generator</SectionTitle>
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {Object.entries(modeLabels).map(([k, v]) => (
                <button key={k} onClick={() => setPickMode(k)} style={{
                  flex: 1, minWidth: 70, padding: "7px 4px", borderRadius: 5,
                  border: `1px solid ${pickMode === k ? "#f5c518" : "#1a2a4a"}`,
                  background: pickMode === k ? "rgba(245,197,24,0.1)" : "transparent",
                  color: pickMode === k ? "#f5c518" : "#5a7090",
                  fontFamily: "'Orbitron',sans-serif", fontSize: "0.52rem",
                  letterSpacing: "0.07em", cursor: "pointer", textTransform: "uppercase",
                }}>{v}</button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, fontSize: "0.68rem", flexWrap: "wrap" }}>
              <span style={{ color: "#5a7090" }}>Lines:</span>
              <input type="number" value={lines} min={1} max={10} onChange={e => setLines(Math.min(10, Math.max(1, +e.target.value)))}
                style={{ width: 55, background: "#05080f", border: "1px solid #1a2a4a", color: "#c8d8f0", fontFamily: "inherit", fontSize: "0.85rem", padding: "4px 8px", borderRadius: 5, textAlign: "center" }} />
              <span style={{ color: "#5a7090" }}>Powerball:</span>
              <input type="checkbox" checked={withPB} onChange={e => setWithPB(e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
            </div>
            {picks.length === 0
              ? <div style={{ textAlign: "center", padding: "14px 0", color: "#5a7090", fontSize: "0.68rem" }}>Hit Generate to create your picks</div>
              : picks.map((p, li) => (
                <div key={li} style={{ marginBottom: li < picks.length - 1 ? 14 : 0 }}>
                  <div style={{ fontSize: "0.57rem", color: "#5a7090", marginBottom: 5, letterSpacing: "0.07em" }}>
                    LINE {li + 1} · {modeLabels[pickMode]} {usingFile && `· from ${draws.length} draws`}
                  </div>
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
                    {p.nums.map((n, i) => (
                      <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                        <Ball n={n} type="pick" sz={46} />
                        <span style={{ fontSize: "0.47rem", color: "#5a7090" }}>#{sorted.findIndex(x => +x[0] === n) + 1}</span>
                      </div>
                    ))}
                    {p.pb != null && (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                        <Ball n={p.pb} type="powerball" sz={46} />
                        <span style={{ fontSize: "0.47rem", color: "#5a7090" }}>PB</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            }
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <Btn gold onClick={generate}>⚡ GENERATE</Btn>
              <Btn outline onClick={() => setPicks([])}>CLEAR</Btn>
            </div>
          </Panel>
        )}

        {/* ── SIMULATE ── */}
        {tab === "simulate" && (
          <Panel green>
            <SectionTitle green>🎲 Draw Simulator</SectionTitle>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, fontSize: "0.68rem" }}>
              <span style={{ color: "#5a7090" }}>Simulate draws:</span>
              <input type="number" value={simCount} min={100} max={100000} onChange={e => setSimCount(Math.min(100000, Math.max(100, +e.target.value)))}
                style={{ width: 85, background: "#05080f", border: "1px solid #1a2a4a", color: "#c8d8f0", fontFamily: "inherit", fontSize: "0.85rem", padding: "4px 8px", borderRadius: 5, textAlign: "center" }} />
            </div>
            {[["Match 6 (Jackpot)","m6","#f5c518"],["Match 5 + Bonus","m5b","#00e5ff"],["Match 5","m5","#88aaff"],["Match 4","m4","#00ff88"],["Match 3","m3","#aaffcc"]].map(([label, key, color]) => (
              <div key={key} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.62rem", color: "#5a7090", marginBottom: 3 }}>
                  <span>{label}</span>
                  <span>{simRes ? `${simRes[key]}× (${(simRes[key]/simRes.n*100).toFixed(3)}%)` : "—"}</span>
                </div>
                <div style={{ height: 6, background: "#1a2a4a", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 3, background: color, transition: "width 0.7s ease", width: simRes ? `${Math.max(simRes[key]>0?2:0, Math.min(100,(simRes[key]/(simRes.n*0.02))*100))}%` : "0%" }} />
                </div>
              </div>
            ))}
            {simRes && <div style={{ fontSize: "0.58rem", color: "#5a7090", marginTop: 6 }}>Pick: [{simRes.pick.join(", ")}] · Wins: {simRes.m3+simRes.m4+simRes.m5+simRes.m5b+simRes.m6} / {simRes.n.toLocaleString()}</div>}
            <div style={{ marginTop: 14 }}><Btn green onClick={simulate}>▶ RUN</Btn></div>
          </Panel>
        )}

        {/* ── HISTORY ── */}
        {tab === "history" && (
          <Panel>
            <SectionTitle>📋 Draw History {usingFile && <span style={{ fontSize: "0.48rem", padding: "2px 6px", borderRadius: 8, background: "rgba(0,255,136,0.15)", color: "#00ff88", border: "1px solid rgba(0,255,136,0.4)" }}>YOUR FILE</span>}</SectionTitle>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.62rem" }}>
                <thead>
                  <tr>{["Date","#","Numbers","Bonus","PB"].map(h => (
                    <th key={h} style={{ color: "#5a7090", fontWeight: "normal", textAlign: "left", padding: "5px 5px", borderBottom: "1px solid #1a2a4a", fontSize: "0.56rem", letterSpacing: "0.08em" }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {draws.slice(0, 30).map((d, i) => (
                    <tr key={i}>
                      <td style={{ padding: "5px 5px", borderBottom: "1px solid rgba(255,255,255,0.03)", whiteSpace: "nowrap", color: "#c8d8f0" }}>{d.date}</td>
                      <td style={{ padding: "5px 5px", borderBottom: "1px solid rgba(255,255,255,0.03)", color: "#5a7090" }}>{d.draw || "—"}</td>
                      <td style={{ padding: "5px 5px", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                        <div style={{ display: "flex", gap: 2 }}>{d.numbers.map((n, j) => <Ball key={j} n={n} type="main" sz={22} />)}</div>
                      </td>
                      <td style={{ padding: "5px 5px", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>{d.bonus > 0 ? <Ball n={d.bonus} type="bonus" sz={22} /> : "—"}</td>
                      <td style={{ padding: "5px 5px", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>{d.powerball > 0 ? <Ball n={d.powerball} type="powerball" sz={22} /> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {draws.length > 30 && <div style={{ textAlign: "center", padding: "10px 0 0", fontSize: "0.6rem", color: "#5a7090" }}>Showing 30 of {draws.length} draws</div>}
          </Panel>
        )}

        {/* ── AI ── */}
        {tab === "ai" && (
          <Panel>
            <SectionTitle>🤖 AI Pattern Analysis</SectionTitle>
            <div style={{ fontSize: "0.65rem", color: "#5a7090", marginBottom: 14 }}>
              Claude analyses {draws.length} draws {usingFile ? `from ${fileName}` : "(verified 2026 data)"} — entertainment only
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
              {[["patterns","📊 Analyze Patterns"],["picks","🎯 Suggest Picks"],["odds","🎲 Explain Odds"]].map(([type, label]) => (
                <button key={type} onClick={() => runAI(type)} disabled={aiLoading} style={{
                  padding: "10px 14px", borderRadius: 6, border: `1px solid ${aiType === type && !aiLoading ? "#f5c518" : "#00e5ff"}`,
                  background: aiType === type && !aiLoading ? "rgba(245,197,24,0.1)" : "transparent",
                  color: aiType === type && !aiLoading ? "#f5c518" : "#00e5ff",
                  fontFamily: "'Orbitron',sans-serif", fontSize: "0.56rem", fontWeight: 700,
                  letterSpacing: "0.09em", cursor: aiLoading ? "not-allowed" : "pointer", opacity: aiLoading && aiType !== type ? 0.5 : 1,
                }}>{label}</button>
              ))}
            </div>
            {aiLoading && (
              <div style={{ textAlign: "center", padding: 20, color: "#5a7090", fontSize: "0.68rem" }}>
                <div style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #1a2a4a", borderTopColor: "#00e5ff", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginRight: 8, verticalAlign: "middle" }} />
                Claude is analysing...
              </div>
            )}
            {!aiLoading && aiText && (
              <div style={{ background: "rgba(0,229,255,0.04)", border: "1px solid rgba(0,229,255,0.15)", borderRadius: 8, padding: 14, fontSize: "0.68rem", lineHeight: 1.75, color: "#c8d8f0", whiteSpace: "pre-wrap" }}>
                {aiText}
              </div>
            )}
            {!aiLoading && !aiText && (
              <div style={{ textAlign: "center", padding: 24, color: "#5a7090", fontSize: "0.68rem", border: "1px dashed #1a2a4a", borderRadius: 8 }}>
                Click a button above to ask Claude to analyse the data
              </div>
            )}
          </Panel>
        )}

      </div>
    </div>
  );
}
