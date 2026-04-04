/**
 * Common: load config, global helpers
 */
(function () {
  window.DAOP = window.DAOP || {};
  const BASE = window.DAOP.basePath || '';

  /** Đồng bộ với public/data/build_version.json — đính ?v= vào URL /data/* để tránh cache CDN sau deploy. */
  window.DAOP.ensureDataCacheBust = function () {
    window.DAOP = window.DAOP || {};
    if (window.DAOP._dataCacheBustPromise) return window.DAOP._dataCacheBustPromise;
    if (window.DAOP._dataCacheBust) return Promise.resolve(window.DAOP._dataCacheBust);
    window.DAOP._dataCacheBustPromise = fetch(BASE + '/data/build_version.json', { cache: 'no-store' })
      .then(function (r) {
        return r.ok ? r.json() : {};
      })
      .then(function (ver) {
        var q = ver && ver.builtAt ? '?v=' + encodeURIComponent(ver.builtAt) : '';
        window.DAOP._dataCacheBust = q;
        return q;
      })
      .catch(function () {
        window.DAOP._dataCacheBust = '';
        return '';
      });
    return window.DAOP._dataCacheBustPromise;
  };

  /** Một lần fetch site-settings cho toàn trang (tránh trùng giữa loading screen, CategoryPage, search…). */
  window.DAOP.ensureSiteSettingsLoaded = function (skipHomeBootstrapPromise) {
    window.DAOP = window.DAOP || {};
    if (window.DAOP._siteSettingsFetchDone) {
      return Promise.resolve(window.DAOP.siteSettings || {});
    }
    try {
      if (window.DAOP.siteSettings && typeof window.DAOP.siteSettings === 'object' && Object.keys(window.DAOP.siteSettings).length > 0) {
        window.DAOP._siteSettingsFetchDone = true;
        return Promise.resolve(window.DAOP.siteSettings);
      }
    } catch (e0) {}
    if (!skipHomeBootstrapPromise && window.DAOP._siteSettingsLoadPromise) {
      return window.DAOP._siteSettingsLoadPromise.then(function (s) {
        if (s && typeof s === 'object' && Object.keys(s).length > 0) {
          window.DAOP._siteSettingsFetchDone = true;
          return s;
        }
        return window.DAOP.ensureSiteSettingsLoaded(true);
      });
    }
    if (window.DAOP._siteSettingsPromise) return window.DAOP._siteSettingsPromise;
    window.DAOP._siteSettingsPromise = (typeof window.DAOP.ensureDataCacheBust === 'function'
      ? window.DAOP.ensureDataCacheBust()
      : Promise.resolve('')
    ).then(function (q) {
      var url = BASE + '/data/config/site-settings.json' + (q || '');
      return fetch(url)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (s) {
          window.DAOP._siteSettingsFetchDone = true;
          if (s && typeof s === 'object') {
            window.DAOP.siteSettings = s;
            if (s.site_name) window.DAOP.siteName = s.site_name;
          }
          return s || {};
        })
        .catch(function () {
          window.DAOP._siteSettingsFetchDone = true;
          return {};
        });
    });
    return window.DAOP._siteSettingsPromise;
  };

  function initThemeToggle() {
    if (!document.body) return;
    var btn = document.getElementById('theme-toggle');
    if (!btn) {
      try {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'theme-toggle';
        btn.className = 'theme-toggle';
        btn.setAttribute('aria-label', 'Bật nền sáng');
        btn.setAttribute('aria-pressed', 'false');
        btn.innerHTML =
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
          '<path fill="currentColor" d="M9 21h6v-1H9v1zm3-20C7.935 1 5 3.935 5 7c0 2.38 1.44 4.41 3.5 5.25V15c0 .55.45 1 1 1h5c.55 0 1-.45 1-1v-2.75C17.56 11.41 19 9.38 19 7c0-3.065-2.935-6-7-6zm2.5 10.43-.5.29V15h-4v-3.28l-.5-.29C8.01 10.67 7 8.92 7 7c0-2.21 2.24-4 5-4s5 1.79 5 4c0 1.92-1.01 3.67-2.5 4.43z"/>' +
          '</svg>';
        document.body.appendChild(btn);
      } catch (e0) {
        return;
      }
    }
    var key = 'daop_theme';
    function getPref() {
      try {
        var v = localStorage.getItem(key);
        return v ? String(v) : '';
      } catch (e) {
        return '';
      }
    }
    function setPref(v) {
      try {
        if (!v) localStorage.removeItem(key);
        else localStorage.setItem(key, String(v));
      } catch (e) {}
    }
    function apply(v) {
      var isLight = v === 'light';
      document.body.classList.toggle('theme-light', isLight);
      btn.setAttribute('aria-pressed', isLight ? 'true' : 'false');
      btn.setAttribute('aria-label', isLight ? 'Bật nền tối' : 'Bật nền sáng');
    }
    var pref = getPref();
    apply(pref === 'light' ? 'light' : 'dark');
    btn.addEventListener('click', function () {
      var isLightNow = document.body.classList.contains('theme-light');
      var next = isLightNow ? 'dark' : 'light';
      setPref(next);
      apply(next);
    });
  }

  function initHotPlayNav() {
    try {
      var header = document.querySelector('.site-header');
      if (!header) return;
      var navMain = header.querySelector('.site-nav-main');
      if (!navMain) return;
      var links = Array.prototype.slice.call(navMain.querySelectorAll('a[href]'));
      var target = null;
      function normalizeTopicHref(href) {
        var s = String(href || '').trim().toLowerCase();
        if (!s) return '';
        // Remove query/hash
        s = s.split('#')[0].split('?')[0];
        // Normalize leading relative prefixes
        while (s.indexOf('../') === 0) s = s.slice(3);
        if (s.indexOf('./') === 0) s = s.slice(2);
        if (s[0] !== '/') s = '/' + s;
        // Ensure trailing slash for folder-like URL
        if (s === '/chu-de') s = '/chu-de/';
        return s;
      }
      for (var i = 0; i < links.length; i++) {
        var a = links[i];
        var href = (a.getAttribute('href') || '').trim();
        var normalized = normalizeTopicHref(href);
        var baseHref = normalizeTopicHref((BASE + '/chu-de/').replace(/\/\//g, '/'));
        if (normalized === '/chu-de/' || normalized === baseHref) {
          target = a;
          break;
        }
      }
      if (!target) return;
      target.textContent = 'Chủ đề';
      target.setAttribute('href', (BASE + '/chu-de/').replace(/\/\//g, '/'));
      if (navMain.firstChild !== target) {
        navMain.insertBefore(target, navMain.firstChild);
      }
    } catch (e) {}
  }

  /** Ẩn màn hình Loading (bật/tắt + thời gian tối đa theo site_settings) */
  function initLoadingScreen() {
    var el = document.getElementById('loading-screen');
    if (!el) return;
    var startTime = Date.now();
    var maxMs = 0;
    var loadComplete = false;
    var hidden = false;
    function hide() {
      if (hidden) return;
      hidden = true;
      el.classList.add('loading-screen-hidden');
      el.setAttribute('aria-hidden', 'true');
    }
    var loadSiteSettings = function () {
      if (window.DAOP && typeof window.DAOP.ensureSiteSettingsLoaded === 'function') {
        return window.DAOP.ensureSiteSettingsLoaded();
      }
      try {
        if (window.DAOP && window.DAOP.siteSettings && typeof window.DAOP.siteSettings === 'object') {
          return Promise.resolve(window.DAOP.siteSettings);
        }
        if (window.DAOP && typeof window.DAOP.loadConfig === 'function') {
          return window.DAOP.loadConfig('site-settings');
        }
      } catch (e0) {}
      return fetch(BASE + '/data/config/site-settings.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    };

    loadSiteSettings().then(function (s) {
      if (s && s.loading_screen_enabled === 'false') {
        hide();
        return;
      }
      var maxSec = Math.max(0, parseInt(s && s.loading_screen_min_seconds, 10) || 0);
      maxMs = maxSec * 1000;
      if (maxMs > 0) {
        setTimeout(function () {
          hide();
        }, maxMs);
      }
      function onLoad() {
        loadComplete = true;
        window.removeEventListener('load', onLoad);
        hide();
      }
      if (document.readyState === 'complete') {
        loadComplete = true;
        hide();
      } else {
        window.addEventListener('load', onLoad);
      }
    }).catch(function () {
      if (document.readyState === 'complete') {
        hide();
      } else {
        window.addEventListener('load', function () { hide(); });
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLoadingScreen);
    document.addEventListener('DOMContentLoaded', initThemeToggle);
    document.addEventListener('DOMContentLoaded', initHotPlayNav);
  } else {
    initLoadingScreen();
    initThemeToggle();
    initHotPlayNav();
  }

  /** Load JSON config from data/config/ */
  window.DAOP.loadConfig = async function (name) {
    const url = `${BASE}/data/config/${name}.json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  };

  window.DAOP.loadBannersConfig = function () {
    window.DAOP = window.DAOP || {};
    if (window.DAOP._bannersPromise) return window.DAOP._bannersPromise;
    window.DAOP._bannersPromise = Promise.resolve()
      .then(function () {
        if (!window.DAOP || typeof window.DAOP.loadConfig !== 'function') return [];
        return window.DAOP.loadConfig('banners');
      })
      .then(function (arr) {
        var list = Array.isArray(arr) ? arr : [];
        list = list.filter(function (b) { return b && b.is_active !== false; });
        list.sort(function (a, b) {
          return (Number(b.priority) || 0) - (Number(a.priority) || 0);
        });
        window.DAOP.banners = list;
        return list;
      })
      .catch(function () {
        window.DAOP.banners = [];
        return [];
      });
    return window.DAOP._bannersPromise;
  };

  /** Một lần fetch static-pages.json (trang Giới thiệu, Liên hệ, …) — có ?v= theo build. */
  window.DAOP.ensureStaticPagesLoaded = function () {
    window.DAOP = window.DAOP || {};
    if (window.DAOP._staticPagesPromise) return window.DAOP._staticPagesPromise;
    window.DAOP._staticPagesPromise = (typeof window.DAOP.ensureDataCacheBust === 'function'
      ? window.DAOP.ensureDataCacheBust()
      : Promise.resolve('')
    ).then(function (q) {
      var url = BASE + '/data/config/static-pages.json' + (q || '');
      return fetch(url)
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (arr) { return Array.isArray(arr) ? arr : []; })
        .catch(function () { return []; });
    });
    return window.DAOP._staticPagesPromise;
  };

  function escAttr(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getBpKey() {
    var w = window.innerWidth || document.documentElement.clientWidth || 0;
    if (w >= 1024) return 'lg';
    if (w >= 768) return 'md';
    if (w >= 480) return 'sm';
    return 'xs';
  }

  function splitPositions(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v.map(function (x) { return String(x || '').trim(); }).filter(Boolean);
    return String(v)
      .split(',')
      .map(function (x) { return String(x || '').trim(); })
      .filter(Boolean);
  }

  function pickBannerByPosition(banners, position) {
    var pos = String(position || '').trim();
    if (!pos) return null;
    var list = Array.isArray(banners) ? banners : [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b) continue;
      var positions = splitPositions(b.position);
      for (var j = 0; j < positions.length; j++) {
        if (positions[j] === pos) return b;
      }
    }
    return null;
  }

  /** Nội dung HTML một banner (ảnh+link hoặc mã nhúng) — dùng chung cho slot và popup. */
  function buildBannerHtml(b) {
    if (!b) return '';
    if (b.html_code) {
      var raw = String(b.html_code);
      var embedMin = (function () {
        try {
          if (/<iframe(\s|>)/i.test(raw)) return 'min(280px, 42vh)';
          if (/<ins(\s|>)/i.test(raw) || /<embed(\s|>)/i.test(raw)) return 'min(200px, 30vh)';
        } catch (eI) {}
        return 'min(120px, 18vh)';
      })();
      return (
        '<div class="ad-embed-wrap" style="min-height:' + embedMin + '">' +
        raw +
        '</div>'
      );
    }
    var norm2 = (window.DAOP && typeof window.DAOP.normalizeImgUrl === 'function')
      ? window.DAOP.normalizeImgUrl
      : function (x) { return x; };
    var img = norm2(b.image_url || '').replace(/^\/\//, 'https://');
    var link = b.link_url || '#';
    return '<a class="ad-banner-link" href="' + escAttr(link) + '" rel="nofollow noopener" target="_blank">' +
      '<img class="ad-banner-img" width="1200" height="400" src="' + escAttr(img) + '" alt="" decoding="async" loading="lazy">' +
      '</a>';
  }

  function readAdSetting(key, defaultVal) {
    try {
      var s = window.DAOP && window.DAOP.siteSettings;
      if (s && s[key] != null && String(s[key]).trim() !== '') return String(s[key]).trim();
    } catch (e0) {}
    return defaultVal;
  }

  function adSettingBool(key, defaultTrue) {
    var v = readAdSetting(key, defaultTrue ? 'true' : 'false').toLowerCase();
    if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
    if (v === '1' || v === 'true' || v === 'on' || v === 'yes') return true;
    return defaultTrue;
  }

  /**
   * Chèn vị trí quảng cáo toàn trang: dải dưới header, thanh neo dưới, góc nổi.
   * Gán banner trong Admin (bảng ad_banners) với position tương ứng: header_strip, sticky_bottom, floating_corner.
   */
  window.DAOP.prepareDynamicAdSlots = function () {
    var header = document.querySelector('.site-header');
    if (header && !document.getElementById('daop-ad-header-strip')) {
      var strip = document.createElement('div');
      strip.id = 'daop-ad-header-strip';
      strip.className = 'ad-slot ad-slot--header-strip';
      strip.setAttribute('data-ad-position', 'header_strip');
      header.parentNode.insertBefore(strip, header.nextSibling);
    }
    if (!document.getElementById('daop-ad-sticky-bottom')) {
      var sticky = document.createElement('div');
      sticky.id = 'daop-ad-sticky-bottom';
      sticky.className = 'ad-slot ad-slot--sticky-bottom';
      sticky.setAttribute('data-ad-position', 'sticky_bottom');
      document.body.appendChild(sticky);
    }
    if (!document.getElementById('daop-ad-floating-corner')) {
      var fl = document.createElement('div');
      fl.id = 'daop-ad-floating-corner';
      fl.className = 'ad-slot ad-slot--floating-corner';
      fl.setAttribute('data-ad-position', 'floating_corner');
      document.body.appendChild(fl);
    }
  };

  function closePopupAd(overlay) {
    if (!overlay || !overlay.parentNode) return;
    overlay.parentNode.removeChild(overlay);
    document.body.classList.remove('daop-ad-popup-open');
    try {
      var h = parseInt(readAdSetting('ad_popup_cooldown_hours', '12'), 10);
      if (!h || h < 1) h = 12;
      localStorage.setItem('daop_popup_ad_until', String(Date.now() + h * 3600000));
    } catch (e1) {}
  }

  function tryShowPopupAd() {
    if (window.DAOP._popupAdDone) return;
    window.DAOP._popupAdDone = true;
    if (!adSettingBool('ad_popup_enabled', true)) return;

    var banners = window.DAOP.banners;
    var b = pickBannerByPosition(banners, 'popup');
    if (!b) return;

    try {
      var until = localStorage.getItem('daop_popup_ad_until');
      if (until && Date.now() < parseInt(until, 10)) return;
    } catch (e2) {}

    var delayMs = parseInt(readAdSetting('ad_popup_delay_ms', '3000'), 10);
    if (isNaN(delayMs) || delayMs < 0) delayMs = 3000;

    setTimeout(function () {
      if (document.getElementById('daop-ad-popup-overlay')) return;
      var innerHtml = buildBannerHtml(b);
      if (!innerHtml) return;

      var overlay = document.createElement('div');
      overlay.id = 'daop-ad-popup-overlay';
      overlay.className = 'ad-popup-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Quảng cáo');

      var panel = document.createElement('div');
      panel.className = 'ad-popup-panel';

      var head = document.createElement('div');
      head.className = 'ad-popup-head';
      var lbl = document.createElement('span');
      lbl.className = 'ad-popup-label';
      lbl.textContent = 'Quảng cáo';
      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'ad-popup-close';
      closeBtn.setAttribute('aria-label', 'Đóng');
      closeBtn.innerHTML = '&times;';
      head.appendChild(lbl);
      head.appendChild(closeBtn);

      var body = document.createElement('div');
      body.className = 'ad-popup-body ad-slot-inner';
      body.innerHTML = innerHtml;

      panel.appendChild(head);
      panel.appendChild(body);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);
      document.body.classList.add('daop-ad-popup-open');

      function onClose() {
        closePopupAd(overlay);
      }
      closeBtn.addEventListener('click', onClose);
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) onClose();
      });
      document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') {
          onClose();
          document.removeEventListener('keydown', esc);
        }
      });
    }, delayMs);
  }

  window.DAOP.renderAdSlot = function (elOrSelector, position) {
    var el = typeof elOrSelector === 'string' ? document.querySelector(elOrSelector) : elOrSelector;
    if (!el) return Promise.resolve(false);
    el.classList.add('ad-slot');
    el.setAttribute('data-bp', getBpKey());
    var pos = String(position || el.getAttribute('data-ad-position') || '').trim();

    return window.DAOP.loadBannersConfig().then(function (banners) {
      var b = pickBannerByPosition(banners, pos);
      if (pos === 'sticky_bottom') {
        try {
          if (sessionStorage.getItem('daop_sticky_dismissed') === '1') {
            el.innerHTML = '';
            el.style.display = 'none';
            document.body.classList.remove('daop-sticky-ad-open');
            return false;
          }
        } catch (e3) {}
      }
      if (pos === 'floating_corner') {
        try {
          if (sessionStorage.getItem('daop_float_dismissed') === '1') {
            el.innerHTML = '';
            el.style.display = 'none';
            return false;
          }
        } catch (e4) {}
      }

      if (!b) {
        el.innerHTML = '';
        el.style.display = 'none';
        if (pos === 'sticky_bottom') document.body.classList.remove('daop-sticky-ad-open');
        return false;
      }
      el.style.display = '';

      var html = buildBannerHtml(b);

      if (pos === 'sticky_bottom') {
        el.innerHTML =
          '<div class="ad-floating-ui ad-sticky-ui">' +
          '<span class="ad-disclosure">Quảng cáo</span>' +
          '<button type="button" class="ad-dismiss" aria-label="Đóng quảng cáo">&times;</button>' +
          '</div>' +
          '<div class="ad-slot-inner">' + html + '</div>';
        document.body.classList.add('daop-sticky-ad-open');
        var dismiss = el.querySelector('.ad-dismiss');
        if (dismiss) {
          dismiss.addEventListener('click', function () {
            el.style.display = 'none';
            document.body.classList.remove('daop-sticky-ad-open');
            try {
              sessionStorage.setItem('daop_sticky_dismissed', '1');
            } catch (e5) {}
          });
        }
      } else if (pos === 'floating_corner') {
        el.innerHTML =
          '<div class="ad-floating-ui">' +
          '<span class="ad-disclosure">QC</span>' +
          '<button type="button" class="ad-dismiss" aria-label="Đóng">&times;</button>' +
          '</div>' +
          '<div class="ad-slot-inner">' + html + '</div>';
        var dismissF = el.querySelector('.ad-dismiss');
        if (dismissF) {
          dismissF.addEventListener('click', function (ev) {
            ev.stopPropagation();
            el.style.display = 'none';
            try {
              sessionStorage.setItem('daop_float_dismissed', '1');
            } catch (e6) {}
          });
        }
      } else if (pos === 'header_strip') {
        el.innerHTML =
          '<div class="ad-strip-bar">' +
          '<span class="ad-disclosure">Quảng cáo</span>' +
          '<div class="ad-slot-inner">' + html + '</div></div>';
      } else {
        el.innerHTML = '<div class="ad-slot-inner">' + html + '</div>';
      }

      return true;
    });
  };

  window.DAOP.renderAdsInDocument = function (root) {
    var r = root || document;

    function collectAdNodes() {
      var nodes = Array.prototype.slice.call(r.querySelectorAll('[data-ad-position]'));
      return nodes.filter(function (el) {
        var p = el.getAttribute('data-ad-position') || '';
        return p !== 'popup';
      });
    }

    function finishPopupAds() {
      if (r !== document) return Promise.resolve();
      if (window.DAOP.ensureSiteSettingsLoaded) {
        return window.DAOP.ensureSiteSettingsLoaded().then(function () {
          tryShowPopupAd();
        });
      }
      tryShowPopupAd();
      return Promise.resolve();
    }

    return window.DAOP.loadBannersConfig().then(function (banners) {
      if (r === document) {
        try {
          if (sessionStorage.getItem('daop_sticky_dismissed') !== '1') {
            if (pickBannerByPosition(banners, 'sticky_bottom')) {
              document.body.classList.add('daop-sticky-ad-open');
            }
          }
        } catch (eSticky) {}

        if (typeof window.DAOP.prepareDynamicAdSlots === 'function') {
          window.DAOP.prepareDynamicAdSlots();
        }

        try {
          var stripEl = document.getElementById('daop-ad-header-strip');
          if (stripEl && pickBannerByPosition(banners, 'header_strip')) {
            stripEl.style.minHeight = 'min(100px, 18vh)';
          }
        } catch (eStrip) {}
      }

      var nodes = collectAdNodes();

      if (!nodes.length) {
        return finishPopupAds().then(function () {
          return false;
        });
      }

      if (r === document && window.DAOP.ensureSiteSettingsLoaded) {
        return window.DAOP.ensureSiteSettingsLoaded().then(function () {
          return Promise.all(
            nodes.map(function (el) {
              var pos = el.getAttribute('data-ad-position') || '';
              return window.DAOP.renderAdSlot(el, pos);
            })
          ).then(function () {
            return finishPopupAds().then(function () {
              return true;
            });
          });
        });
      }

      return Promise.all(
        nodes.map(function (el) {
          var pos2 = el.getAttribute('data-ad-position') || '';
          return window.DAOP.renderAdSlot(el, pos2);
        })
      ).then(function () {
        if (r === document) {
          return finishPopupAds().then(function () {
            return true;
          });
        }
        return true;
      });
    });
  };

  /**
   * Gắn khối chất lượng HLS + tua/tốc độ vào vùng điều khiển của từng player.
   * (Hỗ trợ các player còn lại: plyr, videojs, jwplayer, fluidplayer.)
   */
  window.DAOP.attachPlayerAuxControls = function (scopeEl, videoEl, playerType, extra) {
    extra = extra || {};
    if (!scopeEl || !videoEl) return;
    var quality = scopeEl.querySelector('[data-role="quality"]');
    var playback = scopeEl.querySelector('[data-role="playback"]');
    if (!quality && !playback) return;

    function move(node, parent, before) {
      if (!node || !parent) return;
      try {
        if (before) parent.insertBefore(node, before);
        else parent.appendChild(node);
      } catch (e) {}
    }

    var pt = String(playerType || '').toLowerCase();
    try {
      if (pt === 'plyr') {
        var plyrRoot = videoEl.closest && videoEl.closest('.plyr');
        if (!plyrRoot) return;
        var pctr = plyrRoot.querySelector('.plyr__controls');
        if (quality) move(quality, plyrRoot, pctr);
        if (playback) move(playback, plyrRoot, pctr);
        return;
      }
      if (pt === 'videojs') {
        // Video.js đã có control gốc (seek/speed/quality tùy plugin).
        // Không inject thêm khối quality/playback để tránh trùng/nhảy layout.
        if (quality) quality.style.display = 'none';
        if (playback) playback.style.display = 'none';
        return;
      }
      if (pt === 'jwplayer') {
        // JWPlayer đã có control gốc (seek/speed/quality theo cấu hình setup).
        // Không inject thêm khối quality/playback để tránh trùng giao diện.
        if (quality) quality.style.display = 'none';
        if (playback) playback.style.display = 'none';
        return;
      }
      if (pt === 'fluidplayer') {
        // FluidPlayer đã có control gốc (play/seek/quality/fullscreen).
        // Không inject thêm khối quality/playback do hệ thống của FluidPlayer tự xử lý.
        if (quality) quality.style.display = 'none';
        if (playback) playback.style.display = 'none';
        return;
      }
      var wr = scopeEl.querySelector && scopeEl.querySelector('.watch-player-wrap');
      var anchor = wr || videoEl.parentElement;
      if (!anchor) return;
      anchor.classList.add('player-aux-native-wrap');
      var stack = anchor.querySelector('.player-aux-stack');
      if (!stack) {
        stack = document.createElement('div');
        stack.className = 'player-aux-stack';
        anchor.appendChild(stack);
      }
      if (quality) move(quality, stack, null);
      if (playback) move(playback, stack, null);
    } catch (e) {}
  };

  (function () {
    var _authNavSettingsPromise = null;
    var _authNavSubscribed = false;
    function getCreateClient() {
      if (typeof createClient !== 'undefined') return createClient;
      if (typeof window.supabase !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') return window.supabase.createClient;
      return null;
    }
    function ensurePreconnectJsDelivr() {
      try {
        if (typeof document === 'undefined' || !document.head) return;
        var href = 'https://cdn.jsdelivr.net';
        if (!document.head.querySelector('link[rel="preconnect"][href="' + href + '"]')) {
          var l = document.createElement('link');
          l.rel = 'preconnect';
          l.href = href;
          l.crossOrigin = '';
          document.head.appendChild(l);
        }
        if (!document.head.querySelector('link[rel="dns-prefetch"][href="//cdn.jsdelivr.net"]')) {
          var d = document.createElement('link');
          d.rel = 'dns-prefetch';
          d.href = '//cdn.jsdelivr.net';
          document.head.appendChild(d);
        }
      } catch (e) {}
    }
    function loadSupabaseJsIfNeeded() {
      if (getCreateClient()) return Promise.resolve();
      window.DAOP = window.DAOP || {};
      if (window.DAOP._loadSupabaseJsPromise) return window.DAOP._loadSupabaseJsPromise;
      window.DAOP._loadSupabaseJsPromise = new Promise(function (resolve) {
        ensurePreconnectJsDelivr();
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        s.onload = function () { resolve(); };
        s.onerror = function () { resolve(); };
        document.head.appendChild(s);
      });
      return window.DAOP._loadSupabaseJsPromise;
    }
    window.DAOP.loadSupabaseJsShared = loadSupabaseJsIfNeeded;
    function findAuthLink() {
      var links = Array.prototype.slice.call(document.querySelectorAll('a[href]'));
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute('href') || '';
        if (href === '/login.html' || href.endsWith('/login.html')) return links[i];
      }
      return null;
    }
    function ensureSupabaseUserConfig() {
      var url = window.DAOP && window.DAOP.supabaseUserUrl;
      var key = window.DAOP && window.DAOP.supabaseUserAnonKey;
      if (url && key) return Promise.resolve({ url: url, key: key });
      if (_authNavSettingsPromise) return _authNavSettingsPromise;
      _authNavSettingsPromise = Promise.resolve()
        .then(function () {
          if (window.DAOP && typeof window.DAOP.ensureSiteSettingsLoaded === 'function') {
            return window.DAOP.ensureSiteSettingsLoaded();
          }
          if (!window.DAOP || !window.DAOP.loadConfig) return null;
          return window.DAOP.loadConfig('site-settings');
        })
        .then(function (s) {
          window.DAOP = window.DAOP || {};
          if (s) {
            window.DAOP.siteSettings = window.DAOP.siteSettings || s;
            if (window.DAOP.applySiteSettings) {
              try { window.DAOP.applySiteSettings(s); } catch (e) {}
            }
            if (!window.DAOP.supabaseUserUrl) window.DAOP.supabaseUserUrl = s.supabase_user_url || '';
            if (!window.DAOP.supabaseUserAnonKey) window.DAOP.supabaseUserAnonKey = s.supabase_user_anon_key || '';
          }
          return { url: window.DAOP.supabaseUserUrl, key: window.DAOP.supabaseUserAnonKey };
        })
        .catch(function () {
          return { url: window.DAOP && window.DAOP.supabaseUserUrl, key: window.DAOP && window.DAOP.supabaseUserAnonKey };
        });
      return _authNavSettingsPromise;
    }
    window.DAOP = window.DAOP || {};
    window.DAOP.updateAuthNav = function () {
      var a = findAuthLink();
      if (!a) return Promise.resolve();

      // Tránh nháy chữ "Đăng nhập" do HTML hardcode: set text sớm ngay khi JS chạy.
      try {
        var labelEl0 = a.querySelector && a.querySelector('.nav-text');
        if (labelEl0) labelEl0.textContent = 'Tài khoản';
        else a.textContent = 'Tài khoản';
      } catch (e0) {
        a.textContent = 'Tài khoản';
      }

      return ensureSupabaseUserConfig().then(function (cfg) {
        var url = cfg && cfg.url;
        var key = cfg && cfg.key;
        if (!url || !key) {
          try {
            var labelEl1 = a.querySelector && a.querySelector('.nav-text');
            if (labelEl1) labelEl1.textContent = 'Tài khoản';
            else a.textContent = 'Tài khoản';
          } catch (e1) {
            a.textContent = 'Tài khoản';
          }
          a.setAttribute('href', '/login.html');
          return;
        }

        return loadSupabaseJsIfNeeded().then(function () {
          var cc = getCreateClient();
          if (!cc) return;
          if (!window.DAOP._supabaseUser) window.DAOP._supabaseUser = cc(url, key);

          if (!_authNavSubscribed && window.DAOP._supabaseUser && window.DAOP._supabaseUser.auth && window.DAOP._supabaseUser.auth.onAuthStateChange) {
            _authNavSubscribed = true;
            try {
              window.DAOP._supabaseUser.auth.onAuthStateChange(function () {
                window.DAOP.updateAuthNav();
              });
            } catch (e) {}
          }

          return window.DAOP._supabaseUser.auth.getSession().then(function (res) {
            var user = res && res.data && res.data.session && res.data.session.user;
            if (user) {
              try {
                var labelEl2 = a.querySelector && a.querySelector('.nav-text');
                if (labelEl2) labelEl2.textContent = 'Tài khoản';
                else a.textContent = 'Tài khoản';
              } catch (e2) {
                a.textContent = 'Tài khoản';
              }
              a.setAttribute('href', '/nguoi-dung.html');
            } else {
              try {
                var labelEl3 = a.querySelector && a.querySelector('.nav-text');
                if (labelEl3) labelEl3.textContent = 'Tài khoản';
                else a.textContent = 'Tài khoản';
              } catch (e3) {
                a.textContent = 'Tài khoản';
              }
              a.setAttribute('href', '/login.html');
            }
          }).catch(function () {});
        });
      });
    };

    function scheduleAuthNav() {
      var run = function () {
        window.DAOP.updateAuthNav();
      };
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(run, { timeout: 4000 });
      } else {
        setTimeout(run, 1500);
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', scheduleAuthNav);
    } else {
      scheduleAuthNav();
    }
  })();

  /** Get movie by slug */
  window.DAOP.getMovieBySlug = function () {
    return null;
  };

  function normalizeShardText(s) {
    if (!s) return '';
    var t = String(s).toLowerCase();
    try {
      if (t.normalize) t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch (e) {}
    t = t.replace(/đ/g, 'd');
    return t;
  }

  function getShardKey2(s) {
    var t = normalizeShardText(s);
    if (!t) return '__';
    var a = (t[0] || '').toLowerCase();
    var b = (t[1] || '_').toLowerCase();
    function ok(c) { return /[a-z0-9]/.test(c); }
    var c1 = ok(a) ? a : '_';
    var c2 = ok(b) ? b : '_';
    return c1 + c2;
  }

  /** Trùng scripts/lib/slug-shard.js — dùng cho public/data/ver/*.json (không bỏ dấu slug). */
  window.DAOP.getSlugShard2 = function (slug) {
    var s = String(slug || '').trim().toLowerCase();
    if (!s) return '__';
    function ok(c) { return c && /[a-z0-9]/.test(c); }
    var a = s[0] || '_';
    var b = s[1] || '_';
    return (ok(a) ? a : '_') + (ok(b) ? b : '_');
  };

  window.DAOP.ensureCdnConfigLoaded = function () {
    window.DAOP = window.DAOP || {};
    if (window.DAOP._cdnConfigPromise) return window.DAOP._cdnConfigPromise;
    window.DAOP._cdnConfigPromise = fetch(BASE + '/data/cdn.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; });
    return window.DAOP._cdnConfigPromise;
  };

  /** DOMPurify + /js/comments.js — dùng chung trang chi tiết & xem phim (trang xem không lazy-load sẵn comments.js). */
  window.DAOP.ensureCommentsLibsLoaded = function () {
    try {
      if (typeof window.DAOP.mountComments === 'function') return Promise.resolve(true);
      function loadScript(src) {
        return new Promise(function (resolve) {
          try {
            window.DAOP = window.DAOP || {};
            window.DAOP._loadedScripts = window.DAOP._loadedScripts || {};
            var key = String(src);
            if (window.DAOP._loadedScripts[key]) return resolve(true);
            var s = document.createElement('script');
            s.src = src;
            s.onload = function () { window.DAOP._loadedScripts[key] = true; resolve(true); };
            s.onerror = function () { resolve(false); };
            document.head.appendChild(s);
          } catch (e) { resolve(false); }
        });
      }
      var purify = 'https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js';
      return (typeof window.DAOP.ensureDataCacheBust === 'function'
        ? window.DAOP.ensureDataCacheBust()
        : Promise.resolve(window.DAOP._dataCacheBust || '')
      ).then(function (q) {
        return loadScript(purify).then(function () {
          return loadScript(BASE + '/js/comments.js' + (q || ''));
        });
      });
    } catch (e2) {
      return Promise.resolve(false);
    }
  };

  window.DAOP._verShardCache = window.DAOP._verShardCache || {};
  window.DAOP.fetchVerShard = function (shard) {
    var k = String(shard || '');
    if (window.DAOP._verShardCache[k] != null) {
      return Promise.resolve(window.DAOP._verShardCache[k]);
    }
    return fetch(BASE + '/data/ver/' + encodeURIComponent(k) + '.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (j) {
        window.DAOP._verShardCache[k] = j && typeof j === 'object' ? j : {};
        return window.DAOP._verShardCache[k];
      });
  };

  /** @ref an toàn cho URL jsDelivr: commit hex, main, hoặc tag hợp lệ */
  function sanitizeCdnRef(r) {
    var s = String(r || '').trim();
    if (!s) return 'main';
    if (/^[0-9a-f]{7,40}$/i.test(s)) return s.toLowerCase();
    if (/^[a-zA-Z0-9._-]{1,120}$/.test(s)) return s;
    return 'main';
  }

  window.DAOP.sanitizeCdnRefForFetch = sanitizeCdnRef;

  /**
   * @param {string} slug
   * @param {{ dataVer?: string, dataRef?: string }} opts — dataRef từ ver (commit/main); thiếu → main
   */
  function buildPubjsMovieUrl(slug, opts) {
    opts = opts || {};
    var dataVer = opts.dataVer != null ? String(opts.dataVer) : 'v1.0.0';
    var dataRefRaw = opts.dataRef != null ? String(opts.dataRef).trim() : '';
    return window.DAOP.ensureCdnConfigLoaded().then(function (cfg) {
      var d = (cfg && cfg.pubjs) || {};
      var base = String(d.base || '').replace(/\/+$/, '');
      var ref = dataRefRaw ? sanitizeCdnRef(dataRefRaw) : 'main';
      var prefix = String(d.pathPrefix || 'pubjs').replace(/^\/+|\/+$/g, '');
      var sh = window.DAOP.getSlugShard2(slug);
      var safe = String(slug || '').trim();
      if (!base || !safe) {
        try {
          if (!base && safe && !window.__DAOP_WARNED_PUBJS_BASE__) {
            window.__DAOP_WARNED_PUBJS_BASE__ = true;
            console.warn(
              '[DAOP] public/data/cdn.json → pubjs.base đang trống — không tải được JSON phim đầy đủ (trang chi tiết / xem phim). ' +
                'Trên GitHub: đặt Actions variable PUBJS_CDN_BASE (jsDelivr …/gh/owner/repo) hoặc secret PUBJS_REPO (owner/repo) để build ghi base tự động.'
            );
          }
        } catch (eW) {}
        return '';
      }
      var path = prefix ? prefix + '/' + sh + '/' + encodeURIComponent(safe) + '.json' : sh + '/' + encodeURIComponent(safe) + '.json';
      var url = base + '@' + ref + '/' + path;
      url += (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(dataVer || 'v1.0.0');
      return url;
    });
  }

  function loadScriptOnce(url) {
    return Promise.resolve()
      .then(function () {
        return typeof window.DAOP.ensureDataCacheBust === 'function'
          ? window.DAOP.ensureDataCacheBust()
          : Promise.resolve(window.DAOP && window.DAOP._dataCacheBust ? window.DAOP._dataCacheBust : '');
      })
      .then(function (q) {
        var url2 = url + (q || '');
        return new Promise(function (resolve) {
          if (!url) return resolve(false);
          try {
            window.DAOP = window.DAOP || {};
            window.DAOP._loadedScripts = window.DAOP._loadedScripts || {};
            if (window.DAOP._loadedScripts[url2]) return resolve(true);
            var s = document.createElement('script');
            s.src = url2;
            s.onload = function () {
              window.DAOP._loadedScripts[url2] = true;
              resolve(true);
            };
            s.onerror = function () { resolve(false); };
            document.head.appendChild(s);
          } catch (e) {
            resolve(false);
          }
        });
      });
  }

  /** Tải một lần movies-light.js (khi không inject trong HTML) — dùng fallback gợi ý theo thể loại. */
  window.DAOP.ensureMoviesLightLoaded = function () {
    window.DAOP = window.DAOP || {};
    if (window.DAOP._moviesLightPromise) return window.DAOP._moviesLightPromise;
    try {
      if (Array.isArray(window.moviesLight) && window.moviesLight.length) {
        return Promise.resolve(window.moviesLight);
      }
    } catch (e0) {}
    window.DAOP._moviesLightPromise = loadScriptOnce(BASE + '/data/movies-light.js').then(function () {
      try {
        return Array.isArray(window.moviesLight) ? window.moviesLight : [];
      } catch (e1) {
        return [];
      }
    });
    return window.DAOP._moviesLightPromise;
  };

  function applyRootIndexMeta(meta) {
    try {
      if (!meta || typeof meta !== 'object') return;
      var bs = meta.batchSize != null ? parseInt(meta.batchSize, 10) : NaN;
      if (!isFinite(bs) || bs < 1) {
        bs = meta.baseBatchSize != null ? parseInt(meta.baseBatchSize, 10) : NaN;
      }
      if (isFinite(bs) && bs > 0) {
        window.DAOP = window.DAOP || {};
        window.DAOP.batchSize = bs;
      }
    } catch (e) {}
  }

  /** batchSize từ index/meta.json (sau preload); fallback 120 — tương thích meta cũ. */
  function getEffectiveBatchSize() {
    var bs = window.DAOP && window.DAOP.batchSize;
    var n = parseInt(bs, 10);
    return isFinite(n) && n > 0 ? n : 120;
  }

  function loadIndexMetaOnce() {
    window.DAOP = window.DAOP || {};
    if (window.DAOP._indexMetaPromise) return window.DAOP._indexMetaPromise;
    window.DAOP._indexMetaPromise = (typeof window.DAOP.ensureDataCacheBust === 'function'
      ? window.DAOP.ensureDataCacheBust()
      : Promise.resolve('')
    ).then(function (q) {
      var url = BASE + '/data/index/meta.json' + (q || '');
      return fetch(url, { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    }).then(function (meta) {
      applyRootIndexMeta(meta);
      return meta;
    });
    return window.DAOP._indexMetaPromise;
  }

  /** Gọi sớm (vd. trang chi tiết phim) để batchSize khớp build trước khi resolve đường dẫn batch. */
  window.DAOP.preloadIndexMeta = function () {
    return loadIndexMetaOnce();
  };

  function loadSlugIndexMetaOnce() {
    window.DAOP = window.DAOP || {};
    if (window.DAOP._slugIndexMetaPromise) return window.DAOP._slugIndexMetaPromise;
    window.DAOP._slugIndexMetaPromise = (typeof window.DAOP.ensureDataCacheBust === 'function'
      ? window.DAOP.ensureDataCacheBust()
      : Promise.resolve('')
    ).then(function (q) {
      var url = BASE + '/data/index/slug/meta.json' + (q || '');
      return fetch(url, { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    });
    return window.DAOP._slugIndexMetaPromise;
  }

  /** meta.json + một hoặc nhiều file id/{key}.js | id/{key}.{p}.js — giống slugIndex */
  function loadIdIndexMetaOnce() {
    window.DAOP = window.DAOP || {};
    if (window.DAOP._idIndexMetaPromise) return window.DAOP._idIndexMetaPromise;
    window.DAOP._idIndexMetaPromise = (typeof window.DAOP.ensureDataCacheBust === 'function'
      ? window.DAOP.ensureDataCacheBust()
      : Promise.resolve('')
    ).then(function (q) {
      var url = BASE + '/data/index/id/meta.json' + (q || '');
      return fetch(url, { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    });
    return window.DAOP._idIndexMetaPromise;
  }

  /** Tải index/meta.json (set batchSize) + id shard scripts cho key 2 ký tự */
  function loadIdIndexShardsForKey(key) {
    return Promise.all([loadIndexMetaOnce(), loadIdIndexMetaOnce()]).then(function (arr) {
      var idMeta = arr[1];
      var parts = 1;
      try {
        if (idMeta && idMeta.parts && idMeta.parts[key] != null) {
          parts = parseInt(idMeta.parts[key], 10) || 1;
        }
        if (!isFinite(parts) || parts < 1) parts = 1;
      } catch (e0) {
        parts = 1;
      }

      var baseUrl = BASE + '/data/index/id/' + key;
      var loads;
      if (parts <= 1) {
        loads = [loadScriptOnce(baseUrl + '.js')];
      } else {
        loads = [];
        for (var p = 0; p < parts; p++) loads.push(loadScriptOnce(baseUrl + '.' + p + '.js'));
      }
      return Promise.all(loads);
    });
  }

  window.DAOP.getMovieBySlugAsync = function (slug) {
    return Promise.resolve().then(function () {
      var s = String(slug || '').trim();
      if (!s) return null;
      var key = getShardKey2(s);
      return loadSlugIndexMetaOnce().then(function (meta) {
        var parts = 1;
        try {
          parts = meta && meta.parts && meta.parts[key] ? parseInt(meta.parts[key], 10) : 1;
          if (!isFinite(parts) || parts < 1) parts = 1;
        } catch (e0) { parts = 1; }

        var baseUrl = BASE + '/data/index/slug/' + key;
        var loads;
        if (parts <= 1) {
          loads = [loadScriptOnce(baseUrl + '.js')];
        } else {
          loads = [];
          for (var p = 0; p < parts; p++) loads.push(loadScriptOnce(baseUrl + '.' + p + '.js'));
        }
        return Promise.all(loads).then(function () {
          try {
            var idx = window.DAOP && window.DAOP.slugIndex ? window.DAOP.slugIndex[key] : null;
            if (!idx) return null;
            if (idx[s]) return idx[s];
            var sLow = s.toLowerCase();
            var ks = Object.keys(idx);
            for (var i = 0; i < ks.length; i++) {
              var k2 = ks[i];
              if ((k2 || '').toLowerCase() === sLow) return idx[k2];
            }
            return null;
          } catch (e1) {
            return null;
          }
        });
      });
    });
  };

  /** Get movie index by id for batch path (id so sánh dạng string để tránh lệch kiểu) */
  window.DAOP.getBatchPath = function (id) {
    return null;
  };

  window.DAOP.getBatchPathAsync = function () {
    return Promise.resolve(null);
  };

  window.DAOP.getMovieLightByIdAsync = function (id) {
    return Promise.resolve().then(function () {
      if (id == null) return null;
      var idStr = String(id);
      var key = getShardKey2(idStr);
      return loadIdIndexShardsForKey(key).then(function () {
        try {
          var idxMap = window.DAOP && window.DAOP.idIndex ? window.DAOP.idIndex[key] : null;
          var row = idxMap ? idxMap[idStr] : null;
          return row || null;
        } catch (e) {
          return null;
        }
      });
    });
  };

  window.DAOP.getTmdbBatchPath = function (id) {
    return null;
  };

  window.DAOP.getTmdbBatchPathAsync = function () {
    return Promise.resolve(null);
  };

  /** Khớp key trong ver shard (slug URL có thể khác chữ hoa/thường so với key build). */
  function resolveVerEntryForSlug(verMap, s) {
    if (!verMap || typeof verMap !== 'object' || !s) return null;
    if (Object.prototype.hasOwnProperty.call(verMap, s) && verMap[s]) {
      return { entry: verMap[s], slugForPath: s };
    }
    var low = String(s).toLowerCase();
    var keys = Object.keys(verMap);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (String(k).toLowerCase() === low && verMap[k]) {
        return { entry: verMap[k], slugForPath: k };
      }
    }
    return null;
  }

  /**
   * Tải JSON phim đầy đủ: ver (Pages) + jsDelivr — chỉ cần slug, không qua id-index.
   * @returns {Promise<object|null>}
   */
  function loadFullMovieJsonBySlug(slug) {
    var s = String(slug || '').trim();
    if (!s) return Promise.resolve(null);
    var shard = window.DAOP.getSlugShard2(s);
    return window.DAOP.fetchVerShard(shard).then(function (verMap) {
      var resolved = resolveVerEntryForSlug(verMap, s);
      var slugForPath = resolved ? resolved.slugForPath : s;
      var entry = resolved ? resolved.entry : null;
      var dataVer = (entry && entry.data) ? String(entry.data) : 'v1.0.0';
      var dataRef = (entry && entry.dataRef) ? String(entry.dataRef).trim() : '';
      return buildPubjsMovieUrl(slugForPath, { dataVer: dataVer, dataRef: dataRef });
    }).then(function (url) {
      if (!url) return null;
      return fetch(url, { credentials: 'omit' }).then(function (r) {
        if (!r.ok) return null;
        return r.json();
      });
    }).then(function (movie) {
      return movie || null;
    });
  }

  /** Chi tiết / xem phim: ưu tiên — tránh id-index (đã có slug từ URL). */
  window.DAOP.loadMovieDetailBySlug = function (slug, callback) {
    loadFullMovieJsonBySlug(slug)
      .then(function (movie) {
        if (typeof callback === 'function') callback(movie);
      })
      .catch(function () {
        if (typeof callback === 'function') callback(null);
      });
  };

  /** Promise — dùng khi cần song song / async/await. */
  window.DAOP.loadFullMovieJsonBySlugAsync = loadFullMovieJsonBySlug;

  /**
   * Chi tiết / xem phim: tải JSON đầy đủ trước; chỉ gọi slug-index nếu JSON không có
   * (tiết kiệm request shard slug khi slug URL đúng và CDN có dữ liệu).
   * Nếu slug URL lệch canonical: slug-index → thử lại JSON theo light.slug.
   * @returns {Promise<{ movie: object|null, light: object|null }>}
   */
  window.DAOP.resolveMovieForSlugPageAsync = function (slug) {
    var s0 = String(slug || '').trim();
    if (!s0) return Promise.resolve({ movie: null, light: null });
    return loadFullMovieJsonBySlug(s0).then(function (movie) {
      if (movie) return { movie: movie, light: null };
      return window.DAOP.getMovieBySlugAsync(s0).then(function (light) {
        if (!light) return { movie: null, light: null };
        var canon = String(light.slug || s0).trim();
        if (canon && canon !== s0) {
          return loadFullMovieJsonBySlug(canon).then(function (m2) {
            return { movie: m2 || null, light: light };
          });
        }
        return { movie: null, light: light };
      });
    });
  };

  /** Load full movie theo id (home, đề xuất, …): id-index → cùng luồng slug. */
  window.DAOP.loadMovieDetail = function (id, callback) {
    var p = (window.DAOP && typeof window.DAOP.getMovieLightByIdAsync === 'function')
      ? window.DAOP.getMovieLightByIdAsync(id)
      : Promise.resolve(null);
    p.then(function (row) {
      if (!row || !row.slug) {
        if (typeof callback === 'function') callback(null);
        return;
      }
      return loadFullMovieJsonBySlug(row.slug).then(function (movie) {
        if (typeof callback === 'function') callback(movie);
      });
    }).catch(function () {
      if (typeof callback === 'function') callback(null);
    });
  };

  window.DAOP.derivePosterFromThumb = function (url) {
    if (!url) return '';
    var u = String(url);
    if (/poster\.(jpe?g|png|webp)$/i.test(u)) return u;
    var r1 = u.replace(/thumb\.(jpe?g|png|webp)$/i, 'poster.$1');
    if (r1 !== u) return r1;
    var r2 = u.replace(/-thumb\.(jpe?g|png|webp)$/i, '-poster.$1');
    if (r2 !== u) return r2;
    var r3 = u.replace(/_thumb\.(jpe?g|png|webp)$/i, '_poster.$1');
    if (r3 !== u) return r3;
    return '';
  };

  window.DAOP.normalizeImgUrl = function (url) {
    if (!url) return '';
    var u = String(url);
    var uploadsPath = '';
    if (u.startsWith('/uploads/')) {
      uploadsPath = u;
    } else {
      try {
        if (u.startsWith('http://') || u.startsWith('https://')) {
          var pu = new URL(u);
          if (pu && pu.pathname && String(pu.pathname).startsWith('/uploads/')) uploadsPath = String(pu.pathname);
        }
      } catch (e1) {}
    }

    if (uploadsPath) {
      var settings = (window.DAOP && window.DAOP.siteSettings) ? window.DAOP.siteSettings : null;
      var ophimDomain = (settings && settings.ophim_img_domain) ? String(settings.ophim_img_domain) : 'https://img.ophim.live';
      ophimDomain = ophimDomain.replace(/\/$/, '');
      return ophimDomain + uploadsPath;
    }
    if (u.startsWith('//')) return 'https:' + u;
    return u;
  };

  window.DAOP.normalizeImgUrlOphim = function (url) {
    if (!url) return '';
    var u = String(url);
    if (u.startsWith('/uploads/')) {
      var settings = (window.DAOP && window.DAOP.siteSettings) ? window.DAOP.siteSettings : null;
      var ophimDomain = (settings && settings.ophim_img_domain) ? String(settings.ophim_img_domain) : 'https://img.ophim.live';
      ophimDomain = ophimDomain.replace(/\/$/, '');
      return ophimDomain + u;
    }
    if (u.startsWith('//')) return 'https:' + u;
    return u;
  };

  /** Render movie card HTML (title + origin_name). opts: { cardOrientation?: 'vertical'|'horizontal', usePoster?: boolean } */
  window.DAOP.renderMovieCard = function (m, baseUrl, opts) {
    baseUrl = baseUrl || BASE;
    opts = opts || {};
    const slug = (m && (m.slug || m.id)) ? String(m.slug || m.id) : '';
    const href = baseUrl + '/phim/' + slug + '.html';
    const cardOrientation = (opts.cardOrientation === 'horizontal' || opts.cardOrientation === 'vertical')
      ? opts.cardOrientation
      : (opts.usePoster ? 'horizontal' : 'vertical');
    const thumbFromIndex = (m && m.thumb) ? window.DAOP.normalizeImgUrl(m.thumb) : '';
    const posterFromIndex = (m && m.poster) ? window.DAOP.normalizeImgUrl(m.poster) : '';
    const defaultImg = cardOrientation === 'horizontal'
      ? (baseUrl + '/images/default_poster.png')
      : (baseUrl + '/images/default_thumb.png');
    const fromIndexPrimary = cardOrientation === 'horizontal'
      ? (posterFromIndex || thumbFromIndex)
      : (thumbFromIndex || posterFromIndex);
    const primaryResolved = (fromIndexPrimary || '').replace(/^\/\//, 'https://');
    const imgUrl = primaryResolved || defaultImg;
    const fallbackUrl = (thumbFromIndex || posterFromIndex || '').replace(/^\/\//, 'https://') || defaultImg;
    const title = (m.title || '').replace(/</g, '&lt;');
    const origin = (m.origin_name || '').replace(/</g, '&lt;');
    var thumbDims = cardOrientation === 'horizontal' ? ' width="300" height="200"' : ' width="200" height="300"';

    var isFav = false;
    try {
      var us = window.DAOP && window.DAOP.userSync;
      if (us && typeof us.getFavorites === 'function') {
        isFav = us.getFavorites().has(slug);
      } else {
        var raw = localStorage.getItem('daop_user_data');
        var data = raw ? JSON.parse(raw) : null;
        var fav = data && Array.isArray(data.favorites) ? data.favorites : [];
        isFav = fav.indexOf(slug) >= 0;
      }
    } catch (e) {}

    var favBtn =
      '<button type="button" class="movie-fav-btn' + (isFav ? ' is-fav' : '') + '"' +
      ' data-movie-slug="' + slug.replace(/"/g, '&quot;') + '" aria-pressed="' + (isFav ? 'true' : 'false') + '"' +
      ' aria-label="Yêu thích">' +
      '♥</button>';
    return (
      '<div class="movie-card movie-card--' + cardOrientation + '">' +
      favBtn +
      '<a href="' + href + '">' +
      '<div class="thumb-wrap"><img' + thumbDims + ' loading="lazy" src="' + imgUrl + '"' +
      (function(){
        var d = defaultImg.replace(/'/g, '%27');
        var f = (fallbackUrl || '').replace(/'/g, '%27');
        if (f && f !== imgUrl) {
          return ' onerror="this.onerror=function(){this.onerror=null;this.src=\'' + d + '\';};this.src=\'' + f + '\';"';
        }
        return ' onerror="this.onerror=null;this.src=\'' + d + '\';"';
      })() +
      ' decoding="async" fetchpriority="low"' +
      ' alt="' + title + '"></div>' +
      '<div class="movie-info">' +
      '<h3 class="title">' + title + '</h3>' +
      (origin ? '<p class="origin-title">' + origin + '</p>' : '') +
      '<p class="meta">' + (m.year || '') + (m.episode_current ? ' • ' + m.episode_current + ' tập' : '') + '</p>' +
      '</div></a></div>'
    );
  };

  function initQuickFavorites() {
    function getLocal() {
      try {
        var raw = localStorage.getItem('daop_user_data');
        if (!raw) return { version: 1, lastSync: null, favorites: [], watchHistory: [], pendingActions: [] };
        var d = JSON.parse(raw);
        d.favorites = d.favorites || [];
        d.watchHistory = d.watchHistory || [];
        d.pendingActions = d.pendingActions || [];
        return d;
      } catch (e) {
        return { version: 1, lastSync: null, favorites: [], watchHistory: [], pendingActions: [] };
      }
    }
    function setLocal(d) {
      try { localStorage.setItem('daop_user_data', JSON.stringify(d)); } catch (e) {}
    }
    function setBtnState(btn, fav) {
      btn.classList.toggle('is-fav', !!fav);
      btn.setAttribute('aria-pressed', fav ? 'true' : 'false');

      // Nếu là nút dạng "action" có label, cập nhật luôn text.
      try {
        var label = btn.querySelector && btn.querySelector('.md-action-label');
        if (label) label.textContent = fav ? 'Bỏ yêu thích' : 'Yêu thích';
      } catch (e) {}
    }

    function getFavSet() {
      try {
        var us = window.DAOP && window.DAOP.userSync;
        if (us && typeof us.getFavorites === 'function') return us.getFavorites();
      } catch (e) {}
      try {
        var d = getLocal();
        return new Set(d.favorites || []);
      } catch (e2) { return new Set(); }
    }

    function refreshButtons() {
      var favSet = getFavSet();
      document.querySelectorAll('.movie-fav-btn[data-movie-slug]').forEach(function (b) {
        var s = b.getAttribute('data-movie-slug') || '';
        setBtnState(b, !!(s && favSet.has(s)));
      });
    }

    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.movie-fav-btn') : null;
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

      var slug = btn.getAttribute('data-movie-slug') || '';
      if (!slug) return;

      var us = window.DAOP && window.DAOP.userSync;
      if (us && typeof us.toggleFavorite === 'function') {
        var fav = false;
        try { fav = us.toggleFavorite(slug); } catch (err) {}
        document.querySelectorAll('.movie-fav-btn[data-movie-slug="' + slug.replace(/"/g, '\\"') + '"]').forEach(function (b) {
          setBtnState(b, fav);
        });
        return;
      }

      var d = getLocal();
      var idx = d.favorites.indexOf(slug);
      if (idx >= 0) d.favorites.splice(idx, 1);
      else d.favorites.push(slug);
      setLocal(d);
      var fav2 = idx < 0;
      document.querySelectorAll('.movie-fav-btn[data-movie-slug="' + slug.replace(/"/g, '\\"') + '"]').forEach(function (b) {
        setBtnState(b, fav2);
      });
    }, true);

    window.addEventListener('storage', function (ev) {
      if (ev && ev.key && ev.key !== 'daop_user_data') return;
      refreshButtons();
    });

    refreshButtons();
    setTimeout(refreshButtons, 600);
    setTimeout(refreshButtons, 2000);
  }

  function initHeaderVisibilityToggle() {
    var header = document.querySelector('.site-header');
    if (!header) return;

    var btn = document.getElementById('site-header-toggle');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'site-header-toggle';
      btn.className = 'site-header-toggle';
      btn.setAttribute('aria-label', 'Ẩn/hiện menu');
      btn.innerHTML = '<span class="site-header-toggle-ico" aria-hidden="true">≡</span>';
      document.body.appendChild(btn);
    }

    function shouldDefaultHide() {
      var p = window.location && window.location.pathname ? window.location.pathname : '';
      var s = (window.DAOP && window.DAOP.siteSettings) || {};
      if (p.indexOf('/phim/') === 0) {
        return String(s.detail_hide_header_default || '').toLowerCase() === 'true';
      }
      if (p.indexOf('/xem-phim/') === 0) {
        return String(s.watch_hide_header_default || '').toLowerCase() === 'true';
      }
      return false;
    }

    if (shouldDefaultHide()) {
      document.body.classList.add('site-header--collapsed');
    }

    function syncHeaderOffsetVar() {
      try {
        var collapsed = document.body.classList.contains('site-header--collapsed');
        if (collapsed) {
          document.documentElement.style.setProperty('--site-header-offset', '0px');
          return;
        }
        var r = header.getBoundingClientRect();
        var h = Math.max(0, Math.round(r.height || 0));
        document.documentElement.style.setProperty('--site-header-offset', h + 'px');
      } catch (e) {}
    }

    /** Gom đo layout vào một frame — giảm forced reflow khi scroll/resize liên tục. */
    var headerLayoutRaf = null;
    function scheduleHeaderLayoutSync() {
      if (headerLayoutRaf != null) return;
      headerLayoutRaf = window.requestAnimationFrame(function () {
        headerLayoutRaf = null;
        syncHeaderOffsetVar();
        syncDesktopTop();
      });
    }

    function syncDesktopTop() {
      try {
        var w = window.innerWidth || document.documentElement.clientWidth || 0;
        var collapsed = document.body.classList.contains('site-header--collapsed');
        if (w < 769 || collapsed) {
          btn.style.removeProperty('top');
          return;
        }
        var r = header.getBoundingClientRect();
        var btnH = btn.getBoundingClientRect().height || 44;
        var top = Math.max(6, Math.round(r.top + (r.height / 2) - (btnH / 2)));
        btn.style.top = top + 'px';
      } catch (e) {}
    }

    var hideTimer = null;
    function showBtnTemporarily() {
      btn.classList.remove('is-auto-hidden');
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      hideTimer = setTimeout(function () {
        btn.classList.add('is-auto-hidden');
      }, 3000);
    }

    function onUserActivity() {
      showBtnTemporarily();
    }

    ['mousemove', 'mousedown', 'touchstart', 'keydown', 'scroll'].forEach(function (ev) {
      window.addEventListener(ev, onUserActivity, { passive: true });
    });

    showBtnTemporarily();

    function updateAria() {
      var collapsed = document.body.classList.contains('site-header--collapsed');
      btn.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
    }
    updateAria();
    syncDesktopTop();
    syncHeaderOffsetVar();

    btn.addEventListener('click', function () {
      document.body.classList.toggle('site-header--collapsed');
      updateAria();
      showBtnTemporarily();
      syncDesktopTop();
      syncHeaderOffsetVar();
      try {
        var collapsedNow = document.body.classList.contains('site-header--collapsed');
        window.dispatchEvent(new CustomEvent('daop:header-visibility-changed', { detail: { collapsed: collapsedNow } }));
      } catch (e3) {}
    });

    window.addEventListener('resize', scheduleHeaderLayoutSync, { passive: true });
    window.addEventListener('scroll', scheduleHeaderLayoutSync, { passive: true });

    try {
      var mo = new MutationObserver(function () {
        scheduleHeaderLayoutSync();
      });
      mo.observe(header, { attributes: true, attributeFilter: ['class', 'style'] });
    } catch (e2) {}
  }

  /** Escape HTML */
  function esc(s) {
    if (s == null || s === '') return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Render slider carousel kiểu ONFLIX: ảnh nền, overlay, tiêu đề, meta (năm | quốc gia | tập), thể loại, mô tả, nút Xem ngay */
  window.DAOP.renderSlider = function (el, slides) {
    if (!el || !Array.isArray(slides) || slides.length === 0) return;
    var base = BASE || '';
    var html = '<div class="slider-viewport"><div class="slider-track">';
    slides.forEach(function (s, i) {
      var hrefRaw = (s.link_url || '#');
      var hrefFinal = hrefRaw;
      if (hrefRaw && hrefRaw[0] === '/' && base) hrefFinal = base + hrefRaw;
      var href = String(hrefFinal || '#').replace(/"/g, '&quot;');
      var norm = (window.DAOP && typeof window.DAOP.normalizeImgUrl === 'function')
        ? window.DAOP.normalizeImgUrl
        : function (x) { return x; };
      var normOphim = (window.DAOP && typeof window.DAOP.normalizeImgUrlOphim === 'function')
        ? window.DAOP.normalizeImgUrlOphim
        : function (x) { return x; };
      var imgRaw = (s.image_url || '');
      var defaultImg = base + '/images/default_poster.png';
      var img = norm(imgRaw).replace(/^\/\//, 'https://') || defaultImg;
      var imgOphim = normOphim(imgRaw).replace(/^\/\//, 'https://') || '';
      var imgEsc = String(img || '').replace(/"/g, '&quot;');
      var oEsc = String(imgOphim || '').replace(/'/g, '%27');
      var dEsc = String(defaultImg || '').replace(/'/g, '%27');
      var title = esc(s.title || '');
      var year = esc(s.year || '');
      var country = esc(s.country || '');
      var episode = (s.episode_current != null && s.episode_current !== '') ? String(s.episode_current) : '';
      if (episode && episode.indexOf(' tập') < 0 && episode.indexOf('Trọn bộ') < 0) episode = episode + ' tập';
      var metaParts = [];
      if (year) metaParts.push(year);
      if (country) metaParts.push(country);
      if (episode) metaParts.push(episode);
      var metaLine = metaParts.join(' | ');
      var genres = s.genres;
      if (typeof genres === 'string') genres = genres ? [genres] : [];
      if (!Array.isArray(genres)) genres = [];
      var genreTags = genres.slice(0, 5).map(function (g) { return '<span class="slider-genre">' + esc(typeof g === 'string' ? g : (g && g.name) ? g.name : '') + '</span>'; }).join('');
      var desc = esc((s.description || '').slice(0, 160));
      if (desc.length === 160) desc += '...';
      var imgLoading = i === 0 ? 'eager' : 'lazy';
      var imgPriority = i === 0 ? 'high' : 'low';
      html +=
        '<div class="slider-slide" data-index="' + i + '">' +
        '<a href="' + href + '" class="slider-slide-link">' +
        '<div class="slider-slide-bg"><img width="1200" height="750" loading="' + imgLoading + '" decoding="async" fetchpriority="' + imgPriority + '" src="' + imgEsc + '"' +
        (function(){
          if (oEsc && oEsc !== imgEsc) {
            return ' onerror="this.onerror=function(){this.onerror=null;this.src=\'' + dEsc + '\';};this.src=\'' + oEsc + '\';"';
          }
          return ' onerror="this.onerror=null;this.src=\'' + dEsc + '\';"';
        })() +
        ' alt="' + title + '"></div>' +
        '<div class="slider-slide-overlay"></div>' +
        '<div class="slider-slide-content">' +
        '<h2 class="slider-slide-title">' + title + '</h2>' +
        (metaLine ? '<p class="slider-slide-meta">' + metaLine + '</p>' : '') +
        (genreTags ? '<div class="slider-slide-genres">' + genreTags + '</div>' : '') +
        (desc ? '<p class="slider-slide-desc">' + desc + '</p>' : '') +
        '</div></a></div>';
    });
    html += '</div></div><button type="button" class="slider-btn slider-prev" aria-label="Trước">‹</button><button type="button" class="slider-btn slider-next" aria-label="Sau">›</button><div class="slider-dots"></div>';
    el.innerHTML = html;
    var track = el.querySelector('.slider-track');
    var dotContainer = el.querySelector('.slider-dots');
    var len = slides.length;
    for (var d = 0; d < len; d++) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'slider-dot' + (d === 0 ? ' active' : '');
      dot.setAttribute('aria-label', 'Slide ' + (d + 1));
      dot.dataset.index = String(d);
      dotContainer.appendChild(dot);
    }
    var idx = 0;
    function goTo(i) {
      idx = (i + len) % len;
      if (track) track.style.transform = 'translateX(-' + idx * 100 + '%)';
      el.querySelectorAll('.slider-dot').forEach(function (dot, j) {
        dot.classList.toggle('active', j === idx);
      });
    }
    el.querySelector('.slider-prev')?.addEventListener('click', function () { goTo(idx - 1); });
    el.querySelector('.slider-next')?.addEventListener('click', function () { goTo(idx + 1); });
    dotContainer.querySelectorAll('.slider-dot').forEach(function (dot) {
      dot.addEventListener('click', function () { goTo(parseInt(dot.dataset.index, 10)); });
    });
    var t = setInterval(function () { goTo(idx + 1); }, 5000);
    el._sliderInterval = t;

    // Swipe / drag support (touch + mouse)
    var viewport = el.querySelector('.slider-viewport');
    var startX = 0;
    var startY = 0;
    var dragging = false;
    var moved = false;
    var pointerId = null;
    var hadSwipe = false;

    function stopAuto() {
      if (el._sliderInterval) {
        clearInterval(el._sliderInterval);
        el._sliderInterval = null;
      }
    }
    function startAuto() {
      if (el._sliderInterval) return;
      el._sliderInterval = setInterval(function () { goTo(idx + 1); }, 5000);
    }
    function setTranslate(px) {
      if (!track) return;
      track.style.transition = 'none';
      track.style.transform = 'translateX(calc(-' + (idx * 100) + '% + ' + px + 'px))';
    }
    function resetTranslate() {
      if (!track) return;
      track.style.transition = 'transform 0.4s ease';
      track.style.transform = 'translateX(-' + idx * 100 + '%)';
    }

    if (viewport && track) {
      viewport.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        dragging = true;
        moved = false;
        hadSwipe = false;
        pointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        stopAuto();
      });

      viewport.addEventListener('pointermove', function (e) {
        if (!dragging || (pointerId != null && e.pointerId !== pointerId)) return;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        if (!moved) {
          // Only start horizontal drag when it is clearly horizontal
          if (Math.abs(dx) < 10) return;
          if (Math.abs(dy) > Math.abs(dx) * 1.2) {
            // treat as vertical scroll
            dragging = false;
            pointerId = null;
            startAuto();
            return;
          }
          moved = true;
          // Only capture pointer after we have confirmed a horizontal drag.
          // Capturing too early can retarget click events to the viewport and break <a> navigation.
          try { viewport.setPointerCapture(pointerId); } catch (err) {}
        }
        e.preventDefault();
        setTranslate(dx);
      }, { passive: false });

      function endDrag(e) {
        if (!dragging || (pointerId != null && e.pointerId !== pointerId)) return;
        dragging = false;
        var dx = e.clientX - startX;
        var w = viewport.clientWidth || 1;
        var threshold = Math.max(45, Math.min(120, w * 0.18));
        if (moved && Math.abs(dx) > threshold) {
          hadSwipe = true;
          if (dx < 0) goTo(idx + 1);
          else goTo(idx - 1);
        } else {
          resetTranslate();
          hadSwipe = false;
        }
        moved = false;
        try {
          if (pointerId != null && viewport.hasPointerCapture && viewport.hasPointerCapture(pointerId)) {
            viewport.releasePointerCapture(pointerId);
          }
        } catch (eRel) {}
        pointerId = null;
        startAuto();
      }

      viewport.addEventListener('pointerup', endDrag);
      viewport.addEventListener('pointercancel', function (e) {
        if (!dragging) return;
        dragging = false;
        moved = false;
        try {
          if (pointerId != null && viewport.hasPointerCapture && viewport.hasPointerCapture(pointerId)) {
            viewport.releasePointerCapture(pointerId);
          }
        } catch (eRel2) {}
        pointerId = null;
        resetTranslate();
        startAuto();
      });

      // Prevent click-through on swipe
      viewport.addEventListener('click', function (e) {
        if (!hadSwipe) return;
        hadSwipe = false;
        e.preventDefault();
        e.stopPropagation();
      }, true);

      // Touch fallback (iOS Safari / some WebViews)
      if (!window.PointerEvent) {
        var tStartX = 0;
        var tStartY = 0;
        var tDragging = false;
        var tMoved = false;

        viewport.addEventListener('touchstart', function (e) {
          if (!e.touches || e.touches.length !== 1) return;
          tDragging = true;
          tMoved = false;
          hadSwipe = false;
          tStartX = e.touches[0].clientX;
          tStartY = e.touches[0].clientY;
          stopAuto();
        }, { passive: true });

        viewport.addEventListener('touchmove', function (e) {
          if (!tDragging || !e.touches || e.touches.length !== 1) return;
          var dx = e.touches[0].clientX - tStartX;
          var dy = e.touches[0].clientY - tStartY;
          if (!tMoved) {
            if (Math.abs(dx) < 10) return;
            if (Math.abs(dy) > Math.abs(dx) * 1.2) {
              tDragging = false;
              startAuto();
              return;
            }
            tMoved = true;
          }
          e.preventDefault();
          setTranslate(dx);
        }, { passive: false });

        viewport.addEventListener('touchend', function (e) {
          if (!tDragging) return;
          tDragging = false;
          var endX = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientX : tStartX;
          var dx = endX - tStartX;
          var w = viewport.clientWidth || 1;
          var threshold = Math.max(45, Math.min(120, w * 0.18));
          if (tMoved && Math.abs(dx) > threshold) {
            hadSwipe = true;
            if (dx < 0) goTo(idx + 1);
            else goTo(idx - 1);
          } else {
            resetTranslate();
            hadSwipe = false;
          }
          tMoved = false;
          startAuto();
        }, { passive: true });

        viewport.addEventListener('touchcancel', function () {
          if (!tDragging) return;
          tDragging = false;
          tMoved = false;
          resetTranslate();
          startAuto();
        }, { passive: true });
      }
    }
  };

  /** Preload ảnh hero/LCP (slide đầu) — gọi trước renderSlider để trình duyệt tải sớm. */
  function preloadHeroImageUrl(imageUrlRaw) {
    if (!imageUrlRaw || typeof document === 'undefined') return;
    try {
      if (document.getElementById('daop-preload-lcp')) return;
      var norm =
        window.DAOP && typeof window.DAOP.normalizeImgUrl === 'function'
          ? window.DAOP.normalizeImgUrl(imageUrlRaw)
          : imageUrlRaw;
      var u = String(norm || '')
        .replace(/^\/\//, 'https://')
        .trim();
      if (!u) return;

      try {
        ensurePreconnectOrigin(u);
      } catch (ePc0) {}

      var link = document.createElement('link');
      link.id = 'daop-preload-lcp';
      link.rel = 'preload';
      link.as = 'image';
      link.href = u;
      try {
        link.setAttribute('fetchpriority', 'high');
      } catch (eFp) {}
      document.head.appendChild(link);
    } catch (e) {}
  }

  function preloadFirstSliderSlide(arr) {
    if (!Array.isArray(arr) || !arr.length) return;
    var s = arr[0];
    if (!s || s.enabled === false) return;
    preloadHeroImageUrl(s.image_url || '');
  }

  /** Thêm preconnect tới origin CDN (một lần) — không thay đổi logic tải ảnh. */
  function ensurePreconnectOrigin(raw) {
    if (!raw || typeof document === 'undefined') return;
    try {
      var o = String(raw).trim().replace(/\/$/, '');
      if (!o) return;
      if (o.indexOf('//') === 0) o = window.location.protocol + o;
      else if (!/^https?:\/\//i.test(o)) o = 'https://' + o;
      var u = new URL(o);
      if (!u.hostname || u.origin === window.location.origin) return;
      var sel = 'link[rel="preconnect"][href="' + u.origin + '"]';
      if (document.head.querySelector(sel)) return;
      var l = document.createElement('link');
      l.rel = 'preconnect';
      l.href = u.origin;
      l.crossOrigin = '';
      document.head.appendChild(l);
    } catch (ePc) {}
  }

  /** Áp dụng site-settings lên trang: theme, logo, favicon, footer, TMDB, slider */
  window.DAOP.applySiteSettings = function (settings) {
    if (!settings) return;
    window.DAOP.siteSettings = Object.assign({}, window.DAOP.siteSettings || {}, settings);
    window.DAOP.siteName = settings.site_name || 'DAOP Phim';
    window.DAOP.supabaseUserUrl = settings.supabase_user_url || settings.supabaseUserUrl || window.DAOP.supabaseUserUrl || '';
    window.DAOP.supabaseUserAnonKey = settings.supabase_user_anon_key || settings.supabaseUserAnonKey || window.DAOP.supabaseUserAnonKey || '';
    if (document.title && settings.site_name && document.title.includes(' | DAOP Phim')) {
      document.title = document.title.replace(' | DAOP Phim', ' | ' + settings.site_name);
    }
    var root = document.documentElement;
    if (settings.theme_primary) root.style.setProperty('--accent', settings.theme_primary);
    if (settings.theme_accent) root.style.setProperty('--accent-hover', settings.theme_accent);
    if (settings.theme_primary_light) root.style.setProperty('--accent-light', settings.theme_primary_light);
    if (settings.theme_accent_light) root.style.setProperty('--accent-hover-light', settings.theme_accent_light);
    if (settings.theme_bg) root.style.setProperty('--bg', settings.theme_bg);
    if (settings.theme_light_bg) root.style.setProperty('--light-bg', settings.theme_light_bg);
    if (settings.theme_border) root.style.setProperty('--border', settings.theme_border);
    if (settings.theme_card) root.style.setProperty('--card', settings.theme_card);
    if (settings.theme_text) root.style.setProperty('--text', settings.theme_text);
    if (settings.theme_muted) root.style.setProperty('--muted', settings.theme_muted);
    if (settings.theme_light_card) root.style.setProperty('--light-card', settings.theme_light_card);
    if (settings.theme_light_border) root.style.setProperty('--light-border', settings.theme_light_border);
    if (settings.theme_light_text) root.style.setProperty('--light-text', settings.theme_light_text);
    if (settings.theme_light_muted) root.style.setProperty('--light-muted', settings.theme_light_muted);
    if (settings.theme_light_surface) root.style.setProperty('--light-surface', settings.theme_light_surface);
    if (settings.theme_link) root.style.setProperty('--link-color', settings.theme_link);
    if (settings.theme_link_light) root.style.setProperty('--link-color-light', settings.theme_link_light);
    if (settings.theme_header_logo) root.style.setProperty('--header-logo-color', settings.theme_header_logo);
    if (settings.theme_header_logo_light) root.style.setProperty('--header-logo-color-light', settings.theme_header_logo_light);
    if (settings.theme_header_link) root.style.setProperty('--header-link-color', settings.theme_header_link);
    if (settings.theme_header_link_light) root.style.setProperty('--header-link-color-light', settings.theme_header_link_light);
    if (settings.theme_footer_text) root.style.setProperty('--footer-text-color', settings.theme_footer_text);
    if (settings.theme_footer_text_light) root.style.setProperty('--footer-text-color-light', settings.theme_footer_text_light);
    if (settings.theme_section_title) root.style.setProperty('--section-title-color', settings.theme_section_title);
    if (settings.theme_section_title_light) root.style.setProperty('--section-title-color-light', settings.theme_section_title_light);
    if (settings.theme_filter_label) root.style.setProperty('--filter-label-color', settings.theme_filter_label);
    if (settings.theme_filter_label_light) root.style.setProperty('--filter-label-color-light', settings.theme_filter_label_light);
    if (settings.theme_pagination) root.style.setProperty('--pagination-color', settings.theme_pagination);
    if (settings.theme_pagination_light) root.style.setProperty('--pagination-color-light', settings.theme_pagination_light);
    if (settings.theme_slider_title) root.style.setProperty('--slider-title-color', settings.theme_slider_title);
    if (settings.theme_slider_title_light) root.style.setProperty('--slider-title-color-light', settings.theme_slider_title_light);
    if (settings.theme_slider_meta) root.style.setProperty('--slider-meta-color', settings.theme_slider_meta);
    if (settings.theme_slider_meta_light) root.style.setProperty('--slider-meta-color-light', settings.theme_slider_meta_light);
    if (settings.theme_slider_desc) root.style.setProperty('--slider-desc-color', settings.theme_slider_desc);
    if (settings.theme_slider_desc_light) root.style.setProperty('--slider-desc-color-light', settings.theme_slider_desc_light);
    if (settings.theme_movie_card_title) root.style.setProperty('--movie-card-title-color', settings.theme_movie_card_title);
    if (settings.theme_movie_card_title_light) root.style.setProperty('--movie-card-title-color-light', settings.theme_movie_card_title_light);
    if (settings.theme_movie_card_meta) root.style.setProperty('--movie-card-meta-color', settings.theme_movie_card_meta);
    if (settings.theme_movie_card_meta_light) root.style.setProperty('--movie-card-meta-color-light', settings.theme_movie_card_meta_light);
    root.style.setProperty('--showtimes-color', settings.theme_showtimes_color || '#ffffff');
    root.style.setProperty('--showtimes-color-light', settings.theme_showtimes_color_light || '#ffffff');
    var logo = document.querySelector('.site-logo');
    if (logo && settings.logo_url) {
      logo.innerHTML = '<img src="' + (settings.logo_url || '').replace(/"/g, '&quot;') + '" alt="' + (settings.site_name || '').replace(/"/g, '&quot;') + '" width="75" height="40" decoding="async">';
      if (!logo.getAttribute('href')) logo.setAttribute('href', BASE || '/');
    } else if (logo && settings.site_name && !logo.querySelector('img')) {
      logo.textContent = settings.site_name;
    }
    if (settings.favicon_url) {
      var link = document.querySelector('link[rel="icon"]') || document.createElement('link');
      link.rel = 'icon';
      link.href = settings.favicon_url;
      if (!link.parentNode) document.head.appendChild(link);
    }
    var footer = document.querySelector('.site-footer');
    function constrainFooterFlagSvgs() {
      if (!footer) return;
      try {
        // Defensive fix: if footer HTML contains the Vietnam flag SVG without the expected wrapper/classes,
        // it can render at an unintended large size (even fullscreen if inline styles set position/fixed).
        var svgs = footer.querySelectorAll('svg');
        svgs.forEach(function (svg) {
          try {
            var vb = (svg.getAttribute('viewBox') || '').replace(/\s+/g, ' ').trim();
            var isFlag = vb === '0 0 30 20' || vb === '0 0 30 20 ';
            if (!isFlag) return;

            // Neutralize any inline styles that can make SVG fill the viewport.
            svg.style.position = 'static';
            svg.style.inset = 'auto';
            svg.style.top = 'auto';
            svg.style.right = 'auto';
            svg.style.bottom = 'auto';
            svg.style.left = 'auto';
            svg.style.zIndex = 'auto';
            svg.style.maxWidth = '100%';
            svg.style.maxHeight = '100%';
            svg.style.display = 'block';
            svg.style.width = '100%';
            svg.style.height = '100%';

            var p = svg.parentElement;
            if (p && !p.classList.contains('footer-flag')) {
              p.style.display = 'inline-block';
              p.style.width = '1.25em';
              p.style.height = '0.833em';
              p.style.verticalAlign = 'middle';
              p.style.marginRight = '0.35em';
              p.style.overflow = 'hidden';
            }
          } catch (eSvg) {}
        });
      } catch (eFooterSvg) {}
    }

    function replaceFooterFlagWithLcPng() {
      if (!footer) return;
      try {
        var banner = footer.querySelector('.footer-vietnam-banner');
        if (!banner) return;
        var wrap = banner.querySelector('.footer-flag');
        if (!wrap) {
          wrap = document.createElement('span');
          wrap.className = 'footer-flag';
          wrap.setAttribute('aria-hidden', 'true');
          banner.insertBefore(wrap, banner.firstChild);
        }
        var src = (BASE || '') + '/images/lc.png';
        wrap.innerHTML = '<img src="' + String(src).replace(/"/g, '&quot;') + '" alt="" width="20" height="14" loading="lazy" decoding="async">';
      } catch (e1) {}
    }

    if (footer && settings.footer_content) {
      footer.innerHTML = settings.footer_content;
      replaceFooterFlagWithLcPng();
      constrainFooterFlagSvgs();
    } else {
      // Even with the default footer HTML, guard against any other injected styles.
      replaceFooterFlagWithLcPng();
      constrainFooterFlagSvgs();
    }
    var footerLogo = document.querySelector('.site-footer .footer-logo');
    if (footerLogo) {
      var logoText = 'GoTV - Trang tổng hợp phim, video, chương trình, tư liệu giải trí đỉnh cao.';
      if (settings.logo_url) {
        var alt = (settings.site_name || 'GoTV').replace(/"/g, '&quot;');
        footerLogo.innerHTML = '<img src="' + (settings.logo_url || '').replace(/"/g, '&quot;') + '" alt="' + alt + '" width="75" height="40" decoding="async"><span class="footer-logo-text">' + logoText.replace(/"/g, '&quot;') + '</span>';
        if (!footerLogo.getAttribute('href')) footerLogo.setAttribute('href', BASE || '/');
      } else if (settings.site_name && !footerLogo.querySelector('img')) {
        footerLogo.innerHTML = '<span>' + (settings.site_name || 'GoTV').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span><span class="footer-logo-text">' + logoText.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>';
      } else if (!footerLogo.querySelector('.footer-logo-text')) {
        var existing = footerLogo.innerHTML;
        footerLogo.innerHTML = existing + '<span class="footer-logo-text">' + logoText.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>';
      }
    }
    if (footer && !footer.querySelector('.footer-copyright')) {
      var p = document.createElement('p');
      p.className = 'footer-copyright';
      p.innerHTML = 'Copyright 2018 <a href="https://gotv.top" target="_blank" rel="noopener">GoTV</a>. All rights reserved.';
      footer.appendChild(p);
    }
    var sliderWrap = document.getElementById('slider-wrap');
    if (sliderWrap) {
      try {
        var mode = (settings && settings.homepage_slider_display_mode) ? String(settings.homepage_slider_display_mode).trim().toLowerCase() : 'manual';
        if (mode === 'auto') {
          var autoUrl = (BASE || '') + '/data/home/homepage-slider-auto.json';
          fetch(autoUrl).then(function (r) {
            if (!r || !r.ok) return null;
            return r.json();
          }).then(function (arr) {
            if (!Array.isArray(arr) || arr.length === 0) return;
            arr = arr.filter(function (s) { return s && s.enabled !== false; });
            arr.sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
            preloadFirstSliderSlide(arr);
            window.DAOP.renderSlider(sliderWrap, arr);
            var bannerWrap = document.getElementById('banner-wrap');
            if (bannerWrap) bannerWrap.style.display = 'none';
          }).catch(function () {});
        } else {
          var raw = settings.homepage_slider;
          var arr = typeof raw === 'string' ? (raw ? JSON.parse(raw) : []) : (Array.isArray(raw) ? raw : []);
          if (Array.isArray(arr) && arr.length > 0) {
            arr = arr.filter(function (s) { return s.enabled !== false; });
            arr.sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
            preloadFirstSliderSlide(arr);
            window.DAOP.renderSlider(sliderWrap, arr);
            var bannerWrap = document.getElementById('banner-wrap');
            if (bannerWrap) bannerWrap.style.display = 'none';
          }
        }
      } catch (e) {}
    }
    for (var i = 1; i <= 12; i++) {
      var menuBgUrl = settings['menu_bg_' + i];
      if (menuBgUrl) root.style.setProperty('--menu-bg-' + i, 'url(' + menuBgUrl + ')');
    }
  };

  /** Inject tracking from site-settings */
  window.DAOP.injectTracking = async function () {
    try {
      const settings = await (typeof window.DAOP.ensureSiteSettingsLoaded === 'function'
        ? window.DAOP.ensureSiteSettingsLoaded()
        : window.DAOP.loadConfig('site-settings'));
      if (!settings) return;
      window.DAOP.applySiteSettings(settings);
      if (settings.google_analytics_id) {
        const s = document.createElement('script');
        s.async = true;
        s.src = 'https://www.googletagmanager.com/gtag/js?id=' + settings.google_analytics_id;
        document.head.appendChild(s);
        window.dataLayer = window.dataLayer || [];
        function gtag() {
          dataLayer.push(arguments);
        }
        gtag('js', new Date());
        gtag('config', settings.google_analytics_id);
      }
      if (settings.simple_analytics_script) {
        const s = document.createElement('script');
        s.innerHTML = settings.simple_analytics_script;
        document.head.appendChild(s);
      }
    } catch (e) {}
  };

  /** Mobile: nút 3 gạch ẩn/hiện menu; mỗi mục dùng ảnh nền riêng (CSS: menu-1.png … menu-10.png) */
  function initMobileNav() {
    var header = document.querySelector('.site-header');
    var nav = header && header.querySelector('.site-nav');
    if (!header || !nav) return;

    // Add icons to nav actions (Search / Account) and allow responsive hide/show of label.
    try {
      var actions = nav.querySelector('.site-nav-actions');
      if (actions) {
        var links = actions.querySelectorAll('a[href]');
        links.forEach(function (a) {
          if (a.getAttribute('data-nav-iconized') === '1') return;
          var href = a.getAttribute('href') || '';
          var isSearch = href.indexOf('tim-kiem') >= 0;
          var isAccount = href.indexOf('login') >= 0 || href.indexOf('nguoi-dung') >= 0;
          if (!isSearch && !isAccount) return;

          var label = (a.textContent || '').trim() || (isSearch ? 'Tìm kiếm' : 'Tài khoản');
          var icon = '';
          if (isSearch) {
            icon = '<svg class="nav-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M10 2a8 8 0 105.3 14l4.2 4.2 1.5-1.5-4.2-4.2A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z"/></svg>';
          } else if (isAccount) {
            icon = '<svg class="nav-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 12a4.5 4.5 0 10-4.5-4.5A4.5 4.5 0 0012 12zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5z"/></svg>';
          }

          a.innerHTML = icon + '<span class="nav-text">' + esc(label) + '</span>';
          a.setAttribute('data-nav-iconized', '1');
        });
      }
    } catch (e0) {}

    if (header.querySelector('.nav-toggle')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-toggle';
    btn.setAttribute('aria-label', 'Mở menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span class="nav-toggle-bar"></span><span class="nav-toggle-bar"></span><span class="nav-toggle-bar"></span>';
    btn.addEventListener('click', function () {
      var open = header.classList.toggle('menu-open');
      btn.setAttribute('aria-label', open ? 'Đóng menu' : 'Mở menu');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    header.insertBefore(btn, header.firstChild);
    document.addEventListener('click', function (e) {
      if (!header.classList.contains('menu-open')) return;
      if (header.contains(e.target)) return;
      header.classList.remove('menu-open');
      btn.setAttribute('aria-label', 'Mở menu');
      btn.setAttribute('aria-expanded', 'false');
    });
  }

  /** Nút cuộn về đầu trang (góc phải dưới) */
  function initScrollToTop() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scroll-to-top';
    btn.setAttribute('aria-label', 'Cuộn lên đầu trang');
    btn.innerHTML = '↑';
    btn.style.display = 'none';
    document.body.appendChild(btn);
    function toggle() {
      btn.style.display = (window.pageYOffset || document.documentElement.scrollTop) > 300 ? 'flex' : 'none';
    }
    window.addEventListener('scroll', toggle, { passive: true });
    toggle();
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /** Run on DOM ready */
  function onReady() {
    window.DAOP.injectTracking();
    initMobileNav();
    initScrollToTop();
    initQuickFavorites();
    initHeaderVisibilityToggle();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
})();
