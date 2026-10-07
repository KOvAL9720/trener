/* =========================================================
   Cloud (Firebase) – zdieľanie dát klientom do klientskej zóny
   Načíta sa ako samostatný modul; bez internetu alebo pri chybe aplikácia
   funguje ďalej, len bez synchronizácie (window.cloud ostane nedostupné).
   ========================================================= */
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, initializeAuth, inMemoryPersistence, signInAnonymously, onAuthStateChanged, setPersistence, indexedDBLocalPersistence, browserSessionPersistence, GoogleAuthProvider, EmailAuthProvider, linkWithPopup, signInWithPopup, signInWithCredential, linkWithCredential, updatePassword, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, doc, setDoc, deleteDoc, updateDoc, collection, getDocs, query, where, serverTimestamp, onSnapshot, writeBatch } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

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
// „Zostať prihlásený“ (predvolene áno): inak sa prihlásenie zabudne po zavretí appky / prehliadača
const REMEMBER_KEY = 'trainer-remember';
const remembered = () => { try { return localStorage.getItem(REMEMBER_KEY) !== '0'; } catch (e) { return true; } };
const persistence = (v) => (v ? indexedDBLocalPersistence : browserSessionPersistence);
if (!remembered()) setPersistence(auth, persistence(false)).catch(() => {});

let uid = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => { try { fn(cloud.state()); } catch (e) { /* ignorovať */ } });

// Tréner sa prihlasuje anonymne – účet je viazaný na toto zariadenie/prehliadač,
// bez hesla a bez Google okna. Kódy pre klientov sú podpísané týmto účtom.
// Po prihlásení cez Google / e-mail je účet rovnaký na všetkých zariadeniach (synchronizácia dát).
const ready = new Promise((resolve) => {
  onAuthStateChanged(auth, (user) => {
    uid = user ? user.uid : null;
    notify();
    if (user) resolve(user.uid);
    // prihlásenie sa pamätá – anonymne sa prihlasuje len vtedy, keď nie je nikto prihlásený
    else if (!switching) signInAnonymously(auth).catch((e) => { console.warn('Cloud: prihlásenie zlyhalo', e.code || e); lastError = e.code || String(e); notify(); });
  });
});
let lastError = '';
let switching = false;

const userInfo = () => {
  const u = auth.currentUser;
  if (!u) return null;
  return { uid: u.uid, anonymous: u.isAnonymous, email: u.email || u.providerData.find((p) => p.email)?.email || '', name: u.displayName || u.providerData.find((p) => p.displayName)?.displayName || '', providers: u.providerData.map((p) => p.providerId) };
};

// Overí prihlasovacie údaje v dočasnej inštancii (bez zmeny aktuálneho prihlásenia) a vráti ID účtu
async function uidFor(cred) {
  const tmp = initializeApp(firebaseConfig, 'overenie-' + Date.now());
  try {
    const a = initializeAuth(tmp, { persistence: inMemoryPersistence });
    return (await signInWithCredential(a, cred)).user.uid;
  } finally { deleteApp(tmp).catch(() => {}); }
}
const googleProvider = () => { const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); return p; };

