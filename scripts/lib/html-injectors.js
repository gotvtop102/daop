import fs from 'fs-extra';
import path from 'path';

function walkHtmlFiles(publicDir, onFile) {
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.html')) onFile(full);
    }
  }
  walk(publicDir);
}

export function removeMoviesLightScriptFromHtml(opts) {
  const publicDir = opts && opts.publicDir ? opts.publicDir : path.join(opts.rootDir, 'public');
  let count = 0;
  walkHtmlFiles(publicDir, (full) => {
    let content = fs.readFileSync(full, 'utf8');
    const orig = content;
    content = content.replace(/\s*<script\s+[^>]*src\s*=\s*"[^\"]*\/data\/movies-light\.js"[^>]*><\/script>\s*/gi, '\n');
    if (content !== orig) {
      fs.writeFileSync(full, content, 'utf8');
      count++;
    }
  });
  if (opts && opts.log !== false) console.log('   Removed movies-light.js script tag from HTML files (' + count + ' files)');
  return count;
}

export function injectSiteNameIntoHtml(opts) {
  const rootDir = opts.rootDir;
  const publicDataDir = opts.publicDataDir;
  const publicDir = opts && opts.publicDir ? opts.publicDir : path.join(rootDir, 'public');
  const configDir = path.join(publicDataDir, 'config');
  const siteSettingsPath = path.join(configDir, 'site-settings.json');
  if (!fs.existsSync(siteSettingsPath)) return 0;

  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(siteSettingsPath, 'utf8'));
  } catch {
    return 0;
  }
  const siteName = settings.site_name || 'DAOP Phim';
  if (siteName === 'DAOP Phim') return 0;

  let count = 0;
  walkHtmlFiles(publicDir, (full) => {
    let content = fs.readFileSync(full, 'utf8');
    const orig = content;
    content = content.replace(/DAOP Phim/g, siteName);
    if (content !== orig) {
      fs.writeFileSync(full, content, 'utf8');
      count++;
    }
  });

  if (opts && opts.log !== false) console.log('   Injected site_name "' + siteName + '" into HTML files (' + count + ' files)');
  return count;
}

