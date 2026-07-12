# Loyo — Loyalty Card

A simple barber shop loyalty app: customer scans a QR code at the shop,
enters their phone number, and sees a stamp card. After 8 stamps they
can redeem a free haircut.

## How it works right now (no database yet)

There's no backend. Everything is plain **HTML + CSS + JS**, and all
customer data (phone number, stamp count, history) is saved with the
browser's `localStorage` — inside `app.js`, look for the `Store` object.

**What this means in practice:**
- A customer's stamps live on the device/browser they checked in with.
  If they always scan the QR on their own phone, their card works fine
  visit after visit.
- Stamps do **not** sync across devices. Your barber's phone and the
  customer's phone are two different "databases" right now.
- Clearing browser data/cache wipes that customer's card.
- Adding a stamp or redeeming a reward is protected by a **staff PIN**
  (set in `CONFIG.STAFF_PIN` in `app.js`, default `2468` — change it
  before you launch) rather than a real login, since there's no server
  to check permissions against.

This is a fine way to pilot the idea with real customers. When you're
ready to add a database (Firebase, Supabase, or your own API), open
`app.js` and replace the inside of the `Store` object's methods with
`fetch()` calls — the rest of the app doesn't need to change, since
every read/write already goes through that one object.

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
