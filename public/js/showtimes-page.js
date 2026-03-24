/**
 * Lịch chiếu: liệt kê phim có showtimes, dạng list + phân trang.
 * Sort ưu tiên:
 *  - status current/ongoing trước
 *  - trailer/upcoming sau
 *  - trong từng nhóm: mới -> cũ (modified, fallback year)
 */
(function () {
  function esc(s) {
    if (s == null || s === '') return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeStatusKey(m) {
    var raw = (m && m.status != null) ? String(m.status).trim().toLowerCase() : '';
    var st = (m && m.showtimes != null) ? String(m.showtimes).trim().toLowerCase() : '';
    if (!raw && !st) return '';

    var isTrailer = raw === 'trailer' || raw.indexOf('trailer') >= 0 || st.indexOf('sắp') >= 0 || st.indexOf('sap') >= 0;
    var isOngoing = raw.indexOf('đang') >= 0 || raw.indexOf('dang') >= 0 || raw.indexOf('ongoing') >= 0 || raw.indexOf('current') >= 0 || raw.indexOf('on going') >= 0 || raw.indexOf('cập nhật') >= 0 || raw.indexOf('cap nhat') >= 0;

    if (isOngoing) return 'ongoing';
    if (isTrailer) return 'trailer';
    return raw || '';
  }

  function parseTimeLike(s) {
    if (!s) return 0;
    var str = String(s).trim();
    if (!str) return 0;
    var t = Date.parse(str);
    if (!isNaN(t)) return t;
    return 0;
  }

  function getPrimaryTime(m) {
    var t1 = parseTimeLike(m && m.modified);
    if (t1) return t1;
    var y = parseInt(m && m.year, 10);
    if (isFinite(y) && y > 1900) return y * 1000;
    return 0;
  }

  function groupRank(m) {
    var k = normalizeStatusKey(m);
    if (k === 'ongoing') return 0;
    if (k === 'trailer') return 1;
    return 2;
  }

  function renderRow(m, baseUrl) {
    var title = (m && (m.title || m.name)) ? String(m.title || m.name) : '';
    var origin = (m && m.origin_name) ? String(m.origin_name) : '';
    var href = baseUrl + '/phim/' + encodeURIComponent(String(m.slug || '')) + '.html';
    var st = (m && m.showtimes) ? String(m.showtimes).trim() : '';
    var status = (m && m.status) ? String(m.status).trim() : '';
    var year = (m && m.year) ? String(m.year).trim() : '';

    return '' +
      '<a class="showtimes-item" href="' + esc(href) + '">' +
        '<div class="showtimes-item-main">' +
          '<div class="showtimes-item-title">' + esc(title) + (origin ? ' <span class="showtimes-item-origin">(' + esc(origin) + ')</span>' : '') + '</div>' +
          '<div class="showtimes-item-meta">' +
            (status ? '<span class="showtimes-badge">' + esc(status) + '</span>' : '') +
            (year ? '<span class="showtimes-year">' + esc(year) + '</span>' : '') +
          '</div>' +
          '<div class="showtimes-item-st">' + esc(st) + '</div>' +
        '</div>' +
      '</a>';
  }

  function renderPagination(container, currentPage, totalPages) {
    if (!container) return;
    var cur = currentPage;
    var total = totalPages || 1;
    var html = '';
    html += '<a href="#" class="pagination-nav" data-page="1" aria-label="Về đầu">«</a>';
    html += '<a href="#" class="pagination-nav" data-page="' + Math.max(1, cur - 1) + '" aria-label="Trước">‹</a>';
    var win = 5;
    var start = Math.max(1, Math.min(cur - 2, total - win + 1));
    var end = Math.min(total, start + win - 1);
    for (var i = start; i <= end; i++) {
      if (i === cur) html += '<span class="current">' + i + '</span>';
      else html += '<a href="#" data-page="' + i + '">' + i + '</a>';
    }
    html += '<a href="#" class="pagination-nav" data-page="' + Math.min(total, cur + 1) + '" aria-label="Sau">›</a>';
    html += '<a href="#" class="pagination-nav" data-page="' + total + '" aria-label="Về cuối">»</a>';
    html += '<span class="pagination-jump"><input type="number" min="1" max="' + total + '" value="" placeholder="Trang" id="pagination-goto" aria-label="Trang"><button type="button" id="pagination-goto-btn">Đến</button></span>';
    container.innerHTML = html;
  }

  function init() {
    var baseUrl = (window.DAOP && window.DAOP.basePath) || '';
    var listEl = document.getElementById('showtimes-list');
    var pagEl = document.getElementById('pagination');
    var toolbarEl = document.getElementById('showtimes-toolbar');

    if (toolbarEl) {
      toolbarEl.innerHTML = '<div class="showtimes-toolbar-inner">' +
        '<label class="showtimes-perpage">Hiển thị: ' +
          '<select id="showtimes-perpage">' +
            '<option value="20">20</option>' +
            '<option value="30" selected>30</option>' +
            '<option value="50">50</option>' +
          '</select>' +
        '</label>' +
      '</div>';
    }

    var fd = window.filtersData || {};
    var ids = (fd && Array.isArray(fd.showtimesIds)) ? fd.showtimesIds.slice(0) : [];
    if (!ids.length) {
      if (listEl) listEl.innerHTML = '<p>Không có phim nào có lịch chiếu.</p>';
      if (pagEl) pagEl.innerHTML = '';
      return;
    }

    var state = {
      perPage: 30,
      currentPage: 1,
      ids: ids.map(function (x) { return String(x); }),
      cache: {},
      sortedMovies: [],
    };

    function sortMovies(arr) {
      arr.sort(function (a, b) {
        var ga = groupRank(a);
        var gb = groupRank(b);
        if (ga !== gb) return ga - gb;
        var ta = getPrimaryTime(a);
        var tb = getPrimaryTime(b);
        if (ta !== tb) return tb - ta;
        var ya = parseInt(a && a.year, 10) || 0;
        var yb = parseInt(b && b.year, 10) || 0;
        if (ya !== yb) return yb - ya;
        return String(a && a.title || '').localeCompare(String(b && b.title || ''));
      });
      return arr;
    }

    function renderPage() {
      if (!listEl) return;
      var totalPages = Math.ceil(state.sortedMovies.length / state.perPage) || 1;
      state.currentPage = Math.max(1, Math.min(state.currentPage, totalPages));
      var start = (state.currentPage - 1) * state.perPage;
      var slice = state.sortedMovies.slice(start, start + state.perPage);
      listEl.innerHTML = slice.map(function (m) { return renderRow(m, baseUrl); }).join('') || '<p>Không có phim nào.</p>';
      renderPagination(pagEl, state.currentPage, totalPages);
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
    }

    function loadAll() {
      if (!listEl) return;
      listEl.innerHTML = '<p>Đang tải...</p>';

      var getById = window.DAOP && window.DAOP.getMovieLightByIdAsync;
      if (typeof getById !== 'function') {
        listEl.innerHTML = '<p>Không thể tải dữ liệu phim.</p>';
        return;
      }

      Promise.all(state.ids.map(function (id) {
        if (state.cache[id]) return Promise.resolve(state.cache[id]);
        return getById(id).then(function (m) {
          if (m && m.showtimes) state.cache[id] = m;
          return m;
        }).catch(function () { return null; });
      }))
        .then(function (arr) {
          var movies = (arr || []).filter(function (m) {
            var st = (m && m.showtimes != null) ? String(m.showtimes).trim() : '';
            return !!st;
          });
          state.sortedMovies = sortMovies(movies);
          renderPage();
        })
        .catch(function () {
          listEl.innerHTML = '<p>Không thể tải dữ liệu phim.</p>';
        });
    }

    if (toolbarEl) {
      var sel = document.getElementById('showtimes-perpage');
      if (sel) {
        sel.addEventListener('change', function () {
          state.perPage = parseInt(sel.value, 10) || 30;
          state.currentPage = 1;
          renderPage();
        });
      }
    }

    if (pagEl) {
      pagEl.addEventListener('click', function (e) {
        e.preventDefault();
        var t = e.target;
        var p = t && t.getAttribute ? t.getAttribute('data-page') : '';
        if (p) {
          state.currentPage = parseInt(p, 10) || 1;
          renderPage();
          return;
        }
        if (t && t.id === 'pagination-goto-btn') {
          var inp = document.getElementById('pagination-goto');
          if (inp) {
            var total = Math.ceil(state.sortedMovies.length / state.perPage) || 1;
            var num = parseInt(inp.value, 10);
            if (num >= 1 && num <= total) {
              state.currentPage = num;
              renderPage();
            }
          }
        }
      });

      pagEl.addEventListener('keydown', function (e) {
        if (e.target && e.target.id === 'pagination-goto' && e.key === 'Enter') {
          e.preventDefault();
          var inp = document.getElementById('pagination-goto');
          if (inp) {
            var total = Math.ceil(state.sortedMovies.length / state.perPage) || 1;
            var num = parseInt(inp.value, 10);
            if (num >= 1 && num <= total) {
              state.currentPage = num;
              renderPage();
            }
          }
        }
      });
    }

    loadAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
