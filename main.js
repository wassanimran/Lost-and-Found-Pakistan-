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
    'auth/email-already-in-use': 'This email is already registered. Please sign in instead.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/user-not-found': 'No account exists with this email address.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'permission-denied': 'Firebase permission denied. Please check Firestore security rules.'
  };
  return messages[code] || error?.message || 'Something went wrong. Please try again.';
}

function setActiveNav() {
  const current = location.pathname.split('/').pop() || 'index.html';
  $$('nav a').forEach(a => {
    const href = a.getAttribute('href');
    a.classList.toggle('active', href === current);
  });
}

function injectAuthNav() {
  const nav = $('nav');
  if (!nav || $('#authNavLink')) return;

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
    try {
      await signOut(auth);
      showToast('You have been signed out.', 'success');
    } catch (error) {
      showToast(firebaseErrorMessage(error), 'error');
    }
  });
}

function updateAuthUI(user) {
  currentUser = user;
  const authLink = $('#authNavLink');
  const logoutBtn = $('#logoutBtn');
  const authStatus = $('#authStatus');
  const userName = user?.displayName || user?.email || 'User';

  if (authLink) {
    authLink.textContent = user ? `Hi, ${userName.split('@')[0]}` : 'Login';
    authLink.href = user ? 'auth.html' : 'auth.html';
  }
  if (logoutBtn) logoutBtn.hidden = !user;
  if (authStatus) {
    authStatus.textContent = user
      ? `Signed in as ${userName}. Reports you submit will be linked to this account.`
      : 'Sign in or create an account to report lost and found items.';
  }

  $$('[data-auth-required]').forEach(el => {
    el.disabled = !user;
  });
}

function initAuthObserver() {
  injectAuthNav();
  onAuthStateChanged(auth, updateAuthUI);
}

function initMobileMenu() {
  const header = $('header');
  if (!header) return;

  if (!$('.hamburger')) {
    const btn = document.createElement('button');
    btn.className = 'hamburger';
    btn.setAttribute('aria-label', 'Toggle menu');
    btn.innerHTML = '<span></span><span></span><span></span>';
    header.appendChild(btn);
  }

  const hamburger = $('.hamburger');
  const nav = $('nav');
  if (!hamburger || !nav) return;

  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    nav.classList.toggle('open');
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
  return fields.map(validateField).every(Boolean);
}

function formToObject(form) {
  const data = new FormData(form);
  return Object.fromEntries([...data.entries()].map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));
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

function initAuthForms() {
  const signupForm = $('#signupForm');
  const loginForm = $('#loginForm');
  const resetForm = $('#resetPasswordForm');

  signupForm?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validateForm(signupForm)) return;
    const btn = $('button[type="submit"]', signupForm);
    const data = formToObject(signupForm);

    try {
      setButtonLoading(btn, true, 'Creating account…');
      const credential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      await updateProfile(credential.user, { displayName: data.name });
      signupForm.reset();
      showToast('Account created successfully!', 'success');
      window.setTimeout(() => { window.location.href = 'index.html'; }, 900);
    } catch (error) {
      showToast(firebaseErrorMessage(error), 'error');
    } finally {
      setButtonLoading(btn, false);
    }
  });

  loginForm?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validateForm(loginForm)) return;
    const btn = $('button[type="submit"]', loginForm);
    const data = formToObject(loginForm);

    try {
      setButtonLoading(btn, true, 'Signing in…');
      await signInWithEmailAndPassword(auth, data.email, data.password);
      loginForm.reset();
      showToast('Signed in successfully!', 'success');
      window.setTimeout(() => { window.location.href = 'index.html'; }, 900);
    } catch (error) {
      showToast(firebaseErrorMessage(error), 'error');
    } finally {
      setButtonLoading(btn, false);
    }
  });

  resetForm?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validateForm(resetForm)) return;
    const btn = $('button[type="submit"]', resetForm);
    const data = formToObject(resetForm);

    try {
      setButtonLoading(btn, true, 'Sending link…');
      await sendPasswordResetEmail(auth, data.email);
      resetForm.reset();
      showToast('Password reset email sent.', 'success');
    } catch (error) {
      showToast(firebaseErrorMessage(error), 'error');
    } finally {
      setButtonLoading(btn, false);
    }
  });

  $$('.auth-tabs button').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.target;
      $$('.auth-tabs button').forEach(btn => btn.classList.toggle('active', btn === tab));
      $$('.auth-panel').forEach(panel => panel.classList.toggle('active', panel.id === target));
    });
  });
}

