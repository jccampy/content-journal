/* =========================================================================
   config.js — your Supabase connection, baked into the app.

   Fill in the key below once and every device that opens this site is already
   connected. Opening it on your phone then asks for nothing but your email and
   password — no pasting URLs and keys on a small screen.

   IS IT SAFE TO PUT THIS IN A PUBLIC REPO?  Yes. The publishable (anon) key is
   designed to sit in public web pages — it is in the source of essentially
   every Supabase app on the internet. What protects your library is the
   row-level security policy you created, which only ever lets a request touch
   the row belonging to whoever is signed in. Somebody with this key and no
   password gets nothing.

   Never put the `service_role` / `sb_secret_` key here. That one bypasses the
   policies and must stay private.
   ========================================================================= */

window.CJ = window.CJ || {};

window.CJ.DEFAULT_CLOUD = {
  url: 'https://lajaacblxzghyvuuvsuo.supabase.co',

  // 👇 Paste your publishable key between the quotes, then save.
  //    Supabase → Settings → API Keys. Starts with `sb_publishable_` or `eyJ`.
  anonKey: 'sb_publishable_Wk4Jkpk04cZfQF2iuQjj2w_fNJEVj_6'
};
