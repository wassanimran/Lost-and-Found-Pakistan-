/* ============================================================
   LOST & FOUND — Firebase-connected JavaScript
   Handles: nav, mobile menu, auth, reports, contact messages,
            live Firestore item lists, search/filter, toasts
   ============================================================ */

import {
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
} from './firebase-config.js';

/* ============================================================
   DEBUG LOGGER
   Writes timestamped, colour-coded lines to:
     1. The browser console
     2. The #debugLog panel (auth.html only)
   Levels: info | success | warn | error
   ============================================================ */
const DEBUG = false; // set false to silence all debug output

function dbg(level, tag, message, data) {
  if (!DEBUG) return;

  const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  const prefix = `[${ts}] [${tag}]`;
  const full   = data !== undefined ? `${prefix} ${message}` : `${prefix} ${message}`;

  // 1. Console
  const style = {
    info:    'color:#60a5fa',
    success: 'color:#34d399',
    warn:    'color:#fbbf24',
    error:   'color:#f87171'
  }[level] || '';

  if (level === 'error')   console.error(`%c${full}`, style, data ?? '');
  else if (level === 'warn') console.warn(`%c${full}`, style, data ?? '');
  else                     console.log(`%c${full}`, style, data ?? '');

  // 2. On-page panel (auth.html)
  const panel = document.getElementById('debugLog');
  if (!panel) return;

  const line = document.createElement('div');
  line.className = `log-${level}`;
  const dataStr = data !== undefined
    ? ` — ${typeof data === 'object' ? JSON.stringify(data) : data}`
    : '';
  line.textContent = `${full}${dataStr}`;
  panel.appendChild(line);
  panel.scrollTop = panel.scrollHeight;
}

// Shorthand helpers
const dbgInfo    = (tag, msg, d) => dbg('info',    tag, msg, d);
const dbgSuccess = (tag, msg, d) => dbg('success', tag, msg, d);
const dbgWarn    = (tag, msg, d) => dbg('warn',    tag, msg, d);
const dbgError   = (tag, msg, d) => dbg('error',   tag, msg, d);

/* ============================================================
   HELPERS
   ============================================================ */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

let currentUser = null;
let toastContainer;

function ensureToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

function showToast(message, type = 'info', duration = 3500) {
  const container = ensureToastContainer();
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || icons.info}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function firebaseErrorMessage(error) {
  const code = error?.code || '';
  const messages = {
    'auth/email-already-in-use':  'This email is already registered. Please sign in instead.',
    'auth/invalid-email':         'Please enter a valid email address.',
    'auth/invalid-credential':    'Incorrect email or password.',
    'auth/user-not-found':        'No account exists with this email address.',
    'auth/wrong-password':        'Incorrect password.',
    'auth/weak-password':         'Password should be at least 6 characters.',
    'permission-denied':          'Firebase permission denied. Please check Firestore security rules.'
  };
  return messages[code] || error?.message || 'Something went wrong. Please try again.';
}

/* ============================================================
   NAV
   ============================================================ */
function setActiveNav() {
  const current = location.pathname.split('/').pop() || 'index.html';
  dbgInfo('NAV', `Setting active nav for page: ${current}`);
  $$('nav a').forEach(a => {
    const href = a.getAttribute('href');
    a.classList.toggle('active', href === current);
  });
}

function injectAuthNav() {
  const nav = $('nav');
  if (!nav || $('#authNavLink')) {
    dbgWarn('NAV', 'injectAuthNav: nav missing or already injected, skipping');
    return;
  }

  dbgInfo('NAV', 'Injecting auth nav link and logout button');

  const authLink = document.createElement('a');
  authLink.href = 'auth.html';
  authLink.id = 'authNavLink';
  authLink.textContent = 'Login';
  nav.appendChild(authLink);

  const logoutBtn = document.createElement('button');
  logoutBtn.type = 'button';
  logoutBtn.id = 'logoutBtn';
  logoutBtn.className = 'nav-button';
  logoutBtn.textContent = 'Logout';
  logoutBtn.hidden = true;
  nav.appendChild(logoutBtn);

  logoutBtn.addEventListener('click', async () => {
    dbgInfo('AUTH', 'Logout button clicked — calling signOut()');
    try {
      await signOut(auth);
      dbgSuccess('AUTH', 'signOut() resolved — user signed out');
      showToast('You have been signed out.', 'success');
    } catch (error) {
      dbgError('AUTH', `signOut() failed: ${error.code}`, { message: error.message });
      showToast(firebaseErrorMessage(error), 'error');
    }
  });
}

