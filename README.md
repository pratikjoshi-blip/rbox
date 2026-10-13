# 🏹 DIGITAL RAVAN BOX

### “Write it. Drop it. Let it go.”

An anonymous digital Dussehra ceremony for the office celebration on **16 October 2026**.

Employees scan a QR code and drop one thing they want to let go of into **Ravan's mouth**. Ravan's face is the box. On Dussehra, the organizer opens the mouth on a projector, every paper chit comes out, and then **🔥 BURN OUR RAVAN**: a wave of fire rises from below, climbs the face and burns Ravan and all the chits together.

**No Node.js, no build step, no paid server.** The app is plain HTML, CSS and JavaScript.

---

## Architecture: where the data lives

```
 Employee phones ─┐                                ┌─► Google Sheet  "Submissions"
 Admin laptop  ───┼─► GitHub Pages (static site) ──┤   (one central table; everyone writes here)
 Projector     ───┘   HTML / CSS / JS              └─► Google Apps Script Web App (the API)
                                                        • validates + sanitises input
                                                        • admin password + session tokens
                                                        • ceremony state (Script Properties)
```

**How the data is centralized.** GitHub Pages only serves files and cannot store anything. The central database is **one Google Sheet**. A small **Google Apps Script** attached to that Sheet acts as the API. Google hosts and runs it for free over HTTPS, so there is no Node.js or server of yours to maintain. Every phone sends its chit to the same Apps Script URL, and that URL appends a row to the same Sheet. The admin dashboard and the ceremony screen read from that Sheet as well.

**Why this setup.** We chose GitHub Pages + Apps Script + Sheets over Firebase for four reasons:
- It's free with no credit card. A Google account and a GitHub account are enough.
- There's no SDK, build tool or `npm install`.
- The organizer can open the Sheet at any time and see or export every record directly.
- 22 people is far below Apps Script's quotas.

**Local mode, for testing only.** When `API_URL` in `js/config.js` is empty, the app uses `js/local-backend.js`. This copy of the API runs entirely in the browser and stores data in `localStorage`. It lets you rehearse the whole ceremony on one laptop with nothing set up. Data in local mode is **not shared between devices**. Phones need the real Apps Script backend.

### Project structure

```
index.html                Employee page (mobile-first): pick a Ravan → write → drop into the mouth
admin/index.html          Organizer dashboard: login, stats chart, chits, ceremony, demo mode, QR
admin/poster.html         Printable A4 poster with QR code
ceremony/index.html       Full-screen projector ceremony (state machine + fire)
css/base.css              Tokens, buttons, Ravan animations, paper chits + burn styles
css/employee.css · admin.css · ceremony.css
js/config.js              ← the only file you edit (API_URL, PUBLIC_URL, event label)
js/ravan.js               The Ravan face (SVG): ten heads, crown, moustache, mouth control
js/chit.js                Paper chit renderer (textContent only → XSS-safe)
js/fire.js                Canvas particle fire: glow, flames, fire wave, embers, ash, smoke, gold dust
js/ceremony.js            Ceremony state machine, chit layout, reveal, burn orchestration
js/employee.js · admin.js · sound.js (Web Audio, no files) · qr.js
js/api.js                 API client (Apps Script, or local mode when API_URL is empty)
js/local-backend.js       In-browser backend for local testing
js/vendor/qrcode.js       QR generator (MIT, vendored; no CDN needed)
backend/apps-script/Code.gs        The production API: paste into Apps Script
backend/apps-script/appsscript.json
```

---

## Local Development

You don't need to install anything. Use any one of these options:

**Option A: VS Code "Live Server"** (easiest in VS Code)
Install the *Live Server* extension → right-click `index.html` → **Open with Live Server**.

**Option B: Python** (comes with most machines)
```bash
cd D:\internal\dusshera
python -m http.server 5173
```
Then open:
- Employee page: http://localhost:5173/
- Admin: http://localhost:5173/admin/ (local-mode password: **`ravan2026`**)

**Option C: test directly on GitHub Pages.** Deploy first (see below) and leave `API_URL` empty. The live site then runs in local mode in your browser.

> Open the employee page, admin and ceremony in the **same browser**. In local mode they share that browser's storage.

---

## Environment Variables (configuration)

Because the site is static, there are no server environment variables. Everything is set in **`js/config.js`**:

| Key | What to set |
|---|---|
| `API_URL` | Your Apps Script Web App URL (ends in `/exec`). **Empty = local mode.** |
| `PUBLIC_URL` | The URL employees open, used for the QR code and poster. Leave empty to auto-detect from where the site is hosted. |
| `EVENT_ID` | Groups the submissions, `dussehra-2026` by default. |
| `EVENT_DATE_LABEL` | The date shown on the final screen and poster. |
| `LOCAL_ADMIN_PASSWORD` | Admin password for **local mode only**. |