export function injectFooterIntoHtml(opts) {
  const publicDir = opts && opts.publicDir ? opts.publicDir : path.join(opts.rootDir, 'public');
  const flagSvg = '<span class="footer-flag" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20" preserveAspectRatio="xMidYMid meet"><rect width="30" height="20" fill="#DA251D"/><path fill="#FFFF00" d="M15 4l2.47 7.6H25l-6.23 4.5 2.36 7.3L15 16.2l-6.13 4.2 2.36-7.3L5 11.6h7.53z"/></svg></span>';
  const newFooterInner = [
    '<div class="footer-vietnam-wrap"><div class="footer-vietnam-banner">' + flagSvg + ' Trường Sa &amp; Hoàng Sa là của Việt Nam!</div></div>',
    '<div class="footer-bottom">',
    '  <div class="footer-bottom-inner">',
    '    <a href="/" class="footer-logo">GoTV<span class="footer-logo-text">GoTV - Trang tổng hợp phim, video, chương trình, tư liệu giải trí đỉnh cao.</span></a>',
    '    <span class="footer-divider" aria-hidden="true"></span>',
    '    <div class="footer-links-col">',
    '      <a href="/hoi-dap.html">Hỏi - đáp</a>',
    '      <a href="/chinh-sach-bao-mat.html">Chính sách bảo mật</a>',
    '      <a href="/dieu-khoan-su-dung.html">Điều khoản sử dụng</a>',
    '    </div>',
    '  </div>',
    '</div>',
    '<p class="footer-copyright">Copyright 2018 <a href="https://gotv.top" target="_blank" rel="noopener">GoTV</a>. All rights reserved.</p>',
  ].join('\n    ');

  let count = 0;
  walkHtmlFiles(publicDir, (full) => {
    let content = fs.readFileSync(full, 'utf8');
    const orig = content;
    content = content.replace(/Trường Sa,\s*Hoàng Sa/gi, 'Trường Sa & Hoàng Sa');
    content = content.replace(/<p>\s*<a[^>]*href="[^"]*donate[^"]*"[^>]*>Donate<\/a>\s*<\/p>\s*/gi, '');
    content = content.replace(/<p[^>]*class="footer-tmdb"[^>]*>[\s\S]*?<\/p>\s*/i, '');
    content = content.replace(/<p>[\s\S]*?Dữ liệu phim có thể từ TMDB[\s\S]*?<\/p>\s*/i, '');
    if (content.includes('footer-flag')) {
      content = content.replace(/<span class="footer-flag"[^>]*>[\s\S]*?<\/span>/gi, flagSvg);
    }
    if (content.includes('site-footer') && !content.includes('footer-vietnam-banner')) {
      content = content.replace(
        /<footer[^>]*class="site-footer"[^>]*>[\s\S]*?<\/footer>/i,
        '<footer class="site-footer">\n    ' + newFooterInner + '\n  </footer>'
      );
    }
    if (content.includes('footer-vietnam-banner') && !content.includes('footer-vietnam-wrap')) {
      content = content.replace(
        /<div class="footer-vietnam-banner">/i,
        '<div class="footer-vietnam-wrap"><div class="footer-vietnam-banner">'
      );
      content = content.replace(
        /(<div class="footer-vietnam-wrap"><div class="footer-vietnam-banner">[\s\S]*?)<\/div>\s*(<div class="footer-bottom">)/i,
        '$1</div></div>\n    $2'
      );
    }
    if (content.includes('footer-bottom') && !content.includes('footer-bottom-inner')) {
      const oldBottom = /<div class="footer-bottom">\s*<a href="[^"]*" class="footer-logo">[^<]*<\/a>\s*<div class="footer-links-col">[\s\S]*?<\/div>\s*<\/div>/i;
      const newBottom = [
        '<div class="footer-bottom">',
        '  <div class="footer-bottom-inner">',
        '    <a href="/" class="footer-logo">GoTV<span class="footer-logo-text">GoTV - Trang tổng hợp phim, video, chương trình, tư liệu giải trí đỉnh cao.</span></a>',
        '    <span class="footer-divider" aria-hidden="true"></span>',
        '    <div class="footer-links-col">',
        '      <a href="/hoi-dap.html">Hỏi - đáp</a>',
        '      <a href="/chinh-sach-bao-mat.html">Chính sách bảo mật</a>',
        '      <a href="/dieu-khoan-su-dung.html">Điều khoản sử dụng</a>',
        '    </div>',
        '  </div>',
        '</div>',
      ].join('\n    ');
      content = content.replace(oldBottom, newBottom);
    }
    if (content.includes('site-footer') && !content.includes('footer-copyright')) {
      const footerClose = content.match(/<\/footer>/i);
      if (footerClose) {
        content = content.replace(
          /\s*<\/footer>/i,
          '\n    <p class="footer-copyright">Copyright 2018 <a href="https://gotv.top" target="_blank" rel="noopener">GoTV</a>. All rights reserved.</p>\n  </footer>'
        );
      }
    }
    if (content.includes('footer-bottom') && !content.includes('footer-copyright') && content.includes('site-footer')) {
      const footerClose = content.match(/<\/footer>/i);
      if (footerClose) {
        content = content.replace(
          /(<\/div>\s*<\/div>\s*)(<\/footer>)/i,
          '$1<p class="footer-copyright">Copyright 2018 <a href="https://gotv.top" target="_blank" rel="noopener">GoTV</a>. All rights reserved.</p>\n  $2'
        );
      }
    }

    if (content !== orig) {
      fs.writeFileSync(full, content, 'utf8');
      count++;
    }
  });

  if (opts && opts.log !== false) console.log('   Injected footer into HTML files (' + count + ' files)');
  return count;
}

