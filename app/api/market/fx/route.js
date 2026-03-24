const headers = {
  "User-Agent": "Mozilla/5.0"
};

const DEFAULT_FMP_API_KEY = "JD5Urnmm4nwRDPAAxo5eOuBKBqmGg7Ln";

function extractUsdKrwFromSmbs(html = "") {
  const normalized = html.replace(/\s+/g, " ");
  const patterns = [
    /미국\s*달러\s*\(USD\).*?(\d{1,3}(?:,\d{3})*\.\d{2})/i,
    /USD[^\d]{0,30}(\d{1,3}(?:,\d{3})*\.\d{2})/i
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      const rate = Number(String(match[1]).replace(/,/g, ""));
      if (Number.isFinite(rate) && rate > 0) return rate;
    }
  }
  return 0;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const pair = String(searchParams.get("pair") || "USDKRW").toUpperCase();
    const apiKey = String(searchParams.get("apiKey") || DEFAULT_FMP_API_KEY).trim();
    if (pair !== "USDKRW") {
      return Response.json({ error: "unsupported_pair" }, { status: 400 });
    }

    try {
      const smbsRes = await fetch("https://www.smbs.biz/ExRate/TodayExRate.jsp", {
        next: { revalidate: 3600 },
        headers
      });
      if (smbsRes.ok) {
        const html = await smbsRes.text();
        const rate = extractUsdKrwFromSmbs(html);
        if (rate > 0) {
          return Response.json({
            pair: "USDKRW",
            rate,
            asOf: new Date().toLocaleString("ko-KR"),
            source: "서울외국환중개소 기준환율"
          });
        }
      }
    } catch {
      // continue to fallback
    }

    if (apiKey) {
      try {
        const fmpRes = await fetch(`https://financialmodelingprep.com/stable/quote-short?symbol=USDKRW&apikey=${encodeURIComponent(apiKey)}`, {
          next: { revalidate: 3600 },
          headers
        });
        if (fmpRes.ok) {
          const data = await fmpRes.json();
          const row = Array.isArray(data) ? data[0] : null;
          const rate = Number(row?.price || 0);
          if (rate > 0) {
            return Response.json({
              pair: "USDKRW",
              rate,
              asOf: new Date().toLocaleString("ko-KR"),
              source: "FMP 보조 환율"
            });
          }
        }
      } catch {
        // continue to fallback
      }
    }

    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?range=1d&interval=1m",
      { cache: "no-store", headers }
    );

    if (!res.ok) throw new Error("fx api failed");

    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta || {};
    const rate = Number(meta.regularMarketPrice || meta.previousClose || 0);

    return Response.json({
      pair: "USDKRW",
      rate,
      asOf: new Date().toLocaleString("ko-KR"),
      source: "Yahoo Finance 보조 환율"
    });
  } catch (error) {
    return Response.json(
      {
        error: "fx_failed",
        message: error instanceof Error ? error.message : "unknown error"
      },
      { status: 500 }
    );
  }
}