function updateAuthUI(user) {
  currentUser = user;
  const authLink  = $('#authNavLink');
  const logoutBtn = $('#logoutBtn');
  const authStatus = $('#authStatus');
  const userName  = user?.displayName || user?.email || 'User';

  if (user) {
    dbgSuccess('AUTH', `onAuthStateChanged → user SIGNED IN`, {
      uid: user.uid, email: user.email, displayName: user.displayName
    });
  } else {
    dbgInfo('AUTH', 'onAuthStateChanged → user SIGNED OUT (null)');
  }

  if (authLink) {
    authLink.textContent = user ? `Hi, ${userName.split('@')[0]}` : 'Login';
    authLink.href = 'auth.html';
  }
  if (logoutBtn) logoutBtn.hidden = !user;
  if (authStatus) {
    authStatus.textContent = user
      ? `Signed in as ${userName}. Reports you submit will be linked to this account.`
      : 'Sign in or create an account to report lost and found items.';
  }

  $$('[data-auth-required]').forEach(el => { el.disabled = !user; });
}

function initAuthObserver() {
  dbgInfo('AUTH', 'Attaching onAuthStateChanged observer');
  injectAuthNav();
  onAuthStateChanged(auth, updateAuthUI);
}

/* ============================================================
   MOBILE MENU
   ============================================================ */
function initMobileMenu() {
  const header = $('header');
  if (!header) { dbgWarn('UI', 'initMobileMenu: no <header> found'); return; }

  dbgInfo('UI', 'Initialising mobile hamburger menu');

  if (!$('.hamburger')) {
    const btn = document.createElement('button');
    btn.className = 'hamburger';
    btn.setAttribute('aria-label', 'Toggle menu');
    btn.innerHTML = '<span></span><span></span><span></span>';
    header.appendChild(btn);
  }

  const hamburger = $('.hamburger');
  const nav = $('nav');
  if (!hamburger || !nav) { dbgWarn('UI', 'initMobileMenu: hamburger or nav missing'); return; }

  hamburger.addEventListener('click', () => {
    const open = hamburger.classList.toggle('open');
    nav.classList.toggle('open', open);
    dbgInfo('UI', `Mobile menu ${open ? 'opened' : 'closed'}`);
  });

  $$('nav a, nav button').forEach(item => {
    item.addEventListener('click', () => {
      hamburger.classList.remove('open');
      nav.classList.remove('open');
    });
  });

  document.addEventListener('click', e => {
    if (!header.contains(e.target)) {
      hamburger.classList.remove('open');
      nav.classList.remove('open');
    }
  });
}

/* ============================================================
   FORM VALIDATION
   ============================================================ */
function validateField(input) {
  const value = input.value.trim();
  let error = '';

  if (input.hasAttribute('required') && !value) {
    error = 'This field is required.';
  } else if (input.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    error = 'Please enter a valid email address.';
  } else if (input.type === 'password' && value && value.length < 6) {
    error = 'Password must be at least 6 characters.';
  }

  let errorEl = input.parentElement?.querySelector('.field-error');
  if (error) {
    input.style.borderColor = 'var(--danger)';
    if (!errorEl && input.parentElement) {
      errorEl = document.createElement('span');
      errorEl.className = 'field-error';
      errorEl.style.cssText = 'color:var(--danger);font-size:12px;margin-top:4px;display:block;';
      input.parentElement.appendChild(errorEl);
    }
    if (errorEl) errorEl.textContent = error;
    return false;
  }

  input.style.borderColor = '';
  if (errorEl) errorEl.remove();
  return true;
}