const cloud = {
  ready,
  state: () => ({ uid, online: navigator.onLine, error: lastError, user: userInfo() }),
  user: userInfo,
  remembered,
  async setRemember(v) {
    try { localStorage.setItem(REMEMBER_KEY, v ? '1' : '0'); } catch (e) { /* ok */ }
    await setPersistence(auth, persistence(v)); // prenesie aj aktuálne prihlásenie
  },
  // Google: anonymný účet tohto zariadenia sa prepojí s Google účtom (ID ostane – kódy klientov fungujú ďalej).
  // Ak už Google účet existuje (iné zariadenie), vráti { switchTo } – appka rozhodne o dátach a dokončí prepnutie.
  // Pozn.: okno sa musí otvoriť hneď po kliknutí, preto pred ním nie je žiadne await.
  async signInGoogle() {
    const cur = auth.currentUser;
    try {
      if (cur && cur.isAnonymous) { await linkWithPopup(cur, googleProvider()); await cur.reload(); notify(); return { uid: cur.uid }; }
      const r = await signInWithPopup(auth, googleProvider());
      return { uid: r.user.uid };
    } catch (e) {
      if (e.code !== 'auth/credential-already-in-use' && e.code !== 'auth/email-already-in-use') throw e;
      const cred = GoogleAuthProvider.credentialFromError(e);
      if (!cred) throw e;
      return { switchTo: { cred, uid: await uidFor(cred) } };
    }
  },
  async checkEmail(email, password) {
    const cred = EmailAuthProvider.credential(email, password);
    return { switchTo: { cred, uid: await uidFor(cred) } };
  },
  async finishSwitch(cred) {
    switching = true;
    try { await signInWithCredential(auth, cred); } finally { switching = false; }
    notify();
    return auth.currentUser.uid;
  },
  // kódy klientov (a ich nevybavené žiadosti) previesť na iný účet – tento účet ich vlastní, preto to pravidlá dovolia
  async transferShares(codes, newUid) {
    await ready;
    for (const code of codes) {
      try {
        await updateDoc(doc(fs, 'shared', code), { ownerUid: newUid });
        const qs = await getDocs(query(collection(fs, 'shared', code, 'requests'), where('status', '==', 'new')));
        await Promise.all(qs.docs.map((d) => updateDoc(d.ref, { ownerUid: newUid }).catch(() => {})));
      } catch (e) { /* kód v cloude neexistuje alebo patrí inému účtu */ }
    }
  },
  // heslo k účtu – na prihlásenie v mobile (appka z plochy na iPhone nevie otvoriť Google okno)
  async setPassword(password) {
    const u = auth.currentUser;
    if (!u || u.isAnonymous || !u.email) throw Object.assign(new Error('no-email'), { code: 'no-email' });
    if (u.providerData.some((p) => p.providerId === 'password')) await updatePassword(u, password);
    else await linkWithCredential(u, EmailAuthProvider.credential(u.email, password));
    await u.reload();
    notify();
  },
  async signOutUser() {
    await signOut(auth); // onAuthStateChanged potom prihlási anonymne
  },
  // dáta trénera: trainers/{uid}/items/{kolekcia~id} = { j: JSON záznamu }
  watchData(cb, onError) {
    const u = auth.currentUser;
    if (!u) return () => {};
    return onSnapshot(collection(fs, 'trainers', u.uid, 'items'), (snap) => cb(snap.docs.map((d) => [d.id, d.data().j]), u.uid), onError);
  },
  async writeData(owner, puts, dels) {
    const ops = [...puts.map(([k, j]) => ['put', k, j]), ...dels.map((k) => ['del', k])];
    for (let i = 0; i < ops.length; i += 400) {
      const b = writeBatch(fs);
      for (const [op, k, j] of ops.slice(i, i + 400)) {
        const ref = doc(fs, 'trainers', owner, 'items', k);
        if (op === 'put') b.set(ref, { j, at: serverTimestamp() }); else b.delete(ref);
      }
      await b.commit();
    }
  },
  onChange: (fn) => { listeners.add(fn); fn(cloud.state()); return () => listeners.delete(fn); },
  // zapíše (alebo prepíše) zdieľané dáta klienta pod jeho kódom
  async share(code, data) {
    await ready;
    await setDoc(doc(fs, 'shared', code), { ...data, ownerUid: uid, updatedAt: serverTimestamp() });
  },
  async unshare(code) {
    await ready;
    await deleteDoc(doc(fs, 'shared', code));
  },
  // žiadosti klienta o tréning (shared/{kód}/requests) – nové, čakajúce na trénera
  async newRequests(code) {
    await ready;
    const qs = await getDocs(query(collection(fs, 'shared', code, 'requests'), where('status', '==', 'new')));
    return qs.docs.map((d) => { const { createdAt, ...r } = d.data(); return { id: d.id, code, ...r, createdAt: createdAt?.toMillis ? createdAt.toMillis() : 0 }; });
  },
  async answerRequest(code, id, status, extra = {}) {
    await ready;
    await updateDoc(doc(fs, 'shared', code, 'requests', id), { status, ...extra, answeredAt: serverTimestamp() });
  }
};
window.cloud = cloud;
window.dispatchEvent(new Event('cloud-ready'));
window.addEventListener('online', notify);
window.addEventListener('offline', notify);
