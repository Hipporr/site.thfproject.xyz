/**
 * thfProject — Main site controller
 *
 * Architecture: Class-based ES6+
 *  - ThfApp        : Application bootstrap and event delegation
 *  - Carousel      : Hero image slideshow with keyboard & dot navigation
 *  - ScrollManager : Throttled scroll handler (navbar, parallax, reveal)
 *  - Toast         : Copy-to-clipboard feedback overlay
 *  - StatusChecker : Periodic Minecraft server status polling
 */

'use strict';

/* ─────────────────────────────────────────────
   CONFIG — single source of truth for all
   hard-coded values and selector strings
───────────────────────────────────────────── */

/** @type {Object} Site-wide configuration constants */
const CONFIG = {
  carousel: {
    /** Auto-advance interval in milliseconds */
    interval: 4500,
    images: [
      'img/1.webp',
      'img/2.webp',
      'img/3.webp',
      'img/4.webp',
      'img/5.webp',
      'img/6.webp',
    ],
  },
  scroll: {
    /** Scroll distance (px) before navbar gains glass effect */
    navbarThreshold: 30,
    /** Fraction of hero height at which parallax fade is complete */
    parallaxFadeFraction: 0.55,
    /** Multiplier for hero-overlay opacity reduction */
    overlayFadeFactor: 0.5,
    /** Multiplier for hero-content opacity reduction */
    contentFadeFactor: 2.5,
    /** Fraction of viewport height used as reveal threshold */
    revealThreshold: 0.9,
    /** Minimum ms between scroll handler invocations (throttle) */
    throttleMs: 16,
  },
  toast: {
    /** Duration (ms) the toast remains visible */
    displayMs: 1800,
    defaultMessage: 'Copied!',
  },
  status: {
    /** Minecraft server hostname */
    host: 'thfproject.xyz',
    /** mcstatus.io API base URL */
    apiUrl: 'https://api.mcstatus.io/v2/status/java/',
    /** Polling interval in milliseconds */
    pollInterval: 30000,
  },
  selectors: {
    navbar:      '#navbar',
    hero:        '#hero',
    heroOverlay: '#hero-overlay',
    heroContent: '#hero-content',
    navDots:     '#nav-dots',
    copyToast:   '#copy-toast',
    statusDot:   '#status-dot',
    playerText:  '#player-text',
    revealEls: [
      '#info-text',
      '#sc1',
      '#sc2',
      '#sc3',
      '.fcard',
      '#join-cards',
      '#rules-box',
    ],
  },
};

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

/**
 * Safely query a single element; returns null and warns if missing.
 * @param {string} selector - CSS selector
 * @param {ParentNode} [root=document]
 * @returns {Element|null}
 */
function qs(selector, root = document) {
  const el = root.querySelector(selector);
  if (!el) console.warn(`[thf] Element not found: ${selector}`);
  return el;
}

/**
 * Returns a throttled version of the given function.
 * @param {Function} fn - Function to throttle
 * @param {number} limitMs - Minimum ms between calls
 * @returns {Function}
 */
function throttle(fn, limitMs) {
  let lastCall = 0;
  return function throttled(...args) {
    const now = Date.now();
    if (now - lastCall >= limitMs) {
      lastCall = now;
      fn.apply(this, args);
    }
  };
}

/* ─────────────────────────────────────────────
   CAROUSEL
───────────────────────────────────────────── */

/**
 * Hero image carousel with auto-advance, dot navigation and
 * keyboard left/right arrow support.
 */
class Carousel {
  /** @type {string[]} */ #images;
  /** @type {number} */   #interval;
  /** @type {Element|null} */ #heroEl;
  /** @type {Element|null} */ #dotsWrap;
  /** @type {HTMLElement[]} */ #slides = [];
  /** @type {HTMLElement[]} */ #dotEls = [];
  /** @type {number} */ #current = 0;
  /** @type {number|null} */ #timer = null;

  constructor() {
    this.#images   = CONFIG.carousel.images;
    this.#interval = CONFIG.carousel.interval;
    this.#heroEl   = qs(CONFIG.selectors.hero);
    this.#dotsWrap = qs(CONFIG.selectors.navDots);
  }

  /**
   * Navigate to a specific slide index.
   * @param {number} index - Target slide index
   */
  goTo(index) {
    if (!this.#slides.length) return;
    this.#slides[this.#current].classList.remove('active');
    this.#dotEls[this.#current].classList.remove('active');
    this.#dotEls[this.#current].setAttribute('aria-selected', 'false');
    this.#current = ((index % this.#slides.length) + this.#slides.length) % this.#slides.length;
    this.#slides[this.#current].classList.add('active');
    this.#dotEls[this.#current].classList.add('active');
    this.#dotEls[this.#current].setAttribute('aria-selected', 'true');
  }

  /** Advance to the next slide. */
  #next() {
    this.goTo(this.#current + 1);
  }

  /** Start the auto-advance timer. */
  #startTimer() {
    this.#timer = setInterval(() => this.#next(), this.#interval);
  }

