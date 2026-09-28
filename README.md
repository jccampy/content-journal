# 🍑 Content Journal

A personal content journal and content-idea calendar for an Atlanta lifestyle creator.

A home for content you've **already shot**. Everything you film goes in once, tagged
(neighborhood, good patio, date night — whatever you want). From then on the app's job is
finding you new ways to run that footage again: fresh groupings, fresh angles, and the right
month for each one, built around Atlanta's weather, holidays, and real events.

It is not a production tracker. There is no "filmed / editing / ready" pipeline. Everything in
here exists already — the only question the app asks is *what still has life left in it*.

Static site, no build step. Works the moment you open it, and once you turn on sync your
library lives in a real database instead of a browser — see **SUPABASE-SETUP.md**.

---

## What it does

**Overview** — The first screen. What's going up this week (and anything that slipped),
what you've posted lately, how many clips have never been used, the next six posts, the
platform mix for the next 30 days, the places most ready to use right now, the collections
with the most left in them, and a short "what to shoot next". Empty library? It's the
getting-started screen instead.

**Collections** — Switch the Library from *Places* to *Collections* to see your content by
**location** (every neighborhood), **subject** (any tag on two or more places: date night,
patio, cozy, hosting…) and **type**. Each one shows how many places and clips it holds, how
many clips were never posted, how many places are free to use today, and what's already
coming up. **Browse** filters the library to it; **Plan this** builds a plan from it.
Nothing to maintain: tag a place and it joins its collections on its own.

**Place journal** — The 📖 on any place. Its whole story in order: which platforms it's
free on, every post coming up, then every shoot and every post, newest first, including
history from before the calendar existed.

**Build a plan** — One screen: how far ahead (this month to 12 months), how busy (light,
steady, busy), which days you post, and optionally **build from one collection** so the
plan is all Old Fourth Ward, or all date night. It runs the normal refresh, so anything you
planned, posted, moved or pinned stays put. A scoped plan is thinner by nature (the spacing
rule caps how often the same few places can run) and it tells you so.

**Drag to reschedule** — In the calendar's Grid view, drag a post onto another day. It's
pinned there, only that platform moves, and you're warned if it lands too close to another
post about the same place.

**On your phone** — The sections live in a bottom bar, one thumb-tap each.

**Quick add** — The fast way to fill the library. Hit **⚡ Quick add**, paste a list, and it
works out the shape on its own. Three shapes all work:

```
Name: Le Bon Nosh                          ← full write-ups, blank line between each
Neighborhood: Buckhead
Tags: french, coffee, wine bar
Notes: Market and wine bar in The Irby.
Platforms: instagram, pinterest             ← naming some excludes the rest

Bacchanalia | Westside | date night | Book ahead     ← one per line
Ponce City Market | Old Fourth Ward | food hall

Fox Bros Bar-B-Q                            ← or just names
Piedmont Park — Midtown                     ← the suffix reads as the neighborhood
```

A spreadsheet paste works too — copy the cells, paste, and a header row is mapped by name.

Everything shows in a **preview before anything is saved**, marked `new`, `update` or `skip`,
with duplicates against your existing library already worked out. A date it can't read is
flagged rather than quietly dropped. Merging into a place you already have never overwrites
anything: new tags fold in, and new notes stack as another layer of footage. After it runs
there's an **Undo** that removes only what it just added.

**Monthly plan** — What a month is *for*, above the day-to-day calendar. Each
topic says why it works now, which lane and platforms it belongs to, and whether
your library can already make it or what you'd have to shoot first. Put one on
the calendar and it lands pinned, so a refresh can't move it. Not a live trend
feed — nothing here knows today's audio. What it does know is the shape of the
year: pollen season, the first warm day, graduation dinners, newcomer season,
Friendsgiving, leaf season — plus the formats that travel on their own mechanics
(ranking beats listing, head-to-head beats a roundup, real numbers travel).

