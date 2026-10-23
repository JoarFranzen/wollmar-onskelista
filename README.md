# Wollmars önskelista

A small Swedish wishlist website with a hand-crafted pastel party style. Built with vanilla HTML/CSS/JS and Firebase Authentication + Firestore, intended for Cloudflare Pages.

## Features
- Responsive wishlist with gift links, optional image links, descriptions, categories and prices.
- Anonymous guest reservations use a Firestore transaction so only one reservation wins.
- Google sign-in for the administrator; admin can add, edit and delete wishes.
- Reduced-motion support.

## Firebase setup
1. Create a project at https://console.firebase.google.com/
2. Enable Google under Authentication > Sign-in method.
3. Add wollmar.joaryeah.com and the Cloudflare Pages pages.dev domain under Authentication > Settings > Authorized domains.
4. Create a Firestore database.
5. Add a Web app in Project settings and copy its config into config.js.
6. Replace PASTE_YOUR_GOOGLE_EMAIL_HERE in config.js and firestore.rules with the lowercase email of the admin Google account.
7. Publish firestore.rules in Firestore > Rules.

## Cloudflare Pages
1. Create a Pages project connected to this repository.
2. Production branch: main. Build command: leave empty. Build output directory: /.
3. Add custom domain wollmar.joaryeah.com and follow Cloudflare's DNS instructions.

## Privacy
The wishlist is publicly readable. Do not put private information in wish descriptions. The Firebase web config is not a secret; Firestore rules are the security boundary. Guests cannot cancel their own reservation in this version. Only the configured Google account may manage wishes.
