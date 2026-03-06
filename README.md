# EcoInsight — Environmental Monitoring Platform

A real-time environmental monitoring dashboard built with React + Vite.

---

## Quick Start

```bash
npm install
npm run dev
```

Then open http://localhost:5173 in your browser.

---

## How to Add Your API Key (for Live Data)

### Step 1 — Get a Free API Key
1. Go to https://openweathermap.org/api
2. Click **Sign Up** (free, no credit card needed)
3. After signing up, go to **My API Keys** in your account dashboard
4. Copy your default API key (looks like: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`)
5. **Wait 10–15 minutes** after signing up — new keys take a few minutes to activate

### Step 2 — Enter the Key in the App
1. Run the app (`npm run dev`) and open it in your browser
2. In the top-right header, click the orange **"DEMO DATA — Add API Key"** button
3. Paste your API key into the input field
4. Click **Activate**
5. The app will immediately start fetching live data for all 12 cities
6. Your key is saved in the browser's localStorage — you only need to do this once

---

## What the Live Data Fetches

For each city, two free API endpoints are called simultaneously:

| API | Endpoint | Data |
|-----|----------|------|
| Current Weather | /data/2.5/weather | Temperature, Humidity, Rainfall |
| Air Pollution | /data/2.5/air_pollution | PM2.5, PM10, O3, NO2, CO, AQI |

- **12 cities** fetched in parallel
- **Auto-refreshes every 10 minutes**
- If a city fails, it falls back to static 2024 data for that city only

---

## Features

- **Dashboard** — AQI gauge, pollutant bars, weather cards, mini trend charts, health advisory
- **Global Map** — Interactive SVG world map with color-coded city markers
- **Trends** — Historical charts for AQI, PM2.5, Temperature, Rainfall with time range selector
- **Compare** — Side-by-side comparison of up to 4 cities with radar chart and data table
- **Alerts** — Real-time environmental alerts ranked by severity
- **Predict** — AI-assisted forecasting using Holt smoothing + linear regression ensemble

---

## Project Structure

```
ecoinsight/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx      ← React entry point
    └── App.jsx       ← Entire application
```

---

## Cities Monitored

Delhi · Beijing · Cairo · Mumbai · Lagos · São Paulo · New York · Tokyo · Paris · London · Sydney · Singapore