**How to make each post** — Open any idea and there's a tab per platform. Each
one tells you what the post physically is, why those places belong together, the
hook or search title, how to phrase it, how long it should be, a beat-by-beat
structure, what each place is doing in it, and what makes that platform's version
different from the others. The three are treated as different jobs rather than
one post reposted three times: TikTok is spoken and opinionated, Instagram is
composed and saveable, Pinterest is *searched* — its title reads like a query,
one pin per place, personality stripped out.

**Refreshing is safe** — Anything you planned, posted, moved or pinned comes
through a refresh untouched. Anything you dismissed never comes back, and its
slot is refilled with something genuinely different rather than the same theme
reshuffled. Only live suggestions move, and dated ones stay anchored to their
date. The banner after a refresh tells you exactly what it left alone.

**Library** — Two densities: compact **rows** (the default — about 22 places on
screen) or **cards**, switched with the ▤ / ▦ buttons and remembered across your
devices. Each row carries three letters — **T / I / P** — showing which platforms
that place is cleared for: lit means yes, faded means no, ringed means the
spacing rule is still blocking it, in which case the date it frees up is printed
underneath. One filter bar holds everything: Type, Reuse and Tags open as
panels (the tag panel has its own search box and lists every tag grouped by
kind), with sort, grouping and the density toggle inline. Active filters appear
as chips you can click to drop.

Every entry is a **place**, and footage stacks under it. Add a place once with
its type, neighborhood, tags and notes; then every time you shoot there again, hit **＋ Add
footage** to log another clip alongside the old ones. Nothing gets overwritten. Each clip
carries its own notes, its own usage history, and its own "needs to go up by" date. Every tag is
clickable: click one anywhere in the app and the library filters to it. Filter by several at
once with **Any** or **All** matching, then sort (most ready to reuse / most reused / least
reused / recently added / deadline) and group (type / neighborhood / reuse readiness / tag).

**Reuse readiness** — Each piece of content sits in one of three buckets, and you can filter
by any of them:

- ✨ **Never used** — you have it and have never posted it. Highest priority everywhere.
- ♻️ **Ready to reuse** — either enough time has passed (120 days by default, adjustable), or
  you've added footage of it you've never posted.
- 🕐 **Recently used** — inside that window, so the generator holds it back.

The **times posted** counter climbs on its own every time you mark a post done, so the
generator can tell the difference between a place you've run once and one you've run five
times. Both might be a year old; only one is still fresh.

**The spacing rule** — A hard floor: the same place is never scheduled into two posts **on the
same platform** closer together than its minimum gap. **30 days by default**, set per content
type in Settings.

Per platform is the point: a reel and a pin about the same restaurant in the same week are
fine, because that's the rollout working. Two Instagram posts about it two weeks apart are not.

It counts your real posting history too, not just the calendar — if you actually posted about
a restaurant on Instagram on the 3rd, nothing featuring it on Instagram can land before the
2nd of the next month. Unlike
the reuse cooldown (a preference the scoring can outweigh), nothing overrides this. Deadlines
are the one exception: a deadline post is placed regardless, and then blocks everything else
around it.

If the rule leaves slots unfilled, the refresh message says so in plain language rather than
quietly handing you a thin month. Two ways to fill them: add more content, or shorten the gap.

**Reschedule** — Every post has a **📅 Move** button, and it moves *just that platform* —
your Instagram carousel can shift a week while the TikTok stays put. Pick a date, or use the quick
shifts (−1 week, +3 days, +1 week, +2 weeks, +1 month). As you change the date it tells you
live whether the new slot breaks the spacing rule, naming the exact place and the post it
collides with. You can move it anyway — the rule constrains the generator, not you — and any
post that ends up too close gets a red ⚠ badge on the calendar so it never slips by unnoticed.

Rescheduling pins the post, so refreshes leave your choice alone.

**Deadlines** — When you add something, tick *"This needs to go up by a certain date"*. The
generator places those posts first, about five days before they're due, and flags anything
overdue in red. Use it for brand deliverables, a seasonal menu about to change, anything with
a shelf life.

**Calendar** — Hit **↻ Refresh** and it builds a dated plan across the next 3, 6, or 12
months from three layers:

