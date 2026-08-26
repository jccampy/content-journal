# Putting your Content Journal on GitHub

Start-to-finish, no terminal required. Budget about 15 minutes.

---

## ⚠️ Read this first — about the private repo

You picked **private repo + GitHub Pro ($4/mo)**. Before you pay, here's exactly what that
buys, because it is probably not what you're expecting:

| | Public repo (free) | Private repo + Pro ($4/mo) |
|---|---|---|
| Your **content** (restaurants, tags, calendar) | Never on GitHub. Lives in your own database. | Never on GitHub. Lives in your own database. |
| The **website** at your `.github.io` URL | Publicly reachable | **Still publicly reachable** |
| The **source code** | Anyone can read it | Hidden |
| Cost | $0 | $48/year |

**GitHub Pro lets you publish a site from a private repo, but the published site itself is
still public on the internet.** Making the *site* private (login required to view it) needs
GitHub Enterprise Cloud, which is an organization plan, not something a single person buys.

So the $4/month hides the source code and nothing else. Since the code is an empty app —
your library never touches GitHub — there's very little to hide.

**My honest recommendation: go public and save the $48/year.** Nobody can see your content
either way — it lives in your own Supabase database behind your own login, not in this repo.
If a stranger finds the URL, they get a blank journal and a sign-in box.

That said, it's your call, and the steps below work for both. Step 3 is the only difference.
If the idea of your code being readable bothers you, Pro is a perfectly reasonable $4.

---

## Step 1 — Create a GitHub account

Skip if you have one.