async function submitReport(form) {
  if (!currentUser) {
    showToast('Please sign in before submitting a report.', 'error');
    window.setTimeout(() => { window.location.href = 'auth.html'; }, 900);
    return;
  }

  if (!validateForm(form)) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  const btn = $('button[type="submit"]', form) || $('button', form);
  const data = formToObject(form);
  const type = form.dataset.reportType || data.type || 'lost';

  try {
    setButtonLoading(btn, true);
    await addDoc(collection(db, 'items'), {
      ...data,
      type,
      status: type === 'lost' ? 'lost' : 'found',
      userId: currentUser.uid,
      reporterName: currentUser.displayName || data.reporterName || '',
      reporterEmail: currentUser.email,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    form.reset();
    showToast('Your report has been saved to Firebase.', 'success');
  } catch (error) {
    showToast(firebaseErrorMessage(error), 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

function initReportForms() {
  $$('form.report-form').forEach(form => {
    form.addEventListener('submit', e => {
      e.preventDefault();
      submitReport(form);
    });

    $$('input, textarea, select', form).forEach(field => {
      field.addEventListener('blur', () => validateField(field));
      field.addEventListener('input', () => {
        if (field.style.borderColor === 'var(--danger)') validateField(field);
      });
    });
  });
}

function initContactForm() {
  const form = $('form.contact-form');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validateForm(form)) return;
    const btn = $('button[type="submit"]', form) || $('button', form);
    const data = formToObject(form);

    try {
      setButtonLoading(btn, true, 'Sending…');
      await addDoc(collection(db, 'messages'), {
        ...data,
        userId: currentUser?.uid || null,
        userEmail: currentUser?.email || data.email || null,
        createdAt: serverTimestamp()
      });
      form.reset();
      showToast('Message saved. We will be in touch soon.', 'success');
    } catch (error) {
      showToast(firebaseErrorMessage(error), 'error');
    } finally {
      setButtonLoading(btn, false);
    }
  });
}

function itemCard(item) {
  const title = item.itemName || item.title || 'Unnamed item';
  const location = item.location || 'Location not provided';
  const category = item.category || 'Other';
  const description = item.details || item.description || 'No description provided.';
  const date = item.date || item.lostDate || item.foundDate || '';
  const contact = item.contact || item.phone || item.reporterEmail || 'Contact through platform';

  return `
    <article class="item-card card" data-category="${escapeHtml(category)}">
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
  if (!container) return;

  const type = container.dataset.type;
  const constraints = [orderBy('createdAt', 'desc'), limit(50)];
  if (type) constraints.unshift(where('type', '==', type));
  const q = query(collection(db, 'items'), ...constraints);

  container.innerHTML = '<p class="loading-message">Loading reports from Firebase…</p>';

  onSnapshot(q, snapshot => {
    if (snapshot.empty) {
      container.innerHTML = '<p id="noResults" class="empty-state">No reports found yet. Be the first to submit one.</p>';
      return;
    }

    container.innerHTML = snapshot.docs.map(doc => itemCard({ id: doc.id, ...doc.data() })).join('') +
      '<p id="noResults" class="empty-state" style="display:none;">No matching reports found.</p>';
    initSearch();
  }, error => {
    container.innerHTML = '<p class="empty-state">Unable to load Firebase reports. Please check Firestore rules and internet access.</p>';
    showToast(firebaseErrorMessage(error), 'error', 6000);
  });
}

function initSearch() {
  const searchInput = $('#searchInput');
  const filterSelect = $('#categoryFilter');
  const cards = $$('.item-card');
  if (!searchInput && !filterSelect) return;

  function applyFilter() {
    const queryText = (searchInput ? searchInput.value : '').toLowerCase().trim();
    const category = filterSelect ? filterSelect.value.toLowerCase() : '';

    cards.forEach(card => {
      const text = card.textContent.toLowerCase();
      const cardCat = (card.dataset.category || '').toLowerCase();
      const matchesSearch = !queryText || text.includes(queryText);
      const matchesCat = !category || cardCat === category;
      card.style.display = matchesSearch && matchesCat ? '' : 'none';
    });

    const visible = cards.filter(c => c.style.display !== 'none');
    const noResultsEl = $('#noResults');
    if (noResultsEl) noResultsEl.style.display = visible.length === 0 ? 'block' : 'none';
  }

  searchInput?.addEventListener('input', applyFilter);
  searchInput?.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      applyFilter();
    }
  });
  filterSelect?.addEventListener('change', applyFilter);
}

function initFAQ() {
  $$('.faq-item').forEach(item => {
    const question = $('.faq-question', item);
    question?.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      $$('.faq-item.open').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });
}

function initScrollAnimations() {
  const candidates = $$('.card, .contact-card, .faq-item, .feature-item, .stat-item, .auth-card');
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
    header.style.boxShadow = window.scrollY > 10 ? '0 4px 30px rgba(0,0,0,0.3)' : '0 2px 20px rgba(0,0,0,0.25)';
  }, { passive: true });
}

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
      document.body.style.transition = 'opacity 0.2s ease';
      document.body.style.opacity = '0';
      setTimeout(() => { window.location.href = href; }, 200);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
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
  requestAnimationFrame(() => requestAnimationFrame(() => { document.body.style.opacity = '1'; }));
});

window.LostFound = { showToast };
