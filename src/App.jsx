import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, ComposedChart
} from "recharts";

// ─── City base data: lat/lng/country are fixed; all env values start as null ──
const CITY_BASE = {
  "Delhi":     { lat:28.67,  lng:77.21,   country:"India",     flag:"IN" },
  "Beijing":   { lat:39.90,  lng:116.40,  country:"China",     flag:"CN" },
  "Cairo":     { lat:30.04,  lng:31.24,   country:"Egypt",     flag:"EG" },
  "Mumbai":    { lat:19.08,  lng:72.88,   country:"India",     flag:"IN" },
  "Lagos":     { lat:6.52,   lng:3.38,    country:"Nigeria",   flag:"NG" },
  "Sao Paulo": { lat:-23.55, lng:-46.63,  country:"Brazil",    flag:"BR" },
  "New York":  { lat:40.71,  lng:-74.01,  country:"USA",       flag:"US" },
  "Tokyo":     { lat:35.69,  lng:139.69,  country:"Japan",     flag:"JP" },
  "Paris":     { lat:48.85,  lng:2.35,    country:"France",    flag:"FR" },
  "London":    { lat:51.51,  lng:-0.13,   country:"UK",        flag:"GB" },
  "Sydney":    { lat:-33.87, lng:151.21,  country:"Australia", flag:"AU" },
  "Singapore": { lat:1.35,   lng:103.82,  country:"Singapore", flag:"SG" },
};

// ─── Fallback static data used when no API key or fetch fails ─────────────────
const CITY_FALLBACK = {
  "Delhi":     { aqi:218, pm25:92,  pm10:168, temp:32.1, humidity:52, rainfall:2.1,  o3:68,  no2:72, co:1.8 },
  "Beijing":   { aqi:148, pm25:62,  pm10:115, temp:14.2, humidity:44, rainfall:1.4,  o3:82,  no2:58, co:1.4 },
  "Cairo":     { aqi:188, pm25:78,  pm10:142, temp:29.5, humidity:38, rainfall:0.2,  o3:55,  no2:65, co:1.6 },
  "Mumbai":    { aqi:162, pm25:68,  pm10:132, temp:30.8, humidity:72, rainfall:8.4,  o3:48,  no2:52, co:1.3 },
  "Lagos":     { aqi:128, pm25:48,  pm10:88,  temp:28.4, humidity:78, rainfall:6.8,  o3:42,  no2:45, co:1.1 },
  "Sao Paulo": { aqi:105, pm25:38,  pm10:72,  temp:22.5, humidity:65, rainfall:5.2,  o3:58,  no2:48, co:0.9 },
  "New York":  { aqi:52,  pm25:12,  pm10:22,  temp:12.8, humidity:58, rainfall:3.2,  o3:55,  no2:28, co:0.5 },
  "Tokyo":     { aqi:58,  pm25:14,  pm10:28,  temp:16.2, humidity:62, rainfall:4.8,  o3:62,  no2:32, co:0.4 },
  "Paris":     { aqi:48,  pm25:11,  pm10:21,  temp:13.5, humidity:72, rainfall:4.2,  o3:58,  no2:25, co:0.4 },
  "London":    { aqi:42,  pm25:9,   pm10:18,  temp:11.2, humidity:76, rainfall:4.8,  o3:52,  no2:22, co:0.3 },
  "Sydney":    { aqi:28,  pm25:6,   pm10:12,  temp:18.8, humidity:62, rainfall:3.4,  o3:45,  no2:15, co:0.2 },
  "Singapore": { aqi:55,  pm25:13,  pm10:25,  temp:28.5, humidity:82, rainfall:6.8,  o3:48,  no2:18, co:0.3 },
};

// ─── Convert OpenWeatherMap AQI (1-5 scale) to US EPA AQI estimate ────────────
function owmAqiToEpa(owmAqi, pm25) {
  // OWM uses 1-5 scale. We derive a more meaningful value from PM2.5 if available.
  if (pm25 !== undefined) {
    // EPA AQI breakpoints for PM2.5
    const bp = [
      [0,    12,    0,   50],
      [12.1, 35.4,  51,  100],
      [35.5, 55.4,  101, 150],
      [55.5, 150.4, 151, 200],
      [150.5,250.4, 201, 300],
      [250.5,500,   301, 500],
    ];
    for (const [cLow, cHigh, iLow, iHigh] of bp) {
      if (pm25 >= cLow && pm25 <= cHigh) {
        return Math.round(((iHigh - iLow) / (cHigh - cLow)) * (pm25 - cLow) + iLow);
      }
    }
    return 500;
  }
  const map = { 1:25, 2:75, 3:125, 4:175, 5:275 };
  return map[owmAqi] || 50;
}

// ─── Fetch live data for one city from OpenWeatherMap ─────────────────────────
async function fetchCityLive(cityName, apiKey) {
  const b = CITY_BASE[cityName];
  const { lat, lng } = b;

  const [weatherRes, airRes] = await Promise.all([
    fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`),
    fetch(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lng}&appid=${apiKey}`),
  ]);

  if (!weatherRes.ok || !airRes.ok) throw new Error("API error " + weatherRes.status);

  const weather = await weatherRes.json();
  const air     = await airRes.json();

  const comp    = air.list[0].components;
  const owmAqi  = air.list[0].main.aqi;
  const pm25    = parseFloat((comp.pm2_5 || 0).toFixed(1));
  const pm10    = parseFloat((comp.pm10  || 0).toFixed(1));
  const o3      = parseFloat((comp.o3    || 0).toFixed(1));
  const no2     = parseFloat((comp.no2   || 0).toFixed(1));
  const co      = parseFloat(((comp.co   || 0) / 1000).toFixed(2)); // µg/m³ → mg/m³
  const temp    = parseFloat((weather.main.temp).toFixed(1));
  const humidity= Math.round(weather.main.humidity);
  const rainfall= parseFloat(((weather.rain?.["1h"] || weather.rain?.["3h"] || 0)).toFixed(1));
  const aqi     = owmAqiToEpa(owmAqi, pm25);

  return { aqi, pm25, pm10, temp, humidity, rainfall, o3, no2, co };
}

// Build CITY_DB merging base + env data (live or fallback)
function buildCityDB(liveData) {
  const db = {};
  for (const city of Object.keys(CITY_BASE)) {
    const env = (liveData && liveData[city]) ? liveData[city] : CITY_FALLBACK[city];
    db[city] = { ...CITY_BASE[city], ...env };
  }
  return db;
}

const CITIES = Object.keys(CITY_BASE);

// EPA AQI 6-tier scale
function aqiMeta(v) {
  if (v <= 50)  return { label: "Good",                color: "#22c55e" };
  if (v <= 100) return { label: "Moderate",            color: "#eab308" };
  if (v <= 150) return { label: "Sensitive Groups",    color: "#f97316" };
  if (v <= 200) return { label: "Unhealthy",           color: "#ef4444" };
  if (v <= 300) return { label: "Very Unhealthy",      color: "#a855f7" };
  return               { label: "Hazardous",           color: "#dc2626" };
}

// Generate realistic trend data seeded by city + index so it's stable
function genTrend(cityKey, range, cityDB) {
  const base  = cityDB[cityKey];
  const count = range === "7d" ? 7 : range === "30d" ? 30 : 12;
  const weekLabels  = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const monthLabels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return Array.from({ length: count }, (_, i) => {
    const seasonal = Math.sin((i / count) * Math.PI * 2 - Math.PI / 2) * 0.28;
    // Use deterministic pseudo-random based on city + index
    const seed     = (cityKey.charCodeAt(0) * 31 + i * 17) % 100 / 100;
    const noise    = (seed - 0.5) * 0.22;
    const mult     = Math.max(0.3, 1 + seasonal + noise);

    const label = range === "12m"
      ? monthLabels[i]
      : range === "7d"
      ? weekLabels[i % 7]
      : String(i + 1);

    return {
      name:        label,
      aqi:         Math.round(Math.max(5,   base.aqi      * mult)),
      pm25:        parseFloat(Math.max(1,   base.pm25     * mult).toFixed(1)),
      pm10:        parseFloat(Math.max(2,   base.pm10     * mult).toFixed(1)),
      temperature: parseFloat((base.temp   + Math.sin(i * 0.5) * 7  + (seed - 0.5) * 6).toFixed(1)),
      rainfall:    parseFloat(Math.max(0,   base.rainfall * (0.4 + seed * 2.2)).toFixed(1)),
      humidity:    Math.round(Math.min(100, Math.max(15, base.humidity + (seed - 0.5) * 18))),
      o3:          Math.round(Math.max(5,   base.o3       * mult)),
      no2:         Math.round(Math.max(2,   base.no2      * mult)),
    };
  });
}

function getAlerts(d, city) {
  const list = [];
  if      (d.aqi > 300)        list.push({ sev:"hazardous", icon:"☢", title:"Hazardous Air Quality",  msg:"AQI " + d.aqi + " — Emergency. Avoid ALL outdoor activity.",              color:"#dc2626" });
  else if (d.aqi > 200)        list.push({ sev:"veryBad",   icon:"!", title:"Very Unhealthy Air",      msg:"AQI " + d.aqi + " — Everyone may experience serious health effects.",      color:"#a855f7" });
  else if (d.aqi > 150)        list.push({ sev:"bad",       icon:"!", title:"Unhealthy Air Quality",   msg:"AQI " + d.aqi + " — Sensitive groups must limit outdoor exposure.",         color:"#ef4444" });
  else if (d.aqi > 100)        list.push({ sev:"moderate",  icon:"!", title:"Moderate Air Quality",    msg:"AQI " + d.aqi + " — Sensitive people should limit prolonged exertion.",     color:"#f97316" });
  if      (d.temp > 40)        list.push({ sev:"extreme",   icon:"!", title:"Extreme Heatwave",        msg:d.temp + "C — Life-threatening heat. Seek cooling immediately.",             color:"#f43f5e" });
  else if (d.temp > 35)        list.push({ sev:"heat",      icon:"!", title:"Heatwave Warning",        msg:d.temp + "C — Stay hydrated and avoid direct sun exposure.",                color:"#fb923c" });
  if      (d.rainfall > 15)    list.push({ sev:"flood",     icon:"!", title:"Flood Risk Alert",        msg:d.rainfall + "mm/day — Flash flood risk in low-lying areas.",               color:"#3b82f6" });
  else if (d.rainfall > 8)     list.push({ sev:"rain",      icon:"!", title:"Heavy Rainfall",          msg:d.rainfall + "mm/day — Possible localized flooding.",                       color:"#60a5fa" });
  if      (d.pm25 > 75)        list.push({ sev:"pm",        icon:"!", title:"Dangerous PM2.5",         msg:d.pm25 + " ug/m3 — 5x WHO limit. N95 mask required outdoors.",              color:"#e879f9" });
  else if (d.pm25 > 35)        list.push({ sev:"pm2",       icon:"!", title:"Elevated PM2.5",          msg:d.pm25 + " ug/m3 — Above WHO guideline. Limit outdoor exposure.",           color:"#c084fc" });
  return list.map(a => ({ ...a, city }));
}

// ─── Colour helpers ───────────────────────────────────────────────────────────
function hex(color, alpha) {
  // Returns rgba() from hex + 0-1 alpha
  const r = parseInt(color.slice(1,3),16);
  const g = parseInt(color.slice(3,5),16);
  const b = parseInt(color.slice(5,7),16);
  return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────
function ChartTip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background:"rgba(5,10,22,0.97)", border:"1px solid rgba(56,189,248,0.2)", borderRadius:12, padding:"12px 16px" }}>
      <div style={{ color:"rgba(255,255,255,0.4)", fontSize:10, marginBottom:8, fontFamily:"monospace", letterSpacing:1 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background:p.color, flexShrink:0 }} />
          <span style={{ color:"rgba(255,255,255,0.45)", fontSize:11, fontFamily:"monospace" }}>{p.name}:</span>
          <span style={{ color:p.color, fontSize:12, fontWeight:700, fontFamily:"monospace" }}>
            {typeof p.value === "number" ? p.value.toFixed(1) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Glass Card ───────────────────────────────────────────────────────────────
function Card({ children, style, glow, onClick }) {
  const [hov, setHov] = useState(false);
  const s = style || {};
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: "rgba(12,20,38,0.78)",
        backdropFilter: "blur(20px)",
        border: "1px solid " + (hov && onClick ? "rgba(56,189,248,0.32)" : "rgba(255,255,255,0.07)"),
        borderRadius: 18,
        transition: "all 0.25s ease",
        transform: hov && onClick ? "translateY(-3px)" : "none",
        boxShadow: hov && onClick
          ? "0 24px 60px rgba(0,0,0,0.5)" + (glow ? ",0 0 40px " + hex(glow, 0.1) : "")
          : "0 4px 20px rgba(0,0,0,0.25)",
        cursor: onClick ? "pointer" : "default",
        position: "relative",
        overflow: "hidden",
        ...s,
      }}
    >
      {glow && (
        <div style={{
          position:"absolute", top:-40, left:"50%", transform:"translateX(-50%)",
          width:160, height:80,
          background: "radial-gradient(ellipse," + hex(glow, 0.1) + " 0%,transparent 70%)",
          pointerEvents:"none",
        }} />
      )}
      {children}
    </div>
  );
}

