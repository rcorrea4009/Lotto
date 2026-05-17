# 🧠 Lotto NZ Automation (Puppeteer)

This runs the NZ Lotto **Pick Your Dip** Auto Fill 72 times for you, then saves the result in the exact format the **Gordon Analyzer** needs — so you can paste straight in.

---

## ⚠️ Important — this runs on YOUR computer, not on GitHub Pages

GitHub Pages only serves static HTML/JS to a browser. Puppeteer is a Node.js library that controls a real Chrome browser on a computer — it can't run inside a webpage. So this folder is **separate** from `index.html`. You run it locally, then paste the output into the deployed Gordon Analyzer.

---

## 📦 Step 1 — Install Node.js (one-time, ~3 mins)

If you don't already have Node.js installed:

- **Mac**: download the LTS installer from https://nodejs.org/en/download
- **Windows**: download the LTS installer from https://nodejs.org/en/download

After installing, open **Terminal** (Mac) or **PowerShell** (Windows) and check it worked:

```
node --version
```

You should see something like `v20.x.x` or `v22.x.x`.

---

## 📥 Step 2 — Install dependencies (one-time, ~2 mins)

In Terminal / PowerShell, navigate to this folder:

```
cd path/to/lotto-automation
```

Then install Puppeteer:

```
npm install
```

This downloads Puppeteer plus a bundled Chromium browser (~170 MB). First time only.

---

## ▶️ Step 3 — Run it

Whenever you want a fresh batch of 72 lines:

```
npm start
```

A Chrome window will open, navigate to Lotto NZ, toggle off Powerball, click Auto Fill 72 times, and close itself. Takes ~45 seconds.

When it finishes, you'll see the formatted output printed in the terminal, **and** it's saved to `lotto-output.txt` in this folder.

### Want it invisible?

```
npm run headless
```

Same thing, but no Chrome window appears.

---

## 📋 Step 4 — Paste into Gordon Analyzer

1. Open `lotto-output.txt` in any text editor (or copy from the terminal output between the `═══` lines)
2. Open your **NZ Lotto Analyzer** (GitHub Pages site or local file)
3. Click the 🧠 **Gordon** tab
4. Paste everything into the textarea
5. Hit **PARSE & RUN GORDON**

Done — full Gordon analysis on real fresh Lotto NZ lines.

---

## 🛠 Troubleshooting

| Problem | Fix |
|---|---|
| `node: command not found` | Node.js isn't installed — go back to Step 1. |
| `Cannot find module 'puppeteer'` | You forgot Step 2. Run `npm install` inside this folder. |
| Browser opens but Page didn't load | Slow connection. Increase `PAGE_LOAD_MS` near the top of `auto-fill-lotto.js`. |
| Finishes with **0 lines** | Lotto NZ changed their HTML. Open `auto-fill-lotto.js` and search for `lnz-ticket-line` — update the class names to whatever they're using now. |
| Browser closes too fast to see what happened | Run with `HEADLESS=false` (default) and watch it. Comment out `await browser.close();` to keep it open. |
| Powerball still on in the picks | Lotto NZ may have changed the toggle. Either turn it off manually before running, or update the powerball detection block in the script. |

---

## 🔧 Tweaks

All the settings are at the top of `auto-fill-lotto.js`:

```js
const TOTAL_LINES   = 72;     // change to whatever you want
const CLICK_DELAY   = 420;    // ms between Auto Fill clicks (raise if buggy)
const PAGE_LOAD_MS  = 4000;   // initial wait for page to render
```

---

## ⚠️ Reminder

Lotto is random. No amount of automation, statistics, or pattern analysis changes the **1 in 3,838,380** jackpot odds. This is for entertainment only — play responsibly.
