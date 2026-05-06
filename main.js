/* ============================================================
   LOST & FOUND — Professional JavaScript
   Handles: nav, mobile menu, active links, forms, FAQ,
            search/filter, toast notifications, animations,
            item cards, contact form, counters
   ============================================================ */

(function () {
  'use strict';

  /* ── Helpers ─────────────────────────────────────────── */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  /* ── Active Nav Link ─────────────────────────────────── */
  function setActiveNav() {
    const current = location.pathname.split('/').pop() || 'index.html';
    $$('nav a').forEach(a => {
      const href = a.getAttribute('href');
      if (href === current) {
        a.classList.add('active');
      } else {
        a.classList.remove('active');
      }
    });
  }

  /* ── Mobile Hamburger Menu ───────────────────────────── */
  function initMobileMenu() {
    const header = $('header');
    if (!header) return;

    // Inject hamburger button if not present
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

    // Close on nav link click
    $$('nav a').forEach(a => {
      a.addEventListener('click', () => {
        hamburger.classList.remove('open');
        nav.classList.remove('open');
      });
    });

    // Close on outside click
    document.addEventListener('click', e => {
      if (!header.contains(e.target)) {
        hamburger.classList.remove('open');
        nav.classList.remove('open');
      }
    });
  }

  /* ── Toast Notifications ─────────────────────────────── */
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

  /* ── Animate on Scroll ───────────────────────────────── */
  function initScrollAnimations() {
    const candidates = $$('.card, .contact-card, .faq-item, .feature-item, .stat-item');
    if (!('IntersectionObserver' in window)) {
      candidates.forEach(el => el.classList.add('fade-in'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('fade-in');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    candidates.forEach(el => observer.observe(el));
  }

  /* ── Animated Counters ───────────────────────────────── */
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
    if (!numbers.length) return;

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const target = parseInt(entry.target.dataset.target);
          if (!isNaN(target)) animateCounter(entry.target, target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    numbers.forEach(el => observer.observe(el));
  }

  /* ── FAQ Accordion ───────────────────────────────────── */
  function initFAQ() {
    $$('.faq-item').forEach(item => {
      const question = $('.faq-question', item);
      if (!question) return;

      question.addEventListener('click', () => {
        const isOpen = item.classList.contains('open');
        // Close all
        $$('.faq-item.open').forEach(i => i.classList.remove('open'));
        // Toggle clicked
        if (!isOpen) item.classList.add('open');
      });
    });
  }

  /* ── Generic Form Validation ─────────────────────────── */
  function validateField(input) {
    const value = input.value.trim();
    let error = '';

    if (input.hasAttribute('required') && !value) {
      error = 'This field is required.';
    } else if (input.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      error = 'Please enter a valid email address.';
    } else if (input.type === 'password' && value && value.length < 8) {
      error = 'Password must be at least 8 characters.';
    }

    let errorEl = input.parentElement.querySelector('.field-error');
    if (error) {
      input.style.borderColor = 'var(--danger)';
      if (!errorEl) {
        errorEl = document.createElement('span');
        errorEl.className = 'field-error';
        errorEl.style.cssText = 'color:var(--danger);font-size:12px;margin-top:4px;display:block;';
        input.parentElement.appendChild(errorEl);
      }
      errorEl.textContent = error;
      return false;
    } else {
      input.style.borderColor = '';
      if (errorEl) errorEl.remove();
      return true;
    }
  }

  function validateForm(form) {
    const fields = $$('input[required], textarea[required], select[required]', form);
    return fields.map(validateField).every(Boolean);
  }

  /* ── Report Lost / Report Found Forms ────────────────── */
  function initReportForms() {
    $$('form.report-form').forEach(form => {
      form.addEventListener('submit', e => {
        e.preventDefault();
        if (!validateForm(form)) {
          showToast('Please fill in all required fields.', 'error');
          return;
        }
        // Simulate submission
        const btn = $('button[type="submit"]', form) || $('button', form);
        if (btn) {
          const original = btn.textContent;
          btn.textContent = 'Submitting…';
          btn.disabled = true;
          setTimeout(() => {
            btn.textContent = original;
            btn.disabled = false;
            form.reset();
            showToast('Your report has been submitted successfully!', 'success');
          }, 1200);
        }
      });

      // Inline validation on blur
      $$('input, textarea, select', form).forEach(field => {
        field.addEventListener('blur', () => validateField(field));
        field.addEventListener('input', () => {
          if (field.style.borderColor === 'var(--danger)') validateField(field);
        });
      });
    });
  }

  /* ── Contact Form ────────────────────────────────────── */
  function initContactForm() {
    const form = $('form.contact-form') || $('.contact-section form');
    if (!form) return;

    form.addEventListener('submit', e => {
      e.preventDefault();
      const btn = $('button', form);
      if (btn) {
        const original = btn.textContent;
        btn.textContent = 'Sending…';
        btn.disabled = true;
        setTimeout(() => {
          btn.textContent = original;
          btn.disabled = false;
          form.reset();
          showToast('Message sent! We\'ll be in touch soon.', 'success');
        }, 1000);
      }
    });
  }

  /* ── Search & Filter (Lost / Found Items) ────────────── */
  function initSearch() {
    const searchInput = $('#searchInput');
    const filterSelect = $('#categoryFilter');
    const cards = $$('.item-card');

    if (!searchInput && !filterSelect) return;

    function applyFilter() {
      const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
      const category = filterSelect ? filterSelect.value.toLowerCase() : '';

      cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        const cardCat = (card.dataset.category || '').toLowerCase();

        const matchesSearch = !query || text.includes(query);
        const matchesCat = !category || cardCat === category;

        card.style.display = matchesSearch && matchesCat ? '' : 'none';
      });

      const visible = cards.filter(c => c.style.display !== 'none');
      const noResultsEl = $('#noResults');
      if (noResultsEl) {
        noResultsEl.style.display = visible.length === 0 ? 'block' : 'none';
      }
    }

    if (searchInput) {
      searchInput.addEventListener('input', applyFilter);
      searchInput.addEventListener('keydown', e => {
        if (e.key === 'Escape') { searchInput.value = ''; applyFilter(); }
      });
    }

    if (filterSelect) filterSelect.addEventListener('change', applyFilter);
  }

  /* ── Scroll to Top Button ────────────────────────────── */
  function initScrollTop() {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.innerHTML = '↑';
    btn.title = 'Back to top';
    btn.style.cssText = `
      position:fixed; bottom:28px; right:28px;
      width:44px; height:44px; padding:0;
      border-radius:50%;
      display:none;
      align-items:center; justify-content:center;
      font-size:18px; font-weight:700;
      z-index:90;
      box-shadow: 0 4px 18px rgba(0,200,232,0.4);
    `;
    document.body.appendChild(btn);

    window.addEventListener('scroll', () => {
      btn.style.display = window.scrollY > 400 ? 'flex' : 'none';
    });

    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ── Sticky Header Shadow ────────────────────────────── */
  function initHeaderScroll() {
    const header = $('header');
    if (!header) return;
    window.addEventListener('scroll', () => {
      header.style.boxShadow = window.scrollY > 10
        ? '0 4px 30px rgba(0,0,0,0.3)'
        : '0 2px 20px rgba(0,0,0,0.25)';
    }, { passive: true });
  }

  /* ── Dynamic Footer Links ───────────────────────────── */
  function enrichFooter() {
    const footer = $('footer');
    if (!footer || footer.querySelector('.footer-links')) return;

    const linksHtml = `
      <div class="footer-links">
        <a href="about.html">About</a>
        <a href="faq.html">FAQ</a>
        <a href="contact.html">Contact</a>
        <a href="privacy.html">Privacy Policy</a>
        <a href="terms.html">Terms</a>
      </div>`;
    footer.innerHTML = linksHtml + footer.innerHTML;
  }

  /* ── Character Counter for Textareas ─────────────────── */
  function initCharCounters() {
    $$('textarea[maxlength]').forEach(ta => {
      const max = parseInt(ta.getAttribute('maxlength'));
      const counter = document.createElement('div');
      counter.style.cssText = 'text-align:right;font-size:11px;color:var(--text-muted);margin-top:4px;';
      counter.textContent = `0 / ${max}`;
      ta.parentElement.appendChild(counter);

      ta.addEventListener('input', () => {
        const len = ta.value.length;
        counter.textContent = `${len} / ${max}`;
        counter.style.color = len > max * 0.9 ? 'var(--warning)' : 'var(--text-muted)';
      });
    });
  }

  /* ── Smooth link transitions ─────────────────────────── */
  function initPageTransitions() {
    document.addEventListener('click', e => {
      const link = e.target.closest('a');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto')) return;

      // Only internal .html links
      if (href.endsWith('.html') || href === 'index.html') {
        e.preventDefault();
        document.body.style.transition = 'opacity 0.2s ease';
        document.body.style.opacity = '0';
        setTimeout(() => { window.location.href = href; }, 200);
      }
    });
  }

  /* ── Init All ────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    setActiveNav();
    initMobileMenu();
    initScrollAnimations();
    initCounters();
    initFAQ();
    initReportForms();
    initContactForm();
    initSearch();
    initScrollTop();
    initHeaderScroll();
    enrichFooter();
    initCharCounters();
    initPageTransitions();

    // Fade in body on load
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.3s ease';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { document.body.style.opacity = '1'; });
    });
  });

  // Expose showToast globally so inline HTML can use it
  window.LostFound = { showToast };

})();