1. **Deadlines** — anything time-sensitive, scheduled before it's due.
2. **Real Atlanta dates** — 21 holidays and ~37 recurring Atlanta events (Dogwood Festival,
   Shaky Knees, Peachtree Road Race, Pride, Dragon Con, Garden Lights, peach season, North
   Georgia leaf season…), each with lead time so you post *before* people need it.
3. **Seasonal themes** — 30 reuse recipes matched to your tags and the month's weather. Patio season
   opens in March. Frozen drinks in July. The first-cold-day list in October. Holiday hosting
   in November.

Every idea shows the theme, the exact places from your library that go in it, the platform,
3 hooks, and 3 caption starters. Nothing is invented — it only ever suggests footage you
actually have.

**Platforms** — Ideas are routed automatically:

| | TikTok | Instagram | Pinterest |
|---|---|---|---|
| Restaurants / food | | ✓ | ✓ |
| Experiences / Atlanta | ✓ | | ✓ |
| At home / lifestyle | ✓ | ✓ | ✓ |

Itineraries and day-in-the-life posts also get TikTok, since those are Atlanta lifestyle
content regardless of what's on the list. All of this is editable in Settings.

**This Week** — The screen you open day to day, and the default once you have a calendar:
anything that slipped, then the next seven days grouped by day. Each post has **Copy it all**
(hook, caption, place list, and which clip to use) and a one-tap **Posted** that logs it
against every place in it. Underneath sits **What to shoot next**.

**What to shoot next** — The flip side of never inventing a line-up: the app tells you what
it can't reach. Atlanta dates you don't have content for, the angles several of them share,
post types you're one or two places short of, neighborhoods under three places, and places
you've run into the ground.

**Where content works** — Some footage is a TikTok and simply isn't an Instagram post. Every
place has three toggles — auto, always, never — so you can keep something off a platform for
good. "Never" wins over every rule; the place drops out of that platform's post and stays in
the others.

**Rollout** — A concept doesn't go up everywhere at once. It rolls out over a few days: food
leads on Instagram, Atlanta and lifestyle lead on TikTok, and **Pinterest is always last**,
because those pins link back to the video. The calendar shows each platform as its own
colour-coded card, and moving one leaves the others where they are.

**Formats** — Instagram gets a **carousel** when there are 5 or more places to show and a
**reel** when it's a tighter group; TikTok gets **video**; Pinterest gets a set of **pins**,
one per place, each pointing at the video. Every format is editable per post.

**Refresh is safe** — Anything you've touched is left exactly where it is. Plan an idea,
change its date, mark it posted, dismiss it, or edit it, and refreshes will never move or
resurrect it. Only untouched suggestions get reshuffled.

**Recency** — Content you've never posted ranks highest, then whatever has gone longest
without a run on that platform, with a penalty for anything you've already used a lot. A place
with **unused footage** jumps back to ready even if you've featured it before — new material
is new material. Marking a post done logs it against every place in it, on that platform, and
against the specific clip it used.

