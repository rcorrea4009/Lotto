// ============================================================
// NZ Lotto Auto-Fill — Puppeteer Edition
// ============================================================
// Opens Lotto NZ Pick Your Dip, toggles off Powerball,
// clicks Auto Fill 72 times, prints + saves the result in the
// Gordon Analyzer paste format.
//
// Run with:  node auto-fill-lotto.js
// Headless:  HEADLESS=true node auto-fill-lotto.js
// ============================================================

const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

// ── Settings ────────────────────────────────────────────────
const TOTAL_LINES   = 72;                  // 6 tickets × 12 lines
const CLICK_DELAY   = 420;                 // ms between Auto Fill clicks
const PAGE_LOAD_MS  = 4000;                // initial wait for page widgets
const OUTPUT_FILE   = "lotto-output.txt";
const URL           = "https://mylotto.co.nz/lotto/pyo";
const HEADLESS      = process.env.HEADLESS === "true";

// ── Helpers ─────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(msg) {
  const t = new Date().toLocaleTimeString();
  console.log(`[${t}] ${msg}`);
}

// ── Main ────────────────────────────────────────────────────
(async () => {
  log("🚀 Launching browser" + (HEADLESS ? " (headless)" : "") + "...");

  const browser = await puppeteer.launch({
    headless: HEADLESS ? "new" : false,
    defaultViewport: { width: 1366, height: 900 },
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
  );

  log("🌐 Navigating to " + URL);
  try {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (e) {
    log("⚠️  Navigation slow — continuing anyway");
  }

  log("⏳ Waiting for page widgets to render...");
  await sleep(PAGE_LOAD_MS);

  // Best-effort: dismiss cookie banner if present
  try {
    await page.evaluate(() => {
      const btns = document.querySelectorAll("button");
      for (const b of btns) {
        const t = (b.textContent || "").toLowerCase();
        if (t.includes("accept") || t.includes("agree") || t.includes("got it")) {
          b.click();
          return true;
        }
      }
    });
    await sleep(700);
  } catch (e) {}

  // ── Toggle off Powerball ──────────────────────────────────
  log("🔕 Turning off Powerball (if on)...");
  try {
    await page.evaluate(() => {
      const checks = document.querySelectorAll('input[type="checkbox"]');
      for (const c of checks) {
        const label = c.closest("label") || c.parentElement;
        const text = (label ? label.textContent : "").toLowerCase();
        const idName = ((c.id || "") + " " + (c.name || "")).toLowerCase();
        if ((text.includes("powerball") || idName.includes("power")) && c.checked) {
          c.click();
        }
      }
    });
    await sleep(600);
  } catch (e) {
    log("  (Powerball auto-toggle skipped — turn it off manually if needed)");
  }

  // ── Auto-Fill loop ────────────────────────────────────────
  log(`🎲 Auto-filling up to ${TOTAL_LINES} lines...`);
  let filled = 0;
  let attempts = 0;
  const maxAttempts = TOTAL_LINES * 6;

  while (filled < TOTAL_LINES && attempts < maxAttempts) {
    attempts++;

    const clicked = await page.evaluate(() => {
      const sel = [
        ".lnz-ticket-line__auto-fill",
        '[class*="auto-fill"]',
        '[class*="autofill"]',
        '[class*="AutoFill"]',
      ].join(",");
      const lineSel = [
        ".lnz-ticket-line",
        '[class*="ticket-line"]',
        '[class*="ticketLine"]',
        '[class*="TicketLine"]',
      ].join(",");
      const numSel = [
        ".lnz-ticket-line__number-text",
        '[class*="number-text"]',
        ".selected",
      ].join(",");

      const buttons = document.querySelectorAll(sel);
      for (const btn of buttons) {
        const line = btn.closest(lineSel);
        if (!line) continue;
        const nums = line.querySelectorAll(numSel);
        if (nums.length < 6) {
          btn.click();
          return true;
        }
      }
      return false;
    });

    if (clicked) {
      await sleep(CLICK_DELAY);
    } else {
      // No empty line — try clicking an "Add another line" button
      const added = await page.evaluate(() => {
        const all = document.querySelectorAll("button, a");
        for (const b of all) {
          const t = (b.textContent || "").trim().toLowerCase();
          if (/add (another )?line|new line|\+ line/.test(t)) {
            b.click();
            return true;
          }
        }
        return false;
      });
      await sleep(added ? CLICK_DELAY : CLICK_DELAY * 2);
    }

    // Recount completed lines
    filled = await page.evaluate(() => {
      const lines = document.querySelectorAll(
        '.lnz-ticket-line, [class*="ticket-line"], [class*="ticketLine"]'
      );
      let n = 0;
      for (const l of lines) {
        const nums = l.querySelectorAll(
          '.lnz-ticket-line__number-text, [class*="number-text"], .selected'
        );
        if (nums.length >= 6) n++;
      }
      return n;
    });

    if (attempts % 10 === 0) log(`  Progress: ${filled} / ${TOTAL_LINES}`);
  }

  log(`✅ Auto-fill finished — ${filled} lines filled in ${attempts} attempts`);
  await sleep(800);

  // ── Extract numbers ──────────────────────────────────────
  log("📥 Extracting numbers from DOM...");
  const lines = await page.evaluate(() => {
    const containers = document.querySelectorAll(
      '.lnz-ticket-line, [class*="ticket-line"], [class*="ticketLine"]'
    );
    const out = [];
    for (const c of containers) {
      const els = c.querySelectorAll(
        '.lnz-ticket-line__number-text, [class*="number-text"], .selected'
      );
      const nums = [...els]
        .map((e) => parseInt(e.textContent.trim(), 10))
        .filter((n) => !isNaN(n) && n >= 1 && n <= 40)
        .slice(0, 6);
      if (nums.length === 6) out.push(nums);
    }
    return out;
  });

  log(`📊 Found ${lines.length} complete lines.`);

  if (lines.length === 0) {
    log("❌ Could not extract any lines — Lotto NZ may have updated their HTML.");
    log("   Open auto-fill-lotto.js and adjust the selectors (search lnz-ticket-line).");
    await browser.close();
    process.exit(1);
  }

  // ── Format Gordon-ready output ────────────────────────────
  // Matches the exact Lotto NZ copy/paste format the Gordon parser expects:
  // letter\nN1\nN2\nN3\nN4\nN5\nN6\n●\n
  const labels = "ABCDEFGHJKLMNPQRSTUV".split("");
  let gordon = "";
  const take = Math.min(lines.length, TOTAL_LINES);
  for (let i = 0; i < take; i++) {
    gordon += labels[i % labels.length] + "\n";
    for (const n of lines[i]) gordon += n + "\n";
    gordon += "●\n";
  }

  const outPath = path.resolve(__dirname, OUTPUT_FILE);
  fs.writeFileSync(outPath, gordon);

  console.log("");
  console.log("═══════════════════════════════════════════════════");
  console.log("  GORDON-READY OUTPUT  (also saved to " + OUTPUT_FILE + ")");
  console.log("═══════════════════════════════════════════════════");
  console.log(gordon);
  console.log("═══════════════════════════════════════════════════");
  console.log("");
  log("💾 Saved to: " + outPath);
  log("👉 Open the NZ Lotto Analyzer → 🧠 Gordon tab → paste into the textarea → PARSE & RUN GORDON");

  await browser.close();
  log("👋 Done.");
})().catch((err) => {
  console.error("");
  console.error("❌ FATAL ERROR:", err.message);
  console.error("");
  console.error("Common fixes:");
  console.error("  • Make sure you ran 'npm install' first");
  console.error("  • Check your internet connection");
  console.error("  • If selectors are broken, edit auto-fill-lotto.js");
  process.exit(1);
});
