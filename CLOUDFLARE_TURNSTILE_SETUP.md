# Cloudflare Turnstile Setup Guide

Follow these steps to configure Cloudflare Turnstile for RemitX.

---

## Step 1: Create a Cloudflare Account

1. Go to **[https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)**
2. Enter your email address and create a password
3. Click **Sign Up**
4. Verify your email address (check your inbox and click the confirmation link)

---

## Step 2: Go to the Turnstile Dashboard

1. Log in to **[https://dash.cloudflare.com](https://dash.cloudflare.com)**
2. In the left sidebar, click **Turnstile**
3. If you don't see it in the sidebar, go directly to:
   **[https://dash.cloudflare.com/?to=/:account/turnstile](https://dash.cloudflare.com/?to=/:account/turnstile)**

---

## Step 3: Add a New Site

1. Click the blue **Add Site** button
2. Fill in the form:

| Field | What to enter |
|---|---|
| **Site name** | `RemitX` (or anything you like) |
| **Domain** | For local development, enter: `localhost` |
| **Widget type** | Select **Managed** (recommended) |
| **Appearance** | Select **Light** or **Auto** (your choice) |

3. Check the box to agree to the Terms of Service
4. Click **Create**

---

## Step 4: Copy Your Keys

After creating the site, you'll see two keys on the screen:

### Site Key
- Labeled **Site Key**
- Format looks like: `0x4AAAAAAABC12345abcdef`
- This is **PUBLIC** - safe to ship to the browser
- Copy this value

### Secret Key
- Labeled **Secret Key**
- Format looks like: `0x1AAAAAAABC12345abcdef`
- This is **PRIVATE** - must never be shared
- Copy this value (you may need to click "Copy" - it's only shown once)

---

## Step 5: Add Keys to Your `.env` File

Open your `.env` file and fill in these two lines:

```env
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAABC12345abcdef
TURNSTILE_SECRET_KEY=0x1AAAAAAABC12345abcdef
```

> Replace the placeholder values with your actual keys from Step 4.

---

## Step 6: Restart Your Dev Server

1. Stop your running dev server (Ctrl+C in the terminal)
2. Start it again:

```bash
npm run dev
```

3. Go to **http://localhost:3000/login**
4. The Turnstile widget will now appear on the login/register form

---

## ✅ Done!

Your Cloudflare Turnstile is now configured. The widget will:
- Verify humans on login and register
- Block bots automatically
- Work on both desktop and mobile

---

## Production Notes (For Later)

When you deploy to production:

1. Add your production domain (e.g. `remitx.app`) to the Turnstile domain list
2. Go to **Turnstile → your site → Settings** → Add your domain
3. Set the same `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in:
   - **Vercel** → Project Settings → Environment Variables
4. Redeploy

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Widget doesn't appear | Make sure both keys are set and restart the dev server |
| "Invalid domain" error | Make sure `localhost` is listed as a domain for the Turnstile site |
| Secret key lost | Delete and recreate the Turnstile site, or go to Settings to regenerate |
| Works locally but not in production | Add your production domain to the Turnstile site settings |