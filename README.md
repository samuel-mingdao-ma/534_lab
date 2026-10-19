# Global Exchange Rate Dashboard

A static, English-language dashboard that uses `fetch` to load real exchange rates from the [Frankfurter API](https://frankfurter.dev/). No API key, backend, or third-party dependencies required.

[Open the dashboard](https://samuel-mingdao-ma.github.io/534_lab/)

## Features

- Switch between USD, CNY, EUR, GBP, JPY, and CHF.
- Explore daily reference rates and 30/90-calendar-day SVG history charts.
- Convert amounts, swap currencies, and refresh data.
- Loading indicators, validation, and retry controls. Failed requests never display fabricated rates.
- Responsive layouts and keyboard-accessible chart values.

## Local preview

Open `index.html` directly in a browser, or run this command in the project directory:

```bash
python3 -m http.server 8000
```

Visit [http://localhost:8000](http://localhost:8000). An internet connection is required to fetch rates.

The application consists of `index.html`, `styles.css`, and `app.js`. No installation or build step is required.

## GitHub Pages

This repository publishes from the root of `main`. To configure another copy:

1. Open **Settings → Pages** in the repository.
2. Select **Deploy from a branch** under **Build and deployment**.
3. Choose **main** and **/ (root)**, then select **Save**.
4. Wait for deployment and open the URL shown in the Pages settings.

## Data and calculations

Example latest-rates request:

```text
https://api.frankfurter.dev/v2/rates?base=USD&quotes=CNY,EUR,GBP,JPY,CHF
```

For history, add `from=YYYY-MM-DD&to=YYYY-MM-DD` to the same endpoint. Both dates are inclusive. The response is an array of records:

```json
{
  "date": "2026-10-19",
  "base": "USD",
  "quote": "CNY",
  "rate": 6.6788
}
```

`rate` is the number of quote-currency units per unit of the base currency. Conversion uses `amount × rate`; the rate for the same currency is 1.

Frankfurter combines reference rates from official sources. Rates update daily, and weekend records may be available. The dashboard displays the date returned by the API, which may differ from today's date. Rates are indicative rather than live execution prices. Conversions exclude bank spreads and fees.

See the [Frankfurter documentation](https://frankfurter.dev/) and [v2 OpenAPI specification](https://api.frankfurter.dev/v2/openapi.json).
