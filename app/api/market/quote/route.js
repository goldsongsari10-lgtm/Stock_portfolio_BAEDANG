const headers = {
  "User-Agent": "Mozilla/5.0"
};

function normalizeSymbol(symbol = "", market = "") {
  const s = String(symbol || "").trim().toUpperCase();
  const m = String(market || "").trim().toUpperCase();
  if (!s) return "";
  if (s.includes(".")) return s;
  if (m === "KR") return `${s}.KS`;
  return s;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store", headers });
  if (!res.ok) throw new Error(`request failed: ${res.status}`);
  return res.json();
}

function unixToIso(ts) {
  if (!ts) return null;
  return new Date(ts * 1000).toISOString();
}

function monthGapFromDates(dates) {
  if (dates.length < 2) return 3;
  const diffs = [];
  for (let i = 1; i < dates.length; i += 1) {
    const prev = new Date(dates[i - 1]);
    const cur = new Date(dates[i]);
    diffs.push((cur - prev) / (1000 * 60 * 60 * 24));
  }
  const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  if (avg <= 45) return 1;
  if (avg <= 120) return 3;
  if (avg <= 220) return 6;
  return 12;
}

function sumLast12Months(dividends = []) {
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);
  return dividends
    .filter((item) => {
      const d = new Date(item.exDate);
      return d >= oneYearAgo && d <= now;
    })
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function projectDividendEvents({ historical = [], nextExDate, nextPayDate, annualDividendPerShare = 0 }) {
  const sorted = [...historical].sort((a, b) => new Date(a.exDate) - new Date(b.exDate));
  const exDates = sorted.map((item) => item.exDate).filter(Boolean);
  const amounts = sorted.map((item) => Number(item.amount || 0)).filter((v) => Number.isFinite(v) && v > 0);
  const frequencyMonths = monthGapFromDates(exDates);
  const gapDays = frequencyMonths === 1 ? 30 : frequencyMonths === 3 ? 91 : frequencyMonths === 6 ? 182 : 365;
  const lagDays = nextExDate && nextPayDate
    ? Math.max(0, Math.round((new Date(nextPayDate) - new Date(nextExDate)) / (1000 * 60 * 60 * 24)))
    : 30;

  const fallbackAmount = amounts.length
    ? amounts.slice(-Math.min(amounts.length, 4)).reduce((a, b) => a + b, 0) / Math.min(amounts.length, 4)
    : annualDividendPerShare > 0
      ? annualDividendPerShare / Math.max(1, 12 / frequencyMonths)
      : 0;

  let startDate = nextExDate
    ? new Date(nextExDate)
    : exDates.length
      ? new Date(new Date(exDates[exDates.length - 1]).getTime() + gapDays * 24 * 60 * 60 * 1000)
      : new Date();

  while (startDate < new Date()) {
    startDate = new Date(startDate.getTime() + gapDays * 24 * 60 * 60 * 1000);
  }

  const events = [];
  for (let i = 0; i < 12; i += 1) {
    const exDate = new Date(startDate.getTime() + i * gapDays * 24 * 60 * 60 * 1000);
    const payDate = i === 0 && nextPayDate
      ? new Date(nextPayDate)
      : new Date(exDate.getTime() + lagDays * 24 * 60 * 60 * 1000);
    events.push({
      exDate: exDate.toISOString(),
      payDate: payDate.toISOString(),
      amount: Number(fallbackAmount || 0)
    });
  }

  return {
    projected: events,
    frequencyMonths,
    lagDays,
    amountPerEvent: Number(fallbackAmount || 0)
  };
}

