# Operations Board

Load board, delivery schedule, and rate tracker for the dispatch team. Works on
phone and computer (add it to your phone's home screen for an app-like feel).

- **Home** (`/`) - what's loading and delivering today
- **Board** (`/board`) - Pending to Load / On the Road / Complete Load
- **Rates** (`/rates`) - route averages (from entered loads) and the weekly
  broker rate tracker (Hi/Lo/Average by lane)

Built with Next.js + Supabase (Postgres + Auth), deployed on Vercel.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free account/project (you do this step - I can't create accounts on your behalf).
2. In your new project, open **SQL Editor -> New query**, paste in the contents of [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates all the tables, security rules, etc.
3. Optionally run [`supabase/seed.sql`](supabase/seed.sql) the same way to pre-fill the brokers and lanes from your rate tracker sheet.
4. Create your team's logins: **Authentication -> Users -> Add user**, one per person (1-3 people). Email/password is enough - there's no public sign-up page, so only accounts you create here can log in.
5. Get your API keys: **Project Settings -> API** - copy the **Project URL** and the **anon public** key.

## 2. Configure the app locally

1. Copy `.env.local.example` to `.env.local`.
2. Fill in the two values from step 1.5 above:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```

## 3. Run it locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with one of the users you created, and try it out.

## 4. Deploy to the web (Vercel)

1. Push this repo to GitHub (create a repo, `git remote add origin ...`, `git push`).
2. Go to [vercel.com](https://vercel.com), sign in, and **Add New -> Project**, importing your GitHub repo (you do this step).
3. In the Vercel project's **Environment Variables**, add the same two `NEXT_PUBLIC_SUPABASE_*` values from your `.env.local`.
4. Deploy. Vercel gives you a real `https://...vercel.app` URL you can open from any phone or computer.
5. On a phone browser, open the URL and use "Add to Home Screen" (Safari) or the install prompt (Chrome) to make it feel like an installed app.

## Notes / assumptions

- **Timezone**: "Today" and "this week" are computed using `America/Chicago` (see `src/lib/dates.ts` - `APP_TIMEZONE`). Change that constant if the dispatch office is in a different timezone.
- **Access**: all signed-in users have full read/write access - there's no admin/viewer distinction, matching the small team size.
- **Route Averages tab** aggregates the `Rate` field directly from loads entered on the Board, grouped by Source -> Destination, for the current and previous calendar week (Mon-Sun).
- **Broker Tracker tab** is the separate weekly quote grid (lane x broker) from your rate tracker sheet - editable cells, with computed Current/Previous week average and Hi/Lo (with broker name) per lane. Use "Manage brokers & lanes" to add new ones as your network changes.
