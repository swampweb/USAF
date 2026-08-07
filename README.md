# USAF Per Diem Tracker

Static GitHub Pages starter site using Supabase Auth, tables, RLS, and Storage.

## Setup

1. Run the Supabase SQL setup file first.
2. Create your admin in Supabase Auth and make sure `USAF_profiles.role = admin`.
3. Edit `assets/js/config.js`:

```js
window.USAF_CONFIG = {
  SUPABASE_URL: "https://your-project.supabase.co",
  SUPABASE_ANON_KEY: "your-anon-public-key",
  STORAGE_BUCKET: "usaf-receipts",
  APP_NAME: "USAF Travel Tracker"
};
```

4. Upload all files to GitHub Pages.
5. Open `login.html`.

## Current starter features

- Login and signup
- Role-based navigation
- Admin links hidden from normal users
- Dashboard with active cycle calendar
- Per diem cycles
- Per diem receipts
- Other receipts
- Receipt file upload to Supabase Storage
- Voucher processing records
- Reports summary
- Admin users, receipt types, branding, settings, audit pages

## Next build step

The current voucher page creates a voucher record and marks receipts processed. The next step is adding the real ZIP download and PDF/CSV summary generation.