1. Go to **[github.com/signup](https://github.com/signup)**
2. Enter your email, pick a password, pick a username.
   - **Your username becomes part of your website address**, so pick something you're happy
     seeing: `julia-atl` gives you `julia-atl.github.io/content-journal`.
   - Lowercase, no spaces. Hyphens are fine.
3. Verify your email. GitHub will not let you publish until you do.

**Write your username down.** Every URL below depends on it.

---

## Step 2 — Unzip the project

1. Find `content-journal-repo.zip` in your Downloads.
2. Double-click it. You'll get a folder with these inside:

```
index.html            ← the app
README.md             ← how it all works
GITHUB-SETUP.md       ← this file
SUPABASE-SETUP.md     ← turning on sync (Step 9)
PROJECT-NOTES.md      ← technical notes for a future Claude session
.gitignore
assets/               ← folder (styles)
src/                  ← folder (the code)
test/                 ← folder (automated tests)
```

Leave everything exactly where it is. **The folder structure matters** — the app looks for
`assets/styles.css` and `src/state.js` at those exact paths. If those folders get flattened,
you'll get a blank white page.

---

## Step 3 — Create the repository

1. Go to **[github.com/new](https://github.com/new)**
2. **Repository name:** `content-journal`
3. **Description** (optional): `My Atlanta content archive and idea calendar`
4. Choose visibility:
   - **Public** — free, works immediately. ← recommended
   - **Private** — requires GitHub Pro for the site to publish. If you pick this, go to
     [github.com/settings/billing/plans](https://github.com/settings/billing/plans) and
     upgrade to Pro **before** Step 5, or Pages will refuse to turn on.
5. **Leave every checkbox unchecked.** Do not add a README, .gitignore, or license — you
   already have those, and adding them here creates a conflict you'd have to untangle.
6. Click **Create repository**.

---

## Step 4 — Upload the files

You'll land on a page that says "Quick setup — if you've done this kind of thing before."

1. Click the link **"uploading an existing file"** in the text.
2. Open your unzipped folder in a separate window.
3. Select **everything** — the files *and* the `assets`, `src`, and `test` folders.
   - Mac: click one item, then `⌘ + A`
   - Windows: click one item, then `Ctrl + A`
4. **Drag the whole selection** onto the GitHub upload area.
   - ⚠️ Drag the **folders themselves**, not the files inside them. GitHub keeps the folder
     structure when you drag folders. If you open `src` and drag the individual `.js` files,
     they land in the wrong place and the app breaks.
5. Wait for every file to finish uploading. You should see `assets/styles.css`, `src/app.js`,
   and about a dozen others listed.
6. Scroll to the bottom. In the commit message box type: `Initial version`
7. Click **Commit changes**.

**Sanity check:** your repo page should now show `index.html`, `README.md`, and the `assets`
and `src` folders. If you see loose `.js` files sitting at the top level, the drag flattened
your folders — delete them and redo step 4.

---

## Step 5 — Turn on GitHub Pages

This is what turns a folder of files into a real website.

1. On your repository page, click **Settings** (the ⚙ tab along the top — the repo's Settings,
   not your account settings).
2. In the left sidebar, scroll down and click **Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Two dropdowns appear. Set:
   - **Branch:** `main`
   - **Folder:** `/ (root)`
5. Click **Save**.

If you chose Private and see *"GitHub Pages is disabled"* or an upgrade prompt — that's the
Pro requirement. Either upgrade, or switch the repo to public under Settings → General →
scroll to the bottom → Change repository visibility.

---

## Step 6 — Wait, then open your site

The first build takes **1–3 minutes**. It is not instant, and a 404 in the first minute is
normal — don't panic and start changing settings.

1. Refresh the Settings → Pages screen after a minute.
2. A green banner appears: **"Your site is live at https://YOUR-USERNAME.github.io/content-journal/"**
3. Click it.

You should see the Content Journal with an empty library.

**Still 404 after 5 minutes?** Check the **Actions** tab of your repo. A green check means it
deployed. A red X means something failed — click it to see why. The usual cause is
`index.html` not being at the top level of the repo.

---

## Step 7 — Make it easy to get to

**On your laptop:** bookmark the URL. Name it something you'll recognize in a hurry.

**On your iPhone** (this is the one that matters — you'll add content on your phone):

1. Open the URL in **Safari** — not Chrome, not in-app browsers. Safari specifically.
2. Tap the **Share** button (square with an arrow, bottom center).
3. Scroll down and tap **Add to Home Screen**.
4. Name it `Content Journal`. Tap **Add**.

It now behaves like an app — full screen, its own icon, no browser chrome.

> **⚠️ Until you finish Step 9, storage is per-browser.**
>
> Before sync is on, the Home Screen app, Chrome on your phone, and Safari on your laptop each
> keep a **separate** journal. Pick one and stay in it until you've done Step 9.
>
> After Step 9 this stops mattering entirely — every device signs into the same library.

---

## Step 8 — Load your real content

1. Open the app. If you want to see how it behaves first, go to **Settings → Load sample
   data**, look around, then **Settings → Erase everything** before you start for real.
2. Hit **+ Add content** and work through your archive. For each one:
   - Name and type
   - Neighborhood
   - Tags — this is the part that does the work later. Be generous and be consistent:
     `patio`, `date night`, `good for groups`, `cozy`. The generator can only group by tags
     you actually applied, so a place with two tags will surface far less often than one with six.
   - Last posted + times posted, if you've used it before. Leave blank if you never have —
     never-used content ranks highest everywhere.
3. Once you have **20 or so in**, go to **Calendar → ↻ Refresh**.

Below about 15 items the calendar will look thin — that's the 30-day spacing rule doing its
job, not a bug. It fills out fast as you add more.

---

## Step 9 — Turn on sync (do this today)

Open **SUPABASE-SETUP.md** and follow it. Fifteen minutes, free, and it's the difference
between a library that lives in one browser and one that's genuinely permanent.

Until you do this, everything is stored only in whichever browser you're using — and the
warning in Step 7 about phone-vs-laptop being separate journals applies. Once sync is on, that
whole problem disappears: sign in anywhere and it's the same library.


---

## Updating the app later

When you want changes made, come back to Claude, and:

1. Paste in **PROJECT-NOTES.md** from the repo so the session is instantly caught up.
2. Say what you want changed.
3. You'll get updated files back.
4. On GitHub, go to the file you're replacing → the **✏️ pencil** icon → paste the new
   contents → **Commit changes**. For several files at once, use **Add file → Upload files**
   and drop the replacements in — same names overwrite cleanly.
5. Wait 1–2 minutes and hard-refresh the site (`⌘ + Shift + R`).

**Updating the code never touches your content.** Your library lives in your browser; the
repo only holds the empty app. Deploy as often as you like.

---

## Common problems

| What you see | What it means |
|---|---|
| 404 for the first minute or two | Normal. Wait. |
| 404 after 5+ minutes | `index.html` isn't at the repo root, or Pages isn't enabled. |
| Page loads but is unstyled — plain text on white | The `assets` folder didn't upload with its structure. Re-upload it as a folder. |
| Page loads but nothing works, no buttons respond | The `src` folder is missing or flattened. Same fix. |
| Your content vanished | Different browser, or site data was cleared. Import your backup. |
| Pages tab shows an upgrade prompt | Private repo without Pro. Upgrade or go public. |
| Changes don't show up | Browser cache. Hard-refresh with `⌘ + Shift + R`. |

---

## Scaling it up later

Sync across your own devices is already built (Step 9). The remaining path:

**Multiple creators** — same Supabase change plus login and a per-user data scope, and the
Atlanta calendar in `src/atlanta.js` becomes one city among several. That's a real project,
not an afternoon, but nothing in the current design blocks it: the generator already takes the
library and the city calendar as inputs rather than assuming either.

Neither is worth doing until you've lived with the single-user version for a while and know
what you actually want.
