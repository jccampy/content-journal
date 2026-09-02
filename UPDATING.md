# Updating the app without breaking it

Every time you get a new zip, this is the routine. Five minutes.

**Your content is never at risk.** It lives in your Supabase database, not in this repo. The
repo only holds the empty app. You can break the website and fix it an hour later and your
library will be exactly where you left it.

---

## The one thing that goes wrong

GitHub's uploader keeps folder structure **only if you drag the folders themselves.**

- ✅ Drag the `src` folder → files land at `src/state.js`, `src/app.js` … correct
- ❌ Open `src`, drag the files inside → they land at `state.js`, `app.js` … **broken**

A flattened upload gives you a blank or unstyled page, because `index.html` looks for
`src/state.js` and finds nothing there. That's the failure you hit last time.

So: **upload the folders first, on their own.** It's much harder to get wrong that way.

---

## Step by step

### 1. Unzip

Double-click the zip. You get a folder containing:

```
assets/           ← folder
src/              ← folder
test/             ← folder
index.html
.gitignore
README.md
GITHUB-SETUP.md
SUPABASE-SETUP.md
UPDATING.md
PROJECT-NOTES.md
```

### 2. Upload the folders

1. Go to your repo on GitHub.
2. **Add file** (button, top right) → **Upload files**.
3. Open your unzipped folder in a separate window.
4. Select **only** `assets`, `src`, and `test` — the three folders, nothing else.
5. Drag those three onto the GitHub upload area.
6. Wait for the file list to appear. **Check it says `src/state.js` and `assets/styles.css`**,
   with the folder prefix. If you see bare `state.js`, you dragged the contents — reload the
   page without committing and start again.
7. Commit message: `Update app` → **Commit changes**.

### 3. Upload the loose files

1. **Add file** → **Upload files** again.
2. This time select the individual files: `index.html`, `.gitignore`, and the `.md` files.
3. Drag them over. Commit.

Same filenames overwrite the old ones cleanly. Nothing needs deleting.

### 4. Check it worked

1. Your repo's front page should show `assets`, `src`, `test` as **folders**, and
   `index.html` alongside them. No loose `.js` files at the top level.
2. Wait 1–2 minutes for GitHub Pages to rebuild.
3. Open your site and **hard-refresh**: `⌘ + Shift + R` on a Mac, `Ctrl + Shift + R` on
   Windows. A normal refresh will serve you the cached old version and make you think it
   failed.

---

## Reading the failure

| What you see | What it means | Fix |
|---|---|---|
| Plain text, no colours, no layout | `assets/styles.css` isn't where it should be | Re-upload the `assets` folder |
| Page loads but nothing responds | `src/` is missing or flattened | Re-upload the `src` folder |
| Completely blank white page | `index.html` isn't at the top level | Re-upload it on its own |
| Looks like the old version | Browser cache | Hard-refresh |
| 404 | Pages turned itself off | Settings → Pages → branch `main`, folder `/ (root)` |

**If two attempts don't fix it:** delete the repository (Settings → bottom of the page →
Delete this repository), create a new one with the **same name**, and upload once from
scratch. Same URL, clean slate, and it's genuinely faster than debugging a half-broken upload.
Then re-enable Pages: Settings → Pages → Deploy from a branch → `main` → `/ (root)`.

---

## After every update

Open the app and check the sync chip in the top right says **Synced**. If it says
**Local only**, the new files came up but your connection didn't — go to Settings → Sync and
sign in again. Your library is still in the database either way.

---

## Earlier update

**⚡ Quick add** — a new button in the top bar, next to **+ Add content**. Paste a whole list
of places at once instead of filling in the form one at a time.

After updating, check it's there:

1. Hard-refresh the site (`⌘ + Shift + R`).
2. You should see **⚡ Quick add** between the sync chip and **+ Add content**.
3. Click it, then **Show me an example** — a sample paste fills in and the preview on the
   right fills up. Don't press Add; just close it. If the preview stays empty, `src/import.js`
   or `src/ui-import.js` didn't upload — re-upload the `src` folder.

Two new files ship in `src/` (`import.js`, `ui-import.js`) and one new test in `test/`
(`import-test.js`). They come across with the folders in step 2, so there's nothing extra to do
— but if you're picking files out by hand for any reason, those are the ones that must be
there.

---

## Earlier update

**Two fixes and a rebuilt library page.**