  /** @returns {HTMLElement[]} Current slide elements */
  getSlides() { return this.#slides; }

  /** @returns {number} Index of the currently active slide */
  getCurrent() { return this.#current; }

  /** Build slide and dot elements, attach keyboard listener, then start the timer. */
  init() {
    if (!this.#heroEl || !this.#dotsWrap) return;

    this.#slides = this.#images.map((src, i) => {
      const div = document.createElement('div');
      div.className = `slide${i === 0 ? ' active' : ''}`;
      div.style.backgroundImage = `url(${src})`;
      this.#heroEl.insertBefore(div, this.#heroEl.firstChild);
      return div;
    });

    this.#dotEls = this.#images.map((_, i) => {
      const dot = document.createElement('div');
      dot.className = `ndot${i === 0 ? ' active' : ''}`;
      dot.setAttribute('role', 'tab');
      dot.setAttribute('tabindex', '0');
      dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
      dot.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      dot.addEventListener('click', () => this.goTo(i));
      dot.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.goTo(i);
        }
      });
      this.#dotsWrap.appendChild(dot);
      return dot;
    });

    document.addEventListener('keydown', (e) => {
      // Only handle arrow keys when no interactive element has focus,
      // to avoid conflicting with form inputs, textareas, etc.
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft')       this.goTo(this.#current - 1);
      else if (e.key === 'ArrowRight') this.#next();
    });

    this.#startTimer();
  }
}

/* ─────────────────────────────────────────────
   SCROLL MANAGER
───────────────────────────────────────────── */

/**
 * Handles all scroll-driven behaviour:
 *  - Navbar glass effect
 *  - Hero parallax / fade-out
 *  - Reveal animations for sections entering the viewport
 */
class ScrollManager {
  /** @type {Element|null} */ #navbar;
  /** @type {Element|null} */ #heroOverlay;
  /** @type {Element|null} */ #heroContent;

  constructor() {
    this.#navbar      = qs(CONFIG.selectors.navbar);
    this.#heroOverlay = qs(CONFIG.selectors.heroOverlay);
    this.#heroContent = qs(CONFIG.selectors.heroContent);
  }

  /** Toggle the glass-effect class on the navbar. */
  #updateNavbar() {
    if (!this.#navbar) return;
    this.#navbar.classList.toggle('scrolled', window.scrollY > CONFIG.scroll.navbarThreshold);
  }

  /**
   * Apply parallax fade to the active hero slide, overlay, and content.
   * @param {HTMLElement[]} slides - Array of slide elements
   * @param {Element|null} heroEl  - Hero section element
   */
  #updateParallax(slides, heroEl) {
    if (!heroEl) return;
    const { parallaxFadeFraction, overlayFadeFactor, contentFadeFactor } = CONFIG.scroll;
    const progress = Math.min(window.scrollY / (heroEl.offsetHeight * parallaxFadeFraction), 1);

    slides.forEach((s) => {
      s.style.opacity = s.classList.contains('active') ? String(1 - progress) : '0';
    });

    if (this.#heroOverlay) {
      this.#heroOverlay.style.opacity = String(1 - progress * overlayFadeFactor);
    }
    if (this.#heroContent) {
      this.#heroContent.style.opacity = String(Math.max(0, 1 - progress * contentFadeFactor));
    }
  }

  /** Add the "visible" class to any tracked elements that have entered the viewport. */
  checkVisible() {
    const threshold = window.innerHeight * CONFIG.scroll.revealThreshold;

    CONFIG.selectors.revealEls.forEach((selector) => {
      try {
        document.querySelectorAll(selector).forEach((el) => {
          if (el.getBoundingClientRect().top < threshold) {
            el.classList.add('visible');
          }
        });
      } catch (err) {
        console.warn(`[thf] Invalid reveal selector: ${selector}`, err);
      }
    });
  }

  /**
   * Attach the (throttled) scroll listener and run an initial check.
   * @param {Carousel} carousel - Carousel instance to read slides from
   */
  init(carousel) {
    const heroEl = qs(CONFIG.selectors.hero);
    const slides = carousel.getSlides();

    const onScroll = throttle(() => {
      this.#updateNavbar();
      this.#updateParallax(slides, heroEl);
      this.checkVisible();
    }, CONFIG.scroll.throttleMs);

    window.addEventListener('scroll', onScroll, { passive: true });

    // Run once on load so elements already in view animate immediately.
    this.#updateNavbar();
    this.#updateParallax(slides, heroEl);
    this.checkVisible();
  }
}

/* ─────────────────────────────────────────────
   TOAST
───────────────────────────────────────────── */

