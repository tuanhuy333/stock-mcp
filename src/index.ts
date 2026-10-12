#!/usr/bin/env node

// MCP uses stdout for JSON-RPC — redirect any console.log from dependencies to stderr
console.log = console.error;

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import YahooFinance from "yahoo-finance2";
import { SMA, EMA, RSI, MACD, BollingerBands } from "technicalindicators";

// v3: class-based instantiation; suppress survey notice
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const server = new Server(
  { name: "@tuanhuy3709/stock-data-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ── Tool definitions ───────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_quote",
      description:
        "Get the current real-time price and market data for a stock. " +
        "Use this when the user asks for the current price, today's performance, market cap, or trading volume. " +
        "Returns: price, change, change%, open/high/low, volume, market cap, 52-week range, exchange, market state. " +
        "If you don't know the ticker symbol, call search_ticker first. " +
        "Vietnam stocks (HOSE/HNX): append .VN suffix — e.g. VNM.VN (Vinamilk), FPT.VN, VIC.VN, HPG.VN.",
      inputSchema: {
        type: "object" as const,
        properties: {
          symbol: {
            type: "string",
            description:
              "Ticker symbol. US: AAPL, TSLA, MSFT. Vietnam: VNM.VN, FPT.VN. Taiwan: 2330.TW. Add the correct exchange suffix for non-US stocks.",
          },
        },
        required: ["symbol"],
      },
    },
    {
      name: "get_historical_data",
      description:
        "Get historical OHLCV (Open/High/Low/Close/Volume) candlestick data for a stock. " +
        "Use this when the user wants to see price history, chart data, compare performance over time, or when you need price series for further analysis. " +
        "period1 accepts either a YYYY-MM-DD date or a relative shorthand: '1mo', '3mo', '6mo', '1y', '2y', '5y'. " +
        "Interval guidance: use 1d for periods ≤6 months, 1wk for ≤3 years, 1mo for longer timeframes.",
      inputSchema: {
        type: "object" as const,
        properties: {
          symbol: {
            type: "string",
            description: "Stock ticker symbol",
          },
          period1: {
            type: "string",
            description:
              "Start date as YYYY-MM-DD (e.g. 2024-01-01) OR relative shorthand: '1mo', '3mo', '6mo', '1y', '2y', '5y'",
          },
          period2: {
            type: "string",
            description: "End date as YYYY-MM-DD (default: today)",
          },
          interval: {
            type: "string",
            enum: ["1d", "1wk", "1mo"],
            description:
              "Candle interval — 1d (daily), 1wk (weekly), 1mo (monthly). Default: 1d",
          },
        },
        required: ["symbol", "period1"],
      },
    },
    {
      name: "get_company_info",
      description:
        "Get fundamental data for valuation and due diligence. " +
        "Use this when the user asks: is this stock cheap or expensive? what does the company do? what are analyst targets? how profitable is it? " +
        "Returns: sector/industry, PE ratio, EPS, price-to-book, revenue & earnings growth, profit margins, ROE, total debt, dividend yield, beta, 52-week range, analyst consensus (buy/sell/hold) and mean price target. " +
        "For current price use get_quote; for chart patterns use get_technical_analysis.",
      inputSchema: {
        type: "object" as const,
        properties: {
          symbol: {
            type: "string",
            description: "Stock ticker symbol",
          },
        },
        required: ["symbol"],
      },
    },
    {
      name: "search_ticker",
      description:
        "Find the correct ticker symbol for a company when you don't know it. " +
        "Call this BEFORE other tools whenever the user mentions a company by name and you're unsure of the exact symbol. " +
        "Works best with well-known international companies (e.g. 'Apple', 'Samsung', 'Toyota'). " +
        "Limitation: Vietnamese companies may not be found by name — use the ticker directly instead (VNM, FPT, VIC, HPG, VHM, MWG, TCB). " +
        "Returns: symbol, company name, asset type (EQUITY/ETF/FUND), exchange.",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description:
              "Company name or keyword to search, e.g. 'Apple', 'Samsung Electronics', 'gold ETF'",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 10)",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "get_technical_analysis",
      description:
        "Calculate technical indicators to identify trends, momentum, and trading signals. " +
        "Use this when the user asks for technical analysis, chart signals, overbought/oversold levels, or trading recommendations. " +
        "Do NOT use for fundamental valuation — use get_company_info instead. " +
        "Available indicators — SMA: trend direction (Golden/Death Cross); EMA: faster trend; RSI: momentum & overbought(>70)/oversold(<30); MACD: trend strength and crossover signals; BB: volatility and price extremes (Bollinger Bands). " +
        "Pass [\"ALL\"] to calculate every indicator at once.",
      inputSchema: {
        type: "object" as const,
        properties: {
          symbol: {
            type: "string",
            description: "Stock ticker symbol",
          },
          indicators: {
            type: "array",
            items: {
              type: "string",
              enum: ["ALL", "SMA", "EMA", "RSI", "MACD", "BB"],
            },
            description:
              "Which indicators to calculate. Use [\"ALL\"] for a complete analysis, or pick specific ones: SMA, EMA, RSI, MACD, BB (Bollinger Bands).",
          },
          period_days: {
            type: "number",
            description:
              "Calendar days of history to use (default: 300). Increase to 500+ for SMA200 on sparse markets.",
          },
        },
        required: ["symbol", "indicators"],
      },
    },
  ],
}));

