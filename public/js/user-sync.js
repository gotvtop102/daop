/**
 * Đồng bộ người dùng: localStorage + Supabase User (favorites, watch history)
 * Delta sync, pending actions khi offline
 */
(function () {
  var STORAGE_KEY = 'daop_user_data';
  var version = 1;

  var _supabaseScriptLoading = null;
  function loadSupabaseJsIfNeeded() {
    if (typeof createClient !== 'undefined') return Promise.resolve();
    if (typeof window.supabase !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') return Promise.resolve();
    if (_supabaseScriptLoading) return _supabaseScriptLoading;
    _supabaseScriptLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = function () { resolve(); };
      s.onerror = function () { resolve(); };
      document.head.appendChild(s);
    });
    return _supabaseScriptLoading;
  }

  function getCreateClient() {
    if (typeof createClient !== 'undefined') return createClient;
    if (typeof window.supabase !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') return window.supabase.createClient;
    return null;
  }

  function getLocal() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { version: 1, lastSync: null, favorites: [], watchHistory: [], deletedHistory: {}, pendingActions: [] };
      var data = JSON.parse(raw);
      data.favorites = data.favorites || [];
      data.watchHistory = data.watchHistory || [];
      data.deletedHistory = data.deletedHistory || {};
      data.pendingActions = data.pendingActions || [];
      return data;
    } catch (e) {
      return { version: 1, lastSync: null, favorites: [], watchHistory: [], deletedHistory: {}, pendingActions: [] };
    }
  }

  function setLocal(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  window.DAOP = window.DAOP || {};
  window.DAOP.userSync = {
    getFavorites: function () {
      return new Set(getLocal().favorites);
    },
    addFavorite: function (slug) {
      var data = getLocal();
      if (data.favorites.indexOf(slug) === -1) data.favorites.push(slug);
      data.pendingActions.push({ type: 'add_favorite', payload: { movie_slug: slug }, timestamp: Date.now() });
      setLocal(data);
      this.sync();
    },
    removeFavorite: function (slug) {
      var data = getLocal();
      data.favorites = data.favorites.filter(function (s) { return s !== slug; });
      data.pendingActions.push({ type: 'remove_favorite', payload: { movie_slug: slug }, timestamp: Date.now() });
      setLocal(data);
      this.sync();
    },
    toggleFavorite: function (slug) {
      var fav = this.getFavorites();
      if (fav.has(slug)) this.removeFavorite(slug);
      else this.addFavorite(slug);
      return this.getFavorites().has(slug);
    },
    getWatchHistory: function () {
      return getLocal().watchHistory || [];
    },
    removeWatchHistory: function (slug) {
      var s = String(slug || '').trim();
      if (!s) return;
      var data = getLocal();
      data.watchHistory = (data.watchHistory || []).filter(function (x) { return x && x.slug !== s; });
      data.deletedHistory = data.deletedHistory || {};
      data.deletedHistory[s] = Date.now();
      data.pendingActions.push({ type: 'remove_watch_history', payload: { slug: s }, timestamp: Date.now() });
      setLocal(data);
      this.sync();
    },
    clearWatchHistory: function () {
      var data = getLocal();
      var list = data.watchHistory || [];
      data.deletedHistory = data.deletedHistory || {};
      list.forEach(function (x) {
        if (!x || !x.slug) return;
        data.deletedHistory[x.slug] = Date.now();
        data.pendingActions.push({ type: 'remove_watch_history', payload: { slug: x.slug }, timestamp: Date.now() });
      });
      data.watchHistory = [];
      setLocal(data);
      this.sync();
    },
    updateWatchProgress: function (slug, episode, timestamp, meta) {
      var data = getLocal();
      var list = data.watchHistory || [];
      var idx = list.findIndex(function (x) { return x.slug === slug; });
      meta = meta && typeof meta === 'object' ? meta : {};
      var entry = {
        slug: slug,
        episode: episode,
        timestamp: timestamp,
        lastWatched: new Date().toISOString(),
        server: meta.server || '',
        linkType: meta.linkType || '',
        groupIdx: (meta.groupIdx != null ? meta.groupIdx : null),
      };
      if (idx >= 0) list[idx] = entry;
      else list.push(entry);
      data.watchHistory = list;
      if (data.deletedHistory && data.deletedHistory[slug]) {
        try { delete data.deletedHistory[slug]; } catch (e0) { data.deletedHistory[slug] = 0; }
      }
      data.pendingActions.push({ type: 'watch_progress', payload: entry, timestamp: Date.now() });
      setLocal(data);
      this.sync();
    },
    sync: function () {
      var supabaseUrl = window.DAOP && window.DAOP.supabaseUserUrl;
      var supabaseKey = window.DAOP && window.DAOP.supabaseUserAnonKey;
      if (!supabaseUrl || !supabaseKey) return Promise.resolve();
      var self = this;
      return loadSupabaseJsIfNeeded().then(function () {
        var client = window.DAOP._supabaseUser;
        if (!client) {
          try {
            var cc = getCreateClient();
            if (cc) {
              window.DAOP._supabaseUser = cc(supabaseUrl, supabaseKey);
              client = window.DAOP._supabaseUser;
            }
          } catch (e) { return Promise.resolve(); }
        }
        if (!client) return Promise.resolve();

        return client.auth.getSession().then(function (res) {
          var user = res && res.data && res.data.session && res.data.session.user;
          if (!user) {
            return Promise.resolve();
          }

          var data = getLocal();
          var pending = data.pendingActions || [];
          var uid = user.id;

          function flushPending() {
            if (!pending.length) return Promise.resolve();
            return Promise.all(pending.map(function (action) {
              if (action.type === 'add_favorite') {
                return client.from('favorites').upsert({ user_uid: uid, movie_slug: action.payload.movie_slug }, { onConflict: 'user_uid,movie_slug' });
              }
              if (action.type === 'remove_favorite') {
                return client.from('favorites').delete().eq('user_uid', uid).eq('movie_slug', action.payload.movie_slug);
              }
              if (action.type === 'remove_watch_history') {
                return client.from('watch_history').delete().eq('user_uid', uid).eq('movie_slug', action.payload.slug);
              }
              if (action.type === 'watch_progress') {
                return client.from('watch_history').upsert({
                  user_uid: uid,
                  movie_slug: action.payload.slug,
                  episode: action.payload.episode,
                  timestamp: action.payload.timestamp,
                  last_watched: action.payload.lastWatched,
                }, { onConflict: 'user_uid,movie_slug' });
              }
              return Promise.resolve();
            }));
          }

          function pullCloudAndMerge() {
            return Promise.all([
              client.from('favorites').select('movie_slug').eq('user_uid', uid),
              client.from('watch_history').select('movie_slug,episode,timestamp,last_watched').eq('user_uid', uid),
            ]).then(function (arr) {
              var favRes = arr[0] || {};
              var histRes = arr[1] || {};
              var cloudFav = (favRes.data || []).map(function (x) { return x.movie_slug; }).filter(Boolean);
              var cloudHist = (histRes.data || []).map(function (x) {
                return {
                  slug: x.movie_slug,
                  episode: x.episode,
                  timestamp: x.timestamp,
                  lastWatched: x.last_watched,
                };
              }).filter(function (x) { return x && x.slug; });

              var favSet = new Set((data.favorites || []).concat(cloudFav));
              data.favorites = Array.from(favSet);

              var histMap = {};
              (data.watchHistory || []).forEach(function (h) { if (h && h.slug) histMap[h.slug] = h; });
              var deleted = data.deletedHistory || {};
              cloudHist.forEach(function (h) {
                if (deleted && deleted[h.slug]) return;
                var cur = histMap[h.slug];
                if (!cur) {
                  histMap[h.slug] = h;
                  return;
                }
                var curT = Date.parse(cur.lastWatched || '') || 0;
                var newT = Date.parse(h.lastWatched || '') || 0;
                if (newT >= curT) histMap[h.slug] = Object.assign({}, cur, h);
              });
              data.watchHistory = Object.keys(histMap).map(function (k) { return histMap[k]; });

              data.lastSync = new Date().toISOString();
              setLocal(data);

              // Sau khi merge, nếu local có mục mới mà cloud chưa có thì đẩy lên.
              var pushMissing = [];
              data.favorites.forEach(function (slug) {
                if (cloudFav.indexOf(slug) === -1) {
                  pushMissing.push(client.from('favorites').upsert({ user_uid: uid, movie_slug: slug }, { onConflict: 'user_uid,movie_slug' }));
                }
              });
              data.watchHistory.forEach(function (h) {
                var found = cloudHist.find(function (x) { return x.slug === h.slug; });
                if (!found) {
                  pushMissing.push(client.from('watch_history').upsert({
                    user_uid: uid,
                    movie_slug: h.slug,
                    episode: h.episode,
                    timestamp: h.timestamp,
                    last_watched: h.lastWatched,
                  }, { onConflict: 'user_uid,movie_slug' }));
                }
              });
              return pushMissing.length ? Promise.all(pushMissing).then(function () {}) : Promise.resolve();
            });
          }

          return flushPending().then(function () {
            if (pending.length) {
              data.pendingActions = [];
              setLocal(data);
            }
          }).then(function () {
            return pullCloudAndMerge();
          }).catch(function () {});
        });
      });
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.DAOP.userSync.sync();
    });
  } else {
    window.DAOP.userSync.sync();
  }
})();
