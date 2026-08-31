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

## What's new in this update

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