// ── Tool router ────────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "get_quote":
        return await handleGetQuote(requireString(a, "symbol"));

      case "get_historical_data":
        return await handleGetHistoricalData(
          requireString(a, "symbol"),
          requireString(a, "period1"),
          optionalString(a, "period2"),
          optionalString(a, "interval") as "1d" | "1wk" | "1mo" | undefined
        );

      case "get_company_info":
        return await handleGetCompanyInfo(requireString(a, "symbol"));

      case "search_ticker":
        return await handleSearchTicker(
          requireString(a, "query"),
          typeof a.limit === "number" ? a.limit : 10
        );

      case "get_technical_analysis":
        return await handleGetTechnicalAnalysis(
          requireString(a, "symbol"),
          requireStringArray(a, "indicators"),
          typeof a.period_days === "number" ? a.period_days : 300
        );

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof McpError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    throw new McpError(ErrorCode.InternalError, `Error: ${msg}`);
  }
});

// ── Handlers ───────────────────────────────────────────────────────────────────

async function handleGetQuote(symbol: string) {
  const q = await yahooFinance.quote(symbol.toUpperCase());

  return text({
    symbol: q.symbol,
    name: q.longName ?? q.shortName,
    price: q.regularMarketPrice,
    currency: q.currency,
    change: q.regularMarketChange,
    changePercent: fmt(q.regularMarketChangePercent, 2, "%"),
    open: q.regularMarketOpen,
    high: q.regularMarketDayHigh,
    low: q.regularMarketDayLow,
    previousClose: q.regularMarketPreviousClose,
    volume: q.regularMarketVolume,
    averageVolume: q.averageDailyVolume3Month,
    marketCap: q.marketCap,
    fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: q.fiftyTwoWeekLow,
    fiftyDayAverage: q.fiftyDayAverage,
    twoHundredDayAverage: q.twoHundredDayAverage,
    exchange: q.fullExchangeName,
    marketState: q.marketState,
    timestamp: q.regularMarketTime,
  });
}

async function handleGetHistoricalData(
  symbol: string,
  period1: string,
  period2?: string,
  interval?: "1d" | "1wk" | "1mo"
) {
  const rows = await yahooFinance.historical(symbol.toUpperCase(), {
    period1: resolveDate(period1),
    period2: period2 ?? today(),
    interval: interval ?? "1d",
  });

  const data = rows.map((r) => ({
    date: r.date.toISOString().split("T")[0],
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    adjClose: r.adjClose,
    volume: r.volume,
  }));

  return text({
    symbol: symbol.toUpperCase(),
    interval: interval ?? "1d",
    from: period1,
    to: period2 ?? today(),
    count: data.length,
    data,
  });
}

