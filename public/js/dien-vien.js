/**
 * Trang diễn viên: load shard theo ký tự đầu (actors-index.js hoặc actors-{a..z|other}.js), rồi hiển thị.
 */
(function () {
  var PAGE_SIZE_ACTORS = 24;
  var PAGE_SIZE_MOVIES = 24;

  function ensureSiteSettings(done) {
    try {
      window.DAOP = window.DAOP || {};
      if (window.DAOP.siteSettings) return done && done();
      if (typeof window.DAOP.loadConfig !== 'function') return done && done();
      window.DAOP.loadConfig('site-settings')
        .then(function (s) {
          if (s) {
            window.DAOP.siteSettings = window.DAOP.siteSettings || s;
            if (window.DAOP.applySiteSettings) {
              try { window.DAOP.applySiteSettings(s); } catch (e) {}
            }
          }
        })
        .catch(function () {})
        .finally(function () { if (done) done(); });
    } catch (e) {
      if (done) done();
    }
  }

  function getGridSettings() {
    var s = (window.DAOP && window.DAOP.siteSettings) || {};
    var extra = parseInt(s.actor_grid_columns_extra || s.category_grid_columns_extra || s.grid_columns_extra || '8', 10);
    if ([6, 8, 10, 12, 14, 16].indexOf(extra) < 0) extra = 8;
    var usePoster = (s.actor_use_poster || s.category_use_poster || s.default_use_poster || 'thumb') === 'poster';
    var w = window.innerWidth || document.documentElement.clientWidth;
    var xs = parseInt(s.actor_grid_cols_xs || s.category_grid_cols_xs || s.default_grid_cols_xs || '2', 10);
    var sm = parseInt(s.actor_grid_cols_sm || s.category_grid_cols_sm || s.default_grid_cols_sm || '3', 10);
    var md = parseInt(s.actor_grid_cols_md || s.category_grid_cols_md || s.default_grid_cols_md || '4', 10);
    var lg = parseInt(s.actor_grid_cols_lg || s.category_grid_cols_lg || s.default_grid_cols_lg || '6', 10);
    var cols = w >= 1024 ? lg : w >= 768 ? md : w >= 480 ? sm : xs;
    if ([2, 3, 4, 6, 8, 10, 12, 14, 16].indexOf(cols) < 0) cols = 4;
    return { extra: extra, cols: cols, usePoster: usePoster };
  }

  function getDetailGridSettings() {
    var s = (window.DAOP && window.DAOP.siteSettings) || {};
    var extra = parseInt(
      s.actor_detail_grid_columns_extra || s.actor_grid_columns_extra || s.category_grid_columns_extra || s.grid_columns_extra || '8',
      10
    );
    if ([6, 8, 10, 12, 14, 16].indexOf(extra) < 0) extra = 8;
    var usePoster = (
      s.actor_detail_use_poster || s.actor_use_poster || s.category_use_poster || s.default_use_poster || 'thumb'
    ) === 'poster';
    var w = window.innerWidth || document.documentElement.clientWidth;
    var xs = parseInt(s.actor_detail_grid_cols_xs || s.actor_grid_cols_xs || s.category_grid_cols_xs || s.default_grid_cols_xs || '2', 10);
    var sm = parseInt(s.actor_detail_grid_cols_sm || s.actor_grid_cols_sm || s.category_grid_cols_sm || s.default_grid_cols_sm || '3', 10);
    var md = parseInt(s.actor_detail_grid_cols_md || s.actor_grid_cols_md || s.category_grid_cols_md || s.default_grid_cols_md || '4', 10);
    var lg = parseInt(s.actor_detail_grid_cols_lg || s.actor_grid_cols_lg || s.category_grid_cols_lg || s.default_grid_cols_lg || '6', 10);
    var cols = w >= 1024 ? lg : w >= 768 ? md : w >= 480 ? sm : xs;
    if ([2, 3, 4, 6, 8, 10, 12, 14, 16].indexOf(cols) < 0) cols = 4;
    return { extra: extra, cols: cols, usePoster: usePoster };
  }

  function normalizeTmdbImg(url, usePoster) {
    if (!url) return '';
    var u = String(url);
    // Prefer smaller size for "thumb" mode to match movie card density.
    var size = usePoster ? 'w500' : 'w185';
    return u.replace(/\/t\/p\/w\d+\//, '/t/p/' + size + '/');
  }

  function buildGridToolbar(toolbarEl, state, onChange, opts) {
    if (!toolbarEl) return;
    opts = opts || {};
    var showPosterToggle = opts.showPosterToggle !== false;
    var extraOpts = '<option value="6"' + (state.extra === 6 ? ' selected' : '') + '>6</option>' +
      '<option value="8"' + (state.extra === 8 ? ' selected' : '') + '>8</option>' +
      '<option value="10"' + (state.extra === 10 ? ' selected' : '') + '>10</option>' +
      '<option value="12"' + (state.extra === 12 ? ' selected' : '') + '>12</option>' +
      '<option value="14"' + (state.extra === 14 ? ' selected' : '') + '>14</option>' +
      '<option value="16"' + (state.extra === 16 ? ' selected' : '') + '>16</option>';

    var html = '';
    html += '<span class="filter-label">Cột:</span>';
    html += '<button type="button" class="grid-cols-btn' + (2 === state.cols ? ' active' : '') + '" data-cols="2">2</button>';
    html += '<button type="button" class="grid-cols-btn' + (3 === state.cols ? ' active' : '') + '" data-cols="3">3</button>';
    html += '<button type="button" class="grid-cols-btn' + (4 === state.cols ? ' active' : '') + '" data-cols="4">4</button>';
    html += '<select class="grid-cols-select" id="actor-cols-extra" aria-label="Cột thêm">' + extraOpts + '</select>';
    html += '<button type="button" class="grid-cols-btn' + (state.extra === state.cols ? ' active' : '') + '" data-cols="' + state.extra + '" id="actor-cols-extra-btn">' + state.extra + '</button>';
    if (showPosterToggle) {
      html += '<label class="grid-poster-toggle"><span class="filter-label">Ảnh:</span><select class="grid-poster-select" name="use_poster"><option value="thumb"' + (!state.usePoster ? ' selected' : '') + '>Thumb</option><option value="poster"' + (state.usePoster ? ' selected' : '') + '>Poster</option></select></label>';
    }
    toolbarEl.innerHTML = html;

    toolbarEl.querySelectorAll('.grid-cols-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.cols = parseInt(btn.getAttribute('data-cols'), 10) || state.cols;
        if (typeof onChange === 'function') onChange();
        toolbarEl.querySelectorAll('.grid-cols-btn').forEach(function (b) {
          b.classList.toggle('active', parseInt(b.getAttribute('data-cols'), 10) === state.cols);
        });
      });
    });

    var exSel = toolbarEl.querySelector('#actor-cols-extra');
    var exBtn = toolbarEl.querySelector('#actor-cols-extra-btn');
    if (exSel && exBtn) {
      exSel.addEventListener('change', function () {
        var oldExtra = state.extra;
        state.extra = parseInt(exSel.value, 10) || state.extra;
        exBtn.textContent = state.extra;
        exBtn.setAttribute('data-cols', state.extra);
        if (state.cols === oldExtra) state.cols = state.extra;
        if (typeof onChange === 'function') onChange();
        toolbarEl.querySelectorAll('.grid-cols-btn').forEach(function (b) {
          b.classList.toggle('active', parseInt(b.getAttribute('data-cols'), 10) === state.cols);
        });
      });
    }

    if (showPosterToggle) {
      var posterSel = toolbarEl.querySelector('.grid-poster-select');
      if (posterSel) {
        posterSel.addEventListener('change', function () {
          state.usePoster = this.value === 'poster';
          if (typeof onChange === 'function') onChange();
        });
      }
    }
  }

  function applyMoviesGridClass(gridEl, cols) {
    if (!gridEl) return;
    [2, 3, 4, 6, 8, 10, 12, 14, 16].forEach(function (n) { gridEl.classList.remove('movies-grid--cols-' + n); });
    gridEl.classList.add('movies-grid--cols-' + (cols || 4));
  }

  function getSlug() {
    var path = window.location.pathname;
    var m = path.match(/\/dien-vien\/([^/]+)(\.html)?$/);
    if (!m) m = path.match(/.+\/dien-vien\/([^/]+)(\.html)?$/);
    var slug = m ? decodeURIComponent(m[1]) : null;
    if (slug) slug = String(slug).replace(/\.html$/i, '');
    if (slug === 'index' || !slug) return null;
    return slug;
  }

  function esc(s) {
    return (s == null) ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getQuery() {
    try {
      var p = new URLSearchParams(window.location.search || '');
      return {
        q: (p.get('q') || '').trim(),
        page: Math.max(1, parseInt(p.get('page') || '1', 10) || 1),
      };
    } catch (e) {
      return { q: '', page: 1 };
    }
  }

  function setQuery(next) {
    try {
      var p = new URLSearchParams(window.location.search || '');
      if (next.q != null) {
        var q = String(next.q || '').trim();
        if (q) p.set('q', q);
        else p.delete('q');
      }
      if (next.page != null) {
        var pg = Math.max(1, parseInt(String(next.page), 10) || 1);
        if (pg > 1) p.set('page', String(pg));
        else p.delete('page');
      }
      var base = window.location.pathname + (p.toString() ? ('?' + p.toString()) : '');
      window.history.replaceState({}, '', base);
    } catch (e) {}
  }

  function paginate(arr, page, pageSize) {
    var total = arr.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    var p = Math.min(Math.max(1, page), totalPages);
    var start = (p - 1) * pageSize;
    var end = Math.min(start + pageSize, total);
    return { page: p, total: total, totalPages: totalPages, slice: arr.slice(start, end) };
  }

  function renderPagination(container, page, totalPages, onGo) {
    if (!container) return;
    if (totalPages <= 1) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }
    container.style.display = '';

    var html = '';
    function a(label, targetPage, cls) {
      var c = cls ? (' ' + cls) : '';
      return '<a href="#" data-page="' + targetPage + '" class="pagination-nav' + c + '">' + label + '</a>';
    }
    html += a('«', 1);
    html += a('‹', Math.max(1, page - 1));

    var start = Math.max(1, page - 2);
    var end = Math.min(totalPages, page + 2);
    if (start > 1) html += '<span>…</span>';
    for (var i = start; i <= end; i++) {
      if (i === page) html += '<span class="current">' + i + '</span>';
      else html += '<a href="#" data-page="' + i + '">' + i + '</a>';
    }
    if (end < totalPages) html += '<span>…</span>';

    html += a('›', Math.min(totalPages, page + 1));
    html += a('»', totalPages);

    html +=
      '<span class="pagination-jump">' +
      '<span>Trang</span>' +
      '<input type="number" min="1" max="' + totalPages + '" value="' + page + '" aria-label="Nhảy trang">' +
      '<button type="button">Đi</button>' +
      '</span>';

    container.innerHTML = html;

    container.querySelectorAll('a[data-page]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        var p = parseInt(el.getAttribute('data-page') || '1', 10) || 1;
        onGo(p);
      });
    });
    var jumpInput = container.querySelector('.pagination-jump input');
    var jumpBtn = container.querySelector('.pagination-jump button');
    if (jumpBtn && jumpInput) {
      jumpBtn.addEventListener('click', function () {
        var v = parseInt(jumpInput.value || '1', 10) || 1;
        onGo(v);
      });
      jumpInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var v2 = parseInt(jumpInput.value || '1', 10) || 1;
          onGo(v2);
        }
      });
    }
  }

  function getShardUrl(slug) {
    var base = (window.DAOP && window.DAOP.basePath) || '';
    if (!slug) return base + '/data/actors-index.js';
    var c = (slug[0] || '').toLowerCase();
    var key = (c >= 'a' && c <= 'z') ? c : 'other';
    return base + '/data/actors-' + key + '.js';
  }

  function init(retryCount) {
    retryCount = retryCount || 0;
    var slug = getSlug();
    var names = {};
    var map = {};
    var meta = {};
    if (!slug) {
      var idx = window.actorsIndex;
      if (idx && idx.names) names = idx.names;
      if (idx && idx.meta) meta = idx.meta;
    } else {
      var data = window.actorsData;
      if (data) {
        names = data.names || {};
        map = data.map || {};
        meta = data.meta || {};
      }
    }
    if (!slug) {
      var q0 = getQuery();
      var actorSlugs = Object.keys(names || {});
      actorSlugs.sort(function (a, b) { return String(names[a] || a).localeCompare(String(names[b] || b)); });

      var q = (q0.q || '').toLowerCase();
      if (q) {
        actorSlugs = actorSlugs.filter(function (s) {
          var n = String(names[s] || s).toLowerCase();
          return n.indexOf(q) >= 0 || String(s).toLowerCase().indexOf(q) >= 0;
        });
      }

      var paged = paginate(actorSlugs, q0.page, PAGE_SIZE_ACTORS);
      setQuery({ page: paged.page });

      document.title = 'Diễn viên | ' + (window.DAOP && window.DAOP.siteName ? window.DAOP.siteName : 'DAOP Phim');
      var titleEl = document.getElementById('actor-name');
      if (titleEl) titleEl.textContent = 'Diễn viên';
      var grid = document.getElementById('movies-grid');

      var toolbar0 = document.getElementById('actor-grid-toolbar');
      var state0 = getGridSettings();
      state0.cols = [2, 3, 4, state0.extra].indexOf(state0.cols) >= 0 ? state0.cols : 4;

      function renderActors() {
        if (!grid) return;
        grid.className = 'movies-grid';
        applyMoviesGridClass(grid, state0.cols);
        if (!actorSlugs.length) {
          grid.innerHTML = '<p>Chưa có dữ liệu diễn viên.</p>';
          return;
        }
        grid.innerHTML = paged.slice.map(function (s) {
          var n2 = names[s] || s;
          var cnt = (map && map[s] && map[s].length) ? map[s].length : null;
          var m2 = meta && meta[s] ? meta[s] : null;
          var img = m2 && m2.profile ? normalizeTmdbImg(m2.profile, state0.usePoster) : '';
          var baseUrl0 = (window.DAOP && window.DAOP.basePath) || '';
          var defaultImg0 = baseUrl0 + '/images/default_thumb.png';
          if (!defaultImg0) defaultImg0 = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="96" height="64"%3E%3Crect fill="%2321262d" width="96" height="64"/%3E%3C/svg%3E';
          var title = esc(n2);
          var href = encodeURIComponent(s) + '.html';
          return (
            '<div class="movie-card movie-card--vertical">' +
            '<a href="' + href + '">' +
            '<div class="thumb-wrap">' +
            (img
              ? '<img loading="lazy" decoding="async" src="' + esc(img) + '" onerror="this.onerror=null;this.src=\'' + String(defaultImg0).replace(/'/g, '%27') + '\';" alt="' + title + '">'
              : '<img loading="lazy" decoding="async" src="' + esc(defaultImg0) + '" alt="' + title + '">') +
            '</div>' +
            '<div class="movie-info">' +
            '<h3 class="title">' + title + '</h3>' +
            '<p class="meta">' + (cnt != null ? (cnt + ' phim') : '') + '</p>' +
            '</div></a></div>'
          );
        }).join('');
      }

      renderActors();
      buildGridToolbar(toolbar0, state0, function () {
        renderActors();
      }, { showPosterToggle: false });

      var profileWrap0 = document.getElementById('actor-profile');
      if (profileWrap0) {
        profileWrap0.style.display = 'none';
        profileWrap0.innerHTML = '';
      }

      var search = document.getElementById('actor-search');
      if (search) {
        search.value = q0.q || '';
        search.placeholder = 'Tìm diễn viên';
        search.oninput = function () {
          setQuery({ q: search.value, page: 1 });
          init(0);
        };
      }
      var pagTop = document.getElementById('actor-pagination');
      var pagBot = document.getElementById('actor-pagination-bottom');
      renderPagination(pagTop, paged.page, paged.totalPages, function (p) {
        setQuery({ page: p });
        init(0);
        try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
      });
      renderPagination(pagBot, paged.page, paged.totalPages, function (p) {
        setQuery({ page: p });
        init(0);
        try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
      });

      return;
    }
    var ids = (map[slug] || []).map(function (x) { return String(x); });
    var list = (data && data.movies && data.movies[slug]) ? data.movies[slug] : [];
    if (list.length === 0 && ids.length > 0) {
      if (window.DAOP && typeof window.DAOP.getMovieLightByIdAsync === 'function') {
        var cache = window.DAOP._actorMovieLightCache || (window.DAOP._actorMovieLightCache = {});
        Promise.all(ids.slice(0, PAGE_SIZE_MOVIES * 20).map(function (id) {
          if (cache[id]) return Promise.resolve(cache[id]);
          return window.DAOP.getMovieLightByIdAsync(id).then(function (m) {
            if (m) cache[id] = m;
            return m;
          });
        }))
          .then(function (arr) {
            var resolved = (arr || []).filter(Boolean);
            renderActorMovies(slug, names, meta, ids, resolved);
          })
          .catch(function () {
            renderActorMovies(slug, names, meta, ids, []);
          });
        return;
      }
    }
    renderActorMovies(slug, names, meta, ids, list);
  }

  function renderActorMovies(slug, names, meta, ids, list) {
    var name = names[slug] || slug;
    document.title = name + ' | Diễn viên | ' + (window.DAOP && window.DAOP.siteName ? window.DAOP.siteName : 'DAOP Phim');
    var titleEl = document.getElementById('actor-name');
    if (titleEl) titleEl.textContent = name;

    var profileWrap = document.getElementById('actor-profile');
    if (profileWrap) {
      var m2 = meta && meta[slug] ? meta[slug] : null;
      var img = m2 && m2.profile ? String(m2.profile) : '';
      var url = m2 && m2.tmdb_url ? String(m2.tmdb_url) : '';
      var baseUrlP = (window.DAOP && window.DAOP.basePath) || '';
      var defaultImgP = baseUrlP + '/images/default_thumb.png';
      if (!defaultImgP) defaultImgP = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="96" height="64"%3E%3Crect fill="%2321262d" width="96" height="64"/%3E%3C/svg%3E';
      profileWrap.innerHTML =
        '<div class="actor-profile-img">' +
        (img
          ? '<img loading="lazy" decoding="async" src="' + esc(img) + '" onerror="this.onerror=null;this.src=\'' + String(defaultImgP).replace(/'/g, '%27') + '\';" alt="' + esc(name) + '">' 
          : '<img loading="lazy" decoding="async" src="' + esc(defaultImgP) + '" alt="' + esc(name) + '">') +
        '</div>' +
        '<div class="actor-profile-main">' +
        '<div class="actor-profile-name">' + esc(name) + '</div>' +
        (url ? '<div class="actor-profile-actions"><a class="actor-tmdb-btn" href="' + esc(url) + '" target="_blank" rel="noopener">Xem chi tiết trên TMDB</a></div>' : '') +
        '</div>';
      profileWrap.style.display = '';
    }
    var grid = document.getElementById('movies-grid');
    var toolbar1 = document.getElementById('actor-grid-toolbar');
    var state1 = getDetailGridSettings();
    state1.cols = [2, 3, 4, state1.extra].indexOf(state1.cols) >= 0 ? state1.cols : 4;

    var q0 = getQuery();
    var q = (q0.q || '').toLowerCase();
    var filtered = list || [];
    if (q) {
      filtered = filtered.filter(function (m) {
        var t = String((m && m.title) || '').toLowerCase();
        var o = String((m && m.origin_name) || '').toLowerCase();
        var s = String((m && m.slug) || '').toLowerCase();
        return t.indexOf(q) >= 0 || o.indexOf(q) >= 0 || s.indexOf(q) >= 0;
      });
    }
    var paged = paginate(filtered, q0.page, PAGE_SIZE_MOVIES);
    setQuery({ page: paged.page });

    function renderMovies() {
      if (!grid) return;
      grid.className = 'movies-grid';
      applyMoviesGridClass(grid, state1.cols);
      var baseUrl = (window.DAOP && window.DAOP.basePath) || '';
      var render = (window.DAOP && window.DAOP.renderMovieCard);
      grid.innerHTML = paged.slice.length
        ? paged.slice.map(function (m) {
            return render ? render(m, baseUrl, { usePoster: state1.usePoster }) : '';
          }).join('')
        : '<p>Chưa có phim nào.</p>';
    }

    renderMovies();
    buildGridToolbar(toolbar1, state1, function () {
      renderMovies();
    });

    var search = document.getElementById('actor-search');
    if (search) {
      search.value = q0.q || '';
      search.placeholder = 'Tìm phim';
      search.oninput = function () {
        setQuery({ q: search.value, page: 1 });
        init(0);
      };
    }
    var pagTop = document.getElementById('actor-pagination');
    var pagBot = document.getElementById('actor-pagination-bottom');
    renderPagination(pagTop, paged.page, paged.totalPages, function (p) {
      setQuery({ page: p });
      init(0);
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
    });
    renderPagination(pagBot, paged.page, paged.totalPages, function (p) {
      setQuery({ page: p });
      init(0);
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
    });

  }

  function run() {
    ensureSiteSettings(function () {
      var slug = getSlug();
      var base = (window.DAOP && window.DAOP.basePath) || '';
      var url = getShardUrl(slug);
      var script = document.createElement('script');
      script.src = url;
      script.onload = init;
      script.onerror = function () {
        var fallback = base + '/data/actors.js';
        if (fallback === url) {
          var grid = document.getElementById('movies-grid');
          if (grid) grid.innerHTML = '<p>Không tải được dữ liệu diễn viên.</p>';
          return;
        }
        var s2 = document.createElement('script');
        s2.src = fallback;
        s2.onload = function () {
          if (!slug && window.actorsData && window.actorsData.names) {
            window.actorsIndex = { names: window.actorsData.names };
          }
          init();
        };
        s2.onerror = function () {
          var grid = document.getElementById('movies-grid');
          if (grid) grid.innerHTML = '<p>Không tải được dữ liệu diễn viên.</p>';
        };
        document.head.appendChild(s2);
      };
      document.head.appendChild(script);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
