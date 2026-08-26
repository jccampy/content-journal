# Turning on sync

**About 15 minutes, once. Free — permanently, at your volume.**

After this, your library lives in a real database instead of your browser. Which means:

- ✅ Clearing your browsing data doesn't lose anything
- ✅ New phone? Sign in, everything's there
- ✅ Phone and laptop share **one** library — add a place after you film, it's on your laptop
- ✅ Works offline; changes upload when you're back on signal
- ✅ No more exporting backups

Supabase is a hosted Postgres database with a generous free tier. Your journal is a few
hundred kilobytes. You will not come close to a paid plan.

---

## Step 1 — Create the project

1. Go to **[supabase.com](https://supabase.com)** → **Start your project**.
2. Sign in with GitHub (easiest, you already have an account) or an email.
3. Click **New project**.
   - **Name:** `content-journal`
   - **Database password:** click Generate, then **save it in your password manager**. You
     won't need it for this app, but you'll want it if you ever poke at the database directly.
   - **Region:** pick the closest US East option. You're in Atlanta.
   - **Plan:** Free
4. Click **Create new project** and wait ~2 minutes while it provisions.

---

## Step 2 — Create the table

1. In the left sidebar click **SQL Editor**.
2. Click **New query**.
3. Paste this in **exactly as-is**:

```sql
-- One row per person. The whole journal lives in the `data` column.
create table if not exists public.journals (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row Level Security: without these policies nobody can read or write anything,
-- including you. With them, each account can only ever touch its own row.
alter table public.journals enable row level security;

drop policy if exists "read own journal"   on public.journals;
drop policy if exists "insert own journal" on public.journals;
drop policy if exists "update own journal" on public.journals;

create policy "read own journal"
  on public.journals for select
  using (auth.uid() = user_id);

create policy "insert own journal"
  on public.journals for insert
  with check (auth.uid() = user_id);

create policy "update own journal"
  on public.journals for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

4. Click **Run** (or `⌘ + Enter`).
5. You should see **Success. No rows returned.** That's what success looks like here — don't
   expect a table of results.

> **What that SQL did, in plain terms:** it made a table with one row per person, then locked
> it down so that a request can only ever read or write the row belonging to whoever is signed
> in. Even though your app's key is public, nobody can pull your data with it — the database
> refuses. This is the part that makes it safe to put the key in a public web page.

---

## Step 3 — Copy your two values

Supabase reorganises this screen fairly often, so here are three routes. Any one works.

**Easiest:** click the **Connect** button at the top of your project dashboard. It shows the
Project URL and the key together in one panel.

**Most reliable, for the URL:** read it off your browser's address bar. The dashboard URL is
`supabase.com/dashboard/project/<YOUR-PROJECT-ID>`, and your Project URL is simply
`https://<YOUR-PROJECT-ID>.supabase.co`. That never changes no matter how the menus move.

**By menu:** the URL lives under **Integrations → Data API**; the keys under
**Settings (gear) → API Keys**.

### Which key

Supabase renamed these, so you'll see one of two things. **Either works:**

| Label | Looks like | Notes |
|---|---|---|
| **Publishable key** | `sb_publishable_...` | the current name |
| **anon** / **public** | a long string starting `eyJ...` | the old name; may sit under a "Legacy API Keys" tab |

⚠️ **Never use** anything labelled `secret`, `sb_secret_`, or `service_role`. Those bypass
every policy you just created.

The publishable/anon key is *designed* to be public. Your row-level security policies are the
protection, not the key's secrecy.

---

## Step 4 — Connect the app

1. Open your Content Journal.
2. Go to **Settings → ☁️ Sync & storage**.
3. Paste the **Project URL** and the **anon key**. Click **Save connection**.
4. Enter your email and a password (at least 8 characters — this is a *new* password for this
   app, not your Supabase one). Click **Create account**.
5. **Check your email** and click the confirmation link Supabase sends.
6. Come back and click **Sign in**.

The chip in the top right should turn green and say **Synced**.

Anything already in this browser gets uploaded and becomes your cloud library. Nothing is
thrown away.

---

## Step 5 — Add your phone

You should not have to retype a URL and a long key on a phone keyboard. Two ways not to.

### The quick way — a setup link

1. On your laptop: **Settings → Sync → 📱 Set up another device**.
2. Copy the link it gives you and text or email it to yourself.
3. Open that link on your phone.

The phone picks up the connection automatically and asks for nothing but your email and
password. **Sign in** *(not Create account)* and your library appears.

The link carries your publishable key, which is public by design — but there's no reason to
post it anywhere public.

### The permanent way — bake it in

Better if you'll ever use a third device, or reinstall.

1. In your GitHub repo, open **`src/config.js`** and click the **✏️ pencil**.
2. Paste your publishable key between the quotes on the `anonKey:` line. Your Project URL is
   already filled in.
3. **Commit changes**, wait a minute or two.

From then on, *any* device that opens your site is already connected — it only ever asks you
to sign in. That's how normal apps behave, and it's why the key being public is fine: your
row-level security policy is what protects the data.

Either way, from here on both devices stay in step automatically.

If a device already had content on it before you signed in, it gets **merged** in rather than
overwritten. For anything that exists in both places, the more recently edited version wins.

---

## Reading the sync chip

The chip lives in the top right of every screen.

| Chip | What's happening |
|---|---|
| 🟢 **Synced** | Everything's saved to the cloud. |
| ⚪ **Syncing…** | Talking to the server. A second or two. |
| 🟡 **Offline** | No connection. Your changes are safe here and will upload when you're back. |
| 🟡 **Sign in** | Sync is set up but you're signed out. Changes are staying on this device. |
| 🔴 **Sync issue** | Something's wrong. Click it — Settings shows the actual error. |
| ⚪ **Local only** | Sync isn't set up yet. |

Click the chip any time to jump to the sync settings.

---

## How it handles two devices at once

Worth knowing, because it's the part most sync tools get wrong:

- Every change **saves to your device first**, instantly. The app never waits on the network.
- A couple of seconds later it uploads.
- Before uploading, it re-reads the cloud copy and **merges**, so if you added things on your
  phone and your laptop the same afternoon, you end up with both.
- If both devices happen to save in the same instant, the second one notices, re-merges, and
  tries again — rather than overwriting the first. **Nothing gets silently dropped.**
- For a single item edited in both places, the more recent edit wins.
- For a calendar post, a **decision beats a suggestion** — if you marked something Planned on
  your phone, that survives against an untouched suggestion on your laptop.

---

## If something goes wrong

| What you see | Fix |
|---|---|
| `relation "public.journals" does not exist` | Step 2's SQL didn't run. Go back and run it. |
| `new row violates row-level security policy` | The policies didn't get created. Re-run the whole SQL block. |
| `Invalid login credentials` | Wrong password, or you haven't clicked the email confirmation link yet. |
| `Email not confirmed` | Check your inbox and spam for the Supabase confirmation email. |
| `Failed to fetch` | Wrong Project URL (check for a typo or a trailing slash), or you're offline. |
| Chip stuck on **Syncing…** | Open Settings → Sync; the specific error shows there. |
| Nothing appeared on the second device | Make sure you used **Sign in**, not **Create account** — creating a second account gives you a second, empty library. |

**Your data is never stranded.** Even if sync breaks entirely, Settings → **Manual backup**
still exports everything as text you can copy anywhere.

---

## Two notes

**The AI features and sync are unrelated.** You can use either, both, or neither.

**Sync won't work in the Claude artifact preview** — that page blocks outside connections by
design. Set sync up on your real GitHub Pages site.

---

## When you want other people using this

What you just built is already most of the way to multi-user. The table has a `user_id` column
and the policies scope every read and write to the signed-in account — so two people using it
today would already have completely separate, private libraries.

What would still need doing: a sign-up flow that doesn't involve pasting API keys, per-user
platform lanes, and making `src/atlanta.js` a selectable city rather than a hardcoded one.

`PROJECT-NOTES.md` covers that in more detail. Not worth building until you've lived with it.
