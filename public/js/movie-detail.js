<<<<<<< HEAD
/**
 * Trang chi tiết phim: load batch, render poster, meta, episodes, similar, comment nội bộ
 */
(function () {
  function applyDefaultHeaderVisibility() {
    try {
      var s = (window.DAOP && window.DAOP.siteSettings) || {};
      var hide = String(s.detail_hide_header_default || '').toLowerCase() === 'true';
      document.body.classList.toggle('hide-header', !!hide);
    } catch (e) {}
  }

  function ensureSiteSettings(done) {
    try {
      window.DAOP = window.DAOP || {};
      if (window.DAOP.siteSettings) return done && done();
      if (typeof window.DAOP.ensureSiteSettingsLoaded === 'function') {
        window.DAOP.ensureSiteSettingsLoaded()
          .then(function (s) {
            if (s) {
              window.DAOP.siteSettings = window.DAOP.siteSettings || s;
              if (window.DAOP.applySiteSettings) {
                try { window.DAOP.applySiteSettings(s); } catch (e) {}
              }
              applyDefaultHeaderVisibility();
            }
          })
          .catch(function () {})
          .finally(function () { if (done) done(); });
        return;
      }
      if (typeof window.DAOP.loadConfig !== 'function') return done && done();
      window.DAOP.loadConfig('site-settings')
        .then(function (s) {
          if (s) {
            window.DAOP.siteSettings = window.DAOP.siteSettings || s;
            if (window.DAOP.applySiteSettings) {
              try { window.DAOP.applySiteSettings(s); } catch (e) {}
            }
            applyDefaultHeaderVisibility();
          }
        })
        .catch(function () {})
        .finally(function () { if (done) done(); });
    } catch (e) {
      if (done) done();
    }
  }

  /** Giới hạn số request song song tới id-index (tránh tải quá nhiều shard cùng lúc). */
  function mapIdsWithPool(ids, concurrency, fn) {
    concurrency = Math.max(1, concurrency || 8);
    var list = ids.slice();
    var out = [];
    var i = 0;
    function worker() {
      if (i >= list.length) return Promise.resolve();
      var id = list[i++];
      return Promise.resolve(fn(id)).then(function (v) {
        out.push(v);
        return worker();
      });
    }
    var starters = [];
    var n = Math.min(concurrency, list.length);
    for (var k = 0; k < n; k++) starters.push(worker());
    return Promise.all(starters).then(function () { return out; });
  }

  function ensureFiltersLoaded() {
    try {
      if (window.filtersData && (window.filtersData.genreMap || window.filtersData.countryMap)) return Promise.resolve(true);
      var base = (window.DAOP && window.DAOP.basePath) || '';
      // Prefer JSON if available, fallback to legacy JS
      return fetch(base + '/data/filters.json' + ((window.DAOP && window.DAOP._dataCacheBust) || ''), { cache: 'force-cache' })
        .then(function (r) { return r && r.ok ? r.json() : Promise.reject(new Error('HTTP ' + (r ? r.status : 0))); })
        .then(function (data) { window.filtersData = data || {}; return true; })
        .catch(function () {
          return new Promise(function (resolve) {
            var url = base + '/data/filters.js' + ((window.DAOP && window.DAOP._dataCacheBust) || '');
            try {
              window.DAOP = window.DAOP || {};
              window.DAOP._loadedScripts = window.DAOP._loadedScripts || {};
              if (window.DAOP._loadedScripts[url]) return resolve(true);
              var s = document.createElement('script');
              s.src = url;
              s.onload = function () { window.DAOP._loadedScripts[url] = true; resolve(true); };
              s.onerror = function () { resolve(false); };
              document.head.appendChild(s);
            } catch (e) {
              resolve(false);
            }
          });
        });
    } catch (e2) {
      return Promise.resolve(false);
    }
  }

  function ensureCommentsLibsLoaded() {
    try {
      if (window.DAOP && typeof window.DAOP.mountComments === 'function') return Promise.resolve(true);
      var base = (window.DAOP && window.DAOP.basePath) || '';
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
      // DOMPurify is optional; comments.js should handle absence gracefully, but we try to load it.
      var purify = 'https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js';
      return loadScript(purify).then(function () {
        return loadScript(base + '/js/comments.js' + ((window.DAOP && window.DAOP._dataCacheBust) || ''));
      });
    } catch (e2) {
      return Promise.resolve(false);
    }
  }

  function getSimilar(movie, limit) {
    limit = limit || 16;
    var fd = window.filtersData || {};
    var genreMap = fd.genreMap || {};
    var genres = (movie && movie.genre ? movie.genre : [])
      .map(function (g) { return g && (g.slug || g.id); })
      .filter(Boolean);
    var idSet = new Set();
    genres.forEach(function (g) {
      var arr = genreMap[g] || [];
      (arr || []).forEach(function (id) { if (id != null) idSet.add(String(id)); });
    });
    if (movie && movie.id != null) idSet.delete(String(movie.id));
    var cap = Math.min(Math.max(limit * 2, limit), 36);
    var ids = Array.from(idSet).slice(0, cap);

    function getLightById(id) {
      if (window.DAOP && typeof window.DAOP.getMovieLightByIdAsync === 'function') {
        return window.DAOP.getMovieLightByIdAsync(id);
      }
      return Promise.resolve(null);
    }

    return mapIdsWithPool(ids, 8, getLightById)
      .then(function (arr) {
        var list = (arr || []).filter(Boolean);
        list.sort(function (a, b) {
          return (Number(b.year) || 0) - (Number(a.year) || 0);
        });
        return list.slice(0, limit);
      })
      .catch(function () {
        return [];
      });
  }

  function esc(s) {
    if (s == null || s === '') return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildMetaLinks(items, base, prefix) {
    if (!Array.isArray(items) || !items.length) return '';
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i] || {};
      var name = esc(item.name || '');
      if (!name) continue;
      var slug = String(item.slug || item.id || '').trim();
      if (!slug) {
        out.push(name);
        continue;
      }
      var href = base + prefix + encodeURIComponent(slug) + '.html';
      out.push('<a href="' + esc(href) + '">' + name + '</a>');
    }
    return out.join(', ');
  }

  function iconSvg(name) {
    if (name === 'play') {
      return '<svg class="md-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
    }
    if (name === 'heart') {
      return '<svg class="md-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 21s-7-4.35-9.33-8.53C.73 9.1 2.2 6.22 5.09 5.27c1.62-.53 3.42-.05 4.91 1.2 1.48-1.25 3.29-1.73 4.91-1.2 2.89.95 4.36 3.83 2.42 7.2C19 16.65 12 21 12 21z"/></svg>';
    }
    if (name === 'share') {
      return '<svg class="md-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M18 16a3 3 0 0 0-2.4 1.2l-6.2-3.1a3.1 3.1 0 0 0 0-1.8l6.2-3.1A3 3 0 1 0 14 7a3 3 0 0 0 .1.7L8 10.8a3 3 0 1 0 0 2.4l6.1 3.1a3 3 0 1 0 3.9-.3z"/></svg>';
    }
    if (name === 'chat') {
      return '<svg class="md-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 4h16v12H7l-3 3V4zm4 5h8v2H8V9zm0-3h12v2H8V6zm0 6h6v2H8v-2z"/></svg>';
    }
    if (name === 'spark') {
      return '<svg class="md-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2l1.2 4.2L17 7.4l-3.6 1.2L12 13l-1.4-4.4L7 7.4l3.8-1.2L12 2zm7 8l.9 3.1L23 14l-3.1.9L19 18l-1-3.1L15 14l3-1 .9-3zM5 12l.9 3.1L9 16l-3.1.9L5 20l-1-3.1L1 16l3-1 .9-3z"/></svg>';
    }
    if (name === 'info') {
      return '<svg class="md-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M11 10h2v7h-2v-7zm0-3h2v2h-2V7zm1-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg>';
    }
    if (name === 'chevDown') {
      return '<svg class="md-ico md-ico-chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>';
    }
    return '';
  }

  function setBgWithFallback(el, primaryUrl, fallbackUrl, defaultUrl) {
    if (!el) return;
    var p = String(primaryUrl || '').trim();
    var f = String(fallbackUrl || '').trim();
    var d = String(defaultUrl || '').trim();
    function set(u) {
      if (!u) return;
      el.style.backgroundImage = 'url(' + u + ')';
    }
    function test(u, ok, bad) {
      if (!u) return bad && bad();
      try {
        var img = new Image();
        img.onload = function () { ok && ok(); };
        img.onerror = function () { bad && bad(); };
        img.src = u;
      } catch {
        bad && bad();
      }
    }
    set(p || d);
    test(p,
      function () {},
      function () {
        if (f && f !== p) {
          set(f);
          test(f, function () {}, function () { if (d) set(d); });
        } else if (d) {
          set(d);
        }
      }
    );
  }

  function imgOnErrorAttr(ophimUrl, fallbackUrl, defaultUrl) {
    var o = String(ophimUrl || '').replace(/'/g, '%27');
    var f = String(fallbackUrl || '').replace(/'/g, '%27');
    var d = String(defaultUrl || '').replace(/'/g, '%27');
    if (o) {
      if (f && f !== o) {
        return ' onerror="this.onerror=function(){this.onerror=function(){this.onerror=null;this.src=\'' + d + '\';};this.src=\'' + f + '\';};this.src=\'' + o + '\';"';
      }
      return ' onerror="this.onerror=function(){this.onerror=null;this.src=\'' + d + '\';};this.src=\'' + o + '\';"';
    }
    if (f) {
      return ' onerror="this.onerror=function(){this.onerror=null;this.src=\'' + d + '\';};this.src=\'' + f + '\';"';
    }
    return ' onerror="this.onerror=null;this.src=\'' + d + '\';"';
  }

  function getSlug() {
    var hash = window.location.hash;
    if (hash && hash.length > 1) {
      var slug = decodeURIComponent(hash.slice(1));
      if (slug) {
        var clean = '/phim/' + slug + '.html';
        if (window.history && window.history.replaceState) window.history.replaceState(null, '', clean);
        return slug;
      }
    }
    var path = window.location.pathname;
    var m = path.match(/\/phim\/([^/]+)(\.html)?$/);
    if (!m) return null;
    var raw = decodeURIComponent(m[1]);
    return raw.replace(/\.html$/i, '') || null;
  }

  function slugifyActorName(input) {
    var s = String(input || '').trim().toLowerCase();
    if (!s) return '';
    try {
      if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch (e) {}
    s = s.replace(/đ/g, 'd');
    s = s.replace(/[^a-z0-9\s-]/g, ' ');
    s = s.replace(/\s+/g, '-').replace(/-+/g, '-');
    s = s.replace(/^-+/, '').replace(/-+$/, '');
    return s;
  }

  function formatCastInner(movie) {
    var base0 = (window.DAOP && window.DAOP.basePath) || '';
    var list = [];
    try {
      if (Array.isArray(movie && movie.cast_meta) && movie.cast_meta.length) {
        list = movie.cast_meta.slice(0, 10).map(function (c) {
          var display = (c && (c.name_vi || c.name)) ? String(c.name_vi || c.name) : '';
          var slugSource = (c && (c.name_original || c.name)) ? String(c.name_original || c.name) : display;
          return { display: display, slug: slugifyActorName(slugSource) };
        }).filter(function (x) { return x && x.display; });
      } else if (Array.isArray(movie && movie.cast) && movie.cast.length) {
        list = movie.cast.slice(0, 10).map(function (name) {
          var display2 = name != null ? String(name) : '';
          return { display: display2, slug: slugifyActorName(display2) };
        }).filter(function (x) { return x && x.display; });
      }
    } catch (e) {
      list = [];
    }
    if (!list.length) return '';

    return list.map(function (x) {
      var safe = String(x.display || '').replace(/</g, '&lt;');
      var slug = x.slug || '';
      return slug
        ? '<a href="' + base0 + '/dien-vien/' + slug + '.html">' + safe + '</a>'
        : safe;
    }).join(', ');
  }

  function scrollToId(id) {
    var el = document.getElementById(id);
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      el.scrollIntoView();
    }
  }

  function setupColumnPicker(container, gridId, storageKey) {
    if (!container) return;
    var grid = document.getElementById(gridId);
    if (!grid) return;

    function setCols(cols) {
      var all = ['2', '3', '4', '6', '8'];
      all.forEach(function (n) {
        grid.classList.remove('movies-grid--cols-' + n);
      });
      if (cols) grid.classList.add('movies-grid--cols-' + cols);
      container.querySelectorAll('[data-cols]').forEach(function (btn) {
        var active = btn.getAttribute('data-cols') === String(cols);
        btn.classList.toggle('md-col-btn--active', !!active);
      });
      try { localStorage.setItem(storageKey, String(cols)); } catch (e) {}
    }

    var initial = '4';
    try {
      var saved = localStorage.getItem(storageKey);
      if (saved) initial = saved;
    } catch (e) {}
    setCols(initial);

    container.querySelectorAll('[data-cols]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cols = btn.getAttribute('data-cols') || '';
        setCols(cols);
      });
    });
  }

  function getDetailRecSettings() {
    var s = (window.DAOP && window.DAOP.siteSettings) || {};
    var extra = parseInt(s.rec_grid_columns_extra || s.category_grid_columns_extra || s.grid_columns_extra || '8', 10);
    if ([6, 8, 10, 12, 14, 16].indexOf(extra) < 0) extra = 8;
    var usePoster = (s.rec_use_poster || s.category_use_poster || s.default_use_poster || 'thumb') === 'poster';
    var limit = parseInt(s.movie_detail_similar_limit || '16', 10);
    if (!isFinite(limit) || limit < 4) limit = 16;
    if (limit > 50) limit = 50;
    var w = window.innerWidth || document.documentElement.clientWidth;
    var xs = parseInt(s.rec_grid_cols_xs || s.category_grid_cols_xs || s.default_grid_cols_xs || '2', 10);
    var sm = parseInt(s.rec_grid_cols_sm || s.category_grid_cols_sm || s.default_grid_cols_sm || '3', 10);
    var md = parseInt(s.rec_grid_cols_md || s.category_grid_cols_md || s.default_grid_cols_md || '4', 10);
    var lg = parseInt(s.rec_grid_cols_lg || s.category_grid_cols_lg || s.default_grid_cols_lg || '6', 10);
    var gridCols = w >= 1024 ? lg : w >= 768 ? md : w >= 480 ? sm : xs;
    var allowed = [2, 3, 4, extra];
    if (allowed.indexOf(gridCols) < 0) gridCols = 4;
    return { extra: extra, usePoster: usePoster, limit: limit, gridCols: gridCols };
  }

  function setupRecommendToolbar(toolbarEl, gridEl, baseUrl, listRef) {
    if (!toolbarEl || !gridEl) return;
    var render = window.DAOP && window.DAOP.renderMovieCard;
    if (!render) return;

    var cfg = getDetailRecSettings();
    var gridCols = cfg.gridCols || 4;
    var usePoster = cfg.usePoster;
    var gridColumnsExtra = cfg.extra;

    function applyGridClass() {
      [2, 3, 4, 6, 8, 10, 12, 14, 16].forEach(function (n) { gridEl.classList.remove('movies-grid--cols-' + n); });
      gridEl.classList.add('movies-grid--cols-' + gridCols);
      toolbarEl.querySelectorAll('.grid-cols-btn').forEach(function (b) {
        b.classList.toggle('active', parseInt(b.getAttribute('data-cols'), 10) === gridCols);
      });
      var posterSel = toolbarEl.querySelector('.grid-poster-select');
      if (posterSel) posterSel.value = usePoster ? 'poster' : 'thumb';
    }

    function rerenderCards() {
      var list = (listRef && listRef.list) ? listRef.list : [];
      var html = '';
      var midAfter = 8;
      var midEvery = 12;
      for (var i = 0; i < list.length; i++) {
        html += render(list[i], baseUrl, { usePoster: usePoster });
        var idx1 = i + 1;
        if (idx1 === midAfter || (idx1 > midAfter && ((idx1 - midAfter) % midEvery === 0))) {
          html += '<div class="ad-slot ad-slot--grid" data-ad-position="detail_mid"></div>';
        }
      }
      gridEl.innerHTML = html;

      if (window.DAOP && typeof window.DAOP.renderAdsInDocument === 'function') {
        window.DAOP.renderAdsInDocument(gridEl);
      }
    }

    var extraOpts = '<option value="6"' + (gridColumnsExtra === 6 ? ' selected' : '') + '>6</option>' +
      '<option value="8"' + (gridColumnsExtra === 8 ? ' selected' : '') + '>8</option>' +
      '<option value="10"' + (gridColumnsExtra === 10 ? ' selected' : '') + '>10</option>' +
      '<option value="12"' + (gridColumnsExtra === 12 ? ' selected' : '') + '>12</option>' +
      '<option value="14"' + (gridColumnsExtra === 14 ? ' selected' : '') + '>14</option>' +
      '<option value="16"' + (gridColumnsExtra === 16 ? ' selected' : '') + '>16</option>';
    var html = '';
    html += '<span class="filter-label">Cột:</span>';
    html += '<button type="button" class="grid-cols-btn' + (2 === gridCols ? ' active' : '') + '" data-cols="2">2</button>';
    html += '<button type="button" class="grid-cols-btn' + (3 === gridCols ? ' active' : '') + '" data-cols="3">3</button>';
    html += '<button type="button" class="grid-cols-btn' + (4 === gridCols ? ' active' : '') + '" data-cols="4">4</button>';
    html += '<select class="grid-cols-select" id="md-rec-cols-extra" aria-label="Cột thêm">' + extraOpts + '</select>';
    html += '<button type="button" class="grid-cols-btn' + (gridColumnsExtra === gridCols ? ' active' : '') + '" data-cols="' + gridColumnsExtra + '" id="md-rec-cols-extra-btn">' + gridColumnsExtra + '</button>';
    html += '<label class="grid-poster-toggle"><span class="filter-label">Ảnh:</span><select class="grid-poster-select" name="use_poster"><option value="thumb"' + (!usePoster ? ' selected' : '') + '>Thumb</option><option value="poster"' + (usePoster ? ' selected' : '') + '>Poster</option></select></label>';
    toolbarEl.innerHTML = html;

    toolbarEl.querySelectorAll('.grid-cols-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        gridCols = parseInt(btn.getAttribute('data-cols'), 10);
        applyGridClass();
      });
    });
    var exSel = toolbarEl.querySelector('#md-rec-cols-extra');
    var exBtn = toolbarEl.querySelector('#md-rec-cols-extra-btn');
    if (exSel && exBtn) {
      exSel.addEventListener('change', function () {
        var oldExtra = gridColumnsExtra;
        gridColumnsExtra = parseInt(exSel.value, 10);
        exBtn.textContent = gridColumnsExtra;
        exBtn.setAttribute('data-cols', gridColumnsExtra);
        if (gridCols === oldExtra) gridCols = gridColumnsExtra;
        applyGridClass();
      });
    }
    var posterSel = toolbarEl.querySelector('.grid-poster-select');
    if (posterSel) {
      posterSel.addEventListener('change', function () {
        usePoster = this.value === 'poster';
        rerenderCards();
        applyGridClass();
      });
    }

    rerenderCards();
    applyGridClass();
  }

  function setupActions(movie) {
    var btnInfo = document.getElementById('btn-toggle-info');
    var infoEl = document.getElementById('movie-info');
    var btnComments = document.getElementById('btn-scroll-comments');
    var btnCollapseComments = document.getElementById('btn-collapse-comments');
    var btnRecommend = document.getElementById('btn-scroll-recommend');
    var btnShare = document.getElementById('btn-share');

    if (btnInfo && infoEl) {
      btnInfo.addEventListener('click', function () {
        infoEl.classList.toggle('md-info--open');
        btnInfo.classList.toggle('md-action-btn--active');
        btnInfo.classList.toggle('md-info-toggle--open');
        try { btnInfo.setAttribute('aria-expanded', infoEl.classList.contains('md-info--open') ? 'true' : 'false'); } catch (e) {}
      });
    }
    if (btnComments) {
      btnComments.addEventListener('click', function () {
        var sec = document.getElementById('movie-comments');
        if (sec && sec.classList.contains('movie-comments--collapsed')) {
          sec.classList.remove('movie-comments--collapsed');
          var ctn = document.getElementById('comments-container');
          if (window.DAOP && typeof window.DAOP._commentsStartLoad === 'function' && ctn) window.DAOP._commentsStartLoad(ctn);
        }
        scrollToId('movie-comments');
      });
    }
    if (btnCollapseComments) {
      btnCollapseComments.addEventListener('click', function () {
        var sec = document.getElementById('movie-comments');
        if (!sec) return;
        var expanding = sec.classList.contains('movie-comments--collapsed');
        sec.classList.toggle('movie-comments--collapsed');
        if (expanding) {
          var ctn = document.getElementById('comments-container');
          if (window.DAOP && typeof window.DAOP._commentsStartLoad === 'function' && ctn) window.DAOP._commentsStartLoad(ctn);
        }
      });
    }
    if (btnRecommend) {
      btnRecommend.addEventListener('click', function () { scrollToId('movie-recommend'); });
    }
    if (btnShare) {
      btnShare.addEventListener('click', function () {
        var url = window.location.href;
        var title = (movie && movie.title) ? movie.title : document.title;
        if (navigator.share) {
          navigator.share({ title: title, url: url }).catch(function () {});
          return;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () {
            btnShare.textContent = 'Đã copy link';
            setTimeout(function () { btnShare.textContent = 'Chia sẻ'; }, 1500);
          }).catch(function () {});
        }
      });
    }
  }

  function applySeoFromLight(light, slugFallback) {
    var t = (light && light.title) || slugFallback || '';
    document.title = t + ' | ' + ((window.DAOP && window.DAOP.siteName) || 'DAOP Phim');
    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', String((light && (light.description || light.title)) || '').slice(0, 160));
    }
  }

  function applySeoFromMovie(movie, slugFallback) {
    var t = (movie && movie.title) || slugFallback || '';
    document.title = t + ' | ' + ((window.DAOP && window.DAOP.siteName) || 'DAOP Phim');
    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      var d = (movie && (movie.description || movie.content || movie.title)) || '';
      metaDesc.setAttribute('content', String(d).slice(0, 160));
    }
  }

  function init() {
    var slug = getSlug();
    if (!slug) {
      document.getElementById('movie-detail') && (document.getElementById('movie-detail').innerHTML = '<p>Không tìm thấy phim.</p>');
      return;
    }
    if (window.DAOP && typeof window.DAOP.preloadIndexMeta === 'function') {
      try { window.DAOP.preloadIndexMeta(); } catch (ePre) {}
    }

    var el = document.getElementById('movie-detail');
    var base = (window.DAOP && window.DAOP.basePath) || '';
    var notFoundHtml = '<div class="movie-not-found"><p><strong>Không tìm thấy phim</strong> với đường dẫn này.</p>' +
      '<p>Phim có thể chưa có trong dữ liệu (do giới hạn build hoặc chưa cập nhật).</p>' +
      '<p><a href="' + base + '/tim-kiem.html">Tìm kiếm phim</a> · <a href="' + base + '/">Trang chủ</a></p></div>';

    function finishFromResolve(movie, light) {
      if (movie) {
        applySeoFromMovie(movie, slug);
        renderFull(movie);
        return;
      }
      if (light) {
        applySeoFromLight(light, slug);
        renderFromLight(light);
        return;
      }
      if (el) el.innerHTML = notFoundHtml;
    }

    if (window.DAOP && typeof window.DAOP.resolveMovieForSlugPageAsync === 'function') {
      window.DAOP.resolveMovieForSlugPageAsync(slug).then(function (res) {
        finishFromResolve(res && res.movie, res && res.light);
      }).catch(function () {
        if (el) el.innerHTML = notFoundHtml;
      });
      return;
    }

    var getLight = (window.DAOP && typeof window.DAOP.getMovieBySlugAsync === 'function')
      ? window.DAOP.getMovieBySlugAsync
      : function (s) { return Promise.resolve(window.DAOP && window.DAOP.getMovieBySlug ? window.DAOP.getMovieBySlug(s) : null); };
    var preloadMeta = (window.DAOP && typeof window.DAOP.preloadIndexMeta === 'function')
      ? window.DAOP.preloadIndexMeta()
      : Promise.resolve();
    Promise.all([getLight(slug), preloadMeta]).then(function (arr) {
      var light = arr[0];
      if (!light) {
        if (el) el.innerHTML = notFoundHtml;
        return;
      }
      applySeoFromLight(light, slug);
      var slugForJson = String(light.slug || slug || '').trim();
      var loadFull =
        window.DAOP && typeof window.DAOP.loadMovieDetailBySlug === 'function'
          ? window.DAOP.loadMovieDetailBySlug
          : function (s, cb) {
              if (light.id != null && window.DAOP.loadMovieDetail) {
                window.DAOP.loadMovieDetail(light.id, cb);
              } else cb(null);
            };
      loadFull(slugForJson, function (movie) {
        if (!movie) {
          renderFromLight(light);
          return;
        }
        applySeoFromMovie(movie, slug);
        renderFull(movie);
      });
    });
  }

  function renderFromLight(light) {
    var base = (window.DAOP && window.DAOP.basePath) || '';
    var defaultPoster = base + '/images/default_poster.png';
    var defaultThumb = base + '/images/default_thumb.png';
    var posterUrl = (light && light.poster) ? String(light.poster) : '';
    var thumbUrl = (light && light.thumb) ? String(light.thumb) : '';
    var posterFinal = posterUrl || defaultPoster;
    var thumbFinal = thumbUrl || defaultThumb;
    var slug = light.slug || '';
    var watchHref = base + '/xem-phim/' + encodeURIComponent(slug) + '.html';
    var posterBg = posterUrl || '';
    var title = esc(light.title || '');
    var origin = esc(light.origin_name || '');
    var year = esc(light.year || '');
    var metaLine = year + (light.episode_current ? ' • ' + esc(light.episode_current) + ' tập' : '');
    var html = '' +
      '<div class="movie-detail-wrap">' +
      '<div class="ad-slot" data-ad-position="detail_top"></div>' +
      '  <div class="md-page">' +
      '    <div class="md-hero">' +
      '      <div class="md-hero-bg" id="md-hero-bg" style="background-image:url(' + esc(posterBg || posterFinal) + ')"></div>' +
      '      <div class="md-hero-inner">' +
      '        <div class="md-thumb"><img width="400" height="600" decoding="async" fetchpriority="high" src="' + esc(thumbFinal) + '" onerror="this.onerror=null;this.src=\'' + esc(defaultThumb) + '\';" alt=""></div>' +
      '        <div class="md-hero-meta">' +
      '          <div class="md-title">' + title + '</div>' +
      (origin ? '        <div class="md-origin">' + origin + '</div>' : '') +
      (metaLine.trim() ? '        <div class="md-meta">' + esc(metaLine) + '</div>' : '') +
      '          <div class="md-hero-cta">' +
      '            <a class="md-watch" href="' + esc(watchHref) + '">' + iconSvg('play') + '<span class="md-watch-label">Xem ngay</span></a>' +
      '            <div class="md-actions">' +
      '              <button type="button" class="md-action-btn" id="btn-share">' + iconSvg('share') + '<span class="md-action-label">Chia sẻ</span></button>' +
      '            </div>' +
      '          </div>' +
      '        </div>' +
      '      </div>' +
      '    </div>' +
      '    <div class="md-content">' +
      '      <section class="md-section md-info-toggle-section">' +
      '        <button type="button" class="md-action-btn md-info-toggle" id="btn-toggle-info" aria-controls="movie-info" aria-expanded="false">' + iconSvg('info') + '<span class="md-info-label">Thông tin phim</span>' + iconSvg('chevDown') + '</button>' +
      '      </section>' +
      '      <section id="movie-info" class="md-info">' +
      '        <div class="md-desc"></div>' +
      '      </section>' +
      '    </div>' +
      '    <div class="ad-slot" data-ad-position="detail_bottom"></div>' +
      '  </div>' +
      '</div>';
    var el = document.getElementById('movie-detail');
    if (el) el.innerHTML = html;
    setBgWithFallback(document.getElementById('md-hero-bg'), posterBg || posterFinal, '', defaultPoster);
    setupActions(light);

    if (window.DAOP && typeof window.DAOP.renderAdsInDocument === 'function') {
      window.DAOP.renderAdsInDocument(el || document);
    }
  }

  function renderFull(movie) {
    var base = (window.DAOP && window.DAOP.basePath) || '';
    var defaultPoster = base + '/images/default_poster.png';
    var defaultThumb = base + '/images/default_thumb.png';
    var poster = (movie && movie.poster) ? String(movie.poster) : '';
    var thumbMain = (movie && movie.thumb) ? String(movie.thumb) : '';
    var posterFinal = poster || defaultPoster;
    var thumbFinal = thumbMain || defaultThumb;
    var posterBg = poster || '';
    var title = (movie.title || '').replace(/</g, '&lt;');
    var origin = (movie.origin_name || '').replace(/</g, '&lt;');
    var genreStr = buildMetaLinks(movie.genre || [], base, '/the-loai/');
    var countryStr = buildMetaLinks(movie.country || [], base, '/quoc-gia/');
    var desc = (movie.description || movie.content || '').replace(/</g, '&lt;').replace(/\n/g, '<br>');
    var castStr = formatCastInner(movie);
    var directorStr = (movie.director || []).join(', ');
    var showtimesRaw = (movie && movie.showtimes != null) ? String(movie.showtimes).trim() : '';
    var showtimes = showtimesRaw ? '<p class="meta-line meta-line--showtimes">Lịch chiếu: ' + showtimesRaw.replace(/</g, '&lt;') + '</p>' : '';

    var watchHref = base + '/xem-phim/' + encodeURIComponent(movie.slug || '') + '.html';
    var watchLabel = 'Xem ngay';
    try {
      var us0 = window.DAOP && window.DAOP.userSync;
      if (us0 && typeof us0.getWatchHistory === 'function') {
        var hist0 = us0.getWatchHistory().find(function (x) { return x && x.slug === movie.slug; });
        if (hist0 && hist0.episode) {
          watchHref = base + '/xem-phim/' + encodeURIComponent(movie.slug || '') + '.html?ep=' + encodeURIComponent(String(hist0.episode));
          if (hist0.server) watchHref += '&sv=' + encodeURIComponent(String(hist0.server));
          if (hist0.linkType) watchHref += '&lt=' + encodeURIComponent(String(hist0.linkType));
          if (hist0.groupIdx != null && hist0.groupIdx !== '') watchHref += '&g=' + encodeURIComponent(String(hist0.groupIdx));
          watchLabel = 'Tiếp tục xem';
        }
      }
    } catch (e) {}

    var yearNum = parseInt(movie.year, 10);
    var yearVal = isFinite(yearNum) ? String(yearNum) : String(movie.year || '').trim();
    var yearHref = yearVal ? (base + '/nam-phat-hanh/' + encodeURIComponent(yearVal) + '.html') : '';

    var infoHtml = '' +
      (genreStr ? '<div class="md-info-line"><span class="md-info-key">Thể loại</span><span class="md-info-val">' + genreStr + '</span></div>' : '') +
      (countryStr ? '<div class="md-info-line"><span class="md-info-key">Quốc gia</span><span class="md-info-val">' + countryStr + '</span></div>' : '') +
      (directorStr ? '<div class="md-info-line"><span class="md-info-key">Đạo diễn</span><span class="md-info-val">' + esc(directorStr) + '</span></div>' : '') +
      (castStr ? '<div class="md-info-line"><span class="md-info-key">Diễn viên</span><span class="md-info-val" id="md-info-cast">' + castStr + '</span></div>' : '') +
      (yearVal ? '<div class="md-info-line"><span class="md-info-key">Năm</span><span class="md-info-val"><a href="' + esc(yearHref) + '">' + esc(yearVal) + '</a></span></div>' : '') +
      (movie.quality ? '<div class="md-info-line"><span class="md-info-key">Chất lượng</span><span class="md-info-val">' + esc(movie.quality) + '</span></div>' : '') +
      (movie.episode_current ? '<div class="md-info-line"><span class="md-info-key">Tập</span><span class="md-info-val">' + esc(movie.episode_current) + '</span></div>' : '') +
      '';

    var html = '' +
      '<div class="movie-detail-wrap">' +
      '<div class="ad-slot" data-ad-position="detail_top"></div>' +
      '  <div class="md-page">' +
      '    <div class="md-hero">' +
      '      <div class="md-hero-bg" id="md-hero-bg" style="background-image:url(' + esc(posterBg || posterFinal) + ')"></div>' +
      '      <div class="md-hero-inner">' +
      '        <div class="md-thumb"><img width="400" height="600" decoding="async" fetchpriority="high" src="' + esc(thumbFinal) + '" onerror="this.onerror=null;this.src=\'' + esc(defaultThumb) + '\';" alt=""></div>' +
      '        <div class="md-hero-meta">' +
      '          <div class="md-title">' + title + '</div>' +
      (origin ? '        <div class="md-origin">' + origin + '</div>' : '') +
      '          <div class="md-meta">' + esc((movie.year || '') + (movie.episode_current ? ' • ' + movie.episode_current + ' tập' : '') + (movie.quality ? ' • ' + movie.quality : '')) + '</div>' +
      (showtimes ? ('          ' + showtimes) : '') +
      '          <div class="md-hero-cta">' +
      '            <a class="md-watch" href="' + esc(watchHref) + '">' + iconSvg('play') + '<span class="md-watch-label">' + esc(watchLabel) + '</span></a>' +
      '            <div class="md-actions">' +
      '              <button type="button" class="md-action-btn movie-fav-btn" data-movie-slug="' + esc(movie.slug || '') + '" aria-label="Yêu thích" aria-pressed="false">' + iconSvg('heart') + '<span class="md-action-label">Yêu thích</span></button>' +
      '              <button type="button" class="md-action-btn" id="btn-share">' + iconSvg('share') + '<span class="md-action-label">Chia sẻ</span></button>' +
      '              <button type="button" class="md-action-btn" id="btn-scroll-comments">' + iconSvg('chat') + '<span class="md-action-label">Bình luận</span></button>' +
      '              <button type="button" class="md-action-btn" id="btn-scroll-recommend">' + iconSvg('spark') + '<span class="md-action-label">Đề xuất</span></button>' +
      '            </div>' +
      '          </div>' +
      '        </div>' +
      '      </div>' +
      '    </div>' +
      '    <div class="md-content">' +
      '      <div class="md-left">' +
      '        <section class="md-section md-info-toggle-section">' +
      '          <button type="button" class="md-action-btn md-info-toggle" id="btn-toggle-info" aria-controls="movie-info" aria-expanded="false">' + iconSvg('info') + '<span class="md-info-label">Thông tin phim</span>' + iconSvg('chevDown') + '</button>' +
      '        </section>' +
      '        <section id="movie-info" class="md-info">' +
      '          <div class="md-desc">' + desc + '</div>' +
      (infoHtml ? '        <div class="md-info-grid">' + infoHtml + '</div>' : '') +
      '        </section>' +
      '      </div>' +
      '      <div class="md-right">' +
      '        <section id="movie-comments" class="md-section movie-comments--collapsed">' +
      '          <div class="md-section-head">' +
      '            <h3 class="md-section-title" style="margin: 0;">' + iconSvg('chat') + '<span class="md-section-title-text">Bình luận</span></h3>' +
      '            <button type="button" id="btn-collapse-comments" class="md-comments-collapse" aria-label="Thu gọn/Mở rộng bình luận">' + iconSvg('chevDown') + '</button>' +
      '          </div>' +
      '          <div id="comments-container" data-post-slug="' + esc(movie.slug || '') + '"></div>' +
      '        </section>' +
      '      </div>' +
      '      <section id="movie-recommend" class="md-section md-recommend">' +
      '       <div class="md-section-head">' +
      '         <h3 class="md-section-title">' + iconSvg('spark') + '<span class="md-section-title-text">Đề xuất</span></h3>' +
      '         <div class="grid-toolbar" id="md-rec-toolbar" aria-label="Tùy chọn hiển thị"></div>' +
      '       </div>' +
      '       <div class="movies-grid" id="similar-grid"><p>Đang tải...</p></div>' +
      '     </section>' +
      '   </div>' +
      '   <div class="ad-slot" data-ad-position="detail_bottom"></div>' +
      '</div>' +
      '</div>';
    var el = document.getElementById('movie-detail');
    if (el) el.innerHTML = html;

    setBgWithFallback(document.getElementById('md-hero-bg'), posterBg || posterFinal, '', defaultPoster);

    var cfg = getDetailRecSettings();
    var grid = document.getElementById('similar-grid');
    var baseUrl = (window.DAOP && window.DAOP.basePath) || '';
    if (grid) grid.className = 'movies-grid';

    var listRef = { list: [] };
    var toolbarEl = document.getElementById('md-rec-toolbar');
    // Lazy-load similar: only fetch filters + id-index when user scrolls near the section.
    (function mountSimilarLazy() {
      if (!grid) return;
      grid.innerHTML = '<p>Đang tải...</p>';
      var started = false;
      function start() {
        if (started) return;
        started = true;
        ensureFiltersLoaded()
          .then(function () { return getSimilar(movie, cfg.limit); })
          .then(function (list) {
            listRef.list = Array.isArray(list) ? list : [];
            setupRecommendToolbar(toolbarEl, grid, baseUrl, listRef);
          })
          .catch(function () {
            listRef.list = [];
            setupRecommendToolbar(toolbarEl, grid, baseUrl, listRef);
          });
      }
      try {
        if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 1500 });
      } catch (e0) {}
      try {
        if ('IntersectionObserver' in window) {
          var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
              if (en && en.isIntersecting) {
                try { io.disconnect(); } catch (e1) {}
                start();
              }
            });
          }, { rootMargin: '400px' });
          io.observe(grid);
          return;
        }
      } catch (e2) {}
      // Fallback: start soon anyway
      setTimeout(start, 800);
    })();

    setupActions(movie);
    try {
      if (window.DAOP && typeof window.DAOP.refreshQuickFavorites === 'function') window.DAOP.refreshQuickFavorites();
    } catch (e2) {}

    // Lazy-load comments libs + mount only when user opens comments.
    (function mountCommentsLazy() {
      var btnComments = document.getElementById('btn-scroll-comments');
      var btnCollapseComments = document.getElementById('btn-collapse-comments');
      var mounted = false;
      function mountOnce() {
        if (mounted) return;
        mounted = true;
        ensureCommentsLibsLoaded().then(function () {
          try {
            if (window.DAOP && typeof window.DAOP.mountComments === 'function') {
              window.DAOP.mountComments('#comments-container', { postSlug: movie.slug || '' });
            }
          } catch (e0) {}
        });
      }
      function attach(el) {
        if (!el) return;
        el.addEventListener('click', function () { mountOnce(); }, { once: true });
      }
      attach(btnComments);
      attach(btnCollapseComments);
    })();

    if (window.DAOP && typeof window.DAOP.renderAdsInDocument === 'function') {
      window.DAOP.renderAdsInDocument(el || document);
    }

  }

  function attachEpisodeButtons(movie) {
    document.querySelectorAll('.episode-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ep = btn.getAttribute('data-episode');
        var link = btn.getAttribute('data-link');
        if (window.DAOP && window.DAOP.openPlayer) {
          window.DAOP.openPlayer({ slug: movie.slug, episode: ep, link: link, movie: movie });
        } else if (link) {
          window.open(link, '_blank');
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { ensureSiteSettings(init); });
  } else {
    ensureSiteSettings(init);
  }
})();
=======
(function(){function H(){try{var t=window.DAOP&&window.DAOP.siteSettings||{},e=String(t.detail_hide_header_default||"").toLowerCase()==="true";document.body.classList.toggle("hide-header",!!e)}catch(s){}}function q(t){try{if(window.DAOP=window.DAOP||{},window.DAOP.siteSettings)return t&&t();if(typeof window.DAOP.ensureSiteSettingsLoaded=="function"){window.DAOP.ensureSiteSettingsLoaded().then(function(e){if(e){if(window.DAOP.siteSettings=window.DAOP.siteSettings||e,window.DAOP.applySiteSettings)try{window.DAOP.applySiteSettings(e)}catch(s){}H()}}).catch(function(){}).finally(function(){t&&t()});return}if(typeof window.DAOP.loadConfig!="function")return t&&t();window.DAOP.loadConfig("site-settings").then(function(e){if(e){if(window.DAOP.siteSettings=window.DAOP.siteSettings||e,window.DAOP.applySiteSettings)try{window.DAOP.applySiteSettings(e)}catch(s){}H()}}).catch(function(){}).finally(function(){t&&t()})}catch(e){t&&t()}}function J(t,e,s){e=Math.max(1,e||8);var n=t.slice(),i=[],r=0;function o(){if(r>=n.length)return Promise.resolve();var u=n[r++];return Promise.resolve(s(u)).then(function(m){return i.push(m),o()})}for(var a=[],d=Math.min(e,n.length),c=0;c<d;c++)a.push(o());return Promise.all(a).then(function(){return i})}function Z(){try{if(window.filtersData&&(window.filtersData.genreMap||window.filtersData.countryMap))return Promise.resolve(!0);var t=window.DAOP&&window.DAOP.basePath||"";return fetch(t+"/data/filters.json"+(window.DAOP&&window.DAOP._dataCacheBust||""),{cache:"force-cache"}).then(function(e){return e&&e.ok?e.json():Promise.reject(new Error("HTTP "+(e?e.status:0)))}).then(function(e){return window.filtersData=e||{},!0}).catch(function(){return new Promise(function(e){var s=t+"/data/filters.js"+(window.DAOP&&window.DAOP._dataCacheBust||"");try{if(window.DAOP=window.DAOP||{},window.DAOP._loadedScripts=window.DAOP._loadedScripts||{},window.DAOP._loadedScripts[s])return e(!0);var n=document.createElement("script");n.src=s,n.onload=function(){window.DAOP._loadedScripts[s]=!0,e(!0)},n.onerror=function(){e(!1)},document.head.appendChild(n)}catch(i){e(!1)}})})}catch(e){return Promise.resolve(!1)}}function tt(){try{let n=function(i){return new Promise(function(r){try{window.DAOP=window.DAOP||{},window.DAOP._loadedScripts=window.DAOP._loadedScripts||{};var o=String(i);if(window.DAOP._loadedScripts[o])return r(!0);var a=document.createElement("script");a.src=i,a.onload=function(){window.DAOP._loadedScripts[o]=!0,r(!0)},a.onerror=function(){r(!1)},document.head.appendChild(a)}catch(d){r(!1)}})};var s=n;if(window.DAOP&&typeof window.DAOP.mountComments=="function")return Promise.resolve(!0);var t=window.DAOP&&window.DAOP.basePath||"",e="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js";return n(e).then(function(){return n(t+"/js/comments.js"+(window.DAOP&&window.DAOP._dataCacheBust||""))})}catch(n){return Promise.resolve(!1)}}function et(t,e){e=e||16;var s=window.filtersData||{},n=s.genreMap||{},i=(t&&t.genre?t.genre:[]).map(function(c){return c&&(c.slug||c.id)}).filter(Boolean),r=new Set;i.forEach(function(c){var u=n[c]||[];(u||[]).forEach(function(m){m!=null&&r.add(String(m))})}),t&&t.id!=null&&r.delete(String(t.id));var o=Math.min(Math.max(e*2,e),36),a=Array.from(r).slice(0,o);function d(c){return window.DAOP&&typeof window.DAOP.getMovieLightByIdAsync=="function"?window.DAOP.getMovieLightByIdAsync(c):Promise.resolve(null)}return J(a,8,d).then(function(c){var u=(c||[]).filter(Boolean);return u.sort(function(m,f){return(Number(f.year)||0)-(Number(m.year)||0)}),u.slice(0,e)}).catch(function(){return[]})}function l(t){return t==null||t===""?"":String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function R(t,e,s){if(!Array.isArray(t)||!t.length)return"";for(var n=[],i=0;i<t.length;i++){var r=t[i]||{},o=l(r.name||"");if(o){var a=String(r.slug||r.id||"").trim();if(!a){n.push(o);continue}var d=e+s+encodeURIComponent(a)+".html";n.push('<a href="'+l(d)+'">'+o+"</a>")}}return n.join(", ")}function v(t){return t==="play"?'<svg class="md-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>':t==="heart"?'<svg class="md-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 21s-7-4.35-9.33-8.53C.73 9.1 2.2 6.22 5.09 5.27c1.62-.53 3.42-.05 4.91 1.2 1.48-1.25 3.29-1.73 4.91-1.2 2.89.95 4.36 3.83 2.42 7.2C19 16.65 12 21 12 21z"/></svg>':t==="share"?'<svg class="md-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M18 16a3 3 0 0 0-2.4 1.2l-6.2-3.1a3.1 3.1 0 0 0 0-1.8l6.2-3.1A3 3 0 1 0 14 7a3 3 0 0 0 .1.7L8 10.8a3 3 0 1 0 0 2.4l6.1 3.1a3 3 0 1 0 3.9-.3z"/></svg>':t==="chat"?'<svg class="md-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 4h16v12H7l-3 3V4zm4 5h8v2H8V9zm0-3h12v2H8V6zm0 6h6v2H8v-2z"/></svg>':t==="spark"?'<svg class="md-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2l1.2 4.2L17 7.4l-3.6 1.2L12 13l-1.4-4.4L7 7.4l3.8-1.2L12 2zm7 8l.9 3.1L23 14l-3.1.9L19 18l-1-3.1L15 14l3-1 .9-3zM5 12l.9 3.1L9 16l-3.1.9L5 20l-1-3.1L1 16l3-1 .9-3z"/></svg>':t==="info"?'<svg class="md-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M11 10h2v7h-2v-7zm0-3h2v2h-2V7zm1-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg>':t==="chevDown"?'<svg class="md-ico md-ico-chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>':""}function U(t,e,s,n){if(!t)return;var i=String(e||"").trim(),r=String(s||"").trim(),o=String(n||"").trim();function a(c){c&&(t.style.backgroundImage="url("+c+")")}function d(c,u,m){if(!c)return m&&m();try{var f=new Image;f.onload=function(){u&&u()},f.onerror=function(){m&&m()},f.src=c}catch(h){m&&m()}}a(i||o),d(i,function(){},function(){r&&r!==i?(a(r),d(r,function(){},function(){o&&a(o)})):o&&a(o)})}function ct(t,e,s){var n=String(t||"").replace(/'/g,"%27"),i=String(e||"").replace(/'/g,"%27"),r=String(s||"").replace(/'/g,"%27");return n?i&&i!==n?` onerror="this.onerror=function(){this.onerror=function(){this.onerror=null;this.src='`+r+"';};this.src='"+i+"';};this.src='"+n+`';"`:` onerror="this.onerror=function(){this.onerror=null;this.src='`+r+"';};this.src='"+n+`';"`:i?` onerror="this.onerror=function(){this.onerror=null;this.src='`+r+"';};this.src='"+i+`';"`:` onerror="this.onerror=null;this.src='`+r+`';"`}function nt(){var t=window.location.hash;if(t&&t.length>1){var e=decodeURIComponent(t.slice(1));if(e){var s="/phim/"+e+".html";return window.history&&window.history.replaceState&&window.history.replaceState(null,"",s),e}}var n=window.location.pathname,i=n.match(/\/phim\/([^/]+)(\.html)?$/);if(!i)return null;var r=decodeURIComponent(i[1]);return r.replace(/\.html$/i,"")||null}function F(t){var e=String(t||"").trim().toLowerCase();if(!e)return"";try{e.normalize&&(e=e.normalize("NFD").replace(/[\u0300-\u036f]/g,""))}catch(s){}return e=e.replace(/đ/g,"d"),e=e.replace(/[^a-z0-9\s-]/g," "),e=e.replace(/\s+/g,"-").replace(/-+/g,"-"),e=e.replace(/^-+/,"").replace(/-+$/,""),e}function it(t){var e=window.DAOP&&window.DAOP.basePath||"",s=[];try{Array.isArray(t&&t.cast_meta)&&t.cast_meta.length?s=t.cast_meta.slice(0,10).map(function(n){var i=n&&(n.name_vi||n.name)?String(n.name_vi||n.name):"",r=n&&(n.name_original||n.name)?String(n.name_original||n.name):i;return{display:i,slug:F(r)}}).filter(function(n){return n&&n.display}):Array.isArray(t&&t.cast)&&t.cast.length&&(s=t.cast.slice(0,10).map(function(n){var i=n!=null?String(n):"";return{display:i,slug:F(i)}}).filter(function(n){return n&&n.display}))}catch(n){s=[]}return s.length?s.map(function(n){var i=String(n.display||"").replace(/</g,"&lt;"),r=n.slug||"";return r?'<a href="'+e+"/dien-vien/"+r+'.html">'+i+"</a>":i}).join(", "):""}function j(t){var e=document.getElementById(t);if(e)try{e.scrollIntoView({behavior:"smooth",block:"start"})}catch(s){e.scrollIntoView()}}function lt(t,e,s){if(!t)return;var n=document.getElementById(e);if(!n)return;function i(a){var d=["2","3","4","6","8"];d.forEach(function(c){n.classList.remove("movies-grid--cols-"+c)}),a&&n.classList.add("movies-grid--cols-"+a),t.querySelectorAll("[data-cols]").forEach(function(c){var u=c.getAttribute("data-cols")===String(a);c.classList.toggle("md-col-btn--active",!!u)});try{localStorage.setItem(s,String(a))}catch(c){}}var r="4";try{var o=localStorage.getItem(s);o&&(r=o)}catch(a){}i(r),t.querySelectorAll("[data-cols]").forEach(function(a){a.addEventListener("click",function(){var d=a.getAttribute("data-cols")||"";i(d)})})}function N(){var t=window.DAOP&&window.DAOP.siteSettings||{},e=parseInt(t.rec_grid_columns_extra||t.category_grid_columns_extra||t.grid_columns_extra||"8",10);[6,8,10,12,14,16].indexOf(e)<0&&(e=8);var s=(t.rec_use_poster||t.category_use_poster||t.default_use_poster||"thumb")==="poster",n=parseInt(t.movie_detail_similar_limit||"16",10);(!isFinite(n)||n<4)&&(n=16),n>50&&(n=50);var i=window.innerWidth||document.documentElement.clientWidth,r=parseInt(t.rec_grid_cols_xs||t.category_grid_cols_xs||t.default_grid_cols_xs||"2",10),o=parseInt(t.rec_grid_cols_sm||t.category_grid_cols_sm||t.default_grid_cols_sm||"3",10),a=parseInt(t.rec_grid_cols_md||t.category_grid_cols_md||t.default_grid_cols_md||"4",10),d=parseInt(t.rec_grid_cols_lg||t.category_grid_cols_lg||t.default_grid_cols_lg||"6",10),c=i>=1024?d:i>=768?a:i>=480?o:r,u=[2,3,4,e];return u.indexOf(c)<0&&(c=4),{extra:e,usePoster:s,limit:n,gridCols:c}}function V(t,e,s,n){if(!t||!e)return;var i=window.DAOP&&window.DAOP.renderMovieCard;if(!i)return;var r=N(),o=r.gridCols||4,a=r.usePoster,d=r.extra;function c(){[2,3,4,6,8,10,12,14,16].forEach(function(g){e.classList.remove("movies-grid--cols-"+g)}),e.classList.add("movies-grid--cols-"+o),t.querySelectorAll(".grid-cols-btn").forEach(function(g){g.classList.toggle("active",parseInt(g.getAttribute("data-cols"),10)===o)});var p=t.querySelector(".grid-poster-select");p&&(p.value=a?"poster":"thumb")}function u(){for(var p=n&&n.list?n.list:[],g="",P=8,D=12,S=0;S<p.length;S++){g+=i(p[S],s,{usePoster:a});var y=S+1;(y===P||y>P&&(y-P)%D===0)&&(g+='<div class="ad-slot ad-slot--grid" data-ad-position="detail_mid"></div>')}e.innerHTML=g,window.DAOP&&typeof window.DAOP.renderAdsInDocument=="function"&&window.DAOP.renderAdsInDocument(e)}var m='<option value="6"'+(d===6?" selected":"")+'>6</option><option value="8"'+(d===8?" selected":"")+'>8</option><option value="10"'+(d===10?" selected":"")+'>10</option><option value="12"'+(d===12?" selected":"")+'>12</option><option value="14"'+(d===14?" selected":"")+'>14</option><option value="16"'+(d===16?" selected":"")+">16</option>",f="";f+='<span class="filter-label">C\u1ED9t:</span>',f+='<button type="button" class="grid-cols-btn'+(o===2?" active":"")+'" data-cols="2">2</button>',f+='<button type="button" class="grid-cols-btn'+(o===3?" active":"")+'" data-cols="3">3</button>',f+='<button type="button" class="grid-cols-btn'+(o===4?" active":"")+'" data-cols="4">4</button>',f+='<select class="grid-cols-select" id="md-rec-cols-extra" aria-label="C\u1ED9t th\xEAm">'+m+"</select>",f+='<button type="button" class="grid-cols-btn'+(d===o?" active":"")+'" data-cols="'+d+'" id="md-rec-cols-extra-btn">'+d+"</button>",f+='<label class="grid-poster-toggle"><span class="filter-label">\u1EA2nh:</span><select class="grid-poster-select" name="use_poster"><option value="thumb"'+(a?"":" selected")+'>Thumb</option><option value="poster"'+(a?" selected":"")+">Poster</option></select></label>",t.innerHTML=f,t.querySelectorAll(".grid-cols-btn").forEach(function(p){p.addEventListener("click",function(){o=parseInt(p.getAttribute("data-cols"),10),c()})});var h=t.querySelector("#md-rec-cols-extra"),b=t.querySelector("#md-rec-cols-extra-btn");h&&b&&h.addEventListener("change",function(){var p=d;d=parseInt(h.value,10),b.textContent=d,b.setAttribute("data-cols",d),o===p&&(o=d),c()});var A=t.querySelector(".grid-poster-select");A&&A.addEventListener("change",function(){a=this.value==="poster",u(),c()}),u(),c()}function W(t){var e=document.getElementById("btn-toggle-info"),s=document.getElementById("movie-info"),n=document.getElementById("btn-scroll-comments"),i=document.getElementById("btn-collapse-comments"),r=document.getElementById("btn-scroll-recommend"),o=document.getElementById("btn-share");e&&s&&e.addEventListener("click",function(){s.classList.toggle("md-info--open"),e.classList.toggle("md-action-btn--active"),e.classList.toggle("md-info-toggle--open");try{e.setAttribute("aria-expanded",s.classList.contains("md-info--open")?"true":"false")}catch(a){}}),n&&n.addEventListener("click",function(){var a=document.getElementById("movie-comments");if(a&&a.classList.contains("movie-comments--collapsed")){a.classList.remove("movie-comments--collapsed");var d=document.getElementById("comments-container");window.DAOP&&typeof window.DAOP._commentsStartLoad=="function"&&d&&window.DAOP._commentsStartLoad(d)}j("movie-comments")}),i&&i.addEventListener("click",function(){var a=document.getElementById("movie-comments");if(a){var d=a.classList.contains("movie-comments--collapsed");if(a.classList.toggle("movie-comments--collapsed"),d){var c=document.getElementById("comments-container");window.DAOP&&typeof window.DAOP._commentsStartLoad=="function"&&c&&window.DAOP._commentsStartLoad(c)}}}),r&&r.addEventListener("click",function(){j("movie-recommend")}),o&&o.addEventListener("click",function(){var a=window.location.href,d=t&&t.title?t.title:document.title;if(navigator.share){navigator.share({title:d,url:a}).catch(function(){});return}navigator.clipboard&&navigator.clipboard.writeText&&navigator.clipboard.writeText(a).then(function(){o.textContent="\u0110\xE3 copy link",setTimeout(function(){o.textContent="Chia s\u1EBB"},1500)}).catch(function(){})})}function $(){var t=nt();if(!t){document.getElementById("movie-detail")&&(document.getElementById("movie-detail").innerHTML="<p>Kh\xF4ng t\xECm th\u1EA5y phim.</p>");return}var e=window.DAOP&&typeof window.DAOP.getMovieBySlugAsync=="function"?window.DAOP.getMovieBySlugAsync:function(n){return Promise.resolve(window.DAOP&&window.DAOP.getMovieBySlug?window.DAOP.getMovieBySlug(n):null)},s=window.DAOP&&typeof window.DAOP.preloadIndexMeta=="function"?window.DAOP.preloadIndexMeta():Promise.resolve();Promise.all([e(t),s]).then(function(n){var i=n[0];if(!i){var r=window.DAOP&&window.DAOP.basePath||"",o='<div class="movie-not-found"><p><strong>Kh\xF4ng t\xECm th\u1EA5y phim</strong> v\u1EDBi \u0111\u01B0\u1EDDng d\u1EABn n\xE0y.</p><p>Phim c\xF3 th\u1EC3 ch\u01B0a c\xF3 trong d\u1EEF li\u1EC7u (do gi\u1EDBi h\u1EA1n build ho\u1EB7c ch\u01B0a c\u1EADp nh\u1EADt).</p><p><a href="'+r+'/tim-kiem.html">T\xECm ki\u1EBFm phim</a> \xB7 <a href="'+r+'/">Trang ch\u1EE7</a></p></div>';document.getElementById("movie-detail")&&(document.getElementById("movie-detail").innerHTML=o);return}document.title=(i.title||t)+" | "+(window.DAOP&&window.DAOP.siteName||"DAOP Phim");var a=document.querySelector('meta[name="description"]');a&&a.setAttribute("content",(i.description||i.title||"").slice(0,160)),window.DAOP.loadMovieDetail(i.id,function(d){if(!d){rt(i);return}at(d)})})}function rt(t){var e=window.DAOP&&window.DAOP.basePath||"",s=e+"/images/default_poster.png",n=e+"/images/default_thumb.png",i=window.DAOP&&window.DAOP.siteSettings?window.DAOP.siteSettings:null,r=i&&i.r2_img_domain?String(i.r2_img_domain):"";r=r.replace(/\/$/,"");var o=t&&t.id!=null?String(t.id):"",a=r&&o?r+"/posters/"+o+".webp":"",d=r&&o?r+"/thumbs/"+o+".webp":"",c=a||s,u=d||n,m=t.slug||"",f=e+"/xem-phim/"+encodeURIComponent(m)+".html",h=a||"",b=l(t.title||""),A=l(t.origin_name||""),p=l(t.year||""),g=p+(t.episode_current?" \u2022 "+l(t.episode_current)+" t\u1EADp":""),P='<div class="movie-detail-wrap"><div class="ad-slot" data-ad-position="detail_top"></div>  <div class="md-page">    <div class="md-hero">      <div class="md-hero-bg" id="md-hero-bg" style="background-image:url('+l(h||c)+')"></div>      <div class="md-hero-inner">        <div class="md-thumb"><img width="400" height="600" decoding="async" fetchpriority="high" src="'+l(u)+`" onerror="this.onerror=null;this.src='`+l(n)+`';" alt=""></div>        <div class="md-hero-meta">          <div class="md-title">`+b+"</div>"+(A?'        <div class="md-origin">'+A+"</div>":"")+(g.trim()?'        <div class="md-meta">'+l(g)+"</div>":"")+'          <div class="md-hero-cta">            <a class="md-watch" href="'+l(f)+'">'+v("play")+'<span class="md-watch-label">Xem ngay</span></a>            <div class="md-actions">              <button type="button" class="md-action-btn" id="btn-share">'+v("share")+'<span class="md-action-label">Chia s\u1EBB</span></button>            </div>          </div>        </div>      </div>    </div>    <div class="md-content">      <section class="md-section md-info-toggle-section">        <button type="button" class="md-action-btn md-info-toggle" id="btn-toggle-info" aria-controls="movie-info" aria-expanded="false">'+v("info")+'<span class="md-info-label">Th\xF4ng tin phim</span>'+v("chevDown")+'</button>      </section>      <section id="movie-info" class="md-info">        <div class="md-desc"></div>      </section>    </div>    <div class="ad-slot" data-ad-position="detail_bottom"></div>  </div></div>',D=document.getElementById("movie-detail");D&&(D.innerHTML=P),U(document.getElementById("md-hero-bg"),h||c,"",s),W(t),window.DAOP&&typeof window.DAOP.renderAdsInDocument=="function"&&window.DAOP.renderAdsInDocument(D||document)}function at(t){var e=window.DAOP&&window.DAOP.basePath||"",s=e+"/images/default_poster.png",n=e+"/images/default_thumb.png",i=window.DAOP&&window.DAOP.siteSettings?window.DAOP.siteSettings:null,r=i&&i.r2_img_domain?String(i.r2_img_domain):"";r=r.replace(/\/$/,"");var o=t&&t.id!=null?String(t.id):"",a=r&&o?r+"/posters/"+o+".webp":"",d=r&&o?r+"/thumbs/"+o+".webp":"",c=a||s,u=d||n,m=a||"",f=(t.title||"").replace(/</g,"&lt;"),h=(t.origin_name||"").replace(/</g,"&lt;"),b=R(t.genre||[],e,"/the-loai/"),A=R(t.country||[],e,"/quoc-gia/"),p=(t.description||t.content||"").replace(/</g,"&lt;").replace(/\n/g,"<br>"),g=it(t),P=(t.director||[]).join(", "),D=t&&t.showtimes!=null?String(t.showtimes).trim():"",S=D?'<p class="meta-line meta-line--showtimes">L\u1ECBch chi\u1EBFu: '+D.replace(/</g,"&lt;")+"</p>":"",y=e+"/xem-phim/"+encodeURIComponent(t.slug||"")+".html",Q="Xem ngay";try{var T=window.DAOP&&window.DAOP.userSync;if(T&&typeof T.getWatchHistory=="function"){var w=T.getWatchHistory().find(function(I){return I&&I.slug===t.slug});w&&w.episode&&(y=e+"/xem-phim/"+encodeURIComponent(t.slug||"")+".html?ep="+encodeURIComponent(String(w.episode)),w.server&&(y+="&sv="+encodeURIComponent(String(w.server))),w.linkType&&(y+="&lt="+encodeURIComponent(String(w.linkType))),w.groupIdx!=null&&w.groupIdx!==""&&(y+="&g="+encodeURIComponent(String(w.groupIdx))),Q="Ti\u1EBFp t\u1EE5c xem")}}catch(I){}var X=parseInt(t.year,10),x=isFinite(X)?String(X):String(t.year||"").trim(),ot=x?e+"/nam-phat-hanh/"+encodeURIComponent(x)+".html":"",Y=(b?'<div class="md-info-line"><span class="md-info-key">Th\u1EC3 lo\u1EA1i</span><span class="md-info-val">'+b+"</span></div>":"")+(A?'<div class="md-info-line"><span class="md-info-key">Qu\u1ED1c gia</span><span class="md-info-val">'+A+"</span></div>":"")+(P?'<div class="md-info-line"><span class="md-info-key">\u0110\u1EA1o di\u1EC5n</span><span class="md-info-val">'+l(P)+"</span></div>":"")+(g?'<div class="md-info-line"><span class="md-info-key">Di\u1EC5n vi\xEAn</span><span class="md-info-val" id="md-info-cast">'+g+"</span></div>":"")+(x?'<div class="md-info-line"><span class="md-info-key">N\u0103m</span><span class="md-info-val"><a href="'+l(ot)+'">'+l(x)+"</a></span></div>":"")+(t.quality?'<div class="md-info-line"><span class="md-info-key">Ch\u1EA5t l\u01B0\u1EE3ng</span><span class="md-info-val">'+l(t.quality)+"</span></div>":"")+(t.episode_current?'<div class="md-info-line"><span class="md-info-key">T\u1EADp</span><span class="md-info-val">'+l(t.episode_current)+"</span></div>":""),st='<div class="movie-detail-wrap"><div class="ad-slot" data-ad-position="detail_top"></div>  <div class="md-page">    <div class="md-hero">      <div class="md-hero-bg" id="md-hero-bg" style="background-image:url('+l(m||c)+')"></div>      <div class="md-hero-inner">        <div class="md-thumb"><img width="400" height="600" decoding="async" fetchpriority="high" src="'+l(u)+`" onerror="this.onerror=null;this.src='`+l(n)+`';" alt=""></div>        <div class="md-hero-meta">          <div class="md-title">`+f+"</div>"+(h?'        <div class="md-origin">'+h+"</div>":"")+'          <div class="md-meta">'+l((t.year||"")+(t.episode_current?" \u2022 "+t.episode_current+" t\u1EADp":"")+(t.quality?" \u2022 "+t.quality:""))+"</div>"+(S?"          "+S:"")+'          <div class="md-hero-cta">            <a class="md-watch" href="'+l(y)+'">'+v("play")+'<span class="md-watch-label">'+l(Q)+'</span></a>            <div class="md-actions">              <button type="button" class="md-action-btn movie-fav-btn" data-movie-slug="'+l(t.slug||"")+'" aria-label="Y\xEAu th\xEDch" aria-pressed="false">'+v("heart")+'<span class="md-action-label">Y\xEAu th\xEDch</span></button>              <button type="button" class="md-action-btn" id="btn-share">'+v("share")+'<span class="md-action-label">Chia s\u1EBB</span></button>              <button type="button" class="md-action-btn" id="btn-scroll-comments">'+v("chat")+'<span class="md-action-label">B\xECnh lu\u1EADn</span></button>              <button type="button" class="md-action-btn" id="btn-scroll-recommend">'+v("spark")+'<span class="md-action-label">\u0110\u1EC1 xu\u1EA5t</span></button>            </div>          </div>        </div>      </div>    </div>    <div class="md-content">      <div class="md-left">        <section class="md-section md-info-toggle-section">          <button type="button" class="md-action-btn md-info-toggle" id="btn-toggle-info" aria-controls="movie-info" aria-expanded="false">'+v("info")+'<span class="md-info-label">Th\xF4ng tin phim</span>'+v("chevDown")+'</button>        </section>        <section id="movie-info" class="md-info">          <div class="md-desc">'+p+"</div>"+(Y?'        <div class="md-info-grid">'+Y+"</div>":"")+'        </section>      </div>      <div class="md-right">        <section id="movie-comments" class="md-section movie-comments--collapsed">          <div class="md-section-head">            <h3 class="md-section-title" style="margin: 0;">'+v("chat")+'<span class="md-section-title-text">B\xECnh lu\u1EADn</span></h3>            <button type="button" id="btn-collapse-comments" class="md-comments-collapse" aria-label="Thu g\u1ECDn/M\u1EDF r\u1ED9ng b\xECnh lu\u1EADn">'+v("chevDown")+'</button>          </div>          <div id="comments-container" data-post-slug="'+l(t.slug||"")+'"></div>        </section>      </div>      <section id="movie-recommend" class="md-section md-recommend">       <div class="md-section-head">         <h3 class="md-section-title">'+v("spark")+'<span class="md-section-title-text">\u0110\u1EC1 xu\u1EA5t</span></h3>         <div class="grid-toolbar" id="md-rec-toolbar" aria-label="T\xF9y ch\u1ECDn hi\u1EC3n th\u1ECB"></div>       </div>       <div class="movies-grid" id="similar-grid"><p>\u0110ang t\u1EA3i...</p></div>     </section>   </div>   <div class="ad-slot" data-ad-position="detail_bottom"></div></div></div>',z=document.getElementById("movie-detail");z&&(z.innerHTML=st),U(document.getElementById("md-hero-bg"),m||c,"",s);var dt=N(),_=document.getElementById("similar-grid"),G=window.DAOP&&window.DAOP.basePath||"";_&&(_.className="movies-grid");var E={list:[]},K=document.getElementById("md-rec-toolbar");(function(){if(!_)return;_.innerHTML="<p>\u0110ang t\u1EA3i...</p>";var M=!1;function L(){M||(M=!0,Z().then(function(){return et(t,dt.limit)}).then(function(O){E.list=Array.isArray(O)?O:[],V(K,_,G,E)}).catch(function(){E.list=[],V(K,_,G,E)}))}try{"requestIdleCallback"in window&&window.requestIdleCallback(L,{timeout:1500})}catch(O){}try{if("IntersectionObserver"in window){var C=new IntersectionObserver(function(O){O.forEach(function(B){if(B&&B.isIntersecting){try{C.disconnect()}catch(k){}L()}})},{rootMargin:"400px"});C.observe(_);return}}catch(O){}setTimeout(L,800)})(),W(t);try{window.DAOP&&typeof window.DAOP.refreshQuickFavorites=="function"&&window.DAOP.refreshQuickFavorites()}catch(I){}(function(){var M=document.getElementById("btn-scroll-comments"),L=document.getElementById("btn-collapse-comments"),C=!1;function O(){C||(C=!0,tt().then(function(){try{window.DAOP&&typeof window.DAOP.mountComments=="function"&&window.DAOP.mountComments("#comments-container",{postSlug:t.slug||""})}catch(k){}}))}function B(k){k&&k.addEventListener("click",function(){O()},{once:!0})}B(M),B(L)})(),window.DAOP&&typeof window.DAOP.renderAdsInDocument=="function"&&window.DAOP.renderAdsInDocument(z||document)}function ut(t){document.querySelectorAll(".episode-btn").forEach(function(e){e.addEventListener("click",function(){var s=e.getAttribute("data-episode"),n=e.getAttribute("data-link");window.DAOP&&window.DAOP.openPlayer?window.DAOP.openPlayer({slug:t.slug,episode:s,link:n,movie:t}):n&&window.open(n,"_blank")})})}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",function(){q($)}):q($)})();
>>>>>>> 7a1a53319596697de21def577a0b6a2b1f6d732c
