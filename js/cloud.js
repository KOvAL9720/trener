/* =========================================================
   Cloud (Firebase) – zdieľanie dát klientom do klientskej zóny
   Načíta sa ako samostatný modul; bez internetu alebo pri chybe aplikácia
   funguje ďalej, len bez synchronizácie (window.cloud ostane nedostupné).
   ========================================================= */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, doc, setDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyB3E6qCv4VFGeyHHvFClqjJXSkzyvnObjg',
  authDomain: 'trener-31965.firebaseapp.com',
  projectId: 'trener-31965',
  storageBucket: 'trener-31965.firebasestorage.app',
  messagingSenderId: '828584673508',
  appId: '1:828584673508:web:cf84256d49b17e54c66cf1'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const fs = getFirestore(app);

let uid = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => { try { fn(cloud.state()); } catch (e) { /* ignorovať */ } });

// Tréner sa prihlasuje anonymne – účet je viazaný na toto zariadenie/prehliadač,
// bez hesla a bez Google okna. Kódy pre klientov sú podpísané týmto účtom.
const ready = new Promise((resolve) => {
  onAuthStateChanged(auth, (user) => {
    uid = user ? user.uid : null;
    notify();
    if (user) resolve(user.uid);
  });
  signInAnonymously(auth).catch((e) => { console.warn('Cloud: prihlásenie zlyhalo', e.code || e); lastError = e.code || String(e); notify(); });
});
let lastError = '';

const cloud = {
  ready,
  state: () => ({ uid, online: navigator.onLine, error: lastError }),
  onChange: (fn) => { listeners.add(fn); fn(cloud.state()); return () => listeners.delete(fn); },
  // zapíše (alebo prepíše) zdieľané dáta klienta pod jeho kódom
  async share(code, data) {
    await ready;
    await setDoc(doc(fs, 'shared', code), { ...data, ownerUid: uid, updatedAt: serverTimestamp() });
  },
  async unshare(code) {
    await ready;
    await deleteDoc(doc(fs, 'shared', code));
  }
};
window.cloud = cloud;
window.dispatchEvent(new Event('cloud-ready'));
window.addEventListener('online', notify);
window.addEventListener('offline', notify);
