# MResult Booth Hub: booth runbook

**Global Pharma Partnering Summit 2026 · Booth G1 · Hyderabad, 2–3 November (setup 1 November)**

| What | Address |
|---|---|
| Booth Hub, for the team (sign in) | `booth-visitor-hub.vercel.app` |
| Visitor registration (the QR code opens this) | `booth-visitor-hub.vercel.app/register` |
| Pharma Ninja game | Sign in with the game screen account; the game opens by itself |
| Printable registration QR code | Hub → **QR code** |

## 1. Before the event (admin, by 31 October)

1. **Upgrade both services** (section 9). The free plans are for building only.
2. **Add the team** (Hub → **Team**): each person's email, name, role (**Staff** or **Admin**) and a password you give them.
   Add one **Game screen** account (e.g. `game@mresult.com`); it can only run the game.
3. **Load the real questions** (Hub → **Game content**):
   1. Import the CSV.
   2. Check that each domain has at least 20 enabled questions.
   3. Then **Delete TEST questions**.
4. **Settings:** add the podcast topics and the demo list.
5. **Clear the test data** (Hub → **Data** → **Purge all event data**). Do this after any rehearsal, and before doors open on 2 November.
6. **Print the QR code** (Hub → **QR code** → Print or Download SVG) for the booth and the podcast table.

## 2. Each morning: set up a game screen (laptop or iPad)

1. Use Chrome (laptop) or Safari (iPad) in a **normal window, never private or incognito**. Plug the device in and turn off auto-lock and sleep.
2. Open the Hub, sign in with the **game screen account**, and the game opens.
   - **Laptop:** use the full-screen button at the top right.
   - **iPad:** turn on Guided Access so visitors can't leave the game.
3. **Sound:** turn the volume up and the silent switch off, then tap the screen once. Music starts.
4. **Game admin panel:** hold the **top-left corner for 3 seconds**, then PIN **2026**.
   - **Quiet mode:** use it while the podcast is recording.
   - **Volumes and play zone:** adjust as needed.
   - **"Signed in: syncing with the Hub":** confirms the screen is connected.
   - **Results waiting to send:** should drop to 0 when the network is up.
   - **Remove a leaderboard name** or **Reset today:** for tidying the leaderboard.

**Players need their badge ID.** If it's registered, the game greets them by first name. If it isn't, the registration form opens inside the game, and they're back playing within a minute.

## 3. The team at the booth

- **Sign in on your own phone once.** It lasts 7 days, and you can be signed in on several devices.
- **Log every conversation:** **Log interaction** → type the badge ID → check the name → **Conversation** → Hot, Warm or Cold → **Save**. It takes under 30 seconds.
  Use **Podcast** for guests, **Demo** for demos seen, **Other** for anything else.
- **A visitor without a phone:** **Register visitor**, and fill it in together. Ask them to read and agree to the consent text.
- **Podcast team:** the **Podcast** page lists today's guests with LinkedIn.
- **Never sign in as yourself on a public screen.** Staff and admin accounts can see visitor details. Public screens use the game account only.

## 4. If something goes wrong

| Problem | What to do |
|---|---|
| **Network down** | The game keeps working: rounds are saved on the screen and sent automatically later. Don't clear browser data, close a private window or sign out while results are waiting. Registration and Log interaction need the network, so note badge IDs on paper and enter them later. Visitors who play while the Hub is unreachable appear later under **Unmatched badge IDs** in the export. |
| **A game screen breaks** | Take any other device and sign in with the game account. Keep the broken device: rounds it hasn't sent are still on it and are sent when it's back online. |
| **"Not signed in" in the game admin panel** | Tap **Sign in** there and use the game account. Nothing played so far is lost. |
| **Someone forgets their password** | Admin → **Team** → **Reset password**. That signs them out everywhere. |
| **A phone is lost** | Admin → **Team** → change the person's password, or remove them. They're signed out at once. |
| **Someone asks for their data to be deleted** | Admin → **Data** → **Delete one visitor**. Their name may still show on a game screen's leaderboard until midnight: remove it in the game admin panel. |

## 5. Every evening (admin)

1. Hub → **Export** → **Only some days**, today → download.
2. Store the file somewhere access-controlled. It contains personal data.
3. Check that the game screens show **0 waiting to send**.

## 6. Upgrading to paid plans (before the event)

No code changes are needed.

- **Vercel:** upgrade to **Pro**, which allows business use. In the project's team settings, upgrade the plan, or transfer the project to an MResult Pro team.
  - If you transfer it, check that both environment variables (`DATABASE_URL`, `IP_HASH_SECRET`) came across.
  - Then redeploy.
- **Supabase:** in the MResult-GPPS organisation, open **Billing** and upgrade to **Pro**. That gives daily backups and stops the project pausing after 7 quiet days.

## 7. Moving to MResult's AWS later (EC2 + Postgres)

1. Create a Postgres 16 or newer database.
2. Run `npm run db:migrate` with `MIGRATION_DATABASE_URL` pointing at it. It creates the same tables, security rules and app login.
3. Copy the data across:
   ```bash
   pg_dump --schema=hub --data-only <old database> | psql <new database>
   ```
4. On EC2:
   - install Node 22 and Python 3;
   - build with `npm ci && npm run build`;
   - run with `npm start` behind HTTPS (nginx or a load balancer);
   - set `DATABASE_URL` and `IP_HASH_SECRET`.
5. Point the domain at the new server.
6. Reprint the QR code if the address changed. Game screens update by themselves.

## 8. Checks an engineer can rerun at any time

| Command | What it checks |
|---|---|
| `npm test` | Security rules and the API |
| `npm run test:e2e` | The real game in Chrome, including the offline test |
| `npm run test:load` | A busy-booth peak |

None of them touches the live site.
