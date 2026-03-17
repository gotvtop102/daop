/**
 * Trang chi tiết phim: load batch, render poster, meta, episodes, similar, Twikoo
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
    var ids = Array.from(idSet).slice(0, Math.max(limit * 4, limit));

    function getLightById(id) {
      if (window.DAOP && typeof window.DAOP.getMovieLightByIdAsync === 'function') {
        return window.DAOP.getMovieLightByIdAsync(id);
      }
      return Promise.resolve(null);
    }

    return Promise.all(ids.map(function (id) { return getLightById(id); }))
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
      btnComments.addEventListener('click', function () { scrollToId('movie-comments'); });
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

  function init() {
    var slug = getSlug();
    if (!slug) {
      document.getElementById('movie-detail') && (document.getElementById('movie-detail').innerHTML = '<p>Không tìm thấy phim.</p>');
      return;
    }
    var getLight = (window.DAOP && typeof window.DAOP.getMovieBySlugAsync === 'function')
      ? window.DAOP.getMovieBySlugAsync
      : function (s) { return Promise.resolve(window.DAOP && window.DAOP.getMovieBySlug ? window.DAOP.getMovieBySlug(s) : null); };
    getLight(slug).then(function (light) {
      if (!light) {
        var base = (window.DAOP && window.DAOP.basePath) || '';
        var msg = '<div class="movie-not-found"><p><strong>Không tìm thấy phim</strong> với đường dẫn này.</p>' +
          '<p>Phim có thể chưa có trong dữ liệu (do giới hạn build hoặc chưa cập nhật).</p>' +
          '<p><a href="' + base + '/tim-kiem.html">Tìm kiếm phim</a> · <a href="' + base + '/">Trang chủ</a></p></div>';
        document.getElementById('movie-detail') && (document.getElementById('movie-detail').innerHTML = msg);
        return;
      }
      document.title = (light.title || slug) + ' | ' + (window.DAOP?.siteName || 'DAOP Phim');
      var metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute('content', (light.description || light.title || '').slice(0, 160));

      window.DAOP.loadMovieDetail(light.id, function (movie) {
        if (!movie) {
          renderFromLight(light);
          return;
        }
        renderFull(movie);
      });
    });
  }

  function renderFromLight(light) {
    var norm = (window.DAOP && typeof window.DAOP.normalizeImgUrl === 'function')
      ? window.DAOP.normalizeImgUrl
      : function (x) { return x; };
    var normOphim = (window.DAOP && typeof window.DAOP.normalizeImgUrlOphim === 'function')
      ? window.DAOP.normalizeImgUrlOphim
      : function (x) { return x; };
    var derivedPoster = (!light.poster && light.thumb && window.DAOP && typeof window.DAOP.derivePosterFromThumb === 'function')
      ? window.DAOP.derivePosterFromThumb(light.thumb)
      : '';
    var base = (window.DAOP && window.DAOP.basePath) || '';
    var defaultPoster = base + '/images/default_poster.png';
    var posterRaw = (light.poster || derivedPoster || '');
    var posterUrl = norm(posterRaw).replace(/^\/\//, 'https://') || defaultPoster;
    var posterOphimUrl = normOphim(posterRaw).replace(/^\/\//, 'https://') || '';
    var slug = light.slug || '';
    var watchHref = base + '/xem-phim/' + encodeURIComponent(slug) + '.html';
    var posterBgRaw = (light.poster || derivedPoster || light.thumb || '');
    var posterBg = norm(posterBgRaw).replace(/^\/\//, 'https://') || '';
    var posterBgOphim = normOphim(posterBgRaw).replace(/^\/\//, 'https://') || '';
    var thumbRaw = (light.thumb || light.poster || derivedPoster || '');
    var thumbMain = norm(thumbRaw).replace(/^\/\//, 'https://') || '';
    var thumbOphim = normOphim(thumbRaw).replace(/^\/\//, 'https://') || '';
    var title = esc(light.title || '');
    var origin = esc(light.origin_name || '');
    var year = esc(light.year || '');
    var metaLine = year + (light.episode_current ? ' • ' + esc(light.episode_current) + ' tập' : '');
    var html = '' +
      '<div class="movie-detail-wrap">' +
      '<div class="ad-slot" data-ad-position="detail_top"></div>' +
      '  <div class="md-page">' +
      '    <div class="md-hero">' +
      '      <div class="md-hero-bg" id="md-hero-bg" style="background-image:url(' + esc(posterBg || posterUrl) + ')"></div>' +
      '      <div class="md-hero-inner">' +
      '        <div class="md-thumb"><img decoding="async" fetchpriority="high" src="' + esc(thumbMain || posterUrl) + '"' + imgOnErrorAttr(thumbOphim || posterOphimUrl, posterUrl, defaultPoster) + ' alt=""></div>' +
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
      '</div>' +
      '</div>';
    var el = document.getElementById('movie-detail');
    if (el) el.innerHTML = html;
    setBgWithFallback(document.getElementById('md-hero-bg'), posterBg || posterUrl, posterBgOphim || posterOphimUrl, defaultPoster);
    setupActions(light);

    if (window.DAOP && typeof window.DAOP.renderAdsInDocument === 'function') {
      window.DAOP.renderAdsInDocument(el || document);
    }
  }

  function renderFull(movie) {
    var norm = (window.DAOP && typeof window.DAOP.normalizeImgUrl === 'function')
      ? window.DAOP.normalizeImgUrl
      : function (x) { return x; };
    var normOphim = (window.DAOP && typeof window.DAOP.normalizeImgUrlOphim === 'function')
      ? window.DAOP.normalizeImgUrlOphim
      : function (x) { return x; };
    var derivedPoster = (!movie.poster && movie.thumb && window.DAOP && typeof window.DAOP.derivePosterFromThumb === 'function')
      ? window.DAOP.derivePosterFromThumb(movie.thumb)
      : '';
    var base = (window.DAOP && window.DAOP.basePath) || '';
    var defaultPoster = base + '/images/default_poster.png';
    var posterRaw = (movie.poster || derivedPoster || '');
    var poster = norm(posterRaw).replace(/^\/\//, 'https://') || defaultPoster;
    var posterOphim = normOphim(posterRaw).replace(/^\/\//, 'https://') || '';
    var posterBgRaw = (movie.poster || derivedPoster || movie.thumb || '');
    var posterBg = norm(posterBgRaw).replace(/^\/\//, 'https://') || '';
    var posterBgOphim = normOphim(posterBgRaw).replace(/^\/\//, 'https://') || '';
    var thumbRaw = (movie.thumb || movie.poster || derivedPoster || '');
    var thumbMain = norm(thumbRaw).replace(/^\/\//, 'https://') || '';
    var thumbOphim = normOphim(thumbRaw).replace(/^\/\//, 'https://') || '';
    var title = (movie.title || '').replace(/</g, '&lt;');
    var origin = (movie.origin_name || '').replace(/</g, '&lt;');
    var genreStr = (movie.genre || []).map(function (g) { return g.name; }).join(', ');
    var countryStr = (movie.country || []).map(function (c) { return c.name; }).join(', ');
    var desc = (movie.description || movie.content || '').replace(/</g, '&lt;').replace(/\n/g, '<br>');
    var actorNames = (movie.cast || []).slice(0, 10);
    var namesMap = (window.actorsData && window.actorsData.names) || (window.actorsIndex && window.actorsIndex.names) || {};
    var castStr = actorNames.map(function (name) {
      var slug = null;
      for (var s in namesMap) if (namesMap[s] === name) { slug = s; break; }
      var safe = (name || '').replace(/</g, '&lt;');
      var base0 = (window.DAOP && window.DAOP.basePath) || '';
      return slug ? '<a href="' + base0 + '/dien-vien/' + slug + '.html">' + safe + '</a>' : safe;
    }).join(', ');
    var directorStr = (movie.director || []).join(', ');
    var showtimes = movie.status === 'theater' && movie.showtimes ? '<p class="meta-line">Lịch chiếu: ' + (movie.showtimes || '').replace(/</g, '&lt;') + '</p>' : '';

    var watchHref = base + '/xem-phim/' + encodeURIComponent(movie.slug || '') + '.html';
    var watchLabel = 'Xem ngay';
    try {
      var us0 = window.DAOP && window.DAOP.userSync;
      if (us0 && typeof us0.getWatchHistory === 'function') {
        var hist0 = us0.getWatchHistory().find(function (x) { return x && x.slug === movie.slug; });
        if (hist0 && hist0.episode) {
          watchHref = base + '/xem-phim/' + encodeURIComponent(movie.slug || '') + '.html?ep=' + encodeURIComponent(String(hist0.episode));
          watchLabel = 'Tiếp tục xem';
        }
      }
    } catch (e) {}

    var infoHtml = '' +
      (genreStr ? '<div class="md-info-line"><span class="md-info-key">Thể loại</span><span class="md-info-val">' + esc(genreStr) + '</span></div>' : '') +
      (countryStr ? '<div class="md-info-line"><span class="md-info-key">Quốc gia</span><span class="md-info-val">' + esc(countryStr) + '</span></div>' : '') +
      (directorStr ? '<div class="md-info-line"><span class="md-info-key">Đạo diễn</span><span class="md-info-val">' + esc(directorStr) + '</span></div>' : '') +
      (castStr ? '<div class="md-info-line"><span class="md-info-key">Diễn viên</span><span class="md-info-val">' + castStr + '</span></div>' : '') +
      (movie.year ? '<div class="md-info-line"><span class="md-info-key">Năm</span><span class="md-info-val">' + esc(movie.year) + '</span></div>' : '') +
      (movie.quality ? '<div class="md-info-line"><span class="md-info-key">Chất lượng</span><span class="md-info-val">' + esc(movie.quality) + '</span></div>' : '') +
      (movie.episode_current ? '<div class="md-info-line"><span class="md-info-key">Tập</span><span class="md-info-val">' + esc(movie.episode_current) + '</span></div>' : '') +
      (showtimes ? '<div class="md-info-line"><span class="md-info-key">Lịch chiếu</span><span class="md-info-val">' + esc(movie.showtimes || '') + '</span></div>' : '');

    var html = '' +
      '<div class="movie-detail-wrap">' +
      '<div class="ad-slot" data-ad-position="detail_top"></div>' +
      '  <div class="md-page">' +
      '    <div class="md-hero">' +
      '      <div class="md-hero-bg" id="md-hero-bg" style="background-image:url(' + esc(posterBg || poster) + ')"></div>' +
      '      <div class="md-hero-inner">' +
      '        <div class="md-thumb"><img decoding="async" fetchpriority="high" src="' + esc(thumbMain || poster) + '"' + imgOnErrorAttr(thumbOphim || posterOphim, poster, defaultPoster) + ' alt=""></div>' +
      '        <div class="md-hero-meta">' +
      '          <div class="md-title">' + title + '</div>' +
      (origin ? '        <div class="md-origin">' + origin + '</div>' : '') +
      '          <div class="md-meta">' + esc((movie.year || '') + (movie.episode_current ? ' • ' + movie.episode_current + ' tập' : '') + (movie.quality ? ' • ' + movie.quality : '')) + '</div>' +
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
      '        <section id="movie-comments" class="md-section">' +
      '          <h3 class="md-section-title">' + iconSvg('chat') + '<span class="md-section-title-text">Bình luận</span></h3>' +
      '          <div id="twikoo-comments"></div>' +
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
      '</div>' +
      '</div>';
    var el = document.getElementById('movie-detail');
    if (el) el.innerHTML = html;

    setBgWithFallback(document.getElementById('md-hero-bg'), posterBg || poster, posterBgOphim || posterOphim, defaultPoster);

    var cfg = getDetailRecSettings();
    var grid = document.getElementById('similar-grid');
    var baseUrl = (window.DAOP && window.DAOP.basePath) || '';
    if (grid) grid.className = 'movies-grid';

    var listRef = { list: [] };
    var toolbarEl = document.getElementById('md-rec-toolbar');
    getSimilar(movie, cfg.limit).then(function (list) {
      listRef.list = Array.isArray(list) ? list : [];
      setupRecommendToolbar(toolbarEl, grid, baseUrl, listRef);
    }).catch(function () {
      listRef.list = [];
      setupRecommendToolbar(toolbarEl, grid, baseUrl, listRef);
    });

    setupActions(movie);
    try {
      if (window.DAOP && typeof window.DAOP.refreshQuickFavorites === 'function') window.DAOP.refreshQuickFavorites();
    } catch (e2) {}

    if (window.twikoo) {
      twikoo.init({
        envId: window.DAOP?.twikooEnvId || '',
        el: '#twikoo-comments',
        path: window.location.pathname,
      });
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
