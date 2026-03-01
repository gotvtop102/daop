/**
 * Common: load config, global helpers
 */
(function () {
  window.DAOP = window.DAOP || {};
  const BASE = window.DAOP.basePath || '';

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
    window.DAOP.loadConfig('site-settings').then(function (s) {
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
  } else {
    initLoadingScreen();
  }

  /** Load JSON config from data/config/ */
  window.DAOP.loadConfig = async function (name) {
    const url = `${BASE}/data/config/${name}.json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  };

  (function () {
    var _authNavLoading = null;
    var _authNavSettingsPromise = null;
    var _authNavSubscribed = false;
    function getCreateClient() {
      if (typeof createClient !== 'undefined') return createClient;
      if (typeof window.supabase !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') return window.supabase.createClient;
      return null;
    }
    function loadSupabaseJsIfNeeded() {
      if (getCreateClient()) return Promise.resolve();
      if (_authNavLoading) return _authNavLoading;
      _authNavLoading = new Promise(function (resolve) {
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        s.onload = function () { resolve(); };
        s.onerror = function () { resolve(); };
        document.head.appendChild(s);
      });
      return _authNavLoading;
    }
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
      a.textContent = 'Tài khoản';

      return ensureSupabaseUserConfig().then(function (cfg) {
        var url = cfg && cfg.url;
        var key = cfg && cfg.key;
        if (!url || !key) {
          a.textContent = 'Tài khoản';
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
              a.textContent = 'Tài khoản';
              a.setAttribute('href', '/nguoi-dung.html');
            } else {
              a.textContent = 'Tài khoản';
              a.setAttribute('href', '/login.html');
            }
          }).catch(function () {});
        });
      });
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        window.DAOP.updateAuthNav();
      });
    } else {
      window.DAOP.updateAuthNav();
    }
  })();

  /** Get movie by slug from moviesLight (so khớp chính xác, rồi không phân biệt hoa thường) */
  window.DAOP.getMovieBySlug = function (slug) {
    if (!slug) return undefined;
    const list = window.moviesLight || [];
    const s = String(slug).trim();
    let m = list.find(function (x) { return (x.slug || '') === s; });
    if (!m) m = list.find(function (x) { return (x.slug || '').toLowerCase() === s.toLowerCase(); });
    return m;
  };

  /** Get movie index by id for batch path (id so sánh dạng string để tránh lệch kiểu) */
  window.DAOP.getBatchPath = function (id) {
    if (id == null) return null;
    const list = window.moviesLight || [];
    const idStr = String(id);
    const idx = list.findIndex(function (m) {
      return String(m.id) === idStr;
    });
    if (idx < 0) return null;
    const BATCH = (window.DAOP && window.DAOP.batchSize) || 120;
    const start = Math.floor(idx / BATCH) * BATCH;
    const end = Math.min(start + BATCH, list.length);
    return `${BASE}/data/batches/batch_${start}_${end}.js`;
  };

  window.DAOP.getTmdbBatchPath = function (id) {
    if (id == null) return null;
    const list = window.moviesLight || [];
    const idStr = String(id);
    const idx = list.findIndex(function (m) {
      return String(m.id) === idStr;
    });
    if (idx < 0) return null;
    const BATCH = (window.DAOP && window.DAOP.batchSize) || 120;
    const start = Math.floor(idx / BATCH) * BATCH;
    const end = Math.min(start + BATCH, list.length);
    return `${BASE}/data/batches/tmdb_batch_${start}_${end}.js`;
  };

  /** Load full movie by id (load batch then find) */
  window.DAOP.loadMovieDetail = function (id, callback) {
    const path = window.DAOP.getBatchPath(id);
    const tmdbPath = (window.DAOP && typeof window.DAOP.getTmdbBatchPath === 'function')
      ? window.DAOP.getTmdbBatchPath(id)
      : null;
    if (!path) {
      callback(null);
      return;
    }

    var done = 0;
    var failed = false;
    function finish() {
      if (failed) return;
      var need = tmdbPath ? 2 : 1;
      if (done < need) return;
      const batch = window.moviesBatch || [];
      const idStr = String(id);
      const movie = batch.find(function (m) {
        return String(m.id) === idStr;
      });
      if (!movie) {
        callback(null);
        return;
      }
      if (tmdbPath) {
        const tb = window.moviesTmdbBatch || [];
        const t = tb.find(function (x) { return x && String(x.id) === idStr; });
        if (t) {
          if (t.tmdb) movie.tmdb = t.tmdb;
          if (t.imdb) movie.imdb = t.imdb;
          if (t.cast) movie.cast = t.cast;
          if (t.director) movie.director = t.director;
          if (t.cast_meta) movie.cast_meta = t.cast_meta;
          if (t.keywords) movie.keywords = t.keywords;
        }
      }
      callback(movie);
    }

    const script = document.createElement('script');
    script.src = path;
    script.onload = function () {
      done++;
      finish();
    };
    script.onerror = function () {
      failed = true;
      callback(null);
    };
    document.head.appendChild(script);

    if (tmdbPath) {
      const script2 = document.createElement('script');
      script2.src = tmdbPath;
      script2.onload = function () {
        done++;
        finish();
      };
      script2.onerror = function () {
        done++;
        finish();
      };
      document.head.appendChild(script2);
    }
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
    if (u.startsWith('/uploads/')) return 'https://img.ophim.live' + u;
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
    const derivedPoster = (!m.poster && m.thumb && window.DAOP && typeof window.DAOP.derivePosterFromThumb === 'function')
      ? window.DAOP.derivePosterFromThumb(m.thumb)
      : '';
    const norm = (window.DAOP && typeof window.DAOP.normalizeImgUrl === 'function')
      ? window.DAOP.normalizeImgUrl
      : function (x) { return x; };
    const imgUrl = cardOrientation === 'horizontal'
      ? (norm(m.poster || derivedPoster || m.thumb || '').replace(/^\/\//, 'https://'))
      : (norm(m.thumb || m.poster || derivedPoster || '').replace(/^\/\//, 'https://'));
    const title = (m.title || '').replace(/</g, '&lt;');
    const origin = (m.origin_name || '').replace(/</g, '&lt;');

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
      '<div class="thumb-wrap"><img loading="lazy" src="' + imgUrl + '" alt="' + title + '"></div>' +
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
      return p.indexOf('/phim/') === 0 || p.indexOf('/xem-phim/') === 0;
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

    window.addEventListener('resize', function () {
      syncDesktopTop();
      syncHeaderOffsetVar();
    }, { passive: true });
    window.addEventListener('scroll', function () {
      syncDesktopTop();
    }, { passive: true });

    try {
      var mo = new MutationObserver(function () {
        syncHeaderOffsetVar();
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
      var href = (s.link_url || '#').replace(/"/g, '&quot;');
      var img = (s.image_url || '').replace(/"/g, '&quot;');
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
      html +=
        '<div class="slider-slide" data-index="' + i + '">' +
        '<a href="' + href + '" class="slider-slide-link">' +
        '<div class="slider-slide-bg"><img src="' + img + '" alt="' + title + '"></div>' +
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
        try { viewport.setPointerCapture(pointerId); } catch (err) {}
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
        }
        if (Math.abs(dx) >= 10) hadSwipe = true;
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
          if (dx < 0) goTo(idx + 1);
          else goTo(idx - 1);
        } else {
          resetTranslate();
          hadSwipe = false;
        }
        moved = false;
        pointerId = null;
        startAuto();
      }

      viewport.addEventListener('pointerup', endDrag);
      viewport.addEventListener('pointercancel', function (e) {
        if (!dragging) return;
        dragging = false;
        moved = false;
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
        if (Math.abs(dx) >= 10) hadSwipe = true;
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
  };

  /** Áp dụng site-settings lên trang: theme, logo, favicon, footer, TMDB, slider */
  window.DAOP.applySiteSettings = function (settings) {
    if (!settings) return;
    window.DAOP.siteName = settings.site_name || 'DAOP Phim';
    window.DAOP.supabaseUserUrl = settings.supabase_user_url || settings.supabaseUserUrl || window.DAOP.supabaseUserUrl || '';
    window.DAOP.supabaseUserAnonKey = settings.supabase_user_anon_key || settings.supabaseUserAnonKey || window.DAOP.supabaseUserAnonKey || '';
    if (document.title && settings.site_name && document.title.includes(' | DAOP Phim')) {
      document.title = document.title.replace(' | DAOP Phim', ' | ' + settings.site_name);
    }
    var root = document.documentElement;
    if (settings.theme_primary) root.style.setProperty('--accent', settings.theme_primary);
    if (settings.theme_accent) root.style.setProperty('--accent-hover', settings.theme_accent);
    if (settings.theme_bg) root.style.setProperty('--bg', settings.theme_bg);
    if (settings.theme_card) root.style.setProperty('--card', settings.theme_card);
    if (settings.theme_text) root.style.setProperty('--text', settings.theme_text);
    if (settings.theme_muted) root.style.setProperty('--muted', settings.theme_muted);
    if (settings.theme_link) root.style.setProperty('--link-color', settings.theme_link);
    if (settings.theme_header_logo) root.style.setProperty('--header-logo-color', settings.theme_header_logo);
    if (settings.theme_header_link) root.style.setProperty('--header-link-color', settings.theme_header_link);
    if (settings.theme_footer_text) root.style.setProperty('--footer-text-color', settings.theme_footer_text);
    if (settings.theme_section_title) root.style.setProperty('--section-title-color', settings.theme_section_title);
    if (settings.theme_filter_label) root.style.setProperty('--filter-label-color', settings.theme_filter_label);
    if (settings.theme_pagination) root.style.setProperty('--pagination-color', settings.theme_pagination);
    if (settings.theme_slider_title) root.style.setProperty('--slider-title-color', settings.theme_slider_title);
    if (settings.theme_slider_meta) root.style.setProperty('--slider-meta-color', settings.theme_slider_meta);
    if (settings.theme_slider_desc) root.style.setProperty('--slider-desc-color', settings.theme_slider_desc);
    if (settings.theme_movie_card_title) root.style.setProperty('--movie-card-title-color', settings.theme_movie_card_title);
    if (settings.theme_movie_card_meta) root.style.setProperty('--movie-card-meta-color', settings.theme_movie_card_meta);
    var logo = document.querySelector('.site-logo');
    if (logo && settings.logo_url) {
      logo.innerHTML = '<img src="' + (settings.logo_url || '').replace(/"/g, '&quot;') + '" alt="' + (settings.site_name || '').replace(/"/g, '&quot;') + '">';
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
    if (footer && settings.footer_content) {
      footer.innerHTML = settings.footer_content;
    }
    var footerLogo = document.querySelector('.site-footer .footer-logo');
    if (footerLogo) {
      var logoText = 'GoTV - Trang tổng hợp phim, video, chương trình, tư liệu giải trí đỉnh cao.';
      if (settings.logo_url) {
        var alt = (settings.site_name || 'GoTV').replace(/"/g, '&quot;');
        footerLogo.innerHTML = '<img src="' + (settings.logo_url || '').replace(/"/g, '&quot;') + '" alt="' + alt + '"><span class="footer-logo-text">' + logoText.replace(/"/g, '&quot;') + '</span>';
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
        var raw = settings.homepage_slider;
        var arr = typeof raw === 'string' ? (raw ? JSON.parse(raw) : []) : (Array.isArray(raw) ? raw : []);
        if (Array.isArray(arr) && arr.length > 0) {
          arr = arr.filter(function (s) { return s.enabled !== false; });
          arr.sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
          window.DAOP.renderSlider(sliderWrap, arr);
          var bannerWrap = document.getElementById('banner-wrap');
          if (bannerWrap) bannerWrap.style.display = 'none';
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
      const settings = await window.DAOP.loadConfig('site-settings');
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
