# Loyo — Loyalty Card

A simple barber shop loyalty app: customer scans a QR code at the shop,
enters their phone number, and sees a stamp card. After 8 stamps they
can redeem a free haircut.

## How data is stored

Customer records (phone number, stamp count, history) are stored in
**Supabase** (Postgres), shared across every device — so a customer
checking in on their own phone and a stamp added from a staff tablet
both see the same card. All reads/writes go through the `Store` object
near the top of `app.js`.

**Set it up:**

1. In your Supabase project, go to **SQL Editor → New query**, and run:

   ```sql
   create table customers (
     phone text primary key,
     stamps int not null default 0,
     history jsonb not null default '[]'::jsonb,
     last_auto_stamp date,
     created_at timestamptz not null default now()
   );

   alter table customers enable row level security;

   create policy "public read" on customers for select using (true);
   create policy "public insert" on customers for insert with check (true);
   create policy "public update" on customers for update using (true);
   ```

2. In **Project Settings → API**, copy your **Project URL** and **anon public** key.

3. In `app.js`, fill in:

   ```js
   const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
   const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";
   ```

4. Commit and push — GitHub Pages redeploys automatically.

**Worth knowing:** the RLS policies above are wide open — anyone with
your site's anon key (which is always visible in the page source,
that's normal for Supabase) can read or write any customer row
directly, bypassing the app's staff-PIN check entirely. Fine for a
small pilot; if this ever needs to be tamper-proof, add real customer
authentication (Supabase Auth phone OTP) or move stamp/redeem writes
into a server-side Supabase Edge Function that checks the PIN itself.

Adding a stamp or redeeming a reward is still gated by a **staff PIN**
(`CONFIG.STAFF_PIN` in `app.js`, default `2468` — change it before you
launch).

## Deploying to GitHub Pages

1. Create a new GitHub repo (e.g. `loyo-app`).
2. Add these three files to the repo root: `index.html`, `style.css`, `app.js`.
3. Commit and push to the `main` branch.
4. On GitHub: **Settings → Pages → Source → Deploy from a branch**,
   choose `main` and `/ (root)`, then **Save**.
5. GitHub gives you a URL like:
   `https://YOUR-USERNAME.github.io/loyo-app/`
   It can take a minute or two to go live.

## Making the QR code

Point the QR code at your Pages URL **with `?stamp=1` on the end**, for example:

```
https://YOUR-USERNAME.github.io/loyo-app/?stamp=1
```

That query parameter is what tells the app "this visit came from the
shop's QR code — add a stamp after login." It's capped at one stamp
per phone number per calendar day, so rescanning the same poster
twice in one visit (or refreshing the page) won't stack extra stamps.

Generate the QR image itself with a free tool like
[qr-code-generator.com](https://www.qr-code-generator.com/) or
[the qrserver API](https://goqr.me/api/), pasting in the URL above.
Print it and post it at the counter or on receipts.

**Worth knowing:** because there's no backend yet, this link is a
plain "magic URL" — anyone who has it (say, a photo of your QR
poster) could check themselves in remotely, once a day, without
setting foot in the shop. The daily cap keeps this from being
exploited badly, but a proper fix (a code that rotates daily, or
checking the customer is actually on-site) needs a real backend,
which is a good thing to add alongside your database later.

## Customizing

- **Stamps needed per reward:** `CONFIG.STAMPS_REQUIRED` in `app.js` (default `8`).
- **Staff PIN:** `CONFIG.STAFF_PIN` in `app.js` (default `2468`).
- **Shop name / colors / fonts:** `index.html` header text, and the
  color variables at the top of `style.css` (`--navy`, `--brick`, `--brass`, `--cream`).