**My Events** — Add your own key dates (a friend's opening, a trip, a brand deadline), with an
optional angle and tags so the generator matches the right content to them. Yearly repeats
supported. You can also switch off any built-in Atlanta event you never cover.

**Weather** — The calendar shows Atlanta's live 7-day forecast and flags the actual patio days.

**✨ AI ideas (optional)** — See below.

---

## Setting it up on GitHub

### The short version

1. Create a new **public** repository on GitHub called `content-journal`.
2. Upload every file in this folder to it.
3. Settings → Pages → Source: **Deploy from a branch**, Branch: **main**, folder: **/ (root)** → Save.
4. Wait ~1 minute. Your site is at `https://YOUR-USERNAME.github.io/content-journal/`.

### Step by step, using the GitHub website (no terminal)

1. Go to [github.com/new](https://github.com/new).
2. **Repository name:** `content-journal`
3. Choose **Public**. (GitHub Pages needs Public on a free account. See the privacy note below.)
4. Leave "Add a README" unchecked. Click **Create repository**.
5. On the next screen click **uploading an existing file**.
6. Drag in `index.html`, `README.md`, `.gitignore`, and the `assets` and `src` folders.
   Dragging the folders themselves keeps the structure — that matters, the paths have to stay
   `assets/styles.css` and `src/*.js`.
7. Click **Commit changes**.
8. Go to the repo's **Settings** tab → **Pages** in the left sidebar.
9. Under "Build and deployment", set Source to **Deploy from a branch**, branch to **main**,
   folder to **/ (root)**. Click **Save**.
10. Give it a minute, refresh the Pages settings screen, and your URL appears at the top.

Bookmark that URL on your laptop and add it to your phone's home screen.

### Step by step, using the terminal

```bash
cd content-journal
git init
git add .
git commit -m "Content journal"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/content-journal.git
git push -u origin main
```

Then do steps 8–10 above to turn on Pages.

### Updating it later

Edit the files and push again (or re-upload through the website). GitHub Pages redeploys in
about a minute. **Your data is not in the repo**, so updating the code never touches your
journal.

### Privacy note

A public repo means anyone who finds the URL can *view the app*. It does **not** mean anyone
can see your content — your journal lives in your own browser, not on GitHub. The repo only
contains the empty app. If you'd rather it not be public at all, GitHub Pages on private
repos requires a paid plan; the alternative is to just open `index.html` from your computer,
which works fine (see below).

---

## Running it without GitHub

Double-click `index.html`. It opens in your browser and works completely — the scripts are
plain files with no build step and no module loading, specifically so this works.

The catch is that a file opened this way lives at a different browser address than the hosted
version, so it keeps its own separate journal. Pick one home and stick with it; use export /
import to move between them.

---

## Your data

With **sync on** (see `SUPABASE-SETUP.md`, ~15 minutes, free), your library lives in a
Supabase Postgres database:

- ✅ Clearing your browser loses nothing
- ✅ New phone — sign in, it's all there
- ✅ Phone and laptop share one library, live
- ✅ Works offline; changes upload when you reconnect
- ✅ No manual backups

Your device keeps a local copy too, so the app is instant and fully usable with no signal.
That copy is a cache; the database is the source of truth.

**Without sync**, everything lives in `localStorage` on the one device — which works, but is
per-browser and gone if you clear your site data. That's the mode you start in, and it's
exactly why sync is worth the fifteen minutes.

**Manual backup** (Settings → Manual backup) still exists either way, as an escape hatch:
it shows the whole journal as text you can copy anywhere, and imports from a file or pasted
text. With sync on you shouldn't need it.


---

## ✨ AI ideas (optional)

The calendar generates everything on its own, offline, forever. The AI button is an extra: it
asks Claude to write fresh themes, hooks and captions from your actual library.

To turn it on, put an [Anthropic API key](https://console.anthropic.com) into Settings.

**About the key.** It's stored only in your browser's local storage, exactly like your
journal. It is never committed to the repo and never sent anywhere except directly to
Anthropic's API from your own browser.

That said — this is a public web page, so treat the key like a password: don't add it on a
shared or public computer, and if you ever paste it somewhere by mistake, revoke it at
console.anthropic.com and generate a new one. Usage is billed per call; each "AI ideas" run
costs a fraction of a cent on Sonnet.

If you skip this entirely, nothing breaks. The ✨ button just tells you to add a key.

---

## Files

```
index.html            the whole UI
assets/styles.css     styling
src/state.js          data model, local cache, export/import
src/cloud.js          Supabase auth + reads/writes
src/sync.js           merge + conflict handling between device and cloud
src/atlanta.js        Atlanta weather rhythm, holidays, recurring events
src/themes.js         the 30 seasonal content recipes
src/generator.js      the engine that turns library + calendar into dated ideas
src/ai.js             optional Claude enrichment
src/import.js         the bulk-paste parser behind Quick add
src/ui-*.js           the views
test/                 automated browser tests
src/app.js            boot + tab routing
```

To add your own recurring theme, copy an entry in `src/themes.js` — the comment at the top of
that file explains each field. To change Atlanta's event list, edit `src/atlanta.js`.

Event dates marked `approx: true` show a `~` in the app: they're the usual weekend for that
festival, not a confirmed date. Confirm the official date before you post about it.