export function injectNavIntoHtml(opts) {
  const publicDir = opts && opts.publicDir ? opts.publicDir : path.join(opts.rootDir, 'public');
  let count = 0;
  walkHtmlFiles(publicDir, (full) => {
    let content = fs.readFileSync(full, 'utf8');
    const orig = content;
    // Chuẩn hóa nhãn menu /chu-de/ từ "Danh sách" -> "Chủ đề"
    content = content
      .replace(/(<a[^>]*href="\/chu-de\/"[^>]*>)\s*Danh sách\s*(<\/a>)/gi, '$1Chủ đề$2')
      .replace(/(<a[^>]*href="\.\.\/chu-de\/"[^>]*>)\s*Danh sách\s*(<\/a>)/gi, '$1Chủ đề$2');

    if (!content.includes('huong-dan-app')) {
      const prefix = content.includes('href="../') ? 'href="../' : 'href="/';
      const taiApp = '<a ' + prefix + 'huong-dan-app.html">Tải app</a>';
      const lienHe = '<a ' + prefix + 'lien-he.html">Liên hệ</a>';
      const added = taiApp + lienHe;
      if (content.includes('donate')) {
        content = content.replace(/(<a [^>]*donate[^"']*"[^>]*>Donate<\/a>)/i, '$1' + added);
      } else if (content.includes('gioi-thieu')) {
        content = content.replace(/(<a [^>]*gioi-thieu[^"']*"[^>]*>Giới thiệu<\/a>)/i, '$1' + added);
      }
    }
    if (content !== orig) {
      fs.writeFileSync(full, content, 'utf8');
      count++;
    }
  });

  if (opts && opts.log !== false) console.log('   Injected nav (Tải app, Liên hệ) into HTML files (' + count + ' files)');
  return count;
}

export function injectLoadingScreenIntoHtml(opts) {
  const publicDir = opts && opts.publicDir ? opts.publicDir : path.join(opts.rootDir, 'public');
  const loadingHtml = '<div id="loading-screen" class="loading-screen" aria-hidden="false"><div class="loading-screen-inner"><div class="loading-screen-logo">GoTV</div><p class="loading-screen-text">Loading...</p></div></div>';
  let count = 0;
  walkHtmlFiles(publicDir, (full) => {
    let content = fs.readFileSync(full, 'utf8');
    if (content.includes('id="loading-screen"')) return;
    const next = content.replace(/<body(\s[^>]*)?>/i, '<body$1>\n  ' + loadingHtml);
    if (next !== content) {
      fs.writeFileSync(full, next, 'utf8');
      count++;
    }
  });
  if (opts && opts.log !== false) console.log('   Injected loading screen into HTML files (' + count + ' files)');
  return count;
}

function escapeHtmlAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/**
 * Gắn <link rel="preconnect"> + <link rel="preload" as="image"> cho slide đầu trang chủ trong <head>,
 * để Lighthouse “LCP request discovery” thấy ngay (không phụ thuộc JS injectPreloadLcp).
 * Chạy sau khi đã có site-settings.json + homepage-slider-auto.json (ví dụ sau writeHomeBootstrapFile).
 */
export function injectHomeLcpPreloadIntoHtml(opts) {
  const publicDir = opts && opts.publicDir ? opts.publicDir : path.join(opts.rootDir, 'public');
  const indexPath = path.join(publicDir, 'index.html');
  if (!fs.existsSync(indexPath)) return 0;

  const stripInjected = (html) =>
    html
      .replace(/\s*<link[^>]*\bid=["']daop-head-preconnect-lcp["'][^>]*>\s*/gi, '')
      .replace(/\s*<link[^>]*\bid=["']daop-head-lcp-preload["'][^>]*>\s*/gi, '');

  const siteSettingsPath = path.join(publicDir, 'data', 'config', 'site-settings.json');
  const sliderAutoPath = path.join(publicDir, 'data', 'home', 'homepage-slider-auto.json');

  let settings = {};
  try {
    if (fs.existsSync(siteSettingsPath)) {
      settings = JSON.parse(fs.readFileSync(siteSettingsPath, 'utf8')) || {};
    }
  } catch {
    let content = fs.readFileSync(indexPath, 'utf8');
    const stripped = stripInjected(content);
    if (stripped !== content) {
      fs.writeFileSync(indexPath, stripped, 'utf8');
    }
    return 0;
  }

  let sliderAuto = null;
  try {
    if (fs.existsSync(sliderAutoPath)) {
      sliderAuto = JSON.parse(fs.readFileSync(sliderAutoPath, 'utf8'));
    }
  } catch {
    sliderAuto = null;
  }

  const ophimDomain = String(settings.ophim_img_domain || 'https://img.ophim.live').replace(/\/$/, '');

  function normalizeUploads(u) {
    if (!u) return '';
    const s = String(u).trim();
    if (!s) return '';
    if (s.startsWith('//')) return 'https:' + s;
    if (s.startsWith('/uploads/')) return ophimDomain + s;
    if (s.startsWith('http://') || s.startsWith('https://')) {
      try {
        const pu = new URL(s);
        if (pu.pathname && String(pu.pathname).startsWith('/uploads/')) {
          return ophimDomain + pu.pathname;
        }
      } catch {
        /* ignore */
      }
      return s;
    }
    return s;
  }

  function firstSliderImageUrl() {
    const mode = String(settings.homepage_slider_display_mode || 'manual').trim().toLowerCase();
    if (mode === 'auto' && Array.isArray(sliderAuto)) {
      const arr = sliderAuto
        .filter((x) => x && x.enabled !== false)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      if (arr[0] && arr[0].image_url) return normalizeUploads(arr[0].image_url);
      return '';
    }
    let raw = settings.homepage_slider;
    let arr = [];
    try {
      if (typeof raw === 'string') arr = raw ? JSON.parse(raw) : [];
      else if (Array.isArray(raw)) arr = raw;
    } catch {
      arr = [];
    }
    arr = arr.filter((x) => x && x.enabled !== false).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    if (arr[0] && arr[0].image_url) return normalizeUploads(arr[0].image_url);
    return '';
  }

  let imgUrl = firstSliderImageUrl();
  if (imgUrl && imgUrl.indexOf('http') !== 0) {
    imgUrl = (imgUrl[0] === '/' ? '' : 'https://') + String(imgUrl).replace(/^\/{2}/, '');
  }

  let content = fs.readFileSync(indexPath, 'utf8');
  content = stripInjected(content);

  if (!imgUrl) {
    fs.writeFileSync(indexPath, content, 'utf8');
    if (opts && opts.log !== false) console.log('   Home LCP preload: không có ảnh slider, đã gỡ thẻ cũ (nếu có)');
    return 0;
  }

  let preconnectOrigin = '';
  try {
    preconnectOrigin = new URL(imgUrl).origin;
  } catch {
    preconnectOrigin = '';
  }

  const esc = escapeHtmlAttr(imgUrl);
  const escOrigin = escapeHtmlAttr(preconnectOrigin);
  const injectLines =
    (preconnectOrigin
      ? `\n  <link rel="preconnect" href="${escOrigin}" crossorigin id="daop-head-preconnect-lcp">`
      : '') +
    `\n  <link rel="preload" as="image" href="${esc}" fetchpriority="high" id="daop-head-lcp-preload">`;

  const descNeedle = '<meta name="description"';
  const dIdx = content.indexOf(descNeedle);
  if (dIdx !== -1) {
    const endMeta = content.indexOf('>', dIdx);
    if (endMeta !== -1) {
      content = content.slice(0, endMeta + 1) + injectLines + content.slice(endMeta + 1);
    } else {
      content = content.replace('</title>', '</title>' + injectLines);
    }
  } else {
    content = content.replace('</title>', '</title>' + injectLines);
  }

  fs.writeFileSync(indexPath, content, 'utf8');
  if (opts && opts.log !== false) console.log('   Injected home LCP preload + preconnect into index.html');
  return 1;
}
