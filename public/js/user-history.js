(function () {
  function $(id) { return document.getElementById(id); }

  var histList = $('history-list');
  var histEmpty = $('history-empty');
  var pageSize = 24;
  var currentPage = 1;
  var pagerRef = { el: null };

  function safeText(s) {
    return String(s || '').replace(/</g, '&lt;');
  }

  function ensurePager() {
    if (!histList) return null;
    var parent = histList.parentElement;
    if (!parent) return null;
    var pager = parent.querySelector('#pagination');
    if (!pager) {
      pager = document.createElement('div');
      pager.id = 'pagination';
      pager.className = 'pagination';
      parent.appendChild(pager);
    }
    pagerRef.el = pager;
    return pager;
  }

  function renderPager(totalItems) {
    var pager = ensurePager();
    if (!pager) return;
    var totalPages = Math.max(1, Math.ceil((totalItems || 0) / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    if (totalItems <= pageSize) {
      pager.innerHTML = '';
      return;
    }

    var cur = currentPage;
    var html = '';
    html += '<a href="#" class="pagination-nav" data-page="1" aria-label="Về đầu">«</a>';
    html += '<a href="#" class="pagination-nav" data-page="' + Math.max(1, cur - 1) + '" aria-label="Trước">‹</a>';
    var win = 5;
    var start = Math.max(1, Math.min(cur - 2, totalPages - win + 1));
    var end = Math.min(totalPages, start + win - 1);
    for (var i = start; i <= end; i++) {
      if (i === cur) html += '<span class="current">' + i + '</span>';
      else html += '<a href="#" data-page="' + i + '">' + i + '</a>';
    }
    html += '<a href="#" class="pagination-nav" data-page="' + Math.min(totalPages, cur + 1) + '" aria-label="Sau">›</a>';
    html += '<a href="#" class="pagination-nav" data-page="' + totalPages + '" aria-label="Về cuối">»</a>';
    html += '<span class="pagination-jump"><input type="number" min="1" max="' + totalPages + '" value="" placeholder="Trang" id="pagination-goto" aria-label="Trang"><button type="button" id="pagination-goto-btn">Đến</button></span>';
    pager.innerHTML = html;

    if (pager.getAttribute('data-bound') === '1') return;
    pager.setAttribute('data-bound', '1');
    pager.addEventListener('click', function (e) {
      var t = e.target;
      var p = t && t.getAttribute ? t.getAttribute('data-page') : null;
      if (p) {
        e.preventDefault();
        currentPage = Math.max(1, Math.min(totalPages, parseInt(p, 10) || 1));
        renderHistory();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      if (t && t.id === 'pagination-goto-btn') {
        e.preventDefault();
        var inp = document.getElementById('pagination-goto');
        if (inp) {
          var num = parseInt(inp.value, 10);
          if (num >= 1 && num <= totalPages) {
            currentPage = num;
            renderHistory();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }
      }
    });
    pager.addEventListener('keydown', function (e) {
      if (e.target && e.target.id === 'pagination-goto' && e.key === 'Enter') {
        e.preventDefault();
        var inp = document.getElementById('pagination-goto');
        if (inp) {
          var num = parseInt(inp.value, 10);
          if (num >= 1 && num <= totalPages) {
            currentPage = num;
            renderHistory();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }
      }
    });
  }

  function getCreateClient() {
    if (typeof createClient !== 'undefined') return createClient;
    if (window.supabase && typeof window.supabase.createClient === 'function') return window.supabase.createClient;
    return null;
  }

  function loadSupabaseJs() {
    if (getCreateClient()) return Promise.resolve();
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = function () { resolve(); };
      s.onerror = function () { resolve(); };
      document.head.appendChild(s);
    });
  }

  function loadSettings() {
    if (window.DAOP && window.DAOP.siteSettings) return Promise.resolve(window.DAOP.siteSettings);
    if (window.DAOP && window.DAOP.loadConfig) {
      return window.DAOP.loadConfig('site-settings').then(function (s) {
        window.DAOP = window.DAOP || {};
        window.DAOP.siteSettings = s || {};
        if (window.DAOP.applySiteSettings) window.DAOP.applySiteSettings(window.DAOP.siteSettings);
        return window.DAOP.siteSettings;
      });
    }
    return fetch('/data/config/site-settings.json')
      .then(function (r) { return r.json(); })
      .catch(function () { return {}; })
      .then(function (s) {
        window.DAOP = window.DAOP || {};
        window.DAOP.siteSettings = s || {};
        if (window.DAOP.applySiteSettings) window.DAOP.applySiteSettings(window.DAOP.siteSettings);
        return window.DAOP.siteSettings;
      });
  }

  function initClient() {
    return Promise.all([loadSettings(), loadSupabaseJs()]).then(function (arr) {
      var s = arr[0] || {};
      window.DAOP = window.DAOP || {};
      if (!window.DAOP.supabaseUserUrl) window.DAOP.supabaseUserUrl = s.supabase_user_url || '';
      if (!window.DAOP.supabaseUserAnonKey) window.DAOP.supabaseUserAnonKey = s.supabase_user_anon_key || '';

      var url = window.DAOP.supabaseUserUrl;
      var key = window.DAOP.supabaseUserAnonKey;
      var cc = getCreateClient();
      if (!url || !key || !cc) return null;
      if (!window.DAOP._supabaseUser) window.DAOP._supabaseUser = cc(url, key);
      return window.DAOP._supabaseUser;
    });
  }

  function renderHistory() {
    if (!histList) return;
    histList.innerHTML = '';

    var us = window.DAOP && window.DAOP.userSync;
    if (!us) return;

    var list = (us.getWatchHistory ? us.getWatchHistory() : []).slice();
    list.sort(function (a, b) {
      var ta = Date.parse(a && a.lastWatched || '') || 0;
      var tb = Date.parse(b && b.lastWatched || '') || 0;
      return tb - ta;
    });

    if (!list.length) {
      if (histEmpty) histEmpty.style.display = '';
      var pg0 = ensurePager();
      if (pg0) pg0.innerHTML = '';
      return;
    }
    if (histEmpty) histEmpty.style.display = 'none';

    renderPager(list.length);

    var totalPages = Math.max(1, Math.ceil(list.length / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    var start = (currentPage - 1) * pageSize;
    var end = Math.min(list.length, start + pageSize);


    var getLight = (window.DAOP && typeof window.DAOP.getMovieBySlugAsync === 'function')
      ? window.DAOP.getMovieBySlugAsync
      : function (s) { return Promise.resolve(window.DAOP && window.DAOP.getMovieBySlug ? window.DAOP.getMovieBySlug(s) : null); };

    histList.innerHTML = '<p>Đang tải...</p>';
    var pageItems = list.slice(start, end);
    Promise.all(pageItems.map(function (h) {
      if (!h || !h.slug) return Promise.resolve({ h: h, m: null });
      return getLight(h.slug).then(function (m) { return { h: h, m: m }; });
    }))
      .then(function (rows) {
        histList.innerHTML = '';
        (rows || []).forEach(function (row) {
          var h = row && row.h;
          var m = row && row.m;
          if (!h || !h.slug || !m) return;

          var title = safeText(m.title || m.name || h.slug);
          var ep = safeText(h.episode || '');
          var href = '/phim/' + encodeURIComponent(m.slug || m.id || h.slug) + '.html';
          var last = h.lastWatched ? safeText(h.lastWatched) : '';
          var us2 = window.DAOP && window.DAOP.userSync;
          var isFav = false;
          try {
            isFav = !!(us2 && us2.getFavorites && us2.getFavorites().has(h.slug));
          } catch (eFav0) {}
          var norm = (window.DAOP && typeof window.DAOP.normalizeImgUrl === 'function')
            ? window.DAOP.normalizeImgUrl
            : function (x) { return x; };
          var normOphim = (window.DAOP && typeof window.DAOP.normalizeImgUrlOphim === 'function')
            ? window.DAOP.normalizeImgUrlOphim
            : function (x) { return x; };
          var baseUrl = (window.DAOP && window.DAOP.basePath) || '';
          var defaultImg = baseUrl + '/images/default_thumb.png';
          if (!defaultImg) defaultImg = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="96" height="64"%3E%3Crect fill="%2321262d" width="96" height="64"/%3E%3C/svg%3E';

          var posterRaw = (m.poster || m.thumb || '');
          var poster = norm(posterRaw).replace(/^\/\//, 'https://') || defaultImg;
          var posterOphim = normOphim(posterRaw).replace(/^\/\//, 'https://') || '';
          var posterEsc = safeText(poster).replace(/"/g, '&quot;');
          var oEsc = String(posterOphim || '').replace(/'/g, '%27');
          var dEsc = String(defaultImg || '').replace(/'/g, '%27');

          var html = '' +
            '<div class="user-history-item">' +
            '  <a class="user-history-thumb" href="' + href + '"><img loading="lazy" decoding="async" src="' + posterEsc + '"' +
            (function(){
              if (oEsc && oEsc !== posterEsc) {
                return ' onerror="this.onerror=function(){this.onerror=null;this.src=\'' + dEsc + '\';};this.src=\'' + oEsc + '\';"';
              }
              return ' onerror="this.onerror=null;this.src=\'' + dEsc + '\';"';
            })() +
            ' alt=""></a>' +
            '  <div class="user-history-main">' +
            '    <a class="user-history-title" href="' + href + '">' + title + '</a>' +
            '    <div class="user-history-meta">Tập: <strong>' + ep + '</strong>' + (last ? ' • ' + last : '') + '</div>' +
            '  </div>' +
            '  <div class="user-history-actions">' +
            '    <button type="button" class="login-btn login-btn--primary btn-continue" data-slug="' + safeText(h.slug) + '" data-episode="' + ep + '">Xem tiếp</button>' +
            '    <button type="button" class="movie-fav-btn' + (isFav ? ' is-fav' : '') + '" data-movie-slug="' + safeText(h.slug) + '" aria-pressed="' + (isFav ? 'true' : 'false') + '" aria-label="Yêu thích">♥</button>' +
            '    <button type="button" class="login-btn btn-remove" data-slug="' + safeText(h.slug) + '">Xóa</button>' +
            '  </div>' +
            '</div>';

          histList.insertAdjacentHTML('beforeend', html);
        });

        histList.querySelectorAll('.btn-continue').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var slug = btn.getAttribute('data-slug');
            var ep = btn.getAttribute('data-episode');
            var base = (window.DAOP && window.DAOP.basePath) || '';
            if (!slug) return;
            var href = base + '/xem-phim/' + encodeURIComponent(slug) + '.html';
            if (ep) href += '?ep=' + encodeURIComponent(ep);
            window.location.href = href;
          });
        });

        histList.querySelectorAll('.btn-remove').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var slug = btn.getAttribute('data-slug');
            var us = window.DAOP && window.DAOP.userSync;
            if (!slug || !us || typeof us.removeWatchHistory !== 'function') return;
            try {
              us.removeWatchHistory(slug);
            } catch (eDel0) {}
            try {
              var nextList = (us.getWatchHistory && us.getWatchHistory()) || [];
              if (currentPage > 1 && ((currentPage - 1) * pageSize) >= nextList.length) {
                currentPage = Math.max(1, currentPage - 1);
              }
            } catch (eDel1) {}
            renderHistory();
          });
        });
      })
      .catch(function () {
        histList.innerHTML = '<p>Không thể tải dữ liệu phim.</p>';
      });
  }

  function init() {
    initClient().then(function (client) {
      if (!client) {
        window.location.href = '/login.html';
        return;
      }

      client.auth.getSession().then(function (res) {
        var user = res && res.data && res.data.session && res.data.session.user;
        if (!user) {
          window.location.href = '/login.html';
          return;
        }
        if (window.DAOP && window.DAOP.updateAuthNav) window.DAOP.updateAuthNav();

        var us = window.DAOP && window.DAOP.userSync;
        if (us && typeof us.sync === 'function') {
          us.sync().then(function () {
            renderHistory();
          });
        } else {
          renderHistory();
        }
      }).catch(function () {
        window.location.href = '/login.html';
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
