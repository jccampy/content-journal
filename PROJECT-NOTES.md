# Project notes

**Paste this whole file into a Claude session to bring it up to speed on this project.**
Everything below is the context needed to make changes safely.

---

## What this is

A single-user content journal and idea calendar for **Julia**, an Atlanta lifestyle creator.

Her platforms and lanes:

- **TikTok** — Atlanta city content and lifestyle
- **Instagram** — food/restaurants, and home/lifestyle
- **Pinterest** — everything

The library is an **archive of footage she has already shot**. It is explicitly *not* a
production pipeline. The app's only job is finding new ways to reuse existing content:
new groupings, new angles, and the right month for each.

New content gets added continuously as she films, so every mechanism must tolerate the
library growing at any time. That's what the **Refresh** button is for.

---

## Architecture

Deliberately boring, for good reasons.

- **Plain HTML/CSS/JS. No build step, no framework, no bundler, no npm.**
- Scripts are ordinary `<script src>` tags in a fixed order, attaching to a global `CJ`
  namespace. **Not ES modules** — this is on purpose, so `index.html` also works when opened
  directly from disk with `file://`, which ES modules block.
- Hosted on GitHub Pages from a repo Julia controls. Static files only.
- **Storage is Supabase Postgres**, one `jsonb` row per user in `public.journals`, protected
  by row-level security scoped to `auth.uid()`. `localStorage` is now a **cache**, not the
  source of truth — it's what makes the app instant and offline-capable.
- Sync is optional: with no project configured the app runs local-only and everything still
  works. Never make a core feature require a signed-in account.

### Script load order (matters — do not reorder)

```
src/state.js       data model, local cache, every read/write helper
src/cloud.js       Supabase auth + conditional reads/writes
src/atlanta.js     Atlanta weather rhythm, 21 holidays, ~37 recurring events
src/themes.js      30 reuse recipes (the content "recipe book")
src/generator.js   the engine: library + calendar → dated ideas
src/ai.js          optional Claude enrichment
src/import.js      bulk-paste parser (pure — no DOM, no state writes)
src/ui-library.js  shared DOM helpers + library view + place form
src/gaps.js        derives "what to shoot next" — no stored state
src/monthly.js     per-month topic bank + coverage (planning layer)
src/voice.js       per-platform post briefs — pure, derived from idea + drop
src/ui-layers.js   add/edit a layer of footage
src/ui-import.js   the Quick add screen (paste → preview → import)
src/ui-week.js     This Week (the daily screen) + the content gap report
src/ui-calendar.js calendar view, reschedule, idea detail + the brief tabs
src/ui-monthly.js  the Monthly plan board
src/ui-events.js   custom events + built-in event toggles
src/ui-settings.js backup, platform routing, spacing rule, prefs, AI key
src/ui-sync.js     sync status chip + sync settings panel
src/sync.js        merge + conflict handling between device and cloud
src/app.js         boot, tab routing, render fan-out
```

`ui-library.js` defines `CJ.ui` (the shared `$`, `el`, `toast`, `tagEl` helpers), so it must
load before the other UI files.

### Two traps worth knowing

**Never wrap the tag widget in a `<label>`.** A `<label>` forwards any click
inside it to its first labelable descendant. Once a tag chip existed, that
descendant was the chip's ✕ remove button — so clicking the box, or a tag
suggestion, silently deleted the first tag. Symptom as reported: "it won't let
me add more than 3 tags, it replaces one of the others." The markup for
`#tag-input-wrap` is a `<div class="field">` and must stay one; there's a
comment in index.html saying so.

**`[hidden]` needs `display: none !important`.** Anything given an explicit
`display` (a `.btn`, a `.modal-backdrop`) ignores the `hidden` attribute
otherwise. That's how the modals once showed permanently and how the Clear
button sat there with nothing to clear. The global rule is at the top of
`styles.css` — don't remove it.

### A trap worth knowing

`CJ.state` is defined with `Object.defineProperty`, **not** inside the `Object.assign` block.
`Object.assign` invokes getters and copies their *value*, so a `get state()` in that object
would have permanently captured `null`. This cost real debugging time once. Don't undo it.

