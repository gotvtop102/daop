(function () {
  function applyDefaultHeaderVisibility() {
    try {
      var s = (window.DAOP && window.DAOP.siteSettings) || {};
      var hide = String(s.watch_hide_header_default || '').toLowerCase() === 'true';
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

  function ensurePlayerSettings(done) {
    try {
      window.DAOP = window.DAOP || {};
      if (window.DAOP.playerSettings) return done && done();
      if (typeof window.DAOP.loadConfig !== 'function') return done && done();
      window.DAOP.loadConfig('player-settings')
        .then(function (s) {
          if (s) window.DAOP.playerSettings = window.DAOP.playerSettings || s;
        })
        .catch(function () {})
        .finally(function () { if (done) done(); });
    } catch (e) {
      if (done) done();
    }
  }

  function iconSvg(name) {
    if (name === 'heart') {
      return '<svg class="md-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 21s-7-4.6-10-9c-2-3.3 0.2-8 5-8 2 0 3.4 1 5 3 1.6-2 3-3 5-3 4.8 0 7 4.7 5 8-3 4.4-10 9-10 9z"/></svg>';
    }
    if (name === 'share') {
      return '<svg class="md-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M18 16.1c-.8 0-1.5.3-2 .8L8.9 12.7c.1-.2.1-.5.1-.7s0-.5-.1-.7l7-4.1c.5.5 1.2.8 2 .8 1.7 0 3-1.3 3-3S19.7 2 18 2s-3 1.3-3 3c0 .2 0 .5.1.7l-7 4.1C7.6 10.3 6.9 10 6 10c-1.7 0-3 1.3-3 3s1.3 3 3 3c.9 0 1.6-.3 2.1-.8l7.1 4.2c-.1.2-.1.4-.1.6 0 1.7 1.3 3 3 3s3-1.3 3-3-1.3-3-3-3z"/></svg>';
    }
    if (name === 'chat') {
      return '<svg class="md-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 4h16v12H7l-3 3V4zm3 5h10v2H7V9zm0-3h10v2H7V6zm0 6h7v2H7v-2z"/></svg>';
    }
    if (name === 'spark') {
      return '<svg class="md-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2l1.2 4.3L17.5 8l-4.3 1.2L12 13.5l-1.2-4.3L6.5 8l4.3-1.7L12 2zm7 9l.8 2.8L22 15l-2.2.7L19 18l-.8-2.3L16 15l2.2-.7L19 11zM4.5 13l.7 2.5L7.5 16l-2.3.7L4.5 19l-.7-2.3L1.5 16l2.3-.5L4.5 13z"/></svg>';
    }
    if (name === 'pin') {
      return '<svg class="md-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M14 3l7 7-2 2-2-2-3 3v7l-2-2-2 2v-7l-3-3-2 2-2-2 7-7h4z"/></svg>';
    }
    if (name === 'unpin') {
      return '<svg class="md-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M3 4.3L4.3 3 21 19.7 19.7 21l-4.9-4.9-.8.8-2-2-2 2v-4.2l-2.8-2.8-2 2-2-2 6.6-6.6-.8-.8L6 6.7 3 4.3z"/></svg>';
    }
    if (name === 'close') {
      return '<svg class="md-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3 1.4 1.4z"/></svg>';
    }
    if (name === 'chevDown') {
      return '<svg class="md-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>';
    }
    return '';
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
        var clean = '/xem-phim/' + slug + '.html';
        if (window.history && window.history.replaceState) window.history.replaceState(null, '', clean);
        return slug;
      }
    }
    var path = window.location.pathname;
    var m = path.match(/\/xem-phim\/([^/]+)(\.html)?$/);
    if (!m) return null;
    var raw = decodeURIComponent(m[1]);
    return raw.replace(/\.html$/i, '') || null;
  }

  function esc(s) {
    if (s == null || s === '') return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getWatchRecSettings() {
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

    var cfg = getWatchRecSettings();
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
          html += '<div class="ad-slot ad-slot--grid" data-ad-position="watch_mid"></div>';
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
    html += '<select class="grid-cols-select" id="watch-rec-cols-extra" aria-label="Cột thêm">' + extraOpts + '</select>';
    html += '<button type="button" class="grid-cols-btn' + (gridColumnsExtra === gridCols ? ' active' : '') + '" data-cols="' + gridColumnsExtra + '" id="watch-rec-cols-extra-btn">' + gridColumnsExtra + '</button>';
    html += '<label class="grid-poster-toggle"><span class="filter-label">Ảnh:</span><select class="grid-poster-select" name="use_poster"><option value="thumb"' + (!usePoster ? ' selected' : '') + '>Thumb</option><option value="poster"' + (usePoster ? ' selected' : '') + '>Poster</option></select></label>';
    toolbarEl.innerHTML = html;

    toolbarEl.querySelectorAll('.grid-cols-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        gridCols = parseInt(btn.getAttribute('data-cols'), 10);
        applyGridClass();
      });
    });

    var exSel = toolbarEl.querySelector('#watch-rec-cols-extra');
    var exBtn = toolbarEl.querySelector('#watch-rec-cols-extra-btn');
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

  function isDirectVideoLink(url) {
    if (!url) return false;
    var u = String(url);
    var clean = u.split('#')[0];
    var qIndex = clean.indexOf('?');
    if (qIndex >= 0) clean = clean.slice(0, qIndex);
    if (/\.(m3u8|mp4|webm|mkv|flv|mov|ogg|ogv)$/i.test(clean)) return true;
    if (/\/stream\//i.test(u) || /\/hls\//i.test(u)) return true;
    return false;
  }

  function pickInitialEpisode(movie, serverSources) {
    var params = new URLSearchParams(window.location.search || '');
    var wantEp = params.get('ep') || '';

    var us = window.DAOP && window.DAOP.userSync;
    if (!wantEp && us && typeof us.getWatchHistory === 'function' && movie && movie.slug) {
      try {
        var hist = us.getWatchHistory().find(function (x) { return x && x.slug === movie.slug; });
        if (hist && hist.episode) wantEp = String(hist.episode);
      } catch (e) {}
    }

    var servers = window.DAOP && window.DAOP.serverSources ? window.DAOP.serverSources : (serverSources || []);

    function makeSlug(text) {
      if (!text) return '';
      var s = String(text).toLowerCase();
      if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      return s || 'default';
    }

    function matchServerSlug(baseSlug, serverName) {
      var b = baseSlug || '';
      var sn = serverName || '';
      var snSlug = makeSlug(sn);

      function isPrefix(a, b2) {
        if (!a || !b2) return false;
        return String(a).indexOf(String(b2)) === 0;
      }

      var matched = Array.isArray(servers) ? servers.find(function (s) {
        if (!s) return false;
        var sSlug = s.slug || '';
        var sNameSlug = makeSlug(s.name || '');
        return (
          sSlug === b ||
          sNameSlug === b ||
          (sn && sNameSlug === snSlug) ||
          isPrefix(sSlug, b) ||
          isPrefix(b, sSlug) ||
          isPrefix(sNameSlug, b) ||
          isPrefix(b, sNameSlug) ||
          (sn && (isPrefix(sNameSlug, snSlug) || isPrefix(snSlug, sNameSlug)))
        );
      }) : null;

      return (matched && matched.slug) || b || snSlug || 'default';
    }

    var serverData = {};
    (movie.episodes || []).forEach(function (ep) {
      var serverName = ep.server_name || ep.name || ep.slug || '';
      var baseSlug = makeSlug(serverName) || ep.slug || '';
      var srvSlug = matchServerSlug(baseSlug, serverName);
      var list = Array.isArray(ep.server_data) ? ep.server_data : [];
      if (!list.length) return;
      if (!serverData[srvSlug]) serverData[srvSlug] = [];
      list.forEach(function (srv, idx) {
        var code = (srv && (srv.slug || srv.name)) ? (srv.slug || srv.name) : String(idx + 1);
        var name = (srv && (srv.name || srv.slug)) ? (srv.name || srv.slug) : ('Tập ' + code);
        serverData[srvSlug].push({
          code: String(code),
          name: String(name),
          links: {
            m3u8: (srv && srv.link_m3u8) || '',
            embed: (srv && srv.link_embed) || '',
            backup: (srv && (srv.link_backup || srv.link)) || '',
            vip1: (srv && srv.link_vip1) || '',
            vip2: (srv && srv.link_vip2) || '',
            vip3: (srv && srv.link_vip3) || '',
            vip4: (srv && srv.link_vip4) || '',
            vip5: (srv && srv.link_vip5) || '',
          }
        });
      });
    });

    var srvKeys = Object.keys(serverData);
    if (!srvKeys.length) return null;

    var preferTypes = ['m3u8', 'embed', 'backup', 'vip1', 'vip2', 'vip3', 'vip4', 'vip5'];
    var pick = null;

    srvKeys.some(function (srvSlug) {
      var eps = serverData[srvSlug] || [];
      if (!eps.length) return false;

      var epObj = null;
      if (wantEp) {
        epObj = eps.find(function (e) { return e && (e.code === wantEp || e.name === wantEp); }) || null;
      }
      if (!epObj) epObj = eps[0];
      if (!epObj) return false;

      var linkType = null;
      for (var i = 0; i < preferTypes.length; i++) {
        if (epObj.links && epObj.links[preferTypes[i]]) {
          linkType = preferTypes[i];
          break;
        }
      }
      if (!linkType) linkType = 'm3u8';
      pick = { server: srvSlug, episode: epObj.code, linkType: linkType, link: (epObj.links && epObj.links[linkType]) || '' };
      return true;
    });

    return pick;
  }

  function renderPlayer(container, ctx) {
    if (!container) return;
    var playerSettings = window.DAOP && window.DAOP.playerSettings ? window.DAOP.playerSettings : {};
    var chosenPlayer = (playerSettings.default_player || 'plyr').toLowerCase();

    var safeLink = esc(ctx.link || '');
    var isDirect = isDirectVideoLink(ctx.link);

    var playerHtml = !ctx.link
      ? '<div class="watch-player-empty">Chưa có link phát.</div>'
      : isDirect
        ? '<video id="watch-video" class="video-js" controls playsinline preload="metadata" src="' + safeLink + '"></video>'
        : '<iframe id="watch-embed" src="' + safeLink + '" allowfullscreen allow="autoplay; fullscreen"></iframe>';

    container.innerHTML =
      '<div class="watch-player-card">' +
      '<div class="watch-player-wrap">' +
      playerHtml +
      '<div class="watch-next-overlay" data-role="next-overlay" style="display:none;">' +
      '  <button type="button" class="watch-next-btn" data-role="next-btn">Tập tiếp theo</button>' +
      '  <div class="watch-next-count" data-role="next-count"></div>' +
      '</div>' +
      '</div>' +
      '</div>';

    var video = document.getElementById('watch-video');
    if (!video || !isDirect) return;

    function loadScript(src) {
      return new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    function loadStylesheet(href) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    }

    function reportTime() {
      if (window.DAOP && window.DAOP.userSync && ctx.slug && ctx.episode && video.currentTime != null) {
        window.DAOP.userSync.updateWatchProgress(ctx.slug, ctx.episode, Math.floor(video.currentTime));
      }
    }

    video.addEventListener('timeupdate', reportTime);

    if (chosenPlayer === 'plyr') {
      loadStylesheet('https://cdn.plyr.io/3.7.8/plyr.css');
      loadScript('https://cdn.plyr.io/3.7.8/plyr.polyfilled.js').then(function () {
        try {
          var plyrInstance = new window.Plyr(video, { controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'fullscreen'] });
          plyrInstance.on('timeupdate', reportTime);
        } catch (e) {}
      }).catch(function () {});
    } else if (chosenPlayer === 'videojs') {
      loadStylesheet('https://vjs.zencdn.net/8.10.0/video-js.css');
      loadScript('https://vjs.zencdn.net/8.10.0/video.min.js').then(function () {
        try {
          window.videojs(video).ready(function () {
            this.on('timeupdate', reportTime);
          });
        } catch (e) {}
      }).catch(function () {});
    }
  }

  function initEpisodesUI(movie, root, initial) {
    if (!movie || !Array.isArray(movie.episodes) || !movie.episodes.length || !root) return;

    var servers = window.DAOP && window.DAOP.serverSources ? window.DAOP.serverSources : [];
    var playerSettings = window.DAOP && window.DAOP.playerSettings ? window.DAOP.playerSettings : {};
    var linkTypeLabels = playerSettings.link_type_labels || {
      m3u8: 'M3U8',
      embed: 'Embed',
      backup: 'Backup',
      vip1: 'VIP 1',
      vip2: 'VIP 2',
      vip3: 'VIP 3',
      vip4: 'VIP 4',
      vip5: 'VIP 5',
    };

    function makeSlug(text) {
      if (!text) return '';
      var s = String(text).toLowerCase();
      if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      return s || 'default';
    }

    function matchServerSlug(baseSlug, serverName) {
      var b = baseSlug || '';
      var sn = serverName || '';
      var snSlug = makeSlug(sn);

      function isPrefix(a, b2) {
        if (!a || !b2) return false;
        return String(a).indexOf(String(b2)) === 0;
      }

      var matched = Array.isArray(servers) ? servers.find(function (s) {
        if (!s) return false;
        var sSlug = s.slug || '';
        var sNameSlug = makeSlug(s.name || '');
        return (
          sSlug === b ||
          sNameSlug === b ||
          (sn && sNameSlug === snSlug) ||
          isPrefix(sSlug, b) ||
          isPrefix(b, sSlug) ||
          isPrefix(sNameSlug, b) ||
          isPrefix(b, sNameSlug) ||
          (sn && (isPrefix(sNameSlug, snSlug) || isPrefix(snSlug, sNameSlug)))
        );
      }) : null;

      return (matched && matched.slug) || b || snSlug || 'default';
    }

    function matchServerLabel(srvSlug, serverName) {
      function norm(t) {
        if (!t) return '';
        var s = String(t).toLowerCase();
        if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        return s;
      }
      var targetSlug = srvSlug || '';
      var targetName = norm(serverName || '');
      var matched = Array.isArray(servers) ? servers.find(function (s) {
        if (!s) return false;
        var sSlug = s.slug || '';
        var sName = norm(s.name || '');
        return sSlug === targetSlug || (targetName && sName === targetName);
      }) : null;
      return (matched && matched.name) || serverName || srvSlug;
    }

    var byServer = {};
    movie.episodes.forEach(function (ep) {
      var serverName = ep.server_name || ep.name || ep.slug || '';
      var baseSlug = makeSlug(serverName) || ep.slug || '';
      var srvSlug = matchServerSlug(baseSlug, serverName);
      var srvLabel = matchServerLabel(srvSlug, serverName);
      if (!byServer[srvSlug]) byServer[srvSlug] = { slug: srvSlug, label: srvLabel, episodes: [] };
      var list = Array.isArray(ep.server_data) ? ep.server_data : [];
      if (!list.length) return;
      list.forEach(function (srv, idxEp) {
        var code = (srv && (srv.slug || srv.name)) ? (srv.slug || srv.name) : String(idxEp + 1);
        var name = (srv && (srv.name || srv.slug)) ? (srv.name || srv.slug) : ('Tập ' + code);
        byServer[srvSlug].episodes.push({
          code: String(code),
          name: String(name),
          links: {
            m3u8: (srv && srv.link_m3u8) || '',
            embed: (srv && srv.link_embed) || '',
            backup: (srv && (srv.link_backup || srv.link)) || '',
            vip1: (srv && srv.link_vip1) || '',
            vip2: (srv && srv.link_vip2) || '',
            vip3: (srv && srv.link_vip3) || '',
            vip4: (srv && srv.link_vip4) || '',
            vip5: (srv && srv.link_vip5) || '',
          }
        });
      });
    });

    var serversData = Object.keys(byServer).map(function (k) { return byServer[k]; });
    if (!serversData.length) return;

    var state = {
      server: (initial && initial.server) || serversData[0].slug,
      linkType: (initial && initial.linkType) || 'm3u8',
      episode: (initial && initial.episode) || '',
      groupIdx: 0
    };

    var nextTimer = null;
    var nextRemain = 0;
    var nextTargetEpisode = '';

    function clearNextTimer() {
      if (nextTimer) {
        clearInterval(nextTimer);
        nextTimer = null;
      }
      nextRemain = 0;
      nextTargetEpisode = '';
    }

    function hideNextOverlay() {
      var host = root.querySelector('[data-role="player"]');
      if (!host) return;
      var overlay = host.querySelector('[data-role="next-overlay"]');
      if (overlay) overlay.style.display = 'none';
      clearNextTimer();
    }

    function playEpisode(code) {
      if (!code) return;
      hideNextOverlay();
      state.episode = String(code);
      renderEpisodes();
      updatePlayer();
    }

    function startNextCountdown(nextCode) {
      var host = root.querySelector('[data-role="player"]');
      if (!host) return;
      var overlay = host.querySelector('[data-role="next-overlay"]');
      var btn = host.querySelector('[data-role="next-btn"]');
      var countEl = host.querySelector('[data-role="next-count"]');
      if (!overlay || !btn || !countEl) return;

      clearNextTimer();
      nextTargetEpisode = String(nextCode);
      nextRemain = 5;

      overlay.style.display = '';
      countEl.textContent = 'Tự phát sau ' + nextRemain + 's';
      btn.onclick = function () { playEpisode(nextTargetEpisode); };

      nextTimer = setInterval(function () {
        nextRemain -= 1;
        if (nextRemain <= 0) {
          clearNextTimer();
          playEpisode(nextTargetEpisode);
          return;
        }
        countEl.textContent = 'Tự phát sau ' + nextRemain + 's';
      }, 1000);
    }

    function getServerInfo(slug) {
      return serversData.find(function (s) { return s.slug === slug; }) || serversData[0];
    }

    function getAvailableLinkTypes(info) {
      var keys = ['m3u8', 'embed', 'backup', 'vip1', 'vip2', 'vip3', 'vip4', 'vip5'];
      var types = [];
      keys.forEach(function (k) {
        var hasAny = (info.episodes || []).some(function (e) { return !!(e.links && e.links[k]); });
        if (hasAny) types.push({ id: k, label: linkTypeLabels[k] || k });
      });
      return types.length ? types : [{ id: 'm3u8', label: linkTypeLabels.m3u8 || 'm3u8' }];
    }

    function filterEpisodesByType(info, linkType) {
      return (info.episodes || []).filter(function (e) {
        var links = e.links || {};
        return !!links[linkType];
      });
    }

    function pickLink(info) {
      var epObj = (info.episodes || []).find(function (e) { return e && e.code === state.episode; }) || null;
      if (!epObj) epObj = (info.episodes || [])[0] || null;
      if (!epObj) return '';

      var links = epObj.links || {};
      if (state.linkType && links[state.linkType]) return links[state.linkType];

      var prefer = ['m3u8', 'embed', 'backup', 'vip1', 'vip2', 'vip3', 'vip4', 'vip5'];
      for (var i = 0; i < prefer.length; i++) {
        if (links[prefer[i]]) {
          state.linkType = prefer[i];
          return links[prefer[i]];
        }
      }
      return '';
    }

    function renderTabs() {
      var tabsEl = root.querySelector('[data-role="server-tabs"]');
      if (!tabsEl) return;
      tabsEl.innerHTML = serversData.map(function (s) {
        var active = s.slug === state.server ? ' server-tab--active' : '';
        return '<button type="button" class="server-tab' + active + '" data-server="' + esc(s.slug) + '">' + esc(s.label || s.slug) + '</button>';
      }).join('');
      tabsEl.querySelectorAll('.server-tab').forEach(function (btn) {
        btn.addEventListener('click', function () {
          state.server = btn.getAttribute('data-server') || serversData[0].slug;
          state.episode = '';
          state.groupIdx = 0;
          renderAll();
        });
      });
    }

    function renderLinkTypes() {
      var sel = root.querySelector('[data-role="link-type"]');
      if (!sel) return;
      var info = getServerInfo(state.server);
      var types = getAvailableLinkTypes(info);
      if (!types.some(function (t) { return t.id === state.linkType; })) state.linkType = types[0].id;
      sel.innerHTML = types.map(function (t) {
        var selected = t.id === state.linkType ? ' selected' : '';
        return '<option value="' + esc(t.id) + '"' + selected + '>' + esc(t.label) + '</option>';
      }).join('');
      sel.onchange = function () {
        state.linkType = sel.value || 'm3u8';
        renderGroups();
        renderEpisodes();
        updatePlayer();
      };
    }

    function renderGroups() {
      var row = root.querySelector('[data-role="group-row"]');
      var sel = root.querySelector('[data-role="group"]');
      if (!row || !sel) return;

      var info = getServerInfo(state.server);
      var list = filterEpisodesByType(info, state.linkType);
      var GROUP_SIZE = 50;
      var isSingle = (movie && (movie.type === 'single' || movie.type === 'movie')) || false;
      var needGrouping = !isSingle && list.length > GROUP_SIZE;

      if (!needGrouping) {
        row.style.display = 'none';
        state.groupIdx = 0;
        return;
      }

      row.style.display = '';
      var groups = Math.max(1, Math.ceil(list.length / GROUP_SIZE));
      if (state.groupIdx >= groups) state.groupIdx = 0;
      var options = '';
      for (var i = 0; i < groups; i++) {
        var start = i * GROUP_SIZE + 1;
        var end = Math.min((i + 1) * GROUP_SIZE, list.length);
        var label = 'Tập ' + start + ' - Tập ' + end;
        options += '<option value="' + i + '"' + (i === state.groupIdx ? ' selected' : '') + '>' + esc(label) + '</option>';
      }
      sel.innerHTML = options;
      sel.onchange = function () {
        state.groupIdx = parseInt(sel.value || '0', 10) || 0;
        renderEpisodes();
      };
    }

    function renderEpisodes() {
      var listEl = root.querySelector('[data-role="episodes"]');
      if (!listEl) return;
      var info = getServerInfo(state.server);
      var list = filterEpisodesByType(info, state.linkType);
      if (!list.length) list = info.episodes || [];

      var GROUP_SIZE = 50;
      var isSingle = (movie && (movie.type === 'single' || movie.type === 'movie')) || false;
      var needGrouping = !isSingle && list.length > GROUP_SIZE;
      var startIdx = needGrouping ? state.groupIdx * GROUP_SIZE : 0;
      var endIdx = needGrouping ? Math.min(startIdx + GROUP_SIZE, list.length) : list.length;
      var slice = list.slice(startIdx, endIdx);

      if (slice.length) {
        var stillExists = state.episode && slice.some(function (e) { return e && e.code === state.episode; });
        if (!stillExists) state.episode = slice[0].code;
      }
      listEl.innerHTML = slice.map(function (e) {
        var active = e.code === state.episode ? ' episode-btn--active' : '';
        return '<button type="button" class="episode-btn' + active + '" data-episode="' + esc(e.code) + '">' + esc(e.code) + '</button>';
      }).join('');
      listEl.querySelectorAll('.episode-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          state.episode = btn.getAttribute('data-episode') || '';
          renderEpisodes();
          updatePlayer();
        });
      });
    }

    function updatePlayer() {
      var info = getServerInfo(state.server);
      var link = pickLink(info);
      renderPlayer(root.querySelector('[data-role="player"]'), {
        link: link,
        slug: movie.slug,
        episode: state.episode
      });

      var host = root.querySelector('[data-role="player"]');
      if (!host) return;
      var video = host.querySelector('#watch-video');
      if (!video) return;

      hideNextOverlay();
      video.addEventListener('ended', function () {
        var currentInfo = getServerInfo(state.server);
        var list = filterEpisodesByType(currentInfo, state.linkType);
        if (!list.length) list = currentInfo.episodes || [];
        var idx = list.findIndex(function (e) { return e && e.code === state.episode; });
        if (idx < 0) return;
        var next = list[idx + 1];
        if (!next || !next.code) return;
        startNextCountdown(next.code);
      }, { once: true });
    }

    function renderAll() {
      renderTabs();
      renderLinkTypes();
      renderGroups();
      renderEpisodes();
      updatePlayer();
    }

    renderAll();
  }

  function setupActions(movie, root) {
    if (!movie || !root) return;
    var baseUrl = (window.DAOP && window.DAOP.basePath) || '';
    var slug = movie.slug || '';

    var btnFav = root.querySelector('#watch-btn-favorite');
    var btnShare = root.querySelector('#watch-btn-share');
    var btnScrollComments = root.querySelector('#watch-btn-scroll-comments');
    var btnScrollRecommend = root.querySelector('#watch-btn-scroll-recommend');

    try {
      if (window.DAOP && typeof window.DAOP.refreshQuickFavorites === 'function') window.DAOP.refreshQuickFavorites();
    } catch (e0) {}

    if (btnShare) {
      btnShare.addEventListener('click', function () {
        var url = window.location.href;
        try {
          if (navigator.share) {
            navigator.share({ title: movie.title || '', url: url });
            return;
          }
        } catch (e) {}
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url);
            return;
          }
        } catch (e2) {}
        try {
          var ta = document.createElement('textarea');
          ta.value = url;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        } catch (e3) {}
      });
    }

    function scrollToId(id) {
      var el = document.getElementById(id);
      if (!el) return;
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {
        window.location.hash = '#' + id;
      }
    }

    var _savedSidebarWidth = 0;

    function saveSidebarWidth() {
      var layout = root.querySelector('.watch-layout');
      if (!layout) return;
      var sidebar = layout.querySelector('.watch-sidebar');
      if (sidebar) {
        var sw = Math.round(sidebar.offsetWidth || 0);
        if (sw > 0) _savedSidebarWidth = sw;
      }
    }

    function updatePinnedOffset() {
      var layout = root.querySelector('.watch-layout');
      if (!layout) return;
      if (!layout.classList.contains('watch-layout--pinned')) {
        layout.style.removeProperty('--watch-pinned-offset');
        layout.style.removeProperty('--watch-pinned-left');
        layout.style.removeProperty('--watch-pinned-width');
        layout.style.removeProperty('--watch-sidebar-left');
        layout.style.removeProperty('--watch-sidebar-width');
        try { document.body.classList.remove('watch-player--pinned'); } catch (e0) {}
        return;
      }

      try { document.body.classList.add('watch-player--pinned'); } catch (e1) {}

      var sticky = layout.querySelector('.watch-player-sticky');
      if (!sticky) return;
      var rect = sticky.getBoundingClientRect();
      var h = Math.max(0, Math.round(rect.height || 0));
      layout.style.setProperty('--watch-pinned-offset', h + 'px');

      var main = layout.querySelector('.watch-main');
      if (main) {
        var mr = main.getBoundingClientRect();
        var left = Math.max(0, Math.round(mr.left || 0));
        var width = Math.max(0, Math.round(mr.width || 0));
        layout.style.setProperty('--watch-pinned-left', left + 'px');
        layout.style.setProperty('--watch-pinned-width', width + 'px');
      }

      var w = window.innerWidth || document.documentElement.clientWidth || 0;
      if (w >= 1024) {
        var sw = _savedSidebarWidth || 360;
        var lr = layout.getBoundingClientRect();
        var computedLeft = Math.max(0, Math.round((lr.right || 0) - sw));

        if (main) {
          var mrr = main.getBoundingClientRect();
          var minLeft = Math.round((mrr.right || 0) + 16);
          if (computedLeft < minLeft) computedLeft = minLeft;
        }

        layout.style.setProperty('--watch-sidebar-left', computedLeft + 'px');
        layout.style.setProperty('--watch-sidebar-width', sw + 'px');
      } else {
        layout.style.removeProperty('--watch-sidebar-left');
        layout.style.removeProperty('--watch-sidebar-width');
      }
    }

    function showCommentsPanel() {
      var sidebar = root.querySelector('.watch-sidebar');
      if (!sidebar) return;
      sidebar.classList.add('watch-sidebar--show-comments');
      scrollToId('watch-comments');
    }

    function hideCommentsPanel() {
      var sidebar = root.querySelector('.watch-sidebar');
      if (!sidebar) return;
      sidebar.classList.remove('watch-sidebar--show-comments');
    }

    if (btnScrollComments) btnScrollComments.addEventListener('click', showCommentsPanel);
    if (btnScrollRecommend) btnScrollRecommend.addEventListener('click', function () {
      scrollToId('watch-recommend');
    });

    var pinBtn = root.querySelector('#watch-btn-pin');
    if (pinBtn) {
      saveSidebarWidth();

      var _manualHeaderOpenWhilePinned = false;

      function syncHeaderForPinnedScroll() {
        try {
          var w = (window.innerWidth || document.documentElement.clientWidth || 0);
          if (w > 768) return;
          var layout = root.querySelector('.watch-layout');
          if (!layout || !layout.classList.contains('watch-layout--pinned')) return;

          var y = (window.scrollY != null) ? window.scrollY : (document.documentElement.scrollTop || 0);
          var header = document.querySelector('.site-header');
          if (!header) return;

          var collapsed = document.body.classList.contains('site-header--collapsed');

          // Khi header đang hiện thì không tự ẩn khi cuộn.
          // Chỉ đồng bộ offset dựa trên trạng thái hiện tại của header.
          if (y === 0) {
            _manualHeaderOpenWhilePinned = false;
          }

          if (collapsed) {
            document.documentElement.style.setProperty('--site-header-offset', '0px');
          } else {
            var r = header.getBoundingClientRect();
            var h = Math.max(0, Math.round(r.height || 0));
            document.documentElement.style.setProperty('--site-header-offset', h + 'px');
          }
        } catch (e) {}
      }

      window.addEventListener('daop:header-visibility-changed', function (ev) {
        try {
          var w = (window.innerWidth || document.documentElement.clientWidth || 0);
          if (w > 768) return;
          var layout = root.querySelector('.watch-layout');
          if (!layout || !layout.classList.contains('watch-layout--pinned')) return;

          var y = (window.scrollY != null) ? window.scrollY : (document.documentElement.scrollTop || 0);
          var collapsed = !!(ev && ev.detail && ev.detail.collapsed);
          if (!collapsed && y > 0) _manualHeaderOpenWhilePinned = true;
          if (collapsed) _manualHeaderOpenWhilePinned = false;

          syncHeaderForPinnedScroll();
          updatePinnedOffset();
        } catch (e0) {}
      });

      (function () {
        var w = (window.innerWidth || document.documentElement.clientWidth || 0);
        var shouldPin = w < 1024;
        var layout0 = root.querySelector('.watch-layout');
        if (layout0 && shouldPin) layout0.classList.add('watch-layout--pinned');
        if (layout0 && !shouldPin) layout0.classList.remove('watch-layout--pinned');
        var nowPinned = !!(layout0 && layout0.classList.contains('watch-layout--pinned'));
        pinBtn.innerHTML = (nowPinned ? iconSvg('close') : iconSvg('pin')) + '<span class="watch-pin-text">' + (nowPinned ? 'Bỏ ghim' : 'Ghim') + '</span>';
        pinBtn.setAttribute('aria-pressed', nowPinned ? 'true' : 'false');
        updatePinnedOffset();
      })();

      pinBtn.addEventListener('click', function () {
        var layout = root.querySelector('.watch-layout');
        if (!layout) return;
        var wasPinned = layout.classList.contains('watch-layout--pinned');
        if (!wasPinned) saveSidebarWidth();
        var pinned = layout.classList.toggle('watch-layout--pinned');
        pinBtn.innerHTML = (pinned ? iconSvg('close') : iconSvg('pin')) + '<span class="watch-pin-text">' + (pinned ? 'Bỏ ghim' : 'Ghim') + '</span>';
        pinBtn.setAttribute('aria-pressed', pinned ? 'true' : 'false');
        syncHeaderForPinnedScroll();
        updatePinnedOffset();
      });

      window.addEventListener('scroll', function () {
        syncHeaderForPinnedScroll();
      }, { passive: true });

      syncHeaderForPinnedScroll();
    }

    window.addEventListener('resize', function () {
      updatePinnedOffset();
    });

    var btnCloseComments = root.querySelector('#watch-btn-close-comments');
    if (btnCloseComments) btnCloseComments.addEventListener('click', hideCommentsPanel);

    var btnCollapseEpisodes = root.querySelector('#watch-btn-collapse-episodes');
    if (btnCollapseEpisodes) {
      btnCollapseEpisodes.addEventListener('click', function () {
        var epCard = root.querySelector('.watch-episodes-card');
        if (!epCard) return;
        epCard.classList.toggle('watch-episodes-card--collapsed');
      });
    }

    var renderCard = window.DAOP && window.DAOP.renderMovieCard;
    if (renderCard) {
      var grid = document.getElementById('watch-recommend-grid');
      if (grid) {
        var cfg = getWatchRecSettings();
        var baseUrl = (window.DAOP && window.DAOP.basePath) || '';
        grid.className = 'movies-grid';
        grid.innerHTML = '<p>Đang tải...</p>';

        var fd = window.filtersData || {};
        var genreMap = fd.genreMap || {};
        var genres = (movie.genre || []).map(function (g) { return g && (g.slug || g.id); }).filter(Boolean);
        var idSet = new Set();
        genres.forEach(function (g) {
          var arr = genreMap[g] || [];
          (arr || []).forEach(function (id) { if (id != null) idSet.add(String(id)); });
        });
        if (movie && movie.id != null) idSet.delete(String(movie.id));
        var ids = Array.from(idSet).slice(0, Math.max(cfg.limit * 4, cfg.limit));

        var listRef = { list: [] };
        var toolbarEl = document.getElementById('watch-rec-toolbar');
        var getById = window.DAOP && window.DAOP.getMovieLightByIdAsync;
        if (typeof getById !== 'function') {
          grid.innerHTML = '<p>Không thể tải dữ liệu phim.</p>';
          setupRecommendToolbar(toolbarEl, grid, baseUrl, listRef);
        } else {
          Promise.all(ids.map(function (id) { return getById(id); }))
            .then(function (arr) {
              listRef.list = (arr || []).filter(Boolean).slice(0, cfg.limit);
              setupRecommendToolbar(toolbarEl, grid, baseUrl, listRef);
            })
            .catch(function () {
              listRef.list = [];
              grid.innerHTML = '<p>Không có phim.</p>';
              setupRecommendToolbar(toolbarEl, grid, baseUrl, listRef);
            });
        }
      }
    }

    if (window.twikoo) {
      try {
        twikoo.init({
          envId: (window.DAOP && window.DAOP.twikooEnvId) || '',
          el: '#twikoo-watch-comments',
          path: window.location.pathname,
        });
      } catch (e5) {}
    }
  }

  function init() {
    ensureSiteSettings(function () {
      ensurePlayerSettings(function () {
      var rootEl = document.getElementById('watch-page');
      if (!rootEl) rootEl = document.body;

      var slug = getSlug();
      if (!slug) {
        rootEl.innerHTML = '<p>Không tìm thấy phim.</p>';
        return;
      }

      var getLight = (window.DAOP && typeof window.DAOP.getMovieBySlugAsync === 'function')
        ? window.DAOP.getMovieBySlugAsync
        : function (s) { return Promise.resolve(window.DAOP && window.DAOP.getMovieBySlug ? window.DAOP.getMovieBySlug(s) : null); };
      getLight(slug).then(function (light) {
        if (!light) {
          rootEl.innerHTML = '<p>Không tìm thấy phim.</p>';
          return;
        }

        window.DAOP.loadMovieDetail(light.id, function (movie) {
          if (!movie) {
            rootEl.innerHTML = '<p>Không thể tải dữ liệu phim.</p>';
            return;
          }

          var norm = (window.DAOP && typeof window.DAOP.normalizeImgUrl === 'function')
            ? window.DAOP.normalizeImgUrl
            : function (x) { return x; };
          var normOphim = (window.DAOP && typeof window.DAOP.normalizeImgUrlOphim === 'function')
            ? window.DAOP.normalizeImgUrlOphim
            : function (x) { return x; };
          var derivedPoster = (!movie.poster && movie.thumb && window.DAOP && typeof window.DAOP.derivePosterFromThumb === 'function')
            ? window.DAOP.derivePosterFromThumb(movie.thumb)
            : '';
          var baseUrl = (window.DAOP && window.DAOP.basePath) || '';
          var defaultPoster = baseUrl + '/images/default_poster.png';
          var posterRaw = (movie.poster || derivedPoster || movie.thumb || '');
          var poster = norm(posterRaw).replace(/^\/\//, 'https://') || defaultPoster;
          var posterOphim = normOphim(posterRaw).replace(/^\/\//, 'https://') || '';
          var title = (movie.title || '').replace(/</g, '&lt;');
          var slugSafe = esc(movie.slug || slug);

          rootEl.innerHTML =
            '<div class="watch-layout">' +
            '  <div class="ad-slot" data-ad-position="watch_top"></div>' +
            '  <div class="watch-main">' +
            '    <div class="watch-player-sticky">' +
            '      <div data-role="player"></div>' +
            '    </div>' +
            '    <img alt="" style="position:absolute;left:-99999px;top:-99999px;width:1px;height:1px;opacity:0" src="' + esc(poster) + '"' + imgOnErrorAttr(posterOphim, '', defaultPoster) + '>' +
            '    <div class="watch-player-meta" style="margin-top:0.75rem;">' +
            '      <div class="watch-player-meta-head">' +
            '        <a class="watch-back-btn" href="/phim/' + esc(movie.slug || slug) + '.html" aria-label="Về trang chi tiết">' +
            '          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '        </a>' +
            '        <div class="watch-player-meta-title" style="font-weight:800;">' + title + '</div>' +
            '        <button type="button" class="md-action-btn watch-pin-btn" id="watch-btn-pin" aria-pressed="false">' + iconSvg('pin') + '<span class="md-action-label">Ghim</span></button>' +
            '      </div>' +
            '      <div class="md-actions watch-actions" style="margin-top:0.6rem;">' +
            '        <button type="button" class="md-action-btn movie-fav-btn" id="watch-btn-favorite" data-movie-slug="' + slugSafe + '" aria-label="Yêu thích" aria-pressed="false">' + iconSvg('heart') + '<span class="md-action-label">Yêu thích</span></button>' +
            '        <button type="button" class="md-action-btn" id="watch-btn-share">' + iconSvg('share') + '<span class="md-action-label">Chia sẻ</span></button>' +
            '        <button type="button" class="md-action-btn" id="watch-btn-scroll-comments">' + iconSvg('chat') + '<span class="md-action-label">Bình luận</span></button>' +
            '        <button type="button" class="md-action-btn" id="watch-btn-scroll-recommend">' + iconSvg('spark') + '<span class="md-action-label">Đề xuất</span></button>' +
            '      </div>' +
            '    </div>' +
            '  </div>' +
            '  <aside class="watch-sidebar">' +
            '    <div class="watch-episodes-card">' +
            '      <div class="watch-episodes-head">' +
            '        <div class="server-tabs" data-role="server-tabs"></div>' +
            '        <button type="button" class="watch-episodes-collapse" id="watch-btn-collapse-episodes" aria-label="Thu gọn tập">' + iconSvg('chevDown') + '</button>' +
            '      </div>' +
            '      <div class="watch-episodes-controls watch-episodes-controls--single">' +
            '        <label class="watch-episodes-linktype"><span class="episodes-ui-label">Máy chủ</span><select class="episodes-ui-select" data-role="link-type"></select></label>' +
            '        <div class="episodes-ui-row watch-episodes-group" data-role="group-row" style="display:none;">' +
            '          <select id="watch-episodes-group" class="episodes-ui-select" data-role="group" aria-label="Nhóm tập"></select>' +
            '        </div>' +
            '      </div>' +
            '      <div class="episodes-grid" data-role="episodes"></div>' +
            '    </div>' +
            '    <section id="watch-comments" class="watch-side-card watch-comments-card">' +
            '      <div class="watch-side-head">' +
            '        <div class="watch-side-title">' + iconSvg('chat') + '<span class="watch-side-title-text">Bình luận</span></div>' +
            '        <button type="button" class="watch-side-back" id="watch-btn-close-comments" aria-label="Đóng">' + iconSvg('close') + '<span class="watch-close-text">Đóng</span></button>' +
            '      </div>' +
            '      <div id="twikoo-watch-comments"></div>' +
            '    </section>' +
            '  </aside>' +
            '</div>' +
            '<section id="watch-recommend" class="md-section watch-recommend-full">' +
            '  <div class="md-section-head">' +
            '    <h3 class="md-section-title">' + iconSvg('spark') + '<span class="md-section-title-text">Đề xuất</span></h3>' +
            '    <div class="grid-toolbar" id="watch-rec-toolbar" aria-label="Tùy chọn hiển thị"></div>' +
            '  </div>' +
            '  <div class="movies-grid" id="watch-recommend-grid"></div>' +
            '</section>';

          var initial = pickInitialEpisode(movie, window.DAOP && window.DAOP.serverSources);
          initEpisodesUI(movie, rootEl, initial);
          setupActions(movie, rootEl);

          if (window.DAOP && typeof window.DAOP.renderAdsInDocument === 'function') {
            window.DAOP.renderAdsInDocument(rootEl);
          }
        });
      });
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { ensureSiteSettings(init); });
  } else {
    ensureSiteSettings(init);
  }
})();
