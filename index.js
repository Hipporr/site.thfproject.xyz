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
    burgerBtn:   '#burgerbtn',
    mobileNav:   '#mobnav',
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
   EASTER EGGS
───────────────────────────────────────────── */

/** Hidden interactive surprises scattered through the page. */
class EasterEggs {
  /** Wire up every hidden interaction. Each is self-contained and no-ops if its target is missing. */
  init() {
    this.#logoGlitch();
    this.#creeperPeek();
    this.#itemDrop();
    this.#endCityRise();
    this.#secretGallerySlot();
    this.#banScreen();
  }

  /** Flash a toast reusing the site's own copy-toast element. */
  #flashToast(message) {
    const el = qs(CONFIG.selectors.copyToast);
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), CONFIG.toast.displayMs);
  }

  /** Click the hero wordmark 10x for a glitch flicker + chiptune ding. */
  #logoGlitch() {
    const logo = qs('.hero-logo');
    if (!logo) return;
    const COLORS = ['#e04918', '#4ade80', '#38bdf8', '#f5c400', '#ff00ff', '#00ffff', '#ffffff'];
    let clicks = 0;
    logo.style.cursor = 'pointer';

    logo.addEventListener('click', () => {
      if (++clicks < 10) return;
      clicks = 0;
      let i = 0;
      const iv = setInterval(() => {
        logo.style.filter = `hue-rotate(${Math.random() * 360}deg) brightness(${1 + Math.random() * 2})`;
        logo.style.transform = `skewX(${(Math.random() - 0.5) * 18}deg)`;
        logo.style.color = COLORS[Math.floor(Math.random() * COLORS.length)];
        if (++i > 18) {
          clearInterval(iv);
          logo.style.filter = '';
          logo.style.transform = '';
          logo.style.color = '';
        }
      }, 70);

      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.4);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start(); osc.stop(ctx.currentTime + 0.5);
      } catch { /* AudioContext unavailable — skip the ding */ }
    });
  }

  /** Hover the status dot for 5s to reveal a pixel creeper face beside it. */
  #creeperPeek() {
    const dot = qs(CONFIG.selectors.statusDot);
    if (!dot) return;
    let timer = null;
    let face = null;

    dot.addEventListener('mouseenter', () => { timer = setTimeout(reveal, 5000); });
    dot.addEventListener('mouseleave', () => clearTimeout(timer));

    function reveal() {
      if (face) return;
      face = document.createElement('span');
      face.innerHTML = `<svg width="20" height="20" viewBox="0 0 8 8" style="image-rendering:pixelated">
        <rect width="8" height="8" fill="#3a7a3a"/><rect x="1" y="2" width="2" height="2" fill="#000"/>
        <rect x="5" y="2" width="2" height="2" fill="#000"/><rect x="3" y="4" width="2" height="1" fill="#000"/>
        <rect x="2" y="5" width="4" height="1" fill="#000"/><rect x="2" y="6" width="1" height="1" fill="#000"/>
        <rect x="5" y="6" width="1" height="1" fill="#000"/></svg>`;
      face.style.cssText = 'display:inline-flex;margin-left:8px;opacity:0;transition:opacity .4s;vertical-align:middle;';
      dot.parentNode.insertBefore(face, dot.nextSibling);
      requestAnimationFrame(() => { face.style.opacity = '1'; });
      setTimeout(() => {
        face.style.opacity = '0';
        setTimeout(() => { face?.remove(); face = null; }, 500);
      }, 3000);
    }
  }

  /** Click the "Item Drop" stat card 5x to watch a random item fall down the page. */
  #itemDrop() {
    const card = qs('#sc2');
    if (!card) return;
    const ITEMS = [
      'diamond', 'iron_ingot', 'gold_ingot', 'emerald', 'netherite_ingot',
      'totem_of_undying', 'elytra', 'ender_pearl', 'tnt', 'gravel',
    ];
    const BASE       = 'https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21/assets/minecraft/textures/item/';
    const BLOCK_BASE = 'https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21/assets/minecraft/textures/block/';
    const BLOCK_ITEMS = ['tnt', 'gravel'];
    let clicks = 0;
    card.style.cursor = 'pointer';

    card.addEventListener('click', () => {
      if (++clicks < 5) return;
      clicks = 0;
      const name = ITEMS[Math.floor(Math.random() * ITEMS.length)];
      const src  = (BLOCK_ITEMS.includes(name) ? BLOCK_BASE : BASE) + name + '.png';

      const el = document.createElement('img');
      el.src = src;
      el.style.cssText = `
        position:fixed; z-index:9999; pointer-events:none;
        width:44px; height:44px; image-rendering:pixelated;
        left:${Math.random() * 80 + 10}vw; top:-60px;
        transition: top 2.2s cubic-bezier(.2,.8,.4,1), opacity .4s;
      `;
      document.body.appendChild(el);
      requestAnimationFrame(() => { el.style.top = '95vh'; });
      setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 500);
      }, 2000);
    });
  }

  /** Click the "Vanilla Structures" feature card 4x to raise an end city from behind it. */
  #endCityRise() {
    const card = Array.from(document.querySelectorAll('.fcard'))
      .find((c) => c.querySelector('h3')?.textContent.includes('Vanilla'));
    if (!card) return;

    card.style.cursor   = 'pointer';
    card.style.position = 'relative';
    card.style.overflow = 'hidden';
    card.insertAdjacentHTML('beforeend', `<svg id="endcity-svg" viewBox="0 0 40 60" style="
        position:absolute; bottom:-70px; left:50%; transform:translateX(-50%);
        width:52px; height:78px; pointer-events:none; opacity:.85; image-rendering:pixelated;
        transition:bottom 1.4s cubic-bezier(.2,.8,.3,1);">
      <rect x="12" y="20" width="16" height="40" fill="#c79ee8"/>
      <rect x="10" y="16" width="4" height="6" fill="#b87de0"/>
      <rect x="16" y="14" width="4" height="8" fill="#b87de0"/>
      <rect x="22" y="16" width="4" height="6" fill="#b87de0"/>
      <rect x="17" y="26" width="6" height="6" fill="#1a0030"/>
      <rect x="17" y="38" width="6" height="6" fill="#1a0030"/>
      <rect x="18" y="10" width="4" height="4" fill="#ffe066" opacity=".9"/>
    </svg>`);
    const city = card.querySelector('#endcity-svg');

    let clicks = 0;
    card.addEventListener('click', () => {
      if (++clicks !== 4) return;
      city.style.bottom = '0px';
      card.style.boxShadow = '0 0 24px #b87de0';
      setTimeout(() => { card.style.boxShadow = ''; }, 1800);
    });
  }

  /** Hover (or tap) all 6 gallery shots to reveal a mysterious 7th slot. */
  #secretGallerySlot() {
    const grid = qs('.shot-grid');
    if (!grid) return;
    const imgs = Array.from(grid.querySelectorAll('img'));
    const hovered = new Set();
    let revealed = false;

    const mark = (i) => {
      hovered.add(i);
      if (hovered.size === imgs.length && !revealed) {
        revealed = true;
        this.#revealSecretSlot(grid);
      }
    };
    imgs.forEach((img, i) => {
      img.addEventListener('mouseenter', () => mark(i));
      img.addEventListener('touchstart', () => mark(i), { passive: true });
    });
  }

  /** Append and fade in the secret gallery slot. */
  #revealSecretSlot(grid) {
    const slot = document.createElement('div');
    slot.style.cssText = `
      position:relative; overflow:hidden; cursor:pointer; background:#0a0a0a;
      aspect-ratio:16/9; display:flex; align-items:center; justify-content:center;
      opacity:0; transition:opacity .8s, color .4s;
      font-family:'Space Mono',monospace; font-size:clamp(.9rem,2.5vw,1.4rem);
      color:rgba(240,236,227,.15); letter-spacing:.3em;
    `;
    slot.textContent = '???';
    slot.addEventListener('mouseenter', () => { slot.style.color = 'rgba(240,236,227,.55)'; });
    slot.addEventListener('mouseleave', () => { slot.style.color = 'rgba(240,236,227,.15)'; });
    slot.addEventListener('click', () => this.#flashToast('Nothing here. Yet.'));

    grid.appendChild(slot);
    requestAnimationFrame(() => requestAnimationFrame(() => { slot.style.opacity = '1'; }));
  }

  /** Click the "cheating" rule 3x for a fake ban screen. */
  #banScreen() {
    const rule = Array.from(document.querySelectorAll('.rule-item.no'))
      .find((r) => r.textContent.toLowerCase().includes('cheating'));
    if (!rule) return;
    rule.style.cursor = 'pointer';
    let clicks = 0;

    rule.addEventListener('click', () => {
      if (++clicks < 3) return;
      clicks = 0;

      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position:fixed; inset:0; z-index:99999; background:#c6503a;
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        text-align:center; padding:40px; font-family:'Syne',sans-serif;
      `;
      overlay.innerHTML = `
        <div style="font-size:clamp(1.4rem,4vw,2.4rem);font-weight:900;color:#fff;margin-bottom:1.4rem;line-height:1.2;">
          You have been banned<br>from this server.
        </div>
        <div style="font-family:'Space Mono',monospace;font-size:.8rem;color:rgba(255,255,255,.75);margin-bottom:.5rem;">
          Reason:
        </div>
        <div style="font-family:'Space Mono',monospace;font-size:1rem;color:#ffe066;margin-bottom:2.2rem;">
          Cheating
        </div>
        <button id="ban-dismiss" style="
          font-family:'Syne',sans-serif; font-weight:700; font-size:.85rem;
          background:#fff; color:#c6503a; border:none; border-radius:4px;
          padding:.8rem 1.6rem; cursor:pointer;">Back to Title Screen</button>
      `;
      document.body.appendChild(overlay);
      overlay.querySelector('#ban-dismiss').addEventListener('click', () => {
        overlay.style.transition = 'opacity .3s';
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 300);
      });
    });
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
   * Attach delegated click + keyboard (Enter/Space) handlers for all
   * [data-copy-text] elements. Replaces the previous global copyText() function.
   */
  #bindCopyDelegation() {
    const trigger = (e) => {
      const target = e.target.closest('[data-copy-text]');
      if (!target) return;
      this.#copyText(target.dataset.copyText, target.dataset.copyLabel);
    };
    document.addEventListener('click', trigger);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (!e.target.closest('[data-copy-text]')) return;
      e.preventDefault();
      trigger(e);
    });
  }

  /** Wire up the hamburger button to open/close the mobile nav panel. */
  #bindMobileNav() {
    const burger = qs(CONFIG.selectors.burgerBtn);
    const panel  = qs(CONFIG.selectors.mobileNav);
    if (!burger || !panel) return;

    burger.addEventListener('click', () => {
      const open = panel.classList.toggle('open');
      burger.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', String(open));
    });

    panel.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
      panel.classList.remove('open');
      burger.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
    }));
  }

  /** Initialise all modules. */
  init() {
    this.#carousel.init();
    this.#scrollManager.init(this.#carousel);
    this.#statusChecker.init();
    this.#bindCopyDelegation();
    this.#bindMobileNav();
    new EasterEggs().init();
  }
}

/* ─────────────────────────────────────────────
   BOOT
───────────────────────────────────────────── */

const app = new ThfApp();
app.init();
