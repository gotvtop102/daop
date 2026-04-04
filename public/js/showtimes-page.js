<<<<<<< HEAD
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

  function getPosterUrl(m, baseUrl) {
    var base = baseUrl || '';
    var defaultPoster = base + '/images/default_poster.png';
    try {
      if (m && m.poster) return String(m.poster);
      if (m && m.thumb) return String(m.thumb);
    } catch (e) {}

    var thumb = (m && m.thumb) ? String(m.thumb) : '';
    if (thumb && window.DAOP && typeof window.DAOP.derivePosterFromThumb === 'function') {
      var p = window.DAOP.derivePosterFromThumb(thumb);
      if (p) return p;
    }
    return thumb || defaultPoster;
  }

  function renderRow(m, baseUrl) {
    var title = (m && (m.title || m.name)) ? String(m.title || m.name) : '';
    var origin = (m && m.origin_name) ? String(m.origin_name) : '';
    var href = baseUrl + '/phim/' + encodeURIComponent(String(m.slug || '')) + '.html';
    var st = (m && m.showtimes) ? String(m.showtimes).trim() : '';
    var status = (m && m.status) ? String(m.status).trim() : '';
    var year = (m && m.year) ? String(m.year).trim() : '';
    var poster = getPosterUrl(m, baseUrl);

    return '' +
      '<a class="showtimes-item" href="' + esc(href) + '">' +
        '<div class="showtimes-item-inner">' +
          '<div class="showtimes-item-cover">' +
            '<img loading="lazy" decoding="async" src="' + esc(poster) + '" alt="" onerror="this.onerror=null;this.src=\'' + esc((baseUrl || '') + '/images/default_poster.png') + '\';">' +
          '</div>' +
        '<div class="showtimes-item-main">' +
          '<div class="showtimes-item-title">' + esc(title) + (origin ? ' <span class="showtimes-item-origin">(' + esc(origin) + ')</span>' : '') + '</div>' +
          '<div class="showtimes-item-meta">' +
            (status ? '<span class="showtimes-badge">' + esc(status) + '</span>' : '') +
            (year ? '<span class="showtimes-year">' + esc(year) + '</span>' : '') +
          '</div>' +
          '<div class="showtimes-item-st">' + esc(st) + '</div>' +
        '</div>' +
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

      var loadDetail = window.DAOP && window.DAOP.loadMovieDetail;
      var getLight = window.DAOP && window.DAOP.getMovieLightByIdAsync;
      var getById = function (id) {
        if (typeof loadDetail === 'function') {
          return new Promise(function (resolve) {
            try {
              loadDetail(id, function (m) { resolve(m || null); });
            } catch (e) {
              resolve(null);
            }
          });
        }
        if (typeof getLight === 'function') return getLight(id);
        return Promise.resolve(null);
      };

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
=======
(function(){function h(t){return t==null||t===""?"":String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function S(t){var e=t&&t.status!=null?String(t.status).trim().toLowerCase():"",r=t&&t.showtimes!=null?String(t.showtimes).trim().toLowerCase():"";if(!e&&!r)return"";var g=e==="trailer"||e.indexOf("trailer")>=0||r.indexOf("s\u1EAFp")>=0||r.indexOf("sap")>=0,l=e.indexOf("\u0111ang")>=0||e.indexOf("dang")>=0||e.indexOf("ongoing")>=0||e.indexOf("current")>=0||e.indexOf("on going")>=0||e.indexOf("c\u1EADp nh\u1EADt")>=0||e.indexOf("cap nhat")>=0;return l?"ongoing":g?"trailer":e||""}function A(t){if(!t)return 0;var e=String(t).trim();if(!e)return 0;var r=Date.parse(e);return isNaN(r)?0:r}function P(t){var e=A(t&&t.modified);if(e)return e;var r=parseInt(t&&t.year,10);return isFinite(r)&&r>1900?r*1e3:0}function y(t){var e=S(t);return e==="ongoing"?0:e==="trailer"?1:2}function I(t,e){var r=e||"",g=r+"/images/default_poster.png";try{var l=window.DAOP&&window.DAOP.siteSettings?window.DAOP.siteSettings:null,o=l&&l.r2_img_domain?String(l.r2_img_domain):"";o=o.replace(/\/$/,"");var n=t&&t.id!=null?String(t.id):"";if(o&&n)return o+"/posters/"+n+".webp"}catch(f){}var p=t&&t.thumb?String(t.thumb):"";if(p&&window.DAOP&&typeof window.DAOP.derivePosterFromThumb=="function"){var v=window.DAOP.derivePosterFromThumb(p);if(v)return v}return p||g}function L(t,e){var r=t&&(t.title||t.name)?String(t.title||t.name):"",g=t&&t.origin_name?String(t.origin_name):"",l=e+"/phim/"+encodeURIComponent(String(t.slug||""))+".html",o=t&&t.showtimes?String(t.showtimes).trim():"",n=t&&t.status?String(t.status).trim():"",p=t&&t.year?String(t.year).trim():"",v=I(t,e);return'<a class="showtimes-item" href="'+h(l)+'"><div class="showtimes-item-inner"><div class="showtimes-item-cover"><img loading="lazy" decoding="async" src="'+h(v)+`" alt="" onerror="this.onerror=null;this.src='`+h((e||"")+"/images/default_poster.png")+`';"></div><div class="showtimes-item-main"><div class="showtimes-item-title">`+h(r)+(g?' <span class="showtimes-item-origin">('+h(g)+")</span>":"")+'</div><div class="showtimes-item-meta">'+(n?'<span class="showtimes-badge">'+h(n)+"</span>":"")+(p?'<span class="showtimes-year">'+h(p)+"</span>":"")+'</div><div class="showtimes-item-st">'+h(o)+"</div></div></div></a>"}function T(t,e,r){if(t){var g=e,l=r||1,o="";o+='<a href="#" class="pagination-nav" data-page="1" aria-label="V\u1EC1 \u0111\u1EA7u">\xAB</a>',o+='<a href="#" class="pagination-nav" data-page="'+Math.max(1,g-1)+'" aria-label="Tr\u01B0\u1EDBc">\u2039</a>';for(var n=5,p=Math.max(1,Math.min(g-2,l-n+1)),v=Math.min(l,p+n-1),f=p;f<=v;f++)f===g?o+='<span class="current">'+f+"</span>":o+='<a href="#" data-page="'+f+'">'+f+"</a>";o+='<a href="#" class="pagination-nav" data-page="'+Math.min(l,g+1)+'" aria-label="Sau">\u203A</a>',o+='<a href="#" class="pagination-nav" data-page="'+l+'" aria-label="V\u1EC1 cu\u1ED1i">\xBB</a>',o+='<span class="pagination-jump"><input type="number" min="1" max="'+l+'" value="" placeholder="Trang" id="pagination-goto" aria-label="Trang"><button type="button" id="pagination-goto-btn">\u0110\u1EBFn</button></span>',t.innerHTML=o}}function M(){var t=window.DAOP&&window.DAOP.basePath||"",e=document.getElementById("showtimes-list"),r=document.getElementById("pagination"),g=document.getElementById("showtimes-toolbar");g&&(g.innerHTML='<div class="showtimes-toolbar-inner"><label class="showtimes-perpage">Hi\u1EC3n th\u1ECB: <select id="showtimes-perpage"><option value="20">20</option><option value="30" selected>30</option><option value="50">50</option></select></label></div>');var l=window.filtersData||{},o=l&&Array.isArray(l.showtimesIds)?l.showtimesIds.slice(0):[];if(!o.length){e&&(e.innerHTML="<p>Kh\xF4ng c\xF3 phim n\xE0o c\xF3 l\u1ECBch chi\u1EBFu.</p>"),r&&(r.innerHTML="");return}var n={perPage:30,currentPage:1,ids:o.map(function(s){return String(s)}),cache:{},sortedMovies:[]};function p(s){return s.sort(function(a,u){var i=y(a),c=y(u);if(i!==c)return i-c;var d=P(a),m=P(u);if(d!==m)return m-d;var b=parseInt(a&&a.year,10)||0,O=parseInt(u&&u.year,10)||0;return b!==O?O-b:String(a&&a.title||"").localeCompare(String(u&&u.title||""))}),s}function v(){if(e){var s=Math.ceil(n.sortedMovies.length/n.perPage)||1;n.currentPage=Math.max(1,Math.min(n.currentPage,s));var a=(n.currentPage-1)*n.perPage,u=n.sortedMovies.slice(a,a+n.perPage);e.innerHTML=u.map(function(i){return L(i,t)}).join("")||"<p>Kh\xF4ng c\xF3 phim n\xE0o.</p>",T(r,n.currentPage,s);try{window.scrollTo({top:0,behavior:"smooth"})}catch(i){}}}function f(){if(e){e.innerHTML="<p>\u0110ang t\u1EA3i...</p>";var s=window.DAOP&&window.DAOP.loadMovieDetail,a=window.DAOP&&window.DAOP.getMovieLightByIdAsync,u=function(i){return typeof s=="function"?new Promise(function(c){try{s(i,function(d){c(d||null)})}catch(d){c(null)}}):typeof a=="function"?a(i):Promise.resolve(null)};if(typeof u!="function"){e.innerHTML="<p>Kh\xF4ng th\u1EC3 t\u1EA3i d\u1EEF li\u1EC7u phim.</p>";return}Promise.all(n.ids.map(function(i){return n.cache[i]?Promise.resolve(n.cache[i]):u(i).then(function(c){return c&&c.showtimes&&(n.cache[i]=c),c}).catch(function(){return null})})).then(function(i){var c=(i||[]).filter(function(d){var m=d&&d.showtimes!=null?String(d.showtimes).trim():"";return!!m});n.sortedMovies=p(c),v()}).catch(function(){e.innerHTML="<p>Kh\xF4ng th\u1EC3 t\u1EA3i d\u1EEF li\u1EC7u phim.</p>"})}}if(g){var w=document.getElementById("showtimes-perpage");w&&w.addEventListener("change",function(){n.perPage=parseInt(w.value,10)||30,n.currentPage=1,v()})}r&&(r.addEventListener("click",function(s){s.preventDefault();var a=s.target,u=a&&a.getAttribute?a.getAttribute("data-page"):"";if(u){n.currentPage=parseInt(u,10)||1,v();return}if(a&&a.id==="pagination-goto-btn"){var i=document.getElementById("pagination-goto");if(i){var c=Math.ceil(n.sortedMovies.length/n.perPage)||1,d=parseInt(i.value,10);d>=1&&d<=c&&(n.currentPage=d,v())}}}),r.addEventListener("keydown",function(s){if(s.target&&s.target.id==="pagination-goto"&&s.key==="Enter"){s.preventDefault();var a=document.getElementById("pagination-goto");if(a){var u=Math.ceil(n.sortedMovies.length/n.perPage)||1,i=parseInt(a.value,10);i>=1&&i<=u&&(n.currentPage=i,v())}}})),f()}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",M):M()})();
>>>>>>> 7a1a53319596697de21def577a0b6a2b1f6d732c
