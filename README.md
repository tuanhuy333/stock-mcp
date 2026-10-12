# stock-data-mcp

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that provides real-time stock market data powered by Yahoo Finance. Supports global markets including US, Vietnam, Taiwan, Hong Kong, and more.

## Tools

| Tool | Description |
|------|-------------|
| `get_quote` | Real-time price, change %, volume, market cap, 52-week range |
| `get_historical_data` | Historical OHLCV candlestick data with flexible date ranges |
| `get_company_info` | Fundamentals: PE, EPS, margins, dividends, analyst targets |
| `search_ticker` | Find the ticker symbol for a company by name |
| `get_technical_analysis` | SMA, EMA, RSI, MACD, Bollinger Bands with trend signals |

## Installation

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "stock": {
      "command": "npx",
      "args": ["-y", "stock-data-mcp"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "stock": {
      "command": "npx",
      "args": ["-y", "stock-data-mcp"]
    }
  }
}
```

### Claude Code (CLI)

```bash
claude mcp add stock -- npx -y stock-data-mcp
```

## Example Prompts

After installing, you can ask Claude or Cursor:

- *"What is the current price of AAPL?"*
- *"Show me TSLA's price history for the last 3 months"*
- *"Give me a full technical analysis of MSFT"*
- *"What is the ticker symbol for Samsung Electronics?"*
- *"Compare the PE ratio of AAPL and MSFT"*
- *"Is VNM.VN overbought right now?"*

## Tool Reference

### `get_quote`

Get the current real-time quote for any stock.

```json
{ "symbol": "AAPL" }
```

**Vietnam stocks:** append `.VN` — e.g. `VNM.VN`, `FPT.VN`, `VIC.VN`, `HPG.VN`

**Returns:** price, change, change%, open/high/low, volume, market cap, 52-week range, exchange, market state.

---

### `get_historical_data`

Get OHLCV candlestick data over a date range.

```json
{
  "symbol": "TSLA",
  "period1": "3mo",
  "interval": "1d"
}
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `symbol` | yes | Ticker symbol |
| `period1` | yes | Start date: `YYYY-MM-DD` or relative shorthand (`1mo`, `3mo`, `6mo`, `1y`, `2y`, `5y`) |
| `period2` | no | End date: `YYYY-MM-DD` (default: today) |
| `interval` | no | `1d` / `1wk` / `1mo` (default: `1d`) |

**Interval guidance:** `1d` for ≤6 months, `1wk` for ≤3 years, `1mo` for longer.

---

### `get_company_info`

Get company fundamentals for valuation and due diligence.

```json
{ "symbol": "MSFT" }
```

**Returns:** sector, industry, PE ratio, EPS, revenue growth, profit margins, ROE, total debt, dividend yield, beta, analyst consensus (buy/sell/hold), mean price target.

---

### `search_ticker`

Find the correct ticker symbol when you only know the company name.

```json
{ "query": "Samsung Electronics", "limit": 5 }
```

> **Note:** Vietnamese companies may not appear by name. Use tickers directly: `VNM`, `FPT`, `VIC`, `HPG`, `VHM`, `MWG`, `TCB`.

---

### `get_technical_analysis`

Calculate technical indicators for trend and momentum analysis.

```json
{
  "symbol": "AAPL",
  "indicators": ["ALL"]
}
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `symbol` | yes | Ticker symbol |
| `indicators` | yes | `["ALL"]` or any subset: `["SMA", "EMA", "RSI", "MACD", "BB"]` |
| `period_days` | no | Days of history to use (default: 300) |

| Indicator | Parameters | Signal |
|-----------|-----------|--------|
| `SMA` | 20, 50, 200-day | Golden Cross / Death Cross |
| `EMA` | 12, 26-day | Trend direction |
| `RSI` | 14-day | Overbought (>70) / Oversold (<30) |
| `MACD` | 12/26/9 | Bullish / Bearish crossover |
| `BB` | 20-day, 2σ | Price extremes vs. Bollinger Bands |

## Development

```bash
git clone <repo>
cd stock-data-mcp
npm install
npm run build
node dist/index.js
```

Dev mode (no build step):

```bash
npm run dev
```

## Publishing

```bash
npm login
npm publish
```

## License

MIT