function validateForm(form) {
  const fields = $$('input[required], textarea[required], select[required]', form);
  const results = fields.map(validateField);
  const valid = results.every(Boolean);
  if (!valid) dbgWarn('VALIDATE', `Form #${form.id} failed validation — ${results.filter(r => !r).length} invalid field(s)`);
  return valid;
}

function formToObject(form) {
  const data = new FormData(form);
  return Object.fromEntries(
    [...data.entries()].map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])
  );
}

function setButtonLoading(button, isLoading, text = 'Submitting…') {
  if (!button) return;
  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.textContent = text;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

/* ============================================================
   AUTH FORMS  (login / sign up / reset)
   ============================================================ */
function initAuthForms() {
  const signupForm = $('#signupPanel') || $('#signupForm');
  const loginForm  = $('#loginPanel')  || $('#loginForm');
  const resetForm  = $('#resetPanel')  || $('#resetPasswordForm');

  dbgInfo('AUTH', 'initAuthForms — wiring form event listeners', {
    foundLogin: !!loginForm, foundSignup: !!signupForm, foundReset: !!resetForm
  });

  /* ── SIGN UP ── */
  signupForm?.addEventListener('submit', async e => {
    e.preventDefault();
    dbgInfo('AUTH/SIGNUP', 'Form submitted');

    if (!validateForm(signupForm)) {
      dbgWarn('AUTH/SIGNUP', 'Validation failed — aborting');
      return;
    }

    const btn  = $('button[type="submit"]', signupForm);
    const data = formToObject(signupForm);
    dbgInfo('AUTH/SIGNUP', `Calling createUserWithEmailAndPassword for: ${data.email}`);

    try {
      setButtonLoading(btn, true, 'Creating account…');
      const t0 = performance.now();
      const credential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      dbgSuccess('AUTH/SIGNUP', `createUserWithEmailAndPassword resolved in ${(performance.now()-t0).toFixed(0)}ms`, {
        uid: credential.user.uid, email: credential.user.email
      });

      dbgInfo('AUTH/SIGNUP', `Calling updateProfile to set displayName: "${data.name}"`);
      await updateProfile(credential.user, { displayName: data.name });
      dbgSuccess('AUTH/SIGNUP', 'updateProfile resolved — displayName set');

      signupForm.reset();
      showToast('Account created successfully!', 'success');
      dbgInfo('AUTH/SIGNUP', 'Redirecting to index.html in 900ms');
      window.setTimeout(() => { window.location.href = 'index.html'; }, 900);

    } catch (error) {
      dbgError('AUTH/SIGNUP', `createUserWithEmailAndPassword failed: ${error.code}`, {
        code: error.code, message: error.message
      });
      showToast(firebaseErrorMessage(error), 'error');
    } finally {
      setButtonLoading(btn, false);
    }
  });

  /* ── LOGIN ── */
  loginForm?.addEventListener('submit', async e => {
    e.preventDefault();
    dbgInfo('AUTH/LOGIN', 'Form submitted');

    if (!validateForm(loginForm)) {
      dbgWarn('AUTH/LOGIN', 'Validation failed — aborting');
      return;
    }

    const btn  = $('button[type="submit"]', loginForm);
    const data = formToObject(loginForm);
    dbgInfo('AUTH/LOGIN', `Calling signInWithEmailAndPassword for: ${data.email}`);

    try {
      setButtonLoading(btn, true, 'Signing in…');
      const t0 = performance.now();
      const credential = await signInWithEmailAndPassword(auth, data.email, data.password);
      dbgSuccess('AUTH/LOGIN', `signInWithEmailAndPassword resolved in ${(performance.now()-t0).toFixed(0)}ms`, {
        uid: credential.user.uid, email: credential.user.email
      });

      loginForm.reset();
      showToast('Signed in successfully!', 'success');
      dbgInfo('AUTH/LOGIN', 'Redirecting to index.html in 900ms');
      window.setTimeout(() => { window.location.href = 'index.html'; }, 900);

    } catch (error) {
      dbgError('AUTH/LOGIN', `signInWithEmailAndPassword failed: ${error.code}`, {
        code: error.code, message: error.message
      });
      showToast(firebaseErrorMessage(error), 'error');
    } finally {
      setButtonLoading(btn, false);
    }
  });

  /* ── RESET PASSWORD ── */
  resetForm?.addEventListener('submit', async e => {
    e.preventDefault();
    dbgInfo('AUTH/RESET', 'Form submitted');

    if (!validateForm(resetForm)) {
      dbgWarn('AUTH/RESET', 'Validation failed — aborting');
      return;
    }

    const btn  = $('button[type="submit"]', resetForm);
    const data = formToObject(resetForm);
    dbgInfo('AUTH/RESET', `Calling sendPasswordResetEmail for: ${data.email}`);

    try {
      setButtonLoading(btn, true, 'Sending link…');
      const t0 = performance.now();
      await sendPasswordResetEmail(auth, data.email);
      dbgSuccess('AUTH/RESET', `sendPasswordResetEmail resolved in ${(performance.now()-t0).toFixed(0)}ms`);

      resetForm.reset();
      showToast('Password reset email sent.', 'success');

    } catch (error) {
      dbgError('AUTH/RESET', `sendPasswordResetEmail failed: ${error.code}`, {
        code: error.code, message: error.message
      });
      showToast(firebaseErrorMessage(error), 'error');
    } finally {
      setButtonLoading(btn, false);
    }
  });

  /* ── Tab switching (old-style panels for non-auth.html pages) ── */
  $$('.auth-tabs button').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.target;
      dbgInfo('UI', `Auth tab switched to: ${target}`);
      $$('.auth-tabs button').forEach(btn => btn.classList.toggle('active', btn === tab));
      $$('.auth-panel').forEach(panel => panel.classList.toggle('active', panel.id === target));
    });
  });
}