/** Lightweight copy-feedback toast notification. */
class Toast {
  /** @type {Element|null} */                     #toastEl;
  /** @type {number} */                           #displayMs;
  /** @type {string} */                           #defaultMessage;
  /** @type {ReturnType<typeof setTimeout>|null} */ #timer = null;

  constructor() {
    this.#displayMs      = CONFIG.toast.displayMs;
    this.#defaultMessage = CONFIG.toast.defaultMessage;
    this.#toastEl        = qs(CONFIG.selectors.copyToast);
  }

  /**
   * Show the toast with the given message.
   * @param {string} [message] - Text to display (defaults to CONFIG value)
   */
  show(message = this.#defaultMessage) {
    if (!this.#toastEl) return;
    this.#toastEl.textContent = message;
    this.#toastEl.classList.add('show');
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#toastEl.classList.remove('show'), this.#displayMs);
  }
}

/* ─────────────────────────────────────────────
   STATUS CHECKER
───────────────────────────────────────────── */

/** Polls the Minecraft server status API and updates the UI. */
class StatusChecker {
  /** @type {string} */      #host;
  /** @type {string} */      #apiUrl;
  /** @type {number} */      #pollInterval;
  /** @type {Element|null} */ #statusDot;
  /** @type {Element|null} */ #playerText;

  constructor() {
    const { host, apiUrl, pollInterval } = CONFIG.status;
    this.#host         = host;
    this.#apiUrl       = apiUrl;
    this.#pollInterval = pollInterval;
    this.#statusDot    = qs(CONFIG.selectors.statusDot);
    this.#playerText   = qs(CONFIG.selectors.playerText);
  }

  /**
   * Format player count as a human-readable string.
   * @param {number} n - Number of online players
   * @returns {string}
   */
  #formatPlayerCount(n) {
    return n === 1 ? '1 player online' : `${n} players online`;
  }

  /**
   * Update the UI to reflect the given online/offline state.
   * @param {boolean} online  - Whether the server is reachable
   * @param {number}  [count] - Player count when online
   */
  #updateUI(online, count = 0) {
    if (this.#statusDot) {
      this.#statusDot.className = online ? 'status-dot' : 'status-dot offline';
    }
    if (this.#playerText) {
      this.#playerText.textContent = online ? this.#formatPlayerCount(count) : 'Server offline';
    }
  }

  /**
   * Fetch current server status from the API and update the UI.
   * @returns {Promise<void>}
   */
  async #fetch() {
    try {
      const response = await window.fetch(`${this.#apiUrl}${this.#host}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      this.#updateUI(data.online === true, data.players?.online ?? 0);
    } catch (err) {
      console.warn('[thf] Could not reach status API:', err);
      if (this.#statusDot)  this.#statusDot.className    = 'status-dot offline';
      if (this.#playerText) this.#playerText.textContent = 'Could not reach server';
    }
  }

  /** Run an initial status check and schedule periodic polling. */
  init() {
    this.#fetch();
    setInterval(() => this.#fetch(), this.#pollInterval);
  }
}

/* ─────────────────────────────────────────────
   APP BOOTSTRAP
───────────────────────────────────────────── */

/**
 * Main application class — wires up all modules and handles
 * global event delegation (copy-to-clipboard).
 */
class ThfApp {
  /** @type {Carousel} */       #carousel;
  /** @type {ScrollManager} */  #scrollManager;
  /** @type {Toast} */          #toast;
  /** @type {StatusChecker} */  #statusChecker;

  constructor() {
    this.#carousel      = new Carousel();
    this.#scrollManager = new ScrollManager();
    this.#toast         = new Toast();
    this.#statusChecker = new StatusChecker();
  }

  /**
   * Copy text to the clipboard and show a toast notification.
   * @param {string} text    - Text to copy
   * @param {string} [label] - Optional toast message
   */
  #copyText(text, label) {
    navigator.clipboard.writeText(text).then(
      () => this.#toast.show(label),
      (err) => {
        console.warn('[thf] Clipboard write failed:', err);
        this.#toast.show('Copy failed — please try again');
      },
    );
  }

  /**
   * Attach delegated click handler for all [data-copy-text] elements.
   * Replaces the previous global copyText() function.
   */
  #bindCopyDelegation() {
    document.addEventListener('click', (e) => {
      const target = e.target.closest('[data-copy-text]');
      if (!target) return;
      const text  = target.dataset.copyText;
      const label = target.dataset.copyLabel;
      this.#copyText(text, label);
    });
  }

  /** Initialise all modules. */
  init() {
    this.#carousel.init();
    this.#scrollManager.init(this.#carousel);
    this.#statusChecker.init();
    this.#bindCopyDelegation();
  }
}

/* ─────────────────────────────────────────────
   BOOT
───────────────────────────────────────────── */

const app = new ThfApp();
app.init();