// ─── ARC GAUGE ────────────────────────────────────────────────────────────────
function ArcGauge({ value, max }) {
  max = max || 300;
  const size  = 170;
  const meta  = aqiMeta(value);
  const pct   = Math.min(value / max, 1);
  const R     = size * 0.37;
  const cx    = size / 2;
  const cy    = size * 0.56;
  const toRad = (d) => (d * Math.PI) / 180;
  const pt    = (a) => ({ x: cx + R * Math.cos(toRad(a)), y: cy + R * Math.sin(toRad(a)) });
  const arcD  = (a1, a2) => {
    const s = pt(a1), e = pt(a2), large = Math.abs(a2 - a1) > 180 ? 1 : 0;
    return "M" + s.x + " " + s.y + " A" + R + " " + R + " 0 " + large + " 1 " + e.x + " " + e.y;
  };
  const SA = -215, SW = 250;
  const EA = SA + pct * SW;

  const ticks  = [0, 50, 100, 150, 200, 300];
  const bAngle = EA;
  const bTip   = pt(bAngle);
  const bB1    = { x: cx + 5 * Math.cos(toRad(bAngle + 90)), y: cy + 5 * Math.sin(toRad(bAngle + 90)) };
  const bB2    = { x: cx + 5 * Math.cos(toRad(bAngle - 90)), y: cy + 5 * Math.sin(toRad(bAngle - 90)) };

  return (
    <svg width={size} height={size * 0.7} viewBox={"0 0 " + size + " " + (size * 0.7)} style={{ overflow:"visible" }}>
      <defs>
        <linearGradient id="specG" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#22c55e" />
          <stop offset="30%"  stopColor="#eab308" />
          <stop offset="55%"  stopColor="#f97316" />
          <stop offset="75%"  stopColor="#ef4444" />
          <stop offset="90%"  stopColor="#a855f7" />
          <stop offset="100%" stopColor="#dc2626" />
        </linearGradient>
        <filter id="gaugeglow">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Track */}
      <path d={arcD(SA, SA + SW)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="11" strokeLinecap="round" />
      {/* Spectrum underlay */}
      <path d={arcD(SA, SA + SW)} fill="none" stroke="url(#specG)" strokeWidth="11" strokeLinecap="round" opacity="0.2" />
      {/* Active arc */}
      {pct > 0 && (
        <path d={arcD(SA, EA)} fill="none" stroke={meta.color} strokeWidth="11" strokeLinecap="round" filter="url(#gaugeglow)" />
      )}
      {/* Tick marks */}
      {ticks.map((v) => {
        const a  = SA + (v / max) * SW;
        const ip = pt(a);
        const op = { x: cx + (R + 13) * Math.cos(toRad(a)), y: cy + (R + 13) * Math.sin(toRad(a)) };
        return <line key={v} x1={ip.x} y1={ip.y} x2={op.x} y2={op.y} stroke="rgba(255,255,255,0.14)" strokeWidth="1" />;
      })}
      {/* Needle */}
      <polygon
        points={bTip.x + "," + bTip.y + " " + bB1.x + "," + bB1.y + " " + bB2.x + "," + bB2.y}
        fill={meta.color}
        filter="url(#gaugeglow)"
      />
      <circle cx={cx} cy={cy} r="5"   fill={meta.color} filter="url(#gaugeglow)" />
      <circle cx={cx} cy={cy} r="2.5" fill="#fff"       opacity="0.9" />
      {/* Labels */}
      <text x={cx} y={cy - R * 0.52} textAnchor="middle" fill={meta.color}              fontSize={size * 0.17}  fontWeight="800" fontFamily="monospace">{value}</text>
      <text x={cx} y={cy - R * 0.28} textAnchor="middle" fill="rgba(255,255,255,0.38)"  fontSize={size * 0.065} fontFamily="sans-serif">{meta.label}</text>
    </svg>
  );
}

// ─── Pollutant Bar ────────────────────────────────────────────────────────────
function PollBar({ label, value, max, who, color }) {
  const pct  = Math.min((value / max) * 100, 100);
  const over = value > who;
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
        <span style={{ fontSize:11, color:"rgba(255,255,255,0.45)", fontFamily:"monospace" }}>{label}</span>
        <span style={{ fontSize:11, fontWeight:700, color: over ? "#f97316" : "#22c55e", fontFamily:"monospace" }}>
          {value} ug/m3 {over ? "!" : "OK"}
        </span>
      </div>
      <div style={{ height:7, background:"rgba(255,255,255,0.05)", borderRadius:7, position:"relative" }}>
        <div style={{ width: pct + "%", height:"100%", background: "linear-gradient(90deg," + hex(color,0.5) + "," + color + ")", borderRadius:7 }} />
        <div style={{ position:"absolute", top:-3, left: Math.min((who/max)*100, 98) + "%", width:2, height:13, background:"rgba(255,255,255,0.25)", borderRadius:1 }} />
      </div>
      <div style={{ fontSize:9, color:"rgba(255,255,255,0.2)", marginTop:3 }}>WHO 24h limit: {who} ug/m3</div>
    </div>
  );
}

// ─── SVG World Map ────────────────────────────────────────────────────────────
function WorldMap({ cities, selected, onSelect, cityDB }) {
  const W = 900, H = 430;
  const toX = (lng) => ((lng + 180) / 360) * W;
  const toY  = (lat) => ((90 - lat) / 180) * H;

  const continents = [
    "M80,44 L170,38 L200,56 L218,94 L228,136 L212,170 L182,182 L152,172 L126,154 L104,130 L85,106 L70,76Z",
    "M150,186 L208,182 L228,206 L224,252 L208,290 L186,308 L162,298 L145,268 L140,230 L143,200Z",
    "M364,42 L428,37 L450,56 L446,84 L420,104 L388,110 L360,100 L345,72Z",
    "M354,112 L418,107 L438,132 L436,198 L418,252 L394,274 L368,270 L346,238 L336,184 L338,134Z",
    "M442,38 L612,35 L658,58 L668,95 L650,130 L606,148 L550,142 L498,120 L452,110 L436,78Z",
    "M594,150 L650,146 L662,170 L646,190 L616,187 L595,170Z",
    "M595,226 L668,220 L682,248 L678,280 L648,294 L616,283 L595,258Z",
  ];

  return (
    <div style={{ borderRadius:18, overflow:"hidden", background:"radial-gradient(ellipse at 50% 40%,#071428 0%,#030810 100%)" }}>
      <svg viewBox={"0 0 " + W + " " + H} style={{ width:"100%", display:"block" }}>
        {Array.from({ length:10 }, (_, i) => (
          <line key={"h"+i} x1="0" y1={i*(H/9)} x2={W} y2={i*(H/9)} stroke="rgba(56,189,248,0.03)" strokeWidth="0.5" />
        ))}
        {Array.from({ length:13 }, (_, i) => (
          <line key={"v"+i} x1={i*(W/12)} y1="0" x2={i*(W/12)} y2={H} stroke="rgba(56,189,248,0.03)" strokeWidth="0.5" />
        ))}
        <g fill="rgba(20,40,70,0.65)" stroke="rgba(56,189,248,0.12)" strokeWidth="0.8">
          {continents.map((d, i) => <path key={i} d={d} />)}
        </g>
        {cities.map((city) => {
          const d      = cityDB[city];
          const x      = toX(d.lng);
          const y      = toY(d.lat);
          const m      = aqiMeta(d.aqi);
          const active = city === selected;
          return (
            <g key={city} onClick={() => onSelect(city)} style={{ cursor:"pointer" }}>
              <circle cx={x} cy={y} r={active ? 22 : 16} fill={m.color} opacity="0.07" />
              <circle cx={x} cy={y} r={active ? 14 : 10} fill={m.color} opacity="0.15" />
              <circle cx={x} cy={y} r={active ?  7 :  5} fill={m.color} opacity={active ? 1 : 0.85} />
              {active && <circle cx={x} cy={y} r="10" fill="none" stroke={m.color} strokeWidth="1.5" opacity="0.5" strokeDasharray="3 2" />}
              <text x={x} y={y-15} textAnchor="middle" fill="rgba(226,232,240,0.82)" fontSize="8.5" fontFamily="monospace" fontWeight={active ? "700" : "400"}>{city}</text>
              <text x={x} y={y+21} textAnchor="middle" fill={m.color}               fontSize="7.5" fontFamily="monospace" fontWeight="700">{d.aqi}</text>
            </g>
          );
        })}
        <defs>
          <radialGradient id="vign" cx="50%" cy="50%">
            <stop offset="55%" stopColor="transparent" />
            <stop offset="100%" stopColor="rgba(3,8,16,0.75)" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#vign)" />
      </svg>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:14, padding:"10px 18px 14px", background:"rgba(3,8,16,0.5)" }}>
        {[["Good","#22c55e"],["Moderate","#eab308"],["Sensitive","#f97316"],["Unhealthy","#ef4444"],["Very Unhealthy","#a855f7"],["Hazardous","#dc2626"]].map(([l,c]) => (
          <span key={l} style={{ display:"flex", alignItems:"center", gap:5, fontSize:9, color:"rgba(255,255,255,0.4)", fontFamily:"monospace", whiteSpace:"nowrap" }}>
            <span style={{ width:7, height:7, borderRadius:"50%", background:c, display:"inline-block" }} />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Prediction helpers ───────────────────────────────────────────────────────

// Simple linear regression: returns {slope, intercept, predict(x)}
function linReg(values) {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0, predict: (x) => values[0] || 0 };
  const xs = values.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - meanX) * (values[i] - meanY); den += (xs[i] - meanX) ** 2; }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  return { slope, intercept, predict: (x) => intercept + slope * x };
}

// Holt linear (double exponential) smoothing
function holtSmooth(values, alpha, beta) {
  if (values.length < 2) return values.map(v => v);
  let l = values[0], b = values[1] - values[0];
  const smoothed = [l + b];
  for (let i = 1; i < values.length; i++) {
    const lPrev = l, bPrev = b;
    l = alpha * values[i] + (1 - alpha) * (lPrev + bPrev);
    b = beta * (l - lPrev) + (1 - beta) * bPrev;
    smoothed.push(l + b);
  }
  return smoothed;
}

// Generate future forecast points
function forecast(trendData, key, steps, range) {
  const values = trendData.map(d => d[key]);
  const reg = linReg(values);
  const smoothed = holtSmooth(values, 0.35, 0.15);
  const n = values.length;
  const lastSmoothed = smoothed[smoothed.length - 1];
  const alpha = 0.35, beta = 0.15;
  let l = smoothed[smoothed.length - 1];
  let b = smoothed.length > 1 ? l - smoothed[smoothed.length - 2] : 0;

  const futureLabels = range === "7d"
    ? ["Next Mon", "Next Tue", "Next Wed", "Next Thu", "Next Fri", "Next Sat", "Next Sun"]
    : range === "30d"
    ? Array.from({length: steps}, (_, i) => "+" + (i + 1) + "d")
    : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].slice(0, steps);

  const futurePoints = [];
  for (let i = 0; i < steps; i++) {
    const linVal = reg.predict(n + i);
    const lPrev = l, bPrev = b;
    // Extrapolate Holt
    const holtVal = l + b * (i + 1);
    // Ensemble: 60% holt + 40% linear
    const ensemble = 0.6 * holtVal + 0.4 * linVal;
    // Confidence band ±10% growing with horizon
    const uncertainty = Math.abs(ensemble) * 0.06 * (i + 1);
    futurePoints.push({
      name: futureLabels[i] || "+" + (i+1),
      predicted: parseFloat(Math.max(0, ensemble).toFixed(1)),
      upper: parseFloat(Math.max(0, ensemble + uncertainty).toFixed(1)),
      lower: parseFloat(Math.max(0, ensemble - uncertainty).toFixed(1)),
    });
  }
  return futurePoints;
}

