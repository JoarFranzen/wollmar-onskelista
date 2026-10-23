// Firebase web configuration is public by design. Security is enforced by Firestore Rules and the Cloudflare Worker.
export const firebaseConfig = {
  apiKey: 'AIzaSyDhGmcZYsaxXxC11aoyBk_oyBDDJd88Gk',
  authDomain: 'wollmar-onskelista.firebaseapp.com',
  projectId: 'wollmar-onskelista',
  storageBucket: 'wollmar-onskelista.firebasestorage.app',
  messagingSenderId: '810529254336',
  appId: '1:5616b2585be0ee76c07625'
};

// Separate Cloudflare Worker that handles adult-mode login and wishlist editing.
export const adminApiUrl = 'https://wollmar-onskelista-admin.joarfranzen.workers.dev';
