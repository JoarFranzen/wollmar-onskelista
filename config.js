// Firebase web configuration is public by design. Security is enforced by Firestore Rules and the Cloudflare Worker.
export const firebaseConfig = {
  apiKey: 'AIzaSyDhGmcZYsaxXxC11aoyBk_oyBDDJd88Gk',
  authDomain: 'wollmar-onskelista.firebaseapp.com',
  projectId: 'wollmar-onskelista',
  storageBucket: 'wollmar-onskelista.firebasestorage.app',
  messagingSenderId: '810529254336',
  appId: '1:810529254336:web:5616b2585be0ee76c07625'
};

// Temporarily disabled while restoring the public wishlist.
export const adminApiUrl = 'PASTE_CLOUDFLARE_WORKER_URL_HERE';