---

## Data model

### Item — a PLACE, which accumulates LAYERS of footage

```js
{
  id, name, type,            // type: 'restaurant' | 'experience' | 'home'
  neighborhood, tags: [], notes, link,
  layers: [ Layer, ... ],    // at least one, always
  platformUse: {             // per-platform history — this is what spacing reads
    tiktok:    { count, lastPosted },
    instagram: { count, lastPosted },
    pinterest: { count, lastPosted }
  },
  // derived by rollUp(item), never set directly:
  postCount, lastPosted, platforms, deadline, deadlineNote, priority,
  createdAt, updatedAt
}
```

```js
Layer {
  id, label,                 // "Fall patio visit", "New brunch menu"
  capturedAt, notes, tags: [],
  deadline, deadlineNote, priority,   // THIS clip's deadline, not the place's
  postCount, lastPosted, platformUse, retired,
  createdAt, updatedAt
}
```

**A place is permanent; footage stacks under it.** Julia shoots the same restaurant repeatedly
and needs to log new material without overwriting the old — "Add footage" appends a layer.
Editing the place edits name/tags/neighborhood/notes; editing a layer edits that one clip.

`rollUp(item)` recomputes the place-level totals from its layers. Call it after any layer
change. `upsertItem` deliberately preserves `layers` and `platformUse` when patching — dropping
them was a bug once.

There is **no status field**. An earlier version had `idea/filmed/ready/posted`; Julia removed
it — everything in the library already exists. Don't reintroduce it.

### Idea — one CONCEPT, which fans out into DROPS

```js
Idea {
  id,                        // DETERMINISTIC — see below
  date,                      // = earliest drop date; derived, for sorting
  source,                    // 'theme' | 'occasion' | 'deadline' | 'ai'
  themeId, title, blurb, format,
  itemIds: [], hooks: [], captions: [],
  occasion, deadlineFor, status, pinned, touched, priority, notes,
  drops: [ Drop, ... ]
}

Drop {
  id,                        // `${ideaId}::${platform}`
  platform,                  // 'tiktok' | 'instagram' | 'pinterest'
  format,                    // 'video' | 'reel' | 'carousel' | 'photo' | 'pins'
  date,
  itemIds: [],               // may be a SUBSET — spacing is checked per platform
  layerByItem: { itemId: layerId },   // which clip to use for each place
  linksTo,                   // pinterest → the platform whose video it points at
  status, pinned, touched, notes
}
```

**One concept does not go live everywhere at once.** Julia spreads a concept across platforms
over several days, so the calendar renders *drops*, not ideas. `CJ.getDrops()` flattens them;
`CJ.getDrop(id)` and `CJ.updateDrop(id, patch)` are the write path. Plan/dismiss/reschedule all
operate on a single drop and leave its siblings alone.

`normalizeIdea()` in state.js back-fills drops for any older idea that only had
`date` + `platforms`, so existing calendars survive the upgrade.

**Idea IDs are deterministic**, e.g. `theme:best-patios:2026-09` or `occ:dogwood:2026`. This is
what makes refresh idempotent — the generator recognises an idea it already made and leaves the
user's version alone. Never switch these to random IDs.

### Tag categories

Tags are auto-filed into `neighborhood | vibe | occasion | feature | other` by
`guessCategory()` in `state.js`, using a keyword list plus a list of ~40 real Atlanta
neighborhoods. The category only drives the tag's colour. Users can override it.

---

## The generator — invariants

`generate()` in `src/generator.js` runs in a strict order. Preserve it.

1. **Keep what the user touched.** Any idea that is pinned, touched, non-`suggested`, or
   AI-sourced survives refresh untouched. Everything else is regenerated. This is the whole
   reason refresh is safe to press.
2. **Deadlines first.** Placed ~5 days before due; overdue ones jump to now. They outrank the
   spacing rule but still book their dates.
3. **Dated occasions.** Holidays, Atlanta events, and the user's own events, each with lead
   time so the post lands *before* people need it. Capped at ~45% of a month's slots so a
   festival-heavy month doesn't crowd out everything else.