async function handleGetCompanyInfo(symbol: string) {
  const s = await yahooFinance.quoteSummary(symbol.toUpperCase(), {
    modules: [
      "summaryProfile",
      "summaryDetail",
      "defaultKeyStatistics",
      "financialData",
      "price",
    ],
  });

  return text({
    symbol: symbol.toUpperCase(),
    name: s.price?.longName ?? s.price?.shortName,
    sector: s.summaryProfile?.sector,
    industry: s.summaryProfile?.industry,
    country: s.summaryProfile?.country,
    website: s.summaryProfile?.website,
    employees: s.summaryProfile?.fullTimeEmployees,
    description: s.summaryProfile?.longBusinessSummary,
    // Valuation
    marketCap: s.summaryDetail?.marketCap,
    trailingPE: s.summaryDetail?.trailingPE,
    forwardPE: s.summaryDetail?.forwardPE,
    priceToBook: s.defaultKeyStatistics?.priceToBook,
    enterpriseValue: s.defaultKeyStatistics?.enterpriseValue,
    // Earnings
    trailingEps: s.defaultKeyStatistics?.trailingEps,
    forwardEps: s.defaultKeyStatistics?.forwardEps,
    // Growth & margins
    revenueGrowth: fmt(s.financialData?.revenueGrowth, 2, "%", 100),
    earningsGrowth: fmt(s.financialData?.earningsGrowth, 2, "%", 100),
    grossMargins: fmt(s.financialData?.grossMargins, 2, "%", 100),
    operatingMargins: fmt(s.financialData?.operatingMargins, 2, "%", 100),
    profitMargins: fmt(s.financialData?.profitMargins, 2, "%", 100),
    // Returns
    returnOnAssets: fmt(s.financialData?.returnOnAssets, 2, "%", 100),
    returnOnEquity: fmt(s.financialData?.returnOnEquity, 2, "%", 100),
    // Balance sheet
    totalCash: s.financialData?.totalCash,
    totalDebt: s.financialData?.totalDebt,
    debtToEquity: s.financialData?.debtToEquity,
    // Dividend
    dividendRate: s.summaryDetail?.dividendRate,
    dividendYield: fmt(s.summaryDetail?.dividendYield, 2, "%", 100),
    payoutRatio: fmt(s.summaryDetail?.payoutRatio, 2, "%", 100),
    exDividendDate: s.summaryDetail?.exDividendDate,
    // Price stats
    beta: s.summaryDetail?.beta,
    fiftyTwoWeekHigh: s.summaryDetail?.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: s.summaryDetail?.fiftyTwoWeekLow,
    fiftyDayAverage: s.summaryDetail?.fiftyDayAverage,
    twoHundredDayAverage: s.summaryDetail?.twoHundredDayAverage,
    // Analyst consensus
    targetMeanPrice: s.financialData?.targetMeanPrice,
    targetHighPrice: s.financialData?.targetHighPrice,
    targetLowPrice: s.financialData?.targetLowPrice,
    recommendationMean: s.financialData?.recommendationMean,
    recommendationKey: s.financialData?.recommendationKey,
    numberOfAnalystOpinions: s.financialData?.numberOfAnalystOpinions,
    // Short interest
    shortRatio: s.defaultKeyStatistics?.shortRatio,
    shortPercentOfFloat: fmt(
      s.defaultKeyStatistics?.shortPercentOfFloat,
      2,
      "%",
      100
    ),
  });
}

async function handleSearchTicker(query: string, limit: number) {
  const results = await yahooFinance.search(query, { quotesCount: limit });

  const data = (results.quotes ?? [])
    .filter((q): q is Extract<(typeof results.quotes)[number], { symbol: string }> =>
      "symbol" in q
    )
    .map((q) => {
      const r: Record<string, unknown> = {
        symbol: q.symbol,
        type: "quoteType" in q ? q.quoteType : "unknown",
      };
      if ("longname" in q && q.longname) r.name = q.longname;
      else if ("shortname" in q && q.shortname) r.name = q.shortname;
      if ("exchDisp" in q) r.exchange = q.exchDisp;
      if ("sector" in q) r.sector = q.sector;
      if ("industry" in q) r.industry = q.industry;
      return r;
    });

  return text({ query, count: data.length, results: data });
}

