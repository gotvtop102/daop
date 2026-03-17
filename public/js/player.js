/**
 * Player: dùng đúng player do admin chọn (default_player). Mở overlay, pre-roll (nếu có), cảnh báo, lưu tiến trình.
 */
(function () {
  window.DAOP = window.DAOP || {};
  var overlay = null;

  function ensurePlayerSettings(done) {
    try {
      if (window.DAOP && window.DAOP.playerSettings) return done && done();
      if (!window.DAOP || typeof window.DAOP.loadConfig !== 'function') return done && done();
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

  function isDirectVideoLink(url) {
    if (!url) return false;
    var u = String(url);
    // Heuristic an toàn: xem đuôi file, bỏ query + hash
    var clean = u.split('#')[0];
    var qIndex = clean.indexOf('?');
    if (qIndex >= 0) clean = clean.slice(0, qIndex);
    if (/\.(m3u8|mp4|webm|mkv|flv|mov|ogg|ogv)$/i.test(clean)) return true;
    // Giữ lại pattern HLS/stream cũ
    if (/\/stream\//i.test(u) || /\/hls\//i.test(u)) return true;
    return false;
  }

  function attachProgressAndInitPlayer(opts, videoEl, chosenPlayer) {
    if (!videoEl) return;
    var reportTime = function () {
      if (window.DAOP && window.DAOP.userSync && opts.slug && opts.episode && videoEl.currentTime != null) {
        window.DAOP.userSync.updateWatchProgress(opts.slug, opts.episode, Math.floor(videoEl.currentTime));
      }
    };
    videoEl.addEventListener('timeupdate', reportTime);
    if (chosenPlayer === 'plyr' && typeof window.Plyr !== 'undefined') {
      try {
        var plyrInstance = new window.Plyr(videoEl, { controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'fullscreen'] });
        plyrInstance.on('timeupdate', reportTime);
      } catch (e) {}
    } else if (chosenPlayer === 'videojs' && typeof window.videojs !== 'undefined') {
      try {
        window.videojs(videoEl).ready(function () {
          this.on('timeupdate', reportTime);
        });
      } catch (e) {}
    }
  }

  function showMainContent(opts) {
    var link = opts.link;
    var movie = opts.movie || {};
    var playerSettings = window.DAOP?.playerSettings || {};
    var available = playerSettings.available_players && typeof playerSettings.available_players === 'object' ? playerSettings.available_players : {};
    var chosenPlayer = (playerSettings.default_player || 'plyr').toLowerCase();
    var chosenLabel = available[chosenPlayer] || chosenPlayer;
    var safeLink = (link || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    var isDirectStream = isDirectVideoLink(link);
    var playerHtml = !link
      ? '<p>Chưa có link phát.</p>'
      : isDirectStream
        ? '<video id="daop-video" class="video-js" controls playsinline preload="metadata" src="' + safeLink + '"></video>'
        : '<iframe id="daop-embed" src="' + safeLink + '" allowfullscreen allow="autoplay; fullscreen"></iframe>';
    var playerLabelHtml = '<p class="player-label" style="margin:0 0 8px;font-size:0.85rem;color:#8b949e;">Đang dùng: ' + (chosenLabel || chosenPlayer) + '</p>';
    overlay.innerHTML =
      '<button type="button" class="close-player" aria-label="Đóng">Đóng</button>' +
      playerLabelHtml +
      playerHtml;
    var video = document.getElementById('daop-video');
    if (video && isDirectStream && (chosenPlayer === 'plyr' || chosenPlayer === 'videojs')) {
      if (chosenPlayer === 'plyr') {
        loadStylesheet('https://cdn.plyr.io/3.7.8/plyr.css');
        loadScript('https://cdn.plyr.io/3.7.8/plyr.polyfilled.js').then(function () {
          attachProgressAndInitPlayer(opts, document.getElementById('daop-video'), 'plyr');
        }).catch(function () {
          attachProgressAndInitPlayer(opts, document.getElementById('daop-video'), 'native');
        });
      } else if (chosenPlayer === 'videojs') {
        loadStylesheet('https://vjs.zencdn.net/8.10.0/video-js.css');
        loadScript('https://vjs.zencdn.net/8.10.0/video.min.js').then(function () {
          attachProgressAndInitPlayer(opts, document.getElementById('daop-video'), 'videojs');
        }).catch(function () {
          attachProgressAndInitPlayer(opts, document.getElementById('daop-video'), 'native');
        });
      }
    } else if (video) {
      attachProgressAndInitPlayer(opts, video, 'native');
    }
    overlay.querySelector('.close-player').addEventListener('click', function () {
      if (overlay) overlay.remove();
      overlay = null;
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        overlay.remove();
        overlay = null;
      }
    });
  }

  window.DAOP.openPlayer = function (opts) {
    if (window.DAOP?.siteSettings?.player_visible === 'false') return;
    var prerollList = window.DAOP?.prerollList || [];
    var preroll = prerollList.length > 0 ? prerollList[0] : null;

    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.className = 'player-overlay';

    ensurePlayerSettings(function () {

    if (preroll && preroll.video_url) {
      var skipAfter = Math.max(0, parseInt(preroll.skip_after, 10) || 0);
      var safePrerollUrl = (preroll.video_url || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');

      var norm = (window.DAOP && typeof window.DAOP.normalizeImgUrl === 'function')
        ? window.DAOP.normalizeImgUrl
        : function (x) { return x; };
      var normOphim = (window.DAOP && typeof window.DAOP.normalizeImgUrlOphim === 'function')
        ? window.DAOP.normalizeImgUrlOphim
        : function (x) { return x; };
      var baseUrl = (window.DAOP && window.DAOP.basePath) || '';
      var defaultPoster = baseUrl + '/images/default_poster.png';
      var posterRaw = preroll.image_url || '';
      var poster = norm(posterRaw).replace(/^\/\//, 'https://') || defaultPoster;
      var posterOphim = normOphim(posterRaw).replace(/^\/\//, 'https://') || '';
      var safePoster = String(poster || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');

      overlay.innerHTML =
        '<button type="button" class="close-player" aria-label="Đóng">Đóng</button>' +
        '<div class="preroll-wrap">' +
        '<p class="preroll-label">Quảng cáo</p>' +
        '<video id="daop-preroll-video" controls src="' + safePrerollUrl + '" poster="' + safePoster + '"></video>' +
        '<div class="preroll-skip-wrap">' +
        '<button type="button" id="daop-preroll-skip" class="preroll-skip-btn" disabled>Bỏ qua sau <span id="daop-preroll-countdown">' + skipAfter + '</span>s</button>' +
        '</div></div>';
      document.body.appendChild(overlay);

      var prVideo = document.getElementById('daop-preroll-video');
      var skipBtn = document.getElementById('daop-preroll-skip');
      var countEl = document.getElementById('daop-preroll-countdown');
      var countdown = skipAfter;
      var countdownInterval = null;

      // Poster fallback chain (R2 -> OPhim -> default)
      try {
        if (prVideo && poster && posterOphim && posterOphim !== poster) {
          var img = new Image();
          img.onload = function () {};
          img.onerror = function () {
            try {
              prVideo.poster = posterOphim;
              var img2 = new Image();
              img2.onerror = function () {
                try { prVideo.poster = defaultPoster; } catch (e3) {}
              };
              img2.src = posterOphim;
            } catch (e2) {}
          };
          img.src = poster;
        }
      } catch (e0) {}

      var done = function () {
        if (countdownInterval) clearInterval(countdownInterval);
        if (prVideo) {
          prVideo.pause();
          prVideo.removeEventListener('ended', onEnded);
        }
        showMainContent(opts);
      };
      var onEnded = function () { done(); };
      if (prVideo) {
        prVideo.addEventListener('ended', onEnded);
        prVideo.play().catch(function(){});
      }
      if (skipAfter > 0 && skipBtn && countEl) {
        countdownInterval = setInterval(function () {
          countdown--;
          if (countEl) countEl.textContent = countdown;
          if (countdown <= 0) {
            clearInterval(countdownInterval);
            skipBtn.disabled = false;
            skipBtn.textContent = 'Bỏ qua';
          }
        }, 1000);
      } else if (skipBtn) {
        skipBtn.disabled = false;
        skipBtn.textContent = 'Bỏ qua';
      }
      if (skipBtn) skipBtn.addEventListener('click', done);
      overlay.querySelector('.close-player').addEventListener('click', function () {
        if (countdownInterval) clearInterval(countdownInterval);
        if (overlay) overlay.remove();
        overlay = null;
      });
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
          if (countdownInterval) clearInterval(countdownInterval);
          overlay.remove();
          overlay = null;
        }
      });
      return;
    }

    document.body.appendChild(overlay);
    showMainContent(opts);
    });
  };
})();