4. **Themes fill the rest**, scored by how well the library matches and how due its items are.

### The spacing rule (hard floor — PER PLATFORM)

The same place may never appear in two posts **on the same platform** closer than its minimum
gap. **Default 30 days, per content type, in `settings.minGapDays`.**

Per platform is deliberate: an Instagram reel and a Pinterest pin about the same restaurant in
the same week are fine — different audiences, and that cross-posting rhythm is the whole point
of the rollout. Two Instagram posts about it 14 days apart are not.

- Enforced through `makeSpacer()`, keyed on `itemId|platform`, seeded from every item's
  `platformUse[p].lastPosted` **and** every kept drop's date. Real history counts.
- **Date is chosen before items** in both the occasion and theme paths, precisely so the rule
  can be applied. If you refactor either path, keep that order — reversing it silently
  disables the rule.
- Themes try up to 6 candidate dates before giving up on a placement.
- It is a *floor*, not a preference — no score outweighs it. The separate
  `repostCooldownDays` (default 120) is the soft preference that only biases scoring.

**Consequence to remember:** this makes library size a hard ceiling on posting frequency.
23 items at a 30-day gap tops out around 30–35 posts over 6 months. When months come up short
the refresh banner says so explicitly (`stats.shortBy` / `stats.shortMonths`). That messaging
exists so a thin calendar never reads as a bug — keep it if you touch this area.

### Manual moves

`conflictReport()` / `conflictsAt(dropId, date)` detect violations the *user* creates by
rescheduling. **Both are keyed by DROP id, not idea id**, and compare within a platform.
Rescheduling deliberately does **not** block — it warns, and flags the card with a red ⚠.
The rule constrains the generator, not the person.

### Rollout (`buildDrops` in generator.js)

`settings.rollout` = `{ leadBy: {type→platform}, gapDays, pinterestLast }`.

- The lead platform is chosen from the **dominant content type** among the chosen places:
  food leads on Instagram, Atlanta/lifestyle leads on TikTok. Julia's call.
- Others follow `gapDays` apart (default 2).
- **Pinterest is always last** — those pins link back to the video, so the video has to exist.
  The drop carries `linksTo` naming that platform.
- Each drop re-filters its own `itemIds` against the spacing rule for its own platform and
  date, and a platform is skipped entirely if more than half the line-up is still resting there.

### Per-place platform fit

`item.platformFit` = `{ tiktok|instagram|pinterest: 'auto'|'yes'|'no' }`.

`auto` follows `settings.platformRules` for the type; `yes` forces it in; `no` keeps the place
off that platform entirely. `CJ.itemAllowsPlatform(item, platform)` is the single check —
`platformsFor()` uses it to decide which platforms a concept can reach, and `buildDrops()` uses
it again per drop, so a place marked "never on Instagram" is dropped from the Instagram post
while staying in the TikTok one. Not all content belongs everywhere; forcing it is worse than
a missing post.

### Formats

`formatFor(platform, count, theme, settings)`:

- Pinterest → `pins` (one per place, linking to the video)
- TikTok → `video`
- Instagram → `carousel` when `count >= settings.carouselMinItems` (default 5), else `reel`

Julia posts static carousels when she has 5–8 places to feature together, reels for tighter
groups. Every drop's format is editable in the idea detail view.

### Matching must never invent a line-up

`searchBag(item)` gathers tags + neighborhood + name + **notes** + every layer's label, notes
and tags. Themes and occasions match against all of it — Julia's notes are how she tells the
app what a place is for, so they have to be searchable.

