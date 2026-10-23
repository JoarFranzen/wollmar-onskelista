# Wollmars önskelista

A small Swedish wishlist website built with vanilla HTML/CSS/JS, Firebase Firestore and Cloudflare Pages.

## Features
- Public wishlist and gift links.
- Guests can reserve a wish once; Firestore transactions prevent two guests reserving the same wish at the same time.
- Admin uses a password checked by a Cloudflare Worker. The password and Firebase service-account private key are never placed in browser code.
- Admin add/edit/delete requests go through the Worker. Firestore client rules do not allow public create/delete or general edits.

## 1. Firebase / Firestore setup
1. Open the Firebase project `wollmar-onskelista`.
2. Confirm a Firestore database exists.
3. Open Firestore > Rules and publish the contents of `firestore.rules` from this repository.
4. The Firebase web config is already in `config.js`. The web API key is public by design; access is controlled by Firestore Rules and the Worker.
5. The public site reads the `wishes` collection. Keep private information out of wish descriptions.

## 2. Create a service account for the Worker
The Worker needs server-side access to write wishlist documents. Never put this key in `config.js`, `app.js`, `index.html`, or any public repository file.

1. In Google Cloud Console, select project `wollmar-onskelista`.
2. Open IAM & Admin > Service Accounts and create a service account, e.g. `wollmar-wishlist-admin`.
3. Grant it the **Cloud Datastore User** role (Firestore data access).
4. Create a JSON key for that service account and download it. Treat it like a password. Do not commit or upload it to GitHub.
5. If Firestore API is not enabled for the project, enable the Cloud Firestore API.

## 3. Deploy the Cloudflare Worker
The Worker source is `worker.js`; `wrangler.toml` contains its basic settings.

1. In Cloudflare, open Workers & Pages and create a Worker named `wollmar-onskelista-admin`.
2. Open the Worker editor and replace its starter code with the complete contents of `worker.js`, then deploy.
3. In the Worker settings, add these variables/secrets:
   - Secret `ADMIN_PASSWORD`: choose a long, unique password for the adult mode.
   - Secret `SESSION_SECRET`: a separate random secret of at least 32 characters.
   - Secret `FIREBASE_SERVICE_ACCOUNT_JSON`: paste the **entire contents** of the downloaded service-account JSON file.
   - Variable `FIREBASE_PROJECT_ID`: `wollmar-onskelista`.
   - Variable `ALLOWED_ORIGIN`: `https://wollmar.joaryeah.com`.
4. Deploy the Worker again after setting the variables.
5. Copy the Worker URL, normally similar to `https://wollmar-onskelista-admin.YOUR-SUBDOMAIN.workers.dev`.

Use Cloudflare's secret fields for the three secrets. Never put the values in this repository. If the service-account JSON key is ever exposed, revoke it in Google Cloud Console and create a new one.

## 4. Connect the website to the Worker
1. Open `config.js` in GitHub.
2. Replace `PASTE_CLOUDFLARE_WORKER_URL_HERE` with the actual Worker URL, keeping the quotes.
3. Commit the change to `main`. Cloudflare Pages should redeploy automatically.
4. Open `https://wollmar.joaryeah.com`, refresh, and test that the public list loads.
5. Open **För Wollmars vuxna**, sign in with the password, add a test wish, edit it, then delete it.
6. Test reserving a wish in a private/incognito window.

## Security notes
- The password and session-signing secret are Cloudflare Worker secrets, not client-side values.
- The Worker creates short-lived (12-hour) signed admin sessions.
- Firestore Rules allow public reads and a narrow reservation-only update. Admin writes are performed by the Worker service account.
- Do not grant the service account Project Owner or Editor if Cloud Datastore User is sufficient.
- This is a small family wishlist. For stronger protection, consider Cloudflare rate limiting on the Worker login endpoint.