**1. The tag bug is fixed.** Adding a 4th tag used to delete one of the first
three. The tag box was wrapped in a `<label>`, and a label passes any click
inside it to the first button it contains — which, once you had a tag, was that
tag's little ✕. So clicking the box to type again quietly removed a tag. You can
now add as many as you like, and there's a **＋** button next to the field so you
don't have to trust the return key on your phone. Typing `patio, rooftop, brunch`
in one go adds all three, and tapping away keeps what you typed instead of
throwing it out.

**2. The library page is reorganised.**

- **Rows instead of cards** — about 22 places on screen instead of 9. The
  ▤ / ▦ buttons in the filter bar switch between them, and your choice follows
  you to your other devices.
- **One filter bar** — Type, Reuse and Tags are now buttons that open a panel.
  The tag panel holds every tag, grouped, with a search box, so it stops eating
  the top third of the page. Whatever you've filtered by shows as chips
  underneath that you can click to remove.
- **Each row tells you more** — three letters (T / I / P) show which platforms
  that place is cleared for: lit means yes, faded means no, ringed means the
  30-day rule is still blocking it. When it's blocked you get the date it's free
  again. Deadlines show as a pill. The clip count opens the row for the detail.
- **Cards are lighter** — that "Original footage / unused" box no longer
  appears on every single card. It shows up when there's more than one clip, or
  when a clip has a date on it.

After updating, hard-refresh (`⌘ + Shift + R`) and check:

1. The library shows compact rows with T / I / P letters on the right.
2. Open **+ Add content**, type four tags. All four stay.
3. Click **Tags** in the filter bar — a panel opens with a search box.

If the rows look like plain unstyled text, `assets/styles.css` didn't upload.
If the Tags button does nothing, `src/ui-library.js` didn't. Re-upload that
folder.

One new test file ships in `test/` (`library-test.js`). It comes across with the
folder, so there's nothing extra to do.

---

## What's new in this update

**1. Refreshing is safe now.** Anything you planned, marked posted, moved or
pinned comes through a refresh exactly where you left it — same date, same
places, same platforms. Deciding on one platform protects the whole idea, so
planning the Instagram post never disturbs its Pinterest pins.

Anything you dismissed stays gone. It won't come back on any future refresh —
and, new in this update, its slot gets refilled with something genuinely
different rather than left empty or filled with the same theme wearing a hat.
The message after a refresh now says exactly what it left alone.

**2. Event posts stay in the right part of town.** Every Atlanta event now knows
where it physically happens. A post about it can only be built two ways:

- with places **inside** that area, or
- as an explicit **"skip it, go here instead"** post for the big disruptive ones

So Dragon Con with no downtown footage now produces *"Skip Downtown during Dragon
Con — go here instead"* featuring your Buckhead and Battery spots, and says why
in the description. It will never again call something a downtown guide and fill
it with Buckhead. Events it can't do either way are skipped and named in the
refresh message.

My Events now shows this per date: a match count, an "avoid-the-crowds angle"
badge, or "nothing in downtown" — so you can see what each date needs.

**3. New tab: Monthly plan.** What September is *for*, separate from what's on
the calendar. Each topic says why it works now, which platforms suit it, and
whether you can make it today or what to shoot first. "+ Put on the calendar"
adds it pinned. You can add your own topics too.

Being straight with you: this is not a live trend feed. Nothing in the app knows
what audio is trending today — anything claiming that would be making it up.
What it does know is the part of the year that repeats: pollen season, the first
warm day, graduation dinners, newcomer season, Friendsgiving, leaf season. Those
are predictable and worth shooting ahead of. For genuinely current trends, the
✨ AI ideas button is the one that asks Claude.

**4. Every post now comes with a brief.** Open any idea on the calendar and
there's a tab per platform under "How to make each one". Each gives you the
angle, why those places belong together, the hook (or, for Pinterest, the
searchable title), how to phrase it, the length, the structure beat by beat,
what each place is doing, and what makes that platform's version different from
the others. There's a "Copy this brief" button on each.

After updating, hard-refresh (`⌘ + Shift + R`) and check:

1. There's a **Monthly plan** tab between Calendar and My Events.
2. Open any calendar idea — you should see **How to make each one** with a tab
   per platform.
3. Hit **Refresh calendar** — the message should mention what it left untouched.

Three new files in `src/` (`monthly.js`, `voice.js`, `ui-monthly.js`) and one in
`test/` (`planning-test.js`). They ride along with the folders, so the routine
above is unchanged.