`neighborhoodsIn(text, known)` catches occasions whose angle names a neighborhood. When one is
named, places outside it are **hard-filtered out**. If nothing genuinely matches, the occasion
is skipped rather than padded with unrelated places — a "downtown guide" full of West Midtown
spots is worse than no post at all. (This was a real bug; don't restore the old fallback.)
Custom user events are the one exception: they stay on the calendar as a date to plan around,
with no places attached and a note saying what to tag.

---

## Platform routing

`settings.platformRules` maps type → platform, defaulting to Julia's actual lanes:

| | TikTok | Instagram | Pinterest |
|---|---|---|---|
| restaurant | | ✓ | ✓ |
| experience | ✓ | | ✓ |
| home | ✓ | ✓ | ✓ |

Plus one rule in code: ideas with `format: 'guide'` or `'vlog'` also get TikTok, because an
itinerary is Atlanta lifestyle content regardless of what's on the list. Plain roundups don't.

---

## The AI layer (optional)

`src/ai.js` calls the Anthropic API **directly from the browser** with
`anthropic-dangerous-direct-browser-access: true`. The key lives only in `localStorage`, never
in the repo. Default model `claude-sonnet-5`.

**The app is fully functional without it** — this was a deliberate call. Julia originally asked
for live AI generation, but a public static site can't hold an API key safely, so the built-in
Atlanta engine does all the real work and AI is an additive extra. Keep that property: never
make a core feature depend on a key being present.

---

## Backup

An escape hatch now, not the safety net. Export shows the JSON as **copyable text as well as a
file download**,
because the artifact viewer and many in-app mobile browsers block downloads outright. Import
accepts a file or pasted text, and offers merge (newest `updatedAt` wins per item) or replace.

If you add anything to the data model, check `normalizeItem()` and `migrate()` in `state.js` —
they backfill defaults so old backups keep importing.

---

## Testing

Two Playwright suites.

`test/sync-test.js` runs a fake Supabase and two independent browser contexts to cover the
cases that actually lose data: sign-in adoption, concurrent edits from two devices,
last-write-wins on the same item, decisions beating suggestions, offline queue-and-flush, and
full recovery on a wiped browser. **Run this after any change to sync.js or cloud.js.**

`test/handoff-test.js` covers the setup-link handover to a second device.

`test/planning-test.js` covers refresh preservation, event geography, the
monthly plan and the briefs. **Run this after any change to generator.js,
atlanta.js, monthly.js or voice.js.** The refresh assertions are the ones that
matter: they plan, post, move and dismiss, refresh twice, and check that
nothing a decision touched moved by so much as a day. A no-in-area-place leak
check would have caught the original Dragon Con bug.

`test/library-test.js` covers the library view and the tag input. **Run this
after any change to ui-library.js.** Half its assertions exist for the
label-forwarding bug above — they click the box, click a suggestion, and check
that nothing disappeared.

`test/import-test.js` covers Quick add: all three paste shapes, loose date parsing, duplicate
detection, and the merge rules. **Run this after any change to import.js.** The parser is
deliberately lenient, and lenient parsers drift — the assertions pin down both what it must
recognise and what it must never do (swallow trailing commentary as notes, overwrite existing
notes on a merge, silently drop a date it couldn't read).

`test/browser-test.js` covers the full flow: empty state, seeding,
adding with tags and deadlines, tag filtering, grouping, sorting, generation, plan/dismiss
persistence across refresh, platform routing, custom events, the spacing rule (verified at both
30 and 90 days), reschedule, conflict detection, backup round-trip, reload persistence, and
mobile overflow.

```bash
npm install playwright
node test/browser-test.js
node test/sync-test.js
node test/import-test.js
node test/library-test.js
node test/planning-test.js
```

It starts its own static server and blocks the weather API for determinism. **Run it after any
change to the generator** — the spacing assertions are the ones that catch real regressions.

---

## The library view

Two densities, toggled in the filter bar and stored as `settings.libraryView`
so the choice syncs rather than being per-browser:

- **rows** (default) — a seven-column grid, ~44px tall. About 22 places on a
  1280×1400 screen against 9 for cards.
- **cards** — the older layout, still there for browsing.

**One filter bar.** Type, Reuse and Tags are popover buttons (`.fpop` >
`.fbtn` + `.pop-panel`); sort, group, the density toggle and Clear sit inline.
The tag popover holds *every* tag grouped by category with its own search box,
so an 80-tag library no longer pushes the content below the fold. Whatever is
active shows as removable chips in `#active-filters` underneath.

Popover mechanics: a click inside `.pop-panel` calls `stopPropagation` so the
document-level close handler doesn't fire — filtering is a repeated action, you
should be able to pick three tags without reopening. On mobile the panel
anchors to the whole bar (`.fpop { position: static }`) instead of to its
button, so one opened from a right-hand button can't hang off screen.

**What a row shows, and why.** Beyond name/neighborhood/tags:

- `platformDots()` — T / I / P, lit when `itemAllowsPlatform` passes, dimmed
  when it doesn't, ringed when the spacing rule is still blocking it. Letters,
  not the platform emoji: at 18px three emoji are indistinguishable smudges.
  This is the only place the per-place platform fit is visible at a glance.
- `nextFreeAny()` — the date the spacing rule lifts, in the subline. The rule
  was already being enforced silently; a place that looks available but isn't
  was mystifying.
- The soonest deadline across all its clips, as a pill.
- Clip count, which expands the row into a detail panel with notes, fit and the
  full footage strip.

In cards, the footage strip now renders only when `layers.length > 1` or a clip
carries a deadline. It used to appear on every card saying the same thing.

---

## Refresh: what it may and may not touch

This is the invariant the whole calendar rests on, and it is easy to break
silently. A refresh sorts every existing idea into one of three buckets:

| Bucket | Test | What happens |
|---|---|---|
| **Locked** | planned / done / pinned / touched, or any drop is | Passed through byte-identical. Not re-dated, not re-cast. |
| **Dismissed** | `isDismissed()` — status, or every drop dismissed | Kept as a tombstone for 400 days so its deterministic id can never regenerate. Does **not** hold its date and does **not** count toward the month quota. |
| **Live** | everything else | Free to be regenerated and moved. |

Deciding on ONE platform locks the whole concept — planning the Instagram drop
must never wipe the Pinterest one.

**A dismissal has to free its slot.** That was the bug: a dismissed idea still
counted in `keptPerMonth` and still reserved its date, so saying no just left a
hole in the month. Now `freedSlots` is counted, the date is released, and
`rejectedThemeInMonth` multiplies that theme's score by `0.18^n` in that month
so the replacement isn't the same post with one place swapped. The refresh
banner reports locked / dismissed counts, because "will this undo my work" is
the only real question anyone has about that button.

Date anchoring is what makes "move things around, but not the dated ones" work:
occasion and deadline ideas derive their date from the occasion, so a
regenerated Dragon Con post lands on Dragon Con weekend again. Theme ideas
float freely inside their month.

---

## Event geography — the rule that must not be relaxed

Events have an `area` in `atlanta.js` (`['downtown']`) and, for the disruptive
ones, `crowds: true`. A post about an event may only be built one of two ways:

- **`in-area`** — every place is inside the event's area. Needs ≥2.
- **`escape`** — only for `crowds: true` events with <2 in-area matches and ≥3
  places elsewhere. The title, blurb and hooks all name the avoidance
  ("Skip Downtown during Dragon Con — go here instead"), so the geography is
  the point of the post rather than a mistake in it.

If neither holds, the date is skipped and pushed onto `stats.areaSkipped`,
which the refresh banner prints by name.

**Do not fall back to "use whatever's in the library".** That is exactly what
produced a Dragon Con guide full of Buckhead and Battery spots. `area` is
consulted before any tag matching and is not conditional on the user happening
to have content there — the earlier version derived the area from
`allNeighborhoods()`, so an area she had no content in silently became "no area
constraint", which is precisely backwards.

`coverageDetail()` reuses the same rule so My Events shows the number that will
actually be scheduled, and labels the escape case rather than showing a zero.

---

## Post briefs (`voice.js`)

`brief(idea, drop)` is pure — same inputs, same output, nothing stored — so the
guidance stays correct when a line-up or date is edited.

Each brief carries: what the post physically is, who sees it, the **thread**
(why these places belong in one post, derived from shared tags / one
neighborhood / the occasion, and honest when there isn't one), a
platform-appropriate title, phrasing rules, length, a beat-by-beat structure,
each place's role, caption/CTA/avoid, and `difference` — what makes this
platform's cut different from its siblings.

The three platforms are modelled as genuinely different jobs, not one post
reposted: TikTok is spoken and opinionated, Instagram is composed and
saveable, Pinterest is **searched** (title reads like a query, one pin per
place, no personality). If you ever find yourself making these more similar,
that's the bug.

---

## Monthly plan (`monthly.js`)

Topics, not themes. A theme is a recipe the generator runs against the library
now; a topic is a thing worth making whether or not the footage exists yet.
`forMonth(m)` returns them with coverage attached (`ready` at ≥3 matches) and
`missing` — the needed tags nothing answers.

**On the word "viral":** nothing here is a live trend feed and it must never
pretend to be. A static file cannot know today's audio. What it ships is
recurring annual demand (pollen season, the first warm day, Friendsgiving,
newcomer season) and formats that travel because of platform mechanics
(ranking, head-to-head, the receipt post). The tab says this in the UI. Live
trends are what the ✨ AI ideas button is for.

Scheduling from a topic creates a `source: 'topic'` idea that is `pinned` and
`touched`, so it lands in the locked bucket immediately.

---

## Quick add (bulk import)

`src/import.js` is a three-stage pipeline, deliberately split:

| Stage | Does | Touches state? |
|---|---|---|
| `parse(text, defaults)` | text → records | no |
| `plan(records, opts)` | records → what would happen to each | reads only |
| `apply(rows)` | writes them | yes, in one `CJ.batch` |

The split is what makes the preview honest: the panel on the right of the modal renders the
output of the *same* `plan()` the import runs. There is no second code path that could
disagree with it.

**Three paste shapes, auto-detected** (`parse` decides, `mode` is reported back to the UI):

1. `blocks` — `Name:` / `Type:` / `Neighborhood:` / `Tags:` / `Notes:` records. This is what a
   written-up entry looks like, so a batch can be pasted straight in, markdown stars and all.
   A `---` line ends a record, which is what stops trailing commentary being read as notes.
2. `table` — one place per line, split on tab or `|`. Tab-split is what a spreadsheet paste
   looks like. A header row is detected and mapped; otherwise the order is positional:
   `Name | Neighborhood | Tags | Notes`.
3. `names` — bare names, one per line. `Bacchanalia — Westside` and `Miller Union (Westside)`
   read the suffix as the neighborhood.

**Rules that must not be loosened:**

- A date that can't be parsed produces `null` **plus a warning on the record**, shown in the
  preview. Never guess at one. A date that quietly vanishes is worse than one called out.
- Merging never overwrites. New tags fold in; blank fields get filled; **existing notes are
  never replaced** — new notes stack as another layer, the same rule as editing by hand.
- `Platforms: instagram, pinterest` sets the unnamed platforms to `'no'`. Naming some means
  excluding the rest, which is the only reading that makes the field worth having.
- Duplicate key is `slug(name) + '@' + slug(neighborhood)`, so the three Henri's locations
  stay three places while a re-paste of the same one is caught.

`CJ.batch(fn)` in `state.js` defers save + re-render to a single commit at the end. Forty
places added one at a time would otherwise save and re-render forty times. It commits even if
`fn` throws, so a half-finished import is written down rather than lost.

`apply()` returns `newIds`, which powers the Undo button in the result panel. Undo only ever
deletes places the import created — anything merged into a place that already existed stays.

---

## Decisions already made (don't relitigate without asking)

| Decision | Why |
|---|---|
| No footage/production status | Everything in the library is already shot. Julia removed it explicitly. |
| Bulk import previews before writing | Bulk actions are the ones you can't eyeball afterwards. Preview + Undo, always. |
| A refresh never touches a decision | Julia: planned/added things "should stay where they are". The button is useless if it's scary. |
| A dismissal frees its slot | Saying no should produce something else, not a gap. |
| Event posts are geographically coherent | Julia: "you should not talk about an event in the area and suggest spots in another area." |
| No fake trend data | The app cannot know today's audio. Recurring annual demand is real and predictable; "trending now" from a static file would be a lie. |
| Places hold layers, rather than one row per clip | She shoots the same place repeatedly and wants to add material without rewriting what's there. Spacing is about the place; freshness is about the clip. |
| Spacing per platform, not global | Blocking a Pinterest pin because of an Instagram post would break the cross-posting rhythm. |
| Skip an occasion rather than pad it | A wrong line-up is worse than a missing post. |
| Supabase over localStorage | Julia rejected a weekly manual-backup routine outright, and she was right — a chore isn't a storage system. Browser storage was the wrong foundation. |
| Local cache kept alongside the cloud | The app must never block on the network, and must work with no signal. |
| No build step | She edits via the GitHub web UI. A build step would break that. |
| AI is optional, never required | A public static site can't hold an API key safely. |
| Spacing rule warns on manual moves rather than blocking | She's the editor; the tool advises. |
| Approximate event dates marked `~` | Festival dates shift yearly. Better to flag than to state a wrong date confidently. |

---

## Sync — how it actually works

`src/sync.js`. Read this before touching it; the failure mode is silent data loss.

- Local write first, always. Push is debounced ~2.5s. The UI never waits on the network.
- **Every push is read-merge-write**, unconditionally. An earlier version skipped the merge
  when the remote timestamp matched what it last saw; that optimization dropped a device's
  edits whenever the bookkeeping drifted. Don't reintroduce it.
- **Writes are conditional** (`PATCH ...&updated_at=eq.<seen>`). Zero rows updated means
  another device wrote first — `attemptPush()` re-reads, re-merges, and retries with backoff,
  up to 5 tries. Without this, two devices saving in the same instant both read the old copy
  and the second write erases the first one's entries. This was caught by `test/sync-test.js`,
  not by reasoning about it.
- Merge rules in `mergeDocs()`: items by newest `updatedAt`; events unioned; **ideas by
  `ideaWeight()`, so a decision (done > planned > dismissed > pinned > touched) always beats an
  untouched suggestion**; settings from whichever document is newer overall.
- Background pull every 90s, on tab focus, and on `online`. Those listeners are attached
  unconditionally and guarded inside — attaching them only when already signed in meant a
  first-time sign-in had no background sync until reload.

## Upgrade paths

**Multi-user (a real project).** The auth and the `user_id` scoping already exist — two accounts today would already have
fully separate, private libraries. What's left: a sign-up flow that doesn't involve pasting
API keys, per-user platform lanes, and generalising
`src/atlanta.js` from one hardcoded city into a selectable city calendar. The generator already
takes the library and the city calendar as *inputs* rather than assuming either, so the engine
itself survives the change. Budget for onboarding, a tag taxonomy that isn't Atlanta-specific,
and per-user platform rules.

**Downloadable exports inside the Claude artifact.** The artifact preview blocks file
downloads; the copy-to-clipboard path exists because of that. If it ever matters, the
`downloads` artifact capability is the supported route.

---

## This Week + gaps

`ui-week.js` is the daily screen and the default landing view once a calendar exists: slipped
posts, then the next seven days grouped by day, each with a **Copy it all** button (hook +
caption + place list + which clip to use) and a one-tap **Posted**.

Underneath, `gaps.js` derives what the library *can't* reach:

- Atlanta dates below the coverage threshold, and the angles several of them share
- Themes one or two places short of firing
- Neighborhoods under 3 places (a guide needs 3)
- Untagged / thin / neighborhood-less places, and places run 4+ times with nothing unused left

All derived, nothing stored. It exists because the honest consequence of "never invent a
line-up" is that the app has to tell you what's missing instead.

## Current state

- Lives at `github.com/<julia>/content-journal`, served by GitHub Pages.
- A Claude artifact copy exists as a preview. **Separate storage from the GitHub version** —
  they never share data except through export/import.
- Sync is on via her own free Supabase project. No backup routine — she explicitly rejected
  one, and the database makes it unnecessary.
- Sample data (23 real Atlanta places) is in `ui-settings.js` under `SAMPLE`.