/* ============================================================
   REPORTS (lost / found)
   ============================================================ */
async function submitReport(form) {
  if (!currentUser) {
    dbgWarn('REPORT', 'submitReport called without authenticated user — redirecting to auth.html');
    showToast('Please sign in before submitting a report.', 'error');
    window.setTimeout(() => { window.location.href = 'auth.html'; }, 900);
    return;
  }

  if (!validateForm(form)) {
    dbgWarn('REPORT', `Form #${form.id} failed validation`);
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  const btn  = $('button[type="submit"]', form) || $('button', form);
  const data = formToObject(form);
  const type = form.dataset.reportType || data.type || 'lost';

  dbgInfo('REPORT', `Submitting ${type} report to Firestore/items`, {
    itemName: data.itemName, category: data.category, location: data.location
  });

  try {
    setButtonLoading(btn, true);
    const t0 = performance.now();
    const docRef = await addDoc(collection(db, 'items'), {
      ...data,
      type,
      status:        type === 'lost' ? 'lost' : 'found',
      userId:        currentUser.uid,
      reporterName:  currentUser.displayName || data.reporterName || '',
      reporterEmail: currentUser.email,
      createdAt:     serverTimestamp(),
      updatedAt:     serverTimestamp()
    });
    dbgSuccess('REPORT', `addDoc resolved in ${(performance.now()-t0).toFixed(0)}ms — doc ID: ${docRef.id}`);

    form.reset();
    showToast('Your report has been saved to Firebase.', 'success');

  } catch (error) {
    dbgError('REPORT', `addDoc to items failed: ${error.code}`, {
      code: error.code, message: error.message
    });
    showToast(firebaseErrorMessage(error), 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

function initReportForms() {
  const forms = $$('form.report-form');
  dbgInfo('REPORT', `initReportForms — found ${forms.length} report form(s)`);

  forms.forEach(form => {
    form.addEventListener('submit', e => {
      e.preventDefault();
      submitReport(form);
    });

    $$('input, textarea, select', form).forEach(field => {
      field.addEventListener('blur',  () => validateField(field));
      field.addEventListener('input', () => {
        if (field.style.borderColor === 'var(--danger)') validateField(field);
      });
    });
  });
}

/* ============================================================
   CONTACT FORM
   ============================================================ */
function initContactForm() {
  const form = $('form.contact-form');
  if (!form) { dbgInfo('CONTACT', 'No contact form on this page — skipping'); return; }

  dbgInfo('CONTACT', 'Wiring contact form submit listener');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    dbgInfo('CONTACT', 'Contact form submitted');

    if (!validateForm(form)) {
      dbgWarn('CONTACT', 'Validation failed — aborting');
      return;
    }

    const btn  = $('button[type="submit"]', form) || $('button', form);
    const data = formToObject(form);

    dbgInfo('CONTACT', `Calling addDoc on Firestore/messages`, {
      name: data.name, email: data.email
    });

    try {
      setButtonLoading(btn, true, 'Sending…');
      const t0 = performance.now();
      const docRef = await addDoc(collection(db, 'messages'), {
        ...data,
        userId:    currentUser?.uid   || null,
        userEmail: currentUser?.email || data.email || null,
        createdAt: serverTimestamp()
      });
      dbgSuccess('CONTACT', `addDoc resolved in ${(performance.now()-t0).toFixed(0)}ms — doc ID: ${docRef.id}`);

      form.reset();
      showToast('Message saved. We will be in touch soon.', 'success');

    } catch (error) {
      dbgError('CONTACT', `addDoc to messages failed: ${error.code}`, {
        code: error.code, message: error.message
      });
      showToast(firebaseErrorMessage(error), 'error');
    } finally {
      setButtonLoading(btn, false);
    }
  });
}

/* ============================================================
   LIVE ITEM CARDS (Firestore onSnapshot)
   ============================================================ */
function itemCard(item) {
  const title       = item.itemName   || item.title       || 'Unnamed item';
  const location    = item.location   || 'Location not provided';
  const category    = item.category   || 'Other';
  const description = item.details    || item.description || 'No description provided.';
  const date        = item.date       || item.lostDate    || item.foundDate || '';
  const contact     = item.contact    || item.phone       || item.reporterEmail || 'Contact through platform';
  const imageUrl    = item.imageUrl || `https://picsum.photos/seed/default-${encodeURIComponent(title)}/520/320`;

  return `
    <article class="item-card card" data-category="${escapeHtml(category)}">
      <img class="item-card-image" src="${imageUrl}" alt="Image for ${escapeHtml(title)}">
      <div class="item-badge ${escapeHtml(item.type || '')}">${escapeHtml(item.type || 'item')}</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
      <div class="item-meta">
        <span><strong>Category:</strong> ${escapeHtml(category)}</span>
        <span><strong>Location:</strong> ${escapeHtml(location)}</span>
        ${date ? `<span><strong>Date:</strong> ${escapeHtml(date)}</span>` : ''}
        <span><strong>Contact:</strong> ${escapeHtml(contact)}</span>
      </div>
    </article>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function initLiveItems() {
  const container = $('#itemsContainer');
  if (!container) { dbgInfo('FIRESTORE', 'No #itemsContainer on this page — skipping onSnapshot'); return; }

  const type = container.dataset.type;
  dbgInfo('FIRESTORE', `initLiveItems — setting up onSnapshot listener`, { filterType: type || 'all' });

  const queryLimit = type ? 100 : 50;
  const q = query(collection(db, 'items'), orderBy('createdAt', 'desc'), limit(queryLimit));

  container.innerHTML = '<p class="loading-message">Loading reports from Firebase…</p>';

  let firstSnapshot = true;

  onSnapshot(q, snapshot => {
    const elapsed = firstSnapshot ? ' (initial load)' : ' (real-time update)';
    firstSnapshot = false;
    dbgSuccess('FIRESTORE', `onSnapshot fired${elapsed}`, {
      docsCount: snapshot.size, empty: snapshot.empty, filterType: type || 'all'
    });

    if (snapshot.empty) {
      dbgInfo('FIRESTORE', 'Snapshot is empty — showing empty state');
      container.innerHTML = '<p id="noResults" class="empty-state">No reports found yet. Be the first to submit one.</p>';
      return;
    }

    const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const filteredDocs = type ? docs.filter(item => item.type === type) : docs;

    if (filteredDocs.length === 0) {
      dbgInfo('FIRESTORE', `No ${type} reports found in the latest ${queryLimit} documents`);
      container.innerHTML = '<p id="noResults" class="empty-state">No matching reports found.</p>';
      return;
    }

    container.innerHTML = filteredDocs.map(item => itemCard(item)).join('') +
      '<p id="noResults" class="empty-state" style="display:none;">No matching reports found.</p>';

    dbgInfo('FIRESTORE', `Rendered ${filteredDocs.length} item card(s)`);
    initSearch();

  }, error => {
    dbgError('FIRESTORE', `onSnapshot error: ${error.code}`, {
      code: error.code, message: error.message
    });
    container.innerHTML = '<p class="empty-state">Unable to load Firebase reports. Please check Firestore rules and internet access.</p>';
    showToast(firebaseErrorMessage(error), 'error', 6000);
  });
}

/* ============================================================
   SEARCH & FILTER
   ============================================================ */
function initSearch() {
  const searchInput  = $('#searchInput');
  const filterSelect = $('#categoryFilter');
  const cards = $$('.item-card');

  if (!searchInput && !filterSelect) {
    dbgInfo('SEARCH', 'No search/filter controls found — skipping');
    return;
  }

  dbgInfo('SEARCH', `initSearch — watching ${cards.length} cards`);

  function applyFilter() {
    const queryText = (searchInput ? searchInput.value : '').toLowerCase().trim();
    const category  = filterSelect ? filterSelect.value.toLowerCase() : '';
    let visible = 0;

    cards.forEach(card => {
      const text    = card.textContent.toLowerCase();
      const cardCat = (card.dataset.category || '').toLowerCase();
      const match   = (!queryText || text.includes(queryText)) && (!category || cardCat === category);
      card.style.display = match ? '' : 'none';
      if (match) visible++;
    });

    dbgInfo('SEARCH', `Filter applied — ${visible}/${cards.length} visible`, { query: queryText, category });

    const noResultsEl = $('#noResults');
    if (noResultsEl) noResultsEl.style.display = visible === 0 ? 'block' : 'none';
  }

  searchInput?.addEventListener('input', applyFilter);
  searchInput?.addEventListener('keydown', e => {
    if (e.key === 'Escape') { searchInput.value = ''; applyFilter(); }
  });
  filterSelect?.addEventListener('change', applyFilter);
}

/* ============================================================
   FAQ ACCORDION
   ============================================================ */
function initFAQ() {
  const items = $$('.faq-item');
  dbgInfo('UI', `initFAQ — found ${items.length} FAQ items`);
  items.forEach(item => {
    const question = $('.faq-question', item);
    question?.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      $$('.faq-item.open').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });
}

/* ============================================================
   SCROLL / ANIMATION
   ============================================================ */
function initScrollAnimations() {
  const candidates = $$('.card, .contact-card, .faq-item, .feature-item, .stat-item, .auth-card');
  dbgInfo('UI', `initScrollAnimations — observing ${candidates.length} elements`);

  if (!('IntersectionObserver' in window)) {
    candidates.forEach(el => el.classList.add('fade-in'));
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('fade-in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  candidates.forEach(el => observer.observe(el));
}

function animateCounter(el, target, duration = 1600) {
  let start = 0;
  const step = timestamp => {
    if (!start) start = timestamp;
    const progress = Math.min((timestamp - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(ease * target).toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = target.toLocaleString();
  };
  requestAnimationFrame(step);
}

function initCounters() {
  const numbers = $$('.stat-number[data-target]');
  if (!numbers.length || !('IntersectionObserver' in window)) return;

  dbgInfo('UI', `initCounters — animating ${numbers.length} stat counter(s)`);

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const target = parseInt(entry.target.dataset.target, 10);
        if (!Number.isNaN(target)) animateCounter(entry.target, target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  numbers.forEach(el => observer.observe(el));
}

function initScrollTop() {
  const btn = document.createElement('button');
  btn.className = 'btn btn-primary';
  btn.innerHTML = '↑';
  btn.title = 'Back to top';
  btn.style.cssText = 'position:fixed;bottom:28px;right:28px;width:44px;height:44px;padding:0;border-radius:50%;display:none;align-items:center;justify-content:center;font-size:18px;font-weight:700;z-index:90;box-shadow:0 4px 18px rgba(0,200,232,0.4);';
  document.body.appendChild(btn);
  window.addEventListener('scroll', () => { btn.style.display = window.scrollY > 400 ? 'flex' : 'none'; }, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

function initHeaderScroll() {
  const header = $('header');
  if (!header) return;
  window.addEventListener('scroll', () => {
    header.style.boxShadow = window.scrollY > 10
      ? '0 4px 30px rgba(0,0,0,0.3)'
      : '0 2px 20px rgba(0,0,0,0.25)';
  }, { passive: true });
}

/* ============================================================
   MISC UI
   ============================================================ */
function enrichFooter() {
  const footer = $('footer');
  if (!footer || footer.querySelector('.footer-links')) return;
  footer.innerHTML = `
    <div class="footer-links">
      <a href="about.html">About</a>
      <a href="faq.html">FAQ</a>
      <a href="contact.html">Contact</a>
      <a href="privacy.html">Privacy Policy</a>
    </div>` + footer.innerHTML;
}

function initCharCounters() {
  $$('textarea[maxlength]').forEach(ta => {
    if (ta.parentElement?.querySelector('.char-counter')) return;
    const max = parseInt(ta.getAttribute('maxlength'), 10);
    const counter = document.createElement('div');
    counter.className = 'char-counter';
    counter.textContent = `0 / ${max}`;
    ta.parentElement.appendChild(counter);
    ta.addEventListener('input', () => {
      const len = ta.value.length;
      counter.textContent = `${len} / ${max}`;
      counter.style.color = len > max * 0.9 ? 'var(--warning)' : 'var(--text-muted)';
    });
  });
}

function initPageTransitions() {
  document.addEventListener('click', e => {
    const link = e.target.closest('a');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto')) return;
    if (href.endsWith('.html') || href === 'index.html') {
      e.preventDefault();
      dbgInfo('NAV', `Page transition → ${href}`);
      document.body.style.transition = 'opacity 0.2s ease';
      document.body.style.opacity = '0';
      setTimeout(() => { window.location.href = href; }, 200);
    }
  });
}

/* ============================================================
   BOOTSTRAP
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  dbgInfo('BOOT', `DOMContentLoaded — page: ${location.pathname.split('/').pop() || 'index.html'}`);

  setActiveNav();
  initAuthObserver();
  initMobileMenu();
  initAuthForms();
  initReportForms();
  initContactForm();
  initLiveItems();
  initSearch();
  initFAQ();
  initScrollAnimations();
  initCounters();
  initScrollTop();
  initHeaderScroll();
  enrichFooter();
  initCharCounters();
  initPageTransitions();

  document.body.style.opacity = '0';
  document.body.style.transition = 'opacity 0.3s ease';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.body.style.opacity = '1';
    dbgSuccess('BOOT', 'Page fully initialised and visible');
  }));
});

window.LostFound = { showToast, dbg };
