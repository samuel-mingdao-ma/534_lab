"use strict";

(() => {
  const API = "https://api.frankfurter.dev/v2/rates";
  const CURRENCIES = [
    { code: "USD", name: "US Dollar", symbol: "$" },
    { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
    { code: "EUR", name: "Euro", symbol: "€" },
    { code: "GBP", name: "British Pound", symbol: "£" },
    { code: "JPY", name: "Japanese Yen", symbol: "¥" },
    { code: "CHF", name: "Swiss Franc", symbol: "Fr" },
  ];
  const $ = (id) => document.getElementById(id);
  const state = { base: "USD", quote: "CNY", days: 30, latest: null, points: [], revision: 0, controller: null, activePoint: -1 };
  const latestCache = new Map();
  const historyCache = new Map();
  const rateButtons = new Map();
  let chartScale = null;

  const rateFormat = (value) => new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 4, maximumFractionDigits: value < 0.1 ? 6 : 4,
  }).format(value);
  const amountFormat = (value, code) => new Intl.NumberFormat("en-US", {
    minimumFractionDigits: code === "JPY" ? 0 : 2, maximumFractionDigits: code === "JPY" ? 0 : 2,
  }).format(value);
  const dateFormat = (value) => value.replaceAll("-", "/");
  const dateMillis = (value) => Date.parse(`${value}T00:00:00Z`);
  const validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(dateMillis(value));

  function init() {
    for (const id of ["base-currency", "from-currency", "to-currency", "chart-currency"]) {
      for (const currency of CURRENCIES) {
        const option = new Option(id === "base-currency" ? `${currency.code} · ${currency.name}` : currency.code, currency.code);
        $(id).add(option);
      }
    }
    for (const currency of CURRENCIES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "rate-button";
      button.innerHTML = `<span class="rate-identity"><span class="currency-symbol" aria-hidden="true">${currency.symbol}</span><span class="rate-code">${currency.code}</span></span><span class="rate-value">—</span><span class="rate-name">${currency.name}</span>`;
      button.addEventListener("click", () => setPair(state.base, currency.code));
      rateButtons.set(currency.code, button);
      $("rate-list").append(button);
    }
    $("base-currency").addEventListener("change", (event) => setPair(event.target.value, state.quote));
    $("from-currency").addEventListener("change", (event) => setPair(event.target.value, state.quote));
    for (const id of ["to-currency", "chart-currency"]) {
      $(id).addEventListener("change", (event) => setPair(state.base, event.target.value));
    }
    $("swap-currencies").addEventListener("click", () => setPair(state.quote, state.base));
    $("amount").addEventListener("input", renderConversion);
    $("converter-form").addEventListener("submit", (event) => event.preventDefault());
    document.querySelectorAll("[data-days]").forEach((button) => button.addEventListener("click", () => {
      if (state.days === Number(button.dataset.days)) return;
      state.days = Number(button.dataset.days);
      load();
    }));
    $("refresh").addEventListener("click", () => load(true));
    $("chart-message").addEventListener("click", (event) => {
      if (event.target.closest("button")) load(true);
    });
    $("chart-interaction").addEventListener("pointermove", onChartPointer);
    $("chart-interaction").addEventListener("pointerleave", hideTooltip);
    $("chart-interaction").addEventListener("blur", hideTooltip);
    $("chart-interaction").addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key) || !state.points.length) return;
      event.preventDefault();
      if (event.key === "Escape") return hideTooltip();
      let index = state.activePoint < 0 ? state.points.length - 1 : state.activePoint;
      if (event.key === "ArrowLeft") index--;
      if (event.key === "ArrowRight") index++;
      if (event.key === "Home") index = 0;
      if (event.key === "End") index = state.points.length - 1;
      showTooltip(Math.min(state.points.length - 1, Math.max(0, index)), true);
    });
    let resizeFrame;
    new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        if (state.points.length) { hideTooltip(); renderChart(); }
      });
    }).observe($("chart-interaction"));
    load();
  }

  function setPair(base, quote) {
    if (base === state.base && quote === state.quote) return;
    state.base = base;
    state.quote = quote;
    load();
  }

  function syncControls() {
    $("base-currency").value = $("from-currency").value = state.base;
    $("to-currency").value = $("chart-currency").value = state.quote;
    $("base-label").textContent = `1 ${state.base}`;
    $("chart-base").textContent = $("amount-currency").textContent = state.base;
    $("pair-unit").textContent = $("result-currency").textContent = state.quote;
    $("change-label").textContent = `${state.days}-day change`;
    for (const [code, button] of rateButtons) {
      button.setAttribute("aria-pressed", String(code === state.quote));
      button.setAttribute("aria-label", `View ${state.base} to ${code} rate history`);
    }
    document.querySelectorAll("[data-days]").forEach((button) => button.setAttribute("aria-pressed", String(Number(button.dataset.days) === state.days)));
  }

  async function fetchRates(params, signal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, 15000);
    try {
      const response = await fetch(`${API}?${new URLSearchParams(params)}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Data source returned ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data) || !data.length) throw new Error("No exchange rates returned by the data source");
      const rows = data.filter((row) => row.base === params.base && CURRENCIES.some((currency) => currency.code === row.quote) && typeof row.rate === "number" && Number.isFinite(row.rate) && row.rate > 0 && validDate(row.date));
      if (!rows.length) throw new Error("Invalid exchange rate data");
      return rows;
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
    }
  }

  async function load(force = false) {
    state.controller?.abort();
    state.controller = new AbortController();
    const { signal } = state.controller;
    const revision = ++state.revision;
    const { base, quote, days } = state;
    syncControls();
    state.latest = null;
    state.points = [];
    chartScale = null;
    hideTooltip();
    $("notice").hidden = true;
    $("refresh").disabled = true;
    $("refresh").querySelector("span").textContent = "Loading…";
    $("rate-list").setAttribute("aria-busy", "true");
    $("footer-dot").classList.add("is-unavailable");
    $("data-date").textContent = "Loading exchange rates…";
    $("pair-rate").textContent = $("period-change").textContent = "—";
    for (const button of rateButtons.values()) button.querySelector(".rate-value").textContent = "—";
    for (const id of ["range-low", "range-high", "range-average", "chart-date-range"]) $(id).textContent = "—";
    $("chart").replaceChildren();
    setChartMessage("Loading rate history…", true);
    renderConversion();
    try {
      let latest = latestCache.get(base);
      if (force || !latest || Date.now() - latest.fetchedAt > 300000) {
        const rows = await fetchRates({ base, quotes: CURRENCIES.map((currency) => currency.code).join(",") }, signal);
        if (revision !== state.revision) return;
        const rates = new Map();
        rows.forEach((row) => {
          if (!rates.has(row.quote) || row.date > rates.get(row.quote).date) rates.set(row.quote, row);
        });
        if (!rates.has(quote)) throw new Error("Exchange rate unavailable for the selected currency");
        latest = { rates, fetchedAt: Date.now() };
        latestCache.set(base, latest);
      }
      if (revision !== state.revision) return;
      state.latest = latest;
      renderLatest();
      const selected = latest.rates.get(quote);
      if (!selected) throw new Error("Exchange rate unavailable for the selected currency");
      const to = selected.date;
      const start = new Date(dateMillis(to));
      start.setUTCDate(start.getUTCDate() - days + 1);
      const from = start.toISOString().slice(0, 10);
      const key = `${base}:${quote}:${from}:${to}`;
      try {
        let points = historyCache.get(key);
        if (force || !points) {
          const rows = await fetchRates({ base, quotes: quote, from, to }, signal);
          if (revision !== state.revision) return;
          const byDate = new Map();
          rows.filter((row) => row.quote === quote && row.date >= from && row.date <= to).forEach((row) => byDate.set(row.date, row));
          points = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
          if (points.length < 2) throw new Error("Not enough historical data to draw a chart");
          historyCache.set(key, points);
        }
        if (revision !== state.revision) return;
        state.points = points;
        renderChart();
      } catch (error) {
        if (revision !== state.revision || signal.aborted) return;
        setChartMessage("Rate history is unavailable. Current rates and conversion still work.", false, true);
      }
    } catch (error) {
      if (revision !== state.revision || signal.aborted) return;
      $("notice").textContent = "Unable to reach the data source. Check your connection or select Refresh data to try again.";
      $("notice").hidden = false;
      $("data-date").textContent = "Data unavailable";
      $("rate-list").setAttribute("aria-busy", "false");
      setChartMessage("Exchange rate data unavailable", false, true);
      renderConversion();
    } finally {
      if (revision === state.revision) {
        $("refresh").disabled = false;
        $("refresh").querySelector("span").textContent = "Refresh data";
      }
    }
  }

  function renderLatest() {
    for (const [code, button] of rateButtons) {
      const row = state.latest.rates.get(code);
      button.querySelector(".rate-value").textContent = row ? rateFormat(row.rate) : "—";
      button.title = row ? `1 ${state.base} = ${rateFormat(row.rate)} ${code} · ${dateFormat(row.date)}` : "Data unavailable for this currency";
      button.setAttribute("aria-label", row ? `1 ${state.base} equals ${rateFormat(row.rate)} ${code}. View rate history` : `${code} Data unavailable`);
    }
    $("rate-list").setAttribute("aria-busy", "false");
    const selected = state.latest.rates.get(state.quote);
    $("pair-rate").textContent = selected ? rateFormat(selected.rate) : "—";
    $("data-date").textContent = selected ? `As of ${dateFormat(selected.date)}` : "Selected currency data unavailable";
    $("footer-dot").classList.toggle("is-unavailable", !selected);
    renderConversion();
  }

  function renderConversion() {
    const input = $("amount");
    const amount = input.valueAsNumber;
    const invalid = input.value !== "" && (!Number.isFinite(amount) || amount < 0 || amount > 1e12);
    $("amount-error").hidden = !invalid;
    $("amount-error").textContent = invalid ? "Enter an amount between 0 and 1 trillion." : "";
    input.setAttribute("aria-invalid", String(invalid));
    const row = state.latest?.rates.get(state.quote);
    const result = amount * (row?.rate ?? NaN);
    $("converted-amount").textContent = !invalid && Number.isFinite(result) && row ? amountFormat(result, state.quote) : "—";
    $("conversion-rate").textContent = row ? `1 ${state.base} = ${rateFormat(row.rate)} ${state.quote}` : "Waiting for reference rates";
  }

  function setChartMessage(message, loading, retry = false) {
    const box = $("chart-message");
    box.replaceChildren();
    if (loading) {
      const spinner = document.createElement("span");
      spinner.className = "spinner";
      spinner.setAttribute("aria-hidden", "true");
      box.append(spinner);
    }
    const text = document.createElement("span");
    text.textContent = message;
    box.append(text);
    if (retry) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Try again";
      box.append(button);
    }
    box.hidden = false;
    $("chart-region").setAttribute("aria-busy", String(loading));
  }

  function renderChart() {
    const points = state.points;
    const rates = points.map((point) => point.rate);
    const min = Math.min(...rates);
    const max = Math.max(...rates);
    const padding = Math.max((max - min) * 0.2, max * 0.0002);
    const lower = Math.max(0, min - padding);
    const upper = max + padding;
    const first = dateMillis(points[0].date);
    const last = dateMillis(points.at(-1).date);
    const width = $("chart-interaction").clientWidth;
    const height = width < 500 ? 230 : 310;
    const left = 8;
    const right = width - 76;
    const top = 24;
    const bottom = height - 40;
    const x = (point) => left + (dateMillis(point.date) - first) / (last - first) * (right - left);
    const y = (point) => bottom - (point.rate - lower) / (upper - lower) * (bottom - top);
    chartScale = { x, y };
    const coordinates = points.map((point) => `${x(point).toFixed(2)},${y(point).toFixed(2)}`);
    const line = `M${coordinates.join(" L")}`;
    const fill = `${line} L${right},${bottom} L${left},${bottom} Z`;
    const chart = $("chart");
    chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const tickDigits = Math.min(8, Math.max(4, Math.ceil(-Math.log10((upper - lower) / 4))));
    let grid = "";
    for (let index = 0; index <= 4; index++) {
      const position = top + (bottom - top) * index / 4;
      const value = upper - (upper - lower) * index / 4;
      const label = new Intl.NumberFormat("en-US", { minimumFractionDigits: tickDigits, maximumFractionDigits: tickDigits }).format(value);
      grid += `<line x1="${left}" y1="${position}" x2="${right}" y2="${position}" stroke="#e8ede7" stroke-dasharray="3 5"/><text x="${right + 16}" y="${position + 4}" fill="#89928d" font-size="10">${label}</text>`;
    }
    for (let index = 0; index <= 4; index++) {
      const point = points[Math.round((points.length - 1) * index / 4)];
      grid += `<text x="${x(point)}" y="${height - 10}" fill="#89928d" font-size="10" text-anchor="${index === 0 ? "start" : index === 4 ? "end" : "middle"}">${point.date.slice(5).replace("-", "/")}</text>`;
    }
    chart.innerHTML = `<title id="chart-title">${state.base} to ${state.quote}: ${state.days}-day rate history</title><desc id="chart-description">${points[0].date} to ${points.at(-1).date}. Low ${rateFormat(min)}, high ${rateFormat(max)}. Use the left and right arrow keys to explore daily rates.</desc><defs><linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3b8060" stop-opacity=".15"/><stop offset="100%" stop-color="#3b8060" stop-opacity=".01"/></linearGradient></defs>${grid}<path d="${fill}" fill="url(#area-fill)"/><path class="chart-line" d="${line}" fill="none" stroke="#21644f" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><circle cx="${x(points.at(-1))}" cy="${y(points.at(-1))}" r="4" fill="#21644f" stroke="white" stroke-width="2"/><g id="chart-guide" visibility="hidden"><line id="guide-line" y1="${top}" y2="${bottom}" stroke="#7e9e8d" stroke-dasharray="3 4"/><circle id="guide-point" r="4" fill="#21644f" stroke="white" stroke-width="2"/></g>`;
    $("chart-message").hidden = true;
    $("chart-region").setAttribute("aria-busy", "false");
    $("chart-date-range").textContent = `${dateFormat(points[0].date)} — ${dateFormat(points.at(-1).date)}`;
    $("range-low").textContent = rateFormat(min);
    $("range-high").textContent = rateFormat(max);
    $("range-average").textContent = rateFormat(rates.reduce((sum, rate) => sum + rate, 0) / rates.length);
    const change = (points.at(-1).rate / points[0].rate - 1) * 100;
    $("period-change").textContent = `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
    $("period-change").title = `Change in the ${state.base} to ${state.quote} rate since the first day of the period`;
  }

  function onChartPointer(event) {
    if (!chartScale || !state.points.length) return;
    const matrix = $("chart").getScreenCTM();
    if (!matrix) return;
    const position = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    let nearest = 0;
    let distance = Infinity;
    state.points.forEach((point, index) => {
      const delta = Math.abs(chartScale.x(point) - position.x);
      if (delta < distance) { nearest = index; distance = delta; }
    });
    showTooltip(nearest);
  }

  function showTooltip(index, announce = false) {
    if (!chartScale) return;
    state.activePoint = index;
    const point = state.points[index];
    const x = chartScale.x(point);
    const y = chartScale.y(point);
    $("chart-guide").setAttribute("visibility", "visible");
    $("guide-line").setAttribute("x1", x);
    $("guide-line").setAttribute("x2", x);
    $("guide-point").setAttribute("cx", x);
    $("guide-point").setAttribute("cy", y);
    const tooltip = $("chart-tooltip");
    tooltip.replaceChildren(document.createTextNode(dateFormat(point.date)));
    const value = document.createElement("strong");
    value.textContent = `${rateFormat(point.rate)} ${state.quote}`;
    tooltip.append(value);
    if (announce) $("chart-announcement").textContent = `${dateFormat(point.date)}: 1 ${state.base} equals ${rateFormat(point.rate)} ${state.quote}`;
    const matrix = $("chart").getScreenCTM();
    const position = new DOMPoint(x, y).matrixTransform(matrix);
    const rect = $("chart-interaction").getBoundingClientRect();
    tooltip.style.left = `${Math.max(60, Math.min(rect.width - 60, position.x - rect.left))}px`;
    tooltip.style.top = `${Math.max(52, position.y - rect.top - 9)}px`;
    tooltip.hidden = false;
  }

  function hideTooltip() {
    $("chart-tooltip").hidden = true;
    $("chart-announcement").textContent = "";
    $("chart-guide")?.setAttribute("visibility", "hidden");
    state.activePoint = -1;
  }

  init();
})();