The production admin password is **not** in the website. It is stored as a Script Property in Apps Script (see below), so it is never exposed in the public code.

---

## Database Setup (Google Sheets)

1. Go to https://sheets.new and name the sheet **Digital Ravan Box**.
2. You don't need to add anything else. The setup script creates a `Submissions` tab with these columns:
   `id | eventId | category | message | createdAt | isDemo | burned | burnedAt`

Only those fields are stored. There are no names, emails, phone numbers, IP addresses or logins.

## Google Sheets / Apps Script Setup

1. In the Sheet: **Extensions → Apps Script**.
2. Delete the sample code and paste the full contents of **`backend/apps-script/Code.gs`**. Save.
3. *(Optional)* **Project Settings ⚙ → Show "appsscript.json"** and paste `backend/apps-script/appsscript.json`. This sets the time zone to India.
4. **Project Settings ⚙ → Script properties → Add property**
   - Property: `ADMIN_PASSWORD`
   - Value: a strong password, for example `Ravan-Dahan-2026!x`
5. In the editor, select the function **`setup`** → **Run** → approve the permissions.
   (Google warns "unverified app" because it's your own script. Click **Advanced → Go to project**.)
6. **Deploy → New deployment →** gear icon **→ Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - **Deploy**, then copy the **Web app URL** (`https://script.google.com/macros/s/…/exec`).
7. Paste that URL into `js/config.js` → `API_URL: 'https://script.google.com/macros/s/…/exec'`.
8. Check it works: open the `/exec` URL in a browser. You should see `{"ok":true,"data":{"service":"digital-ravan-box",…}}`.

> **Can't find the sheet?** In the Apps Script editor, run **`whereIsMySheet`**. The Execution log prints the link to the sheet the backend writes to. If the script was created on its own at script.google.com rather than from a sheet, create a Google Sheet and add a Script Property **`SPREADSHEET_ID`**. Its value is the long id in the sheet's URL: `docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`. Then run `setup` once.
>
> **If you edit `Code.gs` later:** **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy.** This keeps the same URL. Saving the code alone does not update the live API.
>
> **Company Google Workspace accounts:** some Workspace admins don't allow "Anyone" access. If you can't choose it, create the Sheet and script with a personal Gmail account instead.

## Admin Setup

- Admin URL: `https://<your-site>/admin/`
- Password: the `ADMIN_PASSWORD` script property (in local mode, `ravan2026`).
- A login session lasts 6 hours (12 hours in local mode). After 10 wrong passwords, logins lock for 10 minutes.
- The dashboard shows:
  - total submissions, a category chart and every chit as paper slips
  - ceremony controls: Start, Test, Seal/Reopen, Reset
  - demo mode, the QR code, the copy-link button and the poster

## Demo Mode

On the admin dashboard under **🧪 Demo mode**:
- **+5 / +10 / +20 / +22** generates sample chits marked `isDemo = TRUE` (they show a blue DEMO tag).
- **Clear demo data** deletes demo rows only. Real submissions are never touched.
- **Test ceremony ▶** opens `/ceremony/?mode=test`. It shows real + demo chits and **saves nothing**: no state changes and no burn flags.

**Full test flow:** generate 22 entries → Test ceremony → click Ravan (or `Space`) → the mouth opens and the chits come out → click a few chits → 🎲 Reveal a few → `Esc` → 🔥 Burn our Ravan → watch the fire → final screen → press `R`, then `Enter` → run it again.

### Ceremony keyboard controls

| Key | Action |
|---|---|
| `Space` / `Enter` on Ravan | Open Ravan · next chit in "Reveal a few" · close an enlarged chit |
| `B` (press twice) | Burn Ravan. It needs two presses so it can't fire by accident. |
| `R` | Reset the presentation (asks for confirmation; `Enter` confirms, `Esc` cancels) |
| `Esc` | Close the chit or reveal · press twice to exit to admin |
| `F` | Fullscreen |

**State machine:**
`SUBMISSIONS_OPEN → CEREMONY_READY → RAVAN_CLOSED → RAVAN_OPENING → CHITS_REVEALED → BURNING → BURNED → FINAL_MESSAGE`

In real mode every step is saved. If the projector laptop refreshes mid-ceremony, the page resumes: chits that were already revealed come back, and a completed ceremony opens on the final screen. **Burning never deletes data.** It sets `burned = TRUE` and `burnedAt` on each real record. **Reset** returns the presentation to the start and clears the burn flags. It also never deletes anything.

---

## Deployment (free, HTTPS): GitHub Pages

1. Create a GitHub repository, for example `ravan-box`. It must be **Public** to use Pages on the free plan.
2. Upload every file in this folder (drag and drop on github.com works), or use:
   ```bash
   git init
   git add .
   git commit -m "Digital Ravan Box"
   git branch -M main
   git remote add origin https://github.com/<you>/ravan-box.git
   git push -u origin main
   ```
3. Repository → **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
4. After about a minute the site is live at **`https://<you>.github.io/ravan-box/`**.
5. Make sure `js/config.js` contains your `API_URL`, then commit and push again if you changed it.

Everything uses relative paths, so the site works under the `/ravan-box/` sub-path without any changes.

> **Caching:** GitHub Pages lets browsers cache files for 10 minutes. After you push a change, especially to `js/config.js`, bump the `?v=…` tag on the `<script>`/`<link>` lines in the four HTML pages so browsers fetch the new files. Then hard-refresh with **Ctrl+Shift+R**.
>
> If a page says **"The Ravan Box is sealed"** even though admin shows *Submissions open*, that browser is still running an old cached `config.js` in local mode. Hard-refresh it, or open the link in a private tab.

> Is it safe to make the repo public? Yes. No secrets live in it. The admin password lives only in Apps Script properties, and the Sheet is private to your Google account.

## QR Code

- Admin dashboard → **Share with employees** shows the QR code for the public page.
- **Download QR code** saves a 1200 × 1200 PNG for print or slides.
- **Copy public link** copies the URL for email or chat.
- **🖨️ Printable poster** opens an A4 poster with the QR code. Use **Print → Save as PDF** or print it directly, with "Background graphics" turned on.
- The QR code points to `PUBLIC_URL` if you set one; otherwise it points to the address the site is hosted at. Generate the QR code **from the deployed GitHub Pages site**, not from `localhost`.

---

## 👥 Event teams (shared by darts + treasure hunt)

Create the teams once at **`/teams/`**, using the scorer PIN. You can add, rename, reorder and remove them there. When you start a darts game or a treasure hunt, you **tick which teams play** from this list. For darts, the order you tick them is the throwing order. Both games use the same team names, and the server looks the names up from this list.

A game keeps the names it started with, so renaming a team later doesn't change a game already in progress. The list is stored in a **`Teams`** tab of the Sheet.

## 🎯 Ravan Darts (team scoreboard)

The darts scoreboard is part of the same site and uses the same Google Sheet. It has two pages:

| Page | Used on | Purpose |
|---|---|---|
| `/darts/score/` | Scorekeeper's phone | Sign in with a PIN, pick the teams from the shared list (in throwing order), then tap the number hit and **Inside / Outside the ring**. **Undo last** fixes mistakes. |
| `/darts/` | TV or projector | Read-only live board: ranked teams, who's throwing now, the latest darts, and a winner reveal. `F` or a double-click toggles fullscreen. |

**Scoring** (calculated on the server, so the phone and the TV always agree):

| Dart lands on | Outside the ring | Inside the ring |
|---|---|---|
| Odd number | −n | −n ÷ 2 |
| Even number | +n | +2n |
| Miss | 0 | 0 |
| Bullseye | the "Bullseye pts" setting chosen when starting the game | |

Teams throw in the order entered, with the chosen number of darts per turn, for the chosen number of rounds. Equal scores share a rank and the winner screen shows a tie.

**Setup (one time):**
1. Paste the updated `backend/apps-script/Code.gs` into Apps Script and save.
2. **Deploy → Manage deployments → ✏️ → Version: New version → Deploy.** The URL stays the same.
3. *(Optional)* Add a Script Property **`DARTS_PIN`** so the scorekeeper doesn't need the admin password. Without it, the admin password works as the PIN.

Each game is stored as one JSON value in cell A1 of a **`Darts`** tab that is created automatically. When you start a new game, the old one is kept as history on the rows below.

**Local test:** with `API_URL` empty, open `/darts/score/` and `/darts/` as two tabs in the same browser. The local PIN is `ravan2026`.

**Testing on the live server:** each scorer page has a **🧪 Testing** box at the bottom, and you type `RESET` to confirm.
- **Reset darts** wipes the `Darts` tab (current game and history).
- **Reset treasure hunt** wipes the `Hunt` tab.
- **Delete all teams** on `/teams/` wipes the `Teams` tab.

Each one clears only its own tab. The Ravan Box `Submissions` tab and ceremony state are never touched. For the Ravan Box itself, use demo data and **Clear demo data**, or **Test ceremony** on the admin page, which saves nothing.

## 🗺️ Treasure hunt (team leaderboard)

| Page | Used on | Purpose |
|---|---|---|
| `/hunt/score/` | Scorekeeper's phone | Same PIN as darts. Create the hunt by picking teams from the shared list, **Start stopwatch** for a team (or **Start all**), then tap **Clue N found** as each clue comes in. **↶** undoes a team's last step. |
| `/hunt/` | TV or projector | Live leaderboard: clue progress, running stopwatches, points, a pop-up for each clue found, and the winner once every team has finished. |

**Points:**

| Event | Points |
|---|---|
| Clue 1 / Clue 2 / Clue 3 / Final clue | +5 / +10 / +15 / +20 |
| All clues found within 5:00 of the stopwatch start | +20 bonus |
| All clues found within 10:00 | +10 bonus |

- Clues are found in order.
- Each team has its own stopwatch; the final clue stops it.
- Exactly 5:00 or 10:00 still earns that bonus.
- Equal points: the faster finish ranks higher.
- Times use the **server clock**, so a phone's wrong time can't affect results.

Data lives in cell A1 of a **`Hunt`** tab that is created automatically. Previous hunts are kept on the rows below. It needs the same `Code.gs` update and **New version** deploy as darts.

## Security notes

- Employees have no login and nothing identifying is collected or stored.
- **XSS:** all user text is rendered with `textContent`, never `innerHTML`. The server also strips control characters and `<` `>`.
- **Validation:** categories are checked against a whitelist and messages are capped at 150 characters on both client and server.
- **Spreadsheet formula injection** is blocked: a leading `=`, `+`, `-` or `@` is escaped.
- **Admin:** the password is compared in constant time and stored only in Script Properties. Sessions use random tokens in `CacheService`, and login attempts are rate-limited.
- Every admin action (list, state, burn, reset, demo) checks the token on the server, so employees can't call them.
- **Rate limiting:** the server allows at most 60 submissions per minute in total, and each phone has a 20-second cooldown between its own submissions.
- **Concurrency:** `LockService` prevents writes from colliding when everyone submits at once.

## Accessibility

- Every control works from the keyboard, with visible focus rings and large touch targets.
- Text is cream and gold on very dark backgrounds for high contrast.
- **`prefers-reduced-motion: reduce`** turns off the shaking and flying animations and replaces the fire with a calm warm dissolve.
- **Sound is OFF by default.** The 🔊 toggle in the top-right corner of the ceremony screen turns on a tanpura-style drone, a rumble when the mouth opens, a fire roar with crackle, and a final temple-bell chime. All of it is synthesised in the browser; there are no audio files.

---

## Production Checklist

**A week before (submissions open)**
- [ ] Apps Script deployed; opening the `/exec` URL returns `ok:true`.
- [ ] `API_URL` set in `js/config.js` and pushed; the admin dashboard has **no** "Local mode" banner.
- [ ] `ADMIN_PASSWORD` is strong and shared only with the organizers.
- [ ] Submitted a test chit from **an Android phone and an iPhone** (Chrome and Safari); it appears in the Sheet and the dashboard.
- [ ] QR code scanned from the printed poster opens the right URL.
- [ ] Demo data generated → **Test ceremony** run end to end → **Clear demo data**.
- [ ] Deleted your own test chits directly from the Sheet (delete the rows).

**On the ceremony laptop (16 October)**
- [ ] Connected to the projector or TV at 16:9; browser zoom is 100%; **Fullscreen** (`F`) is on.
- [ ] Logged in to admin in **the same browser tab** you'll present from.
- [ ] Ran one **Test ceremony** on the projector itself to check the fire speed and the sound volume.
- [ ] Sound: toggled 🔊 **before** starting if you want it, and checked the laptop's audio output.
- [ ] Laptop power saving or sleep turned off; notifications muted.
- [ ] Stable internet connection, or a phone hotspot as backup (the burn itself needs no network).
- [ ] **🎬 Start ceremony** → confirm. This seals the box, so employees then see "sealed".
- [ ] Afterwards: the dashboard shows the **Burned** count, the Sheet shows `burned = TRUE` with timestamps, and every record is still there.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Could not reach the Ravan Box" on phones | Check `API_URL`, that the deployment allows **Anyone** access, and redeploy a **New version** after code edits. |
| Admin: "Could not reach the server" | Same as above. Also try opening the `/exec` URL in the browser. |
| Phones submit but admin shows nothing | One side is still in local mode. Make sure the deployed `config.js` has `API_URL`, then hard-refresh. |
| Ceremony says "log in on the admin page first" | Log in on `/admin/` in the same tab, then press Start or Test. |
| Need to run the ceremony again | Press `R` on the ceremony screen, or use **Reset ceremony** on the admin page. No data is lost. |
