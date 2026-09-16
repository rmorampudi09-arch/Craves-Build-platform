import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import type { HtmlTagDescriptor, Plugin } from 'vite'

/**
 * Public assets keep their original bytes and filenames. Only the URLs in the
 * production output gain a content fingerprint, so an edited image, video or
 * font stylesheet does not reuse an older cached response from another release.
 * This does not change source components, styles, animation timing or content.
 */
function versionPublicAssets(): Plugin {
  let publicDirectory = ''
  let sourceDirectory = ''
  const versions = new Map<string, string>()

  function versionUrl(value: string): string {
    if (!publicDirectory || !value.startsWith('/') || value.startsWith('//')) return value
    const fragmentAt = value.indexOf('#')
    const fragment = fragmentAt >= 0 ? value.slice(fragmentAt) : ''
    const beforeFragment = fragmentAt >= 0 ? value.slice(0, fragmentAt) : value
    const queryAt = beforeFragment.indexOf('?')
    const pathname = queryAt >= 0 ? beforeFragment.slice(0, queryAt) : beforeFragment
    const query = queryAt >= 0 ? beforeFragment.slice(queryAt + 1) : ''
    // Restrict processing to static assets, not routes or remote links.
    if (!/\.(?:png|jpe?g|webp|avif|gif|svg|ico|mp4|webm|css|webmanifest)$/i.test(pathname)) return value
    let decoded: string
    try { decoded = decodeURIComponent(pathname) } catch { return value }
    const filename = path.resolve(publicDirectory, `.${decoded}`)
    if (!filename.startsWith(`${publicDirectory}${path.sep}`)) return value
    if (!existsSync(filename) || !statSync(filename).isFile()) return value
    let version = versions.get(filename)
    if (!version) {
      version = createHash('sha256').update(readFileSync(filename)).digest('hex').slice(0, 16)
      versions.set(filename, version)
    }
    // Preserve existing query parameters (for example favicon v=4).
    const parameters = query.split('&').filter(p => p && !p.startsWith('craves_rev='))
    parameters.push(`craves_rev=${version}`)
    return `/landing-v20${pathname}?${parameters.join('&')}${fragment}`
  }

  function rewrite(source: string): string {
    // The project uses static quoted root-relative asset URLs in TSX and HTML.
    return source.replace(/(["'])(\/(?!\/)[^"'\s<>]+)\1/g,
      (_match: string, quote: string, value: string) => `${quote}${versionUrl(value)}${quote}`)
  }

  return {
    name: 'craves-public-asset-fingerprints',
    apply: 'build',
    enforce: 'pre',
    configResolved(config) {
      publicDirectory = config.publicDir ? path.resolve(config.publicDir) : ''
      sourceDirectory = path.resolve(config.root, 'src')
      versions.clear()
    },
    buildStart() { versions.clear() },
    transform(code, id) {
      const filename = path.resolve(id.split('?')[0])
      if (!filename.startsWith(`${sourceDirectory}${path.sep}`) || !/\.(?:[cm]?[jt]sx?|css)$/.test(filename)) return null
      const updated = rewrite(code)
      return updated === code ? null : { code: updated, map: null }
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) { return rewrite(html) },
    },
  }
}

const assetBase = '/landing-v20';

const revalidate = { 'Cache-Control': 'no-cache, max-age=0, must-revalidate' }

export default defineConfig({
  base: assetBase + '/',
  publicDir: '../customer-web-next/public/landing-v20',
  plugins: [versionPublicAssets(), react(), cravesFirstPaintSplash()],
  server: { headers: revalidate },
  preview: { headers: revalidate },
  build: {
    outDir: '../customer-web-next/public/landing-v20',
    emptyOutDir: false,
    copyPublicDir: false,
    // Preserve the existing JS target; add explicit conservative CSS targets.
    target: 'es2020',
    cssTarget: ['chrome90', 'edge90', 'firefox90', 'safari14.1'],
  },
})


/**
 * v21: cover the first document paint, not just React's first render.
 * This TypeScript hook runs in both `vite` and `vite build`.
 * The source index.html, original wordmark and all public assets stay unchanged.
 */
function cravesFirstPaintSplash(): Plugin {
  let publicDirectory = ''
  let nonce = ''
  let cachedStamp = ''
  let cachedWordmark = ''
  let imageWidth = 1048
  let imageHeight = 285

  return {
    name: 'craves-first-paint-splash-v21',
    configResolved(config) {
      publicDirectory = config.publicDir
      nonce = config.html?.cspNonce || ''
    },
    transformIndexHtml: {
      order: 'post',
      handler(input) {
        if (input.includes('id="craves-boot-style"')) return input
        const filename = path.join(publicDirectory, 'images', 'craves-wordmark-white.png')
        const info = statSync(filename)
        const stamp = `${info.size}:${info.mtimeMs}`
        if (stamp !== cachedStamp) {
          const bytes = readFileSync(filename)
          if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
            throw new Error('The existing Craves wordmark must be a valid PNG.')
          }
          imageWidth = bytes.readUInt32BE(16)
          imageHeight = bytes.readUInt32BE(20)
          cachedWordmark = `data:image/png;base64,${bytes.toString('base64')}`
          cachedStamp = stamp
        }

        // Fetch existing CSS without blocking the first splash paint. Restore
        // each original media value on load, before the React splash starts.
        // No font face, stylesheet content or rendered page styling is replaced.
        const html = input.replace(/<link\b[^>]*>/gi, (tag) => {
          if (!/\brel\s*=\s*["']stylesheet["']/i.test(tag) || /\bdisabled\b/i.test(tag)) return tag
          const media = tag.match(/\bmedia\s*=\s*(["'])(.*?)\1/i)
          const original = media ? media[2] : 'all'
          const escaped = original.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
          const clean = media ? tag.replace(media[0], '') : tag
          return clean.replace(/\s*\/?\s*>$/, ` media="print" data-craves-css="${escaped}">`)
        })

        const css = `
          /* Match index.css before its download: never add a gutter mid-startup. */
          html { scrollbar-gutter: stable; }
          @supports not (scrollbar-gutter: stable) {
            html { overflow-y: scroll; }
          }
          html[data-craves-boot], html[data-craves-boot] body {
            background: #f62e18 !important;
          }
          html[data-craves-boot] body { overflow: hidden !important; }
          #craves-boot { display: none; }
          html[data-craves-boot] #craves-boot {
            position: fixed; left: 0; top: 0; width: 100vw;
            height: 100vh; height: 100svh; display: block;
            z-index: 2147483000; overflow: hidden; pointer-events: auto;
            box-sizing: border-box; margin: 0; padding: 0; border: 0;
            border-radius: 0; visibility: visible; opacity: 1;
            /* Use the React surface's compositing path, including fractional pixels. */
            transform: translate3d(0,0,0); backface-visibility: hidden;
            will-change: left, top, width, height, border-radius;
            background:
              radial-gradient(circle at 50% 42%, rgba(255,255,255,.05), transparent 31%),
              linear-gradient(145deg, #f62e18 0%, #ef2b18 48%, #df2415 100%);
          }
          #craves-boot::before {
            content: ''; position: absolute; inset: -18%; pointer-events: none;
            background:
              radial-gradient(circle at 30% 20%, rgba(255,255,255,.045), transparent 24%),
              radial-gradient(circle at 74% 74%, rgba(109,10,4,.08), transparent 29%);
            opacity: .7;
          }
          #craves-boot-brand {
            position: absolute; left: 50%; top: 50%; width: min(72vw,640px);
            display: grid; place-items: center; transform: translate3d(-50%,-50%,0);
            transform-origin: center; will-change: transform;
          }
          #craves-boot-wordmark {
            position: relative; z-index: 1;
            width: min(100%,620px); max-width: 100%; height: auto;
            margin: 0; padding: 0; border: 0; border-radius: 0; display: block;
            opacity: 1; visibility: visible; transform: translate3d(0,0,0);
            backface-visibility: hidden;
            filter: drop-shadow(0 8px 20px rgba(88,9,4,.1));
          }
          @media (max-width:640px) {
            #craves-boot-brand { width: min(84vw,430px); }
            #craves-boot-wordmark { width: min(100%,410px); }
          }
        `

        const script = `
          (function () {
            var root = document.documentElement;
            root.setAttribute('data-craves-boot', 'pending');
            var released = false, parsed = false, stylesDone = false;
            var safety = 0, observer = null;
            var resolveStyles;
            var stylesReady = new Promise(function (resolve) { resolveStyles = resolve; });
            window.__cravesBoot = { stylesReady: stylesReady, release: release };

            function restore(link) {
              var media = link.getAttribute('data-craves-css');
              if (media === null) return;
              link.setAttribute('media', media);
              link.removeAttribute('data-craves-css');
            }
            function checkStyles() {
              if (!parsed || stylesDone) return;
              document.querySelectorAll('link[data-craves-css]').forEach(function (link) {
                // Also covers load events that occurred before this listener.
                if (link.sheet) restore(link);
              });
              if (!document.querySelector('link[data-craves-css]')) {
                stylesDone = true;
                if (observer) observer.disconnect();
                document.removeEventListener('load', onStyle, true);
                document.removeEventListener('error', onStyle, true);
                resolveStyles();
              }
            }
            function onStyle(event) {
              var link = event.target;
              if (link && link.tagName === 'LINK' && link.hasAttribute('data-craves-css')) {
                restore(link);
                checkStyles();
              }
            }
            function onParsed() {
              parsed = true;
              checkStyles();
            }
            function release() {
              if (released) return;
              released = true;
              clearTimeout(safety);
              // Restore all existing stylesheet semantics, even on failure.
              document.querySelectorAll('link[data-craves-css]').forEach(restore);
              parsed = true;
              checkStyles();
              var cover = document.getElementById('craves-boot');
              if (cover) cover.remove();
              root.removeAttribute('data-craves-boot');
              document.removeEventListener('craves:boot-release', release);
              document.removeEventListener('DOMContentLoaded', onParsed);
              window.removeEventListener('pageshow', onPageShow);
              delete window.__cravesBoot;
            }
            function onPageShow(event) {
              if (event.persisted) release();
            }
            document.addEventListener('load', onStyle, true);
            document.addEventListener('error', onStyle, true);
            document.addEventListener('DOMContentLoaded', onParsed);
            document.addEventListener('craves:boot-release', release);
            window.addEventListener('pageshow', onPageShow);
            if (typeof MutationObserver === 'function') {
              observer = new MutationObserver(checkStyles);
              observer.observe(root, { childList: true, subtree: true });
            }
            // A failed application request must not leave an input lock forever.
            safety = setTimeout(release, 12000);
            if (document.readyState !== 'loading') onParsed();
          })();
        `
        const nonceAttributes = nonce ? { nonce } : {}
        const tags: HtmlTagDescriptor[] = [
          { tag: 'style', attrs: { id: 'craves-boot-style', ...nonceAttributes }, children: css, injectTo: 'head-prepend' },
          { tag: 'script', attrs: { id: 'craves-boot-script', ...nonceAttributes }, children: script, injectTo: 'head-prepend' },
          {
            tag: 'div', attrs: { id: 'craves-boot', 'aria-hidden': 'true' }, injectTo: 'body-prepend',
            children: [{ tag: 'div', attrs: { id: 'craves-boot-brand' }, children: [
              { tag: 'img', attrs: {
                id: 'craves-boot-wordmark', src: cachedWordmark, alt: '',
                width: String(imageWidth), height: String(imageHeight),
                loading: 'eager', decoding: 'sync', fetchpriority: 'high',
              } },
            ] }],
          },
        ]
        return { html, tags }
      },
    },
  }
}

