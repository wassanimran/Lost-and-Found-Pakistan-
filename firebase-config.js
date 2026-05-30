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

const firebaseConfig = {
  apiKey: 'AIzaSyAmwasTYUyvTZKMDSDHX9JFnl3jUQzY1Us',
  authDomain: 'lost-and-found-86de8.firebaseapp.com',
  projectId: 'lost-and-found-86de8',
  storageBucket: 'lost-and-found-86de8.firebasestorage.app',
  messagingSenderId: '271989392492',
  appId: '1:271989392492:web:11cb5434f08b97dc868449',
  measurementId: 'G-JDBHEP8XYQ'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let analytics = null;
analyticsIsSupported()
  .then((supported) => {
    if (supported) analytics = getAnalytics(app);
  })
  .catch(() => {
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
