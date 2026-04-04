<<<<<<< HEAD
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
    if (window.DAOP && typeof window.DAOP.ensureSiteSettingsLoaded === 'function') {
      return window.DAOP.ensureSiteSettingsLoaded().then(function (s) {
        window.DAOP = window.DAOP || {};
        window.DAOP.siteSettings = s || {};
        if (window.DAOP.applySiteSettings) window.DAOP.applySiteSettings(window.DAOP.siteSettings);
        return window.DAOP.siteSettings;
      });
    }
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
          var baseUrl = (window.DAOP && window.DAOP.basePath) || '';
          var defaultImg = baseUrl + '/images/default_thumb.png';
          if (!defaultImg) defaultImg = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="96" height="64"%3E%3Crect fill="%2321262d" width="96" height="64"/%3E%3C/svg%3E';

          var poster = (m && m.thumb) ? String(m.thumb) : ((m && m.poster) ? String(m.poster) : '');
          if (!poster) poster = defaultImg;
          var posterEsc = safeText(poster).replace(/"/g, '&quot;');
          var dEsc = String(defaultImg || '').replace(/'/g, '%27');

          var html = '' +
            '<div class="user-history-item">' +
            '  <a class="user-history-thumb" href="' + href + '"><img loading="lazy" decoding="async" src="' + posterEsc + '" onerror="this.onerror=null;this.src=\'' + dEsc + '\';" alt="' + title + '"></a>' +
            '  <div class="user-history-meta">' +
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
            var us = window.DAOP && window.DAOP.userSync;
            var hist = null;
            try {
              if (us && typeof us.getWatchHistory === 'function') {
                hist = us.getWatchHistory().find(function (x) { return x && x.slug === slug; }) || null;
              }
            } catch (eHist) {}
            var href = base + '/xem-phim/' + encodeURIComponent(slug) + '.html';
            if (ep) href += '?ep=' + encodeURIComponent(ep);
            if (hist && hist.server) href += (ep ? '&' : '?') + 'sv=' + encodeURIComponent(String(hist.server));
            if (hist && hist.linkType) href += (ep || (hist && hist.server) ? '&' : '?') + 'lt=' + encodeURIComponent(String(hist.linkType));
            if (hist && hist.groupIdx != null && hist.groupIdx !== '') href += (ep || (hist && (hist.server || hist.linkType)) ? '&' : '?') + 'g=' + encodeURIComponent(String(hist.groupIdx));
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
=======
(function(){function E(e){return document.getElementById(e)}var g=E("history-list"),A=E("history-empty"),h=24,u=1,I={el:null};function p(e){return String(e||"").replace(/</g,"&lt;")}function T(){if(!g)return null;var e=g.parentElement;if(!e)return null;var t=e.querySelector("#pagination");return t||(t=document.createElement("div"),t.id="pagination",t.className="pagination",e.appendChild(t)),I.el=t,t}function x(e){var t=T();if(t){var s=Math.max(1,Math.ceil((e||0)/h));if(u>s&&(u=s),u<1&&(u=1),e<=h){t.innerHTML="";return}var l=u,d="";d+='<a href="#" class="pagination-nav" data-page="1" aria-label="V\u1EC1 \u0111\u1EA7u">\xAB</a>',d+='<a href="#" class="pagination-nav" data-page="'+Math.max(1,l-1)+'" aria-label="Tr\u01B0\u1EDBc">\u2039</a>';for(var P=5,y=Math.max(1,Math.min(l-2,s-P+1)),b=Math.min(s,y+P-1),r=y;r<=b;r++)r===l?d+='<span class="current">'+r+"</span>":d+='<a href="#" data-page="'+r+'">'+r+"</a>";d+='<a href="#" class="pagination-nav" data-page="'+Math.min(s,l+1)+'" aria-label="Sau">\u203A</a>',d+='<a href="#" class="pagination-nav" data-page="'+s+'" aria-label="V\u1EC1 cu\u1ED1i">\xBB</a>',d+='<span class="pagination-jump"><input type="number" min="1" max="'+s+'" value="" placeholder="Trang" id="pagination-goto" aria-label="Trang"><button type="button" id="pagination-goto-btn">\u0110\u1EBFn</button></span>',t.innerHTML=d,t.getAttribute("data-bound")!=="1"&&(t.setAttribute("data-bound","1"),t.addEventListener("click",function(a){var n=a.target,i=n&&n.getAttribute?n.getAttribute("data-page"):null;if(i&&(a.preventDefault(),u=Math.max(1,Math.min(s,parseInt(i,10)||1)),m(),window.scrollTo({top:0,behavior:"smooth"})),n&&n.id==="pagination-goto-btn"){a.preventDefault();var w=document.getElementById("pagination-goto");if(w){var c=parseInt(w.value,10);c>=1&&c<=s&&(u=c,m(),window.scrollTo({top:0,behavior:"smooth"}))}}}),t.addEventListener("keydown",function(a){if(a.target&&a.target.id==="pagination-goto"&&a.key==="Enter"){a.preventDefault();var n=document.getElementById("pagination-goto");if(n){var i=parseInt(n.value,10);i>=1&&i<=s&&(u=i,m(),window.scrollTo({top:0,behavior:"smooth"}))}}}))}}function U(){return typeof createClient!="undefined"?createClient:window.supabase&&typeof window.supabase.createClient=="function"?window.supabase.createClient:null}function _(){return U()?Promise.resolve():new Promise(function(e){var t=document.createElement("script");t.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",t.onload=function(){e()},t.onerror=function(){e()},document.head.appendChild(t)})}function W(){return window.DAOP&&window.DAOP.siteSettings?Promise.resolve(window.DAOP.siteSettings):window.DAOP&&typeof window.DAOP.ensureSiteSettingsLoaded=="function"?window.DAOP.ensureSiteSettingsLoaded().then(function(e){return window.DAOP=window.DAOP||{},window.DAOP.siteSettings=e||{},window.DAOP.applySiteSettings&&window.DAOP.applySiteSettings(window.DAOP.siteSettings),window.DAOP.siteSettings}):window.DAOP&&window.DAOP.loadConfig?window.DAOP.loadConfig("site-settings").then(function(e){return window.DAOP=window.DAOP||{},window.DAOP.siteSettings=e||{},window.DAOP.applySiteSettings&&window.DAOP.applySiteSettings(window.DAOP.siteSettings),window.DAOP.siteSettings}):fetch("/data/config/site-settings.json").then(function(e){return e.json()}).catch(function(){return{}}).then(function(e){return window.DAOP=window.DAOP||{},window.DAOP.siteSettings=e||{},window.DAOP.applySiteSettings&&window.DAOP.applySiteSettings(window.DAOP.siteSettings),window.DAOP.siteSettings})}function k(){return Promise.all([W(),_()]).then(function(e){var t=e[0]||{};window.DAOP=window.DAOP||{},window.DAOP.supabaseUserUrl||(window.DAOP.supabaseUserUrl=t.supabase_user_url||""),window.DAOP.supabaseUserAnonKey||(window.DAOP.supabaseUserAnonKey=t.supabase_user_anon_key||"");var s=window.DAOP.supabaseUserUrl,l=window.DAOP.supabaseUserAnonKey,d=U();return!s||!l||!d?null:(window.DAOP._supabaseUser||(window.DAOP._supabaseUser=d(s,l)),window.DAOP._supabaseUser)})}function m(){if(g){g.innerHTML="";var e=window.DAOP&&window.DAOP.userSync;if(e){var t=(e.getWatchHistory?e.getWatchHistory():[]).slice();if(t.sort(function(r,a){var n=Date.parse(r&&r.lastWatched||"")||0,i=Date.parse(a&&a.lastWatched||"")||0;return i-n}),!t.length){A&&(A.style.display="");var s=T();s&&(s.innerHTML="");return}A&&(A.style.display="none"),x(t.length);var l=Math.max(1,Math.ceil(t.length/h));u>l&&(u=l),u<1&&(u=1);var d=(u-1)*h,P=Math.min(t.length,d+h),y=window.DAOP&&typeof window.DAOP.getMovieBySlugAsync=="function"?window.DAOP.getMovieBySlugAsync:function(r){return Promise.resolve(window.DAOP&&window.DAOP.getMovieBySlug?window.DAOP.getMovieBySlug(r):null)};g.innerHTML="<p>\u0110ang t\u1EA3i...</p>";var b=t.slice(d,P);Promise.all(b.map(function(r){return!r||!r.slug?Promise.resolve({h:r,m:null}):y(r.slug).then(function(a){return{h:r,m:a}})})).then(function(r){g.innerHTML="",(r||[]).forEach(function(a){var n=a&&a.h,i=a&&a.m;if(!(!n||!n.slug||!i)){var w=p(i.title||i.name||n.slug),c=p(n.episode||""),o="/phim/"+encodeURIComponent(i.slug||i.id||n.slug)+".html",f=n.lastWatched?p(n.lastWatched):"",v=window.DAOP&&window.DAOP.userSync,S=!1;try{S=!!(v&&v.getFavorites&&v.getFavorites().has(n.slug))}catch(F){}var B=window.DAOP&&window.DAOP.basePath||"",D=B+"/images/default_thumb.png";D||(D='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="96" height="64"%3E%3Crect fill="%2321262d" width="96" height="64"/%3E%3C/svg%3E');var M=window.DAOP&&window.DAOP.siteSettings?window.DAOP.siteSettings:null,O=M&&M.r2_img_domain?String(M.r2_img_domain):"";O=O.replace(/\/$/,"");var L=i&&i.id!=null?String(i.id):"",C=O&&L?O+"/thumbs/"+L+".webp":"";C||(C=D);var R=p(C).replace(/"/g,"&quot;"),j=String(D||"").replace(/'/g,"%27"),q='<div class="user-history-item">  <a class="user-history-thumb" href="'+o+'"><img loading="lazy" decoding="async" src="'+R+`" onerror="this.onerror=null;this.src='`+j+`';" alt="`+w+'"></a>  <div class="user-history-meta">    <a class="user-history-title" href="'+o+'">'+w+'</a>    <div class="user-history-meta">T\u1EADp: <strong>'+c+"</strong>"+(f?" \u2022 "+f:"")+'</div>  </div>  <div class="user-history-actions">    <button type="button" class="login-btn login-btn--primary btn-continue" data-slug="'+p(n.slug)+'" data-episode="'+c+'">Xem ti\u1EBFp</button>    <button type="button" class="movie-fav-btn'+(S?" is-fav":"")+'" data-movie-slug="'+p(n.slug)+'" aria-pressed="'+(S?"true":"false")+'" aria-label="Y\xEAu th\xEDch">\u2665</button>    <button type="button" class="login-btn btn-remove" data-slug="'+p(n.slug)+'">X\xF3a</button>  </div></div>';g.insertAdjacentHTML("beforeend",q)}}),g.querySelectorAll(".btn-continue").forEach(function(a){a.addEventListener("click",function(){var n=a.getAttribute("data-slug"),i=a.getAttribute("data-episode"),w=window.DAOP&&window.DAOP.basePath||"";if(n){var c=window.DAOP&&window.DAOP.userSync,o=null;try{c&&typeof c.getWatchHistory=="function"&&(o=c.getWatchHistory().find(function(v){return v&&v.slug===n})||null)}catch(v){}var f=w+"/xem-phim/"+encodeURIComponent(n)+".html";i&&(f+="?ep="+encodeURIComponent(i)),o&&o.server&&(f+=(i?"&":"?")+"sv="+encodeURIComponent(String(o.server))),o&&o.linkType&&(f+=(i||o&&o.server?"&":"?")+"lt="+encodeURIComponent(String(o.linkType))),o&&o.groupIdx!=null&&o.groupIdx!==""&&(f+=(i||o&&(o.server||o.linkType)?"&":"?")+"g="+encodeURIComponent(String(o.groupIdx))),window.location.href=f}})}),g.querySelectorAll(".btn-remove").forEach(function(a){a.addEventListener("click",function(){var n=a.getAttribute("data-slug"),i=window.DAOP&&window.DAOP.userSync;if(!(!n||!i||typeof i.removeWatchHistory!="function")){try{i.removeWatchHistory(n)}catch(c){}try{var w=i.getWatchHistory&&i.getWatchHistory()||[];u>1&&(u-1)*h>=w.length&&(u=Math.max(1,u-1))}catch(c){}m()}})})}).catch(function(){g.innerHTML="<p>Kh\xF4ng th\u1EC3 t\u1EA3i d\u1EEF li\u1EC7u phim.</p>"})}}}function H(){k().then(function(e){if(!e){window.location.href="/login.html";return}e.auth.getSession().then(function(t){var s=t&&t.data&&t.data.session&&t.data.session.user;if(!s){window.location.href="/login.html";return}window.DAOP&&window.DAOP.updateAuthNav&&window.DAOP.updateAuthNav();var l=window.DAOP&&window.DAOP.userSync;l&&typeof l.sync=="function"?l.sync().then(function(){m()}):m()}).catch(function(){window.location.href="/login.html"})})}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",H):H()})();
>>>>>>> 7a1a53319596697de21def577a0b6a2b1f6d732c
