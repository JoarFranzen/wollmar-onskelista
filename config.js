// Firebase web configuration is public by design. Security is enforced by Firestore Rules and the Cloudflare Worker.
export const firebaseConfig = {
  apiKey: 'AIzaSyDhgMCZYsaxXxC11aoyBkH_oyBDDJd88Gk',
  authDomain: 'wollmar-onskelista.firebaseapp.com',
  projectId: 'wollmar-onskelista',
  storageBucket: 'wollmar-onskelista.firebasestorage.app',
  messagingSenderId: '810529254336',
  appId: '1:810529254336:web:5616b2585be0ee76c07625'
};

// Replace this with the deployed Cloudflare Worker URL, e.g. https://wollmar-admin.YOUR-SUBDOMAIN.workers.dev
export const adminApiUrl = 'PASTE_CLOUDFLARE_WORKER_URL_HERE';
