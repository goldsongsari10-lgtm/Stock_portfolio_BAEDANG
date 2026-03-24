const headers = {
  "User-Agent": "Mozilla/5.0"
};

function inferMarket(symbol = "") {
  if (symbol.endsWith(".KS") || symbol.endsWith(".KQ")) return "KR";
  return "US";
}

function inferCurrency(symbol = "", currency) {
  if (currency) return currency;
  if (symbol.endsWith(".KS") || symbol.endsWith(".KQ")) return "KRW";
  return "USD";
}

async function fetchChartQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`;
  const res = await fetch(url, { cache: "no-store", headers });
  if (!res.ok) return null;
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) return null;
  return {
    symbol: meta.symbol || symbol,
    price: Number(meta.regularMarketPrice || meta.previousClose || 0),
    currency: meta.currency || inferCurrency(symbol)
  };
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get("q") || "").trim();

    if (!q) return Response.json({ items: [] });

    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&lang=ko-KR&region=KR&quotesCount=12&newsCount=0`;
    const res = await fetch(url, { cache: "no-store", headers });

    if (!res.ok) return Response.json({ items: [] });
    const data = await res.json();

    let items = (data?.quotes || [])
      .filter((item) => item?.symbol && (item?.shortname || item?.longname))
      .filter((item) => {
        const qt = String(item.quoteType || "").toUpperCase();
        return qt === "EQUITY" || qt === "ETF" || qt === "MUTUALFUND";
      })
      .map((item) => ({
        symbol: item.symbol,
        name: item.shortname || item.longname || item.symbol,
        market: inferMarket(item.symbol),
        currency: inferCurrency(item.symbol, item.currency),
        currentPrice: Number(item.regularMarketPrice || 0),
        annualDividendPerShare: Number(item.trailingAnnualDividendRate || 0)
      }));

    if (/^\d{6}$/.test(q)) {
      const manualSymbols = [`${q}.KS`, `${q}.KQ`];
      const existing = new Set(items.map((item) => item.symbol));
      for (const symbol of manualSymbols) {
        if (existing.has(symbol)) continue;
        const quote = await fetchChartQuote(symbol);
        if (quote?.price) {
          items.unshift({
            symbol: quote.symbol,
            name: quote.symbol,
            market: inferMarket(quote.symbol),
            currency: quote.currency,
            currentPrice: quote.price,
            annualDividendPerShare: 0
          });
        }
      }
    }

    return Response.json({ items: items.slice(0, 12) });
  } catch {
    return Response.json({ items: [] }, { status: 200 });
  }
}