async function handleGetTechnicalAnalysis(
  symbol: string,
  indicators: string[],
  periodDays: number
) {
  const startDate = new Date();
  // Fetch extra buffer so EMA/MACD has enough warm-up data
  startDate.setDate(startDate.getDate() - Math.max(periodDays, 50) * 2);

  const rows = await yahooFinance.historical(symbol.toUpperCase(), {
    period1: startDate.toISOString().split("T")[0],
    period2: today(),
    interval: "1d",
  });

  if (rows.length === 0) {
    throw new McpError(
      ErrorCode.InternalError,
      `No historical data found for ${symbol}`
    );
  }

  const closes = rows
    .map((r) => r.close)
    .filter((v): v is number => v != null);

  const result: Record<string, unknown> = {
    symbol: symbol.toUpperCase(),
    currentPrice: closes.at(-1),
    dataPoints: closes.length,
    calculatedAt: new Date().toISOString(),
  };

  const ALL_INDICATORS = ["SMA", "EMA", "RSI", "MACD", "BB"];
  const expanded = indicators.flatMap((i) =>
    i.toUpperCase() === "ALL" ? ALL_INDICATORS : [i]
  );

  for (const ind of expanded) {
    switch (ind.toUpperCase()) {
      case "SMA": {
        const out: Record<string, number | null> = {};
        for (const p of [20, 50, 200]) {
          if (p > closes.length) { out[`SMA${p}`] = null; continue; }
          const vals = SMA.calculate({ period: p, values: closes });
          out[`SMA${p}`] = vals.at(-1) ?? null;
        }
        const price = closes.at(-1)!;
        result.SMA = {
          ...out,
          signal:
            out.SMA50 && out.SMA200
              ? out.SMA50 > out.SMA200
                ? "Golden Cross (bullish)"
                : "Death Cross (bearish)"
              : null,
          aboveSMA50: out.SMA50 ? price > out.SMA50 : null,
          aboveSMA200: out.SMA200 ? price > out.SMA200 : null,
        };
        break;
      }

      case "EMA": {
        const out: Record<string, number | null> = {};
        for (const p of [12, 26]) {
          if (p > closes.length) { out[`EMA${p}`] = null; continue; }
          const vals = EMA.calculate({ period: p, values: closes });
          out[`EMA${p}`] = vals.at(-1) ?? null;
        }
        result.EMA = out;
        break;
      }

      case "RSI": {
        if (closes.length < 15) { result.RSI = null; break; }
        const vals = RSI.calculate({ period: 14, values: closes });
        const v = vals.at(-1) ?? null;
        result.RSI = {
          period: 14,
          value: v,
          signal:
            v === null
              ? null
              : v > 70
              ? "Overbought — consider selling"
              : v < 30
              ? "Oversold — consider buying"
              : v > 50
              ? "Bullish momentum"
              : "Bearish momentum",
        };
        break;
      }

      case "MACD": {
        if (closes.length < 35) { result.MACD = null; break; }
        const vals = MACD.calculate({
          fastPeriod: 12,
          slowPeriod: 26,
          signalPeriod: 9,
          values: closes,
          SimpleMAOscillator: false,
          SimpleMASignal: false,
        });
        const v = vals.at(-1) ?? null;
        if (!v) { result.MACD = null; break; }
        result.MACD = {
          MACD: v.MACD,
          signal: v.signal,
          histogram: v.histogram,
          trend:
            v.histogram != null
              ? v.histogram > 0
                ? "Bullish (histogram positive)"
                : "Bearish (histogram negative)"
              : null,
          crossover:
            v.MACD != null && v.signal != null
              ? v.MACD > v.signal
                ? "MACD above signal (buy signal)"
                : "MACD below signal (sell signal)"
              : null,
        };
        break;
      }

      case "BB": {
        if (closes.length < 20) { result.BollingerBands = null; break; }
        const vals = BollingerBands.calculate({
          period: 20,
          stdDev: 2,
          values: closes,
        });
        const v = vals.at(-1) ?? null;
        if (!v) { result.BollingerBands = null; break; }
        const price = closes.at(-1)!;
        const bandwidth = ((v.upper - v.lower) / v.middle) * 100;
        const percentB = ((price - v.lower) / (v.upper - v.lower)) * 100;
        result.BollingerBands = {
          period: 20,
          upper: v.upper,
          middle: v.middle,
          lower: v.lower,
          bandwidth: +bandwidth.toFixed(2),
          percentB: +percentB.toFixed(2),
          signal:
            price > v.upper
              ? "Price above upper band — potential overbought"
              : price < v.lower
              ? "Price below lower band — potential oversold"
              : percentB > 80
              ? "Near upper band — watch for reversal"
              : percentB < 20
              ? "Near lower band — watch for bounce"
              : "Price within bands — neutral",
        };
        break;
      }
    }
  }

  return text(result);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Resolves relative shorthands like "1y", "3mo" to ISO date strings. */
function resolveDate(period: string): string {
  const m = period.match(/^(\d+)(mo|y)$/);
  if (!m) return period; // already a YYYY-MM-DD string
  const [, n, unit] = m;
  const d = new Date();
  if (unit === "mo") d.setMonth(d.getMonth() - Number(n));
  else d.setFullYear(d.getFullYear() - Number(n));
  return d.toISOString().split("T")[0];
}

function text(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function today() {
  return new Date().toISOString().split("T")[0];
}

function fmt(
  value: number | undefined | null,
  decimals: number,
  suffix = "",
  multiplier = 1
): string | null {
  if (value == null) return null;
  return `${(value * multiplier).toFixed(decimals)}${suffix}`;
}

function requireString(args: Record<string, unknown>, key: string): string {
  const val = args[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Missing required string parameter: ${key}`
    );
  }
  return val.trim();
}

function optionalString(
  args: Record<string, unknown>,
  key: string
): string | undefined {
  const val = args[key];
  return typeof val === "string" && val.trim() ? val.trim() : undefined;
}

function requireStringArray(
  args: Record<string, unknown>,
  key: string
): string[] {
  const val = args[key];
  if (!Array.isArray(val) || val.length === 0) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Missing required array parameter: ${key}`
    );
  }
  return val as string[];
}

// ── Entry point ────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Stock MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