async function fetchYahooChart(symbol) {
  const chartData = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d&events=div`);
  const chart = chartData?.chart?.result?.[0] || {};
  const meta = chart.meta || {};
  const dividendsObj = chart.events?.dividends || {};
  const historicalDividends = Object.values(dividendsObj)
    .map((item) => ({
      exDate: unixToIso(item.date),
      payDate: null,
      amount: Number(item.amount || 0)
    }))
    .filter((item) => item.exDate)
    .sort((a, b) => new Date(a.exDate) - new Date(b.exDate));

  const annualDividendPerShare = sumLast12Months(historicalDividends);
  const projection = projectDividendEvents({
    historical: historicalDividends,
    annualDividendPerShare
  });

  return {
    symbol: meta.symbol || symbol,
    currentPrice: Number(meta.regularMarketPrice || meta.previousClose || 0),
    currency: meta.currency || (symbol.endsWith(".KS") || symbol.endsWith(".KQ") ? "KRW" : "USD"),
    companyName: meta.symbol || symbol,
    annualDividendPerShare,
    nextExDate: projection.projected?.[0]?.exDate || null,
    nextPayDate: projection.projected?.[0]?.payDate || null,
    frequencyMonths: projection.frequencyMonths,
    lagDays: projection.lagDays,
    amountPerEvent: projection.amountPerEvent,
    historicalDividends,
    projectedDividends: projection.projected,
    dividendSource: "Yahoo Finance chart history",
    updatedAt: new Date().toLocaleString("ko-KR")
  };
}

async function fetchFmpDividends(symbol, market, apiKey) {
  if (!apiKey) return null;
  const bareSymbol = String(symbol || "").replace(/\.(KS|KQ)$/i, "");
  const fmpSymbol = market === "KR" ? bareSymbol : bareSymbol;
  const url = `https://financialmodelingprep.com/stable/dividends?symbol=${encodeURIComponent(fmpSymbol)}&apikey=${encodeURIComponent(apiKey)}`;
  const data = await fetchJson(url);
  if (!Array.isArray(data) || data.length === 0) return null;

  const rows = data
    .map((item) => ({
      exDate: item.exDividendDate || item.date || null,
      payDate: item.paymentDate || item.payDate || null,
      amount: Number(item.dividend || item.adjDividend || item.amount || 0)
    }))
    .filter((item) => item.exDate && Number.isFinite(item.amount))
    .sort((a, b) => new Date(a.exDate) - new Date(b.exDate));

  const annualDividendPerShare = sumLast12Months(rows);
  const upcoming = rows.find((item) => new Date(item.exDate) >= new Date());
  const projection = projectDividendEvents({
    historical: rows,
    nextExDate: upcoming?.exDate || null,
    nextPayDate: upcoming?.payDate || null,
    annualDividendPerShare
  });

  return {
    annualDividendPerShare: annualDividendPerShare || (rows[0]?.amount || 0) * (projection.frequencyMonths ? Math.round(12 / projection.frequencyMonths) : 4),
    nextExDate: upcoming?.exDate || projection.projected?.[0]?.exDate || null,
    nextPayDate: upcoming?.payDate || projection.projected?.[0]?.payDate || null,
    frequencyMonths: projection.frequencyMonths,
    lagDays: projection.lagDays,
    amountPerEvent: projection.amountPerEvent,
    historicalDividends: rows,
    projectedDividends: upcoming ? [upcoming, ...projection.projected.slice(1)] : projection.projected,
    dividendSource: "FMP dividends API"
  };
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const rawSymbol = String(searchParams.get("symbol") || "").trim();
    const market = String(searchParams.get("market") || "").trim().toUpperCase();
    const apiKey = String(searchParams.get("dividendApiKey") || "JD5Urnmm4nwRDPAAxo5eOuBKBqmGg7Ln").trim();

    if (!rawSymbol) {
      return Response.json({ error: "missing_symbol" }, { status: 400 });
    }

    let symbol = normalizeSymbol(rawSymbol, market);
    let baseData;
    try {
      baseData = await fetchYahooChart(symbol);
    } catch (error) {
      if (market === "KR" && !rawSymbol.includes(".")) {
        symbol = `${rawSymbol}.KQ`;
        baseData = await fetchYahooChart(symbol);
      } else {
        throw error;
      }
    }

    let dividendData = null;
    try {
      dividendData = await fetchFmpDividends(symbol, market, apiKey);
    } catch {
      dividendData = null;
    }

    return Response.json({
      ...baseData,
      ...(dividendData || {})
    });
  } catch (error) {
    return Response.json(
      {
        error: "quote_failed",
        message: error instanceof Error ? error.message : "unknown error"
      },
      { status: 500 }
    );
  }
}
