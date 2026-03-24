"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart as RePieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  CalendarDays,
  Coins,
  DollarSign,
  Landmark,
  LineChart,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  TrendingUp,
  Wallet,
  Database,
  Layers3,
  CalendarRange,
  PieChart
} from "lucide-react";

const STORAGE_KEY = "dividend-portfolio-pro-lots-v2";
const TAX_KEY = "dividend-portfolio-pro-tax-v2";
const FX_KEY = "dividend-portfolio-pro-fx-v2";
const INTERVAL_KEY = "dividend-portfolio-pro-interval-v2";
const OVERRIDES_KEY = "dividend-portfolio-pro-overrides-v2";
const DIVIDEND_API_KEY = "dividend-portfolio-pro-dividend-api-key-v1";
const ACTIVE_TAB_KEY = "dividend-portfolio-pro-active-tab-v1";
const SCHEDULE_EDITS_KEY = "dividend-portfolio-pro-schedule-edits-v1";
const MANUAL_FX_KEY = "dividend-portfolio-pro-manual-fx-v1";
const PORTFOLIO_SORT_KEY = "dividend-portfolio-pro-portfolio-sort-v1";
const DEFAULT_FX = 1350;
const REFRESH_OPTIONS = [3600];
const DEFAULT_FMP_API_KEY = "JD5Urnmm4nwRDPAAxo5eOuBKBqmGg7Ln";
const TABS = [
  { key: "overview", label: "개요", icon: PieChart },
  { key: "portfolio", label: "포트폴리오", icon: Layers3 },
  { key: "dividends", label: "배당 관리", icon: CalendarRange },
  { key: "history", label: "매수 기록", icon: Wallet }
];

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatKRW(value, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })}원`;
}

function formatMoney(value, currency = "KRW", digits) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const fractionDigits = typeof digits === "number" ? digits : currency === "USD" ? 2 : 0;
  const label = n.toLocaleString("ko-KR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  });
  return currency === "USD" ? `$${label}` : `${label}원`;
}

function formatPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatDate(input) {
  if (!input) return "—";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function formatShares(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("ko-KR", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

function getMonthKey(dateLike) {
  const date = new Date(dateLike);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(dateLike, months) {
  const date = new Date(dateLike);
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function monthLabelFromKey(key) {
  const [year, month] = key.split("-");
  return `${year}.${month}`;
}

function intervalLabel(seconds) {
  if (seconds < 60) return `${seconds}초`;
  if (seconds < 3600) return `${seconds / 60}분`;
  return `${seconds / 3600}시간`;
}

function clampDay(year, month, day) {
  return Math.max(1, Math.min(Number(day) || 1, new Date(year, month, 0).getDate()));
}

function moveWeekendToMonday(date) {
  const next = new Date(date);
  const day = next.getDay();
  let offset = 0;
  if (day === 6) offset = 2;
  if (day === 0) offset = 1;
  if (offset > 0) next.setDate(next.getDate() + offset);
  return { date: next, offset };
}

function buildManualDividendRows(config = {}) {
  const years = Array.isArray(config.years) ? [...new Set(config.years.map((v) => Number(v)).filter(Boolean))].sort((a, b) => a - b) : [];
  const months = Array.isArray(config.months) ? [...new Set(config.months.map((v) => Number(v)).filter((v) => v >= 1 && v <= 12))].sort((a, b) => a - b) : [];
  const exDay = Number(config.exDay) || 1;
  const payDay = Number(config.payDay) || exDay;
  const amount = toNumber(config.amountPerShare);
  const rows = [];
  for (const year of years) {
    for (const month of months) {
      const exRaw = new Date(year, month - 1, clampDay(year, month, exDay));
      const moved = moveWeekendToMonday(exRaw);
      let payYear = year;
      let payMonth = month;
      if (payDay < exDay) {
        payMonth += 1;
        if (payMonth > 12) {
          payMonth = 1;
          payYear += 1;
        }
      }
      const payRaw = new Date(payYear, payMonth - 1, clampDay(payYear, payMonth, payDay));
      payRaw.setDate(payRaw.getDate() + moved.offset);
      rows.push({
        exDate: moved.date.toISOString(),
        payDate: payRaw.toISOString(),
        amount
      });
    }
  }
  return rows.sort((a, b) => new Date(a.exDate) - new Date(b.exDate));
}

function deriveManualConfig(holding, override = {}) {
  const rows = normalizeDividendRows(override.projectedDividends || holding.projectedDividends || []);
  const months = Array.isArray(override.months) && override.months.length
    ? [...new Set(override.months.map((v) => Number(v)).filter((v) => v >= 1 && v <= 12))].sort((a, b) => a - b)
    : rows.length
      ? [...new Set(rows.map((row) => new Date(row.exDate).getMonth() + 1))].sort((a, b) => a - b)
      : [3, 6, 9, 12];
  const years = Array.isArray(override.years) && override.years.length
    ? [...new Set(override.years.map((v) => Number(v)).filter(Boolean))].sort((a, b) => a - b)
    : rows.length
      ? [...new Set(rows.map((row) => new Date(row.exDate).getFullYear()))].sort((a, b) => a - b)
      : [2026, 2027];
  const first = rows[0] || {};
  return {
    years,
    months,
    exDay: override.exDay || (first.exDate ? new Date(first.exDate).getDate() : 15),
    payDay: override.payDay || (first.payDate ? new Date(first.payDate).getDate() : 30),
    amountPerShare: override.amountPerShare ?? first.amount ?? (override.amountPerShare ?? holding.amountPerEvent ?? 0),
    sourceName: override.sourceName || "수동 편집"
  };
}

function chartMaxValue(series = []) {
  const max = Math.max(1000, ...series.map((item) => Number(item.netDividend || 0)));
  return Math.ceil(max / 1000) * 1000;
}

function stockDisplaySymbol(symbol) {
  return symbol?.replace(".KS", "").replace(".KQ", "") || "";
}

function inferPurchaseValues(stockCurrency, usdInput, krwInput, currentFx) {
  const usd = toNumber(usdInput);
  const krw = toNumber(krwInput);

  if (stockCurrency === "KRW") {
    return {
      usdPerShare: usd > 0 ? usd : krw > 0 ? krw / currentFx : 0,
      krwPerShare: krw > 0 ? krw : usd > 0 ? usd * currentFx : 0,
      fxAtPurchase: usd > 0 && krw > 0 ? krw / usd : currentFx,
      exactFx: usd > 0 && krw > 0
    };
  }

  if (usd > 0 && krw > 0) {
    return {
      usdPerShare: usd,
      krwPerShare: krw,
      fxAtPurchase: krw / usd,
      exactFx: true
    };
  }

  if (usd > 0) {
    return {
      usdPerShare: usd,
      krwPerShare: usd * currentFx,
      fxAtPurchase: currentFx,
      exactFx: false
    };
  }

  if (krw > 0) {
    return {
      usdPerShare: krw / currentFx,
      krwPerShare: krw,
      fxAtPurchase: currentFx,
      exactFx: false
    };
  }

  return {
    usdPerShare: 0,
    krwPerShare: 0,
    fxAtPurchase: currentFx,
    exactFx: false
  };
}

function normalizeDividendRows(rows = []) {
  return rows
    .map((row) => ({
      exDate: row.exDate || null,
      payDate: row.payDate || null,
      amount: toNumber(row.amount)
    }))
    .filter((row) => row.exDate && row.amount >= 0)
    .sort((a, b) => new Date(a.exDate) - new Date(b.exDate));
}

function groupLotsBySymbol(lots, quotes, currentFx, taxRate, overrides) {
  const map = new Map();

  lots.forEach((lot) => {
    const quote = quotes[lot.symbol] || null;
    const stockCurrency = lot.stockCurrency;
    const override = overrides[lot.symbol] || null;
    const currentPrice = quote?.currentPrice || lot.lastKnownCurrentPrice || 0;
    const annualDividendPerShare = override?.annualDividendPerShare > 0
      ? override.annualDividendPerShare
      : quote?.annualDividendPerShare ?? lot.lastKnownAnnualDividendPerShare ?? 0;
    const projectedDividends = normalizeDividendRows(
      override?.projectedDividends?.length ? override.projectedDividends : quote?.projectedDividends || lot.projectedDividends || []
    );
    const nextExDate = override?.nextExDate || quote?.nextExDate || lot.nextExDate || projectedDividends[0]?.exDate || null;
    const nextPayDate = override?.nextPayDate || quote?.nextPayDate || lot.nextPayDate || projectedDividends[0]?.payDate || null;
    const dividendSource = override ? "Manual override" : quote?.dividendSource || lot.dividendSource || "Unknown";

    if (!map.has(lot.symbol)) {
      map.set(lot.symbol, {
        symbol: lot.symbol,
        name: lot.name,
        market: lot.market,
        stockCurrency,
        lots: [],
        totalShares: 0,
        costKRW: 0,
        currentPrice,
        annualDividendPerShare,
        projectedDividends,
        nextExDate,
        nextPayDate,
        updatedAt: quote?.updatedAt || lot.updatedAt || null,
        dividendSource,
        override
      });
    }

    const item = map.get(lot.symbol);
    item.lots.push(lot);
    item.totalShares += lot.shares;
    item.costKRW += lot.krwPerShare * lot.shares;
    item.currentPrice = quote?.currentPrice || item.currentPrice;
    item.annualDividendPerShare = annualDividendPerShare;
    item.projectedDividends = projectedDividends;
    item.nextExDate = nextExDate;
    item.nextPayDate = nextPayDate;
    item.updatedAt = quote?.updatedAt || item.updatedAt;
    item.dividendSource = dividendSource;
    item.override = override;
  });

  return Array.from(map.values())
    .map((item) => {
      const avgUsd = item.totalShares > 0
        ? item.lots.reduce((sum, lot) => sum + lot.usdPerShare * lot.shares, 0) / item.totalShares
        : 0;
      const avgKrw = item.totalShares > 0 ? item.costKRW / item.totalShares : 0;
      const currentValueKRW = item.stockCurrency === "USD"
        ? item.currentPrice * currentFx * item.totalShares
        : item.currentPrice * item.totalShares;

      const stockGainKRW = item.stockCurrency === "USD"
        ? item.lots.reduce((sum, lot) => sum + ((item.currentPrice - lot.usdPerShare) * lot.fxAtPurchase * lot.shares), 0)
        : item.lots.reduce((sum, lot) => sum + ((item.currentPrice - lot.krwPerShare) * lot.shares), 0);

      const fxGainKRW = item.stockCurrency === "USD"
        ? item.lots.reduce((sum, lot) => sum + (item.currentPrice * (currentFx - lot.fxAtPurchase) * lot.shares), 0)
        : 0;

      const totalGainKRW = stockGainKRW + fxGainKRW;
      const totalGainPct = item.costKRW > 0 ? (totalGainKRW / item.costKRW) * 100 : 0;
      const annualGrossDividendKRW = item.stockCurrency === "USD"
        ? item.annualDividendPerShare * currentFx * item.totalShares
        : item.annualDividendPerShare * item.totalShares;
      const annualNetDividendKRW = annualGrossDividendKRW * (1 - taxRate / 100);

      return {
        ...item,
        avgUsd,
        avgKrw,
        currentValueKRW,
        stockGainKRW,
        fxGainKRW,
        totalGainKRW,
        totalGainPct,
        annualGrossDividendKRW,
        annualNetDividendKRW,
        monthlyNetDividendKRW: annualNetDividendKRW / 12
      };
    })
    .sort((a, b) => b.currentValueKRW - a.currentValueKRW);
}

function buildPaymentSchedule(holdings, taxRate, currentFx, scheduleEdits = {}, monthsForward = 12) {
  const start = new Date();
  const end = addMonths(start, monthsForward + 1);
  const events = [];

  holdings.forEach((holding) => {
    (holding.projectedDividends || []).forEach((event, index) => {
      const eventKey = `${holding.symbol}-${index}-${event.exDate || "noex"}-${event.payDate || event.exDate || "nopay"}`;
      const edit = scheduleEdits[eventKey] || {};
      const exDate = new Date(edit.exDate || event.exDate);
      const payDate = new Date(edit.payDate || event.payDate || event.exDate);
      if (payDate < new Date(start.getFullYear(), start.getMonth(), 1)) return;
      if (payDate > end) return;

      const eligibleShares = holding.lots.reduce((sum, lot) => {
        const purchaseDate = new Date(lot.purchaseDate);
        return purchaseDate <= exDate ? sum + lot.shares : sum;
      }, 0);

      if (eligibleShares <= 0) return;

      const grossPerShare = toNumber(event.amount);
      const grossKRW = holding.stockCurrency === "USD"
        ? grossPerShare * currentFx * eligibleShares
        : grossPerShare * eligibleShares;
      const netKRW = grossKRW * (1 - taxRate / 100);

      events.push({
        id: eventKey,
        symbol: holding.symbol,
        name: holding.name,
        market: holding.market,
        payDate: payDate.toISOString(),
        exDate: exDate.toISOString(),
        eligibleShares,
        grossPerShare,
        netKRW,
        grossKRW,
        dividendSource: holding.dividendSource
      });
    });
  });

  return events.sort((a, b) => new Date(a.payDate) - new Date(b.payDate));
}

function buildMonthlySeries(schedule, lots, monthsForward = 12) {
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const bucket = new Map();
  let cursor = new Date(startMonth);
  for (let i = 0; i < monthsForward; i += 1) {
    bucket.set(getMonthKey(cursor), 0);
    cursor = addMonths(cursor, 1);
  }

  schedule.forEach((event) => {
    const key = getMonthKey(event.payDate);
    if (bucket.has(key)) bucket.set(key, bucket.get(key) + event.netKRW);
  });

  return Array.from(bucket.entries()).map(([key, value]) => ({
    monthKey: key,
    monthLabel: monthLabelFromKey(key),
    netDividend: Number(value.toFixed(0))
  }));
}

function groupScheduleByMonth(schedule) {
  const map = new Map();
  schedule.forEach((event) => {
    const key = getMonthKey(event.payDate);
    if (!map.has(key)) {
      map.set(key, { monthKey: key, monthLabel: monthLabelFromKey(key), totalNet: 0, items: [] });
    }
    const group = map.get(key);
    group.totalNet += event.netKRW;
    group.items.push(event);
  });
  return Array.from(map.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}



const DONUT_COLORS = ["#19e38f", "#6ea8fe", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6", "#f472b6", "#84cc16"];

function buildAllocationData(holdings = []) {
  const total = holdings.reduce((sum, item) => sum + Number(item.currentValueKRW || 0), 0);
  return holdings
    .filter((item) => Number(item.currentValueKRW || 0) > 0)
    .map((item, index) => ({
      name: item.name,
      symbol: stockDisplaySymbol(item.symbol),
      value: Number(item.currentValueKRW || 0),
      weight: total > 0 ? (Number(item.currentValueKRW || 0) / total) * 100 : 0,
      color: DONUT_COLORS[index % DONUT_COLORS.length]
    }));
}

function AllocationDonut({ data = [], title, desc }) {
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);
  return (
    <section className="card" style={{ marginBottom: 18 }}>
      <div className="panel-header">
        <div>
          <div className="panel-title">{title}</div>
          <div className="panel-desc">{desc}</div>
        </div>
      </div>
      <div className="panel-body">
        {!data.length ? (
          <div className="notice">표시할 비중 데이터가 없습니다.</div>
        ) : (
          <div className="dual-grid" style={{ alignItems: "center", gap: 24 }}>
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={78}
                    outerRadius={112}
                    paddingAngle={3}
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={1}
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || DONUT_COLORS[index % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, _name, props) => [formatKRW(value), `${props?.payload?.name || "비중"} (${formatPct(props?.payload?.weight || 0)})`]}
                    contentStyle={{
                      background: "rgba(14,18,27,0.96)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 14,
                      color: "#fff"
                    }}
                  />
                </RePieChart>
              </ResponsiveContainer>
            </div>
            <div>
              <div className="selected-box" style={{ marginBottom: 14 }}>
                <div className="small muted">총 평가금액</div>
                <div style={{ fontWeight: 800, fontSize: 24, marginTop: 6 }}>{formatKRW(total)}</div>
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {data.map((item, index) => (
                  <div key={`${item.name}-${index}`} className="selected-box" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 999, background: item.color || DONUT_COLORS[index % DONUT_COLORS.length], display: "inline-block", flex: "0 0 auto" }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700 }}>{item.name}</div>
                        <div className="small muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>{item.symbol}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flex: "0 0 auto" }}>
                      <div style={{ fontWeight: 700 }}>{formatPct(item.weight)}</div>
                      <div className="small muted">{formatKRW(item.value)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function StatCard({ icon: Icon, label, value, sub, className }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card stat-card">
      <div className="stat-top">
        <div>
          <div className="stat-label">{label}</div>
          <div className={`stat-value ${className || ""}`}>{value}</div>
          <div className="stat-sub">{sub}</div>
        </div>
        <div className="icon-wrap"><Icon size={18} /></div>
      </div>
    </motion.div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="selected-box" style={{ minWidth: 180 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{label}</div>
      <div className="small muted">월별 세후 배당</div>
      <div style={{ fontWeight: 700, marginTop: 4 }}>{formatKRW(payload[0].value)}</div>
    </div>
  );
}

function TabButton({ active, icon: Icon, label, onClick }) {
  return (
    <button className={`tab-btn ${active ? "active" : ""}`} onClick={onClick}>
      <Icon size={15} /> {label}
    </button>
  );
}

export default function Page() {
  const [lots, setLots] = useState([]);
  const [quotes, setQuotes] = useState({});
  const [fxRate, setFxRate] = useState(DEFAULT_FX);
  const [fxAsOf, setFxAsOf] = useState("");
  const [taxRate, setTaxRate] = useState(15);
  const [refreshSec, setRefreshSec] = useState(3600);
  const [lastSyncAt, setLastSyncAt] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [dividendApiKey, setDividendApiKey] = useState(DEFAULT_FMP_API_KEY);
  const [overrides, setOverrides] = useState({});
  const [scheduleEdits, setScheduleEdits] = useState({});
  const [editingSymbol, setEditingSymbol] = useState("");
  const [manualFxRate, setManualFxRate] = useState("");
  const [portfolioSort, setPortfolioSort] = useState("weight");

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [quantity, setQuantity] = useState("");
  const [usdBuyPrice, setUsdBuyPrice] = useState("");
  const [krwBuyPrice, setKrwBuyPrice] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [loadingAdd, setLoadingAdd] = useState(false);
  const [error, setError] = useState("");

  const searchTimer = useRef(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    try {
      const savedLots = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      const savedTax = Number(localStorage.getItem(TAX_KEY) || "15");
      const savedFx = JSON.parse(localStorage.getItem(FX_KEY) || "null");
      const savedInterval = Number(localStorage.getItem(INTERVAL_KEY) || "3600");
      const savedOverrides = JSON.parse(localStorage.getItem(OVERRIDES_KEY) || "{}");
      const savedApiKey = localStorage.getItem(DIVIDEND_API_KEY) || DEFAULT_FMP_API_KEY;
      const savedTab = localStorage.getItem(ACTIVE_TAB_KEY) || "overview";
      const savedScheduleEdits = JSON.parse(localStorage.getItem(SCHEDULE_EDITS_KEY) || "{}");
      const savedManualFxRate = localStorage.getItem(MANUAL_FX_KEY) || "";
      const savedPortfolioSort = localStorage.getItem(PORTFOLIO_SORT_KEY) || "weight";
      setLots(Array.isArray(savedLots) ? savedLots : []);
      if (Number.isFinite(savedTax)) setTaxRate(savedTax);
      if (savedFx?.rate) {
        setFxRate(Number(savedFx.rate));
        setFxAsOf(savedFx.asOf || "");
      }
      if (REFRESH_OPTIONS.includes(savedInterval)) setRefreshSec(savedInterval);
      setOverrides(savedOverrides && typeof savedOverrides === "object" ? savedOverrides : {});
      setDividendApiKey(savedApiKey);
      if (TABS.some((item) => item.key === savedTab)) setActiveTab(savedTab);
      setScheduleEdits(savedScheduleEdits && typeof savedScheduleEdits === "object" ? savedScheduleEdits : {});
      setManualFxRate(savedManualFxRate);
      setPortfolioSort(savedPortfolioSort === "stockGain" ? "stockGain" : "weight");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lots));
  }, [lots]);
  useEffect(() => {
    localStorage.setItem(TAX_KEY, String(taxRate));
  }, [taxRate]);
  useEffect(() => {
    localStorage.setItem(FX_KEY, JSON.stringify({ rate: fxRate, asOf: fxAsOf }));
  }, [fxRate, fxAsOf]);
  useEffect(() => {
    localStorage.setItem(INTERVAL_KEY, String(refreshSec));
  }, [refreshSec]);
  useEffect(() => {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
  }, [overrides]);
  useEffect(() => {
    localStorage.setItem(DIVIDEND_API_KEY, dividendApiKey);
  }, [dividendApiKey]);
  useEffect(() => {
    localStorage.setItem(ACTIVE_TAB_KEY, activeTab);
  }, [activeTab]);
  useEffect(() => {
    localStorage.setItem(SCHEDULE_EDITS_KEY, JSON.stringify(scheduleEdits));
  }, [scheduleEdits]);
  useEffect(() => {
    localStorage.setItem(MANUAL_FX_KEY, String(manualFxRate || ""));
  }, [manualFxRate]);
  useEffect(() => {
    localStorage.setItem(PORTFOLIO_SORT_KEY, portfolioSort);
  }, [portfolioSort]);

  const refreshFx = async () => {
    const params = new URLSearchParams({ pair: "USDKRW" });
    if (dividendApiKey.trim()) params.set("apiKey", dividendApiKey.trim());
    const res = await fetch(`/api/market/fx?${params.toString()}`, { cache: "no-store" });
    const data = await res.json();
    if (data?.rate) {
      setFxRate(Number(data.rate));
      setFxAsOf(`${data.asOf || new Date().toLocaleString("ko-KR")} · ${data.source || "서울외국환중개소 기준환율"}`);
      return Number(data.rate);
    }
    return fxRate;
  };

  const refreshQuote = async (stock) => {
    const params = new URLSearchParams({
      symbol: stock.symbol,
      market: stock.market || ""
    });
    if (dividendApiKey.trim()) params.set("dividendApiKey", dividendApiKey.trim());
    const res = await fetch(`/api/market/quote?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("quote failed");
    const data = await res.json();
    setQuotes((prev) => ({ ...prev, [stock.symbol]: data }));
    return data;
  };

  const syncAll = async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      await refreshFx();
      const symbols = Array.from(new Map(lots.map((lot) => [lot.symbol, { symbol: lot.symbol, market: lot.market }])).values());
      for (const item of symbols) {
        await refreshQuote(item);
      }
      setLastSyncAt(new Date().toLocaleString("ko-KR"));
    } finally {
      setSyncing(false);
      syncingRef.current = false;
    }
  };

  useEffect(() => {
    syncAll();
  }, []);

  useEffect(() => {
    if (!lots.length) return;
    const id = setInterval(() => {
      if (!document.hidden) syncAll();
    }, refreshSec * 1000);
    return () => clearInterval(id);
  }, [lots, refreshSec, dividendApiKey]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/market/search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
        const data = await res.json();
        setSearchResults(data.items || []);
      } catch {
        setSearchResults([]);
      }
    }, 250);

    return () => clearTimeout(searchTimer.current);
  }, [query]);

  const appliedFxRate = toNumber(manualFxRate) > 0 ? toNumber(manualFxRate) : fxRate;
  const holdings = useMemo(() => groupLotsBySymbol(lots, quotes, appliedFxRate, taxRate, overrides), [lots, quotes, appliedFxRate, taxRate, overrides]);
  const schedule = useMemo(() => buildPaymentSchedule(holdings, taxRate, appliedFxRate, scheduleEdits, 12), [holdings, taxRate, appliedFxRate, scheduleEdits]);
  const monthlySeries = useMemo(() => buildMonthlySeries(schedule, lots, 12), [schedule, lots]);
  const monthlyGroups = useMemo(() => groupScheduleByMonth(schedule), [schedule]);
  const allocationData = useMemo(() => buildAllocationData(holdings), [holdings]);

  const sortedHoldings = useMemo(() => {
    return [...holdings].sort((a, b) => {
      if (portfolioSort === "stockGain") return b.stockGainKRW - a.stockGainKRW;
      return b.currentValueKRW - a.currentValueKRW;
    });
  }, [holdings, portfolioSort]);

  const totals = useMemo(() => {
    const totalValueKRW = holdings.reduce((sum, item) => sum + item.currentValueKRW, 0);
    const totalCostKRW = holdings.reduce((sum, item) => sum + item.costKRW, 0);
    const totalGainKRW = holdings.reduce((sum, item) => sum + item.totalGainKRW, 0);
    const totalStockGainKRW = holdings.reduce((sum, item) => sum + item.stockGainKRW, 0);
    const totalFxGainKRW = holdings.reduce((sum, item) => sum + item.fxGainKRW, 0);
    const totalGainPct = totalCostKRW > 0 ? (totalGainKRW / totalCostKRW) * 100 : 0;
    const annualNetDividendKRW = holdings.reduce((sum, item) => sum + item.annualNetDividendKRW, 0);
    const monthlyNetDividendKRW = annualNetDividendKRW / 12;
    const annualYieldAfterTax = totalValueKRW > 0 ? (annualNetDividendKRW / totalValueKRW) * 100 : 0;
    return { totalValueKRW, totalCostKRW, totalGainKRW, totalStockGainKRW, totalFxGainKRW, totalGainPct, annualNetDividendKRW, monthlyNetDividendKRW, annualYieldAfterTax };
  }, [holdings]);

  const addLot = async () => {
    if (!selected) {
      setError("종목을 먼저 선택해 주세요.");
      return;
    }

    const shares = toNumber(quantity);
    if (shares <= 0) {
      setError("수량은 0보다 커야 합니다.");
      return;
    }

    const values = inferPurchaseValues(selected.currency, usdBuyPrice, krwBuyPrice, appliedFxRate);
    if (selected.currency === "USD" && values.usdPerShare <= 0) {
      setError("미국 주식은 달러 매수가를 입력해 주세요. 원화 매수가까지 함께 입력하시면 당시 환율을 더 정확하게 계산할 수 있습니다.");
      return;
    }
    if (selected.currency === "KRW" && values.krwPerShare <= 0) {
      setError("국내 주식은 원화 매수가를 입력해 주세요.");
      return;
    }

    setLoadingAdd(true);
    setError("");
    try {
      const detail = await refreshQuote(selected);
      const lot = {
        id: `${selected.symbol}-${Date.now()}`,
        symbol: selected.symbol,
        name: detail.companyName || selected.name,
        market: selected.market,
        stockCurrency: selected.currency,
        shares,
        purchaseDate,
        usdPerShare: values.usdPerShare,
        krwPerShare: values.krwPerShare,
        fxAtPurchase: values.fxAtPurchase,
        exactFx: values.exactFx,
        lastKnownCurrentPrice: detail.currentPrice,
        lastKnownAnnualDividendPerShare: detail.annualDividendPerShare,
        projectedDividends: detail.projectedDividends || [],
        nextExDate: detail.nextExDate || null,
        nextPayDate: detail.nextPayDate || null,
        dividendSource: detail.dividendSource || "Unknown",
        updatedAt: detail.updatedAt || new Date().toLocaleString("ko-KR")
      };
      setLots((prev) => [lot, ...prev]);
      setQuantity("");
      setUsdBuyPrice("");
      setKrwBuyPrice("");
      setQuery("");
      setSelected(null);
      setSearchResults([]);
      setActiveTab("overview");
      setLastSyncAt(new Date().toLocaleString("ko-KR"));
    } catch {
      setError("종목 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoadingAdd(false);
    }
  };

  const removeLot = (id) => setLots((prev) => prev.filter((lot) => lot.id !== id));
  const removeSymbol = (symbol) => setLots((prev) => prev.filter((lot) => lot.symbol !== symbol));

  const updateOverrideField = (symbol, field, value) => {
    setOverrides((prev) => ({
      ...prev,
      [symbol]: {
        ...(prev[symbol] || {}),
        [field]: value
      }
    }));
  };

  const toggleOverrideYear = (symbol, year) => {
    setOverrides((prev) => {
      const current = prev[symbol] || {};
      const holding = holdings.find((item) => item.symbol === symbol) || {};
      const config = deriveManualConfig(holding, current);
      const exists = config.years.includes(year);
      return {
        ...prev,
        [symbol]: {
          ...current,
          years: exists ? config.years.filter((item) => item !== year) : [...config.years, year].sort((a, b) => a - b)
        }
      };
    });
  };

  const addOverrideYear = (symbol) => {
    setOverrides((prev) => {
      const current = prev[symbol] || {};
      const holding = holdings.find((item) => item.symbol === symbol) || {};
      const config = deriveManualConfig(holding, current);
      const nextYear = (config.years[config.years.length - 1] || 2027) + 1;
      return {
        ...prev,
        [symbol]: {
          ...current,
          years: [...config.years, nextYear]
        }
      };
    });
  };

  const toggleOverrideMonth = (symbol, month) => {
    setOverrides((prev) => {
      const current = prev[symbol] || {};
      const holding = holdings.find((item) => item.symbol === symbol) || {};
      const config = deriveManualConfig(holding, current);
      const exists = config.months.includes(month);
      return {
        ...prev,
        [symbol]: {
          ...current,
          months: exists ? config.months.filter((item) => item !== month) : [...config.months, month].sort((a, b) => a - b)
        }
      };
    });
  };

  const updateScheduleEdit = (eventId, field, value) => {
    setScheduleEdits((prev) => ({
      ...prev,
      [eventId]: {
        ...(prev[eventId] || {}),
        [field]: value
      }
    }));
  };

  const applyManualDividendPlan = (symbol) => {
    const holding = holdings.find((item) => item.symbol === symbol);
    if (!holding) return;
    setOverrides((prev) => {
      const current = prev[symbol] || {};
      const config = deriveManualConfig(holding, current);
      const rows = buildManualDividendRows(config);
      const nextFuture = rows.find((row) => new Date(row.exDate) >= new Date()) || rows[0] || null;
      return {
        ...prev,
        [symbol]: {
          ...current,
          projectedDividends: rows,
          annualDividendPerShare: toNumber(config.amountPerShare) * (config.months?.length || 0),
          nextExDate: nextFuture?.exDate || null,
          nextPayDate: nextFuture?.payDate || null,
          sourceName: current.sourceName || "수동 편집"
        }
      };
    });
  };

  const upcomingPayments = useMemo(() => schedule.slice(0, 24), [schedule]);

  return (
    <div className="page-shell">
      <section className="hero">
        <div>
          <div className="hero-badge"><Wallet size={14} /> Dividend Portfolio</div>
          <h1>배당 포트폴리오</h1>
          <p>
            분할매수, 당시 환율, 현재 환율, 환차손익, 예상 세후 배당, 배당 일정까지 정리한 개인용 대시보드입니다.
            배당 일정이 실제와 다르면 종목별로 직접 편집해서 바로 보정하실 수 있도록 구성했습니다.
          </p>
        </div>
        <div className="hero-side">
          <div className="floating-chip">
            <div className="stat-label">USD/KRW</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{appliedFxRate.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}</div>
            <div className="stat-sub">기준 시각 {fxAsOf || "—"}</div>
          </div>
          <div className="floating-chip">
            <div className="stat-label">자동 갱신</div>
            <div className="button-row" style={{ marginTop: 10 }}>
              {REFRESH_OPTIONS.map((seconds) => (
                <button key={seconds} className={`chip-btn ${refreshSec === seconds ? "active" : ""}`} onClick={() => setRefreshSec(seconds)}>{intervalLabel(seconds)}</button>
              ))}
            </div>
            <div className="stat-sub" style={{ marginTop: 10 }}>마지막 동기화 {lastSyncAt || "—"}</div>
          </div>
        </div>
      </section>

      <section className="tab-strip card">
        <div className="panel-body" style={{ paddingTop: 18, paddingBottom: 18 }}>
          <div className="button-row wrap-gap">
            {TABS.map((tab) => (
              <TabButton key={tab.key} active={activeTab === tab.key} icon={tab.icon} label={tab.label} onClick={() => setActiveTab(tab.key)} />
            ))}
          </div>
        </div>
      </section>

      {activeTab === "overview" && (
        <>
          <section className="grid-cards grid-6">
            <StatCard icon={Wallet} label="총 평가금액" value={formatKRW(totals.totalValueKRW)} sub="현재 환율을 반영한 총 자산 가치" />
            <StatCard icon={TrendingUp} label="총 평가손익" value={`${totals.totalGainKRW >= 0 ? "+" : ""}${formatKRW(totals.totalGainKRW)}`} sub={`${totals.totalGainPct >= 0 ? "+" : ""}${formatPct(totals.totalGainPct)}`} className={totals.totalGainKRW >= 0 ? "positive" : "negative"} />
            <StatCard icon={DollarSign} label="주가손익" value={`${totals.totalStockGainKRW >= 0 ? "+" : ""}${formatKRW(totals.totalStockGainKRW)}`} sub="당시 환율 기준 순수 가격 손익" className={totals.totalStockGainKRW >= 0 ? "accent-blue" : "negative"} />
            <StatCard icon={Coins} label="환차손익" value={`${totals.totalFxGainKRW >= 0 ? "+" : ""}${formatKRW(totals.totalFxGainKRW)}`} sub="매수 당시 환율과 현재 환율 차이 반영" className={totals.totalFxGainKRW >= 0 ? "accent-gold" : "negative"} />
            <StatCard icon={Landmark} label="예상 세후 월 배당" value={formatKRW(totals.monthlyNetDividendKRW)} sub={`세율 ${taxRate}% 기준 예상 월평균`} className="positive" />
            <StatCard icon={LineChart} label="세후 연 배당 수익률" value={formatPct(totals.annualYieldAfterTax)} sub={`세후 연 배당 ${formatKRW(totals.annualNetDividendKRW)}`} className="accent-purple" />
          </section>

          <section className="content-grid overview-grid">
            <AllocationDonut data={allocationData} title="자산 비중" desc="보유 중인 주식의 현재 평가금액 기준으로 원형 다이어그램에서 비중을 확인하실 수 있습니다." />
            <div className="card">
              <div className="panel-header">
                <div className="panel-title">매수 기록 추가</div>
                <div className="panel-desc">미국 주식은 달러 매수가와 원화 매수가를 모두 입력하시면 당시 환율을 더 정확하게 계산할 수 있습니다. 수량은 소수점까지 입력하실 수 있습니다.</div>
              </div>
              <div className="panel-body">
                <div className="form-grid">
                  <div>
                    <label className="label">종목 검색</label>
                    <div style={{ position: "relative" }}>
                      <Search size={16} style={{ position: "absolute", left: 14, top: 14, color: "#7d8caf" }} />
                      <input style={{ paddingLeft: 40 }} value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null); }} placeholder="예: JEPQ, AAPL, 삼성전자, 005930" />
                    </div>
                    {!!searchResults.length && (
                      <div className="search-dropdown">
                        {searchResults.map((item) => (
                          <button key={item.symbol} className="search-option" onClick={() => { setSelected(item); setQuery(`${item.name} (${stockDisplaySymbol(item.symbol)})`); setSearchResults([]); }}>
                            <div>
                              <div style={{ fontWeight: 700 }}>{item.name}</div>
                              <div className="small muted">{stockDisplaySymbol(item.symbol)} · {item.market === "KR" ? "국내" : "미국"} · {item.currency}</div>
                            </div>
                            <div className="small muted">{formatMoney(item.currentPrice, item.currency)}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {selected && (
                    <div className="selected-box">
                      <div className="button-row" style={{ justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 18 }}>{selected.name}</div>
                          <div className="small muted" style={{ marginTop: 4 }}>{stockDisplaySymbol(selected.symbol)} · {selected.market === "KR" ? "국내주식" : "미국주식"}</div>
                        </div>
                        <div className={`badge ${selected.market === "KR" ? "market-kr" : "market-us"}`}>{selected.currency}</div>
                      </div>
                    </div>
                  )}

                  <div className="form-2">
                    <div>
                      <label className="label">수량</label>
                      <input type="text" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="예: 1.3" />
                    </div>
                    <div>
                      <label className="label">매수일</label>
                      <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
                    </div>
                  </div>

                  <div className="form-2">
                    <div>
                      <label className="label">달러 매수가 (1주당)</label>
                      <input type="number" step="0.0001" value={usdBuyPrice} onChange={(e) => setUsdBuyPrice(e.target.value)} placeholder="예: 52.35" />
                    </div>
                    <div>
                      <label className="label">원화 매수가 (1주당)</label>
                      <input type="number" step="0.01" value={krwBuyPrice} onChange={(e) => setKrwBuyPrice(e.target.value)} placeholder="예: 70200" />
                    </div>
                  </div>

                  <div className="info-box">
                    <div style={{ fontWeight: 700, marginBottom: 10 }}>환율 계산 미리보기</div>
                    <div className="info-grid">
                      <div>현재 환율</div><div className="mono">{appliedFxRate.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}</div>
                      <div>입력값으로 계산한 당시 환율</div><div className="mono">{toNumber(usdBuyPrice) > 0 && toNumber(krwBuyPrice) > 0 ? (toNumber(krwBuyPrice) / toNumber(usdBuyPrice)).toLocaleString("ko-KR", { maximumFractionDigits: 2 }) : "두 값을 모두 입력하시면 계산됩니다."}</div>
                      <div>예상 환차손익 반영 여부</div><div className="mono">{toNumber(usdBuyPrice) > 0 && toNumber(krwBuyPrice) > 0 ? "정확 반영" : "추정 반영"}</div>
                    </div>
                  </div>

                  <div>
                    <label className="label">FMP 무료 API Key</label>
                    <input value={dividendApiKey} onChange={(e) => setDividendApiKey(e.target.value)} placeholder="배당 데이터를 불러오는 데 사용됩니다." />
                  </div>

                  <div className="form-2">
                    <div>
                      <label className="label">현재 환율 수동 입력</label>
                      <input type="number" step="0.01" value={manualFxRate} onChange={(e) => setManualFxRate(e.target.value)} placeholder="비워두시면 서울외국환중개소 기준환율을 사용합니다." />
                    </div>
                    <div>
                      <label className="label">현재 환율 사용 기준</label>
                      <div className="selected-box" style={{ minHeight: 46, display: "flex", alignItems: "center" }}>
                        {toNumber(manualFxRate) > 0 ? `수동 입력 환율 ${Number(manualFxRate).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}` : (fxAsOf || "서울외국환중개소 기준환율")}
                      </div>
                    </div>
                  </div>

                  {error && <div className="notice" style={{ color: "#ff9aae" }}>{error}</div>}

                  <div className="button-row wrap-gap">
                    <button className="primary-btn" onClick={addLot} disabled={loadingAdd}><Plus size={16} style={{ marginRight: 8, verticalAlign: "middle" }} />{loadingAdd ? "추가 중..." : "매수 기록 추가"}</button>
                    <button className="secondary-btn" onClick={syncAll} disabled={syncing}><RefreshCw size={16} style={{ marginRight: 8, verticalAlign: "middle" }} />{syncing ? "동기화 중..." : "지금 새로고침"}</button>
                  </div>

                  <div>
                    <label className="label">세율 설정</label>
                    <div className="inline-chips">
                      {[0, 15, 15.4, 22].map((rate) => (
                        <button key={rate} className={`chip-btn ${taxRate === rate ? "active" : ""}`} onClick={() => setTaxRate(rate)}>{rate}%</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="layout-stack gap-18">
              <div className="card big-chart-card">
                <div className="panel-header">
                  <div className="panel-title">예상 입금 일정 미리보기</div>
                  <div className="panel-desc">가까운 지급 일정과 월별 세후 예상 배당은 배당 관리 탭에서 자세히 확인하실 수 있습니다.</div>
                </div>
                <div className="panel-body">
                  {upcomingPayments.length ? (
                    <div className="calendar-list compact-list">
                      {upcomingPayments.slice(0, 6).map((event) => (
                        <div className="calendar-row" key={event.id}>
                          <div>
                            <div className="calendar-date">{formatDate(event.payDate)}</div>
                            <div className="small muted" style={{ marginTop: 4 }}>배당락일 {formatDate(event.exDate)}</div>
                          </div>
                          <div>
                            <div style={{ fontWeight: 700 }}>{event.name}</div>
                            <div className="small muted" style={{ marginTop: 4 }}>{stockDisplaySymbol(event.symbol)} · {formatShares(event.eligibleShares)}주 반영</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontWeight: 700 }}>{formatKRW(event.netKRW)}</div>
                            <div className="small muted" style={{ marginTop: 4 }}>{event.dividendSource}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="notice">배당 일정이 있는 종목을 추가하시면 가까운 지급 일정을 여기에서 먼저 확인하실 수 있습니다.</div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {activeTab === "portfolio" && (
        <section className="page-stack">
          <AllocationDonut data={allocationData} title="포트폴리오 비중 다이어그램" desc="포트폴리오 탭에서도 현재 가격 기준 종목 비중을 한눈에 확인하실 수 있습니다." />
          <section className="card">
            <div className="panel-header">
              <div>
                <div className="panel-title">종목별 평균 보유 현황</div>
                <div className="panel-desc">평균단가, 주가손익, 환차손익, 전체 평가손익을 분리해서 보실 수 있습니다.</div>
              </div>
              <div className="button-row wrap-gap">
                <button className={`chip-btn ${portfolioSort === "weight" ? "active" : ""}`} onClick={() => setPortfolioSort("weight")}>자산 비중 순</button>
                <button className={`chip-btn ${portfolioSort === "stockGain" ? "active" : ""}`} onClick={() => setPortfolioSort("stockGain")}>주가손익 순</button>
              </div>
            </div>
            <div className="panel-body">
              {holdings.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>종목</th>
                        <th className="right">보유수량</th>
                        <th className="right">평균단가</th>
                        <th className="right">현재가</th>
                        <th className="right">주가손익</th>
                        <th className="right">환차손익</th>
                        <th className="right">평가손익</th>
                        <th className="right">세후 월 배당</th>
                        <th className="right">관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedHoldings.map((item) => (
                        <tr key={item.symbol}>
                          <td>
                            <div style={{ fontWeight: 700 }}>{item.name}</div>
                            <div className="small muted" style={{ marginTop: 4 }}>{stockDisplaySymbol(item.symbol)} · {item.market === "KR" ? "국내" : "미국"}</div>
                          </td>
                          <td className="right mono">{formatShares(item.totalShares)}</td>
                          <td className="right mono">
                            <div>{item.stockCurrency === "USD" ? formatMoney(item.avgUsd, "USD", 4) : formatMoney(item.avgKrw, "KRW")}</div>
                            <div className="small muted">≈ {formatKRW(item.avgKrw)}</div>
                          </td>
                          <td className="right mono">
                            <div>{formatMoney(item.currentPrice, item.stockCurrency, item.stockCurrency === "USD" ? 4 : 0)}</div>
                            <div className="small muted">≈ {formatKRW(item.stockCurrency === "USD" ? item.currentPrice * appliedFxRate : item.currentPrice)}</div>
                          </td>
                          <td className={`right mono ${item.stockGainKRW >= 0 ? "positive" : "negative"}`}>{item.stockGainKRW >= 0 ? "+" : ""}{formatKRW(item.stockGainKRW)}</td>
                          <td className={`right mono ${item.fxGainKRW >= 0 ? "accent-gold" : "negative"}`}>{item.fxGainKRW >= 0 ? "+" : ""}{formatKRW(item.fxGainKRW)}</td>
                          <td className={`right mono ${item.totalGainKRW >= 0 ? "positive" : "negative"}`}>{item.totalGainKRW >= 0 ? "+" : ""}{formatKRW(item.totalGainKRW)}</td>
                          <td className="right mono positive">{formatKRW(item.monthlyNetDividendKRW)}</td>
                          <td className="right">
                            <div className="button-row" style={{ justifyContent: "flex-end" }}>
                              <button className="secondary-btn" onClick={() => refreshQuote(item)}><RefreshCw size={14} /></button>
                              <button className="secondary-btn" onClick={() => removeSymbol(item.symbol)}>삭제</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="notice">종목을 추가하시면 여기에서 환차손익 포함 손익과 예상 세후 월 배당을 확인하실 수 있습니다.</div>
              )}
            </div>
          </section>
        </section>
      )}

      {activeTab === "dividends" && (
        <section className="page-stack">
          <section className="card" style={{ marginBottom: 18 }}><div className="panel-header"><div className="panel-title">월별 세후 배당 그래프</div><div className="panel-desc">Y축은 원화 기준으로 고정했고, 1,000원 단위 눈금으로 표시했습니다. 현재 월이 X축의 두 번째 칸에 오도록 기준월이 자동으로 이동합니다.</div></div><div className="panel-body" style={{ height: 360 }}>{monthlySeries.length ? (<ResponsiveContainer width="100%" height="100%"><AreaChart data={monthlySeries} margin={{ top: 8, right: 18, left: 8, bottom: 8 }}><defs><linearGradient id="dividendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#19e38f" stopOpacity={0.55} /><stop offset="100%" stopColor="#19e38f" stopOpacity={0.05} /></linearGradient></defs><CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} /><XAxis dataKey="monthLabel" tick={{ fill: "#90a0c7", fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis domain={[0, chartMaxValue(monthlySeries)]} ticks={Array.from({ length: Math.floor(chartMaxValue(monthlySeries) / 1000) + 1 }, (_, i) => i * 1000)} tickFormatter={(v) => `${Number(v).toLocaleString("ko-KR")}원`} tick={{ fill: "#90a0c7", fontSize: 12 }} axisLine={false} tickLine={false} width={90} /><Tooltip content={<ChartTooltip />} /><Area type="monotone" dataKey="netDividend" stroke="#19e38f" strokeWidth={3} fill="url(#dividendFill)" /></AreaChart></ResponsiveContainer>) : (<div className="notice">매수 기록과 배당 일정이 있으면 월별 세후 배당 그래프가 여기에 표시됩니다.</div>)}</div></section><section className="dual-grid roomy-grid">
            <div className="card">
              <div className="panel-header">
                <div className="panel-title">월별 예상 입금 일정</div>
                <div className="panel-desc">월별 세후 입금 총액과 종목별 세부 일정을 함께 보여드립니다.</div>
              </div>
              <div className="panel-body schedule-scroll-body">
                {monthlyGroups.length ? (
                  <div className="calendar-list grouped-list">
                    {monthlyGroups.map((group) => (
                      <div key={group.monthKey} className="month-group">
                        <div className="month-header">
                          <div>
                            <div className="month-title">{group.monthLabel}</div>
                            <div className="small muted">월 예상 세후 입금 {formatKRW(group.totalNet)}</div>
                          </div>
                        </div>
                        <div className="calendar-list compact-list">
                          {group.items.map((event) => (
                            <div className="calendar-row editable-row" key={event.id}>
                              <div>
                                <div className="calendar-date">{formatDate(event.payDate)}</div>
                                <div className="small muted" style={{ marginTop: 4 }}>배당락 {formatDate(event.exDate)}</div>
                              </div>
                              <div>
                                <div style={{ fontWeight: 700 }}>{event.name}</div>
                                <div className="small muted" style={{ marginTop: 4 }}>{stockDisplaySymbol(event.symbol)} · {formatShares(event.eligibleShares)}주 반영</div>
                              </div>
                              <div className="schedule-edit-grid">
                                <div>
                                  <div className="small muted" style={{ marginBottom: 6 }}>배당락일 수정</div>
                                  <input type="date" value={(scheduleEdits[event.id]?.exDate || event.exDate || "").slice(0, 10)} onChange={(e) => updateScheduleEdit(event.id, "exDate", e.target.value)} />
                                </div>
                                <div>
                                  <div className="small muted" style={{ marginBottom: 6 }}>지급일 수정</div>
                                  <input type="date" value={(scheduleEdits[event.id]?.payDate || event.payDate || "").slice(0, 10)} onChange={(e) => updateScheduleEdit(event.id, "payDate", e.target.value)} />
                                </div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontWeight: 700 }}>{formatKRW(event.netKRW)}</div>
                                <div className="small muted" style={{ marginTop: 4 }}>{event.dividendSource}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="notice">배당 일정이 잡히는 종목을 추가하시면 여기에서 날짜별 예상 입금액을 확인하실 수 있습니다.</div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="panel-header">
                <div className="panel-title">배당 정보 편집</div>
                <div className="panel-desc">연도와 월을 여러 개 선택하신 뒤 배당락일·지급일·주당 배당금을 입력하시면, 일정과 그래프에 바로 반영됩니다. 배당락일이 주말이면 다음 월요일로 자동 조정되고 지급일도 같은 날짜 수만큼 뒤로 이동합니다.</div>
              </div>
              <div className="panel-body">
                {holdings.length ? (
                  <div className="editor-stack">
                    <div className="inline-chips wrap-gap" style={{ marginBottom: 16 }}>
                      {holdings.map((holding) => (
                        <button key={holding.symbol} className={`chip-btn ${editingSymbol === holding.symbol ? "active" : ""}`} onClick={() => setEditingSymbol(holding.symbol)}>{stockDisplaySymbol(holding.symbol)}</button>
                      ))}
                    </div>
                    {(holdings.find((item) => item.symbol === editingSymbol) || holdings[0]) && (() => {
                      const holding = holdings.find((item) => item.symbol === editingSymbol) || holdings[0];
                      const currentOverride = overrides[holding.symbol] || {};
                      const config = deriveManualConfig(holding, currentOverride);
                      return (
                        <div className="editor-panel">
                          <div className="selected-box" style={{ marginBottom: 14 }}>
                            <div className="button-row" style={{ justifyContent: "space-between" }}>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 18 }}>{holding.name}</div>
                                <div className="small muted" style={{ marginTop: 4 }}>{stockDisplaySymbol(holding.symbol)} · 현재 데이터 원본 {holding.dividendSource}</div>
                              </div>
                              <div className="button-row wrap-gap">
                                <button className="secondary-btn" onClick={() => applyManualDividendPlan(holding.symbol)}>선택값 적용</button>
                                <button className="secondary-btn" onClick={() => resetOverride(holding.symbol)}>수동값 초기화</button>
                              </div>
                            </div>
                          </div>

                          <div>
                            <label className="label">연도 선택</label>
                            <div className="inline-chips wrap-gap">
                              {[2026, 2027, ...config.years.filter((year) => year > 2027)].sort((a, b) => a - b).map((year) => (
                                <button key={year} className={`chip-btn ${config.years.includes(year) ? "active" : ""}`} onClick={() => toggleOverrideYear(holding.symbol, year)}>{year}</button>
                              ))}
                              <button className="secondary-btn" onClick={() => addOverrideYear(holding.symbol)}><Plus size={14} /> 연도 추가</button>
                            </div>
                          </div>

                          <div>
                            <label className="label">월 선택</label>
                            <div className="inline-chips wrap-gap">
                              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                                <button key={month} className={`chip-btn ${config.months.includes(month) ? "active" : ""}`} onClick={() => toggleOverrideMonth(holding.symbol, month)}>{month}월</button>
                              ))}
                            </div>
                          </div>

                          <div className="form-2">
                            <div>
                              <label className="label">배당락일 (일)</label>
                              <input type="number" min="1" max="31" value={config.exDay} onChange={(e) => updateOverrideField(holding.symbol, "exDay", e.target.value)} />
                            </div>
                            <div>
                              <label className="label">지급일 (일)</label>
                              <input type="number" min="1" max="31" value={config.payDay} onChange={(e) => updateOverrideField(holding.symbol, "payDay", e.target.value)} />
                            </div>
                          </div>

                          <div className="form-2">
                            <div>
                              <label className="label">주당 배당금</label>
                              <input type="number" step="0.0001" value={config.amountPerShare} onChange={(e) => updateOverrideField(holding.symbol, "amountPerShare", e.target.value)} />
                            </div>
                            <div>
                              <label className="label">수동 소스 이름</label>
                              <input value={currentOverride.sourceName || "수동 편집"} onChange={(e) => updateOverrideField(holding.symbol, "sourceName", e.target.value)} placeholder="예: 증권사 공지 / IR 자료" />
                            </div>
                          </div>

                          <div className="notice">선택값 적용을 누르시면 선택한 연도·월 조합으로 배당 일정이 자동 생성됩니다. 배당락일이 토요일 또는 일요일이면 다음 월요일로 자동 이동하고, 지급일도 동일한 날짜 수만큼 함께 조정됩니다.</div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="notice">먼저 종목을 추가하시면 수동 배당 편집 기능을 사용하실 수 있습니다.</div>
                )}
              </div>
            </div>
          </section>
        </section>
      )}

      {activeTab === "history" && (
        <section className="page-stack">
          <section className="card" style={{ marginBottom: 18 }}>
            <div className="panel-header">
              <div className="panel-title">전체 매수 기록</div>
              <div className="panel-desc">분할매수 기록이 쌓일수록 동일 종목의 평균단가와 환차손익에 자동으로 반영됩니다. 배당 데이터 원본도 함께 확인하실 수 있습니다.</div>
            </div>
            <div className="panel-body">
              {lots.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>매수일</th>
                        <th>종목</th>
                        <th className="right">수량</th>
                        <th className="right">달러 매수가</th>
                        <th className="right">원화 매수가</th>
                        <th className="right">당시 환율</th>
                        <th>배당 데이터 원본</th>
                        <th className="right">관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lots.map((lot) => (
                        <tr key={lot.id}>
                          <td className="mono">{formatDate(lot.purchaseDate)}</td>
                          <td>
                            <div style={{ fontWeight: 700 }}>{lot.name}</div>
                            <div className="small muted">{stockDisplaySymbol(lot.symbol)}</div>
                          </td>
                          <td className="right mono">{formatShares(lot.shares)}</td>
                          <td className="right mono">{formatMoney(lot.usdPerShare, "USD", 4)}</td>
                          <td className="right mono">{formatKRW(lot.krwPerShare)}</td>
                          <td className="right mono">{lot.fxAtPurchase.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}</td>
                          <td>{lot.dividendSource?.includes("FMP") ? "FMP 적용" : "Yahoo Finance 사용"}</td>
                          <td className="right"><button className="secondary-btn" onClick={() => removeLot(lot.id)}>삭제</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="notice">아직 매수 기록이 없습니다. 개요 탭에서 첫 기록을 추가해 주세요.</div>
              )}
            </div>
          </section>
        </section>
      )}

      <div className="footer-note">
        데이터 출처: 종목 검색과 현재가는 Yahoo Finance 공개 엔드포인트를 사용합니다. 환율은 서울외국환중개소 기준환율을 우선 사용하고, 조회가 실패하면 FMP 기준 환율을 보조적으로 사용합니다. 배당 일정·금액은 FMP 무료 API 키가 있으면 우선 적용하고, 실패하거나 값이 없으면 Yahoo Finance 배당 이력 기반 예상치를 사용합니다. 수동 편집값이 있으면 해당 종목에는 수동 편집값이 최우선으로 적용됩니다.
      </div>
    </div>
  );
}
