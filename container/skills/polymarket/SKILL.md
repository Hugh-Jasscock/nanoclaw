---
name: polymarket
description: Trade on Polymarket prediction markets. Use when the user asks about prediction markets, wants to check market prices, place bets/trades, view positions, or research events on Polymarket.
allowed-tools: Bash(polymarket:*)
---

# Polymarket Trading

Trade on prediction markets using the Polymarket CLOB API. Credentials are in env vars.

## Searching for Markets

Use the Gamma API (no auth needed):

```bash
# Search by keyword
curl -s "https://gamma-api.polymarket.com/events?active=true&closed=false&limit=10" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
d.forEach(e => {
  console.log(e.title);
  (e.markets||[]).forEach(m => console.log('  Token:', m.clobTokenIds, 'Price:', m.outcomePrices, 'Slug:', m.conditionId));
});
"

# Search by keyword/topic
curl -s "https://gamma-api.polymarket.com/events?active=true&closed=false&limit=10&tag=politics"

# Top markets by volume
curl -s "https://gamma-api.polymarket.com/events?active=true&closed=false&order=volume_24hr&ascending=false&limit=10"
```

## Trading via Script

Write a script to `/tmp/polymarket.mjs` and run it. All trading goes through the `@polymarket/clob-client` SDK.

### Initialize the Client

```javascript
// /tmp/polymarket.mjs
import { ClobClient } from "@polymarket/clob-client";
import { Wallet } from "ethers";

const signer = new Wallet(process.env.POLYMARKET_PRIVATE_KEY);

const client = new ClobClient(
  "https://clob.polymarket.com",
  137,
  signer,
  {
    key: process.env.POLYMARKET_API_KEY,
    secret: process.env.POLYMARKET_SECRET,
    passphrase: process.env.POLYMARKET_PASSPHRASE,
  },
  0,  // signature type: EOA
  process.env.POLYMARKET_ADDRESS
);
```

Run with: `POLYMARKET_PRIVATE_KEY="$POLYMARKET_PRIVATE_KEY" POLYMARKET_ADDRESS="$POLYMARKET_ADDRESS" POLYMARKET_API_KEY="$POLYMARKET_API_KEY" POLYMARKET_SECRET="$POLYMARKET_SECRET" POLYMARKET_PASSPHRASE="$POLYMARKET_PASSPHRASE" node /tmp/polymarket.mjs`

### Get Market Prices & Orderbook

```javascript
// Get orderbook for a token
const book = await client.getOrderBook("TOKEN_ID_HERE");
console.log("Best bid:", book.bids[0]?.price, "Best ask:", book.asks[0]?.price);

// Get midpoint price
const mid = await client.getMidpoint("TOKEN_ID_HERE");
console.log("Midpoint:", mid);

// Get spread
const spread = await client.getSpread("TOKEN_ID_HERE");
console.log("Spread:", spread);
```

### Place an Order

```javascript
import { Side, OrderType } from "@polymarket/clob-client";

const order = await client.createAndPostOrder(
  {
    tokenID: "TOKEN_ID_HERE",
    price: 0.50,    // price per share (0.01 to 0.99)
    size: 10,       // number of shares
    side: Side.BUY, // or Side.SELL
  },
  {
    tickSize: "0.01",
    negRisk: false,  // set true for neg-risk markets
  },
  OrderType.GTC  // Good Till Cancelled
);

console.log("Order ID:", order.orderID);
console.log("Status:", order.status);
```

### Check Positions & Orders

```javascript
// Open orders
const orders = await client.getOpenOrders();
console.log("Open orders:", JSON.stringify(orders, null, 2));

// Trade history
const trades = await client.getTrades();
console.log("Trades:", JSON.stringify(trades, null, 2));
```

### Cancel an Order

```javascript
await client.cancelOrder("ORDER_ID_HERE");
console.log("Order cancelled");

// Cancel all open orders
await client.cancelAll();
console.log("All orders cancelled");
```

## Important

- **Wallet address:** The trading wallet is `$POLYMARKET_ADDRESS`. It needs USDC.e on Polygon to trade and POL for gas.
- **Always confirm with Jason** before placing any trade — show the market, side (buy/sell), price, size, and potential cost.
- **Token IDs:** Each market outcome has a token ID (from `clobTokenIds` in the Gamma API response). Binary markets have two tokens: Yes and No.
- **Prices:** Range from 0.01 to 0.99. A price of 0.65 on "Yes" means the market thinks there's a 65% chance.
- **Tick size:** Most markets use "0.01". Check the market's `minimum_tick_size` field.
- **negRisk:** Some markets use negative risk tokens. Check the market's `neg_risk` field from the Gamma API.
- **Cost:** Buying N shares at price P costs N × P USDC. If the outcome is Yes, each share pays out $1.
