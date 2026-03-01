/**
 * Tìm kiếm với FlexSearch (index title + origin_name)
 * Hỗ trợ tiếng Việt có dấu và không dấu
 */
(function () {
  var searchInput = document.getElementById('search-input');
  var searchBtn = document.getElementById('search-btn');
  var resultsEl = document.getElementById('search-results');
  var index = null;
  var indexUnsigned = null;
  var gridCols = 4;
  var usePoster = false;
  var gridColumnsOptions = [2, 3, 4, 8];
  var gridColumnsExtra = 8;
  var currentList = [];
  var gridElRef = { el: null };

  function removeVietnameseTones(str) {
    if (!str || typeof str !== 'string') return '';
    var map = {
      'à':'a','á':'a','ả':'a','ã':'a','ạ':'a','ă':'a','ằ':'a','ắ':'a','ẳ':'a','ẵ':'a','ặ':'a','â':'a','ầ':'a','ấ':'a','ẩ':'a','ẫ':'a','ậ':'a',
      'è':'e','é':'e','ẻ':'e','ẽ':'e','ẹ':'e','ê':'e','ề':'e','ế':'e','ể':'e','ễ':'e','ệ':'e',
      'ì':'i','í':'i','ỉ':'i','ĩ':'i','ị':'i',
      'ò':'o','ó':'o','ỏ':'o','õ':'o','ọ':'o','ô':'o','ồ':'o','ố':'o','ổ':'o','ỗ':'o','ộ':'o','ơ':'o','ờ':'o','ớ':'o','ở':'o','ỡ':'o','ợ':'o',
      'ù':'u','ú':'u','ủ':'u','ũ':'u','ụ':'u','ư':'u','ừ':'u','ứ':'u','ử':'u','ữ':'u','ự':'u',
      'ỳ':'y','ý':'y','ỷ':'y','ỹ':'y','ỵ':'y','đ':'d',
      'À':'A','Á':'A','Ả':'A','Ã':'A','Ạ':'A','Ă':'A','Ằ':'A','Ắ':'A','Ẳ':'A','Ẵ':'A','Ặ':'A','Â':'A','Ầ':'A','Ấ':'A','Ẩ':'A','Ẫ':'A','Ậ':'A',
      'È':'E','É':'E','Ẻ':'E','Ẽ':'E','Ẹ':'E','Ê':'E','Ề':'E','Ế':'E','Ể':'E','Ễ':'E','Ệ':'E',
      'Ì':'I','Í':'I','Ỉ':'I','Ĩ':'I','Ị':'I',
      'Ò':'O','Ó':'O','Ỏ':'O','Õ':'O','Ọ':'O','Ô':'O','Ồ':'O','Ố':'O','Ổ':'O','Ỗ':'O','Ộ':'O','Ơ':'O','Ờ':'O','Ớ':'O','Ở':'O','Ỡ':'O','Ợ':'O',
      'Ù':'U','Ú':'U','Ủ':'U','Ũ':'U','Ụ':'U','Ư':'U','Ừ':'U','Ứ':'U','Ử':'U','Ữ':'U','Ự':'U',
      'Ỳ':'Y','Ý':'Y','Ỷ':'Y','Ỹ':'Y','Ỵ':'Y','Đ':'D'
    };
    return str.replace(/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]/g, function(c) { return map[c] || c; });
  }

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

  function loadScriptOnce(url) {
    return new Promise(function (resolve) {
      if (!url) return resolve(false);
      try {
        window.DAOP = window.DAOP || {};
        window.DAOP._loadedScripts = window.DAOP._loadedScripts || {};
        if (window.DAOP._loadedScripts[url]) return resolve(true);
        var s = document.createElement('script');
        s.src = url;
        s.onload = function () {
          window.DAOP._loadedScripts[url] = true;
          resolve(true);
        };
        s.onerror = function () { resolve(false); };
        document.head.appendChild(s);
      } catch (e) {
        resolve(false);
      }
    });
  }

  function pickQueryTokens(q) {
    var t = normalizeShardText(q);
    if (!t) return [];
    t = t.replace(/[^a-z0-9]+/g, ' ').trim();
    if (!t) return [];
    var parts = t.split(/\s+/).filter(Boolean);
    // ưu tiên token dài hơn để giảm số item
    parts.sort(function (a, b) { return (b.length || 0) - (a.length || 0); });
    return parts.slice(0, 3);
  }

  function unionUniqueBySlugId(lists, limit) {
    var out = [];
    var seen = {};
    (lists || []).forEach(function (arr) {
      (arr || []).forEach(function (m) {
        if (!m) return;
        var k = (m.slug || m.id) ? String(m.slug || m.id) : '';
        if (!k || seen[k]) return;
        seen[k] = true;
        out.push(m);
      });
    });
    if (limit && out.length > limit) out = out.slice(0, limit);
    return out;
  }

  function loadSearchShardByKey(key) {
    var baseUrl = (window.DAOP && window.DAOP.basePath) || '';
    window.DAOP = window.DAOP || {};
    if (!window.DAOP._searchPrefixMetaPromise) {
      window.DAOP._searchPrefixMetaPromise = fetch(baseUrl + '/data/search/prefix/meta.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    }
    return window.DAOP._searchPrefixMetaPromise.then(function (meta) {
      var parts = 1;
      try {
        parts = meta && meta.parts && meta.parts[key] ? parseInt(meta.parts[key], 10) : 1;
        if (!isFinite(parts) || parts < 1) parts = 1;
      } catch (e0) { parts = 1; }

      var base = baseUrl + '/data/search/prefix/' + key;
      var loads;
      if (parts <= 1) {
        loads = [loadScriptOnce(base + '.js')];
      } else {
        loads = [];
        for (var p = 0; p < parts; p++) loads.push(loadScriptOnce(base + '.' + p + '.js'));
      }
      return Promise.all(loads).then(function () {
        try {
          return window.DAOP && window.DAOP.searchPrefix ? (window.DAOP.searchPrefix[key] || []) : [];
        } catch (e1) {
          return [];
        }
      });
    });
  }

  function searchContainsOnList(list, qLower) {
    var q = (qLower || '').trim();
    if (!q) return [];
    var qUnsigned = removeVietnameseTones(q);
    return (list || []).filter(function (m) {
      var text = ((m._t) || ((m.title || '') + ' ' + (m.origin_name || '') + ' ' + (m.slug || ''))).toLowerCase();
      if (text.indexOf(q) >= 0) return true;
      var textU = removeVietnameseTones(text);
      return textU.indexOf(qUnsigned) >= 0;
    });
  }

  function loadSettings() {
    return fetch(((window.DAOP && window.DAOP.basePath) || '') + '/data/config/site-settings.json')
      .then(function (r) { return r.json(); })
      .catch(function () { return {}; })
      .then(function (s) {
        var extra = parseInt(s.category_grid_columns_extra || s.grid_columns_extra || '8', 10);
        if ([6, 8, 10, 12, 14, 16].indexOf(extra) < 0) extra = 8;
        gridColumnsExtra = extra;
        gridColumnsOptions = [2, 3, 4, extra];
        var w = window.innerWidth || document.documentElement.clientWidth;
        var xs = parseInt(s.category_grid_cols_xs || s.default_grid_cols_xs || '2', 10);
        var sm = parseInt(s.category_grid_cols_sm || s.default_grid_cols_sm || '3', 10);
        var md = parseInt(s.category_grid_cols_md || s.default_grid_cols_md || '4', 10);
        var lg = parseInt(s.category_grid_cols_lg || s.default_grid_cols_lg || '6', 10);
        gridCols = w >= 1024 ? lg : w >= 768 ? md : w >= 480 ? sm : xs;
        if (gridColumnsOptions.indexOf(gridCols) < 0) gridCols = gridColumnsOptions[0];
        usePoster = (s.category_use_poster || s.default_use_poster || 'thumb') === 'poster';
      });
  }

  function buildIndex() {
    var list = window.moviesLight || [];
    if (!list.length) return null;
    if (typeof FlexSearch !== 'undefined' && FlexSearch.Index) {
      try {
        var idx = new FlexSearch.Index({ tokenize: 'forward', charset: 'latin:extra' });
        var idxUnsigned = new FlexSearch.Index({ tokenize: 'forward', charset: 'latin:extra' });
        list.forEach(function (m, i) {
          var text = ((m.title || '') + ' ' + (m.origin_name || '') + ' ' + (m.slug || '')).toLowerCase();
          idx.add(i, text);
          idxUnsigned.add(i, removeVietnameseTones(text));
        });
        return { index: idx, indexUnsigned: idxUnsigned, list: list, useFlexSearch: true };
      } catch (e) {
        console.warn('FlexSearch index build failed:', e);
      }
    }
    return { index: null, indexUnsigned: null, list: list, useFlexSearch: false };
  }

  function searchFallback(list, q) {
    var qLow = q.toLowerCase();
    var qUnsigned = removeVietnameseTones(qLow);
    return list.filter(function (m) {
      var title = (m.title || '').toLowerCase();
      var origin = (m.origin_name || '').toLowerCase();
      var slug = (m.slug || '').toLowerCase();
      var titleU = removeVietnameseTones(title);
      var originU = removeVietnameseTones(origin);
      var slugU = removeVietnameseTones(slug);
      return title.indexOf(qLow) >= 0 || origin.indexOf(qLow) >= 0 || slug.indexOf(qLow) >= 0 ||
             titleU.indexOf(qUnsigned) >= 0 || originU.indexOf(qUnsigned) >= 0 || slugU.indexOf(qUnsigned) >= 0;
    }).slice(0, 50);
  }

  function exactContains(m, qLower) {
    if (!m) return false;
    var q = (qLower || '').trim();
    if (!q) return true;
    var text = ((m.title || '') + ' ' + (m.origin_name || '') + ' ' + (m.slug || '')).toLowerCase();
    if (text.indexOf(q) >= 0) return true;
    var textU = removeVietnameseTones(text);
    var qU = removeVietnameseTones(q);
    return textU.indexOf(qU) >= 0;
  }

  function doSearch(q) {
    q = (q || '').trim();
    if (!q.length) {
      if (resultsEl) resultsEl.innerHTML = '';
      return;
    }
    var qLower = q.toLowerCase();

    // Nếu có moviesLight (dataset nhỏ) thì giữ logic cũ.
    if (window.moviesLight && Array.isArray(window.moviesLight) && window.moviesLight.length) {
      if (!index) index = buildIndex();
      if (!index) return;
      var list;
      if (index.useFlexSearch && index.index) {
        try {
          var ids = index.index.search(qLower, 50);
          if (!Array.isArray(ids)) ids = [];
          var qUnsigned = removeVietnameseTones(qLower);
          var idsU = index.indexUnsigned ? index.indexUnsigned.search(qUnsigned, 50) : [];
          if (!Array.isArray(idsU)) idsU = [];

          var seen = {};
          var ordered = [];
          function pushUnique(arr) {
            arr.forEach(function (i) {
              if (i == null) return;
              var k = String(i);
              if (seen[k]) return;
              seen[k] = true;
              ordered.push(i);
            });
          }
          pushUnique(ids);
          pushUnique(idsU);

          ordered = ordered
            .map(Number)
            .filter(function (i) { return i >= 0 && i < index.list.length; });
          list = ordered.map(function (i) { return index.list[i]; }).filter(Boolean);
          list = list.filter(function (m) { return exactContains(m, qLower); });
          if (list.length > 50) list = list.slice(0, 50);
        } catch (e) {
          list = searchFallback(index.list, qLower);
        }
      } else {
        list = searchFallback(index.list, qLower);
      }
      renderResults(list);
      return;
    }

    // Dataset lớn: dùng shard prefix.
    var tokens = pickQueryTokens(qLower);
    if (!tokens.length) {
      renderResults([]);
      return;
    }
    var keys = Array.from(new Set(tokens.map(getShardKey2)));
    Promise.all(keys.map(loadSearchShardByKey))
      .then(function (arrs) {
        var merged = unionUniqueBySlugId(arrs);
        var filtered = searchContainsOnList(merged, qLower);
        if (filtered.length > 50) filtered = filtered.slice(0, 50);
        renderResults(filtered);
      })
      .catch(function () {
        renderResults([]);
      });
  }

  function renderResults(list) {
    if (!resultsEl) return;
    currentList = list;
    if (!list.length) {
      resultsEl.innerHTML = '<p>Không tìm thấy kết quả.</p>';
      gridElRef.el = null;
      return;
    }
    var render = (window.DAOP && window.DAOP.renderMovieCard);
    if (!render) {
      resultsEl.innerHTML = '<p>Lỗi: không thể hiển thị kết quả.</p>';
      return;
    }
    var baseUrl = (window.DAOP && window.DAOP.basePath) || '';
    var grid = document.createElement('div');
    grid.className = 'movies-grid movies-grid--cols-' + gridCols;
    grid.innerHTML = list.map(function (m) { return render(m, baseUrl, { usePoster: usePoster }); }).join('');
    gridElRef.el = grid;
    var toolbar = resultsEl.querySelector('.grid-toolbar');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.className = 'grid-toolbar';
      toolbar.setAttribute('aria-label', 'Tùy chọn hiển thị');
      var colPart = '<span class="filter-label">Cột:</span>';
      colPart += '<button type="button" class="grid-cols-btn' + (2 === gridCols ? ' active' : '') + '" data-cols="2">2</button><button type="button" class="grid-cols-btn' + (3 === gridCols ? ' active' : '') + '" data-cols="3">3</button><button type="button" class="grid-cols-btn' + (4 === gridCols ? ' active' : '') + '" data-cols="4">4</button>';
      colPart += '<select class="grid-cols-select" id="search-cols-extra"><option value="6"' + (gridColumnsExtra === 6 ? ' selected' : '') + '>6</option><option value="8"' + (gridColumnsExtra === 8 ? ' selected' : '') + '>8</option><option value="10"' + (gridColumnsExtra === 10 ? ' selected' : '') + '>10</option><option value="12"' + (gridColumnsExtra === 12 ? ' selected' : '') + '>12</option><option value="14"' + (gridColumnsExtra === 14 ? ' selected' : '') + '>14</option><option value="16"' + (gridColumnsExtra === 16 ? ' selected' : '') + '>16</option></select>';
      colPart += '<button type="button" class="grid-cols-btn' + (gridColumnsExtra === gridCols ? ' active' : '') + '" data-cols="' + gridColumnsExtra + '" id="search-cols-extra-btn">' + gridColumnsExtra + '</button>';
      colPart += '<label class="grid-poster-toggle"><span class="filter-label">Ảnh:</span><select class="grid-poster-select" name="use_poster"><option value="thumb"' + (!usePoster ? ' selected' : '') + '>Thumb</option><option value="poster"' + (usePoster ? ' selected' : '') + '>Poster</option></select></label>';
      toolbar.innerHTML = colPart;
      toolbar.querySelectorAll('.grid-cols-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          gridCols = parseInt(btn.getAttribute('data-cols'), 10);
          if (gridElRef.el) gridElRef.el.className = 'movies-grid movies-grid--cols-' + gridCols;
          toolbar.querySelectorAll('.grid-cols-btn').forEach(function (b) { b.classList.toggle('active', parseInt(b.getAttribute('data-cols'), 10) === gridCols); });
        });
      });
      var exSel = toolbar.querySelector('#search-cols-extra');
      var exBtn = toolbar.querySelector('#search-cols-extra-btn');
      if (exSel && exBtn) {
        exSel.addEventListener('change', function () {
          var oldExtra = gridColumnsExtra;
          gridColumnsExtra = parseInt(exSel.value, 10);
          exBtn.textContent = gridColumnsExtra;
          exBtn.setAttribute('data-cols', gridColumnsExtra);
          if (gridCols === oldExtra) gridCols = gridColumnsExtra;
          if (gridElRef.el) gridElRef.el.className = 'movies-grid movies-grid--cols-' + gridCols;
          toolbar.querySelectorAll('.grid-cols-btn').forEach(function (b) { b.classList.toggle('active', parseInt(b.getAttribute('data-cols'), 10) === gridCols); });
        });
      }
      toolbar.querySelector('.grid-poster-select').addEventListener('change', function () {
        usePoster = this.value === 'poster';
        if (gridElRef.el && currentList.length) {
          gridElRef.el.innerHTML = currentList.map(function (m) { return render(m, baseUrl, { usePoster: usePoster }); }).join('');
        }
      });
      resultsEl.innerHTML = '';
      resultsEl.appendChild(toolbar);
    } else {
      toolbar.querySelectorAll('.grid-cols-btn').forEach(function (b) { b.classList.toggle('active', parseInt(b.getAttribute('data-cols'), 10) === gridCols); });
      var posterSel = toolbar.querySelector('.grid-poster-select');
      if (posterSel) posterSel.value = usePoster ? 'poster' : 'thumb';
      var oldGrid = resultsEl.querySelector('.movies-grid');
      if (oldGrid) resultsEl.removeChild(oldGrid);
    }
    resultsEl.appendChild(grid);
  }

  function init() {
    loadSettings().then(function () {
      var liveTimer = null;
      function run() {
        if (!searchInput) return;
        doSearch(searchInput.value);
      }
      if (searchInput) {
        searchInput.addEventListener('input', function () {
          if (liveTimer) clearTimeout(liveTimer);
          liveTimer = setTimeout(function () {
            run();
          }, 150);
        });
        searchInput.addEventListener('keypress', function (e) {
          if (e.key === 'Enter') run();
        });
      }
      if (searchBtn) {
        searchBtn.addEventListener('click', function () {
          run();
        });
      }
      var params = new URLSearchParams(window.location.search);
      var q = params.get('q');
      if (q && searchInput) {
        searchInput.value = q;
        doSearch(q);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
