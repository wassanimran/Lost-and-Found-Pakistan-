// Firebase configuration and shared service exports for Lost & Found Pakistan
// Uses Firebase CDN modules so the static website works without a build step.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAnalytics, isSupported as analyticsIsSupported } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js';
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

/* ── Debug helper (mirrors main.js logger, safe if panel absent) ── */
function _cfgLog(level, message, data) {
  const ts = new Date().toISOString().slice(11, 23);
  const prefix = `[${ts}] [FIREBASE-CONFIG]`;
  const styles = { info: 'color:#60a5fa', success: 'color:#34d399', warn: 'color:#fbbf24', error: 'color:#f87171' };
  const style  = styles[level] || '';
  const args   = data !== undefined ? [`%c${prefix} ${message}`, style, data] : [`%c${prefix} ${message}`, style];
  if (level === 'error')      console.error(...args);
  else if (level === 'warn')  console.warn(...args);
  else                        console.log(...args);
}

/* ── Initialise app ── */
const firebaseConfig = {
  apiKey:            'AIzaSyAmwasTYUyvTZKMDSDHX9JFnl3jUQzY1Us',
  authDomain:        'lost-and-found-86de8.firebaseapp.com',
  projectId:         'lost-and-found-86de8',
  storageBucket:     'lost-and-found-86de8.firebasestorage.app',
  messagingSenderId: '271989392492',
  appId:             '1:271989392492:web:11cb5434f08b97dc868449',
  measurementId:     'G-JDBHEP8XYQ'
};

_cfgLog('info', 'Calling initializeApp()', { projectId: firebaseConfig.projectId });
const app = initializeApp(firebaseConfig);
_cfgLog('success', 'initializeApp() OK', { name: app.name, projectId: app.options.projectId });

_cfgLog('info', 'Calling getAuth()');
const auth = getAuth(app);
_cfgLog('success', 'getAuth() OK', { currentUser: auth.currentUser?.uid ?? null });

_cfgLog('info', 'Calling getFirestore()');
const db = getFirestore(app);
_cfgLog('success', 'getFirestore() OK', { app: db.app.name });

/* ── Analytics (optional) ── */
let analytics = null;
_cfgLog('info', 'Checking Analytics support via isSupported()');
analyticsIsSupported()
  .then(supported => {
    if (supported) {
      analytics = getAnalytics(app);
      _cfgLog('success', 'Analytics initialised OK');
    } else {
      _cfgLog('warn', 'Analytics not supported in this environment — skipped');
    }
  })
  .catch(err => {
    _cfgLog('error', 'analyticsIsSupported() threw an error', { message: err.message });
    analytics = null;
  });

export {
  app,
  analytics,
  auth,
  db,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  onSnapshot
};
