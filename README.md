# Shree Bhavani Stock App

Check stock from your phone, fed automatically from Profit Maker.

```
Profit Maker backup (zip) --> sync script on shop PC --> Supabase --> website on Vercel --> your phone
```

## Folder structure

```
shree-bhavani-stock/
  README.md
  database/schema.sql              Supabase tables, security rules, stock view
  sync/
    sync.ps1                       reads newest backup zip, uploads to Supabase
    sync-config.example.json       copy to sync-config.json and fill in
    run-dryrun.bat                 test: read only, uploads nothing
    run-sync.bat                   upload now
    install-schedule.bat           run the sync every 30 minutes
  web/                             React website (Vite) for Vercel
```

## What you need
- A free Supabase account (supabase.com)
- A free GitHub account and a free Vercel account (vercel.com)
- The shop PC with Profit Maker, backups in `D:\ProfitBk`
- No Python or Node.js needed

---

## Part 1: Supabase (about 5 minutes)

1. Create a project (region Mumbai or Singapore) and save the database password.
2. Open **SQL Editor**, paste all of `database/schema.sql`, click **Run**.
3. **Authentication > Users > Add user**: create your email and password.
   Add one user per staff member who should see stock.
4. In the authentication settings, turn **off** public sign-ups.
5. **Project Settings > API**: note the **Project URL**, the **anon / publishable key**,
   and the **service_role / secret key**.

## Part 2: Sync on the shop PC

1. Copy the `sync` folder to the shop PC, for example `D:\stock-sync`.
2. Copy `sync-config.example.json` to a new file named `sync-config.json` and open it in Notepad.
   Fill in:
   - `supabase_url`: your Project URL
   - `supabase_key`: the **secret / service_role** key (never the anon key here)
   - `backup_folder`: leave as `D:\ProfitBk` if that is correct
   - `live_mdb`: leave empty (see "Live data" below)
3. Double-click `run-dryrun.bat`. You should see about 612 products and 656 batches
   (numbers change as your stock changes) and "Dry run: nothing uploaded."
4. Double-click `run-sync.bat`. It should end with "Upload complete."
5. In Supabase **Table Editor**, open `products` and `batches` to confirm the data.
6. Double-click `install-schedule.bat` to sync every 30 minutes.
   The PC must be on, signed in to Windows, and online.

A log of every run is saved in `sync.log` next to the script.

## Part 3: Website on Vercel

1. On GitHub, create a new **private** repository.
2. Click **Add file > Upload files**, drag in the contents of this whole project folder, commit.
   (`sync-config.json` is excluded by `.gitignore`; never upload it.)
3. On Vercel: **Add New > Project**, import the repository.
4. Set **Root Directory** to `web`. Framework should show Vite.
5. Add Environment Variables:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = the **anon / publishable** key
6. Click **Deploy**, open the link on your phone, sign in.
   Use the browser menu **Add to Home screen** to make it an app icon.

## Checks after the first run
- A product you know shows the same total stock as Profit Maker.
- The "Rate" column matches the rate you bill at. If not, the `BillPrice` column
  mapping in `sync.ps1` needs changing.
- The "Updated" time at the top of the website moves after each sync.

## Good to know
- **Freshness**: stock is only as new as the newest zip in `D:\ProfitBk`. Make Profit Maker
  back up more often if you want it closer to live.
- **New financial year**: the script picks the newest `Data*.zip`, so `Data2728...` is picked up
  automatically. The new year's data may start with fresh opening stock.
- **Live data**: if you find Profit Maker's live `.mdb` file, put its full path in `live_mdb`.
  The script then reads a copy of it instead of the backup. Test this before relying on it.
- **Read only**: this version only shows stock. Nothing is written back to Profit Maker.
  Billing and orders come next.

## Security
- The secret key stays on the shop PC only. If it leaks, reset it in Supabase and update `sync-config.json`.
- Only users you create can sign in, and they can only read.
- Stock data is mirrored to Supabase's servers; do not share the website link or logins casually.

## Troubleshooting
| Problem | Fix |
|---|---|
| "Could not open database" | Install the free Microsoft Access Database Engine (32-bit) and retry |
| "No Data*.zip found" | Check `backup_folder` in `sync-config.json` |
| Upload error 401 / 403 | Wrong key; use the secret / service_role key in `sync-config.json` |
| Website says "Invalid login" | User not created in Supabase, or wrong password |
| Website loads but shows no items | Run the sync; check `schema.sql` was run fully |
| Website blank after deploy | Check both `VITE_` variables in Vercel, then Redeploy |