// ─── PredictPage Component ────────────────────────────────────────────────────
function PredictPage({ city, data, trend, range, setRange, meta, axisStyle, gridProps }) {
  const [metric, setMetric] = useState("aqi");
  const [horizon, setHorizon] = useState(7);
  const [modelInfo, setModelInfo] = useState(false);

  const METRICS = [
    { key:"aqi",         label:"AQI",         unit:"",       color:"#38bdf8", desc:"Air Quality Index" },
    { key:"pm25",        label:"PM2.5",        unit:"ug/m3",  color:"#a78bfa", desc:"Fine Particles" },
    { key:"pm10",        label:"PM10",         unit:"ug/m3",  color:"#60a5fa", desc:"Coarse Particles" },
    { key:"temperature", label:"Temperature",  unit:"°C",     color:"#f97316", desc:"Surface Temp" },
    { key:"humidity",    label:"Humidity",     unit:"%",      color:"#22c55e", desc:"Relative Humidity" },
    { key:"rainfall",    label:"Rainfall",     unit:"mm/d",   color:"#3b82f6", desc:"Daily Precipitation" },
    { key:"o3",          label:"Ozone O3",     unit:"ug/m3",  color:"#4ade80", desc:"Ground-level Ozone" },
    { key:"no2",         label:"NO2",          unit:"ug/m3",  color:"#fb923c", desc:"Nitrogen Dioxide" },
  ];

  const sel = METRICS.find(m => m.key === metric) || METRICS[0];
  const values = trend.map(d => d[metric] || 0);
  const reg = linReg(values);
  const futurePts = useMemo(() => forecast(trend, metric, horizon, range), [trend, metric, horizon, range]);

  // Combined chart data: historical + forecast
  const histPoints = trend.map((d, i) => ({
    name: d.name,
    actual: d[metric],
    fitted: parseFloat(reg.predict(i).toFixed(1)),
  }));

  const chartData = [
    ...histPoints.map(p => ({ ...p, type: "historical" })),
    ...futurePts.map(p => ({ ...p, actual: null, fitted: null, type: "forecast" })),
  ];

  // Stats
  const lastVal = values[values.length - 1] || 0;
  const firstVal = values[0] || 1;
  const changePct = ((lastVal - firstVal) / Math.max(firstVal, 0.001) * 100).toFixed(1);
  const trendDir = reg.slope > 0.5 ? "Rising" : reg.slope < -0.5 ? "Falling" : "Stable";
  const trendColor = reg.slope > 0.5 ? "#ef4444" : reg.slope < -0.5 ? "#22c55e" : "#eab308";
  const avgVal = (values.reduce((a,b) => a+b, 0) / values.length).toFixed(1);
  const maxVal = Math.max(...values).toFixed(1);
  const minVal = Math.min(...values).toFixed(1);
  const forecastEnd = futurePts[futurePts.length - 1]?.predicted ?? lastVal;
  const forecastChange = ((forecastEnd - lastVal) / Math.max(lastVal, 0.001) * 100).toFixed(1);

  // WHO/threshold reference per metric
  const thresholds = {
    aqi:   [{ y: 50, c:"#22c55e", l:"Good" }, { y:100, c:"#eab308", l:"Moderate" }, { y:150, c:"#f97316", l:"Sensitive" }, { y:200, c:"#ef4444", l:"Unhealthy" }],
    pm25:  [{ y: 15, c:"#22c55e", l:"WHO 24h" }, { y: 35, c:"#f97316", l:"Elevated" }, { y: 75, c:"#ef4444", l:"Danger" }],
    pm10:  [{ y: 45, c:"#22c55e", l:"WHO 24h" }, { y:150, c:"#f97316", l:"High" }],
    temperature: [{ y: 35, c:"#fb923c", l:"Heat Warning" }, { y:40, c:"#f43f5e", l:"Extreme" }],
    humidity: [{ y: 30, c:"#eab308", l:"Dry" }, { y:80, c:"#3b82f6", l:"Humid" }],
    rainfall: [{ y: 8, c:"#60a5fa", l:"Heavy" }, { y:15, c:"#1d4ed8", l:"Flood Risk" }],
    o3: [{ y:100, c:"#eab308", l:"WHO Limit" }],
    no2: [{ y: 25, c:"#22c55e", l:"WHO Limit" }, { y:40, c:"#f97316", l:"Elevated" }],
  };

  return (
    <div>
      {/* Header */}
      <div className="fu fu1" style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:28 }}>
        <div>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.22)", fontFamily:"monospace", letterSpacing:3, marginBottom:6 }}>AI-ASSISTED FORECASTING</div>
          <h1 style={{ fontSize:30, fontWeight:800, margin:0 }}>
            {city} <span style={{ color:"#38bdf8" }}>Predictions</span>
          </h1>
          <p style={{ color:"rgba(255,255,255,0.3)", fontSize:11, marginTop:7, fontFamily:"monospace" }}>
            Holt linear smoothing + linear regression ensemble — based on {trend.length}-point history
          </p>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button onClick={() => setModelInfo(!modelInfo)} style={{ background:"rgba(56,189,248,0.07)", border:"1px solid rgba(56,189,248,0.2)", color:"rgba(56,189,248,0.7)", padding:"7px 14px", borderRadius:9, cursor:"pointer", fontSize:10, fontFamily:"monospace" }}>
            {modelInfo ? "Hide" : "Model"} Info
          </button>
          <div style={{ display:"flex", gap:4, background:"rgba(12,20,38,0.85)", padding:4, borderRadius:10, border:"1px solid rgba(255,255,255,0.05)" }}>
            {[["7d","7 Days"],["30d","30 Days"],["12m","12 Months"]].map(([k, l]) => (
              <button key={k} className="rbtn" onClick={() => setRange(k)} style={{ background: range === k ? "#38bdf8" : "transparent", color: range === k ? "#000" : "rgba(255,255,255,0.45)", border:"none", padding:"7px 16px", borderRadius:8, cursor:"pointer", fontSize:11, fontFamily:"monospace", fontWeight: range === k ? 700 : 400, transition:"all 0.2s" }}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Model Info panel */}
      {modelInfo && (
        <div className="fu fu1" style={{ marginBottom:20 }}>
          <Card style={{ padding:"20px 26px", background:"rgba(56,189,248,0.04)", border:"1px solid rgba(56,189,248,0.15)" }}>
            <div style={{ fontSize:9, color:"rgba(56,189,248,0.7)", fontFamily:"monospace", letterSpacing:3, marginBottom:12 }}>FORECASTING MODEL — METHODOLOGY</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:20 }}>
              {[
                { title:"Linear Regression", desc:"Ordinary least squares fit over the historical window. Captures long-term directional trend. Weight: 40%." },
                { title:"Holt Smoothing", desc:"Double exponential smoothing (α=0.35, β=0.15) to track level and trend. Adapts to recent changes. Weight: 60%." },
                { title:"Confidence Bands", desc:"Uncertainty grows ±6% per horizon step, reflecting increasing forecast error at longer ranges." },
              ].map(({ title, desc }) => (
                <div key={title} style={{ background:"rgba(255,255,255,0.03)", borderRadius:10, padding:"14px 16px" }}>
                  <div style={{ fontWeight:700, fontSize:11, color:"#38bdf8", fontFamily:"monospace", marginBottom:7 }}>{title}</div>
                  <div style={{ fontSize:10, color:"rgba(255,255,255,0.38)", lineHeight:1.7 }}>{desc}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop:12, fontSize:9, color:"rgba(255,255,255,0.2)", fontFamily:"monospace" }}>
              NOTE: Predictions are based on historical patterns in this dataset and should not be used for real-world decision-making without live sensor validation.
            </div>
          </Card>
        </div>
      )}

      {/* Metric selector */}
      <div className="fu fu2" style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:22 }}>
        {METRICS.map((m) => (
          <button key={m.key} onClick={() => setMetric(m.key)} style={{
            background: metric === m.key ? hex(m.color,0.13) : "rgba(255,255,255,0.03)",
            border: "1px solid " + (metric === m.key ? hex(m.color,0.4) : "rgba(255,255,255,0.07)"),
            color: metric === m.key ? m.color : "rgba(255,255,255,0.42)",
            padding:"8px 16px", borderRadius:22, cursor:"pointer", fontSize:11, fontFamily:"monospace",
            transition:"all 0.2s", display:"flex", alignItems:"center", gap:7,
          }}>
            {metric === m.key && <span style={{ width:5, height:5, borderRadius:"50%", background:m.color, display:"inline-block" }} />}
            {m.label}
            <span style={{ fontSize:9, opacity:0.5 }}>{m.unit}</span>
          </button>
        ))}
      </div>

      {/* KPI cards */}
      <div className="fu fu2" style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:13, marginBottom:20 }}>
        {[
          { lbl:"Current",     val:lastVal.toFixed(1),      unit:sel.unit, c:sel.color },
          { lbl:"Average",     val:avgVal,                  unit:sel.unit, c:"rgba(255,255,255,0.6)" },
          { lbl:"Peak",        val:maxVal,                  unit:sel.unit, c:"#ef4444" },
          { lbl:"Trend",       val:trendDir,                unit:"",       c:trendColor },
          { lbl:"Period Δ",    val:(changePct > 0 ? "+" : "") + changePct + "%", unit:"", c: changePct > 0 ? "#ef4444" : "#22c55e" },
          { lbl:"Forecast End",val:forecastEnd.toFixed(1),  unit:sel.unit, c: forecastChange > 0 ? "#f97316" : "#22c55e" },
        ].map(({ lbl, val, unit, c }) => (
          <Card key={lbl} style={{ padding:"16px 18px" }}>
            <div style={{ fontSize:9, color:"rgba(255,255,255,0.28)", fontFamily:"monospace", letterSpacing:2, marginBottom:7 }}>{lbl.toUpperCase()}</div>
            <div style={{ fontSize:20, fontWeight:800, color:c, fontFamily:"monospace", lineHeight:1 }}>{val}</div>
            {unit && <div style={{ fontSize:9, color:"rgba(255,255,255,0.22)", marginTop:4 }}>{unit}</div>}
          </Card>
        ))}
      </div>

      {/* Forecast horizon selector */}
      <div className="fu fu2" style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <span style={{ fontSize:10, color:"rgba(255,255,255,0.35)", fontFamily:"monospace" }}>FORECAST HORIZON:</span>
        <div style={{ display:"flex", gap:4, background:"rgba(12,20,38,0.85)", padding:4, borderRadius:10, border:"1px solid rgba(255,255,255,0.05)" }}>
          {(range === "12m" ? [[3,"3mo"],[6,"6mo"],[12,"12mo"]] : range === "30d" ? [[5,"5d"],[10,"10d"],[14,"14d"]] : [[3,"3d"],[5,"5d"],[7,"7d"]]).map(([k, l]) => (
            <button key={k} className="rbtn" onClick={() => setHorizon(k)} style={{ background: horizon === k ? sel.color : "transparent", color: horizon === k ? "#000" : "rgba(255,255,255,0.45)", border:"none", padding:"6px 14px", borderRadius:8, cursor:"pointer", fontSize:10, fontFamily:"monospace", fontWeight: horizon === k ? 700 : 400, transition:"all 0.2s" }}>{l}</button>
          ))}
        </div>
        <span style={{ fontSize:9, color:"rgba(255,255,255,0.2)", fontFamily:"monospace" }}>
          Predicting {horizon} {range === "12m" ? "month(s)" : "day(s)"} ahead — confidence decreases with horizon
        </span>
      </div>

      {/* Main forecast chart */}
      <div className="fu fu3" style={{ marginBottom:20 }}>
        <Card style={{ padding:"26px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
            <div>
              <div style={{ fontSize:9, color:"rgba(255,255,255,0.28)", fontFamily:"monospace", letterSpacing:3 }}>{sel.desc.toUpperCase()} — HISTORICAL + FORECAST</div>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.25)", marginTop:4 }}>
                Solid = actual · Dashed = regression fit · Filled zone = predicted range with confidence bands
              </div>
            </div>
            <div style={{ display:"flex", gap:18, fontSize:10, fontFamily:"monospace" }}>
              <span style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ width:20, height:2, background:sel.color, display:"inline-block" }} /> Actual</span>
              <span style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ width:20, height:2, background:"rgba(255,255,255,0.25)", display:"inline-block", borderTop:"2px dashed rgba(255,255,255,0.25)" }} /> Fitted</span>
              <span style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ width:20, height:2, background:"#38bdf8", display:"inline-block", opacity:0.5 }} /> Forecast</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData} margin={{ top:5, right:16, left:-8, bottom:0 }}>
              <defs>
                <linearGradient id="predG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={sel.color} stopOpacity={0.5} />
                  <stop offset="95%" stopColor={sel.color} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="confG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#38bdf8" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} interval={Math.floor(chartData.length / 8)} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={38} />
              <Tooltip content={<ChartTip />} />
              {(thresholds[metric] || []).slice(0, 2).map(({ y, c, l }) => (
                <ReferenceLine key={l} y={y} stroke={c} strokeDasharray="5 3" strokeOpacity={0.4} label={{ value:l, fill:c, fontSize:8 }} />
              ))}
              {/* Confidence band upper */}
              <Area type="monotone" dataKey="upper" name="Upper bound" stroke="none" fill="url(#confG)" strokeWidth={0} dot={false} legendType="none" />
              {/* Confidence band lower */}
              <Area type="monotone" dataKey="lower" name="Lower bound" stroke="none" fill="rgba(4,9,22,1)" strokeWidth={0} dot={false} legendType="none" />
              {/* Predicted line */}
              <Line type="monotone" dataKey="predicted" name={"Predicted " + sel.label} stroke="#38bdf8" strokeWidth={2.5} dot={false} strokeDasharray="6 3" activeDot={{ r:5, fill:"#38bdf8" }} connectNulls />
              {/* Regression fit */}
              <Line type="monotone" dataKey="fitted" name="Regression fit" stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} dot={false} strokeDasharray="3 3" connectNulls />
              {/* Actual values */}
              <Area type="monotone" dataKey="actual" name={"Actual " + sel.label} stroke={sel.color} fill="url(#predG)" strokeWidth={2.5} dot={false} activeDot={{ r:5, fill:sel.color }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Forecast table + all-metrics mini */}
      <div className="fu fu3" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18, marginBottom:20 }}>

        {/* Forecast table */}
        <Card style={{ padding:"24px" }}>
          <div style={{ fontSize:9, color:"rgba(255,255,255,0.28)", fontFamily:"monospace", letterSpacing:3, marginBottom:18 }}>PREDICTED VALUES — {sel.desc.toUpperCase()}</div>
          <div style={{ overflowY:"auto", maxHeight:300 }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"monospace", fontSize:11 }}>
              <thead>
                <tr style={{ borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
                  <th style={{ padding:"8px 10px", textAlign:"left",   color:"rgba(255,255,255,0.22)", fontWeight:400, fontSize:9, letterSpacing:2 }}>PERIOD</th>
                  <th style={{ padding:"8px 10px", textAlign:"center", color:"rgba(255,255,255,0.22)", fontWeight:400, fontSize:9, letterSpacing:2 }}>PREDICTED</th>
                  <th style={{ padding:"8px 10px", textAlign:"center", color:"rgba(255,255,255,0.22)", fontWeight:400, fontSize:9, letterSpacing:2 }}>LOWER</th>
                  <th style={{ padding:"8px 10px", textAlign:"center", color:"rgba(255,255,255,0.22)", fontWeight:400, fontSize:9, letterSpacing:2 }}>UPPER</th>
                  <th style={{ padding:"8px 10px", textAlign:"center", color:"rgba(255,255,255,0.22)", fontWeight:400, fontSize:9, letterSpacing:2 }}>SIGNAL</th>
                </tr>
              </thead>
              <tbody>
                {futurePts.map((p, i) => {
                  const delta = p.predicted - lastVal;
                  const deltaPct = (delta / Math.max(lastVal, 0.001) * 100).toFixed(1);
                  const signal = delta > lastVal * 0.1 ? "RISE" : delta < -lastVal * 0.1 ? "FALL" : "STABLE";
                  const sigColor = signal === "RISE" ? "#ef4444" : signal === "FALL" ? "#22c55e" : "#eab308";
                  return (
                    <tr key={i} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)" }}>
                      <td style={{ padding:"9px 10px", color:"rgba(255,255,255,0.55)" }}>{p.name}</td>
                      <td style={{ padding:"9px 10px", textAlign:"center", color:sel.color, fontWeight:700 }}>{p.predicted}<span style={{ fontSize:8, opacity:0.5, marginLeft:2 }}>{sel.unit}</span></td>
                      <td style={{ padding:"9px 10px", textAlign:"center", color:"rgba(255,255,255,0.35)" }}>{p.lower}<span style={{ fontSize:8, opacity:0.4, marginLeft:2 }}>{sel.unit}</span></td>
                      <td style={{ padding:"9px 10px", textAlign:"center", color:"rgba(255,255,255,0.35)" }}>{p.upper}<span style={{ fontSize:8, opacity:0.4, marginLeft:2 }}>{sel.unit}</span></td>
                      <td style={{ padding:"9px 10px", textAlign:"center" }}>
                        <span style={{ background: hex(sigColor, 0.12), color:sigColor, borderRadius:20, padding:"2px 8px", fontSize:8, fontWeight:700, letterSpacing:1 }}>{signal}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* All-metrics snapshot */}
        <Card style={{ padding:"24px" }}>
          <div style={{ fontSize:9, color:"rgba(255,255,255,0.28)", fontFamily:"monospace", letterSpacing:3, marginBottom:18 }}>NEXT-PERIOD FORECAST — ALL METRICS</div>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {METRICS.map((m) => {
              const vals = trend.map(d => d[m.key] || 0);
              const r = linReg(vals);
              const current = vals[vals.length - 1] || 0;
              const nextLinear = r.predict(vals.length);
              const smoothed = holtSmooth(vals, 0.35, 0.15);
              const sl = smoothed[smoothed.length - 1];
              const sb = smoothed.length > 1 ? sl - smoothed[smoothed.length - 2] : 0;
              const nextForecast = parseFloat((0.6 * (sl + sb) + 0.4 * nextLinear).toFixed(1));
              const delta = nextForecast - current;
              const pct = (delta / Math.max(current, 0.001) * 100).toFixed(1);
              const pctColor = delta > 0 ? "#ef4444" : delta < 0 ? "#22c55e" : "#eab308";
              const barPct = Math.min(100, Math.abs(pct));
              return (
                <div key={m.key} style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ width:50, fontSize:9, color:m.color, fontFamily:"monospace", flexShrink:0 }}>{m.label}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3, fontSize:9, fontFamily:"monospace" }}>
                      <span style={{ color:"rgba(255,255,255,0.35)" }}>{current.toFixed(1)} → </span>
                      <span style={{ color:m.color, fontWeight:700 }}>{nextForecast}</span>
                      <span style={{ color:pctColor }}>{pct > 0 ? "+" : ""}{pct}%</span>
                    </div>
                    <div style={{ height:4, background:"rgba(255,255,255,0.05)", borderRadius:4, overflow:"hidden" }}>
                      <div style={{ width: barPct + "%", height:"100%", background:"linear-gradient(90deg," + hex(m.color,0.4) + "," + m.color + ")", borderRadius:4, transition:"width 0.5s" }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop:16, padding:"10px 12px", background:"rgba(255,255,255,0.025)", borderRadius:9, fontSize:9, color:"rgba(255,255,255,0.22)", fontFamily:"monospace", lineHeight:1.8 }}>
            Next period = +1 step from last data point in current range ({range}). Ensemble of Holt (60%) + OLS regression (40%).
          </div>
        </Card>
      </div>

      {/* Trend analysis card */}
      <div className="fu fu4">
        <Card style={{ padding:"24px", background:"linear-gradient(135deg," + hex(sel.color,0.06) + ",rgba(12,20,38,0.8))" }}>
          <div style={{ display:"flex", gap:24, alignItems:"flex-start" }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:9, color:"rgba(255,255,255,0.28)", fontFamily:"monospace", letterSpacing:3, marginBottom:12 }}>TREND ANALYSIS — {city.toUpperCase()}</div>
              <div style={{ fontSize:15, fontWeight:700, color:sel.color, marginBottom:14 }}>
                {trendDir === "Rising"
                  ? sel.key === "aqi" || sel.key === "pm25" || sel.key === "pm10" || sel.key === "no2" || sel.key === "o3"
                    ? `⚠ ${sel.label} is trending upward — air quality deterioration expected`
                    : `${sel.label} is on an upward trend over the ${range} window`
                  : trendDir === "Falling"
                  ? sel.key === "aqi" || sel.key === "pm25"
                    ? `✓ ${sel.label} is improving — air quality recovery in progress`
                    : `${sel.label} is declining over the ${range} period`
                  : `${sel.label} is holding relatively stable over the ${range} window`
                }
              </div>
              <div style={{ display:"flex", gap:28, flexWrap:"wrap" }}>
                {[
                  { lbl:"Slope / step",    val: (reg.slope > 0 ? "+" : "") + reg.slope.toFixed(2) + " " + sel.unit,   c: reg.slope > 0 ? "#ef4444" : "#22c55e" },
                  { lbl:"R-squared (fit)", val: (() => { const ym = values.reduce((a,b)=>a+b,0)/values.length; const ss_res = values.reduce((a,v,i)=>a+(v-reg.predict(i))**2,0); const ss_tot = values.reduce((a,v)=>a+(v-ym)**2,0); return ss_tot===0?"N/A":(1-ss_res/ss_tot).toFixed(3); })(), c:"#38bdf8" },
                  { lbl:"Forecast delta",  val:(forecastChange > 0 ? "+" : "") + forecastChange + "%",                  c: forecastChange > 0 ? "#f97316" : "#22c55e" },
                  { lbl:"Data points",     val:values.length,                                                           c:"rgba(255,255,255,0.55)" },
                ].map(({ lbl, val, c }) => (
                  <div key={lbl}>
                    <div style={{ fontSize:9, color:"rgba(255,255,255,0.25)", fontFamily:"monospace", marginBottom:4 }}>{lbl}</div>
                    <div style={{ fontSize:16, fontWeight:700, color:c, fontFamily:"monospace" }}>{val}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ minWidth:130, flexShrink:0, textAlign:"right" }}>
              <div style={{ fontSize:9, color:"rgba(255,255,255,0.22)", fontFamily:"monospace", marginBottom:8, letterSpacing:1 }}>CONFIDENCE</div>
              {[["Short-term (1 step)","High","#22c55e"],["Medium-term (1/2 horizon)","Moderate","#eab308"],["Full horizon","Low","#f97316"]].map(([l,v,c]) => (
                <div key={l} style={{ marginBottom:8 }}>
                  <div style={{ fontSize:8, color:"rgba(255,255,255,0.2)", fontFamily:"monospace" }}>{l}</div>
                  <div style={{ fontSize:12, fontWeight:700, color:c, fontFamily:"monospace" }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function EcoInsight() {
  const [page,       setPage]     = useState("dashboard");
  const [city,       setCity]     = useState("Delhi");
  const [range,      setRange]    = useState("30d");
  const [compare,    setCompare]  = useState(["Delhi","London","New York","Sydney"]);
  const [dismissed,  setDismiss]  = useState([]);
  const [searchQ,    setSearchQ]  = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [loaded,     setLoaded]   = useState(false);

  // ── Live data state ──────────────────────────────────────────────────────────
  const [apiKey,     setApiKey]   = useState(() => localStorage.getItem("owm_api_key") || "");
  const [apiKeyInput,setApiKeyInput] = useState("");
  const [showApiSetup, setShowApiSetup] = useState(false);
  const [liveData,   setLiveData] = useState(null);   // { cityName: {aqi,pm25,...} }
  const [fetchStatus, setFetchStatus] = useState({}); // { cityName: "loading"|"ok"|"error" }
  const [isLive,     setIsLive]   = useState(false);
  const [lastUpdated,setLastUpdated] = useState(null);
  const [fetchError, setFetchError]  = useState("");
  const intervalRef  = useRef(null);

  // Build the CITY_DB from live data (or fallback)
  const cityDB = useMemo(() => buildCityDB(isLive ? liveData : null), [liveData, isLive]);

  // Save API key
  const saveApiKey = useCallback((key) => {
    localStorage.setItem("owm_api_key", key);
    setApiKey(key);
    setShowApiSetup(false);
    setFetchError("");
  }, []);

  // Fetch all cities
  const fetchAllCities = useCallback(async (key) => {
    if (!key) return;
    setFetchError("");
    const statusUpdate = {};
    CITIES.forEach(c => { statusUpdate[c] = "loading"; });
    setFetchStatus({ ...statusUpdate });

    const results = {};
    let anyError = false;

    await Promise.all(CITIES.map(async (cityName) => {
      try {
        const d = await fetchCityLive(cityName, key);
        results[cityName] = d;
        setFetchStatus(prev => ({ ...prev, [cityName]: "ok" }));
      } catch (err) {
        anyError = true;
        setFetchStatus(prev => ({ ...prev, [cityName]: "error" }));
        // Keep fallback for failed city
        results[cityName] = null;
      }
    }));

    if (Object.values(results).some(v => v !== null)) {
      setLiveData(results);
      setIsLive(true);
      setLastUpdated(new Date());
      if (anyError) setFetchError("Some cities failed to fetch — showing fallback data for those.");
    } else {
      setFetchError("All fetches failed. Check your API key.");
      setIsLive(false);
    }
  }, []);

  // On mount — fetch if key saved
  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 100);
    if (apiKey) fetchAllCities(apiKey);
    return () => clearTimeout(t);
  }, []);

  // Set up auto-refresh every 10 minutes when live
  useEffect(() => {
    if (isLive && apiKey) {
      intervalRef.current = setInterval(() => fetchAllCities(apiKey), 10 * 60 * 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [isLive, apiKey, fetchAllCities]);

  const data      = cityDB[city];
  const meta      = aqiMeta(data.aqi);
  const trend     = useMemo(() => genTrend(city, range, cityDB), [city, range, cityDB]);
  const myAlerts  = getAlerts(data, city).filter((_, i) => !dismissed.includes(i));
  const allAlerts = CITIES.flatMap((c) => getAlerts(cityDB[c], c));

  const filteredCities = CITIES.filter((c) => c.toLowerCase().includes(searchQ.toLowerCase()));
  const PALETTE = ["#38bdf8","#22c55e","#f97316","#a855f7","#f43f5e","#eab308"];

  const nav = [
    { id:"dashboard", label:"Dashboard",  icon:"D" },
    { id:"map",       label:"Global Map", icon:"M" },
    { id:"trends",    label:"Trends",     icon:"T" },
    { id:"compare",   label:"Compare",    icon:"C" },
    { id:"alerts",    label:"Alerts",     icon:"A", badge: allAlerts.length },
    { id:"predict",   label:"Predict",    icon:"P" },
  ];

  // Shared chart props
  const axisStyle  = { fill:"rgba(255,255,255,0.25)", fontSize:9, fontFamily:"monospace" };
  const gridProps  = { stroke:"rgba(255,255,255,0.04)", strokeDasharray:"4 4" };

  return (
    <div style={{ minHeight:"100vh", background:"#040916", color:"#e2e8f0", overflowX:"hidden", fontFamily:"system-ui,sans-serif" }}>

      {/* ─── Injected Styles ───────────────────────────────────────────────── */}
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #040916; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(56,189,248,0.2); border-radius:4px; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.45;transform:scale(1.3)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ticker { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        .fu  { animation: fadeUp 0.45s ease forwards; opacity:0; }
        .fu1 { animation-delay:0.08s; }
        .fu2 { animation-delay:0.16s; }
        .fu3 { animation-delay:0.24s; }
        .fu4 { animation-delay:0.32s; }
        .nbtn:hover { background:rgba(56,189,248,0.1)!important; border-color:rgba(56,189,248,0.3)!important; color:#38bdf8!important; }
        .crow:hover { background:rgba(56,189,248,0.07)!important; }
        .rbtn:hover { background:rgba(56,189,248,0.15)!important; }
      `}</style>

      {/* ─── API Key Setup Modal ───────────────────────────────────────────── */}
      {showApiSetup && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(8px)" }} onClick={() => setShowApiSetup(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background:"rgba(6,12,26,0.98)", border:"1px solid rgba(56,189,248,0.2)", borderRadius:20, padding:"36px 40px", maxWidth:520, width:"90%", boxShadow:"0 40px 100px rgba(0,0,0,0.7)" }}>
            <div style={{ fontSize:9, color:"rgba(56,189,248,0.7)", fontFamily:"monospace", letterSpacing:3, marginBottom:10 }}>LIVE DATA CONFIGURATION</div>
            <h2 style={{ fontSize:22, fontWeight:800, marginBottom:8, color:"#e2e8f0" }}>OpenWeatherMap API Key</h2>
            <p style={{ fontSize:12, color:"rgba(255,255,255,0.4)", lineHeight:1.7, marginBottom:22, fontFamily:"monospace" }}>
              EcoInsight uses the free OpenWeatherMap API for real-time weather and air pollution data.
              Get a free API key at <span style={{ color:"#38bdf8" }}>openweathermap.org/api</span> — no credit card needed.
              The key is stored only in your browser's localStorage.
            </p>
            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:9, color:"rgba(255,255,255,0.3)", fontFamily:"monospace", letterSpacing:2, marginBottom:8 }}>FREE APIs USED</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {[
                  ["Current Weather", "api.openweathermap.org/data/2.5/weather", "Temp, Humidity, Rainfall"],
                  ["Air Pollution",   "api.openweathermap.org/data/2.5/air_pollution", "PM2.5, PM10, O3, NO2, CO, AQI"],
                ].map(([name, url, data]) => (
                  <div key={name} style={{ background:"rgba(255,255,255,0.03)", borderRadius:9, padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:"#38bdf8", fontFamily:"monospace" }}>{name}</div>
                      <div style={{ fontSize:9, color:"rgba(255,255,255,0.25)", fontFamily:"monospace" }}>{url}</div>
                    </div>
                    <div style={{ fontSize:9, color:"rgba(255,255,255,0.4)", fontFamily:"monospace", textAlign:"right" }}>{data}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display:"flex", gap:10, marginBottom:16 }}>
              <input
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && apiKeyInput.trim()) { saveApiKey(apiKeyInput.trim()); fetchAllCities(apiKeyInput.trim()); }}}
                placeholder={apiKey ? "Current: " + apiKey.slice(0,8) + "..." : "Paste your API key here..."}
                style={{ flex:1, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"10px 14px", color:"#e2e8f0", fontSize:12, fontFamily:"monospace", outline:"none" }}
              />
              <button
                onClick={() => { if (apiKeyInput.trim()) { saveApiKey(apiKeyInput.trim()); fetchAllCities(apiKeyInput.trim()); }}}
                disabled={!apiKeyInput.trim()}
                style={{ background: apiKeyInput.trim() ? "#38bdf8" : "rgba(255,255,255,0.05)", color: apiKeyInput.trim() ? "#000" : "rgba(255,255,255,0.3)", border:"none", borderRadius:10, padding:"10px 20px", cursor: apiKeyInput.trim() ? "pointer" : "default", fontSize:12, fontFamily:"monospace", fontWeight:700 }}
              >
                Activate
              </button>
            </div>
            {fetchError && <div style={{ fontSize:10, color:"#f97316", fontFamily:"monospace", marginBottom:12, padding:"8px 12px", background:"rgba(249,115,22,0.08)", borderRadius:8 }}>{fetchError}</div>}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.22)", fontFamily:"monospace" }}>
                {isLive ? "✓ Live data active — " + Object.values(fetchStatus).filter(s => s === "ok").length + "/" + CITIES.length + " cities loaded" : "Currently showing static demo data"}
              </div>
              {isLive && <button onClick={() => fetchAllCities(apiKey)} style={{ background:"rgba(56,189,248,0.1)", border:"1px solid rgba(56,189,248,0.2)", color:"#38bdf8", borderRadius:8, padding:"6px 14px", cursor:"pointer", fontSize:10, fontFamily:"monospace" }}>Refresh Now</button>}
            </div>
          </div>
        </div>
      )}

      {/* ─── Fetch Status Strip ────────────────────────────────────────────── */}
      {Object.values(fetchStatus).some(s => s === "loading") && (
        <div style={{ background:"rgba(56,189,248,0.07)", borderBottom:"1px solid rgba(56,189,248,0.15)", padding:"7px 26px", display:"flex", alignItems:"center", gap:12, fontSize:10, fontFamily:"monospace", color:"rgba(56,189,248,0.7)", position:"relative", zIndex:40 }}>
          <span style={{ width:6, height:6, borderRadius:"50%", background:"#38bdf8", display:"inline-block", animation:"pulse 1s infinite" }} />
          Fetching live data from OpenWeatherMap —
          <span style={{ color:"#22c55e" }}>{Object.values(fetchStatus).filter(s => s === "ok").length} ok</span>
          · <span style={{ color:"#f97316" }}>{Object.values(fetchStatus).filter(s => s === "loading").length} loading</span>
          · <span style={{ color:"rgba(255,255,255,0.3)" }}>{CITIES.length} total cities</span>
        </div>
      )}
      {fetchError && !Object.values(fetchStatus).some(s => s === "loading") && (
        <div style={{ background:"rgba(249,115,22,0.06)", borderBottom:"1px solid rgba(249,115,22,0.2)", padding:"7px 26px", display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:10, fontFamily:"monospace", color:"#fb923c", position:"relative", zIndex:40 }}>
          {fetchError}
          <button onClick={() => setFetchError("")} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.3)", cursor:"pointer" }}>×</button>
        </div>
      )}

      {/* ─── Background FX ─────────────────────────────────────────────────── */}
      <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:0 }}>
        <div style={{ position:"absolute", top:"-15%", left:"-8%",   width:"55%", height:"55%", background:"radial-gradient(ellipse,rgba(56,189,248,0.04) 0%,transparent 68%)" }} />
        <div style={{ position:"absolute", bottom:"-15%", right:"-8%", width:"50%", height:"50%", background:"radial-gradient(ellipse,rgba(34,197,94,0.035) 0%,transparent 68%)" }} />
        <div style={{ position:"absolute", top:"35%", left:"35%", width:"45%", height:"45%", background:"radial-gradient(ellipse," + hex(meta.color, 0.03) + " 0%,transparent 70%)", transition:"background 1.2s" }} />
        <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%" }}>
          <defs>
            <pattern id="bgGrid" width="56" height="56" patternUnits="userSpaceOnUse">
              <path d="M56 0L0 0 0 56" fill="none" stroke="rgba(56,189,248,0.025)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#bgGrid)" />
        </svg>
      </div>

      {/* ─── Header ────────────────────────────────────────────────────────── */}
      <header style={{ position:"sticky", top:0, zIndex:50, background:"rgba(4,9,22,0.9)", backdropFilter:"blur(24px)", borderBottom:"1px solid rgba(255,255,255,0.05)", height:62, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 26px" }}>

        {/* Logo */}
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ position:"relative", width:34, height:34, flexShrink:0 }}>
            <svg width="34" height="34" viewBox="0 0 34 34">
              <circle cx="17" cy="17" r="15" fill="none" stroke="rgba(56,189,248,0.2)"  strokeWidth="1" />
              <circle cx="17" cy="17" r="9"  fill="none" stroke="#38bdf8"               strokeWidth="1.5" strokeDasharray="3.5 2" />
              <circle cx="17" cy="17" r="3.5" fill="#38bdf8" />
            </svg>
            <span style={{ position:"absolute", top:1, right:1, width:9, height:9, borderRadius:"50%", background:"#22c55e", animation:"pulse 2s infinite", border:"2px solid #040916" }} />
          </div>
          <div>
            <div style={{ fontWeight:800, fontSize:17, lineHeight:1, letterSpacing:0.5 }}>
              <span style={{ color:"#38bdf8" }}>ECO</span>
              <span style={{ color:"rgba(255,255,255,0.88)" }}>INSIGHT</span>
            </div>
            <div style={{ fontSize:8, color:"rgba(255,255,255,0.22)", letterSpacing:3, fontFamily:"monospace", marginTop:2 }}>ENVIRONMENTAL ANALYTICS</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ display:"flex", gap:2 }}>
          {nav.map((n) => (
            <button key={n.id} className="nbtn" onClick={() => setPage(n.id)} style={{
              background:    page === n.id ? "rgba(56,189,248,0.11)" : "transparent",
              border:        "1px solid " + (page === n.id ? "rgba(56,189,248,0.38)" : "transparent"),
              color:         page === n.id ? "#38bdf8" : "rgba(255,255,255,0.42)",
              padding:       "6px 13px",
              borderRadius:  9,
              cursor:        "pointer",
              fontSize:      11,
              fontFamily:    "monospace",
              display:       "flex",
              alignItems:    "center",
              gap:           6,
              position:      "relative",
              transition:    "all 0.2s",
            }}>
              {n.label}
              {n.badge > 0 && (
                <span style={{ background:"#ef4444", color:"#fff", borderRadius:20, padding:"1px 5px", fontSize:9, fontWeight:700 }}>{n.badge}</span>
              )}
              {page === n.id && (
                <div style={{ position:"absolute", bottom:-1, left:"50%", transform:"translateX(-50%)", width:20, height:1.5, background:"#38bdf8", borderRadius:1 }} />
              )}
            </button>
          ))}
        </nav>

        {/* Right controls */}
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>

          {/* Ticker */}
          <div style={{ overflow:"hidden", width:190, height:26, display:"flex", alignItems:"center", background:"rgba(255,255,255,0.025)", borderRadius:7, border:"1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ display:"flex", gap:18, animation:"ticker 24s linear infinite", whiteSpace:"nowrap", padding:"0 10px", fontSize:9, fontFamily:"monospace", color:"rgba(255,255,255,0.3)" }}>
              {CITIES.concat(CITIES).map((c, i) => {
                const m = aqiMeta(cityDB[c].aqi);
                return <span key={i} style={{ color:"rgba(255,255,255,0.3)" }}><span style={{ color:m.color }}>•</span> {c} {cityDB[c].aqi}</span>;
              })}
            </div>
          </div>

          {/* City picker */}
          <div style={{ position:"relative" }}>
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.78)", padding:"6px 12px", borderRadius:9, cursor:"pointer", fontSize:11, fontFamily:"monospace", display:"flex", alignItems:"center", gap:8, minWidth:130 }}
            >
              <span style={{ color:meta.color, fontSize:8 }}>●</span>
              {city}
              <span style={{ color:"rgba(255,255,255,0.25)", marginLeft:"auto" }}>▾</span>
            </button>

            {searchOpen && (
              <div style={{ position:"absolute", top:"108%", right:0, width:210, background:"rgba(6,12,26,0.98)", border:"1px solid rgba(56,189,248,0.15)", borderRadius:13, boxShadow:"0 28px 80px rgba(0,0,0,0.65)", zIndex:200, overflow:"hidden", backdropFilter:"blur(24px)" }}>
                <div style={{ padding:9, borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                  <input
                    autoFocus
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    placeholder="Search city..."
                    style={{ width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:7, padding:"6px 11px", color:"#e2e8f0", fontSize:11, fontFamily:"monospace", outline:"none" }}
                  />
                </div>
                {filteredCities.map((c) => {
                  const m = aqiMeta(cityDB[c].aqi);
                  return (
                    <div key={c} className="crow" onClick={() => { setCity(c); setSearchOpen(false); setSearchQ(""); }} style={{ padding:"9px 13px", cursor:"pointer", fontSize:11, fontFamily:"monospace", display:"flex", justifyContent:"space-between", alignItems:"center", background: c === city ? "rgba(56,189,248,0.08)" : "transparent", transition:"background 0.15s" }}>
                      <span style={{ color: c === city ? "#38bdf8" : "rgba(255,255,255,0.65)" }}>{c}</span>
                      <span style={{ color:m.color, fontWeight:700, fontSize:10 }}>{cityDB[c].aqi} AQI</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Live badge / API status */}
          {isLive ? (
            <div style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 11px", background:"rgba(34,197,94,0.08)", border:"1px solid rgba(34,197,94,0.2)", borderRadius:9, fontSize:10, fontFamily:"monospace", color:"rgba(34,197,94,0.9)", cursor:"pointer" }} onClick={() => setShowApiSetup(true)}>
              <span style={{ width:6, height:6, borderRadius:"50%", background:"#22c55e", display:"inline-block", animation:"pulse 1.6s infinite" }} />
              LIVE {lastUpdated ? "· " + lastUpdated.toLocaleTimeString() : ""}
            </div>
          ) : (
            <button onClick={() => setShowApiSetup(true)} style={{ background:"rgba(251,146,60,0.1)", border:"1px solid rgba(251,146,60,0.3)", color:"#fb923c", padding:"6px 12px", borderRadius:9, cursor:"pointer", fontSize:10, fontFamily:"monospace", display:"flex", alignItems:"center", gap:7 }}>
              <span style={{ width:6, height:6, borderRadius:"50%", background:"#fb923c", display:"inline-block", animation:"pulse 2s infinite" }} />
              DEMO DATA — Add API Key
            </button>
          )}
        </div>
      </header>

      {/* ─── Alert Strip ───────────────────────────────────────────────────── */}
      {page !== "alerts" && myAlerts.slice(0, 1).map((a, i) => (
        <div key={i} style={{ background: hex(a.color, 0.09), borderBottom:"1px solid " + hex(a.color, 0.25), padding:"9px 26px", display:"flex", alignItems:"center", justifyContent:"space-between", fontSize:11, fontFamily:"monospace", position:"relative", zIndex:40 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontWeight:700, color:a.color }}>{a.title}</span>
            <span style={{ color:"rgba(255,255,255,0.25)" }}>·</span>
            <span style={{ color:"rgba(255,255,255,0.42)" }}>{a.msg}</span>
          </div>
          <button onClick={() => setDismiss([...dismissed, i])} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.3)", cursor:"pointer", fontSize:16 }}>x</button>
        </div>
      ))}

      {/* ─── Main ──────────────────────────────────────────────────────────── */}
      <main style={{ padding:"30px 26px", maxWidth:1440, margin:"0 auto", position:"relative", zIndex:1 }}>

        {/* ════════════════════════════ DASHBOARD ════════════════════════════ */}
        {page === "dashboard" && loaded && (
          <div>
            {/* Page header */}
            <div className="fu fu1" style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:28 }}>
              <div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.22)", fontFamily:"monospace", letterSpacing:3, marginBottom:6 }}>ENVIRONMENTAL DASHBOARD</div>
                <h1 style={{ fontSize:34, fontWeight:800, lineHeight:1.08, margin:0 }}>
                  <span style={{ color:meta.color }}>{city}</span>{" "}
                  <span style={{ color:"rgba(255,255,255,0.75)" }}>Air & Climate</span>
                </h1>
                <div style={{ display:"flex", gap:16, marginTop:8, fontSize:10, color:"rgba(255,255,255,0.28)", fontFamily:"monospace" }}>
                  <span>Lat {data.lat.toFixed(2)} Lng {data.lng.toFixed(2)}</span>
                  <span>{data.country}</span>
                  <span>{new Date().toLocaleTimeString()}</span>
                  <span>Source: IQAir 2024 / WHO DB</span>
                </div>
              </div>

              <Card style={{ padding:"18px 22px", minWidth:190 }} glow={meta.color}>
                <div style={{ fontSize:9, color:"rgba(255,255,255,0.3)", fontFamily:"monospace", letterSpacing:2, marginBottom:6 }}>US AQI (EPA SCALE)</div>
                <div style={{ fontSize:50, fontWeight:800, color:meta.color, fontFamily:"monospace", lineHeight:1 }}>{data.aqi}</div>
                <div style={{ fontSize:11, color:meta.color, marginTop:5, fontFamily:"monospace" }}>{meta.label}</div>
                <div style={{ marginTop:10, height:3, background:"rgba(255,255,255,0.06)", borderRadius:3 }}>
                  <div style={{ width: Math.min(data.aqi/300*100,100) + "%", height:"100%", background:"linear-gradient(90deg,#22c55e," + meta.color + ")", borderRadius:3, transition:"width 1s" }} />
                </div>
                <div style={{ fontSize:9, color:"rgba(255,255,255,0.18)", marginTop:5, fontFamily:"monospace", display:"flex", justifyContent:"space-between" }}>
                  <span>0 Good</span><span>300+ Haz.</span>
                </div>
              </Card>
            </div>

            {/* 3-column row: Gauge | Pollutants | Weather */}
            <div className="fu fu2" style={{ display:"grid", gridTemplateColumns:"1fr 1.05fr 1fr", gap:18, marginBottom:20 }}>

              {/* Gauge card */}
              <Card style={{ padding:"26px", display:"flex", flexDirection:"column", alignItems:"center", background:"linear-gradient(145deg," + hex(meta.color,0.06) + ",rgba(12,20,38,0.85))" }} glow={meta.color}>
                <div style={{ fontSize:9, color:"rgba(255,255,255,0.28)", fontFamily:"monospace", letterSpacing:2, marginBottom:10 }}>AQI GAUGE</div>
                <ArcGauge value={data.aqi} max={300} />
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, width:"100%", marginTop:14 }}>
                  {[
                    { l:"PM2.5", v:data.pm25, u:"ug/m3", c: data.pm25 > 75 ? "#f97316" : data.pm25 > 35 ? "#eab308" : "#22c55e" },
                    { l:"PM10",  v:data.pm10, u:"ug/m3", c: data.pm10 >150 ? "#f97316" : data.pm10 > 45 ? "#eab308" : "#22c55e" },
                    { l:"O3",    v:data.o3,   u:"ug/m3", c: data.o3  > 100 ? "#eab308" : "#38bdf8" },
                    { l:"NO2",   v:data.no2,  u:"ug/m3", c: data.no2 >  40 ? "#f97316" : "#22c55e" },
                  ].map(({ l, v, u, c }) => (
                    <div key={l} style={{ background:"rgba(255,255,255,0.03)", borderRadius:10, padding:"10px 12px" }}>
                      <div style={{ fontSize:9,  color:"rgba(255,255,255,0.3)", fontFamily:"monospace", letterSpacing:1 }}>{l}</div>
                      <div style={{ fontSize:20, fontWeight:700, color:c, fontFamily:"monospace", lineHeight:1.2, marginTop:3 }}>{v}</div>
                      <div style={{ fontSize:9,  color:"rgba(255,255,255,0.22)" }}>{u}</div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Pollutant bars */}
              <Card style={{ padding:"26px" }}>
                <div style={{ fontSize:9, color:"rgba(255,255,255,0.28)", fontFamily:"monospace", letterSpacing:2, marginBottom:18 }}>POLLUTANTS vs WHO 24H GUIDELINES</div>
                <PollBar label="PM2.5 Fine Particles"    value={data.pm25}     max={150} who={15}  color="#a78bfa" />
                <PollBar label="PM10 Coarse Particles"   value={data.pm10}     max={300} who={45}  color="#38bdf8" />
                <PollBar label="O3 Ozone"                value={data.o3}       max={200} who={100} color="#22c55e" />
                <PollBar label="NO2 Nitrogen Dioxide"    value={data.no2}      max={200} who={25}  color="#f97316" />
                <PollBar label="CO x100 (mg/m3 * 100)"  value={data.co * 100} max={400} who={100} color="#eab308" />
                <div style={{ marginTop:14, padding:"9px 12px", background:"rgba(255,255,255,0.025)", borderRadius:9, fontSize:9, color:"rgba(255,255,255,0.22)", fontFamily:"monospace", lineHeight:1.9 }}>
                  Markers = WHO 24h limits. OK = within safe range, ! = exceeded.
                  Based on WHO 2021 Air Quality Guidelines.
                </div>
              </Card>

              {/* Weather cards */}
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {[
                  { icon:"T", label:"Temperature",     value:data.temp,     unit:"C",    color: data.temp > 35 ? "#f43f5e" : data.temp > 25 ? "#fb923c" : "#38bdf8",          sub:"Feels like ~" + (data.temp + 2.1).toFixed(1) + "C" },
                  { icon:"H", label:"Humidity",         value:data.humidity, unit:"%",    color: data.humidity > 80 ? "#a855f7" : data.humidity > 60 ? "#38bdf8" : "#22c55e", sub:"Dew ~" + (data.temp - (100 - data.humidity) / 5).toFixed(0) + "C" },
                  { icon:"R", label:"Rainfall",         value:data.rainfall, unit:"mm/d", color: data.rainfall > 10 ? "#3b82f6" : data.rainfall > 5 ? "#60a5fa" : "#64748b",  sub: data.rainfall > 10 ? "Heavy rain" : data.rainfall > 3 ? "Moderate" : "Light" },
                  { icon:"C", label:"CO",               value:data.co,       unit:"mg/m3",color: data.co > 2 ? "#f97316" : data.co > 1 ? "#eab308" : "#22c55e",               sub:"WHO limit: 4 mg/m3" },
                ].map(({ icon, label, value, unit, color, sub }) => (
                  <Card key={label} style={{ padding:"14px 18px", display:"flex", alignItems:"center", gap:14 }} glow={color}>
                    <div style={{ width:42, height:42, borderRadius:12, background: hex(color, 0.1), display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:800, color, flexShrink:0 }}>{icon}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:9, color:"rgba(255,255,255,0.3)", fontFamily:"monospace", letterSpacing:2 }}>{label.toUpperCase()}</div>
                      <div style={{ fontSize:22, fontWeight:700, color, fontFamily:"monospace", lineHeight:1.2, marginTop:2 }}>
                        {value}<span style={{ fontSize:11, color:"rgba(255,255,255,0.3)", marginLeft:4 }}>{unit}</span>
                      </div>
                      <div style={{ fontSize:9, color:"rgba(255,255,255,0.3)", marginTop:1 }}>{sub}</div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {/* Trend mini charts */}
            <div className="fu fu3" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18, marginBottom:20 }}>
              {[
                { key:"aqi",         name:"Air Quality Index (AQI)", color:"#38bdf8", note:"EPA AQI Scale" },
                { key:"pm25",        name:"PM2.5 Fine Particles",    color:"#a78bfa", note:"WHO 24h limit: 15 ug/m3" },
                { key:"temperature", name:"Temperature",              color:"#f97316", note:"Celsius" },
                { key:"rainfall",    name:"Rainfall",                 color:"#3b82f6", note:"mm / day" },
              ].map(({ key, name, color, note }) => {
                const lastVal = trend[trend.length - 1] ? trend[trend.length - 1][key] : 0;
                const displayVal = typeof lastVal === "number" ? Math.round(lastVal) : lastVal;
                return (
                  <Card key={key} style={{ padding:"20px 22px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
                      <div>
                        <div style={{ fontSize:9, color:"rgba(255,255,255,0.28)", fontFamily:"monospace", letterSpacing:2 }}>{name.toUpperCase()}</div>
                        <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", marginTop:3 }}>{note}</div>
                      </div>
                      <div style={{ fontSize:22, fontWeight:700, color, fontFamily:"monospace" }}>{displayVal}</div>
                    </div>
                    <ResponsiveContainer width="100%" height={105}>
                      <AreaChart data={trend} margin={{ top:4, right:0, left:-34, bottom:0 }}>
                        <defs>
                          <linearGradient id={"fg" + key} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor={color} stopOpacity={0.4} />
                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid {...gridProps} />
                        <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} interval={Math.floor(trend.length / 4)} />
                        <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTip />} />
                        <Area type="monotone" dataKey={key} stroke={color} fill={"url(#fg" + key + ")"} strokeWidth={2} dot={false} activeDot={{ r:4, fill:color }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Card>
                );
              })}
            </div>

            {/* Health Advisory */}
            <div className="fu fu4">
              <Card style={{ padding:"22px 26px", background:"linear-gradient(135deg," + hex(meta.color,0.07) + ",rgba(12,20,38,0.75))" }}>
                <div style={{ display:"flex", gap:22, alignItems:"center" }}>
                  <div style={{ fontSize:44, flexShrink:0 }}>{data.aqi > 200 ? "!" : data.aqi > 150 ? "!" : data.aqi > 100 ? "!" : data.aqi > 50 ? "~" : "OK"}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:9, color:"rgba(255,255,255,0.28)", fontFamily:"monospace", letterSpacing:3, marginBottom:7 }}>HEALTH ADVISORY</div>
                    <div style={{ fontSize:16, fontWeight:700, color:meta.color, marginBottom:10 }}>
                      {data.aqi <= 50  && "Great air quality — enjoy outdoor activities freely"}
                      {data.aqi > 50  && data.aqi <= 100 && "Moderate air — sensitive groups should limit prolonged exertion"}
                      {data.aqi > 100 && data.aqi <= 150 && "Unhealthy for sensitive groups — reduce outdoor activities"}
                      {data.aqi > 150 && data.aqi <= 200 && "Unhealthy — everyone should reduce outdoor activities"}
                      {data.aqi > 200 && data.aqi <= 300 && "Very unhealthy — avoid outdoor activity, wear N95 mask"}
                      {data.aqi > 300 && "HAZARDOUS — stay indoors, use air purifier, emergency conditions"}
                    </div>
                    <div style={{ display:"flex", gap:18, flexWrap:"wrap" }}>
                      {[
                        { tip:"Outdoor exercise", ok: data.aqi <= 100 },
                        { tip:"Safe for children",ok: data.aqi <= 100 },
                        { tip:"Open windows",     ok: data.aqi <= 50  },
                        { tip:"Mask needed",      ok: data.aqi > 150  },
                      ].map(({ tip, ok }) => (
                        <span key={tip} style={{ fontSize:11, color: ok ? "rgba(34,197,94,0.8)" : "rgba(255,255,255,0.28)", display:"flex", alignItems:"center", gap:5 }}>
                          {tip} <span style={{ color: ok ? "#22c55e" : "rgba(255,255,255,0.2)" }}>{ok ? "Yes" : "No"}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ textAlign:"right", minWidth:110, flexShrink:0 }}>
                    <div style={{ fontSize:9, color:"rgba(255,255,255,0.22)", fontFamily:"monospace", marginBottom:7, letterSpacing:1 }}>DATA SOURCES</div>
                    {["IQAir 2024","OpenAQ API","WHO 2021","EPA AQI"].map((s) => (
                      <div key={s} style={{ fontSize:9, color:"rgba(255,255,255,0.28)", fontFamily:"monospace", marginBottom:3 }}>OK {s}</div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════ MAP ═══════════════════════════════ */}
        {page === "map" && (
          <div>
            <div className="fu fu1" style={{ marginBottom:26 }}>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.22)", fontFamily:"monospace", letterSpacing:3, marginBottom:6 }}>GLOBAL MONITORING</div>
              <h1 style={{ fontSize:30, fontWeight:800, margin:0 }}>Environmental <span style={{ color:"#38bdf8" }}>World Map</span></h1>
              <p style={{ color:"rgba(255,255,255,0.32)", fontSize:12, marginTop:7, fontFamily:"monospace" }}>Monitoring {CITIES.length} stations worldwide — click a marker to inspect</p>
            </div>

            <div className="fu fu2" style={{ marginBottom:24 }}>
              <WorldMap cities={CITIES} selected={city} onSelect={setCity} cityDB={cityDB} />
            </div>

            <div className="fu fu3" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))", gap:13 }}>
              {CITIES.map((c) => {
                const d = cityDB[c], m = aqiMeta(d.aqi);
                return (
                  <Card key={c} onClick={() => setCity(c)} style={{ padding:"16px 18px", background: c === city ? hex(m.color,0.07) : "rgba(12,20,38,0.78)", border:"1px solid " + (c === city ? hex(m.color,0.3) : "rgba(255,255,255,0.07)") }} glow={c === city ? m.color : undefined}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:11 }}>
                      <div>
                        <div style={{ fontWeight:700, fontSize:15, color: c === city ? "#fff" : "rgba(255,255,255,0.8)" }}>{c}</div>
                        <div style={{ fontSize:9, color:"rgba(255,255,255,0.28)", fontFamily:"monospace", marginTop:2 }}>{d.country}</div>
                      </div>
                      <span style={{ background:m.color, color:"#000", borderRadius:20, padding:"3px 11px", fontSize:10, fontWeight:800, fontFamily:"monospace" }}>{m.label}</span>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                      {[
                        { l:"AQI",   v:d.aqi,          c:m.color },
                        { l:"PM2.5", v:d.pm25+"ug",     c: d.pm25 > 35 ? "#f97316" : "#22c55e" },
                        { l:"Temp",  v:d.temp+"C",      c: d.temp > 35 ? "#f43f5e" : "#38bdf8" },
                        { l:"Humid", v:d.humidity+"%",  c:"#60a5fa" },
                        { l:"Rain",  v:d.rainfall+"mm", c:"#3b82f6" },
                        { l:"NO2",   v:d.no2+"ug",      c: d.no2 > 40 ? "#f97316" : "#22c55e" },
                      ].map(({ l, v, c }) => (
                        <div key={l} style={{ background:"rgba(255,255,255,0.03)", borderRadius:7, padding:"7px 9px" }}>
                          <div style={{ fontSize:8, color:"rgba(255,255,255,0.25)", fontFamily:"monospace" }}>{l}</div>
                          <div style={{ fontSize:13, fontWeight:700, color:c, fontFamily:"monospace", marginTop:2 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* ════════════════════════════ TRENDS ═══════════════════════════════ */}
        {page === "trends" && (
          <div>
            <div className="fu fu1" style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:28 }}>
              <div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.22)", fontFamily:"monospace", letterSpacing:3, marginBottom:6 }}>TRENDS & ANALYTICS</div>
                <h1 style={{ fontSize:30, fontWeight:800, margin:0 }}>{city} <span style={{ color:"#38bdf8" }}>Historical Data</span></h1>
              </div>
              <div style={{ display:"flex", gap:4, background:"rgba(12,20,38,0.85)", padding:4, borderRadius:10, border:"1px solid rgba(255,255,255,0.05)" }}>
                {[["7d","7 Days"],["30d","30 Days"],["12m","12 Months"]].map(([k, l]) => (
                  <button key={k} className="rbtn" onClick={() => setRange(k)} style={{ background: range === k ? "#38bdf8" : "transparent", color: range === k ? "#000" : "rgba(255,255,255,0.45)", border:"none", padding:"7px 16px", borderRadius:8, cursor:"pointer", fontSize:11, fontFamily:"monospace", fontWeight: range === k ? 700 : 400, transition:"all 0.2s" }}>{l}</button>
                ))}
              </div>
            </div>

            {/* AQI Chart */}
            <div className="fu fu2">
              <Card style={{ padding:"26px", marginBottom:18 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
                  <div>
                    <div style={{ fontSize:9, color:"rgba(255,255,255,0.28)", fontFamily:"monospace", letterSpacing:3 }}>AIR QUALITY INDEX (EPA 0-300+ SCALE)</div>
                    <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", marginTop:4 }}>Dashed lines = EPA category thresholds</div>
                  </div>
                  <div style={{ fontSize:28, fontWeight:800, color:meta.color, fontFamily:"monospace" }}>{data.aqi} <span style={{ fontSize:11, color:"rgba(255,255,255,0.3)" }}>AQI</span></div>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <ComposedChart data={trend} margin={{ top:5, right:10, left:-8, bottom:0 }}>
                    <defs>
                      <linearGradient id="aqiG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={meta.color} stopOpacity={0.45} />
                        <stop offset="95%" stopColor={meta.color} stopOpacity={0}    />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} />
                    <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={38} />
                    <Tooltip content={<ChartTip />} />
                    <ReferenceLine y={50}  stroke="#22c55e" strokeDasharray="5 3" strokeOpacity={0.45} label={{ value:"Good 50",     fill:"#22c55e", fontSize:8 }} />
                    <ReferenceLine y={100} stroke="#eab308" strokeDasharray="5 3" strokeOpacity={0.45} label={{ value:"Moderate 100",fill:"#eab308", fontSize:8 }} />
                    <ReferenceLine y={150} stroke="#f97316" strokeDasharray="5 3" strokeOpacity={0.45} label={{ value:"Sensitive 150",fill:"#f97316",fontSize:8 }} />
                    <ReferenceLine y={200} stroke="#ef4444" strokeDasharray="5 3" strokeOpacity={0.45} label={{ value:"Unhealthy 200",fill:"#ef4444",fontSize:8 }} />
                    <Area type="monotone" dataKey="aqi" name="AQI" stroke={meta.color} fill="url(#aqiG)" strokeWidth={2.5} dot={false} activeDot={{ r:5, fill:meta.color }} />
                    <Line type="monotone" dataKey="o3"  name="O3 ug/m3" stroke="#22c55e" strokeWidth={1.5} dot={false} strokeDasharray="3 2" />
                  </ComposedChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* Temperature + Rainfall */}
            <div className="fu fu3" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18, marginBottom:18 }}>
              <Card style={{ padding:"26px" }}>
                <div style={{ fontSize:9, color:"rgba(255,255,255,0.28)", fontFamily:"monospace", letterSpacing:3, marginBottom:18 }}>TEMPERATURE TREND (Celsius)</div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={trend} margin={{ top:4, right:5, left:-14, bottom:0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} />
                    <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTip />} />
                    <ReferenceLine y={35} stroke="#f43f5e" strokeDasharray="4 3" strokeOpacity={0.4} label={{ value:"Heat 35C", fill:"#f43f5e", fontSize:8 }} />
                    <Line type="monotone" dataKey="temperature" name="Temp C" stroke="#f97316" strokeWidth={2.5} dot={false} activeDot={{ r:4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>

              <Card style={{ padding:"26px" }}>
                <div style={{ fontSize:9, color:"rgba(255,255,255,0.28)", fontFamily:"monospace", letterSpacing:3, marginBottom:18 }}>RAINFALL (mm / day)</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={trend} margin={{ top:4, right:5, left:-14, bottom:0 }}>
                    <defs>
                      <linearGradient id="rainG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.9} />
                        <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0.5} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} />
                    <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTip />} />
                    <ReferenceLine y={8} stroke="#60a5fa" strokeDasharray="4 3" strokeOpacity={0.4} label={{ value:"Heavy 8mm", fill:"#60a5fa", fontSize:8 }} />
                    <Bar dataKey="rainfall" name="Rainfall mm" fill="url(#rainG)" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* PM2.5 + PM10 */}
            <div className="fu fu4">
              <Card style={{ padding:"26px" }}>
                <div style={{ fontSize:9, color:"rgba(255,255,255,0.28)", fontFamily:"monospace", letterSpacing:3, marginBottom:6 }}>PARTICULATE MATTER — PM2.5 & PM10 (ug/m3)</div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.28)", marginBottom:18 }}>WHO 24h: PM2.5 = 15 ug/m3, PM10 = 45 ug/m3</div>
                <ResponsiveContainer width="100%" height={210}>
                  <AreaChart data={trend} margin={{ top:5, right:10, left:-8, bottom:0 }}>
                    <defs>
                      <linearGradient id="pm25g" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#a78bfa" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#a78bfa" stopOpacity={0}    />
                      </linearGradient>
                      <linearGradient id="pm10g" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#38bdf8" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}    />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} />
                    <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={38} />
                    <Tooltip content={<ChartTip />} />
                    <ReferenceLine y={15} stroke="#a78bfa" strokeDasharray="5 3" strokeOpacity={0.5} label={{ value:"PM2.5 WHO",fill:"#a78bfa",fontSize:8 }} />
                    <ReferenceLine y={45} stroke="#38bdf8" strokeDasharray="5 3" strokeOpacity={0.5} label={{ value:"PM10 WHO", fill:"#38bdf8",fontSize:8 }} />
                    <Area type="monotone" dataKey="pm10" name="PM10 ug/m3"  stroke="#38bdf8" fill="url(#pm10g)" strokeWidth={1.8} dot={false} />
                    <Area type="monotone" dataKey="pm25" name="PM2.5 ug/m3" stroke="#a78bfa" fill="url(#pm25g)" strokeWidth={2.2} dot={false} />
                    <Legend formatter={(v) => <span style={{ color:"rgba(255,255,255,0.45)", fontSize:11, fontFamily:"monospace" }}>{v}</span>} />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>
            </div>
          </div>
        )}

        {/* ═══════════════════════════ COMPARE ═══════════════════════════════ */}
        {page === "compare" && (
          <div>
            <div className="fu fu1" style={{ marginBottom:24 }}>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.22)", fontFamily:"monospace", letterSpacing:3, marginBottom:6 }}>LOCATION COMPARISON</div>
              <h1 style={{ fontSize:30, fontWeight:800, margin:0 }}>Compare <span style={{ color:"#38bdf8" }}>Cities</span></h1>
              <p style={{ color:"rgba(255,255,255,0.3)", fontSize:11, marginTop:7, fontFamily:"monospace" }}>Select 2-4 cities — verified IQAir 2024 / WHO data</p>
            </div>

            {/* City toggles */}
            <div className="fu fu2" style={{ display:"flex", gap:9, flexWrap:"wrap", marginBottom:24 }}>
              {CITIES.map((c) => {
                const active = compare.includes(c), m = aqiMeta(cityDB[c].aqi);
                return (
                  <button key={c} onClick={() => {
                    if (active) { if (compare.length > 2) setCompare(compare.filter((x) => x !== c)); }
                    else if (compare.length < 4) setCompare([...compare, c]);
                  }} style={{ background: active ? hex(m.color,0.12) : "rgba(255,255,255,0.03)", border:"1px solid " + (active ? hex(m.color,0.35) : "rgba(255,255,255,0.07)"), color: active ? m.color : "rgba(255,255,255,0.42)", padding:"8px 16px", borderRadius:22, cursor:"pointer", fontSize:11, fontFamily:"monospace", transition:"all 0.2s", display:"flex", alignItems:"center", gap:7 }}>
                    {active && <span style={{ width:5, height:5, borderRadius:"50%", background:m.color, display:"inline-block" }} />}
                    {c}
                  </button>
                );
              })}
            </div>

            {/* AQI + PM2.5 bars */}
            <div className="fu fu2">
              <Card style={{ padding:"26px", marginBottom:18 }}>
                <div style={{ fontSize:9, color:"rgba(255,255,255,0.28)", fontFamily:"monospace", letterSpacing:3, marginBottom:18 }}>AQI AND PM2.5 COMPARISON</div>
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={compare.map((c) => ({ name:c, AQI: cityDB[c].aqi, PM25: cityDB[c].pm25 }))} margin={{ top:5, right:10, left:-10, bottom:0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="name" tick={{ ...axisStyle, fontSize:11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={36} />
                    <Tooltip content={<ChartTip />} />
                    <ReferenceLine y={100} stroke="#eab308" strokeDasharray="4 3" strokeOpacity={0.4} />
                    <ReferenceLine y={150} stroke="#ef4444" strokeDasharray="4 3" strokeOpacity={0.4} />
                    <Bar dataKey="AQI"  name="AQI"        fill="#38bdf8" radius={[5,5,0,0]} label={{ position:"top", fill:"rgba(255,255,255,0.4)", fontSize:10, fontFamily:"monospace" }} />
                    <Bar dataKey="PM25" name="PM2.5 ug/m3" fill="#a78bfa" radius={[5,5,0,0]} />
                    <Legend formatter={(v) => <span style={{ color:"rgba(255,255,255,0.45)", fontSize:11, fontFamily:"monospace" }}>{v}</span>} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* Radar + Temp horizontal bars */}
            <div className="fu fu3" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18, marginBottom:18 }}>
              <Card style={{ padding:"26px" }}>
                <div style={{ fontSize:9, color:"rgba(255,255,255,0.28)", fontFamily:"monospace", letterSpacing:3, marginBottom:14 }}>MULTI-DIMENSION RADAR</div>
                {(() => {
                  const metrics  = ["AQI","PM2.5","PM10","Temp","Humidity","NO2"];
                  const combined = metrics.map((m) => {
                    const row = { metric: m };
                    compare.forEach((c) => {
                      const d = cityDB[c];
                      const v = m === "AQI"  ? d.aqi / 3
                              : m === "PM2.5"? d.pm25
                              : m === "PM10" ? d.pm10 / 2
                              : m === "Temp" ? d.temp * 2
                              : m === "Humidity" ? d.humidity
                              : d.no2;
                      row[c] = Math.min(100, parseFloat(v.toFixed(1)));
                    });
                    return row;
                  });
                  return (
                    <ResponsiveContainer width="100%" height={270}>
                      <RadarChart data={combined}>
                        <PolarGrid stroke="rgba(255,255,255,0.07)" />
                        <PolarAngleAxis dataKey="metric" tick={{ fill:"rgba(255,255,255,0.4)", fontSize:11, fontFamily:"monospace" }} />
                        {compare.map((c, i) => (
                          <Radar key={c} name={c} dataKey={c} stroke={PALETTE[i]} fill={PALETTE[i]} fillOpacity={0.1} strokeWidth={2} />
                        ))}
                        <Legend formatter={(v) => <span style={{ color:"rgba(255,255,255,0.5)", fontSize:11, fontFamily:"monospace" }}>{v}</span>} />
                        <Tooltip content={<ChartTip />} />
                      </RadarChart>
                    </ResponsiveContainer>
                  );
                })()}
              </Card>

              <Card style={{ padding:"26px" }}>
                <div style={{ fontSize:9, color:"rgba(255,255,255,0.28)", fontFamily:"monospace", letterSpacing:3, marginBottom:14 }}>TEMPERATURE & HUMIDITY</div>
                <ResponsiveContainer width="100%" height={270}>
                  <BarChart data={compare.map((c) => ({ name:c, Temp: cityDB[c].temp, Humidity: cityDB[c].humidity }))} layout="vertical" margin={{ top:0, right:20, left:10, bottom:0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ ...axisStyle, fill:"rgba(255,255,255,0.55)" }} axisLine={false} tickLine={false} width={72} />
                    <Tooltip content={<ChartTip />} />
                    <Bar dataKey="Temp"     name="Temp C"    fill="#f97316" radius={[0,5,5,0]} />
                    <Bar dataKey="Humidity" name="Humidity %" fill="#38bdf8" radius={[0,5,5,0]} />
                    <Legend formatter={(v) => <span style={{ color:"rgba(255,255,255,0.45)", fontSize:11, fontFamily:"monospace" }}>{v}</span>} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* Data table */}
            <div className="fu fu4">
              <Card style={{ padding:"26px" }}>
                <div style={{ fontSize:9, color:"rgba(255,255,255,0.28)", fontFamily:"monospace", letterSpacing:3, marginBottom:18 }}>DETAILED TABLE — VERIFIED 2024 ANNUAL AVERAGES</div>
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"monospace", fontSize:11 }}>
                    <thead>
                      <tr style={{ borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
                        <th style={{ padding:"10px 14px", textAlign:"left",   color:"rgba(255,255,255,0.22)", fontWeight:400, fontSize:9, letterSpacing:2 }}>METRIC</th>
                        <th style={{ padding:"10px 8px",  textAlign:"center", color:"rgba(255,255,255,0.18)", fontWeight:400, fontSize:9 }}>WHO LIMIT</th>
                        {compare.map((c, i) => (
                          <th key={c} style={{ padding:"10px 14px", textAlign:"center", color:PALETTE[i], fontWeight:700 }}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { lbl:"AQI (EPA)",      key:"aqi",      unit:"",       who:50,   hb:true  },
                        { lbl:"PM2.5 ug/m3",    key:"pm25",     unit:"ug/m3",  who:15,   hb:true  },
                        { lbl:"PM10 ug/m3",     key:"pm10",     unit:"ug/m3",  who:45,   hb:true  },
                        { lbl:"Ozone ug/m3",    key:"o3",       unit:"ug/m3",  who:100,  hb:true  },
                        { lbl:"NO2 ug/m3",      key:"no2",      unit:"ug/m3",  who:25,   hb:true  },
                        { lbl:"Temp C",         key:"temp",     unit:"C",      who:null, hb:false },
                        { lbl:"Humidity %",     key:"humidity", unit:"%",      who:null, hb:false },
                        { lbl:"Rainfall mm/d",  key:"rainfall", unit:"mm",     who:null, hb:false },
                      ].map(({ lbl, key, unit, who, hb }, ri) => {
                        const vals = compare.map((c) => cityDB[c][key]);
                        const best = hb ? Math.min(...vals) : Math.max(...vals);
                        return (
                          <tr key={key} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)", background: ri % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)" }}>
                            <td style={{ padding:"11px 14px", color:"rgba(255,255,255,0.5)" }}>{lbl}</td>
                            <td style={{ padding:"11px 8px",  textAlign:"center", color:"rgba(255,255,255,0.2)", fontSize:9 }}>{who ? who + " " + unit : "—"}</td>
                            {compare.map((c) => {
                              const v      = cityDB[c][key];
                              const isBest = v === best;
                              const isOver = who && v > who && hb;
                              return (
                                <td key={c} style={{ padding:"11px 14px", textAlign:"center", fontWeight: isBest || isOver ? 700 : 400, color: isOver ? "#ef4444" : isBest ? "#22c55e" : "rgba(255,255,255,0.68)" }}>
                                  {v}{unit && <span style={{ fontSize:8, opacity:0.45, marginLeft:2 }}>{unit}</span>}
                                  {isBest && hb  && <span style={{ marginLeft:5, fontSize:9, color:"#22c55e" }}> OK</span>}
                                  {isOver        && <span style={{ marginLeft:5, fontSize:9, color:"#ef4444" }}> !</span>}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop:14, padding:"10px 14px", background:"rgba(255,255,255,0.02)", borderRadius:9, fontSize:9, color:"rgba(255,255,255,0.22)", fontFamily:"monospace", lineHeight:1.9 }}>
                  OK = best in group | ! = exceeds WHO guideline | Sources: IQAir 2024, WHO Air Quality DB 2022, OpenAQ
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ═══════════════════════════ ALERTS ════════════════════════════════ */}
        {page === "alerts" && (
          <div>
            <div className="fu fu1" style={{ marginBottom:28 }}>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.22)", fontFamily:"monospace", letterSpacing:3, marginBottom:6 }}>ENVIRONMENTAL ALERT SYSTEM</div>
              <h1 style={{ fontSize:30, fontWeight:800, margin:0 }}>Active <span style={{ color:"#ef4444" }}>Alerts</span></h1>
              <p style={{ color:"rgba(255,255,255,0.3)", fontSize:11, marginTop:7, fontFamily:"monospace" }}>
                {allAlerts.length} active alerts across {CITIES.length} stations — thresholds per EPA & WHO
              </p>
            </div>

            {/* Summary cards */}
            <div className="fu fu2" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:24 }}>
              {[
                { lbl:"Total Alerts",   val:allAlerts.length,                              color:"#38bdf8" },
                { lbl:"Hazardous AQI",  val:CITIES.filter((c) => cityDB[c].aqi > 200).length, color:"#a855f7" },
                { lbl:"High Pollution", val:CITIES.filter((c) => cityDB[c].aqi > 150).length, color:"#ef4444" },
                { lbl:"Heat Warnings",  val:CITIES.filter((c) => cityDB[c].temp > 35).length,  color:"#f43f5e" },
              ].map(({ lbl, val, color }) => (
                <Card key={lbl} style={{ padding:"22px" }} glow={color}>
                  <div style={{ fontSize:9, color:"rgba(255,255,255,0.3)", fontFamily:"monospace", letterSpacing:2, marginBottom:9 }}>{lbl.toUpperCase()}</div>
                  <div style={{ fontSize:42, fontWeight:800, color, fontFamily:"monospace", lineHeight:1 }}>{val}</div>
                  <div style={{ fontSize:9, color:"rgba(255,255,255,0.2)", marginTop:7, fontFamily:"monospace" }}>of {CITIES.length} stations</div>
                  <div style={{ marginTop:14, height:2.5, background:"rgba(255,255,255,0.06)", borderRadius:2 }}>
                    <div style={{ width: (val / CITIES.length * 100) + "%", height:"100%", background:color, borderRadius:2 }} />
                  </div>
                </Card>
              ))}
            </div>

            {/* Alert feed */}
            <div className="fu fu3" style={{ display:"flex", flexDirection:"column", gap:11 }}>
              {allAlerts.length === 0 ? (
                <Card style={{ padding:"48px", textAlign:"center" }} glow="#22c55e">
                  <div style={{ fontSize:56, marginBottom:14 }}>OK</div>
                  <div style={{ fontSize:22, fontWeight:700, color:"#22c55e", marginBottom:8 }}>All Clear</div>
                  <div style={{ color:"rgba(255,255,255,0.3)", fontSize:12, fontFamily:"monospace" }}>No active environmental alerts.</div>
                </Card>
              ) : (
                allAlerts
                  .sort((a, b) => {
                    const rank = { hazardous:0, veryBad:1, extreme:2, bad:3, heat:4, flood:5, rain:6, pm:7, pm2:8, moderate:9 };
                    return (rank[a.sev] ?? 9) - (rank[b.sev] ?? 9);
                  })
                  .map((a, i) => (
                    <Card key={i} style={{ padding:"16px 22px", background: hex(a.color,0.07), border:"1px solid " + hex(a.color,0.2), borderLeft:"4px solid " + a.color }}>
                      <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ display:"flex", gap:9, alignItems:"center", marginBottom:4 }}>
                            <span style={{ fontWeight:700, fontSize:14, color:a.color }}>{a.title}</span>
                            <span style={{ background: hex(a.color,0.14), color:a.color, borderRadius:20, padding:"2px 9px", fontSize:8, fontFamily:"monospace", fontWeight:700, letterSpacing:1 }}>{a.sev.toUpperCase()}</span>
                          </div>
                          <div style={{ color:"rgba(255,255,255,0.42)", fontSize:11, fontFamily:"monospace" }}>{a.msg}</div>
                        </div>
                        <div style={{ textAlign:"right", flexShrink:0 }}>
                          <div style={{ fontWeight:700, fontSize:14, color:"rgba(255,255,255,0.8)", marginBottom:3 }}>{a.city}</div>
                          <div style={{ fontSize:9, color:"rgba(255,255,255,0.25)", fontFamily:"monospace" }}>{cityDB[a.city].country}</div>
                          <div style={{ fontSize:9, color:"rgba(255,255,255,0.2)", fontFamily:"monospace", marginTop:2 }}>{new Date().toLocaleTimeString()}</div>
                        </div>
                      </div>
                    </Card>
                  ))
              )}
            </div>

            {/* Threshold reference */}
            <div className="fu fu4" style={{ marginTop:24 }}>
              <Card style={{ padding:"24px" }}>
                <div style={{ fontSize:9, color:"rgba(255,255,255,0.28)", fontFamily:"monospace", letterSpacing:3, marginBottom:18 }}>ALERT THRESHOLDS — EPA, WHO & WMO STANDARDS</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))", gap:10 }}>
                  {[
                    { lbl:"Moderate Air",     t:"AQI > 100",        src:"EPA", c:"#f97316" },
                    { lbl:"Unhealthy Air",     t:"AQI > 150",        src:"EPA", c:"#ef4444" },
                    { lbl:"Very Unhealthy",    t:"AQI > 200",        src:"EPA", c:"#a855f7" },
                    { lbl:"Heat Warning",      t:"Temp > 35C",       src:"WHO", c:"#fb923c" },
                    { lbl:"Extreme Heat",      t:"Temp > 40C",       src:"WMO", c:"#f43f5e" },
                    { lbl:"Heavy Rainfall",    t:"Rain > 8mm/day",   src:"WMO", c:"#3b82f6" },
                    { lbl:"Flood Risk",        t:"Rain > 15mm/day",  src:"WMO", c:"#1d4ed8" },
                    { lbl:"Elevated PM2.5",    t:"PM2.5 > 35 ug/m3", src:"WHO", c:"#c084fc" },
                  ].map(({ lbl, t, src, c }) => (
                    <div key={lbl} style={{ background: hex(c,0.06), border:"1px solid " + hex(c,0.18), borderRadius:10, padding:"12px 14px", display:"flex", gap:10, alignItems:"center" }}>
                      <div>
                        <div style={{ fontWeight:700, fontSize:11, color:c, fontFamily:"monospace" }}>{lbl}</div>
                        <div style={{ fontSize:10, color:"rgba(255,255,255,0.32)", fontFamily:"monospace" }}>{t}</div>
                        <div style={{ fontSize:8,  color:"rgba(255,255,255,0.18)", marginTop:2 }}>Source: {src}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ════════════════════════════ PREDICT ══════════════════════════════ */}
        {page === "predict" && (
          <PredictPage city={city} data={data} trend={trend} range={range} setRange={setRange} meta={meta} axisStyle={axisStyle} gridProps={gridProps} />
        )}
      </main>

      {/* ─── Footer ────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop:"1px solid rgba(255,255,255,0.05)", padding:"18px 26px", display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:36, background:"rgba(4,9,22,0.6)", position:"relative", zIndex:1 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ color:"#38bdf8", fontSize:18 }}>O</span>
          <div>
            <div style={{ fontWeight:800, fontSize:13, color:"rgba(255,255,255,0.65)" }}>ECOINSIGHT</div>
            <div style={{ fontSize:9, color:"rgba(255,255,255,0.18)", fontFamily:"monospace" }}>Environmental Monitoring Platform</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:18, fontSize:9, color:"rgba(255,255,255,0.18)", fontFamily:"monospace", flexWrap:"wrap", justifyContent:"center" }}>
          {isLive
            ? ["OpenWeatherMap","Air Pollution API","Current Weather API","EPA AQI","WHO"].map((s) => <span key={s} style={{ color:"rgba(34,197,94,0.5)" }}>✓ {s}</span>)
            : ["IQAir 2024","OpenAQ","WHO Air DB","EPA AQI","WMO"].map((s) => <span key={s}>~ {s}</span>)
          }
        </div>
        <div style={{ fontSize:9, color:"rgba(255,255,255,0.18)", fontFamily:"monospace", textAlign:"right" }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2, justifyContent:"flex-end" }}>
            <span style={{ width:5, height:5, borderRadius:"50%", background: isLive ? "#22c55e" : "#f97316", display:"inline-block", animation:"pulse 1.5s infinite" }} />
            {isLive ? "LIVE — " + Object.values(fetchStatus).filter(s=>s==="ok").length + "/" + CITIES.length + " stations" : "DEMO DATA — " + CITIES.length + " static stations"}
          </div>
          <div>{isLive && lastUpdated ? "Updated " + lastUpdated.toLocaleTimeString() + " · auto-refresh 10min" : new Date().toLocaleDateString() + " — Static 2024 data"}</div>
        </div>
      </footer>
    </div>
  );
}
