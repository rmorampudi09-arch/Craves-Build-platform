# Complete second-pass changed files and reviewed configuration

The source/test files are complete, with no omissions. The separate configuration snapshots preserve the seven original policies and exact reviewed target payloads; use the final repair receipt and drift checks before any rollback or replay. The ZIP also contains both complete web modules.

### apps/customer-web-next/src/app/admin/academy/academy.css

```css
/* Craves Delivery Intelligence palette, pinned at 090ed428.
   No academy-only accent colours. Semantic colours are reserved for state icons.
   Source: apps/delivery-intelligence-admin/src/app/dashboard-a.css. */
.ca-root {
  --ca-red: #f62e18; --ca-red-dark: #df2412; --ca-ink: #111111;
  --ca-muted: #5f6064; --ca-soft: #fff5f3; --ca-line: #eadfdd;
  --ca-canvas: #f9f7f5; --ca-surface: #ffffff; --ca-success: #1d9155;
  --ca-warning: #ec9524; --ca-info: #286eca;
  --ca-fast: 160ms; --ca-enter: 240ms; --ca-slow: 320ms;
  --ca-ease: cubic-bezier(.22,1,.36,1);
  color: var(--ca-ink); font-family: var(--font-craves-body, Inter),ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  -webkit-font-smoothing: antialiased; color-scheme: light;
}
.ca-root * { box-sizing: border-box; }
.ca-root button,.ca-root input,.ca-root select,.ca-root textarea { font: inherit; }
.ca-root button,.ca-root a { -webkit-tap-highlight-color: transparent; }
.ca-root button { cursor: pointer; color: inherit; }
.ca-root button:disabled { opacity: .55; cursor: not-allowed; }
.ca-root button:not(:disabled),.ca-root a { transition: background var(--ca-fast),color var(--ca-fast),border-color var(--ca-fast),box-shadow var(--ca-fast),transform var(--ca-fast) var(--ca-ease); }
.ca-root button:active:not(:disabled),.ca-primary:active { transform: translateY(1px); }
.ca-root :focus-visible { outline: 2px solid var(--ca-red-dark); outline-offset: 4px; }
.ca-root [tabindex="-1"]:focus { outline: none; }
.ca-root h1,.ca-root h2,.ca-root h3,.ca-root p { margin: 0; }
.ca-root h1,.ca-root h2,.ca-root h3 { color: var(--ca-ink); }
.ca-root a { text-decoration: none; color: inherit; }
.ca-root input,.ca-root textarea { accent-color: var(--ca-red-dark); }
.ca-root code,.ca-root pre { font-family: ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
.ca-sr-only { position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap; }
.ca-shell { display:grid;grid-template-columns:228px minmax(0,1fr);min-height:100vh;background:var(--ca-canvas); }
.ca-shell-sidebar { position:sticky;top:0;height:100vh;display:flex;flex-direction:column;background:var(--ca-surface);border-right:1px solid var(--ca-line);padding:24px 15px;z-index:40; }
.ca-shell-brand { display:flex;align-items:center;gap:10px;padding:0 5px; }
.ca-shell-brand img { border-radius:10px;flex-shrink:0; }
.ca-shell-brand strong { display:block;font-size:16px;font-weight:850;letter-spacing:.04em; }
.ca-shell-brand span { display:block;font-size:9px;font-weight:750;letter-spacing:.07em;color:var(--ca-red-dark);margin-top:2px; }
.ca-shell-nav { margin-top:38px;display:flex;flex-direction:column;gap:6px; }
.ca-shell-nav>span { margin:4px 11px 6px;font-size:9px;letter-spacing:.14em;color:var(--ca-muted);font-weight:700; }
.ca-shell-nav>span:not(:first-child) { margin-top:24px; }
.ca-shell-nav a { display:flex;align-items:center;gap:10px;min-height:44px;padding:10px 11px;border-radius:11px;font-size:12px;font-weight:550; }
.ca-shell-nav a:hover { background:var(--ca-canvas); }
.ca-shell-nav a[aria-current] { color:var(--ca-red-dark);background:var(--ca-soft);font-weight:750; }
.ca-nav-current { margin-left:auto;transform:rotate(180deg); }
.ca-shell-safety { display:flex;align-items:center;gap:9px;margin-top:auto;padding:13px 11px;border:1px solid var(--ca-line);border-radius:12px;background:var(--ca-canvas); }
.ca-shell-safety>svg { color:var(--ca-success);flex-shrink:0; }
.ca-shell-safety strong,.ca-shell-safety span { display:block;font-size:9px;line-height:1.7; }
.ca-shell-safety span { color:var(--ca-muted); }
.ca-shell-main { min-width:0; }
.ca-shell-header { position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:20px;min-height:90px;padding:15px 28px;border-bottom:1px solid var(--ca-line);background:var(--ca-surface); }
.ca-shell-page { flex:1; }
.ca-shell-page h1 { font-size:22px;font-weight:800;letter-spacing:-.025em; }
.ca-shell-page p { margin-top:5px;color:var(--ca-muted);font-size:11px; }
.ca-shell-private { display:flex;align-items:center;gap:7px;color:var(--ca-muted);font-size:10px; }
.ca-shell-account { display:flex;align-items:center;gap:10px;padding-left:20px;border-left:1px solid var(--ca-line); }
.ca-shell-avatar { display:grid;place-items:center;background:var(--ca-soft);color:var(--ca-red-dark);width:38px;height:38px;border-radius:50%; }
.ca-shell-account strong { display:block;max-width:150px;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;font-size:11px; }
.ca-shell-account small { display:block;font-size:9px;color:var(--ca-muted);margin-top:4px; }
.ca-shell-content { max-width:1600px;margin:auto;padding:25px 28px 30px;min-width:0; }
.ca-shell-menu { display:none!important; }
.ca-shell-drawer { border:0;padding:0;margin:0;max-width:290px;width:85vw;max-height:none;height:100dvh;background:var(--ca-surface);color:var(--ca-ink); }
.ca-shell-drawer::backdrop,.ca-delete-dialog::backdrop { background:color-mix(in srgb,var(--ca-ink) 42%,transparent);backdrop-filter:blur(3px); }
.ca-shell-drawer[open] { animation:ca-drawer-in var(--ca-enter) var(--ca-ease); }
.ca-shell-drawer-inner { min-height:100%;display:flex;flex-direction:column;padding:28px 17px; }
.ca-shell-close { position:absolute;top:16px;right:12px;border:0;background:transparent;padding:8px; }
.ca-shell-drawer .ca-shell-brand { margin-top:20px; }
.ca-skip { position:fixed;left:16px;top:12px;z-index:100;transform:translateY(-160%);background:var(--ca-ink);color:var(--ca-surface)!important;padding:12px;border-radius:8px; }
.ca-skip:focus { transform:none; }
.ca-topline,.ca-topline>span,.ca-title,.ca-row,.ca-section-title,.ca-course-meta,.ca-progress-label,.ca-footer,.ca-footer>span { display:flex;align-items:center; }
.ca-topline { justify-content:space-between;gap:12px;font-size:9px;font-weight:750;letter-spacing:.12em;color:var(--ca-muted); }
.ca-topline>span { gap:8px; }
.ca-topline>span>svg { color:var(--ca-red-dark); }
.ca-sync { display:flex;align-items:center;gap:10px; }
.ca-pill { display:inline-flex;align-items:center;gap:6px;background:var(--ca-soft);border:1px solid var(--ca-line);border-radius:999px;padding:6px 10px;font-size:9px;letter-spacing:.03em;font-weight:650;color:var(--ca-red-dark); }
.ca-title { justify-content:space-between;gap:20px;margin:19px 0 20px; }
.ca-title h1 { font-size:clamp(25px,2.65vw,36px);line-height:1.2;letter-spacing:-1.2px;font-weight:800; }
.ca-title p { font-size:12px;color:var(--ca-muted);margin-top:10px;line-height:1.8; }
.ca-version { font-size:8px;letter-spacing:.13em;color:var(--ca-muted);border:1px solid var(--ca-line);background:var(--ca-surface);padding:9px 11px;border-radius:9px;white-space:nowrap; }
.ca-version strong { display:block;color:var(--ca-ink);font:600 12px monospace;margin-top:4px; }
.ca-tabs { display:flex;gap:8px;overflow-x:auto;border-bottom:1px solid var(--ca-line);margin-bottom:16px;scrollbar-width:thin; }
.ca-tabs button { position:relative;display:flex;align-items:center;gap:8px;white-space:nowrap;min-height:46px;padding:10px 12px 13px;background:none;border:0;color:var(--ca-muted);font-size:12px;font-weight:600; }
.ca-tabs button::after { content:"";position:absolute;left:10px;right:10px;bottom:0;height:2px;background:var(--ca-red);transform:scaleX(0);transition:transform var(--ca-enter) var(--ca-ease);transform-origin:center; }
.ca-tabs button[aria-current] { color:var(--ca-red-dark); }
.ca-tabs button[aria-current]::after { transform:scaleX(1); }
.ca-tabs button:hover { color:var(--ca-red-dark);background:var(--ca-soft);border-radius:9px 9px 0 0; }
.ca-sync-label { text-align:right;color:var(--ca-muted);font-size:9px;min-height:14px; }
.ca-stats { display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:10px 0 20px; }
.ca-stats>div { display:flex;align-items:center;gap:13px;padding:21px 17px;border:1px solid var(--ca-line);border-radius:16px;background:var(--ca-surface);box-shadow:0 8px 28px color-mix(in srgb,var(--ca-ink) 3%,transparent); }
.ca-stat-icon { display:grid;place-items:center;width:37px;height:40px;flex-shrink:0;background:var(--ca-soft);color:var(--ca-red-dark);border-radius:10px; }
.ca-stat-icon svg { width:19px; }
.ca-stats strong { font-size:26px;font-weight:800;letter-spacing:-.8px;line-height:1.2;font-variant-numeric:tabular-nums; }
.ca-stats strong small { font-size:12px;letter-spacing:0;font-weight:500;color:var(--ca-muted); }
.ca-stats p>span { display:block;font-size:9px;color:var(--ca-muted);margin-top:6px;line-height:1.5; }
.ca-view,.ca-tab-content { animation:ca-enter var(--ca-enter) var(--ca-ease) both; }
.ca-hero { position:relative;display:grid;grid-template-columns:1.2fr 1fr;overflow:hidden;gap:36px;min-height:264px;padding:30px 33px;background:var(--ca-soft);border:1px solid var(--ca-line);border-radius:18px;color:var(--ca-ink); }
.ca-eyebrow { display:inline-flex;align-items:center;gap:7px;font-size:9px;font-weight:750;letter-spacing:.16em;color:var(--ca-red-dark); }
.ca-hero h2 { font-size:clamp(25px,2.7vw,33px);font-weight:800;letter-spacing:-1px;line-height:1.22;margin:15px 0 11px; }
.ca-hero p { max-width:430px;font-size:12px;line-height:1.8;color:var(--ca-muted); }
.ca-hero button { display:inline-flex;align-items:center;gap:22px;margin:18px 0 11px;background:var(--ca-red-dark);border:0;padding:12px 17px;border-radius:10px;color:var(--ca-surface);font-size:12px;font-weight:700; }
.ca-hero button:hover { background:var(--ca-ink); }
.ca-hero>div>small { display:block;font-size:10px;color:var(--ca-muted);max-width:430px; }
.ca-path-art { position:relative;display:flex;justify-content:center;flex-direction:column;gap:10px;padding:10px 0; }
.ca-path-card { position:relative;display:flex;align-items:center;gap:12px;padding:15px 17px;background:var(--ca-surface);border:1px solid var(--ca-line);border-radius:13px;box-shadow:0 8px 18px color-mix(in srgb,var(--ca-ink) 3%,transparent); }
.ca-path-card:nth-of-type(2) { margin-left:13px; }
.ca-path-card>span { font-size:9px;color:var(--ca-muted); }
.ca-path-card>svg { width:19px;color:var(--ca-red-dark); }
.ca-path-card>svg:last-child { margin-left:auto;width:14px; }
.ca-path-card b { display:block;font-size:12px; }
.ca-path-card small { display:block;margin-top:4px;font-size:10px;color:var(--ca-muted); }
.ca-orbit { display:none; }
.ca-library { margin-top:29px; }
.ca-section-title { justify-content:space-between;gap:18px;margin-bottom:17px; }
.ca-kicker { display:block;font-size:9px;font-weight:750;letter-spacing:.13em;color:var(--ca-muted);margin-bottom:9px; }
.ca-section-title h2 { font-size:22px;font-weight:800;letter-spacing:-.6px; }
.ca-section-title h2 small { display:inline-grid;place-items:center;vertical-align:middle;margin-left:5px;background:var(--ca-soft);color:var(--ca-red-dark);border:1px solid var(--ca-line);border-radius:8px;min-width:26px;height:26px;font-size:12px; }
.ca-section-title p { margin-top:9px;font-size:12px;line-height:1.8;color:var(--ca-muted); }
.ca-sort { display:flex;align-items:center;gap:8px;font-size:10px;color:var(--ca-muted);white-space:nowrap; }
.ca-root select,.ca-root input:not([type=radio]):not([type=checkbox]),.ca-root textarea { border:1px solid var(--ca-line);border-radius:10px;background:var(--ca-surface);color:var(--ca-ink);padding:11px 12px;min-height:44px;max-width:100%; }
.ca-root input::placeholder,.ca-root textarea::placeholder { color:var(--ca-muted);opacity:1; }
.ca-root select:focus-visible,.ca-root input:focus-visible,.ca-root textarea:focus-visible { border-color:var(--ca-red-dark); }
.ca-sort select { font-size:11px;font-weight:600; }
.ca-tools { display:flex;gap:12px; }
.ca-search { flex:1;display:flex;align-items:center;gap:10px;padding-left:13px;background:var(--ca-surface);border:1px solid var(--ca-line);border-radius:12px;color:var(--ca-muted); }
.ca-search:focus-within { outline:2px solid var(--ca-red-dark);outline-offset:2px; }
.ca-search input:not([type=radio]):not([type=checkbox]) { border:0;background:none;width:100%;font-size:12px;min-height:44px;outline:none; }
.ca-service-select { display:none; }
.ca-chips { display:flex;flex-wrap:wrap;gap:7px;margin:14px 0 13px; }
.ca-chips button { min-height:36px;padding:7px 12px;font-size:10px;border-radius:9px;border:1px solid var(--ca-line);background:var(--ca-surface);text-transform:capitalize;color:var(--ca-muted); }
.ca-chips button[aria-pressed=true] { color:var(--ca-red-dark);background:var(--ca-soft);border-color:var(--ca-red-dark);font-weight:700; }
.ca-chips button:hover { color:var(--ca-red-dark);border-color:var(--ca-red-dark); }
.ca-result-count { margin:12px 0 16px!important;color:var(--ca-muted);font-size:10px; }
.ca-course-grid { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px; }
.ca-course { overflow:hidden;background:var(--ca-surface);border:1px solid var(--ca-line);border-radius:16px;transition:transform var(--ca-enter) var(--ca-ease),box-shadow var(--ca-enter),border-color var(--ca-enter);animation:ca-enter var(--ca-enter) var(--ca-ease) both; }
.ca-course:nth-child(2) { animation-delay:24ms; }.ca-course:nth-child(3) { animation-delay:48ms; }.ca-course:nth-child(4) { animation-delay:72ms; }.ca-course:nth-child(5) { animation-delay:96ms; }.ca-course:nth-child(6) { animation-delay:120ms; }.ca-course:nth-child(n+7) { animation-delay:144ms; }
.ca-course:hover,.ca-course:focus-within { border-color:var(--ca-red-dark);box-shadow:0 12px 28px color-mix(in srgb,var(--ca-ink) 6%,transparent); }
@media(hover:hover) { .ca-course:hover { transform:translateY(-2px); } }
.ca-course-visual { position:relative;background:var(--ca-canvas);height:95px;overflow:hidden;padding:14px 17px;border-bottom:1px solid var(--ca-line); }
.ca-service-code { font:500 9px monospace;color:var(--ca-muted);position:relative;z-index:1; }
.ca-code-motif { position:absolute;display:flex;align-items:center;gap:7px;left:17px;bottom:10px;color:var(--ca-red-dark); }
.ca-code-motif svg { width:30px;height:30px; }
.ca-code-motif span { display:block;width:25px;height:4px;border-radius:4px;background:currentColor;opacity:.16; }
.ca-code-motif span:last-child { width:14px; }
.ca-course-number { position:absolute;right:18px;bottom:6px;font-weight:800;font-size:47px;letter-spacing:-2px;color:var(--ca-red-dark);opacity:.09; }
.ca-course-content { padding:17px 18px; }
.ca-course-meta { justify-content:space-between;gap:5px;font-size:9px;color:var(--ca-muted); }
.ca-course-meta>span:first-child { color:var(--ca-red-dark);font-weight:650; }
.ca-course h3 { font-size:16px;line-height:1.5;font-weight:750;letter-spacing:-.35px;margin:10px 0 8px;min-height:48px; }
.ca-course-content>p { font-size:11px;line-height:1.85;color:var(--ca-muted);min-height:61px; }
.ca-progress-label { justify-content:space-between;font-size:9px;color:var(--ca-muted);margin:16px 0 7px; }
.ca-progress-label b { color:var(--ca-ink);font-variant-numeric:tabular-nums; }
.ca-root progress { height:5px;border:0;border-radius:4px;overflow:hidden;background:var(--ca-line);width:100%;display:block;accent-color:var(--ca-red); }
.ca-root progress::-webkit-progress-bar { background:var(--ca-line); }
.ca-root progress::-webkit-progress-value { background:var(--ca-red);border-radius:4px;transition:width var(--ca-slow) var(--ca-ease); }
.ca-root progress::-moz-progress-bar { background:var(--ca-red); }
.ca-course-action { display:flex;width:100%;align-items:center;justify-content:space-between;margin-top:16px;background:var(--ca-soft);color:var(--ca-red-dark)!important;padding:11px 12px;border-radius:9px;border:0;font-size:11px!important;font-weight:700!important;min-height:42px; }
.ca-course-action:hover { background:var(--ca-red-dark);color:var(--ca-surface)!important; }
.ca-course-action:hover svg { transform:translateX(2px); }
.ca-course-action svg { transition:transform var(--ca-fast) var(--ca-ease); }
.ca-bottom-grid { display:grid;grid-template-columns:1.3fr 1fr;gap:17px;margin:25px 0; }
.ca-panel { padding:23px;background:var(--ca-surface);border:1px solid var(--ca-line);border-radius:16px; }
.ca-panel h3 { font-size:17px;font-weight:750;letter-spacing:-.3px;margin-bottom:12px; }
.ca-panel>p { font-size:12px;color:var(--ca-muted);line-height:1.85;margin:10px 0; }
.ca-recommendation { display:flex;align-items:center;justify-content:space-between;gap:18px;width:100%;text-align:left;padding:14px 0;border:0;border-bottom:1px solid var(--ca-line);background:none; }
.ca-recommendation:last-child { border-bottom:0; }.ca-recommendation:hover { color:var(--ca-red-dark); }
.ca-recommendation strong { font-size:12px;display:block; }.ca-recommendation small { font-size:10px;line-height:1.8;color:var(--ca-muted);display:block;margin-top:4px; }
.ca-recommendation svg { flex-shrink:0;color:var(--ca-red-dark); }
.ca-trust { background:var(--ca-canvas); }.ca-trust>svg { color:var(--ca-red-dark);margin-bottom:13px; }
.ca-primary,.ca-secondary { display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:11px 16px;border-radius:10px;font-size:12px!important;font-weight:650!important;min-height:44px;line-height:1.4; }
.ca-primary { background:var(--ca-red-dark);color:var(--ca-surface)!important;border:1px solid var(--ca-red-dark); }
.ca-primary:hover:not(:disabled) { background:var(--ca-ink);border-color:var(--ca-ink); }
.ca-secondary { border:1px solid var(--ca-line);background:var(--ca-surface);color:var(--ca-ink); }
.ca-secondary:hover:not(:disabled) { border-color:var(--ca-red-dark);color:var(--ca-red-dark);background:var(--ca-soft); }
.ca-empty { display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:55px 25px;text-align:center;color:var(--ca-muted);border:1px dashed var(--ca-line);border-radius:16px;background:var(--ca-surface); }
.ca-empty>svg { color:var(--ca-red-dark); }.ca-empty h1,.ca-empty h3 { font-weight:750; }.ca-empty p { font-size:13px;line-height:1.8;max-width:570px; }.ca-empty small { font-size:11px; }
.ca-alert,.ca-notice { display:flex;align-items:center;gap:12px;border:1px solid var(--ca-line);background:var(--ca-soft);border-radius:12px;padding:14px 17px;font-size:12px;line-height:1.8;color:var(--ca-ink);margin:15px 0!important;animation:ca-enter var(--ca-enter) var(--ca-ease); }
.ca-notice>svg { flex-shrink:0;color:var(--ca-red-dark); }.ca-notice>span { flex:1; }.ca-notice>span>svg { display:inline;vertical-align:middle;margin-right:7px; }
.ca-notice button,.ca-alert button { background:none;color:inherit;border:0;padding:6px; }.ca-notice-success>svg { color:var(--ca-success); }
.ca-error-state { min-height:340px;display:flex;align-items:center;justify-content:center;gap:24px;border:1px solid var(--ca-line);border-radius:18px;padding:48px 35px;background:var(--ca-surface);animation:ca-enter var(--ca-enter) var(--ca-ease); }
.ca-state-icon { flex-shrink:0;display:grid;place-items:center;width:72px;height:72px;border:1px solid var(--ca-line);border-radius:22px;background:var(--ca-soft);color:var(--ca-red-dark); }
.ca-error-state h2 { font-size:25px;font-weight:750;letter-spacing:-.6px;line-height:1.35;max-width:510px; }
.ca-error-state p { font-size:12px;line-height:1.85;color:var(--ca-muted);max-width:530px;margin:12px 0 20px; }
.ca-error-compact { min-height:auto;justify-content:flex-start;align-items:flex-start;padding:21px 23px;margin:17px 0;gap:16px;border-radius:13px; }
.ca-error-compact .ca-state-icon { width:44px;height:44px;border-radius:12px; }.ca-error-compact h2 { font-size:17px;letter-spacing:-.2px; }.ca-error-compact .ca-kicker { font-size:8px; }.ca-error-compact p { font-size:11px;margin:9px 0 0; }.ca-error-compact .ca-row:empty { display:none; }
.ca-error-reference { font:10px monospace;margin-top:14px!important;color:var(--ca-muted); }
.ca-privacy { margin-top:25px;border:1px solid var(--ca-line);border-radius:12px;padding:15px 18px;background:var(--ca-surface);font-size:11px;color:var(--ca-muted);line-height:1.85; }
.ca-privacy summary { cursor:pointer;font-weight:650;color:var(--ca-ink);min-height:25px; }.ca-privacy summary svg { display:inline;vertical-align:middle;margin-right:6px;color:var(--ca-red-dark); }.ca-privacy p { margin-top:12px;overflow-wrap:anywhere; }.ca-privacy label { display:block;margin-top:15px; }.ca-privacy input { margin-right:7px; }
.ca-footer { justify-content:space-between;gap:15px;margin-top:25px;padding:19px 0 4px;border-top:1px solid var(--ca-line);font-size:9px;color:var(--ca-muted); }.ca-footer>span { gap:7px; }.ca-footer>span:first-child { font-weight:750;letter-spacing:.08em; }.ca-footer svg { color:var(--ca-red-dark); }
.ca-classroom { display:grid;grid-template-columns:248px minmax(0,1fr);gap:20px;align-items:start;margin:22px 0; }
.ca-syllabus { position:sticky;top:110px;padding:21px; }.ca-back { display:flex;align-items:center;gap:3px;background:none;color:var(--ca-red-dark)!important;font-size:11px!important;border:0;min-height:36px;margin-bottom:18px; }
.ca-syllabus h2 { font-size:19px;line-height:1.5;font-weight:750;margin-bottom:18px; }.ca-syllabus>p { font-size:10px; }.ca-syllabus nav { display:flex;flex-direction:column;margin-top:21px;gap:8px; }
.ca-syllabus nav button { display:flex;align-items:flex-start;gap:9px;text-align:left;background:var(--ca-canvas);border-radius:10px;padding:13px 10px;color:var(--ca-muted);border:1px solid transparent;font-size:11px;line-height:1.7; }
.ca-syllabus nav button[aria-current] { background:var(--ca-soft);border-color:var(--ca-red-dark);color:var(--ca-red-dark); }.ca-syllabus nav button>span { display:grid;place-items:center;width:23px;height:23px;flex-shrink:0;background:var(--ca-surface);border-radius:7px;font-size:9px; }
.ca-note { display:flex;align-items:flex-start;gap:8px;border-top:1px solid var(--ca-line);padding-top:18px;margin-top:22px;color:var(--ca-muted);font-size:10px;line-height:1.9; }.ca-note svg { flex-shrink:0;margin-top:3px;color:var(--ca-red-dark); }.ca-prereq { margin-top:16px!important; }
.ca-lesson-main { background:var(--ca-surface);border:1px solid var(--ca-line);border-radius:17px;overflow:hidden;min-width:0; }.ca-lesson-head { padding:25px 27px 0; }.ca-lesson-head h2 { font-size:25px;line-height:1.4;letter-spacing:-.65px;font-weight:750;margin-bottom:17px; }.ca-lesson-head .ca-tabs { margin-bottom:0; }.ca-lesson-main>.ca-error-state { margin:18px 23px; }
.ca-prose,.ca-quiz,.ca-source,.ca-guided { padding:26px 27px; }.ca-overview { font-size:14px;line-height:1.95;color:var(--ca-muted); }
.ca-step-list { margin:24px 0; }.ca-step-list>div { display:flex;gap:17px;padding:17px 0;border-bottom:1px solid var(--ca-line); }.ca-step-list>div>span { display:grid;place-items:center;background:var(--ca-soft);border-radius:10px;flex-shrink:0;width:35px;height:35px;font:700 12px monospace;color:var(--ca-red-dark); }.ca-step-list h3 { font-size:15px;font-weight:750;margin-bottom:8px; }.ca-step-list p { font-size:12px;color:var(--ca-muted);line-height:1.85; }
.ca-example,.ca-lab { padding:21px 23px;border:1px solid var(--ca-line);border-radius:13px;margin:20px 0;background:var(--ca-soft); }.ca-example p,.ca-lab p { font-size:13px;line-height:1.85; }.ca-lab { background:var(--ca-canvas); }.ca-lab small { display:block;font-size:10px;color:var(--ca-muted);line-height:1.8;margin-top:11px; }
.ca-pitfall { display:flex;align-items:flex-start;gap:12px;padding:16px 19px;background:var(--ca-canvas);border:1px solid var(--ca-line);border-radius:12px;margin:20px 0 26px;color:var(--ca-ink); }.ca-pitfall svg { color:var(--ca-warning);flex-shrink:0;margin-top:2px; }.ca-pitfall p { font-size:12px;line-height:1.8; }
.ca-source label { display:block;font-size:11px;font-weight:650; }.ca-source select { display:block;width:100%;margin:10px 0 15px;font:10px monospace; }.ca-source>p { font-size:11px;color:var(--ca-muted);line-height:1.8;margin:15px 0; }
.ca-source-header { display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 15px;background:var(--ca-canvas);border:1px solid var(--ca-line);border-bottom:0;color:var(--ca-ink);border-radius:10px 10px 0 0;font-size:10px; }.ca-source-header code { overflow-wrap:anywhere; }.ca-source-header span { font-family:monospace;color:var(--ca-muted); }.ca-source-header .ca-secondary { flex-shrink:0;font-size:10px!important;padding:7px 9px;min-height:34px; }
.ca-source pre { margin:0;background:var(--ca-ink);color:var(--ca-surface);overflow:auto;max-height:650px;padding:22px;font:11px/1.9 ui-monospace,monospace;tab-size:4;border-radius:0 0 10px 10px; }.ca-source>small { display:block;font:9px/1.8 monospace;color:var(--ca-muted);overflow-wrap:anywhere;margin-top:14px; }
.ca-quiz-intro { display:flex;gap:13px;margin-bottom:25px;color:var(--ca-red-dark); }.ca-quiz-intro svg { flex-shrink:0; }.ca-quiz-intro h3 { font-size:17px;font-weight:750; }.ca-quiz-intro p { font-size:11px;line-height:1.8;color:var(--ca-muted);margin-top:7px; }
.ca-quiz fieldset { margin:20px 0 27px;padding:0;border:0; }.ca-quiz legend { font-size:14px;line-height:1.7;font-weight:650;margin-bottom:15px; }.ca-quiz legend span { color:var(--ca-red-dark); }
.ca-option { display:flex;align-items:flex-start;gap:11px;border:1px solid var(--ca-line);border-radius:11px;padding:14px 15px;font-size:12px;line-height:1.7;margin:8px 0;cursor:pointer;transition:background var(--ca-fast),border-color var(--ca-fast); }.ca-option input { margin-top:4px; }.ca-option.selected { background:var(--ca-soft);border-color:var(--ca-red-dark); }.ca-option:hover { border-color:var(--ca-red-dark); }
.ca-feedback { padding:14px 17px;border:1px solid var(--ca-line);border-left:3px solid var(--ca-red-dark);background:var(--ca-canvas);border-radius:10px;font-size:12px;line-height:1.85;margin-top:12px;animation:ca-enter var(--ca-enter) var(--ca-ease); }.ca-feedback p { margin-top:5px;color:var(--ca-muted); }.ca-feedback.correct { border-left-color:var(--ca-success); }
.ca-result { display:flex;gap:17px;background:var(--ca-soft);border:1px solid var(--ca-line);border-radius:13px;padding:21px;margin-top:25px;animation:ca-enter var(--ca-enter) var(--ca-ease); }.ca-result svg { flex-shrink:0;color:var(--ca-red-dark); }.ca-result h3 { font-size:17px;font-weight:750; }.ca-result p { font-size:12px;line-height:1.8;margin:8px 0; }.ca-result small { display:block;font-size:10px;line-height:1.8;color:var(--ca-muted); }.ca-result .ca-secondary { margin-top:14px; }
.ca-video-stage { position:relative;background:var(--ca-ink);color:var(--ca-surface);min-height:390px;border-radius:14px;padding:28px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start; }.ca-video-stage .ca-eyebrow { color:var(--ca-surface); }.ca-video-symbol { background:var(--ca-red-dark);color:var(--ca-surface);padding:13px;border-radius:15px;margin:26px 0 20px; }.ca-video-stage h3 { color:var(--ca-surface);font-size:25px;line-height:1.4;font-weight:750;letter-spacing:-.5px; }.ca-video-stage p { font-size:12px;color:var(--ca-surface);line-height:1.9;margin:17px 0; }
.ca-scene-dots { display:flex;gap:7px;margin-top:18px; }.ca-scene-dots button { position:relative;background:color-mix(in srgb,var(--ca-surface) 30%,transparent);height:6px;width:28px;border-radius:5px;border:0; }.ca-scene-dots button::before { content:"";position:absolute;inset:-12px 0; }.ca-scene-dots button[aria-current] { background:var(--ca-red); }
.ca-player-controls { display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:11px;margin:20px 0; }.ca-player-controls>button:not(.ca-primary) { background:var(--ca-surface);border:1px solid var(--ca-line);border-radius:9px;padding:10px;color:var(--ca-red-dark); }.ca-player-controls>label { display:flex;align-items:center;gap:6px;font-size:10px;color:var(--ca-muted); }.ca-media-note { font-size:10px;color:var(--ca-muted);line-height:1.85; }.ca-guided details { font-size:12px;color:var(--ca-muted);line-height:1.9;margin-top:24px; }.ca-guided details summary { cursor:pointer;font-weight:650; }.ca-guided details h4 { color:var(--ca-ink);font-weight:700;margin-top:18px; }
.ca-roadmap { margin-top:26px; }.ca-plan-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px; }.ca-plan-grid h3 { margin-top:14px; }.ca-plan-grid small { font-size:10px;color:var(--ca-muted); }.ca-plan-detail { white-space:pre-wrap;overflow-wrap:anywhere; }
.ca-row { gap:12px;margin-top:17px;flex-wrap:wrap; }.ca-row>button:not(.ca-primary):not(.ca-secondary) { min-height:40px;font-size:11px;color:var(--ca-ink);border:1px solid var(--ca-line);background:var(--ca-surface);padding:9px 13px;border-radius:9px; }.ca-row>.ca-danger { color:var(--ca-red-dark)!important; }
.ca-plan-form { margin-top:25px; }.ca-plan-form label { font-size:12px;display:block;color:var(--ca-muted);margin:18px 0; }.ca-plan-form input,.ca-plan-form textarea,.ca-plan-form select { display:block;width:100%;margin-top:8px; }.ca-plan-form textarea { resize:vertical; }.ca-form-grid { display:grid;grid-template-columns:1fr 1fr;gap:20px; }
.ca-delete-dialog { border:1px solid var(--ca-line);background:var(--ca-surface);color:var(--ca-ink);border-radius:20px;padding:28px;max-width:470px;width:calc(100% - 32px);margin:auto;box-shadow:0 24px 80px color-mix(in srgb,var(--ca-ink) 20%,transparent); }
.ca-delete-dialog[open] { animation:ca-enter var(--ca-enter) var(--ca-ease); }.ca-delete-dialog .ca-state-icon { width:54px;height:54px;border-radius:16px;margin-bottom:20px; }.ca-delete-dialog h2 { font-size:25px;font-weight:750;letter-spacing:-.5px; }.ca-delete-dialog p { font-size:13px;line-height:1.8;color:var(--ca-muted);margin-top:13px;overflow-wrap:anywhere; }.ca-delete-dialog .ca-row { justify-content:flex-end;margin-top:24px; }
.ca-insight-stats { display:grid;grid-template-columns:repeat(3,1fr);gap:17px; }.ca-insight-stats strong { display:block;font-size:29px;font-weight:800;color:var(--ca-ink); }.ca-insight-stats span { display:block;font-size:11px;color:var(--ca-muted);margin-top:8px; }
.ca-chart { margin:22px 0; }.ca-chart svg { width:100%;max-height:250px;margin-top:20px; }.ca-chart rect { fill:var(--ca-red); }.ca-chart text { font:9px sans-serif;fill:var(--ca-muted); }.ca-chart-axis { stroke:var(--ca-line);stroke-width:1; }
.ca-table-wrap { overflow:auto; }.ca-table-wrap table { width:100%;border-collapse:collapse;text-align:left;font-size:12px;min-width:490px; }.ca-table-wrap th { padding:13px;color:var(--ca-muted);font-size:10px;font-weight:650;border-bottom:1px solid var(--ca-line); }.ca-table-wrap td { padding:15px 13px;border-bottom:1px solid var(--ca-line); }.ca-table-wrap tbody tr:nth-child(even) { background:var(--ca-canvas); }
.ca-pagination { display:flex;justify-content:flex-end;gap:18px;align-items:center;font-size:11px;margin-top:23px; }.ca-pagination button { background:var(--ca-surface);border:1px solid var(--ca-line);border-radius:9px;color:var(--ca-ink);padding:10px 13px;min-height:40px; }
.ca-loading { padding:10px 0 25px; }.ca-loading-heading { display:grid;gap:14px;max-width:420px;margin:10px 0 30px; }.ca-loading-stats { display:grid;grid-template-columns:repeat(4,1fr);gap:12px; }.ca-loading-stats>.ca-panel { min-height:105px; }.ca-skeleton { position:relative;overflow:hidden;background:var(--ca-line);border-radius:8px;display:block; }
.ca-skeleton::after { content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--ca-surface) 65%,transparent),transparent);transform:translateX(-100%);animation:ca-shimmer 1500ms linear infinite; }
.ca-skeleton-line { height:10px;width:73%;margin:7px 0; }.ca-skeleton-title { height:21px;width:92%;margin:5px 0 12px; }.ca-skeleton-value { height:25px;width:55%; }.ca-skeleton-icon { width:32px;height:32px;float:right; }.ca-loading-hero { height:264px;border-radius:18px;margin:20px 0 28px;background:var(--ca-soft);border:1px solid var(--ca-line); }.ca-loading-grid { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px; }.ca-skeleton-cover { height:87px;width:100%;margin-bottom:23px; }.ca-loading-code { display:grid;gap:15px;padding:25px;background:var(--ca-canvas);border:1px solid var(--ca-line);border-radius:12px;min-height:330px; }.ca-code-line { height:10px; }.ca-spin { animation:ca-spin 800ms linear infinite; }
@keyframes ca-enter { from { opacity:0;transform:translateY(7px); } to { opacity:1;transform:translateY(0); } }
@keyframes ca-drawer-in { from { opacity:0;transform:translateX(-20px); } to { opacity:1;transform:translateX(0); } }
@keyframes ca-shimmer { to { transform:translateX(100%); } }
@keyframes ca-spin { to { transform:rotate(360deg); } }
@media(min-width:1500px) { .ca-course-grid { gap:20px; }.ca-course-content { padding:20px; }.ca-course h3 { font-size:17px; }.ca-course-content>p { font-size:12px; } }
@media(max-width:1250px) { .ca-stats>div { padding:18px 12px;gap:9px; }.ca-stats strong { font-size:23px; }.ca-course-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }.ca-hero { gap:22px;padding:27px; }.ca-classroom { grid-template-columns:215px minmax(0,1fr); }.ca-shell-private { display:none; } }
@media(max-width:1000px) { .ca-shell { grid-template-columns:1fr; }.ca-shell-sidebar { display:none; }.ca-shell-menu { display:inline-flex!important; }.ca-shell-header { padding:14px 24px; }.ca-shell-content { padding:23px 24px; }.ca-shell-page h1 { font-size:20px; }.ca-classroom { grid-template-columns:1fr; }.ca-syllabus { position:static; }.ca-syllabus nav { flex-direction:row; }.ca-syllabus nav button { flex:1; }.ca-syllabus .ca-note,.ca-syllabus .ca-prereq { display:none; } }
@media(max-width:640px) { .ca-shell-header { min-height:78px;padding:12px 16px;gap:12px; }.ca-shell-page h1 { font-size:17px; }.ca-shell-page p { font-size:9px; }.ca-shell-account { border:0;padding-left:0; }.ca-shell-account>div { display:none; }.ca-shell-avatar { width:32px;height:32px; }.ca-shell-content { padding:19px 16px; }.ca-shell-menu { min-height:40px!important;padding:8px!important; }.ca-topline { font-size:8px;letter-spacing:.08em; }.ca-sync { gap:6px; }.ca-sync>.ca-pill { display:none; }.ca-sync .ca-secondary { min-height:36px;padding:8px 10px;font-size:10px!important; }.ca-title { margin-top:18px; }.ca-title h1 { font-size:28px;line-height:1.23;letter-spacing:-.9px; }.ca-version { display:none; }.ca-title p { font-size:11px;line-height:1.85; }.ca-tabs { gap:1px; }.ca-tabs button { padding:10px 9px 13px;font-size:11px;gap:6px; }.ca-stats { grid-template-columns:repeat(2,minmax(0,1fr));gap:9px; }.ca-stats>div { padding:15px 12px;gap:9px; }.ca-stat-icon { width:29px;height:35px; }.ca-stats strong { font-size:23px; }.ca-stats p>span { font-size:9px; }.ca-hero { grid-template-columns:1fr;padding:24px;gap:14px; }.ca-hero h2 { font-size:28px; }.ca-hero p { font-size:12px; }.ca-path-art { display:none; }.ca-section-title { align-items:flex-start;flex-direction:column;gap:14px; }.ca-section-title h2 { font-size:21px; }.ca-course-grid { grid-template-columns:1fr; }.ca-course-visual { height:90px; }.ca-course h3 { min-height:0;font-size:18px; }.ca-course-content>p { min-height:0;font-size:12px; }.ca-course-meta { font-size:10px; }.ca-course-action { min-height:44px;font-size:12px!important; }.ca-chips { display:none; }.ca-service-select { display:flex;align-items:center;gap:10px;font-size:11px;margin:12px 0; }.ca-service-select select { font-size:12px;flex:1; }.ca-tools { display:block; }.ca-bottom-grid { grid-template-columns:1fr; }.ca-panel { padding:21px; }.ca-footer { align-items:flex-start;flex-direction:column;font-size:8px; }.ca-classroom { gap:15px; }.ca-syllabus nav { flex-direction:column; }.ca-lesson-head h2 { font-size:22px; }.ca-lesson-head,.ca-prose,.ca-quiz,.ca-source,.ca-guided { padding-left:18px;padding-right:18px; }.ca-overview { font-size:13px; }.ca-video-stage { padding:22px; }.ca-video-stage h3 { font-size:23px; }.ca-plan-grid,.ca-form-grid { grid-template-columns:1fr; }.ca-form-grid { gap:0; }.ca-insight-stats { gap:8px; }.ca-insight-stats .ca-panel { padding:14px; }.ca-insight-stats strong { font-size:23px; }.ca-insight-stats span { font-size:9px; }.ca-table-wrap { padding:14px; }.ca-player-controls { gap:7px; }.ca-player-controls .ca-primary { padding:11px 12px;font-size:11px!important; }.ca-source-header { flex-wrap:wrap; }.ca-source-header code { width:100%; }.ca-error-state { flex-direction:column;align-items:flex-start;min-height:350px;padding:27px;gap:22px; }.ca-error-state h2 { font-size:24px; }.ca-error-compact { min-height:0;gap:13px;padding:20px; }.ca-error-compact h2 { font-size:17px; }.ca-error-state .ca-row { gap:9px; }.ca-error-state .ca-primary,.ca-error-state .ca-secondary { font-size:11px!important; }.ca-loading-stats { grid-template-columns:repeat(2,1fr); }.ca-loading-grid { grid-template-columns:1fr; }.ca-loading-hero { height:285px; }.ca-loading-heading { max-width:280px; } }
@media(prefers-reduced-motion:reduce) { .ca-root *,.ca-root *::before,.ca-root *::after { animation:none!important;transition:none!important;scroll-behavior:auto!important; }.ca-root .ca-course:hover { transform:none; } }
@media print { .ca-shell { display:block; }.ca-shell-sidebar,.ca-shell-header,.ca-topline,.ca-tabs,.ca-stats,.ca-footer,.ca-privacy,.ca-syllabus,.ca-primary,.ca-player-controls { display:none!important; }.ca-classroom { display:block; }.ca-lesson-main { border:0; }.ca-source pre { color:var(--ca-ink);background:var(--ca-surface);max-height:none;white-space:pre-wrap; } }

.ca-plan-form>fieldset{border:0;padding:0;margin:0;min-width:0}.ca-lesson-main>.ca-notice{margin:18px 22px 0}
```

### apps/customer-web-next/src/app/admin/layout.tsx

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminExplorerSession } from "@/components/admin-explorer-session";
import { AdminWorkspace } from "@/components/admin-workspace";

export const metadata: Metadata = {
  title: "Craves administration",
  robots: { index: false, follow: false }
};

export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AdminWorkspace><AdminExplorerSession>{children}</AdminExplorerSession></AdminWorkspace>;
}
```

### apps/customer-web-next/src/app/chef/profile/page.tsx

```tsx
"use client";

import Link from "next/link";
import {
  BadgeIndianRupee,
  Bell,
  CalendarDays,
  ChevronRight,
  FileCheck2,
  MapPin,
  Store,
  UserRound,
} from "lucide-react";
import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefPageHeader } from "@/components/chef-page-header";
import { useChefReadPanels } from "@/hooks/use-chef-read-panels";
import { parseChefApplication } from "@/lib/chef-application-contract";
import { parseChefKitchen } from "@/lib/chef-kitchen-contract";

const profileSources = {
  application: {
    path: "/api/chef/application",
    label: "Personal details",
    decode: (raw: unknown) => {
      const value = parseChefApplication(raw);
      if (!value) throw new Error("Chef application details are unavailable. Please try again.");
      return value;
    },
  },
  kitchen: {
    path: "/api/chef/kitchen",
    label: "Kitchen details",
    decode: (raw: unknown) => {
      if (raw === null) return null;
      const value = parseChefKitchen(raw);
      if (!value) throw new Error("Kitchen details are unavailable. Please try again.");
      return value;
    },
  },
};

function ProfileContent() {
  const { panels, refresh } = useChefReadPanels(profileSources);
  const application = panels.application.data;
  const kitchen = panels.kitchen.data;
  const errors = [panels.application, panels.kitchen].filter((panel) => panel.status === "error");
  const name =
    panels.application.status === "loading"
      ? "Loading chef details…"
      : panels.application.status === "error"
        ? "Chef details unavailable"
        : [application?.firstName, application?.lastName].filter(Boolean).join(" ") || "Chef";
  const address = [
    kitchen?.addressLine1,
    kitchen?.addressLine2,
    kitchen?.areaName,
    kitchen?.city,
    kitchen?.state,
    kitchen?.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
  const kitchenName =
    panels.kitchen.status === "loading"
      ? "Loading kitchen details…"
      : panels.kitchen.status === "error"
        ? "Kitchen details unavailable"
        : kitchen?.kitchenName || "Add your kitchen details";
  const kitchenAddress =
    panels.kitchen.status === "loading"
      ? "Loading kitchen location…"
      : panels.kitchen.status === "error"
        ? "Kitchen location unavailable"
        : address || "Add your pickup location";
  const verification =
    panels.application.status === "loading"
      ? "Checking application status…"
      : panels.application.status === "error"
        ? "Application status unavailable"
        : application?.status === "APPROVED"
          ? "Application approved"
          : "View your verification status";
  const items = [
    { href: "/chef/application", icon: UserRound, title: "Personal details", desc: name },
    { href: "/chef/kitchen", icon: Store, title: "Kitchen details", desc: kitchenName },
    { href: "/chef/kitchen", icon: MapPin, title: "Kitchen location", desc: kitchenAddress },
    {
      href: "/chef/earnings",
      icon: BadgeIndianRupee,
      title: "Earnings & payouts",
      desc: "See what you get from completed orders",
    },
    {
      href: "/chef/meal-plans",
      icon: CalendarDays,
      title: "Meal Plans",
      desc: "Manage your dishes, schedules and availability",
    },
    {
      href: "/notifications",
      icon: Bell,
      title: "Notifications",
      desc: "Orders, payments and account updates",
    },
    {
      href: "/chef/application",
      icon: FileCheck2,
      title: "Documents & verification",
      desc: verification,
    },
  ];
  return (
    <div className="space-y-5">
      {errors.length > 0 && (
        <section className="rounded-3xl border border-error/20 bg-white p-6">
          <div role="alert">
            {errors.map((panel) => (
              <p key={panel.error}>{panel.error}</p>
            ))}
          </div>
          <button
            type="button"
            onClick={refresh}
            className="mt-4 min-h-12 rounded-md bg-primary px-5 text-white"
          >
            Try again
          </button>
        </section>
      )}
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--color-flame-red)]/10 text-[var(--color-flame-red)]">
            <UserRound className="h-7 w-7" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--color-flame-red)]">Chef profile</p>
            <h2 className="mt-1 text-2xl font-bold text-[#1A1A1A]">{name}</h2>
            <p className="mt-1 text-sm text-[#6B6B6B]">
              {kitchenName} · {verification}
            </p>
          </div>
        </div>
      </section>
      <section className="overflow-hidden rounded-3xl border border-[#E5E7EB] bg-white">
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href + item.title}
              href={item.href}
              className={`flex min-h-[76px] items-center gap-4 px-5 py-4 transition hover:bg-[#F7F8F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-flame-red)] sm:px-6 ${index ? "border-t border-[#E5E7EB]" : ""}`}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[var(--color-flame-red)]">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block text-sm text-[#1A1A1A]">{item.title}</strong>
                <span className="mt-1 block truncate text-sm text-[#6B6B6B]">{item.desc}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-[#6B6B6B]" aria-hidden="true" />
            </Link>
          );
        })}
      </section>
      <section className="grid gap-3 sm:grid-cols-2" aria-label="Additional verification">
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
          <h3 className="font-semibold">Food safety details</h3>
          <p className="mt-2 text-sm text-[#6B6B6B]">
            FSSAI submission is not available yet. Chef identity approval does not confirm
            food-business compliance.
          </p>
        </div>
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
          <h3 className="font-semibold">Kitchen photos</h3>
          <p className="mt-2 text-sm text-[#6B6B6B]">
            Kitchen photo uploads are not available yet.
          </p>
        </div>
      </section>
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 text-sm text-[#6B6B6B]">
        <p className="font-semibold text-[#1A1A1A]">Keep your details current</p>
        <p className="mt-1 leading-6">
          Customers see your kitchen information, while payout and verification information stays
          protected behind your signed-in Chef access.
        </p>
      </section>
    </div>
  );
}

export default function ChefProfilePage() {
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-6 md:px-6 md:py-8">
      <ChefPageHeader
        eyebrow="Your account"
        title="Profile"
        description="Keep your personal details, kitchen information, documents and payout links easy to find."
      />
      <div className="mt-6">
        <ChefAccessBoundary>
          <ProfileContent />
        </ChefAccessBoundary>
      </div>
    </main>
  );
}
```

### apps/customer-web-next/src/components/admin-dashboard-visuals.tsx

```tsx
"use client";

import "@syncfusion/ej2-tailwind3-theme/styles/base/base.css";
import "@syncfusion/ej2-tailwind3-theme/styles/grid/grid.css";
import "@syncfusion/ej2-tailwind3-theme/styles/pager/pager.css";
import "@syncfusion/ej2-tailwind3-theme/styles/popup/popup.css";
import "@syncfusion/ej2-tailwind3-theme/styles/spinner/spinner.css";
import "@syncfusion/ej2-tailwind3-theme/styles/tooltip/tooltip.css";
import { SyncfusionLicense } from "@/components/syncfusion-license";
import {
  Category, ChartComponent, ColumnSeries, DataLabel, Inject,
  SeriesCollectionDirective, SeriesDirective, Tooltip
} from "@syncfusion/ej2-react-charts";
import { ColumnDirective, ColumnsDirective, GridComponent, Page, Sort } from "@syncfusion/ej2-react-grids";
import type { AdminDashboardSummary } from "@/lib/admin-dashboard-contract";

const labels: Record<string, string> = {
  CHEF_ACCEPTANCE_PENDING: "Awaiting chef", PREPARING: "Preparing", READY_FOR_PICKUP: "Ready",
  OUT_FOR_DELIVERY: "Out for delivery", REFUND_PENDING: "Refund pending", REFUND_FAILED: "Refund failed"
};

function readableStatus(value: string): string {
  return labels[value] ?? value.toLowerCase().replaceAll("_", " ").replace(/^./, character => character.toUpperCase());
}

export function AdminDashboardVisuals({ summary }: { summary: AdminDashboardSummary }) {
  const trend = summary.orderTrend.map(point => ({
    day: new Date(`${point.date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", timeZone: "UTC" }),
    orders: point.count
  }));
  const exceptions = summary.recentExceptions.map(item => ({
    ...item,
    shortOrderId: item.orderId.slice(0, 8).toUpperCase(),
    kitchen: item.kitchenName || "Kitchen name unavailable",
    displayStatus: readableStatus(item.status),
    updated: new Date(item.updatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
  }));

  return <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
    <SyncfusionLicense />
    <section className="overflow-hidden rounded-[28px] border border-[#ebe5ef] bg-white p-5 shadow-[0_20px_60px_-45px_rgba(61,43,79,0.45)] sm:p-7">
      <div className="mb-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8b7b97]">Order volume</p><h2 className="mt-1 text-xl font-bold">Last seven days</h2></div>
      <ChartComponent
        height="310px"
        background="transparent"
        chartArea={{ border: { width: 0 } }}
        primaryXAxis={{ valueType: "Category", majorGridLines: { width: 0 }, majorTickLines: { width: 0 }, labelStyle: { color: "#766981", fontFamily: "Poppins" } }}
        primaryYAxis={{ minimum: 0, majorTickLines: { width: 0 }, lineStyle: { width: 0 }, majorGridLines: { color: "#eee9f1", dashArray: "4 4" }, labelStyle: { color: "#766981", fontFamily: "Poppins" } }}
        tooltip={{ enable: true, format: "${point.x}: ${point.y} orders" }}
      >
        <Inject services={[ColumnSeries, Category, Tooltip, DataLabel]} />
        <SeriesCollectionDirective>
          <SeriesDirective dataSource={trend} xName="day" yName="orders" type="Column" fill="#6930ca" cornerRadius={{ topLeft: 8, topRight: 8 }} marker={{ dataLabel: { visible: true, position: "Top", font: { color: "#5b496a", fontWeight: "600" } } }} />
        </SeriesCollectionDirective>
      </ChartComponent>
    </section>
    <section className="overflow-hidden rounded-[28px] border border-[#ebe5ef] bg-white p-5 shadow-[0_20px_60px_-45px_rgba(61,43,79,0.45)] sm:p-7">
      <div className="mb-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8b7b97]">Attention queue</p><h2 className="mt-1 text-xl font-bold">Recent exceptions</h2></div>
      {exceptions.length === 0
        ? <div className="grid min-h-[300px] place-items-center rounded-2xl bg-[#f7f5fb] text-sm font-semibold text-[#766981]">No current exceptions</div>
        : <GridComponent dataSource={exceptions} height="300" allowSorting allowPaging pageSettings={{ pageSize: 5, pageSizes: false }} gridLines="Horizontal">
          <ColumnsDirective>
            <ColumnDirective field="shortOrderId" headerText="Order" width="95" />
            <ColumnDirective field="kitchen" headerText="Kitchen" width="150" />
            <ColumnDirective field="displayStatus" headerText="Status" width="125" />
            <ColumnDirective field="updated" headerText="Updated" width="165" />
          </ColumnsDirective>
          <Inject services={[Page, Sort]} />
        </GridComponent>}
    </section>
  </div>;
}
```

### apps/customer-web-next/src/components/admin-workspace.tsx

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  BarChart3, Users, PackageSearch, ArrowRight, BellRing, ChefHat, CircleUserRound, ClipboardList, Gauge, GraduationCap,
  LayoutDashboard, LogOut, Menu, ReceiptText, Search, SearchCheck, ShieldCheck, Truck, X
} from "lucide-react";
import { observeAdminSession, logoutAdminSession } from "@/lib/admin-renewal";
import { createAdminAuthorization, INITIAL_ADMIN_AUTHORIZATION } from "@/lib/admin-authorization";
import { loadAdminIdentity } from "@/lib/admin-session";
import { ADMIN_MODULES, matchesAdminRoute, searchAdminModules } from "@/lib/admin-navigation";
import { AdminModuleLink } from "@/components/admin-module-link";
import { CravesLogo } from "@/components/brand/CravesLogo";
import { AcademyWorkspace } from "@/components/academy-workspace";
import "@/styles/admin-control.css";

const icons = {
  analytics: BarChart3, users: Users, "chef-explorer": ChefHat, "order-explorer": PackageSearch,
  overview: LayoutDashboard, search: Search, modules: Menu, operations: SearchCheck,
  delivery: Truck, chefs: ChefHat, accounts: ShieldCheck, finance: ReceiptText,
  plans: ReceiptText, subscriptions: ClipboardList, capacity: Gauge,
  notifications: BellRing, academy: GraduationCap
};

function Navigation({ pathname, close }: { pathname: string; close?: () => void }) {
  const groups = [...new Set(ADMIN_MODULES.map(module => module.group))];
  return <nav className="cr-navigation" aria-label="Administration modules">
    {groups.map(group => <div className="cr-nav-group" key={group}><p className="cr-nav-label">{group}</p>
      {ADMIN_MODULES.filter(module => module.group === group).map(module => {
        const Icon = icons[module.id as keyof typeof icons] ?? LayoutDashboard;
        return <AdminModuleLink key={module.id} module={module} className="cr-nav-link" current={matchesAdminRoute(pathname, module.href)} onNavigate={close}>
          <Icon size={18} aria-hidden="true"/><span>{module.label}</span>{module.externalApp && <ArrowRight size={14} aria-hidden="true"/>}
        </AdminModuleLink>;
      })}
    </div>)}
  </nav>;
}

function Brand() {
  return <Link href="/admin" className="cr-brand"><CravesLogo size="md" priority/><span><strong>Craves</strong><small>ADMIN CONTROL CENTER</small></span></Link>;
}

export function AdminWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [{ identity, message, sessionState }, setAuthorization] = useState(INITIAL_ADMIN_AUTHORIZATION);
  const [query, setQuery] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [logoutStarted, setLogoutStarted] = useState(false);
  const [logoutConfirmed, setLogoutConfirmed] = useState(false);
  const logoutInFlight = useRef(false);
  const menu = useRef<HTMLDialogElement>(null);
  const commands = useRef<HTMLDialogElement>(null);
  const commandInput = useRef<HTMLInputElement>(null);
  const allowInteraction = sessionState === "ready" && identity !== null && message === "";

  useEffect(() => {
    const authorization = createAdminAuthorization({
      loadIdentity: loadAdminIdentity,
      publish: setAuthorization,
      closeDialogs: () => { menu.current?.close(); commands.current?.close(); },
    });
    const stop = observeAdminSession(state => { void authorization.accept(state); });
    return () => { authorization.dispose(); stop(); };
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (allowInteraction && !event.isComposing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        commands.current?.showModal();
        commandInput.current?.focus();
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [allowInteraction]);

  async function signOut() {
    if (logoutInFlight.current) return;
    logoutInFlight.current = true;
    setLogoutStarted(true);
    setSigningOut(true);
    setLogoutError("");
    try { await logoutAdminSession(); setLogoutConfirmed(true); }
    catch { setLogoutError("Sign out has not been confirmed. This workspace is locked. Retry sign out to finish securely."); }
    finally { logoutInFlight.current = false; setSigningOut(false); }
  }

  // Keep the retry reachable after local authorization is cleared, including Academy.
  if (logoutStarted) return <main className="cr-admin cr-session-screen">
    <section className="cr-session-card"><CravesLogo size="lg" priority/><p className="cr-eyebrow">Craves administration</p>
      <h1>{logoutConfirmed ? "Signed out" : signingOut ? "Signing out securely" : "Finish signing out"}</h1>
      <p className="cr-muted" role={logoutError ? "alert" : "status"}>{logoutError || (logoutConfirmed ? "Your Craves session has been signed out." : "This workspace is locked while Craves confirms sign out.")}</p>
      <div className="cr-actions">{logoutConfirmed
        ? <Link className="cr-button cr-primary" href={`/sign-in?returnTo=${encodeURIComponent(pathname)}`}>Administrator sign in</Link>
        : <button type="button" className="cr-button cr-primary" onClick={() => void signOut()} disabled={signingOut}>{signingOut ? "Signing out…" : "Retry sign out"}</button>}
      </div>
    </section>
  </main>;

  // Academy keeps its purpose-built, already Craves-branded learning workspace.
  if (pathname === "/admin/academy" || pathname.startsWith("/admin/academy/")) {
    return <AcademyWorkspace identity={identity} message={message} sessionState={sessionState} onSignOut={() => { void signOut(); }}>{children}</AcademyWorkspace>;
  }

  const current = ADMIN_MODULES.find(module => matchesAdminRoute(pathname, module.href));
  const results = searchAdminModules(query);
  const accessScreen = <main className="cr-admin cr-session-screen">
    <section className="cr-session-card"><CravesLogo size="lg" priority/><p className="cr-eyebrow">Craves administration</p>
      <h1>{sessionState === "reconnecting" ? "Reconnecting securely" : "Your control center starts here"}</h1>
      <p className="cr-muted" role="status">{message}</p>
      <div className="cr-actions">
        {sessionState !== "ended" && <button type="button" className="cr-button" onClick={() => window.location.reload()}>Retry connection</button>}
        <Link className="cr-button cr-primary" href={`/sign-in?returnTo=${encodeURIComponent(pathname)}`}>Administrator sign in<ArrowRight size={16} aria-hidden="true"/></Link>
      </div>
      <p className="cr-footnote">Only accounts approved by Craves can access administration.</p>
    </section>
  </main>;

  if (!identity) return accessScreen;

  return <>
    <div className="cr-admin cr-admin-shell" hidden={!allowInteraction}>
      <a className="cr-skip" href="#cr-admin-content">Skip to workspace</a>
      <aside className="cr-sidebar">
        <Brand/><Navigation pathname={pathname}/>
        <div className="cr-sidebar-account"><div className="cr-person"><CircleUserRound size={28} aria-hidden="true"/><div><strong>{identity.displayName || "Administrator"}</strong><span>{identity.email || "Craves administrator"}</span></div></div>
          <span className="cr-badge"><ShieldCheck size={13} aria-hidden="true"/>Admin access verified</span>
          <button type="button" className="cr-button cr-signout" onClick={() => void signOut()} disabled={signingOut}><LogOut size={16} aria-hidden="true"/>{signingOut ? "Signing out…" : "Sign out"}</button>
          {logoutError && <p role="alert" className="cr-error-text">{logoutError}</p>}
        </div>
      </aside>
      <div className="cr-main-area">
        <header className="cr-topbar">
          <button type="button" className="cr-icon-button cr-mobile-menu" aria-label="Open navigation" onClick={() => menu.current?.showModal()}><Menu size={20}/></button>
          <div className="cr-page-context"><span>{current?.group || "Administration"}</span><strong>{current?.label || "Admin workspace"}</strong></div>
          <button type="button" className="cr-command-trigger" aria-label="Find a module or task" onClick={() => { commands.current?.showModal(); commandInput.current?.focus(); }}><Search size={17} aria-hidden="true"/><span>Find a module or task…</span><kbd>Ctrl / ⌘ K</kbd></button>
          <Link className="cr-icon-button" href="/admin/notifications" aria-label="Open notification recovery" title="Notification recovery"><BellRing size={19}/></Link>
        </header>
        <main id="cr-admin-content" tabIndex={-1} className="cr-content">{children}</main>
        <footer className="cr-workspace-footer"><span>Craves administration</span><span>Authorized workflows · Timestamps labelled in IST</span></footer>
      </div>
      <dialog ref={menu} className="cr-dialog cr-menu-dialog" aria-label="Admin navigation" onClick={event => { if (event.target === event.currentTarget) menu.current?.close(); }}>
        <div className="cr-menu-inner"><div className="cr-dialog-heading"><Brand/><button className="cr-icon-button" onClick={() => menu.current?.close()} aria-label="Close navigation"><X size={20}/></button></div>
          <Navigation pathname={pathname} close={() => menu.current?.close()}/>
          <button className="cr-button" onClick={() => void signOut()} disabled={signingOut}><LogOut size={16} aria-hidden="true"/>{signingOut ? "Signing out…" : "Sign out"}</button>
          {logoutError && <p role="alert" className="cr-error-text">{logoutError}</p>}
        </div>
      </dialog>
      <dialog ref={commands} className="cr-dialog cr-command-dialog" aria-labelledby="cr-command-title" onClick={event => { if (event.target === event.currentTarget) commands.current?.close(); }}>
        <div className="cr-command-inner"><div className="cr-dialog-heading"><h2 id="cr-command-title">Where do you need to go?</h2><button className="cr-icon-button" onClick={() => commands.current?.close()} aria-label="Close module search"><X size={20}/></button></div>
          <label className="cr-search-field"><Search size={18} aria-hidden="true"/><span className="cr-sr-only">Search module names and tasks</span><input ref={commandInput} type="search" placeholder="Try orders, finance, chefs, training…" value={query} onChange={event => setQuery(event.target.value)} maxLength={100}/></label>
          <p className="cr-footnote">This searches workspace names. Use Global search for customers, chefs or transaction references.</p>
          <div className="cr-command-results">{results.map(module => <AdminModuleLink key={module.id} module={module} className="cr-command-result" onNavigate={() => { commands.current?.close(); setQuery(""); }}><span><strong>{module.label}</strong><small>{module.description}</small></span><ArrowRight size={18} aria-hidden="true"/></AdminModuleLink>)}</div>
          {results.length === 0 && <p className="cr-empty" role="status">No matching module. Try a different task.</p>}
        </div>
      </dialog>
    </div>
    {!allowInteraction && accessScreen}
  </>;
}
```

### apps/customer-web-next/src/components/checkout/CheckoutPaymentButton.tsx

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LockKeyhole } from "lucide-react";
import {
  parsePaymentSession,
  parsePaymentStatus,
  parsePaymentVerification,
} from "@/lib/payment-contract";
import type { CustomerCheckout } from "@/lib/checkout-contract";
import { loadSession } from "@/services/auth/cravesAuth";
import { sessionFetch } from "@/services/auth/sessionFetch";

type CheckoutWindow = Window & {
  Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckout;
};

function razorpayConstructor() {
  return (window as CheckoutWindow).Razorpay;
}

type RazorpaySuccess = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayCheckout = {
  open(): void;
  on(
    event: "payment.failed",
    handler: (response: { error?: { description?: string; reason?: string } }) => void,
  ): void;
};

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  image?: string;
  description: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  handler(response: RazorpaySuccess): void;
  modal: { ondismiss(): void };
  theme: { color: string };
};

export type CheckoutPaymentFailure = {
  message: string;
  retryAllowed: boolean;
} | null;

interface CheckoutPaymentButtonProps {
  checkout: CustomerCheckout | null;
  previewAmount: number;
  currency: string;
  disabled?: boolean;
  failure: CheckoutPaymentFailure;
  ensureCheckout: () => Promise<CustomerCheckout>;
  onFailure: (failure: CheckoutPaymentFailure) => void;
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `₹${Math.round(amount)}`;
  }
}

function responseMessage(body: unknown, fallback: string): string {
  return body &&
    typeof body === "object" &&
    "message" in body &&
    typeof body.message === "string"
    ? body.message
    : fallback;
}

function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (razorpayConstructor()) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-craves-razorpay="checkout-v1"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Razorpay checkout could not be loaded.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.cravesRazorpay = "checkout-v1";
    script.referrerPolicy = "strict-origin";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Razorpay checkout could not be loaded."));
    document.head.appendChild(script);
  });
}

async function readPaymentStatus(paymentOrderId: string) {
  const response = await sessionFetch(
    `/api/payments/orders/${encodeURIComponent(paymentOrderId)}`,
    {
      cache: "no-store",
      credentials: "same-origin",
    },
  );
  const raw = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      responseMessage(raw, "Payment status could not be confirmed."),
    );
  }
  const parsed = parsePaymentStatus(raw);
  if (!parsed) {
    throw new Error("Craves returned an invalid payment status response.");
  }
  return parsed;
}

export function CheckoutPaymentButton({
  checkout,
  previewAmount,
  currency,
  disabled = false,
  failure,
  ensureCheckout,
  onFailure,
}: CheckoutPaymentButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function finishConfirmedOrder(currentCheckout: CustomerCheckout) {
    const orderId = currentCheckout.orders[0]?.id;
    if (!orderId) {
      throw new Error("Confirmed checkout did not include an order.");
    }

    window.sessionStorage.removeItem("craves.checkout.instructions");
    window.sessionStorage.removeItem("craves.checkout.id");
    window.sessionStorage.removeItem("craves.checkout.operationId");
    router.replace(`/orders/${orderId}`);
  }

  async function createPayment(checkoutId: string) {
    const response = await sessionFetch("/api/payments/orders", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkoutId }),
    });
    const raw = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        responseMessage(raw, "Payment order could not be created."),
      );
    }

    const parsed = parsePaymentSession(raw);
    if (!parsed) {
      throw new Error("Craves returned an invalid payment session.");
    }
    if (
      parsed.provider !== "RAZORPAY" ||
      !parsed.checkoutKeyId ||
      !parsed.providerOrderId ||
      parsed.amountPaise === null
    ) {
      throw new Error("Razorpay checkout configuration is incomplete.");
    }
    return parsed;
  }

  async function verifyPayment(
    currentCheckout: CustomerCheckout,
    paymentOrderId: string,
    result: RazorpaySuccess,
  ) {
    const response = await sessionFetch(
      `/api/payments/orders/${encodeURIComponent(paymentOrderId)}/verify`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerOrderId: result.razorpay_order_id,
          providerPaymentId: result.razorpay_payment_id,
          providerSignature: result.razorpay_signature,
        }),
      },
    );
    const raw = await response.json().catch(() => null);

    if (response.ok) {
      const verification = parsePaymentVerification(raw);
      if (!verification) {
        throw new Error("Craves returned an invalid payment verification response.");
      }
      if (verification.status === "PAID") {
        await finishConfirmedOrder(currentCheckout);
        return true;
      }
    }

    const status = await readPaymentStatus(paymentOrderId);
    if (status.status === "PAID") {
      await finishConfirmedOrder(currentCheckout);
      return true;
    }

    if (!response.ok) {
      throw new Error(
        responseMessage(raw, "Payment verification could not be completed."),
      );
    }
    return false;
  }

  async function openPayment() {
    if (busy || disabled) return;
    setBusy(true);
    onFailure(null);

    try {
      const session = await loadSession({ hydrateCustomerProfile: "background" });
      if (!session) {
        throw new Error("Your session expired. Sign in and try payment again.");
      }
      if (!checkout) {
        await ensureCheckout();
        return;
      }

      const currentCheckout = checkout;
      const payment = await createPayment(currentCheckout.id);

      await loadRazorpay();
      if (!razorpayConstructor()) {
        throw new Error("Razorpay checkout is unavailable.");
      }

      const profileName =
        [session.firstName, session.lastName].filter(Boolean).join(" ").trim() ||
        session.username ||
        "Craves customer";
      const contact = session.phoneNumber || session.phone || "";
      let bankFailureReason = "";

      const result = await new Promise<RazorpaySuccess>((resolve, reject) => {
        let settled = false;
        const Razorpay = razorpayConstructor();
        if (!Razorpay) {
          reject(new Error("Razorpay checkout is unavailable."));
          return;
        }
        const instance = new Razorpay({
          key: payment.checkoutKeyId!,
          amount: payment.amountPaise!,
          currency: payment.currency,
          order_id: payment.providerOrderId,
          name: "Craves",
          image: `${window.location.origin}/brand/craves-logo.svg`,
          description: `Craves order ${currentCheckout.id.slice(-8).toUpperCase()}`,
          prefill: {
            name: profileName,
            email: session.email || undefined,
            contact: contact || undefined,
          },
          handler: (response) => {
            if (settled) return;
            settled = true;
            resolve(response);
          },
          modal: {
            ondismiss: () => {
              if (settled) return;
              settled = true;
              reject(
                new Error(
                  bankFailureReason ||
                    "Razorpay checkout was closed before payment was completed.",
                ),
              );
            },
          },
          theme: { color: "#16A34A" },
        });

        instance.on("payment.failed", (response) => {
          bankFailureReason =
            response.error?.description ||
            response.error?.reason ||
            "The bank or payment provider declined the payment.";
        });
        instance.open();
      });

      const confirmed = await verifyPayment(
        currentCheckout,
        payment.paymentOrderId,
        result,
      );
      if (!confirmed) {
        onFailure({
          message:
            "Payment was submitted, but Craves has not confirmed it yet. Do not pay again until the status is checked.",
          retryAllowed: false,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Payment checkout could not be completed.";
      const uncertain =
        /verification|status could not be confirmed|submitted/i.test(message);
      onFailure({
        message: uncertain
          ? `${message} Do not pay again until the payment status is confirmed.`
          : checkout
            ? `${message} Nothing was charged by Craves. Your reviewed order is still available.`
            : `${message} Nothing was charged by Craves. Your cart is still here.`,
        retryAllowed: !uncertain,
      });
    } finally {
      setBusy(false);
    }
  }

  const authoritativeAmount = checkout?.grandTotal ?? null;
  const buttonLabel = failure?.retryAllowed
    ? checkout
      ? "Try payment again"
      : "Retry total"
    : failure
      ? "Payment pending"
      : authoritativeAmount !== null
        ? `Pay ${money(authoritativeAmount, checkout?.currency ?? currency)}`
        : "Preparing total…";

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E5E7EB] bg-white shadow-[0_-8px_28px_rgba(17,24,39,0.06)] lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:shadow-none">
      <div className="mx-auto flex max-w-2xl items-center gap-4 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-6 lg:max-w-none lg:flex-col lg:items-stretch lg:gap-3 lg:px-0 lg:pb-0 lg:pt-4">
        <div className="min-w-[7.5rem] lg:hidden">
          <p className="text-xl font-bold tabular-nums text-[#1A1A1A]">
            {authoritativeAmount !== null
              ? money(authoritativeAmount, checkout?.currency ?? currency)
              : money(previewAmount, currency)}
          </p>
          <p className="text-[10px] text-[#6B6B6B]">
            {authoritativeAmount !== null
              ? failure?.retryAllowed
                ? "not charged"
                : "incl. taxes"
              : "food subtotal · final total calculates automatically"}
          </p>
        </div>

        <button
          type="button"
          disabled={busy || disabled || Boolean(failure && !failure.retryAllowed)}
          onClick={() => void openPayment()}
          className="ml-auto inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-[11px] border border-[#138A3D] bg-[#16A34A] px-5 py-[13px] text-[15px] font-semibold text-white shadow-[0_4px_12px_rgba(22,163,74,0.22)] transition-[background-color,box-shadow,transform] hover:-translate-y-px hover:bg-[#15803D] hover:shadow-[0_7px_18px_rgba(22,163,74,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A34A]/35 focus-visible:ring-offset-2 sm:flex-none sm:min-w-52 lg:ml-0 lg:w-full lg:min-w-0 lg:flex-none disabled:pointer-events-none disabled:opacity-45"
        >
          {busy ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <LockKeyhole className="h-4 w-4" aria-hidden="true" />
          )}
          {busy
            ? checkout
              ? "Opening Razorpay…"
              : "Preparing total…"
            : buttonLabel}
        </button>
      </div>
    </div>
  );
}
```

### apps/customer-web-next/src/components/checkout/RazorpayPayment.tsx

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { parseCheckout, type CustomerCheckout } from "@/lib/checkout-contract";
import {
  parsePaymentSession,
  parsePaymentStatus,
  parsePaymentVerification,
  type CustomerPaymentSession,
  type PaymentStatus,
} from "@/lib/payment-contract";
import { loadSession } from "@/services/auth/cravesAuth";
import { clearCart, ensureCheckoutCart } from "@/services/api/cravesCart";
import { CheckoutHeader } from "@/components/checkout/CheckoutHeader";

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckout;
  }
}

type RazorpaySuccess = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayCheckout = {
  open(): void;
  on(
    event: "payment.failed",
    handler: (response: { error?: { description?: string } }) => void,
  ): void;
};

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description: string;
  handler(response: RazorpaySuccess): void;
  modal: { ondismiss(): void };
  theme: { color: string };
};

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-craves-razorpay="checkout-v1"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Razorpay checkout could not be loaded.")),
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.cravesRazorpay = "checkout-v1";
    script.referrerPolicy = "strict-origin";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Razorpay checkout could not be loaded."));
    document.head.appendChild(script);
  });
}

function responseMessage(body: unknown, fallback: string): string {
  return body &&
    typeof body === "object" &&
    "message" in body &&
    typeof body.message === "string"
    ? body.message
    : fallback;
}

function statusLabel(status: PaymentStatus | null): string {
  if (!status) return "Not created";
  return status.replaceAll("_", " ").toLocaleLowerCase("en-IN");
}

export function RazorpayPayment({ checkoutId }: { checkoutId: string }) {
  const router = useRouter();
  const [checkout, setCheckout] = useState<CustomerCheckout | null>(null);
  const [payment, setPayment] = useState<CustomerPaymentSession | null>(null);
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checkoutCartOwned, setCheckoutCartOwned] = useState(false);

  const loadCheckout = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const session = await loadSession({ hydrateCustomerProfile: "background" });
      if (!session) {
        router.replace("/");
        return;
      }
      const response = await fetch(
        `/api/checkout/${encodeURIComponent(checkoutId)}`,
        {
          cache: "no-store",
          credentials: "same-origin",
        },
      );
      const raw = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(responseMessage(raw, "Checkout could not be loaded."));
      }
      const parsed = parseCheckout(raw);
      if (!parsed) {
        throw new Error("Craves returned an invalid checkout response.");
      }
      const ownsCheckoutCart =
        parsed.status === "PAID"
          ? false
          : await ensureCheckoutCart(parsed.orders).catch(() => false);
      setCheckoutCartOwned(ownsCheckoutCart);
      setCheckout(parsed);
      setStatus(parsed.status === "PAID" ? "PAID" : null);
      setMessage(
        parsed.status === "PAID"
          ? "This checkout is already paid."
          : parsed.status === "CANCELLED"
            ? "This checkout was cancelled and cannot be paid."
            : "Ready to create a secure Razorpay payment order.",
      );
    } catch (caught) {
      setCheckout(null);
      setCheckoutCartOwned(false);
      setError(
        caught instanceof Error
          ? caught.message
          : "Checkout could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [checkoutId, router]);

  useEffect(() => {
    void loadCheckout();
  }, [loadCheckout]);

  async function clearPaidCheckoutCart() {
    if (!checkoutCartOwned) return;
    try {
      await clearCart();
      setCheckoutCartOwned(false);
    } catch {
      setCheckoutCartOwned(true);
    }
  }

  async function createPayment(): Promise<CustomerPaymentSession> {
    if (payment) return payment;
    const response = await fetch("/api/payments/orders", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkoutId }),
    });
    const raw = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        responseMessage(raw, "Payment order could not be created."),
      );
    }
    const parsed = parsePaymentSession(raw);
    if (!parsed) {
      throw new Error("Craves returned an invalid payment session.");
    }
    setPayment(parsed);
    setStatus(parsed.status);
    return parsed;
  }

  async function verifyPayment(
    result: RazorpaySuccess,
    paymentOrderId = payment?.paymentOrderId,
  ) {
    if (!paymentOrderId) {
      setError("Create the payment order before verification.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("Verifying the payment with the Craves backend…");
    try {
      const response = await fetch(
        `/api/payments/orders/${encodeURIComponent(paymentOrderId)}/verify`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            providerOrderId: result.razorpay_order_id,
            providerPaymentId: result.razorpay_payment_id,
            providerSignature: result.razorpay_signature,
          }),
        },
      );
      const raw = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(responseMessage(raw, "Payment verification failed."));
      }
      const verification = parsePaymentVerification(raw);
      if (!verification) {
        throw new Error(
          "Craves returned an invalid payment verification response.",
        );
      }
      if (verification.status === "PAID") {
        await clearPaidCheckoutCart();
      }
      setStatus(verification.status);
      setMessage(
        verification.status === "PAID"
          ? "Payment verified. Your order is now available in My Orders."
          : `Payment is currently ${statusLabel(verification.status)}. Complete Razorpay checkout and refresh again.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Payment verification failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function openCheckout() {
    if (!checkout || checkout.status !== "PAYMENT_PENDING" || busy) return;
    setBusy(true);
    setError("");
    setMessage("Preparing secure Razorpay checkout…");
    try {
      const nextPayment = await createPayment();
      await loadRazorpay();
      if (!window.Razorpay) {
        throw new Error("Razorpay checkout is unavailable.");
      }
      if (
        !nextPayment.checkoutKeyId ||
        !nextPayment.providerOrderId ||
        nextPayment.amountPaise === null
      ) {
        throw new Error("Razorpay checkout configuration is incomplete.");
      }
      const amountPaise = nextPayment.amountPaise;
      setMessage(
        "Complete payment inside the Razorpay window. Craves does not receive your card number, CVV or UPI PIN.",
      );
      const result = await new Promise<RazorpaySuccess>((resolve, reject) => {
        const instance = new window.Razorpay!({
          key: nextPayment.checkoutKeyId!,
          amount: amountPaise,
          currency: nextPayment.currency,
          order_id: nextPayment.providerOrderId!,
          name: "Craves",
          description: `Craves checkout ${checkout.id.slice(-8).toUpperCase()}`,
          handler: resolve,
          modal: {
            ondismiss: () =>
              reject(
                new Error(
                  "Razorpay checkout was closed before payment confirmation.",
                ),
              ),
          },
          theme: { color: "#F62E18" },
        });
        instance.on("payment.failed", (response) => {
          reject(
            new Error(
              response.error?.description || "Razorpay payment failed.",
            ),
          );
        });
        instance.open();
      });
      setMessage(
        "Razorpay returned a payment response. Verifying it with the Craves backend…",
      );
      await verifyPayment(result, nextPayment.paymentOrderId);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Payment checkout could not be opened.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function refreshStatus() {
    if (!payment || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/payments/orders/${encodeURIComponent(payment.paymentOrderId)}`,
        { cache: "no-store", credentials: "same-origin" },
      );
      const raw = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          responseMessage(raw, "Payment status could not be loaded."),
        );
      }
      const parsed = parsePaymentStatus(raw);
      if (!parsed) {
        throw new Error("Craves returned an invalid payment status response.");
      }
      if (parsed.status === "PAID") {
        await clearPaidCheckoutCart();
      }
      setStatus(parsed.status);
      setMessage(`Current payment status: ${statusLabel(parsed.status)}.`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Payment status could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }

  const paid = checkout?.status === "PAID" || status === "PAID";
  const cancelled =
    checkout?.status === "CANCELLED" || status === "CANCELLED";

  return (
    <div className="min-h-screen bg-white text-ink">
      <CheckoutHeader
        onBack={() => window.history.back()}
        title="Secure payment"
        subtitle="Razorpay hosted checkout"
      />

      <main className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-8">
        {loading ? (
          <div className="space-y-4" aria-hidden="true">
            <div className="h-[30rem] animate-pulse rounded-2xl bg-[#F1F3F5]" />
            <div className="h-40 animate-pulse rounded-2xl bg-[#F1F3F5]" />
            <div className="h-12 animate-pulse rounded-xl bg-[#F1F3F5]" />
          </div>
        ) : !checkout ? (
          <section className="rounded-2xl border border-error/20 bg-white p-8 text-center shadow-[var(--shadow-card)]">
            <AlertTriangle
              className="mx-auto h-10 w-10 text-error"
              aria-hidden="true"
            />
            <h1 className="mt-4 font-display text-2xl font-bold text-ink">
              Payment checkout unavailable
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {error}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => void loadCheckout()}
                className="btn-primary"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry
              </button>
              <Link
                to="/orders"
                className="inline-flex min-h-11 items-center rounded-lg border border-border bg-white px-4 text-sm font-semibold text-ink transition-colors hover:border-primary"
              >
                View orders
              </Link>
            </div>
          </section>
        ) : (
          <div className="space-y-4">
            <section className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-card)] sm:p-6 md:p-7">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F1F3F5] text-[#F62E18]">
                <ShieldCheck
                  className="h-8 w-8"
                  strokeWidth={2.5}
                  aria-hidden="true"
                />
              </div>

              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Checkout #{checkout.id.slice(-8).toUpperCase()}
              </p>
              <h1 className="mt-2 font-display text-2xl font-bold tracking-[-0.035em] text-ink sm:text-3xl">
                {paid
                  ? "Payment verified"
                  : cancelled
                    ? "Checkout cancelled"
                    : "Pay through Razorpay"}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                Craves creates the payment order on the backend. Razorpay collects
                card, UPI and banking details in its hosted checkout.
              </p>

              <dl className="mt-6 space-y-3 rounded-2xl bg-[#F1F3F5] p-4 text-sm sm:p-5">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink">Food subtotal</dt>
                  <dd className="font-semibold text-ink">
                    {money(checkout.foodSubtotal, checkout.currency)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink">Platform fee</dt>
                  <dd className="font-semibold text-ink">
                    {money(checkout.platformFee, checkout.currency)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink">Tax</dt>
                  <dd className="font-semibold text-ink">
                    {money(checkout.taxAmount, checkout.currency)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink">Delivery</dt>
                  <dd className="font-semibold text-ink">
                    {money(checkout.deliveryFee, checkout.currency)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-[#D9DDE1] pt-4">
                  <dt className="font-display text-base font-bold text-ink">
                    Grand total
                  </dt>
                  <dd className="font-display text-2xl font-bold tracking-[-0.03em] text-ink">
                    {money(checkout.grandTotal, checkout.currency)}
                  </dd>
                </div>
              </dl>

              {!paid && !cancelled && (
                <button
                  type="button"
                  disabled={busy || checkout.status !== "PAYMENT_PENDING"}
                  onClick={() => void openCheckout()}
                  className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#F62E18] px-5 text-sm font-bold text-white transition-colors hover:bg-[#DF2815] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F62E18] disabled:cursor-wait disabled:opacity-60"
                >
                  {busy ? (
                    <LoaderCircle
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <CreditCard className="h-4 w-4" aria-hidden="true" />
                  )}
                  {busy ? "Processing…" : "Pay securely with Razorpay"}
                </button>
              )}

              {payment && !paid && !cancelled && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void refreshStatus()}
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-ink transition-colors hover:border-primary disabled:opacity-50"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
                  status
                </button>
              )}

              {message && (
                <p
                  role="status"
                  className="mt-5 rounded-xl bg-[#F1F3F5] p-3 text-sm leading-6 text-muted-foreground"
                >
                  {message}
                </p>
              )}
              {error && (
                <p
                  role="alert"
                  className="mt-5 rounded-xl border border-error/20 bg-error/5 p-3 text-sm font-medium text-error"
                >
                  {error}
                </p>
              )}

              {paid && (
                <Link
                  to="/orders"
                  className="btn-primary mt-6 inline-flex w-full"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> View
                  your orders
                </Link>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-card)] sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Payment state
              </p>
              <p className="mt-2 font-display text-xl font-bold capitalize text-ink sm:text-2xl">
                {statusLabel(
                  status ?? (checkout.status === "PAID" ? "PAID" : null),
                )}
              </p>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                Only the Craves backend determines whether a payment is paid.
                Closing the Razorpay window does not by itself confirm payment.
              </p>
            </section>

            <Link
              to="/orders"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#C9CDD2] bg-white px-4 text-sm font-semibold text-ink transition-colors hover:border-[#F62E18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/20"
            >
              <ArrowLeft
                className="h-4 w-4"
                strokeWidth={2.5}
                aria-hidden="true"
              />{" "}
              Back to orders
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
```

### apps/customer-web-next/src/components/chef-access-boundary.tsx

```tsx
"use client";

import Link from "next/link";
import { Fragment, type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import {
  captureSessionContext,
  getSession,
  isSessionContextCurrent,
  isSessionReady,
  loadSession,
  subscribeSession,
  synchronizeSessionRoles,
  type CravesUser,
} from "@/services/auth/cravesAuth";

type AccessState = "synchronizing" | "ready" | "sign-in" | "not-approved" | "unavailable";

function hasChefRole(user: CravesUser | null): boolean {
  return Boolean(user?.status === "ACTIVE" && user.roles.some((role) => role.toUpperCase() === "CHEF"));
}

function accessScope(): string {
  const context = captureSessionContext();
  return JSON.stringify([context.generation, context.identityId, hasChefRole(getSession()), isSessionReady()]);
}
const serverScope = () => "server";

export function ChefAccessBoundary({ children }: { children: ReactNode }) {
  const scope = useSyncExternalStore(subscribeSession, accessScope, serverScope);
  const [access, setAccess] = useState<{ scope: string; state: AccessState }>({ scope: "server", state: "synchronizing" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      if (active) { active = false; setAccess({ scope, state: "unavailable" }); }
    }, 15_000);

    void (async () => {
      const initial = captureSessionContext();
      const current = await loadSession({ hydrateCustomerProfile: "skip" });
      if (!active) return;
      // Initial /me may establish an owner. An existing owner's logout or
      // replacement invalidates all work started under that session generation.
      if (initial.identityId !== null && !isSessionContextCurrent(initial)) return;
      if (!current) {
        setAccess({ scope: accessScope(), state: isSessionReady() ? "unavailable" : "sign-in" });
        return;
      }
      if (getSession()?.id !== current.id) return;
      if (!isSessionReady()) {
        setAccess({ scope: accessScope(), state: "sign-in" });
        return;
      }

      if (!hasChefRole(current)) {
        setAccess({ scope: accessScope(), state: "not-approved" });
        return;
      }

      // Auth /me reads the current database roles. Rotate the HTTP-only token
      // before calling Catalog or Order so its signed JWT carries CHEF too.
      const established = captureSessionContext();
      const synchronized = await synchronizeSessionRoles({ hydrateCustomerProfile: "skip" });
      if (!active || !isSessionContextCurrent(established) || getSession()?.id !== current.id) return;
      setAccess({ scope: accessScope(), state: !synchronized ? "unavailable" : isSessionReady() && synchronized.id === current.id && hasChefRole(synchronized) ? "ready" : "not-approved" });
    })().catch(() => {
      if (active) setAccess({ scope, state: "unavailable" });
    }).finally(() => window.clearTimeout(timeout));

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [scope, attempt]);

  const state = access.scope === scope ? access.state : "synchronizing";
  if (state === "ready" && isSessionReady() && hasChefRole(getSession())) {
    // Reset private forms and request receipts on owner/session changes, while
    // preserving local work during healthy same-owner email/profile updates.
    return <Fragment key={scope}>{children}</Fragment>;
  }

  return (
    <section className="rounded-[30px] border border-border bg-white p-7 text-slate-950">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#6930CA]">
        Secure chef access
      </p>
      <h2 className="mt-3 text-2xl font-bold">
        {state === "synchronizing"
          ? "Synchronizing your approved chef role…"
          : state === "not-approved"
            ? "Chef approval is still required"
            : state === "unavailable"
              ? "We couldn’t check your chef access"
            : "Sign in again to continue"}
      </h2>
      {state !== "synchronizing" && (
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {state === "not-approved"
            ? "You are signed in. Submit or review your chef application; Craves admin approval remains authoritative."
            : state === "unavailable"
              ? "Check your connection and try again. Your chef tools stay closed until access is confirmed."
            : "Complete mobile OTP sign-in again so Catalog and Order services receive your current roles."}
        </p>
      )}
      {state === "unavailable" ? <button type="button" className="mt-7 min-h-12 rounded-full bg-[#F62E18] px-6 font-semibold text-white" onClick={() => { setAccess({ scope, state: "synchronizing" }); setAttempt(value => value + 1); }}>Try again</button> : null}
      {state === "sign-in" ? (
        <Link
          href="/sign-in?returnTo=/chef"
          className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#F62E18] px-6 font-semibold text-white sm:w-auto"
        >
          Verify and continue
        </Link>
      ) : null}

      {state === "not-approved" ? (
        <Link
          href="/chef/application"
          className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#F62E18] px-6 font-semibold text-white sm:w-auto"
        >
          Open chef application
        </Link>
      ) : null}

      {state !== "synchronizing" ? (
        <div className="mt-3">
          <Link
            href="/home"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#F1F3F5] px-5 text-sm font-semibold text-[#1A1A1A] transition hover:bg-[#E5E7EB]"
          >
            Switch to Customer Mode
          </Link>
        </div>
      ) : null}
    </section>
  );
}
```

### apps/customer-web-next/src/components/chef-application-session-boundary.tsx

```tsx
"use client";

import Link from "next/link";
import { Fragment, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { captureSessionContext, getSession, isSessionContextCurrent, isSessionReady, loadSession, subscribeSession } from "@/services/auth/cravesAuth";

function sessionScope() {
  const context = captureSessionContext();
  return JSON.stringify([context.generation, context.identityId, isSessionReady()]);
}
const serverScope = () => "server";

/** Applicants need a current account, not an already-approved CHEF role. */
export function ChefApplicationSessionBoundary({ children }: { children: ReactNode }) {
  const scope = useSyncExternalStore(subscribeSession, sessionScope, serverScope);
  const [attempt, setAttempt] = useState(0);
  const [check, setCheck] = useState<{ scope: string; state: "ready" | "unavailable" }>({ scope: "", state: "unavailable" });
  useEffect(() => {
    let active = true;
    const initial = captureSessionContext();
    const timeout = window.setTimeout(() => {
      if (active) { active = false; setCheck({ scope, state: "unavailable" }); }
    }, 15_000);
    void loadSession({ hydrateCustomerProfile: "skip" }).then(user => {
      if (initial.identityId !== null && !isSessionContextCurrent(initial)) return;
      if (active) setCheck({ scope: sessionScope(), state: user && isSessionReady() && getSession()?.id === user.id ? "ready" : "unavailable" });
    }).catch(() => {
      if (active) setCheck({ scope, state: "unavailable" });
    }).finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); };
  }, [scope, attempt]);

  if (check.scope === scope && check.state === "ready" && isSessionReady()) {
    return <Fragment key={scope}>{children}</Fragment>;
  }
  const unavailable = check.scope === scope && check.state === "unavailable";
  return <section className="rounded-3xl border border-slate-200 bg-white p-6" aria-busy={!unavailable}>
    <h2 className="text-xl font-bold">{unavailable ? "We couldn’t open your application" : "Opening your chef application…"}</h2>
    <p role="status" className="mt-3 text-sm text-slate-600">{unavailable ? "Check your connection and try again. If your session has ended, sign in to continue." : "Checking your sign-in before loading your saved details."}</p>
    {unavailable && <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" className="min-h-12 rounded-full border border-slate-300 px-5 font-semibold" onClick={() => { setCheck({ scope: "", state: "unavailable" }); setAttempt(value => value + 1); }}>Try again</button>
      <Link href="/sign-in?returnTo=/chef/application" className="inline-flex min-h-12 items-center rounded-full bg-primary px-5 font-semibold text-white">Sign in</Link>
    </div>}
  </section>;
}
```

### apps/customer-web-next/src/components/chef-application-workspace.tsx

```tsx
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/buttons/button";
import { AddressMapPicker } from "@/components/location/AddressMapPicker";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronRight,
  MapPin,
  Phone,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { ChefApplicationDocumentPanel } from "@/components/chef-application-document-panel";
import type { CustomerAddress } from "@/lib/address-contract";
import { selectActiveDeliveryAddress } from "@/lib/address-selection";
import { parseChefApplication, type ChefApplication } from "@/lib/chef-application-contract";
import { parseCustomerProfile, type CustomerProfile } from "@/lib/profile-contract";
import { captureSessionContext, isSessionContextCurrent } from "@/services/auth/cravesAuth";
import { reverseGeocodeCurrentLocation } from "@/services/location/reverseGeocode";
import { EmailVerificationPanel } from "@/components/auth/EmailVerificationPanel";
import { chefEmailEligible, type EmailVerificationState } from "@/lib/email-verification-contract";

type FormState = {
  email: string;
  firstName: string;
  lastName: string;
  addressLine1: string;
  addressLine2: string;
  landmark: string;
  city: string;
  state: string;
  postalCode: string;
  latitude: string;
  longitude: string;
};

type ApplicationStep =
  | "welcome"
  | "account"
  | "kitchen"
  | "kitchen-photos"
  | "fssai"
  | "about"
  | "address"
  | "review"
  | "documents-intro"
  | "documents"
  | "waiting"
  | "approved";

const EMPTY: FormState = {
  email: "",
  firstName: "",
  lastName: "",
  addressLine1: "",
  addressLine2: "",
  landmark: "",
  city: "",
  state: "",
  postalCode: "",
  latitude: "",
  longitude: "",
};

const PENDING_UPDATE_LABEL = "Update pending application";
const INPUT_CLASS =
  "mt-2 w-full rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-base text-[#1A1A1A] outline-none transition focus:border-[#F62E18] focus:ring-2 focus:ring-[#F62E18]/10 disabled:bg-[#F1F3F5]";

function fromApplication(application: ChefApplication): FormState {
  return {
    email: application.email ?? "",
    firstName: application.firstName ?? "",
    lastName: application.lastName ?? "",
    addressLine1: application.addressLine1 ?? "",
    addressLine2: application.addressLine2 ?? "",
    landmark: application.landmark ?? "",
    city: application.city ?? "",
    state: application.state ?? "",
    postalCode: application.postalCode ?? "",
    latitude: application.latitude === null ? "" : String(application.latitude),
    longitude: application.longitude === null ? "" : String(application.longitude),
  };
}

function prefillNewApplication(
  application: ChefApplication,
  profile: CustomerProfile | null,
  addresses: CustomerAddress[],
): FormState {
  const form = fromApplication(application);
  const address = selectActiveDeliveryAddress(addresses);
  return {
    ...form,
    email: "",
    firstName: form.firstName || profile?.firstName || "",
    lastName: form.lastName || profile?.lastName || "",
    addressLine1: form.addressLine1 || address?.addressLine1 || "",
    addressLine2: form.addressLine2 || address?.addressLine2 || "",
    landmark: form.landmark || address?.landmark || "",
    city: form.city || address?.city || "",
    state: form.state || address?.state || "",
    postalCode: form.postalCode || address?.postalCode || "",
    latitude:
      form.latitude ||
      (typeof address?.latitude === "number" ? String(address.latitude) : ""),
    longitude:
      form.longitude ||
      (typeof address?.longitude === "number" ? String(address.longitude) : ""),
  };
}

function needsPhotoCorrection(application: ChefApplication): boolean {
  return (
    application.status === "REJECTED" &&
    /photo|image|id|aadhaar|pan|document|proof/i.test(application.rejectionReason ?? "")
  );
}

function hasRequiredEvidence(application: ChefApplication): boolean {
  const types = new Set(application.documents.filter(document => document.status === "UPLOADED" || document.status === "APPROVED").map((document) => document.documentType));
  const modernEvidence = [
    "APPLICANT_PHOTO",
    "GOVERNMENT_ID_FRONT",
    "GOVERNMENT_ID_BACK",
    "TAX_ID_CARD",
  ].every((type) => types.has(type as never));
  return modernEvidence;
}

function applicationError(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "message" in body && typeof body.message === "string") {
    return body.message.slice(0, 500);
  }
  return fallback;
}

function addressSummary(form: FormState): string {
  return [
    form.addressLine1,
    form.addressLine2,
    form.landmark,
    form.city,
    form.state,
    form.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

function StepHeader({
  part,
  label,
  onBack,
}: {
  part: number;
  label: string;
  onBack?: () => void;
}) {
  return (
    <div>
      <div className="flex min-h-11 items-center justify-between gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-semibold text-[#1A1A1A] hover:bg-[#F1F3F5]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </button>
        ) : (
          <span />
        )}
        <p className="text-sm font-semibold text-[#6B6B6B]">Step {part} of 8 · {label}</p>
      </div>
      <div className="mt-2 grid grid-cols-8 gap-1.5" aria-hidden="true">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((value) => (
          <span
            key={value}
            className={`h-1.5 rounded-full ${value <= part ? "bg-[#F62E18]" : "bg-[#E5E7EB]"}`}
          />
        ))}
      </div>
    </div>
  );
}

function IconCircle({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
      {children}
    </span>
  );
}

export function ChefApplicationWorkspace() {
  const [application, setApplication] = useState<ChefApplication | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [emailVerification, setEmailVerification] = useState<EmailVerificationState | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [step, setStep] = useState<ApplicationStep>("welcome");
  const [message, setMessage] = useState("Loading your application…");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [invalidField, setInvalidField] = useState<keyof FormState | null>(null);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const locationRequest = useRef(0);
  const mounted = useRef(false);
  const readRevision = useRef(0);
  const pendingRead = useRef<AbortController | null>(null);
  const editedFields = useRef(new Set<keyof FormState>());
  const addressFields: (keyof FormState)[] = ["addressLine1", "addressLine2", "landmark", "city", "state", "postalCode", "latitude", "longitude"];

  function markAddressEdited() {
    for (const name of addressFields) editedFields.current.add(name);
  }

  useEffect(() => {
    if (!invalidField) return;
    const input = document.getElementById(`chef-${invalidField}`);
    input?.focus({ preventScroll: true });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    input?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    if (!reduced) input?.animate([{ transform: "translateX(0)" }, { transform: "translateX(-3px)" }, { transform: "translateX(3px)" }, { transform: "translateX(0)" }], { duration: 240, iterations: 1 });
  }, [invalidField, validationAttempt, step]);

  function invalidate(name: keyof FormState, reason: string) {
    setInvalidField(name);
    setValidationAttempt(value => value + 1);
    setMessage(reason);
  }
  function inputProps(name: keyof FormState) {
    return { id: `chef-${name}`, name, "aria-invalid": invalidField === name, "aria-describedby": invalidField === name ? "chef-field-error" : undefined };
  }
  async function moveKitchenPin(next: { latitude: number; longitude: number }) {
    const version = ++locationRequest.current;
    const context = captureSessionContext();
    const currentPin = () => mounted.current && version === locationRequest.current && isSessionContextCurrent(context);
    markAddressEdited();
    setForm(current => ({ ...current, latitude: String(next.latitude), longitude: String(next.longitude) }));
    setLocating(true);
    try {
      const address = await reverseGeocodeCurrentLocation(next.latitude, next.longitude);
      if (!currentPin()) return;
      setForm(current => ({ ...current, addressLine1: address.houseNumber || address.formattedAddress, addressLine2: [address.street, address.area].filter(Boolean).join(", "), city: address.city || current.city, state: address.state || current.state, postalCode: address.postalCode || current.postalCode }));
      setMessage("Pin updated. Check your house and address details below.");
    } catch {
      if (currentPin()) setMessage("Pin updated. Please enter the address details below.");
    } finally { if (currentPin()) setLocating(false); }
  }
  async function openReview() {
    setBusy(true);
    try { if (await load()) setStep("review"); }
    catch { /* load preserves the current request error. */ }
    finally { if (mounted.current) setBusy(false); }
  }

  async function load(): Promise<boolean> {
    const revision = ++readRevision.current;
    const context = captureSessionContext();
    pendingRead.current?.abort();
    const controller = new AbortController();
    pendingRead.current = controller;
    const currentRead = () => mounted.current && revision === readRevision.current && isSessionContextCurrent(context);
    const options = { cache: "no-store" as const, credentials: "same-origin" as const, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) };
    setLoadFailed(false);
    try {
      // Saved application status is authoritative; display prefills never hold it up.
      const applicationResponse = await fetch("/api/chef/application", options);
      const rawApplication = await applicationResponse.json().catch(() => null);
      if (!currentRead()) return false;
      const applicationBody = parseChefApplication(rawApplication);
      if (!applicationResponse.ok || !applicationBody) {
        throw new Error(applicationResponse.status === 401
          ? "Sign in to continue your chef application."
          : applicationError(rawApplication, "We couldn’t load your application right now."));
      }
      editedFields.current.clear();
      setApplication(applicationBody);
      setProfile(null);
      setForm(applicationBody.status === "NOT_SUBMITTED" ? prefillNewApplication(applicationBody, null, []) : fromApplication(applicationBody));
      if (applicationBody.status === "NOT_SUBMITTED") {
        setStep("welcome");
        // Fill each optional response independently, without replacing local edits
        // (including fields the applicant deliberately cleared).
        function mergePrefill(profile: CustomerProfile | null, addresses: CustomerAddress[]) {
          if (!currentRead()) return;
          const suggested = prefillNewApplication(applicationBody!, profile, addresses);
          setForm(previous => {
            if (!currentRead()) return previous;
            const next = { ...previous };
            for (const name of Object.keys(next) as (keyof FormState)[]) {
              if (!editedFields.current.has(name) && !previous[name]) next[name] = suggested[name];
            }
            return next;
          });
        }
        void fetch("/api/customer/profile", options).then(async response => {
          const profile = response.ok ? parseCustomerProfile(await response.json().catch(() => null)) : null;
          if (!currentRead()) return;
          setProfile(profile);
          mergePrefill(profile, []);
        }).catch(() => undefined);
        void fetch("/api/customer/addresses", options).then(async response => {
          const addresses = response.ok ? await response.json().catch(() => []) : [];
          mergePrefill(null, Array.isArray(addresses) ? addresses : []);
        }).catch(() => undefined);
      } else if (applicationBody.status === "APPROVED") setStep("approved");
      else if (needsPhotoCorrection(applicationBody) && !hasRequiredEvidence(applicationBody)) setStep("documents-intro");
      else if (applicationBody.status === "REJECTED") setStep("review");
      else if (hasRequiredEvidence(applicationBody)) setStep("waiting");
      else setStep("documents-intro");
      setMessage("");
      return true;
    } catch (error) {
      if (!currentRead()) return false;
      setLoadFailed(true);
      setMessage(options.signal.aborted || error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
        ? "Loading took too long. Please try again."
        : error instanceof Error ? error.message : "We couldn’t load your application right now.");
      throw error;
    }
  }

  useEffect(() => {
    mounted.current = true;
    void load().catch(() => undefined);
    return () => {
      mounted.current = false;
      readRevision.current += 1;
      locationRequest.current += 1;
      pendingRead.current?.abort();
    };
  }, []);

  function field<K extends keyof FormState>(name: K, value: FormState[K]) {
    editedFields.current.add(name);
    if (addressFields.includes(name)) { markAddressEdited(); locationRequest.current += 1; setLocating(false); }
    setForm((current) => ({ ...current, [name]: value }));
    if (invalidField === name) { setInvalidField(null); setMessage(""); }
  }

  function go(next: ApplicationStep) {
    setMessage("");
    setInvalidField(null);
    setStep(next);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  function continueAbout() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      invalidate(!form.firstName.trim() ? "firstName" : "lastName", !form.firstName.trim() ? "First name is required." : "Last name is required.");
      return;
    }
    go("account");
  }

  function continueAddress() {
    if (!form.addressLine1.trim() || !form.city.trim() || !form.state.trim()) {
      invalidate(!form.addressLine1.trim() ? "addressLine1" : !form.city.trim() ? "city" : "state", !form.addressLine1.trim() ? "House or building is required." : !form.city.trim() ? "City is required." : "State is required.");
      return;
    }
    go("kitchen-photos");
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage("This browser can’t use your current location. You can type the address below instead.");
      return;
    }
    const version = ++locationRequest.current;
    const context = captureSessionContext();
    const currentLocation = () => mounted.current && version === locationRequest.current && isSessionContextCurrent(context);
    markAddressEdited();
    setLocating(true);
    setMessage("Finding your kitchen address…");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (!currentLocation()) return;
        const latitude = Number(position.coords.latitude.toFixed(7));
        const longitude = Number(position.coords.longitude.toFixed(7));
        try {
          const detected = await reverseGeocodeCurrentLocation(latitude, longitude);
          if (!currentLocation()) return;
          const areaDetails = [detected.street, detected.area, detected.district]
            .filter(Boolean)
            .join(", ");
          setForm((current) => ({
            ...current,
            addressLine1: detected.houseNumber || detected.formattedAddress,
            addressLine2: detected.houseNumber ? areaDetails : current.addressLine2,
            city: detected.city || current.city,
            state: detected.state || current.state,
            postalCode: detected.postalCode || current.postalCode,
            latitude: String(latitude),
            longitude: String(longitude),
          }));
          setMessage(
            detected.preciseHouseNumber
              ? "We found your neighborhood. Please check the address below."
              : "We found the area. Please add or check your house or building details below.",
          );
        } catch {
          if (!currentLocation()) return;
          setForm((current) => ({
            ...current,
            latitude: String(latitude),
            longitude: String(longitude),
          }));
          setMessage("We found your location, but not the full written address. Please type the missing details below.");
        } finally {
          if (currentLocation()) setLocating(false);
        }
      },
      () => {
        if (!currentLocation()) return;
        setLocating(false);
        setMessage("Location wasn’t shared. That’s okay — type your kitchen address below.");
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const locked = application?.status === "APPROVED";
    if (locked || loadFailed || busy || !application) return;
    if (!chefEmailEligible(emailVerification)) {
      setStep("account");
      setMessage("Verify your email before submitting your chef application.");
      return;
    }
    if (!emailVerification?.email || !form.firstName.trim() || !form.lastName.trim()) {
      setStep(!form.firstName.trim() || !form.lastName.trim() ? "about" : "account");
      invalidate(!form.firstName.trim() ? "firstName" : !form.lastName.trim() ? "lastName" : "email", "Complete your required contact details.");
      return;
    }
    if (!form.addressLine1.trim() || !form.city.trim() || !form.state.trim()) {
      setStep("address");
      invalidate(!form.addressLine1.trim() ? "addressLine1" : !form.city.trim() ? "city" : "state", !form.addressLine1.trim() ? "House or building is required." : !form.city.trim() ? "City is required." : "State is required.");
      return;
    }

    const revision = ++readRevision.current;
    const context = captureSessionContext();
    const currentSave = () => mounted.current && revision === readRevision.current && isSessionContextCurrent(context);
    pendingRead.current?.abort();
    locationRequest.current += 1;
    setLocating(false);
    const updating = application?.status === "PENDING";
    setBusy(true);
    setMessage(updating ? "Saving your changes…" : "Saving your details…");
    try {
      const response = await fetch("/api/chef/application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          email: emailVerification?.email,
          addressLine2: form.addressLine2 || null,
          landmark: form.landmark || null,
          postalCode: form.postalCode || null,
          latitude: form.latitude === "" ? null : Number(form.latitude),
          longitude: form.longitude === "" ? null : Number(form.longitude),
        }),
        signal: AbortSignal.timeout(45_000),
      });
      const raw = await response.json().catch(() => null);
      const body = parseChefApplication(raw);
      if (!currentSave()) return;
      if (!response.ok || !body) {
        throw new Error(
          applicationError(raw, response.status === 400
            ? "Please check your details and try again."
            : "We couldn’t save your details. Please try again."),
        );
      }
      setApplication(body);
      setForm(fromApplication(body));
      setMessage("");
      if (body.status === "APPROVED") setStep("approved");
      else if (hasRequiredEvidence(body)) setStep("review");
      else setStep("documents-intro");
    } catch (error) {
      if (!currentSave()) return;
      setMessage(error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
        ? "Saving took too long. Check your application status before trying again."
        : error instanceof Error ? error.message : "We couldn’t save your details. Please try again.");
    } finally {
      if (currentSave()) setBusy(false);
    }
  }

  async function refreshStatus() {
    setBusy(true);
    setMessage("Checking your application status…");
    try {
      await load();
    } catch {
      // load already shows the current failure and keeps editing disabled.
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  const locked = !application || loadFailed || application.status === "APPROVED";


  if (!loadFailed && message.startsWith("Loading") && !application) {
    return <div className="h-72 animate-pulse rounded-3xl bg-[#F1F3F5]" aria-label="Loading your application" />;
  }

  if (!application && message) {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center">
        <p className="text-sm text-[#6B6B6B]">{message}</p>
        <button type="button" disabled={busy} onClick={() => void refreshStatus()} className="mt-5 rounded-full bg-[#F62E18] px-6 py-3 font-semibold text-white">{busy ? "Checking…" : "Try again"}</button>
      </section>
    );
  }

  if (step === "welcome") {
    return <section className="chef-step overflow-hidden rounded-3xl border border-[#E5E7EB] bg-white shadow-[var(--shadow-card)]">
      <img src="/home/cravings/craves-home-banner.webp" alt="Homemade food prepared for sharing" className="aspect-[16/7] w-full object-cover object-right" fetchPriority="high" />
      <div className="p-6 md:p-9"><p className="text-sm font-semibold text-primary">Become a Craves Chef</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Share your homemade food with thousands of customers</h1>
        <div className="mt-6 space-y-3 text-sm">{["Earn from your cooking", "Reach nearby customers", "Manage your kitchen easily"].map(item => <p key={item} className="flex items-center gap-3"><Check className="h-5 w-5 text-primary" aria-hidden="true" />{item}</p>)}</div>
        <Button className="mt-7 w-full" onClick={() => go("about")}>Become a Chef <ChevronRight className="h-4 w-4" /></Button>
        <Button asChild variant="ghost" className="mt-2 w-full"><Link href="/sign-in?returnTo=/chef">Already a Chef? Login</Link></Button>
      </div>
    </section>;
  }

  if (step === "account") {
    return <section className="chef-step rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
      <StepHeader part={2} label="Your account" onBack={() => go("about")} />
      <h1 className="mt-7 text-3xl font-bold">Let’s get to know you</h1>
      <p className="mt-3 text-sm text-[#6B6B6B]">Use your existing Craves phone sign-in and verify the email for your Chef application.</p>
      <div className="mt-5 flex items-center gap-3 rounded-2xl bg-[#F1F3F5] p-4"><Phone className="h-5 w-5 text-primary" /><span className="text-sm">{profile?.registeredPhoneNumber ? `Signed in with ${profile.registeredPhoneNumber}` : "Your signed-in Craves account is connected."}</span></div>
      <div className="mt-5"><EmailVerificationPanel required onStateChange={state => { setEmailVerification(state); if (state?.email) field("email", state.email); }} /></div>
      <Button className="mt-6 w-full" disabled={!chefEmailEligible(emailVerification)} onClick={() => go("kitchen")}>Continue</Button>
    </section>;
  }

  if (step === "kitchen" || step === "kitchen-photos" || step === "fssai") {
    const kitchenStep = step === "kitchen";
    const photoStep = step === "kitchen-photos";
    return <form onSubmit={submit} className="chef-step rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
      <StepHeader part={kitchenStep ? 3 : photoStep ? 5 : 6} label={kitchenStep ? "Kitchen details" : photoStep ? "Kitchen photos" : "Food safety"} onBack={() => go(kitchenStep ? "account" : photoStep ? "address" : "kitchen-photos")} />
      <h1 className="mt-7 text-3xl font-bold">{kitchenStep ? "Tell customers about your kitchen" : photoStep ? "Show your kitchen" : "Food Safety Details"}</h1>
      <p className="mt-3 text-sm leading-6 text-[#6B6B6B]">{kitchenStep ? "You can save your kitchen name, description and contact details after your Chef application is approved." : photoStep ? "Kitchen-photo verification is not available yet. Photos cannot be submitted in this step." : "FSSAI submission and application assistance are not available yet. Identity approval does not verify food-business compliance."}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">{(kitchenStep ? ["Kitchen name & description", "Kitchen contact details"] : photoStep ? ["Cooking area", "Storage area", "Hygiene area", "Kitchen overview"] : ["Already have FSSAI", "Need help applying"]).map(item => <div key={item} className="rounded-2xl border border-[#E5E7EB] bg-[#F1F3F5] p-5"><p className="font-semibold">{item}</p><p className="mt-2 text-xs text-[#6B6B6B]">{kitchenStep ? "Available after approval" : "Not available yet"}</p></div>)}</div>
      {message ? <p role="alert" className="mt-4 text-sm">{message}</p> : null}
      {kitchenStep || photoStep ? <Button type="button" className="mt-7 w-full" onClick={() => go(kitchenStep ? "address" : "fssai")}>Continue</Button> : <><p className="mt-5 text-sm text-[#6B6B6B]">Save your verified contact and location details to open secure identity uploads.</p><Button type="submit" aria-label={application?.status === "PENDING" ? PENDING_UPDATE_LABEL : undefined} className="mt-5 w-full" disabled={busy || locked || !chefEmailEligible(emailVerification)}>{busy ? "Saving…" : "Save details and continue"}</Button>{!chefEmailEligible(emailVerification) ? <Button type="button" variant="outline" className="mt-3 w-full" onClick={() => go("account")}>Verify your email</Button> : null}</>}
    </form>;
  }

  if (step === "about") {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
        <StepHeader part={1} label="Personal details" onBack={() => go("welcome")} />
        <div className="mt-7"><IconCircle><UserRound className="h-7 w-7" aria-hidden="true" /></IconCircle></div>
        <h1 className="mt-5 text-3xl font-bold text-[#1A1A1A]">What’s your name?</h1>
        <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">Use the same name that appears on your ID. Both names are required.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-[#1A1A1A]">First name<input {...inputProps("firstName")} value={form.firstName} onChange={(event) => field("firstName", event.target.value)} className={INPUT_CLASS} autoComplete="given-name" /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">Last name<input {...inputProps("lastName")} value={form.lastName} onChange={(event) => field("lastName", event.target.value)} className={INPUT_CLASS} autoComplete="family-name" /></label>
        </div>
        {profile?.registeredPhoneNumber ? <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[#F1F3F5] p-4 text-sm text-[#6B6B6B]"><Phone className="h-5 w-5 shrink-0 text-[#F62E18]" aria-hidden="true" /><span>Your Craves phone number is already saved: <strong className="text-[#1A1A1A]">{profile.registeredPhoneNumber}</strong></span></div> : null}
        {message ? <p id="chef-field-error" role="alert" className="mt-4 text-sm font-medium text-[#F62E18]">{message}</p> : null}
        <button type="button" onClick={continueAbout} className="mt-7 min-h-12 w-full rounded-full bg-[#F62E18] px-6 font-semibold text-white">Continue</button>
      </section>
    );
  }

  if (step === "address") {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
        <StepHeader part={4} label="Kitchen location" onBack={() => go("kitchen")} />
        <div className="mt-7"><IconCircle><MapPin className="h-7 w-7" aria-hidden="true" /></IconCircle></div>
        <h1 className="mt-5 text-3xl font-bold text-[#1A1A1A]">Where is your kitchen located?</h1>
        <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">This is the kitchen address used for food pickup. House or building, city and state are required; other fields are optional.</p>
        <button type="button" disabled={locating} onClick={useCurrentLocation} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-[#F62E18] bg-white px-5 font-semibold text-[#F62E18] disabled:opacity-50"><MapPin className="h-4 w-4" aria-hidden="true" />{locating ? "Finding my address…" : "Use my current location"}</button>
        {message ? <p id="chef-field-error" role={invalidField ? "alert" : "status"} className="mt-4 rounded-2xl bg-[#F1F3F5] p-4 text-sm text-[#6B6B6B]">{message}</p> : null}
        {form.latitude !== "" && form.longitude !== "" ? <div className="mt-5"><AddressMapPicker latitude={Number(form.latitude)} longitude={Number(form.longitude)} onCenterChange={next => void moveKitchenPin(next)} onUseCurrentLocation={useCurrentLocation} locating={locating} disabled={locating} /></div> : null}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-[#1A1A1A] sm:col-span-2">Flat / House / Building<input {...inputProps("addressLine1")} value={form.addressLine1} onChange={(event) => field("addressLine1", event.target.value)} className={INPUT_CLASS} autoComplete="address-line1" /></label>
          <label className="text-sm font-semibold text-[#1A1A1A] sm:col-span-2">Street / Area <span className="font-normal text-[#6B6B6B]">(optional)</span><input {...inputProps("addressLine2")} value={form.addressLine2} onChange={(event) => field("addressLine2", event.target.value)} className={INPUT_CLASS} autoComplete="address-line2" /></label>
          <label className="text-sm font-semibold text-[#1A1A1A] sm:col-span-2">Landmark <span className="font-normal text-[#6B6B6B]">(optional)</span><input {...inputProps("landmark")} value={form.landmark} onChange={(event) => field("landmark", event.target.value)} className={INPUT_CLASS} /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">City<input {...inputProps("city")} value={form.city} onChange={(event) => field("city", event.target.value)} className={INPUT_CLASS} autoComplete="address-level2" /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">State<input {...inputProps("state")} value={form.state} onChange={(event) => field("state", event.target.value)} className={INPUT_CLASS} autoComplete="address-level1" /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">Pincode <span className="font-normal text-[#6B6B6B]">(optional)</span><input {...inputProps("postalCode")} value={form.postalCode} onChange={(event) => field("postalCode", event.target.value)} className={INPUT_CLASS} inputMode="numeric" autoComplete="postal-code" /></label>
        </div>
        <button type="button" onClick={continueAddress} disabled={locating} className="mt-7 min-h-12 w-full rounded-full bg-[#F62E18] px-6 font-semibold text-white disabled:opacity-50">Continue</button>
      </section>
    );
  }

  if (step === "review") {
    const required = ["APPLICANT_PHOTO", "GOVERNMENT_ID_FRONT", "GOVERNMENT_ID_BACK", "TAX_ID_CARD"];
    const documentsReady = required.every(type => application?.documents.some(document => document.documentType === type && (document.status === "UPLOADED" || document.status === "APPROVED")));
    const checklist = [
      { label: "Personal details", complete: Boolean(form.firstName && form.lastName), target: "about" as ApplicationStep },
      { label: "Verified email", complete: chefEmailEligible(emailVerification), target: "account" as ApplicationStep },
      { label: "Kitchen location", complete: Boolean(form.addressLine1 && form.city && form.state), target: "address" as ApplicationStep },
      { label: "Identity & address documents", complete: documentsReady, target: "documents" as ApplicationStep },
    ];
    const completion = Math.round(checklist.filter(item => item.complete).length / checklist.length * 100);
    return <form onSubmit={submit} className="chef-step rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
      <StepHeader part={8} label="Review your application" onBack={() => go("documents")} />
      <div className="mt-7 flex items-center gap-5"><div role="progressbar" aria-valuenow={completion} aria-valuemin={0} aria-valuemax={100} aria-label="Available application details complete" className="grid h-20 w-20 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(var(--color-flame-red) ${completion}%, #e5e7eb 0)` }}><span className="grid h-16 w-16 place-items-center rounded-full bg-white text-lg font-bold">{completion}%</span></div><div><h1 className="text-3xl font-bold">Your Chef Profile</h1><p className="mt-2 text-sm text-[#6B6B6B]">Available application details complete</p></div></div>
      {application?.rejectionReason ? <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm">{application.rejectionReason}</p> : null}
      <div className="mt-5"><EmailVerificationPanel compact required onStateChange={setEmailVerification} /></div>
      <p className="mt-5 font-semibold">{form.firstName} {form.lastName}</p><p className="mt-1 text-sm text-[#6B6B6B]">{addressSummary(form)}</p>
      <div className="mt-6 space-y-2">{checklist.map(item => <button key={item.label} type="button" onClick={() => go(item.target)} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-[#E5E7EB] bg-white px-4 text-left text-sm"><Check className={`h-5 w-5 ${item.complete ? "text-primary" : "text-[#9CA3AF]"}`} /><span className="flex-1">{item.label}</span><span className="text-xs text-[#6B6B6B]">{item.complete ? "Saved" : "Needs attention"}</span><ChevronRight className="h-4 w-4" /></button>)}</div>
      <p className="mt-5 rounded-xl bg-[#F1F3F5] p-4 text-sm leading-6 text-[#6B6B6B]">Kitchen setup opens after approval. Kitchen photos and FSSAI are not included in this percentage because submission is not available yet. Each identity document is reviewed separately.</p>
      {message ? <p role="alert" className="mt-4 text-sm">{message}</p> : null}
      {application?.status === "REJECTED" ? <Button type="submit" className="mt-6 w-full" disabled={!documentsReady || busy || !chefEmailEligible(emailVerification)}>{busy ? "Resubmitting…" : "Resubmit for verification"}</Button> : <Button type="button" className="mt-6 w-full" disabled={!documentsReady || busy} onClick={() => void refreshStatus()}>View verification status</Button>}
    </form>;
  }

  if (step === "documents-intro") {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
        <StepHeader part={7} label="Identity documents" onBack={() => go("fssai")} />
        <div className="mt-7"><IconCircle><ShieldCheck className="h-7 w-7" aria-hidden="true" /></IconCircle></div>
        <h1 className="mt-5 text-3xl font-bold text-[#1A1A1A]">Verify your identity</h1>
        <p className="mt-3 text-base leading-7 text-[#6B6B6B]">We ask every chef to provide these details so we know who is preparing your food. Your ID photos are kept private and secure.</p>
        <div className="mt-6 space-y-3 rounded-2xl bg-[#F1F3F5] p-5 text-sm text-[#1A1A1A]">{["A clear photo of you", "Front of your government ID", "Back of the same ID", "Your PAN card"].map((item) => <p key={item} className="flex items-center gap-3"><Camera className="h-4 w-4 shrink-0 text-[#F62E18]" aria-hidden="true" />{item}</p>)}</div>
        <button type="button" onClick={() => go("documents")} className="mt-7 min-h-12 w-full rounded-full bg-[#F62E18] px-6 font-semibold text-white">Continue</button>
      </section>
    );
  }

  if (step === "documents") {
    return <div className="chef-step space-y-5"><StepHeader part={7} label="Identity documents" onBack={() => go("documents-intro")} /><ChefApplicationDocumentPanel onComplete={() => void openReview()} />{message ? <p role="alert">{message}</p> : null}</div>;
  }

  if (step === "waiting") {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center shadow-[0_2px_10px_rgba(0,0,0,0.06)] md:p-10">
        <IconCircle><Send className="h-7 w-7" aria-hidden="true" /></IconCircle>
        <p className="mt-6 text-sm font-semibold text-[#F62E18]">Application status</p>
        <h1 className="mt-1 text-3xl font-bold text-[#1A1A1A]">Application under review</h1>
        <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-[#6B6B6B]">Your details and photos are with Craves. There’s nothing else you need to do unless we ask for an update.</p>
        <span className="mt-5 inline-flex rounded-full bg-[#F1F3F5] px-4 py-2 text-sm font-semibold text-[#1A1A1A]">Under review</span>
        {message ? <p role="status" className="mx-auto mt-4 max-w-xl text-sm text-[#6B6B6B]">{message}</p> : null}
        <button type="button" onClick={() => void refreshStatus()} disabled={busy} className="mt-7 min-h-12 w-full rounded-full bg-[#F62E18] px-6 font-semibold text-white disabled:opacity-50 sm:w-auto">{busy ? "Checking…" : "Check status"}</button>
        <div className="mt-3">
          <Link href="/home" className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#F1F3F5] px-5 text-sm font-semibold text-[#1A1A1A] transition hover:bg-[#E5E7EB]">Switch to Customer Mode</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center shadow-[0_2px_10px_rgba(0,0,0,0.06)] md:p-10">
      <IconCircle><Check className="h-7 w-7" aria-hidden="true" /></IconCircle>
      <p className="mt-6 text-sm font-semibold text-[#F62E18]">You’re approved</p>
      <h1 className="mt-1 text-3xl font-bold text-[#1A1A1A]">Congratulations! You’re now a Craves chef</h1>
      <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-[#6B6B6B]">Your Chef Mode is ready. Save your kitchen details, then add and publish your dishes.</p>
      <Link href="/chef" className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#F62E18] px-6 font-semibold text-white sm:w-auto">Continue Chef setup <ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
    </section>
  );
}
```

### apps/customer-web-next/src/components/chef-mode-dashboard.tsx

```tsx
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/buttons/button";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  BadgeIndianRupee,
  ChefHat,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Bell,
  RefreshCw,
  ShieldCheck,
  Store,
  Utensils,
} from "lucide-react";
import {
  parseChefApplication,
  type ChefApplication,
} from "@/lib/chef-application-contract";
import { parseChefKitchen } from "@/lib/chef-kitchen-contract";
import type { ChefKitchen } from "@/lib/chef-kitchen-types";
import { parseChefMenuItems, type ChefMenuItem } from "@/lib/chef-menu-contract";
import {
  parseChefOrdersResponse,
  type ChefOrder,
} from "@/lib/chef-order-contract";
import {
  parseChefEarnings,
  type ChefEarning,
} from "@/lib/chef-earnings-contract";
import {
  captureSessionContext,
  getSession,
  isSessionContextCurrent,
  isSessionReady,
  loadSession,
  subscribeSession,
  synchronizeSessionRoles,
  type CravesUser,
} from "@/services/auth/cravesAuth";

type DashboardState =
  | "loading"
  | "signed-out"
  | "applicant"
  | "verification"
  | "approved"
  | "error";

type Snapshot = {
  application: ChefApplication | null;
  kitchen: ChefKitchen | null;
  menu: ChefMenuItem[];
  orders: ChefOrder[];
  earnings: ChefEarning[];
  unavailable: string[];
  pending: string[];
};

type PriorityAction = {
  eyebrow: string;
  title: string;
  description: string;
  action: string;
  href?: string;
  refresh?: boolean;
  icon: typeof ChefHat;
};

const EMPTY: Snapshot = {
  application: null,
  kitchen: null,
  menu: [],
  orders: [],
  earnings: [],
  unavailable: [],
  pending: [],
};

function hasChefRole(user: CravesUser | null): boolean {
  return Boolean(user?.status === "ACTIVE" && user.roles.some((role) => role.toUpperCase() === "CHEF"));
}

function hasRequiredEvidence(application: ChefApplication): boolean {
  const types = new Set(application.documents.filter(document => document.status === "UPLOADED" || document.status === "APPROVED").map((document) => document.documentType));
  const modernEvidence =
    types.has("APPLICANT_PHOTO") &&
    types.has("GOVERNMENT_ID_FRONT") &&
    types.has("GOVERNMENT_ID_BACK") &&
    types.has("TAX_ID_CARD");
  return modernEvidence;
}

async function responseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(0)}`;
  }
}

function isThisWeek(value: string): boolean {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const start = new Date(now);
  const day = start.getDay();
  const distanceFromMonday = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - distanceFromMonday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return date >= start && date < end;
}

function applicantCopy(application: ChefApplication | null) {
  if (!application || application.status === "NOT_SUBMITTED") {
    return {
      eyebrow: "Become a Craves chef",
      title: "Cook from home with Craves",
      description:
        "Tell us who you are, where you cook, and share a few clear photos. We’ll guide you one thing at a time.",
      action: "Apply to become a chef",
    };
  }
  if (application.status === "PENDING" && !hasRequiredEvidence(application)) {
    return {
      eyebrow: "Application in progress",
      title: "Finish your chef application",
      description:
        "Your details are saved. Add the remaining photos so Craves can review your application.",
      action: "Continue application",
    };
  }
  if (application.status === "PENDING") {
    return {
      eyebrow: "Application status",
      title: "Application under review",
      description:
        "Your details and photos are with Craves. There’s nothing else you need to do unless we ask for an update.",
      action: "View application status",
    };
  }
  if (application.status === "REJECTED") {
    return {
      eyebrow: "Application update",
      title: "We need one more thing",
      description:
        application.rejectionReason?.trim() ||
        "One part of your application needs another look. Everything else is still saved.",
      action: "Fix this now",
    };
  }
  return {
    eyebrow: "Chef Mode",
    title: "You’re approved",
    description: "Your chef access is ready. Continue to Chef Mode.",
    action: "Continue",
  };
}

function dashboardScope() {
  const context = captureSessionContext();
  return JSON.stringify([context.generation, context.identityId, hasChefRole(getSession()), isSessionReady()]);
}
const serverScope = () => "server";

export function ChefModeDashboard() {
  const scope = useSyncExternalStore(subscribeSession, dashboardScope, serverScope);
  return <ChefModeDashboardContent key={scope} />;
}

function ChefModeDashboardContent() {
  const [state, setState] = useState<DashboardState>("loading");
  const [user, setUser] = useState<CravesUser | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [message, setMessage] = useState("Loading your kitchen…");
  const [refreshTick, setRefreshTick] = useState(0);
  const [showApprovalNotice, setShowApprovalNotice] = useState(false);
  const [approvalNoticeKey, setApprovalNoticeKey] = useState("");

  useEffect(() => {
    let active = true;
    const initial = captureSessionContext();
    let context = initial;
    const controller = new AbortController();
    const currentRequest = () => active && isSessionContextCurrent(context);
    const options = () => ({
      cache: "no-store" as const,
      credentials: "same-origin" as const,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
    });
    const gateTimeout = window.setTimeout(() => {
      if (active) {
        active = false;
        controller.abort();
        setState("error");
        setMessage("Checking Chef access took too long. Please try again.");
      }
    }, 15_000);

    async function loadApprovedSnapshot(current: CravesUser, knownApplication?: ChefApplication) {
      window.clearTimeout(gateTimeout);
      setUser(current);
      setSnapshot({ ...EMPTY, application: knownApplication ?? null, pending: ["kitchen", "menu", "orders", "earnings", ...(knownApplication ? [] : ["application"])] });
      setState("approved");
      setMessage("");
      function settle(label: string, patch: Partial<Snapshot> = {}, failed = false) {
        if (!currentRequest()) return;
        setSnapshot(previous => !currentRequest() ? previous : ({
          ...previous, ...patch,
          pending: previous.pending.filter(value => value !== label),
          unavailable: failed ? [...new Set([...previous.unavailable, label])] : previous.unavailable.filter(value => value !== label),
        }));
      }
      async function read<T>(label: string, url: string, parse: (raw: unknown) => T | null, key: "application" | "orders" | "earnings") {
        try {
          const response = await fetch(url, options());
          if (!response.ok) throw new Error("SUMMARY_UNAVAILABLE");
          const parsed = parse(await responseBody(response));
          if (parsed === null) throw new Error("SUMMARY_INVALID");
          settle(label, { [key]: parsed });
        } catch { settle(label, {}, true); }
      }
      async function kitchenAndMenu() {
        try {
          const response = await fetch("/api/chef/kitchen", options());
          if (!response.ok) throw new Error("KITCHEN_UNAVAILABLE");
          const raw = await response.json();
          const kitchen = raw === null ? null : parseChefKitchen(raw);
          if (raw !== null && !kitchen) throw new Error("KITCHEN_INVALID");
          settle("kitchen", { kitchen });
          if (!currentRequest()) return;
          // A missing kitchen is an authoritative setup state. Never call its menu.
          if (!kitchen) { settle("menu", { menu: [] }); return; }
          try {
            const menuResponse = await fetch("/api/chef/menu", options());
            if (!menuResponse.ok) throw new Error("MENU_UNAVAILABLE");
            const menu = parseChefMenuItems(await responseBody(menuResponse));
            if (!menu) throw new Error("MENU_INVALID");
            settle("menu", { menu });
          } catch { settle("menu", {}, true); }
        } catch { settle("kitchen", {}, true); settle("menu", {}, true); }
      }
      await Promise.allSettled([
        knownApplication ? Promise.resolve() : read("application", "/api/chef/application", parseChefApplication, "application"),
        kitchenAndMenu(),
        read("orders", "/api/chef/orders", parseChefOrdersResponse, "orders"),
        read("earnings", "/api/chef/earnings", parseChefEarnings, "earnings"),
      ]);
    }

    void (async () => {
      const current = await loadSession({ hydrateCustomerProfile: "skip" });
      if (!active || (initial.identityId !== null && !isSessionContextCurrent(initial))) return;
      context = captureSessionContext();
      setUser(current);
      if (!current || !isSessionReady()) {
        window.clearTimeout(gateTimeout);
        setState(current || !getSession() ? "signed-out" : "error");
        setMessage(getSession() && isSessionReady() ? "We couldn’t check your sign-in. Please try again." : "Sign in to continue to Chef Mode.");
        return;
      }
      if (current.id !== getSession()?.id) return;

      let application: ChefApplication | undefined;
      if (!hasChefRole(current)) {
        const response = await fetch("/api/chef/application", options());
        const parsed = parseChefApplication(await responseBody(response));
        if (!currentRequest()) return;
        if (!response.ok || !parsed) {
          window.clearTimeout(gateTimeout);
          setState(response.status === 401 ? "signed-out" : "error");
          setMessage("We couldn’t check your chef application right now.");
          return;
        }
        application = parsed;
        setSnapshot({ ...EMPTY, application });
        if (application.status !== "APPROVED") {
          window.clearTimeout(gateTimeout);
          setState("applicant");
          setMessage("");
          return;
        }
        setMessage("Activating your approved Chef access…");
      }

      const synchronized = await synchronizeSessionRoles({ hydrateCustomerProfile: "skip" });
      if (!currentRequest() || synchronized?.id !== current.id && synchronized !== null) return;
      if (!synchronized) throw new Error("ROLE_CHECK_UNAVAILABLE");
      if (!isSessionReady() || !hasChefRole(synchronized)) {
        window.clearTimeout(gateTimeout);
        setState("verification");
        setMessage("Verify your mobile number once to refresh secure Chef access.");
        return;
      }
      await loadApprovedSnapshot(synchronized, application);
    })().catch(() => {
      if (!currentRequest()) return;
      window.clearTimeout(gateTimeout);
      setState("error");
      setMessage("We couldn’t load Chef Mode right now. Please try again.");
    });

    return () => {
      active = false;
      window.clearTimeout(gateTimeout);
      controller.abort();
    };
  }, [refreshTick]);

  useEffect(() => {
    if (state !== "approved" || snapshot.application?.status !== "APPROVED" || snapshot.pending.includes("kitchen") || snapshot.unavailable.includes("kitchen")) return;
    const noticeKey = `craves-chef-approved:${snapshot.application.id ?? user?.id}:${snapshot.application.reviewedAt ?? "approved"}`;
    setApprovalNoticeKey(noticeKey);
    try { if (!window.localStorage.getItem(noticeKey)) setShowApprovalNotice(true); }
    catch { setShowApprovalNotice(true); }
  }, [state, snapshot.application, snapshot.pending, snapshot.unavailable, user?.id]);

  const stats = useMemo(() => {
    const actionOrders = snapshot.orders.filter(
      (order) => order.status === "CHEF_ACCEPTANCE_PENDING",
    );
    const activeOrders = snapshot.orders.filter((order) =>
      ["CHEF_ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY"].includes(
        order.status,
      ),
    );
    const availableMenu = snapshot.menu.filter(
      (item) => item.status === "ACTIVE" && item.available,
    );
    const weekEntries = snapshot.earnings.filter(
      (entry) =>
        ["APPROVED", "SETTLEMENT_PENDING", "SETTLED"].includes(entry.status) &&
        isThisWeek(entry.createdAt),
    );
    const weekCurrency = weekEntries[0]?.currency ?? snapshot.earnings[0]?.currency ?? "INR";
    const weekAmount = weekEntries.reduce((sum, entry) => sum + entry.netPayable, 0);
    const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    const todayOrders = snapshot.orders.filter(order => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(order.createdAt)) === todayKey).length;
    return { actionOrders, activeOrders, availableMenu, weekAmount, weekCurrency, todayOrders };
  }, [snapshot]);

  function dismissApprovalNotice() {
    if (approvalNoticeKey) {
      try {
        window.localStorage.setItem(approvalNoticeKey, "seen");
      } catch {
        // The notice can still close when browser storage is unavailable.
      }
    }
    setShowApprovalNotice(false);
  }

  if (state === "loading") {
    return (
      <div className="space-y-4" aria-hidden="true">
        <div className="h-56 animate-pulse rounded-3xl bg-[#F1F3F5]" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl bg-[#F1F3F5]" />
          ))}
        </div>
        <p className="sr-only" role="status">Loading Chef Mode</p>
      </div>
    );
  }

  if (state === "signed-out") {
    return <div className="chef-step mx-auto max-w-6xl space-y-6 md:space-y-10">
      <section className="relative isolate overflow-hidden rounded-3xl bg-[#F1F3F5]">
        <div className="grid md:min-h-[480px] md:grid-cols-2">
          <div className="order-2 flex flex-col justify-center p-6 md:order-1 md:p-10 lg:p-12">
            <p className="text-sm font-semibold uppercase tracking-wider text-[var(--color-flame-red)]">Your kitchen. Your story.</p>
            <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight md:text-4xl lg:text-5xl">Share your homemade food with thousands of customers</h1>
            <p className="mt-5 text-base leading-7 text-[#6B6B6B]">Build your kitchen on Craves, serve nearby customers, and manage orders in one place. Turn the food you love making into an income of your own.</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row md:flex-col lg:flex-row">
              <Button asChild><Link href="/sign-in?returnTo=/chef/application">Become a Chef <ChevronRight aria-hidden="true" /></Link></Button>
              <Button asChild variant="outline"><Link href="/sign-in?returnTo=/chef">Already a Chef? Login</Link></Button>
            </div>
          </div>
          <div className="relative order-1 overflow-hidden md:order-2"><img src="/home/cravings/craves-home-banner.webp" alt="A home chef preparing fresh homemade food" className="aspect-[16/10] h-full w-full origin-right scale-[1.12] object-cover object-right md:absolute md:inset-0" fetchPriority="high" /></div>
        </div>
      </section>
      <section aria-label="Why cook with Craves" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[{icon:BadgeIndianRupee,title:"Earn from your cooking",text:"Bring your signature dishes to a local audience."},{icon:Store,title:"Reach nearby customers",text:"Connect your home kitchen with your neighbourhood."},{icon:Utensils,title:"Manage your kitchen easily",text:"Keep dishes, availability and orders together."},{icon:ShieldCheck,title:"Build a trusted Chef profile",text:"Share your story and complete your verification."}].map(({icon:Icon,title,text}) => <article key={title} className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[var(--shadow-card)]"><span className="inline-flex rounded-xl bg-[var(--color-flame-red)]/10 p-3 text-[var(--color-flame-red)]"><Icon className="h-5 w-5" aria-hidden="true" /></span><h2 className="mt-4 text-base font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-[#6B6B6B]">{text}</p></article>)}
      </section>
    </div>;
  }

  if (state === "verification") {
    return (
      <section className="mx-auto max-w-2xl rounded-3xl border border-[#E5E7EB] bg-white p-7 shadow-[0_6px_24px_rgba(0,0,0,0.08)] md:p-10">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]">
          <ShieldCheck className="h-7 w-7 text-[#F62E18]" aria-hidden="true" />
        </span>
        <p className="mt-5 text-sm font-semibold text-[#F62E18]">Chef Mode</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#1A1A1A]">One quick verification</h1>
        <p className="mt-3 max-w-xl text-base leading-7 text-[#6B6B6B]">{message}</p>
        <Link href="/sign-in?returnTo=/chef" className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#F62E18] px-6 font-semibold text-white sm:w-auto">
          Verify and continue
        </Link>
        <div className="mt-3">
          <Link href="/home" className="inline-flex min-h-11 items-center rounded-full bg-[#F1F3F5] px-5 text-sm font-semibold text-[#1A1A1A] transition hover:bg-[#E5E7EB]">Switch to Customer Mode</Link>
        </div>
      </section>
    );
  }

  if (state === "applicant") {
    const copy = applicantCopy(snapshot.application);
    return (
      <section className="mx-auto max-w-2xl rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-[0_2px_10px_rgba(0,0,0,0.06)] md:p-9">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]">
          <ClipboardCheck className="h-7 w-7 text-[#F62E18]" aria-hidden="true" />
        </span>
        <p className="mt-5 text-sm font-semibold text-[#F62E18]">{copy.eyebrow}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#1A1A1A]">{copy.title}</h1>
        <p className="mt-3 text-base leading-7 text-[#6B6B6B]">{copy.description}</p>
        {message ? (
          <p role="status" className="mt-4 rounded-2xl bg-[#F1F3F5] p-4 text-sm text-[#6B6B6B]">{message}</p>
        ) : null}
        <Link
          href="/chef/application"
          aria-label="Open chef application"
          className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#F62E18] px-6 font-semibold text-white"
        >
          {copy.action}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div className="mt-3 text-center">
          <Link href="/home" className="inline-flex min-h-11 items-center rounded-full bg-[#F1F3F5] px-5 text-sm font-semibold text-[#1A1A1A] transition hover:bg-[#E5E7EB]">Switch to Customer Mode</Link>
        </div>
      </section>
    );
  }

  if (state === "error") {
    return (
      <section className="mx-auto max-w-2xl rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]">
          <AlertTriangle className="h-7 w-7 text-[#F62E18]" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-[#1A1A1A]">Chef Mode couldn’t load</h1>
        <p className="mt-2 text-sm text-[#6B6B6B]">{message}</p>
        <button
          type="button"
          onClick={() => { setState("loading"); setRefreshTick((value) => value + 1); }}
          className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-full bg-[#F62E18] px-6 font-semibold text-white"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
      </section>
    );
  }

  let priority: PriorityAction;
  if (snapshot.pending.includes("kitchen") || snapshot.pending.includes("menu")) {
    priority = { eyebrow: "Checking your kitchen", title: "Your kitchen details are loading", description: "Your summaries will appear as they arrive.", action: "Loading…", icon: Store };
  } else if (snapshot.unavailable.includes("kitchen") || snapshot.unavailable.includes("menu")) {
    priority = {
      eyebrow: "Try again",
      title: "Check your kitchen and menu",
      description: "We couldn’t verify your saved kitchen or dishes. Refresh before continuing setup.",
      action: "Refresh kitchen and menu",
      refresh: true,
      icon: RefreshCw,
    };
  } else if (!snapshot.kitchen) {
    priority = {
      eyebrow: "You’re approved",
      title: "Give your kitchen a name",
      description: "This is what customers will know your home kitchen by.",
      action: "Name my kitchen",
      href: "/chef/kitchen",
      icon: Store,
    };
  } else if (snapshot.menu.length === 0) {
    priority = {
      eyebrow: "Next step",
      title: "Add your first dish",
      description: "Add one dish so customers can see what you cook.",
      action: "Add a dish",
      href: "/chef/menu",
      icon: Utensils,
    };
  } else if (snapshot.pending.includes("orders") || snapshot.unavailable.includes("orders")) {
    priority = { eyebrow: "Orders", title: snapshot.pending.includes("orders") ? "Checking your orders" : "Your orders couldn’t refresh", description: "Open your orders to check the current status.", action: "Open orders", href: "/chef/orders", icon: ClipboardList };
  } else if (stats.actionOrders.length > 0) {
    const first = stats.actionOrders[0]!;
    priority = {
      eyebrow: "Needs your answer",
      title: `${stats.actionOrders.length} new order${stats.actionOrders.length === 1 ? "" : "s"} waiting`,
      description: "Open the order and tell us if you can cook it now.",
      action: "See the order",
      href: `/chef/orders/${first.id}`,
      icon: ClipboardList,
    };
  } else if (stats.activeOrders.length > 0) {
    const first = stats.activeOrders[0]!;
    priority = {
      eyebrow: "Cooking now",
      title: "You have an order in progress",
      description: "Open it when you’re ready to continue or mark the food packed.",
      action: "Continue order",
      href: `/chef/orders/${first.id}`,
      icon: ChefHat,
    };
  } else {
    priority = {
      eyebrow: "Today",
      title: "No orders yet — you’re all set",
      description: "Your menu is ready. New orders will appear here when customers choose your food.",
      action: "Refresh",
      refresh: true,
      icon: ChefHat,
    };
  }

  const kitchenOpen = snapshot.kitchen?.status === "ACTIVE";
  const menuSummary = snapshot.pending.includes("menu") ? "Loading…" : snapshot.unavailable.includes("menu") ? "Unavailable" : snapshot.menu.length
    ? `${snapshot.menu.length} dish${snapshot.menu.length === 1 ? "" : "es"}`
    : "Add your first dish";
  const earningsSummary = snapshot.pending.includes("earnings") ? "Loading…" : snapshot.unavailable.includes("earnings") ? "Unavailable" : stats.weekAmount > 0
    ? money(stats.weekAmount, stats.weekCurrency)
    : "Appears after your first earning";

  return (
    <>
      {showApprovalNotice ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="chef-approved-title"
            className="w-full max-w-lg rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center shadow-[0_18px_50px_rgba(0,0,0,0.18)] md:p-9"
          >
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#F1F3F5]">
              <CheckCircle2 className="h-8 w-8 text-[#F62E18]" aria-hidden="true" />
            </span>
            <p className="mt-5 text-sm font-semibold text-[#F62E18]">You’re approved</p>
            <h2 id="chef-approved-title" className="mt-1 text-3xl font-bold tracking-tight text-[#1A1A1A]">Congratulations! You’re now a Craves chef</h2>
            <p className="mt-3 text-sm leading-6 text-[#6B6B6B]">{snapshot.kitchen ? "Your Chef Mode is ready. Add your first dish so customers can discover what you cook." : "Your Chef Mode is ready. Save your kitchen name and pickup address, then add your first dish."}</p>
            <Link
              href={snapshot.kitchen ? "/chef/menu" : "/chef/kitchen"}
              onClick={dismissApprovalNotice}
              className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#F62E18] px-6 font-semibold text-white"
            >
              {snapshot.kitchen ? "Add my first dish" : "Set up my kitchen"}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={dismissApprovalNotice}
              className="mt-3 min-h-11 w-full rounded-full bg-[#F1F3F5] px-5 text-sm font-semibold text-[#1A1A1A] transition hover:bg-[#E5E7EB]"
            >
              Go to Chef home
            </button>
          </section>
        </div>
      ) : null}

      <div className="space-y-5">
        <div>
          <p className="text-sm font-semibold text-[#F62E18]">Chef Mode</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#1A1A1A] md:text-4xl">
            Hello, {user?.firstName || user?.username || "Chef"}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3"><span className="rounded-full bg-[#F1F3F5] px-3 py-2 text-sm font-semibold">{snapshot.kitchen?.kitchenName || "Your Craves kitchen"}</span><span className="inline-flex items-center gap-1 text-sm text-primary"><ShieldCheck className="h-4 w-4" />Approved Chef</span><Button asChild variant="ghost" size="icon"><Link href="/notifications" aria-label="Chef notifications"><Bell className="h-5 w-5" /></Link></Button></div>
        </div>

        {snapshot.unavailable.length > 0 ? (
          <p role="status" className="rounded-2xl bg-[#F1F3F5] px-4 py-3 text-sm text-[#6B6B6B]">
            Some information couldn’t refresh. You can still use the parts shown below.
          </p>
        ) : null}

        <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-8">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5]">
              <priority.icon className="h-7 w-7 text-[#F62E18]" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#F62E18]">{priority.eyebrow}</p>
              <h2 className="mt-1 text-2xl font-bold text-[#1A1A1A] md:text-3xl">{priority.title}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6B6B6B]">{priority.description}</p>
            </div>
          </div>
          {priority.href ? (
            <Link href={priority.href} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#F62E18] px-6 font-semibold text-white sm:w-auto">
              {priority.action}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <button
              type="button"
              disabled={!priority.refresh}
              onClick={() => { if (priority.refresh) { setState("loading"); setRefreshTick((value) => value + 1); } }}
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#F62E18] px-6 font-semibold text-white sm:w-auto"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {priority.action}
            </button>
          )}
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Kitchen summary">
          <Link href="/chef/orders" className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[var(--shadow-card)]"><ClipboardList className="h-5 w-5 text-primary" /><p className="mt-4 text-xs font-semibold text-[#6B6B6B]">Today’s orders</p><p className="mt-1 text-2xl font-bold">{snapshot.pending.includes("orders") ? "Loading…" : snapshot.unavailable.includes("orders") ? "—" : stats.todayOrders}</p></Link>
          <Link href="/chef/kitchen" className="rounded-2xl border border-[#E5E7EB] bg-white p-5 transition hover:border-[#F62E18]/40">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F3F5]">
              <Store className="h-5 w-5 text-[#F62E18]" aria-hidden="true" />
            </span>
            <p className="mt-4 text-xs font-semibold text-[#6B6B6B]">Your kitchen</p>
            <p className="mt-1 font-bold text-[#1A1A1A]">{snapshot.pending.includes("kitchen") ? "Loading…" : snapshot.unavailable.includes("kitchen") ? "Unavailable" : kitchenOpen ? "Accepting orders" : "Not accepting orders"}</p>
          </Link>
          <Link href="/chef/menu" className="rounded-2xl border border-[#E5E7EB] bg-white p-5 transition hover:border-[#F62E18]/40">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F3F5]">
              <Utensils className="h-5 w-5 text-[#F62E18]" aria-hidden="true" />
            </span>
            <p className="mt-4 text-xs font-semibold text-[#6B6B6B]">Your menu</p>
            <p className="mt-1 font-bold text-[#1A1A1A]">{menuSummary}</p>
          </Link>
          <Link href="/chef/earnings" className="rounded-2xl border border-[#E5E7EB] bg-white p-5 transition hover:border-[#F62E18]/40">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F3F5]">
              <BadgeIndianRupee className="h-5 w-5 text-[#F62E18]" aria-hidden="true" />
            </span>
            <p className="mt-4 text-xs font-semibold text-[#6B6B6B]">This week</p>
            <p className="mt-1 font-bold text-[#1A1A1A]">{earningsSummary}</p>
          </Link>
        </section>

        {snapshot.orders.length > 0 ? (
          <details className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
            <summary className="cursor-pointer font-semibold text-[#1A1A1A]">More options</summary>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <Link href="/chef/application" className="rounded-xl bg-[#F1F3F5] px-4 py-3 text-sm font-semibold text-[#1A1A1A]">Your details</Link>
              <Link href="/chef/orders" className="rounded-xl bg-[#F1F3F5] px-4 py-3 text-sm font-semibold text-[#1A1A1A]">Previous orders</Link>
              <Link href="/chef/earnings" className="rounded-xl bg-[#F1F3F5] px-4 py-3 text-sm font-semibold text-[#1A1A1A]">What you’ve earned</Link>
            </div>
          </details>
        ) : null}
      </div>
    </>
  );
}

export default ChefModeDashboard;
```

### apps/customer-web-next/src/components/chef-operations-workspace.tsx

```tsx
"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useChefReadPanels } from "@/hooks/use-chef-read-panels";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileCheck2,
  ImageIcon,
  MapPinned,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Store,
  Utensils,
} from "lucide-react";
import { parseChefApplication } from "@/lib/chef-application-contract";
import { parseChefApplicationReadiness } from "@/lib/chef-readiness-contract";
import { parseChefKitchen } from "@/lib/chef-kitchen-contract";
import { parseChefMenuItems } from "@/lib/chef-menu-contract";

const operationsSources = {
  application: {
    path: "/api/chef/application",
    label: "Chef approval",
    decode: (raw: unknown) => {
      const value = parseChefApplication(raw);
      if (!value) throw new Error("Craves returned an invalid chef application response.");
      return value;
    },
  },
  kitchen: {
    path: "/api/chef/kitchen",
    label: "Kitchen operations",
    decode: (raw: unknown) => {
      if (raw === null) return null;
      const value = parseChefKitchen(raw);
      if (!value) throw new Error("Craves returned an invalid kitchen response.");
      return value;
    },
  },
  menu: {
    path: "/api/chef/menu",
    label: "Menu operations",
    decode: (raw: unknown) => {
      const value = parseChefMenuItems(raw);
      if (!value) throw new Error("Craves returned an invalid chef menu response.");
      return value;
    },
  },
  readiness: {
    path: "/api/chef/application/readiness",
    label: "Application readiness",
    decode: (raw: unknown) => {
      const value = parseChefApplicationReadiness(raw);
      if (!value) throw new Error("Craves returned an invalid application readiness response.");
      return value;
    },
  },
};

function unsettledLabel(status: string): string | null {
  return status === "loading" ? "CHECKING" : status === "error" ? "UNAVAILABLE" : null;
}

function statusTone(ready: boolean): string {
  return ready
    ? "border-success/20 bg-success/5 text-success"
    : "border-warning/20 bg-warning/5 text-warning";
}

export function ChefOperationsWorkspace() {
  const { panels, refresh, pending, updatedAt } = useChefReadPanels(operationsSources);
  const application = panels.application.data;
  const kitchen = panels.kitchen.data;
  const readiness = panels.readiness.data;
  const menu = panels.menu.data;
  const errors = Object.values(panels).filter((panel) => panel.status === "error");
  const allReady = Object.values(panels).every((panel) => panel.status === "ready");
  const applicationLabel = unsettledLabel(panels.application.status);
  const kitchenLabel = unsettledLabel(panels.kitchen.status);
  const menuLabel = unsettledLabel(panels.menu.status);
  const proofLabel = unsettledLabel(panels.readiness.status);

  const metrics = useMemo(() => {
    const activeItems = (menu ?? []).filter((item) => item.status === "ACTIVE");
    const availableItems = activeItems.filter((item) => item.available);
    const withImages = activeItems.filter((item) => item.images.length > 0);
    return {
      activeItems: activeItems.length,
      availableItems: availableItems.length,
      withImages: withImages.length,
    };
  }, [menu]);

  const applicationApproved = application?.status === "APPROVED";
  const hasSupportedProofs =
    readiness !== null &&
    readiness !== undefined &&
    readiness.approvedDocumentCount === readiness.requiredDocumentCount;
  const kitchenActive = kitchen?.status === "ACTIVE";
  const locationMapped =
    typeof kitchen?.latitude === "number" && typeof kitchen.longitude === "number";
  const discoverable =
    allReady &&
    applicationApproved &&
    kitchenActive &&
    locationMapped &&
    metrics.availableItems > 0;

  return (
    <div className="space-y-6">
      {errors.length > 0 && (
        <section role="alert" className="rounded-2xl border border-error/20 bg-white p-5">
          <AlertTriangle className="h-5 w-5 text-error" aria-hidden="true" />
          {errors.map((panel) => (
            <p key={panel.error} className="mt-2 text-sm text-error">
              {panel.error}
            </p>
          ))}
        </section>
      )}
      <section
        className={`rounded-2xl border p-5 shadow-[var(--shadow-card)] md:p-6 ${
          discoverable ? "border-success/20 bg-success/5" : "border-warning/20 bg-warning/5"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {discoverable ? (
              <CheckCircle2 className="mt-1 h-7 w-7 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <ShieldAlert className="mt-1 h-7 w-7 shrink-0 text-warning" aria-hidden="true" />
            )}
            <div>
              <p className="craves-overline text-ink/65">Customer discovery readiness</p>
              <h2 className="mt-1 font-display text-2xl font-bold text-ink">
                {errors.length > 0
                  ? "Some operational states are unavailable"
                  : pending
                    ? "Checking operational states"
                    : discoverable
                      ? "Kitchen is operationally discoverable"
                      : "Complete the required operational states"}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Discovery requires an approved chef application, an ACTIVE kitchen with a confirmed
                mapped location and at least one ACTIVE and available menu item. The backend remains
                authoritative for every request.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={refresh}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-ink hover:border-primary disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-bold ${statusTone(applicationApproved)}`}
            >
              {applicationLabel ?? application?.status.replaceAll("_", " ")}
            </span>
          </div>
          <h3 className="mt-4 font-display text-lg font-bold text-ink">Chef approval</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Admin review controls access to chef-owned kitchen, menu, order and finance APIs.
          </p>
          {application?.reviewedAt && (
            <p className="mt-3 text-xs text-muted-foreground">
              Reviewed {new Date(application.reviewedAt).toLocaleString("en-IN")}
            </p>
          )}
          {application?.rejectionReason && (
            <p className="mt-3 rounded-xl bg-error/5 p-3 text-xs leading-5 text-error">
              Review note: {application.rejectionReason}
            </p>
          )}
          <Link
            href="/chef/application"
            className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-contrast-red"
          >
            Review application
          </Link>
        </article>

        <article className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary">
              <FileCheck2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-bold ${statusTone(hasSupportedProofs)}`}
            >
              {proofLabel ??
                `${readiness?.approvedDocumentCount}/${readiness?.requiredDocumentCount} approved`}
            </span>
          </div>
          <h3 className="mt-4 font-display text-lg font-bold text-ink">Supported proof evidence</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Approval readiness uses the four current evidence types reported by the backend:
            applicant photo, government ID front, government ID back and PAN / tax ID card.
          </p>
          <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
            {(readiness?.documents ?? []).map((document) => (
              <li
                key={document.documentType}
                className="flex items-center justify-between gap-3 rounded-lg bg-cream px-3 py-2"
              >
                <span>{document.documentType.replaceAll("_", " ")}</span>
                <strong className="text-ink">{document.status}</strong>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Craves does not invent FSSAI eligibility or expiry rules in the UI. Add new compliance
            types only after the product/legal contract is approved.
          </p>
        </article>

        <article className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary">
              <Store className="h-5 w-5" aria-hidden="true" />
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-bold ${statusTone(kitchenActive)}`}
            >
              {kitchenLabel ?? kitchen?.status ?? "NOT CREATED"}
            </span>
          </div>
          <h3 className="mt-4 font-display text-lg font-bold text-ink">Kitchen availability</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Kitchen status is the current backend-supported operational switch. INACTIVE pauses
            discovery without fabricating weekly opening hours.
          </p>
          <Link
            href="/chef/kitchen"
            className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-contrast-red"
          >
            Manage kitchen
          </Link>
        </article>

        <article className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary">
              <MapPinned className="h-5 w-5" aria-hidden="true" />
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-bold ${statusTone(locationMapped)}`}
            >
              {kitchenLabel ?? (locationMapped ? "MAPPED" : "MISSING")}
            </span>
          </div>
          <h3 className="mt-4 font-display text-lg font-bold text-ink">Kitchen location</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Craves keeps the precise kitchen map point securely in the background so nearby
            discovery and delivery pickup can work without exposing technical location values to
            chefs.
          </p>
          <Link
            href="/chef/kitchen"
            className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-contrast-red"
          >
            {locationMapped ? "Review kitchen address" : "Confirm kitchen location"}
          </Link>
        </article>

        <article className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary">
              <Utensils className="h-5 w-5" aria-hidden="true" />
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-bold ${statusTone(metrics.availableItems > 0)}`}
            >
              {menuLabel ?? `${metrics.availableItems} available`}
            </span>
          </div>
          <h3 className="mt-4 font-display text-lg font-bold text-ink">Menu availability</h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-cream p-3">
              <dt className="text-xs text-muted-foreground">Active</dt>
              <dd className="mt-1 font-display text-xl font-bold text-ink">
                {menuLabel ? "—" : metrics.activeItems}
              </dd>
            </div>
            <div className="rounded-xl bg-cream p-3">
              <dt className="text-xs text-muted-foreground">Available</dt>
              <dd className="mt-1 font-display text-xl font-bold text-ink">
                {menuLabel ? "—" : metrics.availableItems}
              </dd>
            </div>
          </dl>
          <Link
            href="/chef/menu"
            className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-contrast-red"
          >
            Manage menu
          </Link>
        </article>

        <article className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary">
              <ImageIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-bold ${statusTone(metrics.withImages === metrics.activeItems && metrics.activeItems > 0)}`}
            >
              {menuLabel ?? `${metrics.withImages}/${metrics.activeItems}`}
            </span>
          </div>
          <h3 className="mt-4 font-display text-lg font-bold text-ink">Active dish images</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Active dishes without approved public images remain valid but show the Craves
            placeholder to customers.
          </p>
          <Link
            href="/chef/menu/media"
            className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-contrast-red"
          >
            Images and availability
          </Link>
        </article>
      </section>

      <section className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-card)] md:p-6">
        <div className="flex items-start gap-3">
          <Clock3 className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h2 className="font-display text-xl font-bold text-ink">
              Schedule support without invented rules
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The current backend exposes kitchen status and per-item availability, but no reviewed
              weekly opening-hours contract. This workspace therefore uses only those real controls.
              A weekly schedule must be designed and approved in the functional and architecture
              documents before implementation.
            </p>
          </div>
        </div>
      </section>

      {allReady && updatedAt && (
        <p className="text-xs text-muted-foreground">
          Last refreshed {updatedAt.toLocaleString("en-IN")}
        </p>
      )}
    </div>
  );
}

export default ChefOperationsWorkspace;
```

### apps/customer-web-next/src/components/layout/BottomNav.tsx

```tsx
"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const BottomNavContent = dynamic(() => import("./BottomNavContent"), {
  loading: () => (
    <div
      aria-hidden="true"
      className="h-[calc(4.7rem+env(safe-area-inset-bottom))] md:hidden"
    />
  ),
});

const HIDDEN_PATH_PREFIXES = [
  "/sign-in", "/cart", "/checkout", "/confirmation", "/chef", "/admin",
  "/contact", "/privacy", "/terms", "/security", "/refunds-cancellations",
  "/products-pricing",
];

export function BottomNav() {
  const pathname = usePathname();
  if (
    pathname === "/" ||
    HIDDEN_PATH_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return null;
  }
  return <BottomNavContent />;
}

export function BottomNavAll() {
  return <BottomNav />;
}
```

### apps/customer-web-next/src/components/layout/BottomNavContent.tsx

```tsx
"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CalendarDays, ChefHat } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FaHome, FaUser } from "react-icons/fa";

import { CravesCartIcon } from "@/components/home/CravesCartIcon";
import { AnimateCount } from "@/components/ui/AnimateCount";
import {
  cartCount,
  cartCurrency,
  cartTotal,
  subscribeCart,
} from "@/services/api/cravesCart";

type NavKey =
  | "home"
  | "subscriptions"
  | "chefs"
  | "profile"
  | "cart";

const HIDDEN_PATH_PREFIXES = [
  "/sign-in",
  "/cart",
  "/checkout",
  "/confirmation",
  "/chef",
  "/admin",
  "/contact",
  "/privacy",
  "/terms",
  "/security",
  "/refunds-cancellations",
  "/products-pricing",
];

const NAV_ITEMS = [
  { key: "home" as const, href: "/home", label: "Home", icon: FaHome },
  {
    key: "subscriptions" as const,
    href: "/subscriptions",
    label: "Meal Subscription",
    icon: CalendarDays,
  },
  {
    key: "chefs" as const,
    href: "/chefs",
    label: "Chefs",
    icon: ChefHat,
  },
  {
    key: "profile" as const,
    href: "/profile",
    label: "Profile",
    icon: FaUser,
  },
] as const;

function shouldHide(pathname: string): boolean {
  if (pathname === "/") return true;
  return HIDDEN_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}

function activeKeyForPath(pathname: string): NavKey | null {
  if (pathname === "/cart" || pathname.startsWith("/cart/")) return "cart";
  if (
    pathname === "/subscriptions" ||
    pathname.startsWith("/subscriptions/")
  ) {
    return "subscriptions";
  }
  if (pathname === "/profile" || pathname.startsWith("/profile/")) {
    return "profile";
  }
  if (
    pathname === "/chefs" ||
    pathname.startsWith("/chefs/") ||
    pathname.startsWith("/kitchen")
  ) {
    return "chefs";
  }
  if (pathname === "/home") return "home";
  return null;
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function BottomNavContent() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const lastScrollY = useRef(0);
  const directionAnchorY = useRef(0);
  const lastDirection = useRef<"up" | "down" | null>(null);
  const framePending = useRef(false);

  const [cartExpanded, setCartExpanded] = useState(false);
  const [itemCount, setItemCount] = useState(() => cartCount());
  const [total, setTotal] = useState(() => cartTotal());
  const [currency, setCurrency] = useState(() => cartCurrency());

  useEffect(() => {
    const sync = () => {
      const nextCount = cartCount();
      setItemCount(nextCount);
      setTotal(cartTotal());
      setCurrency(cartCurrency());
      if (nextCount <= 0) setCartExpanded(false);
    };
    sync();
    return subscribeCart(sync);
  }, []);

  useEffect(() => {
    lastScrollY.current = Math.max(window.scrollY, 0);
    directionAnchorY.current = lastScrollY.current;
    lastDirection.current = null;
    setCartExpanded(false);

    const update = () => {
      const currentY = Math.max(window.scrollY, 0);
      const delta = currentY - lastScrollY.current;
      const direction: "up" | "down" | null =
        delta > 1 ? "down" : delta < -1 ? "up" : null;

      if (currentY <= 48) {
        setCartExpanded(false);
        directionAnchorY.current = currentY;
        lastDirection.current = direction;
      } else if (direction) {
        if (lastDirection.current !== direction) {
          directionAnchorY.current = currentY;
          lastDirection.current = direction;
        }

        const travel = Math.abs(currentY - directionAnchorY.current);

        // Match the original mobile behavior: the right-most Cart tab expands
        // right-to-left into View Cart while browsing down. Scrolling back up
        // contracts it left-to-right into the normal five-tab navigation.
        if (direction === "down" && travel >= 18 && itemCount > 0) {
          setCartExpanded(true);
        } else if (direction === "up" && travel >= 18) {
          setCartExpanded(false);
        }
      }

      lastScrollY.current = currentY;
      framePending.current = false;
    };

    const handleScroll = () => {
      if (framePending.current) return;
      framePending.current = true;
      window.requestAnimationFrame(update);
    };

    const handleFocus = () => setCartExpanded(false);
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("focus", handleFocus);
    };
  }, [itemCount, pathname]);

  if (shouldHide(pathname)) return null;

  const activeKey = activeKeyForPath(pathname);

  return (
    <>
      <div
        aria-hidden="true"
        className="h-[calc(4.7rem+env(safe-area-inset-bottom))] md:hidden"
      />

      <nav
        className="fixed inset-x-0 bottom-0 z-40 md:hidden"
        aria-label="Customer navigation"
      >
        <div
          className={[
            "relative mx-auto max-w-lg overflow-hidden rounded-t-[1.15rem] transition-[background-color,border-color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            cartExpanded
              ? "border-t border-white/70 bg-transparent shadow-none"
              : "border-t border-[#ECEEF0] bg-white/96 shadow-[0_-8px_24px_rgba(26,26,26,0.065)] backdrop-blur-xl",
          ].join(" ")}
        >
          <motion.ul
            initial={false}
            animate={{
              opacity: cartExpanded ? 0 : 1,
              x: cartExpanded ? -18 : 0,
              scale: cartExpanded ? 0.985 : 1,
            }}
            transition={{
              duration: reduceMotion ? 0 : 0.34,
              ease: [0.22, 1, 0.36, 1],
            }}
            className={[
              "grid grid-cols-5 items-stretch px-1.5 pb-[max(0.38rem,env(safe-area-inset-bottom))] pt-1.5",
              cartExpanded ? "pointer-events-none" : "",
            ].join(" ")}
            aria-hidden={cartExpanded || undefined}
          >
            {NAV_ITEMS.map(({ key, href, label, icon: Icon }) => {
              const active = activeKey === key;
              return (
                <li key={key}>
                  <Link
                    href={href}
                    className={[
                      "flex min-h-[3.45rem] flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-center text-[0.61rem] font-extrabold leading-[0.72rem] transition-colors duration-200",
                      active
                        ? "text-[#F62E18]"
                        : "text-[#777777] hover:text-[#1A1A1A]",
                    ].join(" ")}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon
                      className="h-[1.12rem] w-[1.12rem] shrink-0"
                      aria-hidden="true"
                    />
                    <span className="max-w-[4.4rem]">{label}</span>
                  </Link>
                </li>
              );
            })}

            <li>
              <Link
                href="/cart"
                className={[
                  "flex min-h-[3.45rem] flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-center text-[0.61rem] font-extrabold leading-[0.72rem] transition-colors duration-200",
                  activeKey === "cart"
                    ? "text-[#F62E18]"
                    : "text-[#777777] hover:text-[#1A1A1A]",
                ].join(" ")}
                aria-current={activeKey === "cart" ? "page" : undefined}
                aria-label={
                  itemCount > 0
                    ? `Cart, ${itemCount} ${itemCount === 1 ? "item" : "items"}`
                    : "Cart"
                }
              >
                <span className="relative flex h-[1.2rem] w-[1.2rem] items-center justify-center">
                  <CravesCartIcon className="h-[1.12rem] w-[1.12rem]" />
                  {itemCount > 0 ? (
                    <span className="absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F62E18] px-1 text-[0.5rem] font-black leading-none text-white">
                      {itemCount > 99 ? "99+" : itemCount}
                    </span>
                  ) : null}
                </span>
                <span>Cart</span>
              </Link>
            </li>
          </motion.ul>

          <AnimatePresence initial={false}>
            {cartExpanded && itemCount > 0 ? (
              <motion.div
                key="mobile-cart-expanded"
                initial={
                  reduceMotion
                    ? false
                    : {
                        opacity: 0,
                        left: "79%",
                        scale: 0.96,
                        y: 10,
                      }
                }
                animate={{
                  opacity: 1,
                  left: "0.4rem",
                  scale: 1,
                  y: 0,
                }}
                exit={{
                  opacity: 0,
                  left: "79%",
                  scale: 0.96,
                  y: 8,
                }}
                transition={{
                  duration: reduceMotion ? 0 : 0.38,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="absolute bottom-[max(0.38rem,env(safe-area-inset-bottom))] right-1.5 top-1.5 z-10 overflow-hidden rounded-[1.05rem]"
              >
                <Link
                  href="/cart"
                  className="relative flex h-full min-h-[3.45rem] items-center gap-3 overflow-hidden rounded-[1.05rem] border border-white/80 bg-white/50 px-3.5 text-[#1A1A1A] shadow-[0_16px_42px_rgba(26,26,26,0.18),0_2px_8px_rgba(26,26,26,0.06),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-[8px] backdrop-saturate-[145%]"
                  aria-label={`View cart with ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(112deg,rgba(255,255,255,0.24),rgba(255,255,255,0.06)_52%,rgba(255,255,255,0.18))]"
                  />
                  <span className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.78] text-[#F62E18] shadow-[0_4px_14px_rgba(26,26,26,0.08)] backdrop-blur-[4px]">
                    <CravesCartIcon className="h-4.5 w-4.5" />
                  </span>
                  <span className="relative z-10 min-w-0 flex-1">
                    <span className="flex items-center gap-1 truncate text-sm font-black">
                      <AnimateCount className="inline-grid min-w-[1ch]">
                        {itemCount}
                      </AnimateCount>
                      <span>
                        {itemCount === 1 ? "item" : "items"} ·{" "}
                        {formatMoney(total, currency)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[0.65rem] font-semibold text-[#6B6B6B]">
                      Your Craves cart is ready
                    </span>
                  </span>
                  <span className="relative z-10 flex shrink-0 items-center gap-1.5 text-xs font-black">
                    View Cart
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </Link>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </nav>
    </>
  );
}

export default BottomNavContent;
```

### apps/customer-web-next/src/components/profile/LazyAddressEditorFlow.tsx

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { captureSessionContext, isSessionContextCurrent, subscribeSession } from "@/services/auth/cravesAuth";
import { loadAddressEditor, type AddressEditor, type AddressEditorProps } from "./address-editor-loader";

export function LazyAddressEditorFlow(props: AddressEditorProps) {
  const { onClose } = props;
  const [Editor, setEditor] = useState<AddressEditor | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const context = useRef(captureSessionContext());

  useEffect(() => subscribeSession(() => {
    if (!isSessionContextCurrent(context.current)) onClose();
  }), [onClose]);

  useEffect(() => {
    let active = true;
    const current = context.current;
    void loadAddressEditor().then((component) => {
      if (active && isSessionContextCurrent(current)) setEditor(() => component);
    }).catch(() => { if (active && isSessionContextCurrent(current)) setFailed(true); });
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    if (Editor || !dialog.current) return;
    const surface = dialog.current;
    const previousFocus = document.activeElement;
    if (typeof surface.showModal === "function") surface.showModal();
    else surface.setAttribute("open", "");
    return () => {
      if (typeof surface.close === "function") surface.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [Editor]);

  if (Editor) return <Editor {...props} onSaved={(saved) => {
    if (isSessionContextCurrent(context.current)) return props.onSaved(saved);
  }} />;

  return (
    <dialog
      ref={dialog}
      aria-labelledby="address-form-loading-title"
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-[#E5E7EB] bg-white p-6 text-[#1A1A1A] shadow-xl backdrop:bg-black/30 backdrop:backdrop-blur-sm"
      onCancel={(event) => { event.preventDefault(); props.onClose(); }}
    >
      <h2 id="address-form-loading-title" className="text-xl font-bold">Your address</h2>
      {failed ? (
        <>
          <p role="alert" className="mt-3 text-sm">We couldn’t open the address form. Please try again.</p>
          <button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1); }} className="mt-5 min-h-11 rounded-full bg-[#F62E18] px-5 text-sm font-bold text-white">Try again</button>
        </>
      ) : <p role="status" className="mt-3 text-sm">Preparing your address form…</p>}
      <button type="button" onClick={props.onClose} className="ml-3 mt-5 min-h-11 rounded-full bg-[#F1F3F5] px-5 text-sm font-bold">Close address form</button>
    </dialog>
  );
}
```

### apps/customer-web-next/src/components/profile/address-editor-loader.ts

```typescript
import type { ComponentProps, ComponentType } from "react";

export type AddressEditorProps = ComponentProps<typeof import("./AddressEditorFlow").AddressEditorFlow>;
export type AddressEditor = ComponentType<AddressEditorProps>;
let ready: AddressEditor | null = null;
let pending: Promise<AddressEditor> | null = null;

export function loadAddressEditor(): Promise<AddressEditor> {
  if (ready) return Promise.resolve(ready);
  if (!pending) {
    pending = import("./AddressEditorFlow")
      .then((module) => { ready = module.AddressEditorFlow; return ready; })
      .catch((error: unknown) => { pending = null; throw error; });
  }
  return pending;
}
```

### apps/customer-web-next/src/hooks/use-chef-read-panels.ts

```typescript
"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  captureSessionContext,
  getSession,
  isSessionContextCurrent,
  isSessionReady,
  subscribeSession,
} from "@/services/auth/cravesAuth";
import { sessionFetch } from "@/services/auth/sessionFetch";

type PanelStatus = "loading" | "ready" | "error";
export type ChefReadPanel<T> = { status: PanelStatus; data: T | undefined; error: string };
type PanelSource<T> = { path: string; label: string; decode: (raw: unknown) => T };
type Sources = Record<string, PanelSource<unknown>>;
type Panels<S extends Sources> = {
  [K in keyof S]: ChefReadPanel<ReturnType<S[K]["decode"]>>;
};

export const CHEF_PANEL_TIMEOUT_MS = 15_000;

function ownerScope(): string {
  const context = captureSessionContext();
  return JSON.stringify([context.generation, context.identityId, canReadChef()]);
}
const serverScope = () => "server";

function canReadChef(): boolean {
  return (
    isSessionReady() && getSession()?.roles.some((role) => role.toUpperCase() === "CHEF") === true
  );
}

function emptyPanels<S extends Sources>(sources: S): Panels<S> {
  return Object.fromEntries(
    Object.keys(sources).map((key) => [
      key,
      {
        status: "loading",
        data: undefined,
        error: "",
      },
    ]),
  ) as Panels<S>;
}

/** Read-only chef sections settle independently, and never cross a login change. */
export function useChefReadPanels<S extends Sources>(sources: S) {
  const scope = useSyncExternalStore(subscribeSession, ownerScope, serverScope);
  const [revision, setRevision] = useState(0);
  const requestRevision = useRef(0);
  const [snapshot, setSnapshot] = useState(() => ({
    scope: "server",
    panels: emptyPanels(sources),
    updatedAt: null as Date | null,
  }));

  useEffect(() => {
    const context = captureSessionContext();
    const currentRevision = ++requestRevision.current;
    let active = true;
    const controllers: AbortController[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const current = () =>
      active &&
      currentRevision === requestRevision.current &&
      canReadChef() &&
      isSessionContextCurrent(context);

    setSnapshot({ scope, panels: emptyPanels(sources), updatedAt: null });
    for (const [key, source] of Object.entries(sources)) {
      const controller = new AbortController();
      controllers.push(controller);
      let timer: ReturnType<typeof setTimeout>;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`${source.label} took too long to load. Please try again.`));
        }, CHEF_PANEL_TIMEOUT_MS);
        timers.push(timer);
      });
      const read = async () => {
        if (!current() || context.identityId === null)
          throw new Error("Your chef session is unavailable.");
        const response = await sessionFetch(source.path, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`${source.label} could not load. Please try again.`);
        return source.decode(await response.json());
      };
      void Promise.race([read(), timeout])
        .then((data) => {
          if (!current()) return;
          setSnapshot((previous) =>
            previous.scope === scope
              ? {
                  ...previous,
                  panels: { ...previous.panels, [key]: { status: "ready", data, error: "" } },
                  updatedAt: new Date(),
                }
              : previous,
          );
        })
        .catch((caught) => {
          if (!current()) return;
          setSnapshot((previous) =>
            previous.scope === scope
              ? {
                  ...previous,
                  panels: {
                    ...previous.panels,
                    [key]: {
                      status: "error",
                      data: undefined,
                      error:
                        caught instanceof Error
                          ? caught.message
                          : `${source.label} is unavailable.`,
                    },
                  },
                }
              : previous,
          );
        })
        .finally(() => clearTimeout(timer));
    }
    return () => {
      active = false;
      controllers.forEach((controller) => controller.abort());
      timers.forEach(clearTimeout);
    };
  }, [scope, revision, sources]);

  const panels = snapshot.scope === scope ? snapshot.panels : emptyPanels(sources);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const pending = Object.values(panels).some((panel) => panel.status === "loading");
  return {
    panels,
    refresh,
    pending,
    updatedAt: snapshot.scope === scope ? snapshot.updatedAt : null,
  };
}
```

### apps/customer-web-next/src/lib/admin-library-loading.vitest.ts

```typescript
// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AdminLayout from "../app/admin/layout";
import type { SessionState } from "./admin-renewal";

const fixture = vi.hoisted(() => ({
  pathname: "/admin", loadIdentity: vi.fn(),
  observer: null as ((state: SessionState) => void) | null,
}));
// Loading the active layout must never evaluate optional chart/grid code.
vi.mock("@syncfusion/ej2-base", () => { throw new Error("Unused Syncfusion base was imported"); });
vi.mock("@syncfusion/ej2-react-charts", () => { throw new Error("Unused Syncfusion charts were imported"); });
vi.mock("@syncfusion/ej2-react-grids", () => { throw new Error("Unused Syncfusion grids were imported"); });
vi.mock("next/navigation", () => ({ usePathname: () => fixture.pathname }));
vi.mock("./admin-session", () => ({ loadAdminIdentity: fixture.loadIdentity }));
vi.mock("./admin-renewal", () => ({
  observeAdminSession: (accept: (state: SessionState) => void) => {
    fixture.observer = accept; accept("ready");
    return () => { fixture.observer = null; };
  },
  logoutAdminSession: vi.fn(async () => {}),
}));
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  fixture.pathname = "/admin";
  fixture.loadIdentity.mockReset().mockResolvedValue({
    displayName: "Verified administrator", email: "admin@example.invalid", status: "ACTIVE", adminEnabled: true,
  });
});
afterEach(cleanup);

it("renders verified administration and its navigation without importing optional chart libraries", async () => {
  render(createElement(AdminLayout, null, createElement("h1", null, "Protected module content")));
  expect(await screen.findByRole("heading", { name: "Protected module content" })).toBeTruthy();
  expect(screen.getAllByText("Verified administrator").length).toBeGreaterThan(0);
  const menu = screen.getByRole("navigation", { name: "Administration modules" });
  expect(menu.querySelector('a[href="/admin/analytics"]')).toBeTruthy();
  expect(menu.querySelector('a[href="/admin/finance"]')).toBeTruthy();
  act(() => fixture.observer?.("ended"));
  expect(screen.queryByRole("heading", { name: "Protected module content" })).toBeNull();
  expect(screen.getByText("Your administrator session has ended. Please sign in again.")).toBeTruthy();
});

it("retains the distinct Academy workspace and the same private authorization gate", async () => {
  fixture.pathname = "/admin/academy";
  render(createElement(AdminLayout, null, createElement("h2", null, "Protected learning content")));
  expect(await screen.findByRole("heading", { name: "Protected learning content" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Craves Academy" })).toBeTruthy();
  act(() => fixture.observer?.("ended"));
  expect(screen.queryByRole("heading", { name: "Protected learning content" })).toBeNull();
  expect(screen.getByText("Your administrator session has ended. Please sign in again.")).toBeTruthy();
});
```

### apps/customer-web-next/src/lib/all-chefs-navigation.test.ts

```typescript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("mobile Chefs navigation opens the dedicated all-chefs page", () => {
  const nav = source("../components/layout/BottomNavContent.tsx");
  const route = source("../app/chefs/page.tsx");
  const page = source("../screens/public/AllChefs/AllChefs.tsx");
  const returnNavigation = source("./return-navigation.ts");

  assert.match(nav, /href: "\/chefs"/);
  assert.match(nav, /pathname === "\/chefs"/);
  assert.doesNotMatch(nav, /home#nearby-kitchens-heading/);
  assert.match(route, /AllChefsPage/);
  assert.match(page, /discoverKitchens\(/);
  assert.match(page, /DEFAULT_DISCOVERY_RADIUS_METERS/);
  assert.match(page, /loadSelectedAddress\(\)/);
  assert.match(page, /<KitchensGrid/);
  assert.match(page, /returnPath="\/chefs"/);
  assert.match(page, /rememberReturnRoute\("\/addresses", "\/chefs"\)/);
  assert.match(returnNavigation, /\| "\/chefs"/);
  assert.match(returnNavigation, /value === "\/chefs"/);
});

test("delivery location control uses the compact Swiggy-Zomato style address button", () => {
  const header = source("../components/home/BrowseHeader.tsx");

  assert.match(header, /data-craves-location-button="mobile"/);
  assert.match(header, /rounded-\[1\.1rem\] border border-\[#E5E7EB\] !bg-white/);
  assert.match(header, /shadow-\[0_4px_16px_rgba\(26,26,26,0\.07\)\]/);
  assert.match(header, /<FaMapMarkerAlt/);
  assert.match(header, /<ChevronDown/);
  assert.match(header, /\{locationTypeLabel\}/);
  assert.match(header, /\{locationLabel\}/);
});
```

### apps/customer-web-next/src/lib/bottom-nav-loading.vitest.ts

```typescript
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ComponentType } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { BottomNav } from "../components/layout/BottomNav";

const fixture = vi.hoisted(() => ({ pathname: "/chef", count: 2, imports: 0, subscribers: new Set<() => void>() }));
vi.mock("next/navigation", () => ({ usePathname: () => fixture.pathname }));
vi.mock("../services/api/cravesCart", () => ({
  cartCount: () => fixture.count,
  cartTotal: () => fixture.count * 100,
  cartCurrency: () => "INR",
  subscribeCart: (listener: () => void) => {
    fixture.subscribers.add(listener);
    return () => { fixture.subscribers.delete(listener); };
  },
}));
vi.mock("next/dynamic", async () => {
  const { createElement, lazy, Suspense } = await import("react");
  return {
    default: (loader: () => Promise<{ default: ComponentType }>, options: { loading: ComponentType }) => {
      const Deferred = lazy(async () => { fixture.imports += 1; return loader(); });
      return () => createElement(Suspense, { fallback: createElement(options.loading) }, createElement(Deferred));
    },
  };
});
beforeEach(() => {
  fixture.pathname = "/chef";
  fixture.count = 2;
  vi.stubGlobal("matchMedia", vi.fn((media: string) => ({ media, matches: true, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("customer navigation loading", () => {
  it("does not import customer animation code or subscribe to cart changes on hidden routes", () => {
    const view = render(createElement(BottomNav));
    for (const pathname of ["/", "/chef", "/chef/menu", "/admin", "/admin/accounts", "/cart", "/checkout", "/checkout/fixture/payment", "/sign-in", "/contact", "/privacy", "/terms", "/security", "/refunds-cancellations", "/products-pricing", "/confirmation"]) {
      fixture.pathname = pathname;
      view.rerender(createElement(BottomNav));
      expect(view.container.childElementCount).toBe(0);
      expect(fixture.subscribers.size).toBe(0);
    }
    expect(fixture.imports).toBe(0);
  });

  it("keeps the visible navigation destinations, active page and changing cart count", async () => {
    fixture.pathname = "/home";
    render(createElement(BottomNav));
    await act(async () => { await import("../components/layout/BottomNavContent"); });
    await screen.findByRole("navigation", { name: "Customer navigation" });
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBe("page");
    for (const [label, path] of [["Home", "/home"], ["Meal Subscription", "/subscriptions"], ["Chefs", "/chefs"], ["Profile", "/profile"], ["Cart, 2 items", "/cart"]]) {
      expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe(path);
    }
    expect(fixture.subscribers.size).toBe(1);
    act(() => { fixture.count = 3; fixture.subscribers.forEach(listener => listener()); });
    expect(screen.getByRole("link", { name: "Cart, 3 items" })).toBeTruthy();
  });

  it("cleans up hidden-route subscriptions and restores the current visible route after transitions", async () => {
    fixture.pathname = "/chefs";
    const view = render(createElement(BottomNav));
    await screen.findByRole("navigation", { name: "Customer navigation" });
    expect(screen.getByRole("link", { name: "Chefs" }).getAttribute("aria-current")).toBe("page");
    fixture.pathname = "/chef/profile";
    view.rerender(createElement(BottomNav));
    expect(screen.queryByRole("navigation", { name: "Customer navigation" })).toBeNull();
    expect(fixture.subscribers.size).toBe(0);
    fixture.count = 0;
    fixture.pathname = "/profile";
    view.rerender(createElement(BottomNav));
    await screen.findByRole("navigation", { name: "Customer navigation" });
    expect(screen.getByRole("link", { name: "Profile" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Cart" })).toBeTruthy();
    await waitFor(() => expect(fixture.subscribers.size).toBe(1));
  });
});
```

### apps/customer-web-next/src/lib/cart-checkout-integration.test.ts

```typescript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("cart has no demo or local mutation fallback", () => {
  const cart = source("../services/api/cravesCart.ts");
  assert.match(cart, /sessionFetch\(path/);
  assert.match(cart, /\/api\/cart/);
  assert.match(cart, /throw error/);
  assert.doesNotMatch(cart, /demo|localStorage|sessionStorage|fallback/i);
  assert.doesNotMatch(cart, /crypto\.randomUUID/);
});

test("cart validates with the backend before address selection", () => {
  const page = source("../screens/Cart/Cart.tsx");
  const bar = source("../components/cart/CartCheckoutBar.tsx");
  const cartService = source("../services/api/cravesCart.ts");
  assert.match(page, /await validateCart\(\)/);
  assert.match(page, /navigate\(\{ to: "\/checkout" \}\)/);
  assert.match(page, /cartCurrency\(\)/);
  assert.match(bar, /bg-\[#6B6B6B\]/);
  assert.match(bar, /hover:bg-\[#555555\]/);
  assert.match(cartService, /await cartRequest\("\/api\/cart", \{ method: "DELETE" \}\)/);
  assert.match(cartService, /return cartMatchesCheckout\(expected\)/);
});

test("cart and checkout do not block first render on prep-time enrichment", () => {
  const cart = source("../screens/Cart/Cart.tsx");
  const checkout = source("../screens/Checkout/Checkout.tsx");

  assert.match(cart, /async function resolveLeadMinutes/);
  assert.match(
    cart,
    /setItems\(nextItems\)[\s\S]{0,420}setLoading\(false\)[\s\S]{0,220}void resolveLeadMinutes\(nextItems\)/,
  );
  assert.match(checkout, /async function resolveLeadMinutes/);
  assert.match(
    checkout,
    /setItems\(nextItems\)[\s\S]{0,260}setLoading\(false\)[\s\S]{0,260}void resolveLeadMinutes\(nextItems\)/,
  );
});

test("checkout uses the idempotent backend operation with an exact cart snapshot", () => {
  const page = source("../screens/Checkout/Checkout.tsx");
  const cartPage = source("../screens/Cart/Cart.tsx");
  assert.match(page, /parseCustomerAddresses\(raw\)/);
  assert.match(page, /filter\(isDeliveryReadyAddress\)/);
  assert.match(
    page,
    /activeAddresses\.find\(\(address\) => address\.isDefault\)[\s\S]{0,180}activeAddresses\.find\(\(address\) => address\.id === lastUsedId\)/,
  );
  assert.match(page, /\/api\/checkout\/operations\//);
  assert.match(page, /checkoutCartSnapshot\(validatedCart\)/);
  assert.match(page, /parseCheckoutOperationResponse\(raw\)/);
  assert.match(page, /CHECKOUT_OPERATION_ID_KEY/);
  assert.match(page, /crypto\.randomUUID\(\)/);
  assert.match(page, /fetchCheckoutOperation\(storedOperationId\)/);
  assert.match(page, /fetchCheckout\(operation\.checkoutId\)/);
  assert.match(page, /createAuthoritativeCheckout/);
  assert.match(page, /deliveryAddressId,/);
  assert.match(page, /parseCheckout\(raw\)/);
  assert.match(page, /CHECKOUT_ID_KEY/);
  assert.match(page, /fetchCheckout\(storedCheckoutId\)/);
  assert.match(page, /window\.sessionStorage\.setItem\(CHECKOUT_ID_KEY, prepared\.id\)/);
  assert.doesNotMatch(page, /sessionFetch\("\/api\/checkout",/);
  assert.match(cartPage, /removeItem\(CHECKOUT_OPERATION_ID_KEY\)/);
  assert.doesNotMatch(
    page,
    /<AddressEditorFlow[\s\S]{0,320}\baddresses=/,
  );
  assert.doesNotMatch(page, /deliveryFee\s*=|platformFee\s*=|taxAmount\s*=/);
});

test("Razorpay payment is contract validated and backend verified", () => {
  const payment = source("../components/checkout/CheckoutPaymentButton.tsx");
  assert.match(payment, /https:\/\/checkout\.razorpay\.com\/v1\/checkout\.js/);
  assert.match(payment, /parsePaymentSession\(raw\)/);
  assert.match(payment, /parsePaymentStatus\(raw\)/);
  assert.match(payment, /parsePaymentVerification\(raw\)/);
  assert.match(payment, /\/api\/payments\/orders/);
  assert.match(payment, /sessionFetch/);
  assert.match(payment, /const session = await loadSession\(\{ hydrateCustomerProfile: "background" \}\)/);
  assert.match(payment, /if \(!checkout\) \{[\s\S]*await ensureCheckout\(\);[\s\S]*return;/);
  assert.match(payment, /Preparing total/);
  assert.match(payment, /bg-\[#16A34A\]/);
  assert.doesNotMatch(payment, /"Review total"/);
  assert.match(payment, /\/verify/);
  assert.doesNotMatch(
    payment,
    /<(input|textarea)[^>]*(name|id|autoComplete)=[^>]*(card|cvv|upi[-_ ]?pin)/i,
  );
  assert.match(payment, /amount:\s*payment\.amountPaise/);
  assert.match(payment, /router\.replace\(\`\/orders\/\$\{orderId\}\`\)/);
  assert.doesNotMatch(payment, /amount\s*:\s*Math\.round\(/);
});
```

### apps/customer-web-next/src/lib/chef-application-session.vitest.ts

```typescript
// @vitest-environment jsdom
import { createElement, useEffect, useRef, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChefApplicationSessionBoundary } from "../components/chef-application-session-boundary";
import { ChefApplicationWorkspace } from "../components/chef-application-workspace";
import { captureSessionContext, invalidateSession, setSessionIdentity, setSessionEmailVerification } from "../services/auth/cravesAuth";
import type { CravesIdentity } from "./auth-contract";

let verifiedEmail = false;
vi.mock("../components/auth/EmailVerificationPanel", () => ({ EmailVerificationPanel: ({ onStateChange }: { onStateChange: (state: unknown) => void }) => {
  const callback = useRef(onStateChange);
  useEffect(() => { if (verifiedEmail) callback.current({ email: "a@example.invalid", emailVerified: true, emailRevision: 1, pending: null, serverTime: "2026-10-02T00:00:00Z" }); }, []);
  return null;
} }));
const owner: CravesIdentity = { id: "11111111-1111-4111-8111-111111111111", phoneNumber: "+10000000000", displayName: "Fixture A", email: "a@example.invalid", emailVerified: true, status: "ACTIVE", roles: ["CUSTOMER"] };
let current: CravesIdentity | null = owner;
const fetcher = vi.fn<typeof fetch>();
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) }; }
function PrivateChild() {
  const [draft, setDraft] = useState("");
  useEffect(() => { void fetch("/api/chef/application"); }, []);
  return createElement("input", { "aria-label": "Private chef draft", value: draft, onChange: (event: { target: { value: string } }) => setDraft(event.target.value) });
}
function boundary() { return render(createElement(ChefApplicationSessionBoundary, null, createElement(PrivateChild))); }
function normal(input: RequestInfo | URL) {
  if (String(input) === "/api/auth/me") return Promise.resolve(Response.json(current || {}, { status: current ? 200 : 401 }));
  if (String(input) === "/api/auth/refresh") return Promise.resolve(Response.json({ identity: current }, { status: current ? 200 : 401 }));
  return Promise.resolve(Response.json({}, { status: 404 }));
}
beforeEach(() => { verifiedEmail = false; current = owner; invalidateSession(captureSessionContext()); fetcher.mockReset().mockImplementation(normal); vi.stubGlobal("fetch", fetcher); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("waits for expired-session recovery before mounting private sections", async () => {
  const refresh = deferred<Response>(); let renewed = false;
  fetcher.mockImplementation(input => {
    if (String(input) === "/api/auth/me" && !renewed) return Promise.resolve(Response.json({}, { status: 401 }));
    if (String(input) === "/api/auth/refresh") return refresh.promise;
    return normal(input);
  });
  boundary();
  await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url === "/api/auth/refresh")).toBe(true));
  expect(fetcher.mock.calls.some(([url]) => url === "/api/chef/application")).toBe(false);
  await act(async () => { renewed = true; refresh.resolve(Response.json({ identity: owner })); });
  await screen.findByLabelText("Private chef draft");
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/auth/refresh")).toHaveLength(1);
});

it("opens a new application when optional address/profile prefills fail", async () => {
  fetcher.mockImplementation(input => String(input) === "/api/chef/application"
    ? Promise.resolve(Response.json({ status: "NOT_SUBMITTED", documents: [] }))
    : Promise.reject(new Error("Optional prefill unavailable")));
  render(createElement(ChefApplicationWorkspace));
  await screen.findByRole("button", { name: /Become a Chef/ });
});

it("shows repeated load failures after retry without an unhandled rejection", async () => {
  fetcher.mockResolvedValue(Response.json({}, { status: 503 }));
  render(createElement(ChefApplicationWorkspace));
  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  await screen.findByText("We couldn’t load your application right now.");
  expect(screen.getByRole("button", { name: "Try again" }).hasAttribute("disabled")).toBe(false);
});

it("resubmits corrected rejected applications and does not fake a pending state on failure", async () => {
  verifiedEmail = true;
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  vi.stubGlobal("scrollTo", vi.fn());
  const rejected = {
    id: owner.id, status: "REJECTED", email: "a@example.invalid", firstName: "Fixture", lastName: "Chef",
    addressLine1: "1 Test Road", city: "Hyderabad", state: "Telangana", rejectionReason: "Please replace the ID photo",
    documents: ["APPLICANT_PHOTO", "GOVERNMENT_ID_FRONT", "GOVERNMENT_ID_BACK", "TAX_ID_CARD"].map(documentType => ({
      id: owner.id, documentType, originalFileName: "fixture.png", contentType: "image/png", fileSizeBytes: 100,
      status: "UPLOADED", createdAt: "2026-10-02T00:00:00Z",
    })),
  };
  let succeeds = false;
  fetcher.mockImplementation((input, init) => Promise.resolve(Response.json(
    init?.method === "POST" ? succeeds ? { ...rejected, status: "PENDING", rejectionReason: null }
      : { code: "EMAIL_AUTHORITY_UNAVAILABLE", message: "We couldn’t confirm your verified email right now." }
      : String(input) === "/api/chef/application" ? rejected : [],
    { status: init?.method === "POST" && !succeeds ? 503 : 200 },
  )));
  render(createElement(ChefApplicationWorkspace));
  const submit = await screen.findByRole("button", { name: "Resubmit for verification" });
  await waitFor(() => expect(submit.hasAttribute("disabled")).toBe(false));
  fireEvent.click(submit);
  await screen.findByText("We couldn’t confirm your verified email right now.");
  expect(screen.queryByText("Application under review")).toBeNull();
  succeeds = true;
  fireEvent.click(screen.getByRole("button", { name: "Resubmit for verification" }));
  await screen.findByRole("button", { name: "View verification status" });
  const posts = fetcher.mock.calls.filter(([, init]) => init?.method === "POST");
  expect(posts).toHaveLength(2);
  expect(JSON.parse(posts[1][1]!.body as string).email).toBe("a@example.invalid");
});

it("allows an active CUSTOMER to apply before chef approval", async () => {
  boundary(); await screen.findByLabelText("Private chef draft");
});

it("discards a pending application's save receipt after the account is replaced", async () => {
  verifiedEmail = true;
  setSessionIdentity(owner);
  const saving = deferred<Response>();
  const rejected = {
    id: owner.id, status: "REJECTED", email: "a@example.invalid", firstName: "Fixture", lastName: "Chef",
    addressLine1: "1 Test Road", city: "Hyderabad", state: "Telangana", rejectionReason: "Please replace the ID photo",
    documents: ["APPLICANT_PHOTO", "GOVERNMENT_ID_FRONT", "GOVERNMENT_ID_BACK", "TAX_ID_CARD"].map(documentType => ({
      id: owner.id, documentType, originalFileName: "fixture.png", contentType: "image/png", fileSizeBytes: 100,
      status: "UPLOADED", createdAt: "2026-10-02T00:00:00Z",
    })),
  };
  fetcher.mockImplementation((input, init) => {
    if (String(input) !== "/api/chef/application") return normal(input);
    if (init?.method === "POST") return saving.promise;
    return Promise.resolve(Response.json(current?.id === owner.id ? rejected : { status: "APPROVED", documents: [] }));
  });
  render(createElement(ChefApplicationSessionBoundary, null, createElement(ChefApplicationWorkspace)));
  const submit = await screen.findByRole("button", { name: "Resubmit for verification" });
  await waitFor(() => expect(submit.hasAttribute("disabled")).toBe(false));
  fireEvent.click(submit);
  await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
  await act(async () => { current = { ...owner, id: "22222222-2222-4222-8222-222222222222" }; setSessionIdentity(current); });
  await screen.findByText("You’re approved");
  await act(async () => { saving.resolve(Response.json({ ...rejected, status: "PENDING" })); });
  expect(screen.getByText("You’re approved")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "View verification status" })).toBeNull();
});

it("saves a new application through the guided flow and restores its saved state after remount", async () => {
  verifiedEmail = true;
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  vi.stubGlobal("scrollTo", vi.fn());
  let saved: Record<string, unknown> = { status: "NOT_SUBMITTED", documents: [] };
  fetcher.mockImplementation((input, init) => {
    if (String(input) !== "/api/chef/application") return Promise.resolve(Response.json([]));
    if (init?.method === "POST") saved = { ...JSON.parse(init.body as string), id: owner.id, status: "PENDING", documents: [] };
    return Promise.resolve(Response.json(saved));
  });
  const view = render(createElement(ChefApplicationWorkspace));
  fireEvent.click(await screen.findByRole("button", { name: /Become a Chef/ }));
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Test" } });
  fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Chef" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  const accountContinue = screen.getByRole("button", { name: "Continue" });
  await waitFor(() => expect(accountContinue.hasAttribute("disabled")).toBe(false));
  fireEvent.click(accountContinue);
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.change(screen.getByLabelText("Flat / House / Building"), { target: { value: "1 Test Road" } });
  fireEvent.change(screen.getByLabelText("City"), { target: { value: "Hyderabad" } });
  fireEvent.change(screen.getByLabelText("State"), { target: { value: "Telangana" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "Save details and continue" }));
  await screen.findByRole("heading", { name: "Verify your identity" });
  expect(saved).toMatchObject({ firstName: "Test", email: "a@example.invalid", status: "PENDING", latitude: null, longitude: null });
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  view.unmount();
  render(createElement(ChefApplicationWorkspace));
  await screen.findByRole("heading", { name: "Verify your identity" });
  expect(screen.queryByRole("button", { name: /Become a Chef/ })).toBeNull();
});

it("provides retry for a failed check and never mounts the private form prematurely", async () => {
  fetcher.mockRejectedValue(new Error("private diagnostics")); boundary();
  await screen.findByText("We couldn’t open your application");
  expect(screen.queryByLabelText("Private chef draft")).toBeNull();
  expect(screen.queryByText("private diagnostics")).toBeNull();
  fetcher.mockImplementation(normal); fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByLabelText("Private chef draft");
});

it("offers sign-in with an application return path when the session has ended", async () => {
  current = null; boundary();
  expect((await screen.findByRole("link", { name: "Sign in" })).getAttribute("href")).toBe("/sign-in?returnTo=/chef/application");
  expect(screen.queryByLabelText("Private chef draft")).toBeNull();
});

it("clears private drafts on account switch and keeps same-owner email updates", async () => {
  boundary(); fireEvent.change(await screen.findByLabelText("Private chef draft"), { target: { value: "private draft A" } });
  act(() => setSessionEmailVerification(owner.id, { email: "replacement@example.invalid", emailVerified: true, emailRevision: 2, pending: null, serverTime: "2026-09-17T00:00:00Z" }));
  expect((screen.getByLabelText("Private chef draft") as HTMLInputElement).value).toBe("private draft A");
  current = { ...owner, id: "22222222-2222-4222-8222-222222222222" };
  act(() => { setSessionIdentity(current!); });
  expect(screen.queryByLabelText("Private chef draft")).toBeNull();
  expect((await screen.findByLabelText("Private chef draft") as HTMLInputElement).value).toBe("");
});

it("does not expose private children for a suspended account", async () => {
  current = { ...owner, status: "SUSPENDED" }; boundary();
  await screen.findByRole("link", { name: "Sign in" });
  expect(screen.queryByLabelText("Private chef draft")).toBeNull();
});

it("ends a hung screen check after 15 seconds", async () => {
  vi.useFakeTimers(); fetcher.mockImplementation(() => new Promise(() => {})); boundary();
  await act(async () => { vi.advanceTimersByTime(15_000); });
  expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  expect(screen.queryByLabelText("Private chef draft")).toBeNull();
});

it("never accepts a delayed response after unmount", async () => {
  const late = deferred<Response>(); fetcher.mockReturnValue(late.promise); const view = boundary(); view.unmount();
  await act(async () => { late.resolve(Response.json(owner)); });
  expect(fetcher.mock.calls.some(([url]) => url === "/api/chef/application")).toBe(false);
});

it("shows failed application reads truthfully and keeps private editing unavailable until retry succeeds", async () => {
  fetcher.mockResolvedValue(Response.json({}, { status: 503 }));
  render(createElement(ChefApplicationWorkspace));
  await screen.findByText("We couldn’t load your application right now.");
  expect(screen.queryByRole("button", { name: "Start my application" })).toBeNull();
  expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();

  fetcher.mockImplementation(input => Promise.resolve(Response.json(
    String(input) === "/api/chef/application"
      ? { id: owner.id, status: "APPROVED", firstName: "Fixture", documents: [], latitude: null, longitude: null }
      : [],
  )));
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("heading", { name: "Congratulations! You’re now a Craves chef" });
  expect(screen.getByRole("link", { name: "Continue Chef setup" }).getAttribute("href")).toBe("/chef");
  expect(screen.getByText("Your Chef Mode is ready. Save your kitchen details, then add and publish your dishes.")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Add my first dish" })).toBeNull();
  expect(screen.getAllByRole("link")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
});

it("keeps a successfully loaded pending application editable through the guided flow", async () => {
  fetcher.mockImplementation(input => Promise.resolve(Response.json(
    String(input) === "/api/chef/application"
      ? {
          id: owner.id,
          status: "PENDING",
          email: "fixture@example.invalid",
          firstName: "Fixture",
          lastName: "Chef",
          addressLine1: "1 Fixture Road",
          city: "Fixture City",
          state: "Fixture State",
          documents: [],
          latitude: null,
          longitude: null,
        }
      : [],
  )));
  render(createElement(ChefApplicationWorkspace));
  await screen.findByRole("heading", { name: "Verify your identity" });

  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  vi.stubGlobal("scrollTo", vi.fn());
  for (const heading of ["Food Safety Details", "Show your kitchen", "Where is your kitchen located?", "Tell customers about your kitchen", "Let’s get to know you", "What’s your name?"]) {
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("heading", { name: heading });
  }

  const firstName = await screen.findByLabelText("First name") as HTMLInputElement;
  expect(firstName.disabled).toBe(false);
  fireEvent.change(firstName, { target: { value: "Corrected" } });
  expect(firstName.value).toBe("Corrected");
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  fireEvent.change(firstName, { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(firstName.getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(firstName);
  expect(screen.getByRole("alert").textContent).toContain("First name is required");
  expect(fetcher.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);

});
```

### apps/customer-web-next/src/lib/chef-read-panels-performance.vitest.ts

```typescript
// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChefOperationsWorkspace } from "@/components/chef-operations-workspace";
import ChefProfilePage from "@/app/chef/profile/page";
import { CHEF_PANEL_TIMEOUT_MS } from "@/hooks/use-chef-read-panels";
import {
  captureSessionContext,
  invalidateSession,
  setSessionIdentity,
} from "@/services/auth/cravesAuth";
import type { CravesIdentity } from "@/lib/auth-contract";

vi.mock("@/components/chef-access-boundary", () => ({
  ChefAccessBoundary: ({ children }: { children: unknown }) => children,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/chef/profile" }));
const a: CravesIdentity = {
  id: "11111111-1111-4111-8111-111111111111",
  phoneNumber: "+10000000000",
  displayName: "Fixture A",
  email: "a@example.invalid",
  emailVerified: true,
  status: "ACTIVE",
  roles: ["CHEF"],
};
const b: CravesIdentity = {
  ...a,
  id: "22222222-2222-4222-8222-222222222222",
  displayName: "Fixture B",
};
const application = { status: "APPROVED", firstName: "Private A", lastName: "Fixture" };
const kitchen = {
  id: a.id,
  kitchenName: "Private kitchen A",
  addressLine1: "Fixture address",
  city: "Fixture city",
  state: "Fixture state",
  status: "ACTIVE",
  latitude: 17,
  longitude: 78,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};
const menu = [
  {
    id: a.id,
    itemName: "Fixture meal",
    category: "Lunch",
    foodType: "VEG",
    price: 100,
    currency: "INR",
    unitPackageWeightGrams: 500,
    thermoboxRequired: false,
    available: true,
    status: "ACTIVE",
    images: [],
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  },
];
const readiness = {
  contractVersion: 1,
  applicationStatus: "APPROVED",
  emailStatus: "VERIFIED",
  approvalReady: false,
  requiredDocumentCount: 4,
  uploadedDocumentCount: 4,
  approvedDocumentCount: 4,
  documents: ["APPLICANT_PHOTO", "GOVERNMENT_ID_FRONT", "GOVERNMENT_ID_BACK", "TAX_ID_CARD"].map(
    (documentType) => ({ documentType, status: "APPROVED", rejectionReason: null }),
  ),
  blockingIssues: [],
  evaluatedAt: "2026-10-01T00:00:00Z",
  lastSavedAt: null,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function normal(input: RequestInfo | URL): Promise<Response> {
  const path = String(input);
  const raw = path.endsWith("/readiness")
    ? readiness
    : path.endsWith("/application")
      ? application
      : path.endsWith("/kitchen")
        ? kitchen
        : menu;
  return Promise.resolve(Response.json(raw));
}
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  setSessionIdentity(a);
  fetcher = vi.fn<typeof fetch>(normal);
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("renders healthy operations independently while readiness is slow, then uses the existing discovery rule", async () => {
  const slow = deferred<Response>();
  fetcher.mockImplementation((input) =>
    String(input).endsWith("/readiness") ? slow.promise : normal(input),
  );
  render(createElement(ChefOperationsWorkspace));
  expect(await screen.findByText("1 available")).toBeTruthy();
  expect(screen.getByText("APPROVED")).toBeTruthy();
  expect(screen.getByText("Checking operational states")).toBeTruthy();
  expect(screen.queryByText("Kitchen is operationally discoverable")).toBeNull();
  await act(async () => slow.resolve(Response.json(readiness)));
  expect(await screen.findByText("Kitchen is operationally discoverable")).toBeTruthy();
  expect(screen.getByText("4/4 approved")).toBeTruthy();
});

it("keeps healthy panels after a menu error without inventing zero availability, and retries fresh state", async () => {
  fetcher.mockImplementation((input) =>
    String(input).endsWith("/menu")
      ? Promise.resolve(Response.json({}, { status: 503 }))
      : normal(input),
  );
  render(createElement(ChefOperationsWorkspace));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByText("0 available")).toBeNull();
  expect(screen.getByText("MAPPED")).toBeTruthy();
  expect(screen.queryByText("Kitchen is operationally discoverable")).toBeNull();
  fetcher.mockImplementation(normal);
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(await screen.findByText("Kitchen is operationally discoverable")).toBeTruthy();
});

it("bounds a hanging request, aborts it and keeps useful sections available", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  fetcher.mockImplementation((input, init) => {
    if (String(input).endsWith("/readiness")) {
      signal = init?.signal as AbortSignal;
      return new Promise(() => {});
    }
    return normal(input);
  });
  render(createElement(ChefOperationsWorkspace));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(CHEF_PANEL_TIMEOUT_MS);
  });
  expect(screen.getByRole("alert").textContent).toContain("took too long");
  expect(signal?.aborted).toBe(true);
  expect(screen.getByText("1 available")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement).disabled).toBe(
    false,
  );
});

it("shows application details before a slow kitchen and clears private content synchronously on logout", async () => {
  const slow = deferred<Response>();
  fetcher.mockImplementation((input) =>
    String(input).endsWith("/kitchen") ? slow.promise : normal(input),
  );
  render(createElement(ChefProfilePage));
  expect(await screen.findByRole("heading", { name: "Private A Fixture" })).toBeTruthy();
  expect(screen.getAllByText("Loading kitchen details…").length).toBeGreaterThan(0);
  act(() => {
    invalidateSession(captureSessionContext());
  });
  expect(screen.queryByRole("heading", { name: "Private A Fixture" })).toBeNull();
  await act(async () => slow.resolve(Response.json(kitchen)));
  expect(screen.queryByText("Private kitchen A")).toBeNull();
});

it("ignores an old owner's late response and hides private state on same-owner chef role revocation", async () => {
  const slow = deferred<Response>();
  fetcher.mockImplementation((input) =>
    String(input).endsWith("/kitchen") ? slow.promise : normal(input),
  );
  render(createElement(ChefProfilePage));
  await screen.findByRole("heading", { name: "Private A Fixture" });
  fetcher.mockImplementation((input) =>
    String(input).endsWith("/application")
      ? Promise.resolve(Response.json({ ...application, firstName: "Private B" }))
      : String(input).endsWith("/kitchen")
        ? Promise.resolve(Response.json({ ...kitchen, kitchenName: "Private kitchen B" }))
        : normal(input),
  );
  act(() => setSessionIdentity(b));
  expect(screen.queryByRole("heading", { name: "Private A Fixture" })).toBeNull();
  await screen.findByRole("heading", { name: "Private B Fixture" });
  await act(async () => slow.resolve(Response.json(kitchen)));
  expect(screen.queryByText("Private kitchen A")).toBeNull();
  act(() => setSessionIdentity({ ...b, roles: ["CUSTOMER"] }));
  expect(screen.queryByRole("heading", { name: "Private B Fixture" })).toBeNull();
  expect(screen.queryByText(/Private kitchen B/)).toBeNull();
});

it("reports invalid profile data honestly and recovers with fresh data on retry", async () => {
  fetcher.mockImplementation((input) =>
    String(input).endsWith("/application")
      ? Promise.resolve(Response.json({ status: "INVALID" }))
      : normal(input),
  );
  render(createElement(ChefProfilePage));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Chef details unavailable" })).toBeTruthy();
  expect(screen.queryByText("Application approved")).toBeNull();
  fetcher.mockImplementation(normal);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(screen.getByRole("heading", { name: "Private A Fixture" })).toBeTruthy(),
  );
});

it("uses the existing chef boundary's role case handling and clears panels after revocation", async () => {
  setSessionIdentity({ ...a, roles: ["chef"] });
  render(createElement(ChefOperationsWorkspace));
  expect(await screen.findByText("1 available")).toBeTruthy();
  act(() => {
    setSessionIdentity({ ...a, roles: ["CUSTOMER"] });
  });
  expect(screen.queryByText("1 available")).toBeNull();
  expect(screen.queryByText("Kitchen is operationally discoverable")).toBeNull();
});
```

### apps/customer-web-next/src/lib/chef-startup-performance.vitest.ts

```typescript
// @vitest-environment jsdom
import { createElement, useEffect, useRef } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChefAccessBoundary } from "../components/chef-access-boundary";
import { ChefApplicationSessionBoundary } from "../components/chef-application-session-boundary";
import { ChefModeDashboard } from "../components/chef-mode-dashboard";
import { ChefApplicationWorkspace } from "../components/chef-application-workspace";
import { captureSessionContext, invalidateSession, setSessionIdentity } from "../services/auth/cravesAuth";
import type { CravesIdentity } from "./auth-contract";

vi.mock("../components/location/AddressMapPicker", () => ({ AddressMapPicker: ({ latitude, longitude }: { latitude: number; longitude: number }) => createElement("div", { "data-testid": "kitchen-map", "data-latitude": latitude, "data-longitude": longitude }) }));
vi.mock("../components/auth/EmailVerificationPanel", () => ({ EmailVerificationPanel: ({ onStateChange }: { onStateChange: (value: unknown) => void }) => {
  const callback = useRef(onStateChange);
  useEffect(() => { callback.current({ email: "a@example.invalid", emailVerified: true, emailRevision: 1, pending: null, serverTime: "2026-10-02T00:00:00Z" }); }, []);
  return null;
} }));

const owner: CravesIdentity = { id: "11111111-1111-4111-8111-111111111111", phoneNumber: "+10000000000", displayName: "Fixture A", email: null, emailVerified: false, status: "ACTIVE", roles: ["CUSTOMER", "CHEF"] };
let identity = owner;
const fetcher = vi.fn<typeof fetch>();
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) }; }
const profile = { id: owner.id, registeredPhoneNumber: owner.phoneNumber, firstName: "Saved", lastName: "Name", email: null, createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" };
const kitchen = { id: owner.id, kitchenName: "Fixture kitchen", addressLine1: "1 Test Road", city: "Hyderabad", state: "Telangana", status: "DRAFT", createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" };
function normal(input: RequestInfo | URL) {
  const url = String(input);
  if (url === "/api/auth/me") return Promise.resolve(Response.json(identity));
  if (url === "/api/auth/refresh") return Promise.resolve(Response.json({ identity }));
  if (url === "/api/chef/application") return Promise.resolve(Response.json({ status: "APPROVED", documents: [] }));
  if (url === "/api/chef/kitchen") return Promise.resolve(Response.json(kitchen));
  if (url === "/api/customer/profile") return Promise.resolve(Response.json(profile));
  return Promise.resolve(Response.json([]));
}
beforeEach(() => {
  identity = owner;
  invalidateSession(captureSessionContext());
  setSessionIdentity(identity);
  window.localStorage.clear();
  fetcher.mockReset().mockImplementation(normal);
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("chef startup authorization", () => {
  it("opens approved tools after fresh role rotation without optional customer-profile requests", async () => {
    const rotation = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/auth/refresh" ? rotation.promise : normal(input));
    render(createElement(ChefAccessBoundary, null, createElement("p", null, "Private chef tools")));
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url === "/api/auth/refresh")).toBe(true));
    expect(screen.queryByText("Private chef tools")).toBeNull();
    await act(async () => { rotation.resolve(Response.json({ identity })); });
    await screen.findByText("Private chef tools");
    expect(fetcher.mock.calls.some(([url]) => url === "/api/customer/profile")).toBe(false);
  });
  it("keeps tools closed on failed role refresh and allows a fresh retry", async () => {
    let healthy = false;
    fetcher.mockImplementation(input => String(input) === "/api/auth/refresh" && !healthy ? Promise.resolve(Response.json({}, { status: 503 })) : normal(input));
    render(createElement(ChefAccessBoundary, null, createElement("p", null, "Private chef tools")));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await screen.findByRole("button", { name: "Try again" });
    expect(screen.queryByText("Private chef tools")).toBeNull();
    healthy = true;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Private chef tools");
  });
  it("does not open tools when fresh Auth removes a saved CHEF role", async () => {
    fetcher.mockImplementation(input => String(input) === "/api/auth/me" ? Promise.resolve(Response.json({ ...identity, roles: ["CUSTOMER"] })) : normal(input));
    render(createElement(ChefAccessBoundary, null, createElement("p", null, "Private chef tools")));
    await screen.findByText("Chef approval is still required");
    expect(screen.queryByText("Private chef tools")).toBeNull();
    expect(fetcher.mock.calls.some(([url]) => url === "/api/auth/refresh")).toBe(false);
  });
  it("ends a hung approved-access check and ignores its late response", async () => {
    vi.useFakeTimers();
    const check = deferred<Response>();
    fetcher.mockReturnValue(check.promise);
    render(createElement(ChefAccessBoundary, null, createElement("p", null, "Private chef tools")));
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    await act(async () => { check.resolve(Response.json(identity)); });
    expect(screen.queryByText("Private chef tools")).toBeNull();
  });
  it("aborts a hung identity request and can retry with a fresh lookup", async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation(milliseconds => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), milliseconds);
      return controller.signal;
    });
    let healthy = false;
    fetcher.mockImplementation((input, init) => healthy ? normal(input) : new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    render(createElement(ChefAccessBoundary, null, createElement("p", null, "Private chef tools")));
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.queryByText("Private chef tools")).toBeNull();
    healthy = true;
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Try again" })); });
    expect(screen.getByText("Private chef tools")).toBeTruthy();
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/auth/me")).toHaveLength(2);
  });
  it("keeps applicant details closed when a fresh identity response is invalid", async () => {
    fetcher.mockResolvedValue(Response.json({}));
    render(createElement(ChefApplicationSessionBoundary, null, createElement("p", null, "Private applicant form")));
    await screen.findByRole("button", { name: "Try again" });
    expect(screen.queryByText("Private applicant form")).toBeNull();
  });
  it("opens an applicant's private form without optional profile hydration", async () => {
    identity = { ...owner, roles: ["CUSTOMER"] };
    setSessionIdentity(identity);
    render(createElement(ChefApplicationSessionBoundary, null, createElement("p", null, "Private applicant form")));
    await screen.findByText("Private applicant form");
    expect(fetcher.mock.calls.some(([url]) => url === "/api/customer/profile")).toBe(false);
  });
});

describe("independent chef dashboard summaries", () => {
  it("shows kitchen and menu while orders and earnings remain pending, without reporting zero", async () => {
    const orders = deferred<Response>(); const earnings = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/chef/orders" ? orders.promise : String(input) === "/api/chef/earnings" ? earnings.promise : normal(input));
    render(createElement(ChefModeDashboard));
    await screen.findByText("Fixture kitchen");
    await screen.findByRole("heading", { name: "Add your first dish" });
    const summary = screen.getByRole("region", { name: "Kitchen summary" });
    const orderCard = within(summary).getByText("Today’s orders").closest("a")!;
    const earningsCard = within(summary).getByText("This week").closest("a")!;
    expect(within(orderCard).getByText("Loading…")).toBeTruthy();
    expect(within(earningsCard).getByText("Loading…")).toBeTruthy();
    await act(async () => { orders.resolve(Response.json([])); earnings.resolve(Response.json({}, { status: 503 })); });
    await within(orderCard).findByText("0");
    await within(earningsCard).findByText("Unavailable");
    expect(screen.queryByText("Appears after your first earning")).toBeNull();
  });
  it("drops an old owner's pending dashboard and never displays its late kitchen", async () => {
    const oldKitchen = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/chef/kitchen" && identity.id === owner.id ? oldKitchen.promise : normal(input));
    render(createElement(ChefModeDashboard));
    await screen.findByText("Hello, Fixture A");
    await act(async () => { identity = { ...owner, id: "22222222-2222-4222-8222-222222222222", displayName: "Fixture B" }; setSessionIdentity(identity); });
    await screen.findByText("Hello, Fixture B");
    await act(async () => { oldKitchen.resolve(Response.json({ ...kitchen, kitchenName: "Old private kitchen" })); });
    expect(screen.queryByText("Old private kitchen")).toBeNull();
    expect(screen.queryByText("Hello, Fixture A")).toBeNull();
  });
  it("does not treat malformed orders or earnings as empty summaries", async () => {
    fetcher.mockImplementation(input => ["/api/chef/orders", "/api/chef/earnings"].includes(String(input)) ? Promise.resolve(Response.json({ invalid: true })) : normal(input));
    render(createElement(ChefModeDashboard));
    const summary = await screen.findByRole("region", { name: "Kitchen summary" });
    const orderCard = within(summary).getByText("Today’s orders").closest("a")!;
    const earningsCard = within(summary).getByText("This week").closest("a")!;
    await within(orderCard).findByText("—");
    await within(earningsCard).findByText("Unavailable");
    expect(screen.queryByText("No orders yet — you’re all set")).toBeNull();
  });
  it("finishes a stalled orders read without hiding healthy kitchen summaries", async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation(milliseconds => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), milliseconds);
      return controller.signal;
    });
    fetcher.mockImplementation((input, init) => String(input) === "/api/chef/orders" ? new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }) : normal(input));
    await act(async () => { render(createElement(ChefModeDashboard)); });
    const orderCard = screen.getByText("Today’s orders").closest("a")!;
    expect(within(orderCard).getByText("Loading…")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(within(orderCard).getByText("—")).toBeTruthy();
    expect(screen.getByText("Fixture kitchen")).toBeTruthy();
    expect(screen.queryByText("Chef Mode couldn’t load")).toBeNull();
  });
});

describe("application status before optional prefill", () => {
  it("shows retry after an application timeout and loads a fresh application on retry", async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation(milliseconds => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), milliseconds);
      return controller.signal;
    });
    let healthy = false;
    fetcher.mockImplementation((input, init) => String(input) !== "/api/chef/application" ? normal(input) : healthy
      ? Promise.resolve(Response.json({ status: "NOT_SUBMITTED", documents: [] }))
      : new Promise<Response>((_, reject) => { init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true }); }));
    render(createElement(ChefApplicationWorkspace));
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.getByText("Loading took too long. Please try again.")).toBeTruthy();
    healthy = true;
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Try again" })); });
    expect(screen.getByRole("button", { name: /Become a Chef/ })).toBeTruthy();
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/chef/application")).toHaveLength(2);
  });
  it.each(["APPROVED", "PENDING"])("shows saved %s state without reading customer prefills", async status => {
    fetcher.mockImplementation(input => String(input) === "/api/chef/application" ? Promise.resolve(Response.json({ status, documents: [] })) : normal(input));
    render(createElement(ChefApplicationWorkspace));
    await screen.findByText(status === "APPROVED" ? "You’re approved" : "Verify your identity");
    expect(fetcher.mock.calls.some(([url]) => String(url).startsWith("/api/customer/"))).toBe(false);
  });
  it("lets a new applicant type and clear a field before late profile prefill arrives", async () => {
    const display = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/chef/application" ? Promise.resolve(Response.json({ status: "NOT_SUBMITTED", documents: [] })) : String(input) === "/api/customer/profile" ? display.promise : new Promise<Response>(() => undefined));
    render(createElement(ChefApplicationWorkspace));
    fireEvent.click(await screen.findByRole("button", { name: /Become a Chef/ }));
    const first = screen.getByLabelText("First name") as HTMLInputElement;
    fireEvent.change(first, { target: { value: "Typed" } });
    fireEvent.change(first, { target: { value: "" } });
    await act(async () => { display.resolve(Response.json(profile)); });
    expect(first.value).toBe("");
    await waitFor(() => expect((screen.getByLabelText("Last name") as HTMLInputElement).value).toBe("Name"));
  });
  it("ignores optional prefill after its owner changes", async () => {
    const display = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/chef/application" ? Promise.resolve(Response.json({ status: "NOT_SUBMITTED", documents: [] })) : String(input) === "/api/customer/profile" ? display.promise : normal(input));
    render(createElement(ChefApplicationWorkspace));
    fireEvent.click(await screen.findByRole("button", { name: /Become a Chef/ }));
    await act(async () => { setSessionIdentity({ ...owner, id: "22222222-2222-4222-8222-222222222222" }); display.resolve(Response.json(profile)); });
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("");
  });
  it("does not attach a late saved-address pin to a manually typed kitchen address or submit it", async () => {
    const addresses = deferred<Response>();
    let saved: Record<string, unknown> | null = null;
    fetcher.mockImplementation((input, init) => {
      if (String(input) === "/api/customer/addresses") return addresses.promise;
      if (String(input) !== "/api/chef/application") return normal(input);
      if (init?.method === "POST") { saved = JSON.parse(init.body as string); return Promise.resolve(Response.json({ ...saved, status: "PENDING", documents: [] })); }
      return Promise.resolve(Response.json({ status: "NOT_SUBMITTED", documents: [] }));
    });
    render(createElement(ChefApplicationWorkspace));
    fireEvent.click(await screen.findByRole("button", { name: /Become a Chef/ }));
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Typed" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Chef" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Flat / House / Building"), { target: { value: "99 New Road" } });
    await act(async () => { addresses.resolve(Response.json([{ id: owner.id, addressLabel: "HOME", recipientName: "Saved Name", contactPhoneNumber: owner.phoneNumber, addressLine1: "1 Old Road", addressLine2: null, landmark: null, areaName: "Saved Area", districtName: "Saved District", city: "Saved Town", state: "Saved State", postalCode: "500001", latitude: 17.4, longitude: 78.5, active: true, isDefault: true, createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" }])); });
    expect(screen.queryByTestId("kitchen-map")).toBeNull();
    expect((screen.getByLabelText("Flat / House / Building") as HTMLInputElement).value).toBe("99 New Road");
    expect((screen.getByLabelText("City") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "New City" } });
    fireEvent.change(screen.getByLabelText("State"), { target: { value: "New State" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Save details and continue" }));
    await screen.findByRole("heading", { name: "Verify your identity" });
    expect(saved).toMatchObject({ addressLine1: "99 New Road", city: "New City", state: "New State", latitude: null, longitude: null });
  });
});
```

### apps/customer-web-next/src/lib/chef-workspace-integration.test.ts

```typescript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("chef workspace navigation exposes every implemented backend area", () => {
  const navigation = source("../components/chef-workspace-navigation.tsx");
  for (const route of [
    "/chef/application",
    "/chef/kitchen",
    "/chef/menu",
    "/chef/orders",
    "/chef/earnings",
    "/chef/operations",
  ]) {
    assert.match(navigation, new RegExp(route.replaceAll("/", "\\/")));
  }
});

test("dashboard loads only live chef service state", () => {
  const dashboard = source("../components/chef-mode-dashboard.tsx");
  for (const endpoint of [
    "/api/chef/application",
    "/api/chef/kitchen",
    "/api/chef/menu",
    "/api/chef/orders",
    "/api/chef/earnings",
  ]) {
    assert.match(dashboard, new RegExp(endpoint.replaceAll("/", "\\/")));
  }
  assert.match(dashboard, /Promise\.allSettled/);
  assert.doesNotMatch(dashboard, /estimatedRevenue|mock|demo|sample/i);
});

test("operations readiness uses supported backend controls only", () => {
  const operations = source("../components/chef-operations-workspace.tsx");
  assert.match(operations, /applicationApproved/);
  assert.match(operations, /kitchen\?\.status === "ACTIVE"/);
  assert.match(operations, /item\.status === "ACTIVE"/);
  assert.match(operations, /item\.available/);
  assert.match(operations, /parseChefApplicationReadiness/);
  assert.match(operations, /approvedDocumentCount/);
  assert.match(operations, /\/api\/chef\/application\/readiness/);
  assert.match(operations, /no\s+reviewed\s+weekly\s+opening-hours\s+contract/i);
  assert.doesNotMatch(operations, /FSSAI.*required|commissionRate|deliveryRadius\s*=/i);
});

test("chef earnings remain finance-owned and contract validated", () => {
  const ledger = source("../components/chef-earnings-ledger.tsx");
  const route = source("../app/api/chef/earnings/route.ts");
  assert.match(route, /parseChefEarnings\(raw\)/);
  assert.match(route, /authenticatedApiFetch\(request, "\/chef\/earnings\?limit=200"\)/);
  assert.match(ledger, /browser never calculates commission/i);
  assert.doesNotMatch(ledger, /commissionRate|platformCommission|initiatePayout/i);
});

test("chef order BFF accepts known deployed envelopes without weakening records", () => {
  const contract = source("./chef-order-contract.ts");
  const listRoute = source("../app/api/chef/orders/route.ts");
  const detailRoute = source("../app/api/chef/orders/[orderId]/route.ts");
  assert.match(contract, /parseChefOrdersResponse/);
  assert.match(contract, /\["orders", "content", "data"\]/);
  assert.match(contract, /parseChefOrderResponse/);
  assert.match(listRoute, /parseChefOrdersResponse\(raw\)/);
  assert.match(detailRoute, /parseChefOrderResponse\(raw\)/);
  assert.match(contract, /items\.some\(\(item\) => item === null\)/);
  assert.doesNotMatch(contract, /customerIdentityId|checkoutId|pickupAddress/);
});

test("chef order actions use unique idempotency keys and strict responses", () => {
  const actions = source("../components/chef-order-actions.tsx");
  const acceptRoute = source(
    "../app/api/chef/orders/[orderId]/accept/route.ts",
  );
  const rejectRoute = source(
    "../app/api/chef/orders/[orderId]/reject/route.ts",
  );
  assert.match(actions, /crypto\.randomUUID\(\)/);
  assert.match(actions, /parseChefOrderResponse\(result\)/);
  assert.match(acceptRoute, /"Idempotency-Key": actionId/);
  assert.match(rejectRoute, /"Idempotency-Key": actionId/);
});
```

### apps/customer-web-next/src/lib/customer-secondary-loading.vitest.ts

```typescript
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AddressesPage from "../screens/Profile/Addresses";
import { AddressEditorFlow } from "../components/profile/AddressEditorFlow";
import { RazorpayPayment } from "../components/checkout/RazorpayPayment";
import { CheckoutPaymentButton } from "../components/checkout/CheckoutPaymentButton";
import { setSessionIdentity } from "../services/auth/cravesAuth";
import { parseCheckout } from "./checkout-contract";
import type { CustomerAddress } from "./address-contract";
import type { CravesIdentity } from "./auth-contract";

const fixture = vi.hoisted(() => ({ loadEditor: vi.fn(), request: vi.fn(), navigate: vi.fn() }));
vi.mock("../components/profile/address-editor-loader", () => ({ loadAddressEditor: fixture.loadEditor }));
vi.mock("../services/auth/sessionFetch", () => ({ sessionFetch: fixture.request }));
vi.mock("../components/location/AddressMapPicker", () => ({ AddressMapPicker: () => null }));
vi.mock("../services/api/cravesCart", () => ({ ensureCheckoutCart: vi.fn(async () => true), clearCartAfterCheckoutPayment: vi.fn(), clearCartForCheckout: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: fixture.navigate, push: fixture.navigate }) }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => fixture.navigate, Link: ({ children }: { children: unknown }) => children }));

const owner: CravesIdentity = { id: "11111111-1111-4111-8111-111111111111", phoneNumber: "+919876543210", displayName: "Verified customer", email: "customer@example.invalid", emailVerified: true, status: "ACTIVE", roles: ["CUSTOMER"] };
const address: CustomerAddress = { id: "22222222-2222-4222-8222-222222222222", addressLabel: "HOME", recipientName: "Fixture customer", contactPhoneNumber: owner.phoneNumber, addressLine1: "Original house", addressLine2: null, landmark: "Fixture landmark", areaName: "Fixture area", districtName: "Fixture district", city: "Hyderabad", state: "Telangana", postalCode: "500072", latitude: 17.4, longitude: 78.4, isDefault: true, active: true, createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z" };
const checkoutId = "33333333-3333-4333-8333-333333333333";
function checkout(status = "PAYMENT_PENDING") {
  return { id: checkoutId, status, currency: "INR", foodSubtotal: 234, platformFee: 0, taxAmount: 0, deliveryFee: 0, grandTotal: 234, chargePolicyId: "44444444-4444-4444-8444-444444444444", deliveryAddressId: address.id, orders: [], createdAt: address.createdAt };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  setSessionIdentity(owner);
  fixture.loadEditor.mockReset().mockResolvedValue(AddressEditorFlow);
  fixture.request.mockReset().mockImplementation(async (input: string) => {
    if (input === "/api/customer/profile") return new Promise<Response>(() => {});
    if (input === `/api/customer/addresses/${address.id}`) return Response.json(address);
    if (input === "/api/payments/orders") return Response.json({ paymentOrderId: "66666666-6666-4666-8666-666666666666", checkoutId, provider: "RAZORPAY", providerOrderId: "order_fixture", checkoutKeyId: "rzp_fixture", amount: 234, amountPaise: 23400, currency: "INR", status: "PAYMENT_PENDING", createdAt: address.createdAt });
    throw new Error(`Unexpected authenticated fixture request ${input}`);
  });
  fixture.navigate.mockReset();
  fetcher = vi.fn<typeof fetch>(async input => {
    const url = String(input);
    if (url === "/api/auth/me") return Response.json(owner);
    if (url === "/api/customer/profile") return new Promise<Response>(() => {});
    if (url === "/api/customer/addresses") return Response.json([address]);
    if (url === `/api/checkout/${checkoutId}`) return Response.json(checkout("PAID"));
    throw new Error(`Unexpected fixture request ${url}`);
  });
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("matchMedia", vi.fn((media: string) => ({ media, matches: true, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("deferred address form", () => {
  it("keeps a closed form unloaded, supports closing a pending download and resets the real editor when reopened", async () => {
    const pending = deferred<typeof AddressEditorFlow>();
    fixture.loadEditor.mockReturnValueOnce(pending.promise);
    render(createElement(AddressesPage));
    await screen.findByRole("button", { name: "Edit" });
    expect(fixture.loadEditor).not.toHaveBeenCalled();
    const trigger = screen.getByRole("button", { name: "Edit" });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByText("Preparing your address form…");
    fireEvent.click(screen.getByRole("button", { name: "Close address form" }));
    expect(document.activeElement).toBe(trigger);
    await act(async () => { pending.resolve(AddressEditorFlow); });
    expect(screen.queryByLabelText("Flat / house / floor")).toBeNull();
    fireEvent.click(trigger);
    const field = await screen.findByLabelText("Flat / house / floor");
    fireEvent.change(field, { target: { value: "Unsaved draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Close address flow" }));
    fireEvent.click(trigger);
    expect((await screen.findByLabelText("Flat / house / floor") as HTMLInputElement).value).toBe("Original house");
  });

  it("shows a failed chunk with retry, then saves through the existing form and endpoint", async () => {
    fixture.loadEditor.mockRejectedValueOnce(new Error("Chunk unavailable"));
    render(createElement(AddressesPage));
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await screen.findByText("We couldn’t open the address form. Please try again.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByLabelText("Flat / house / floor");
    fireEvent.click(screen.getByRole("button", { name: "Save and use this address" }));
    await waitFor(() => expect(fixture.request).toHaveBeenCalledWith(`/api/customer/addresses/${address.id}`, expect.objectContaining({ method: "PUT" })));
    await screen.findByText("Address saved and set as your default delivery address.");
  });

  it("closes a pending private form on session replacement and ignores the late chunk", async () => {
    const pending = deferred<typeof AddressEditorFlow>();
    fixture.loadEditor.mockReturnValueOnce(pending.promise);
    render(createElement(AddressesPage));
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await screen.findByText("Preparing your address form…");
    act(() => { setSessionIdentity({ ...owner, id: "55555555-5555-4555-8555-555555555555" }); });
    expect(screen.queryByRole("button", { name: "Close address form" })).toBeNull();
    await act(async () => { pending.resolve(AddressEditorFlow); });
    expect(screen.queryByLabelText("Flat / house / floor")).toBeNull();
  });
});

describe("payment optional display profile", () => {
  it("renders an authoritative checkout while profile hydration remains pending", async () => {
    render(createElement(RazorpayPayment, { checkoutId }));
    await screen.findByText("This checkout is already paid.");
    expect(fetcher.mock.calls.some(([input]) => String(input) === `/api/checkout/${checkoutId}`)).toBe(true);
    expect(fixture.request).toHaveBeenCalledWith("/api/customer/profile", expect.anything());
  });

  it("opens backend-created payment with verified identity prefill before optional profile completes", async () => {
    let options: { prefill: { name: string; email: string; contact: string }; modal: { ondismiss(): void } } | undefined;
    vi.stubGlobal("Razorpay", class {
      constructor(value: typeof options) { options = value; }
      open() { options!.modal.ondismiss(); }
      on() {}
    });
    const parsed = parseCheckout(checkout())!;
    expect(parsed).not.toBeNull();
    render(createElement(CheckoutPaymentButton, { checkout: parsed, previewAmount: 234, currency: "INR", failure: null, ensureCheckout: vi.fn(async () => parsed), onFailure: vi.fn() }));
    fireEvent.click(screen.getByRole("button", { name: "Pay ₹234" }));
    await waitFor(() => expect(options).toBeDefined());
    expect(options!.prefill).toEqual({ name: owner.displayName, email: owner.email, contact: owner.phoneNumber });
    expect(fixture.request).toHaveBeenCalledWith("/api/payments/orders", expect.objectContaining({ method: "POST", body: JSON.stringify({ checkoutId }) }));
    expect(fetcher.mock.calls.some(([input]) => String(input) === "/api/auth/me")).toBe(true);
  });
});
```

### apps/customer-web-next/src/lib/mobile-customer-experience.test.ts

```typescript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("mobile customer nav morphs the Cart tab right-to-left while browsing down", () => {
  const nav = source("../components/layout/BottomNavContent.tsx");

  assert.match(nav, /FaHome/);
  assert.match(nav, /CalendarDays/);
  assert.match(nav, /ChefHat/);
  assert.match(nav, /FaUser/);
  assert.match(nav, /CravesCartIcon/);
  assert.match(nav, /label: "Meal Subscription"/);
  assert.match(nav, /href: "\/chefs"/);
  assert.doesNotMatch(nav, /home#nearby-kitchens-heading/);
  assert.match(nav, /cartExpanded/);
  assert.match(nav, /direction === "down" && travel >= 18/);
  assert.match(nav, /direction === "up" && travel >= 18/);
  assert.match(nav, /left: "79%"/);
  assert.match(nav, /left: "0\.4rem"/);
  assert.match(nav, /AnimatePresence/);
  assert.doesNotMatch(nav, /hiddenByScroll/);
  assert.doesNotMatch(nav, /#2563EB|ShoppingCart|UserRound/);
});

test("cart checkout stays above mobile chrome and customer nav is absent on cart", () => {
  const nav = source("../components/layout/BottomNav.tsx");
  const checkout = source("../components/cart/CartCheckoutBar.tsx");

  assert.match(nav, /const HIDDEN_PATH_PREFIXES = \[[\s\S]*"\/cart"/);
  assert.match(checkout, /bottom-0 z-50/);
});

test("mobile discovery keeps search, veg and cravings accessible while scrolling", () => {
  const header = source("../components/home/BrowseHeader.tsx");
  const autoHide = source("../components/navigation/AutoHideCustomerHeader.tsx");
  const cravings = source("../components/home/HomeCategoryRail.tsx");

  assert.match(header, /<AutoHideCustomerHeader mobileStatic/);
  assert.match(autoHide, /static md:sticky md:top-0/);
  assert.match(header, /mobileCompact/);
  assert.match(header, /fixed inset-x-0 top-0 z-50/);
  assert.match(cravings, /translate-y-\[var\(--craves-mobile-search-offset,0px\)\]/);
  assert.match(cravings, /md:top-\[var\(--craves-desktop-header-offset-md,4\.25rem\)\]/);
  assert.match(cravings, /lg:top-\[var\(--craves-desktop-header-offset-lg,4\.65rem\)\]/);
  assert.match(header, /--craves-mobile-search-offset/);
  assert.match(header, /mobileDirectionAnchorRef/);
  assert.match(header, /direction === "up" && travel >= 20/);
  assert.match(header, /direction === "down" && travel >= 16/);
  assert.match(header, /mobileCompact \? "3\.75rem" : "0px"/);
  assert.match(header, /duration-\[260ms\]/);
  assert.match(cravings, /duration-\[260ms\]/);
  assert.match(autoHide, /--craves-desktop-header-offset-md/);
  assert.match(autoHide, /duration-\[260ms\]/);
  assert.match(cravings, /md:duration-\[260ms\]/);
  assert.match(cravings, /lg:top-\[var\(--craves-desktop-header-offset-lg,4\.65rem\)\]/);
  assert.doesNotMatch(cravings, /md:static/);
});

test("mobile browse keeps dish proportions and cart glass with larger craving images", () => {
  const card = source("../components/home/DishCard.tsx");
  const grid = source("../components/home/DishesGrid.tsx");
  const cravings = source("../components/home/HomeCategoryRail.tsx");
  const nav = source("../components/layout/BottomNavContent.tsx");
  const homeStyles = source("../screens/public/BrowseFoods/HomeReference.module.css");

  assert.match(card, /aspect-\[16\/9\] sm:aspect-\[16\/10\]/);
  assert.doesNotMatch(card, /aspect-\[4\/3\]/);
  assert.match(grid, /aspect-\[16\/9\] sm:aspect-\[16\/10\]/);
  assert.doesNotMatch(grid, /aspect-\[4\/3\]/);
  assert.match(cravings, /h-\[5\.75rem\] w-\[5\.75rem\]/);
  assert.match(nav, /bg-white\/50/);
  assert.match(nav, /backdrop-blur-\[8px\]/);
  assert.match(nav, /backdrop-saturate-\[145%\]/);
  assert.match(homeStyles, /backdrop-filter: blur\(8px\) saturate\(145%\)/);
  assert.match(homeStyles, /\.floatingCartGlass::before/);
  assert.match(homeStyles, /\.floatingCartGlass::after/);
  assert.doesNotMatch(homeStyles, /blur\(48px\)/);
});

test("profile treats meal subscription as its own destination", () => {
  const profile = source("../screens/Profile/Profile.tsx");

  assert.match(profile, /id="profile-meal-subscription"/);
  assert.match(profile, /title="Meal Subscription"/);
  assert.match(profile, /Payments, referrals & chef tools/);
  assert.doesNotMatch(profile, /title="Membership"/);
});

test("customer discovery and detail recovery are fail-closed at 50 km", () => {
  const policy = source("./catalog-discovery-policy.ts");
  const home = source("../screens/public/BrowseFoods/BrowseFoods.tsx");
  const dish = source("../screens/public/FoodDetails/FoodDetails.tsx");
  const kitchen = source("../screens/public/ChefProfile/ChefProfile.tsx");

  assert.match(policy, /MAX_DISCOVERY_RADIUS_METERS = 50_000/);
  assert.doesNotMatch(policy, /10_000|15_000/);
  assert.match(home, /DEFAULT_DISCOVERY_RADIUS_METERS/);
  assert.match(home, /dishes: allDishes\(\)/);
  assert.match(home, /kitchens: allKitchens\(\)/);
  assert.match(home, /const hasInitialCatalog =/);
  assert.match(home, /const shouldPreserveCatalog =/);
  assert.match(home, /refreshDiscovery\(defaultAddress, false, shouldPreserveCatalog\)/);
  assert.match(dish, /outside the 50 km Craves browsing area/);
  assert.match(kitchen, /outside the 50 km Craves browsing area/);
});

test("review totals are optional and never block dish or kitchen rendering", () => {
  const reviews = source("../services/api/reviews.ts");
  const reviewRoute = source(
    "../app/api/reviews/kitchens/[kitchenId]/summary/route.ts",
  );
  const dish = source("../screens/public/FoodDetails/FoodDetails.tsx");
  const kitchen = source("../screens/public/ChefProfile/ChefProfile.tsx");

  assert.match(reviews, /response\.status === 204/);
  assert.match(reviewRoute, /status: 204/);
  assert.match(dish, /\.catch\(\(\) =>/);
  assert.match(kitchen, /\.catch\(\(\) =>/);
});
```

### apps/customer-web-next/src/lib/precise-customer-chef-ui.test.ts

```typescript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const theme = source("../craves-theme.css");
const footer = source("../components/sections/FooterSection.tsx");
const referenceHero = source(
  "../components/sections/landing-reference/ReferenceHeroDesktop.tsx",
);
const referenceArtwork = source(
  "../components/sections/landing-reference/ReferenceArtworkSection.tsx",
);
const referenceCrop = source(
  "../components/sections/landing-reference/ReferenceImageCrop.tsx",
);
const landing = source("../screens/public/LandingPage/LandingPage.tsx");
const home = source("../screens/public/BrowseFoods/BrowseFoods.tsx");
const welcome = source("../components/home/WelcomeBanner.tsx");
const floatingCart = source("../components/home/FloatingCartBar.module.css");
const cartAddressDialog = source("../components/home/CartAddressAvailabilityDialog.tsx");
const addresses = source("../screens/Profile/Addresses.tsx");
const checkout = source("../screens/Checkout/Checkout.tsx");
const orders = source("../screens/OrderHistory/OrderHistory.tsx");
const cart = source("../screens/Cart/Cart.tsx");
const notifications = source("../screens/Notifications/Notifications.tsx");
const addressEditor = source("../components/profile/AddressEditorFlow.tsx");
const chefActions = source("../components/chef-order-actions.tsx");
const mealPlans = source("../components/subscription-plan-browser.tsx");
const mealPlanPage = source("../app/subscriptions/plans/page.tsx");

test("shared customer and chef palette removes espresso brown", () => {
  assert.doesNotMatch(theme, /#261a15/i);
  assert.doesNotMatch(theme, /rgba\(38,\s*26,\s*21/i);
  assert.match(theme, /--color-contrast-red:\s*#c92716/i);
  assert.match(theme, /--color-flame-red:\s*#f62e18/i);
  assert.match(theme, /--color-white:\s*#ffffff/i);
  assert.match(theme, /--color-black:\s*#000000/i);
});

test("buttons use neutral tactile hover while primary actions keep the Craves accent", () => {
  assert.match(theme, /button, \[role="tab"\]/);
  assert.match(theme, /border:\s*1px solid var\(--color-grey-200\)/);
  assert.match(theme, /background:\s*var\(--color-white\)/);
  assert.match(theme, /border-color:\s*#d7dadf/);
  assert.match(theme, /box-shadow:\s*0 4px 12px rgba\(0, 0, 0, 0\.08\)/);
  assert.match(theme, /\.btn-primary \{/);
  assert.match(theme, /background:\s*var\(--color-contrast-red\)/);
  assert.match(theme, /\.btn-primary:not\(:disabled\):hover/);
});

test("landing hero uses semantic HTML, canonical logo, approved rider artwork and wired controls", () => {
  assert.match(referenceHero, /import \{ CravesLogo \}/);
  assert.match(referenceHero, /<CravesLogo size="lg" priority \/>/);
  assert.match(referenceHero, /The Taste of Home,/);
  assert.match(referenceHero, /Now Closer\./);
  assert.match(referenceHero, /Order Homemade Food/);
  assert.match(referenceHero, /Watch How It Works/);
  assert.match(referenceHero, /onOpenAuth\("login"\)/);
  assert.match(referenceHero, /onOpenLocation/);
  assert.match(referenceHero, /onBecomeChef/);
  assert.match(referenceHero, /src="\/landing\/reference\/hero-reference\.png"/);
  assert.match(referenceHero, /<ReferenceImageCrop/);
  assert.doesNotMatch(referenceHero, /referenceHotspot/);
});

test("landing precision fixes remove baked rider text, align steps and normalize chef navigation hover", () => {
  assert.match(referenceHero, /href="#become-a-chef"/);
  assert.doesNotMatch(referenceHero, /className=\{styles\.referenceNavButton\}/);
  assert.match(referenceHero, /top-\[84\.4%\]/);
  assert.match(referenceHero, /h-\[5\.2%\]/);
  assert.match(referenceHero, /w-\[7\.4%\]/);
  assert.match(referenceHero, /!min-h-0/);

  assert.match(
    referenceArtwork,
    /lg:h-\[clamp\(14rem,22vw,21rem\)\]/,
  );
  assert.match(referenceArtwork, /items-end justify-center/);
  assert.match(referenceArtwork, /referenceHowArtwork\} !m-0/);
});

test("public landing keeps the approved semantic reference experience and wired flows", () => {
  assert.match(landing, /min-h-screen bg-white text-ink/);
  assert.match(landing, /loadSession\(\{ hydrateCustomerProfile: "background" \}\)/);
  assert.doesNotMatch(landing, /if \(checkingSession\)/);
  assert.match(landing, /<ReferenceHeroDesktop/);
  assert.match(landing, /<ReferenceArtworkSection variant="how"/);
  assert.match(landing, /<ReferenceArtworkSection variant="why"/);
  assert.match(landing, /variant="chefs-app"/);
  assert.match(landing, /<AuthModal/);
  assert.match(landing, /<LocationModal/);
  assert.doesNotMatch(landing, /<CommunityImpactSection/);
  assert.doesNotMatch(landing, /<AppDownloadSection/);

  assert.match(referenceArtwork, /From their kitchen to/);
  assert.match(referenceArtwork, /your table\./);
  assert.match(referenceArtwork, /Food the way it/);
  assert.match(referenceArtwork, /should be\./);
  assert.match(referenceArtwork, /Every order supports/);
  assert.match(referenceArtwork, /real people/);
  assert.match(referenceArtwork, /Real kitchens\./);
  assert.match(referenceArtwork, /Real people\./);
  assert.match(referenceArtwork, /Real passion\./);
  assert.match(referenceArtwork, /Homemade food,/);
  assert.match(referenceArtwork, /in your pocket\./);
  assert.match(referenceArtwork, /Become a Home Chef/);
  assert.match(referenceArtwork, /id="craves-app"/);

  assert.match(referenceCrop, /unoptimized/);
  assert.match(referenceCrop, /approved reference PNG/);
  assert.match(referenceCrop, /style=\{imageStyle\}/);

  assert.match(footer, /<CravesLogo size="lg" \/>/);
  assert.match(footer, /bg-\[#111111\] text-white/);
  assert.doesNotMatch(landing, /min-h-screen bg-cream text-ink/);
});

test("welcome banner uses the approved responsive full-art asset while discovery uses the saved default address", () => {
  assert.match(welcome, /src="\/home\/cravings\/craves-home-banner\.webp"/);
  assert.match(welcome, /width=\{1983\}/);
  assert.match(welcome, /height=\{793\}/);
  assert.match(welcome, /unoptimized/);
  assert.match(welcome, /className="block h-auto w-full"/);
  assert.match(welcome, /aria-label=\{\`Hello \$\{greetingName\} home food banner`\}/);
  assert.match(welcome, /Hello \{greetingName\}/);
  assert.match(welcome, /left-\[4\.95%\]/);
  assert.match(welcome, /data-live-dish-count=\{dishCount\}/);
  assert.doesNotMatch(welcome, /styles\.heroArtwork/);
  assert.doesNotMatch(welcome, /import \{ Heart \} from "lucide-react"/);
  assert.doesNotMatch(welcome, /backdrop-blur-sm/);
  assert.match(welcome, /Eat for Health\./);
  assert.match(welcome, /Taste the[\s\S]*Comfort of[\s\S]*Home\./);
  assert.match(welcome, /dishCount/);
  assert.doesNotMatch(welcome, /<button/);
  assert.doesNotMatch(welcome, /Default address/);
  assert.doesNotMatch(welcome, /Choose default address/);
  assert.doesNotMatch(welcome, /Use current delivery location/);
  assert.doesNotMatch(welcome, /Current Location/);

  assert.match(home, /loadSelectedAddress/);
  assert.match(home, /default delivery address/);
  assert.doesNotMatch(home, /navigator\.geolocation/);
  assert.doesNotMatch(home, /resolveLiveBrowsingLocation/);
});

test("address manager owns default selection and the shared location-first editor", () => {
  assert.match(addresses, /Add New Address/);
  assert.match(addresses, /Choose your default delivery address here/);
  assert.match(addresses, /Set as default/);
  assert.match(addresses, /Default address/);
  assert.match(addresses, /async function selectDefault/);
  assert.match(addresses, /invalidateHomeDeliveryContext/);
  assert.match(addresses, /invalidateSelectedAddress/);
  assert.match(addresses, /clearDishDiscoveryCache/);
  assert.match(addresses, /clearKitchenDiscoveryCache/);
  assert.match(addresses, /editorOpen \? <LazyAddressEditorFlow/);
  assert.match(addresses, /initialLoadState/);
  assert.match(addresses, /aria-label="Loading saved addresses"/);
  assert.match(
    addresses,
    /initialLoadState === "ready" && addresses\.length === 0/,
  );
  assert.match(addresses, /initialLoadState === "error"/);

  assert.match(addressEditor, /<Dialog\.Root/);
  assert.match(addressEditor, /<AddressMapPicker/);
  assert.doesNotMatch(addressEditor, /Search for area, street name/);
  assert.doesNotMatch(addressEditor, /Saved Addresses/);
  assert.match(addressEditor, /Use current location/);
  assert.match(addressEditor, /Add address details/);
  assert.match(addressEditor, /Name this address/);
  assert.match(addressEditor, /Please complete the highlighted fields/);
  assert.match(addressEditor, /Flat \/ house \/ floor/);
  assert.match(addressEditor, /Receiver&apos;s phone/);
  assert.match(addressEditor, /Save and use this address/);
  assert.doesNotMatch(addressEditor, /Skip/);
  assert.doesNotMatch(addressEditor, /Add later/);
});

test("home rechecks cart availability after default-address changes", () => {
  assert.match(home, /CartAddressAvailabilityDialog/);
  assert.match(home, /loadKitchenMenu/);
  assert.match(home, /unavailableCartItems/);
  assert.match(home, /removeFromCart/);
  assert.match(home, /clearCart/);
  assert.match(cartAddressDialog, /Choose another address/);
  assert.match(cartAddressDialog, /Remove unavailable items/);
  assert.match(cartAddressDialog, /Clear cart & browse here/);
});

test("home cart bar uses a balanced true frosted-glass blur", () => {
  assert.match(floatingCart, /background:\s*rgba\(255, 255, 255, 0\.4\)/);
  assert.match(floatingCart, /backdrop-filter:\s*blur\(8px\) saturate\(145%\)/);
  assert.match(floatingCart, /\.floatingCartGlass::before/);
  assert.match(floatingCart, /\.floatingCartGlass::after/);
  assert.match(floatingCart, /@supports not/);
});

test("meal plans keep their previous card layout and navigation flow", () => {
  assert.match(mealPlans, /meal-plans-legacy-ui/);
  assert.match(mealPlans, /rounded-\[28px\] bg-\[#FFF8EC\]/);
  assert.match(mealPlans, /subscriptions\/new\?planId=/);
  assert.match(mealPlans, /craves-button-link/);
  assert.match(mealPlanPage, /bg-\[#0B1426\]/);
});

test("checkout is one page with saved addresses, ASAP delivery and the shared address sheet", () => {
  assert.match(checkout, /Delivery address/);
  assert.match(checkout, /visibleAddresses\.map/);
  assert.match(checkout, /addresses\.slice\(0, 3\)/);
  assert.match(checkout, /Show all/);
  assert.match(checkout, /Earliest delivery/);
  assert.match(checkout, /As soon as possible/);
  assert.match(checkout, /Bill details/);
  assert.match(checkout, /<CheckoutPaymentButton/);
  assert.match(checkout, /editorOpen \? <LazyAddressEditorFlow/);
  assert.match(checkout, /\/api\/checkout\/operations\//);
  assert.match(checkout, /checkoutCartSnapshot\(validatedCart\)/);
  assert.match(checkout, /parseCheckoutOperationResponse/);
  assert.match(checkout, /CHECKOUT_OPERATION_ID_KEY/);
  assert.match(checkout, /createAuthoritativeCheckout/);
  assert.match(checkout, /deliveryAddressId,/);
  assert.match(checkout, /window\.sessionStorage\.setItem\(CHECKOUT_ID_KEY, prepared\.id\)/);
  assert.match(checkout, /ensureCheckoutCart\(checkout\.orders\)/);
  assert.match(checkout, /handleBackToCart/);
  assert.match(checkout, /autoReviewKeyRef/);
  assert.match(checkout, /Calculating delivery fee, tax and your final total/);
  assert.match(checkout, /Your final total is calculated automatically for the selected address/);
  assert.doesNotMatch(checkout, /CheckoutAddressDialog/);
  assert.doesNotMatch(checkout, /Pick a time/);
  assert.doesNotMatch(checkout, /schedule\/capability/);

  assert.match(addressEditor, /sessionFetch\(\s*targetAddressId/);
  assert.match(addressEditor, /method:\s*targetAddressId \? "PUT" : "POST"/);
  assert.match(addressEditor, /Save and use this address/);
});

test("customer orders page uses a white page surface", () => {
  assert.match(orders, /min-h-screen bg-white pb-20 text-ink/);
  assert.doesNotMatch(orders, /min-h-screen bg-cream pb-20 text-ink/);
});

test("customer cart and notifications use white page surfaces", () => {
  assert.match(cart, /min-h-screen bg-white pb-36 text-\[#1A1A1A\]/);
  assert.match(cart, /Cooking instructions/);
  assert.match(cart, /Add more from this kitchen/);
  assert.match(cart, /Undo/);
  assert.match(cart, /navigate\(\{ to: "\/checkout" \}\)/);
  assert.doesNotMatch(cart, /min-h-screen bg-cream/);
  assert.match(notifications, /min-h-screen bg-white pb-12/);
  assert.match(notifications, /border-b border-border bg-white\/95/);
  assert.doesNotMatch(notifications, /min-h-screen bg-cream pb-12/);
  assert.doesNotMatch(notifications, /border-b border-border bg-cream\/95/);
});

test("chef accept and reject fields use one neutral border with no focus outline or ring", () => {
  assert.match(chefActions, /data-craves-single-border="true"/);
  assert.match(chefActions, /border border-border/);
  assert.match(chefActions, /focus:outline-none focus:ring-0/);
  assert.match(theme, /outline:\s*none\s*!important/);
  assert.match(
    theme,
    /border:\s*1px solid var\(--color-grey-200\)\s*!important/,
  );
  assert.doesNotMatch(
    theme,
    /border:\s*1px solid var\(--color-flame-red\)\s*!important/,
  );
});
```

### apps/customer-web-next/src/lib/session-performance.vitest.ts

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CravesIdentity } from "./auth-contract";
import type { CustomerProfile } from "./profile-contract";

const identity: CravesIdentity = {
  id: "11111111-1111-4111-8111-111111111111",
  phoneNumber: "+10000000000",
  displayName: "Auth name",
  email: "auth@example.invalid",
  emailVerified: false,
  status: "ACTIVE",
  roles: ["CUSTOMER"],
};
const profile: CustomerProfile = {
  id: "33333333-3333-4333-8333-333333333333",
  registeredPhoneNumber: identity.phoneNumber,
  firstName: "Customer",
  lastName: "Name",
  email: "stale-projection@example.invalid",
  createdAt: "2026-09-14T10:00:00Z",
  updatedAt: "2026-09-14T10:00:00Z",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

let auth: typeof import("../services/auth/cravesAuth");
beforeEach(async () => {
  vi.resetModules();
  auth = await import("../services/auth/cravesAuth");
  auth.setSessionIdentity(identity);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("session navigation request sharing", () => {
  it("shares identity and profile requests while background callers can render before awaited hydration", async () => {
    const lookup = deferred<Response>();
    const hydration = deferred<Response>();
    const fetcher = vi.fn((url: string) => url === "/api/auth/me" ? lookup.promise : hydration.promise);
    vi.stubGlobal("fetch", fetcher);

    const background = auth.loadSession({ hydrateCustomerProfile: "background" });
    const awaited = auth.loadSession();
    const another = auth.loadSession();
    lookup.resolve(Response.json(identity));
    expect((await background)?.id).toBe(identity.id);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/auth/me", "/api/customer/profile"]);
    let finished = false;
    void awaited.then(() => { finished = true; });
    await Promise.resolve();
    expect(finished).toBe(false);

    hydration.resolve(Response.json(profile));
    const results = await Promise.all([awaited, another]);
    expect(results.every(user => user?.username === "Customer Name")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps fresh profile display fields but checks Auth roles on every subsequent navigation", async () => {
    let now = 100_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const originalCreatedAt = auth.getSession()!.createdAt;
    auth.setSessionProfile(profile);
    auth.setSessionEmailVerification(identity.id, {
      email: "verified@example.invalid", emailVerified: true, emailRevision: 8,
      pending: null, serverTime: profile.createdAt,
    });
    const fetcher = vi.fn(async (url: string) => {
      if (url !== "/api/auth/me") throw new Error("Unexpected profile request");
      return Response.json({ ...identity, roles: ["CUSTOMER", "CHEF"] });
    });
    vi.stubGlobal("fetch", fetcher);

    now += 29_999;
    const current = await auth.loadSession();
    expect(current).toMatchObject({
      username: "Customer Name", firstName: "Customer", lastName: "Name", profileComplete: true,
      createdAt: originalCreatedAt, roles: ["CUSTOMER", "CHEF"],
      email: "verified@example.invalid", emailVerified: true,
    });
    await auth.loadSession();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/auth/me", "/api/auth/me"]);
    expect(fetcher).toHaveBeenCalledWith("/api/auth/me", expect.objectContaining({ cache: "no-store" }));
  });

  it("expires profile freshness after thirty seconds and retains names while refreshing", async () => {
    let now = 100_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    auth.setSessionProfile(profile);
    const hydration = deferred<Response>();
    const started = deferred<void>();
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url === "/api/auth/me") return Promise.resolve(Response.json(identity));
      started.resolve();
      return hydration.promise;
    }));
    now += 30_000;
    const loading = auth.loadSession();
    await started.promise;
    expect(auth.getSession()?.username).toBe("Customer Name");
    hydration.resolve(Response.json({ ...profile, firstName: "Updated" }));
    expect((await loading)?.username).toBe("Updated Name");
  });

  it("lets screens with their own profile request skip automatic hydration after a fresh Auth check", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url !== "/api/auth/me") throw new Error("Unexpected hydration");
      return Response.json(identity);
    });
    vi.stubGlobal("fetch", fetcher);
    expect((await auth.loadSession({ hydrateCustomerProfile: "skip" }))?.id).toBe(identity.id);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/auth/me"]);
  });

  it("releases failed shared identity requests so the next attempt makes a fresh request", async () => {
    const lookup = deferred<Response>();
    const fetcher = vi.fn().mockReturnValueOnce(lookup.promise).mockResolvedValueOnce(Response.json({ ...identity, roles: ["CHEF"] }));
    vi.stubGlobal("fetch", fetcher);
    const first = auth.loadSession();
    const second = auth.loadSession();
    const failures = Promise.allSettled([first, second]);
    lookup.reject(new Error("Offline fixture"));
    expect((await failures).map(result => result.status)).toEqual(["rejected", "rejected"]);
    expect((await auth.loadSession())?.roles).toEqual(["CHEF"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  for (const failure of ["unavailable", "network", "invalid"] as const) {
    it(`does not cache ${failure} profile hydration failures`, async () => {
      let profileCalls = 0;
      vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        if (url === "/api/auth/me") return Response.json(identity);
        profileCalls += 1;
        if (profileCalls === 1) {
          if (failure === "network") throw new Error("Offline profile fixture");
          return failure === "invalid" ? Response.json({ firstName: "Incomplete" }) : Response.json({}, { status: 503 });
        }
        return Response.json(profile);
      }));
      expect((await auth.loadSession())?.profileComplete).toBe(false);
      expect((await auth.loadSession())?.username).toBe("Customer Name");
      expect(profileCalls).toBe(2);
    });
  }

  it("shares the expired-token refresh flow without caching the identity afterwards", async () => {
    let lookups = 0;
    const lookup = deferred<Response>();
    const fetcher = vi.fn(async (url: string) => {
      if (url === "/api/auth/refresh") return Response.json({ refreshed: true });
      if (url === "/api/customer/profile") return Response.json(profile);
      lookups += 1;
      return lookups === 1 ? lookup.promise : Response.json(identity);
    });
    vi.stubGlobal("fetch", fetcher);
    const first = auth.loadSession();
    const second = auth.loadSession();
    lookup.resolve(Response.json({ code: "SESSION_EXPIRED" }, { status: 401 }));
    await Promise.all([first, second]);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/api/auth/me", "/api/auth/refresh", "/api/auth/me", "/api/customer/profile",
    ]);
    await auth.loadSession();
    expect(lookups).toBe(3);
  });

  it("does not share fail-fast rejection with a caller that must attempt refresh", async () => {
    auth.invalidateSession(auth.captureSessionContext());
    const denied = deferred<Response>();
    let lookups = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (url === "/api/auth/refresh") return Response.json({ refreshed: true });
      lookups += 1;
      return lookups <= 2 ? denied.promise.then(response => response.clone()) : Response.json({ ...identity, roles: ["CHEF"] });
    });
    vi.stubGlobal("fetch", fetcher);
    const fast = auth.loadSession({ failFastUnauthenticated: true });
    const rejection = expect(fast).rejects.toBeInstanceOf(auth.AuthenticationRequiredError);
    const normal = auth.loadSession();
    denied.resolve(Response.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 }));
    await rejection;
    expect((await normal)?.id).toBe(identity.id);
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/auth/refresh")).toHaveLength(1);
  });

  it("honors fresh authorization rejection even when profile display data is fresh", async () => {
    auth.setSessionProfile(profile);
    vi.stubGlobal("fetch", async () => Response.json({}, { status: 403 }));
    expect(await auth.loadSession()).toBeNull();
    expect(auth.getSession()).toBeNull();
  });
});

describe("shared request session boundaries", () => {
  it("releases an aborted role refresh so retry can verify current roles", async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation(milliseconds => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), milliseconds);
      return controller.signal;
    });
    const fetcher = vi.fn<typeof fetch>().mockImplementationOnce((_, init) => new Promise<Response>((__, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    })).mockResolvedValueOnce(Response.json({ identity: { ...identity, roles: ["CHEF"] } }));
    vi.stubGlobal("fetch", fetcher);
    const stalled = auth.synchronizeSessionRoles({ hydrateCustomerProfile: "skip" });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await stalled).toBeNull();
    expect((await auth.synchronizeSessionRoles({ hydrateCustomerProfile: "skip" }))?.roles).toEqual(["CHEF"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("shares fresh role checks while background and skipped callers do not wait for another caller's profile", async () => {
    const renewal = deferred<Response>();
    const display = deferred<Response>();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(input => String(input) === "/api/auth/refresh" ? renewal.promise : display.promise);
    vi.stubGlobal("fetch", fetcher);
    const awaited = auth.synchronizeSessionRoles();
    let awaitedFinished = false;
    void awaited.then(() => { awaitedFinished = true; });
    const skipped = auth.synchronizeSessionRoles({ hydrateCustomerProfile: "skip" });
    const background = auth.synchronizeSessionRoles({ hydrateCustomerProfile: "background" });
    renewal.resolve(Response.json({ identity: { ...identity, roles: ["CUSTOMER", "CHEF"] } }));
    expect((await skipped)?.roles).toContain("CHEF");
    expect((await background)?.roles).toContain("CHEF");
    expect(awaitedFinished).toBe(false);
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/auth/refresh")).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/customer/profile")).toHaveLength(1);
    display.resolve(Response.json(profile));
    expect((await awaited)?.username).toBe("Customer Name");
  });

  it("checks roles again after a settled refresh and rejects an invalid refresh instead of accepting saved CHEF roles", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ identity: { ...identity, roles: ["CHEF"] } }))
      .mockResolvedValueOnce(Response.json({ identity: { ...identity, roles: ["CUSTOMER"] } }))
      .mockResolvedValueOnce(Response.json({}));
    vi.stubGlobal("fetch", fetcher);
    expect((await auth.synchronizeSessionRoles({ hydrateCustomerProfile: "skip" }))?.roles).toEqual(["CHEF"]);
    expect((await auth.synchronizeSessionRoles({ hydrateCustomerProfile: "skip" }))?.roles).toEqual(["CUSTOMER"]);
    expect(await auth.synchronizeSessionRoles({ hydrateCustomerProfile: "skip" })).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("ignores an old role response and keeps the replacement owner's independent refresh in flight", async () => {
    const old = deferred<Response>();
    const fresh = deferred<Response>();
    const fetcher = vi.fn<typeof fetch>().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    vi.stubGlobal("fetch", fetcher);
    const before = auth.synchronizeSessionRoles({ hydrateCustomerProfile: "skip" });
    const other = { ...identity, id: "22222222-2222-4222-8222-222222222222", roles: ["CUSTOMER"] };
    auth.setSessionIdentity(other);
    const after = auth.synchronizeSessionRoles({ hydrateCustomerProfile: "skip" });
    old.resolve(Response.json({ identity: { ...identity, roles: ["CHEF"] } }));
    await before;
    const shared = auth.synchronizeSessionRoles({ hydrateCustomerProfile: "skip" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    fresh.resolve(Response.json({ identity: other }));
    expect((await after)?.id).toBe(other.id);
    expect((await shared)?.roles).toEqual(["CUSTOMER"]);
    expect(auth.getSession()?.id).toBe(other.id);
  });
  it("does not refresh an earlier session after its delayed unauthorized body crosses a login", async () => {
    const failureBody = deferred<unknown>();
    const parsing = deferred<void>();
    const copied = new Response();
    vi.spyOn(copied, "json").mockImplementation(() => { parsing.resolve(); return failureBody.promise; });
    const denied = new Response(null, { status: 401 });
    vi.spyOn(denied, "clone").mockReturnValue(copied);
    const fetcher = vi.fn(async () => denied);
    vi.stubGlobal("fetch", fetcher);
    const loading = auth.loadSession();
    await parsing.promise;
    const next = { ...identity, id: "22222222-2222-4222-8222-222222222222", roles: ["CHEF"] };
    auth.setSessionIdentity(next);
    failureBody.resolve({ code: "SESSION_EXPIRED" });
    expect((await loading)?.id).toBe(next.id);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("old identity completion cannot erase the next generation's shared lookup", async () => {
    const oldLookup = deferred<Response>();
    const newLookup = deferred<Response>();
    const fetcher = vi.fn().mockReturnValueOnce(oldLookup.promise).mockReturnValueOnce(newLookup.promise);
    vi.stubGlobal("fetch", fetcher);
    const oldLoading = auth.loadSession();
    const next = { ...identity, id: "22222222-2222-4222-8222-222222222222", roles: ["CHEF"] };
    auth.setSessionIdentity(next);
    const first = auth.loadSession();
    const second = auth.loadSession();
    oldLookup.resolve(Response.json(identity));
    expect((await oldLoading)?.id).toBe(next.id);
    const third = auth.loadSession();
    expect(fetcher).toHaveBeenCalledTimes(2);
    newLookup.resolve(Response.json(next));
    expect((await Promise.all([first, second, third])).every(user => user?.id === next.id)).toBe(true);
    expect(auth.getSession()?.firstName).toBeNull();
  });

  it("does not overwrite a saved profile with an older in-flight profile response", async () => {
    const hydration = deferred<Response>();
    const started = deferred<void>();
    const fetcher = vi.fn((url: string) => {
      if (url === "/api/auth/me") return Promise.resolve(Response.json(identity));
      started.resolve();
      return hydration.promise;
    });
    vi.stubGlobal("fetch", fetcher);
    const loading = auth.loadSession();
    await started.promise;
    auth.setSessionProfile({ ...profile, firstName: "Saved" });
    hydration.resolve(Response.json(profile));
    expect((await loading)?.username).toBe("Saved Name");
    expect((await auth.loadSession())?.username).toBe("Saved Name");
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/customer/profile")).toHaveLength(1);
  });

  it("does not retain profile freshness across same-owner sign-in or confirmed logout", async () => {
    auth.setSessionProfile(profile);
    auth.setSessionIdentity(identity);
    let profileCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/auth/logout") return Response.json({ signedOut: true });
      if (url === "/api/auth/me") return Response.json(identity);
      profileCalls += 1;
      return Response.json(profile);
    }));
    expect((await auth.loadSession())?.username).toBe("Customer Name");
    await auth.clearSession();
    auth.setSessionIdentity(identity);
    expect((await auth.loadSession())?.username).toBe("Customer Name");
    expect(profileCalls).toBe(2);
  });
});
```

### apps/customer-web-next/src/lib/signed-in-integration.test.ts

```typescript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const proxiedMutationRoutes = [
  "../app/api/chef/application/route.ts",
  "../app/api/chef/application/proof-files/route.ts",
  "../app/api/chef/kitchen/route.ts",
  "../app/api/chef/menu/route.ts",
  "../app/api/chef/menu/[menuItemId]/route.ts",
  "../app/api/chef/menu/[menuItemId]/availability/route.ts",
  "../app/api/chef/menu/[menuItemId]/images/route.ts",
  "../app/api/chef/orders/[orderId]/accept/route.ts",
  "../app/api/chef/orders/[orderId]/reject/route.ts",
  "../app/api/chef/orders/[orderId]/ready-for-pickup/route.ts",
  "../app/api/notifications/[noticeId]/read/route.ts",
];

test("all proxied chef mutations use the shared origin guard", () => {
  for (const route of proxiedMutationRoutes) {
    const contents = source(route);
    assert.match(contents, /from "@\/lib\/request-security"/, route);
    assert.match(contents, /isSameOrigin\(request\)/, route);
    assert.doesNotMatch(contents, /function sameOrigin\(/, route);
  }
});

test("authentication asks for customer or chef mode", () => {
  const contents = source("../components/auth/AuthModal.tsx");
  assert.match(contents, /Home Chef/);
  assert.match(contents, /accountMode === "chef"/);
  assert.match(contents, /onAuthenticated\?\.\(user, accountMode\)/);
});

test("signed-in home loads live discovery and opens customer kitchen details without losing home context", () => {
  const contents = source("../screens/public/BrowseFoods/BrowseFoods.tsx");
  const search = source("../components/home/HomeSearchOverlay.tsx");
  const returnState = source("./home-return-state.ts");
  const signOut = source("../components/home/CustomerSignOutDialog.tsx");
  const kitchensService = source("../services/api/kitchens.ts");

  assert.match(contents, /loadSelectedAddress\(\)/);
  assert.match(contents, /loadCart\(\)/);
  assert.match(
    contents,
    /discoverKitchens\([\s\S]{0,180}DEFAULT_DISCOVERY_RADIUS_METERS/,
  );
  assert.match(
    contents,
    /discoverDishes\([\s\S]{0,180}DEFAULT_DISCOVERY_RADIUS_METERS/,
  );
  assert.match(contents, /<HomeCategoryRail/);
  assert.doesNotMatch(contents, /<TodaysSpecial/);
  assert.match(contents, /<KitchensGrid/);
  assert.match(contents, /<DishesGrid/);
  assert.match(contents, /<HomeSearchOverlay/);
  assert.match(contents, /<CustomerSignOutDialog/);
  assert.match(contents, /<CartAddressAvailabilityDialog/);
  assert.match(contents, /nearbyKitchenIds/);
  assert.match(contents, /loadKitchenMenu\(kitchenId\)/);
  assert.match(contents, /unavailableCartItems/);
  assert.match(contents, /rememberHomeView\(\)/);
  assert.match(contents, /to: "\/kitchen\/\$id"/);
  assert.match(contents, /getSession\(\)/);
  assert.match(contents, /getAddress\(\)/);
  assert.match(contents, /allDishes\(\)/);
  assert.match(contents, /allKitchens\(\)/);
  assert.match(contents, /restoreHomeView\(\)/);
  assert.doesNotMatch(contents, /selectedKitchen \?/);
  assert.doesNotMatch(contents, /17\.4483|78\.3915/);

  assert.match(search, /to="\/dish\/\$id"/);
  assert.match(search, /to="\/kitchen\/\$id"/);
  assert.match(search, /fixed inset-0/);
  assert.match(returnState, /window\.sessionStorage/);
  assert.match(returnState, /scrollY/);
  assert.match(returnState, /searchTerm/);
  assert.match(returnState, /homeCategory/);
  assert.match(signOut, /role="dialog"/);
  assert.match(signOut, /Sign out of Craves\?/);
  assert.match(signOut, /Stay signed in/);
  assert.match(kitchensService, /export function allKitchens\(\)/);
});

test("profile exposes backend chef application status", () => {
  const contents = source("../screens/Profile/Profile.tsx");
  assert.match(contents, /fetchWidget\("\/api\/chef\/application"/);
  assert.match(contents, /Chef application pending/);
  assert.match(contents, /Become a home chef/);
});

test("production catalogue has no demo dish fallback", () => {
  const contents = source("../services/api/dishes.ts");
  assert.doesNotMatch(contents, /export const DISHES/);
  assert.doesNotMatch(contents, /NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK/);
  assert.match(contents, /parseMenuDiscovery\(body\)/);
  assert.match(contents, /\/api\/discovery\/menu-items/);
});

test("customer discovery remains inside the 50 km browsing boundary", () => {
  const dishes = source("../services/api/dishes.ts");
  const kitchens = source("../services/api/kitchens.ts");
  const policy = source("./catalog-discovery-policy.ts");
  const kitchenRoute = source("../app/api/discovery/kitchens/route.ts");
  const dishRoute = source("../app/api/discovery/menu-items/route.ts");

  assert.match(dishes, /MAX_DISCOVERY_RADIUS_METERS/);
  assert.match(kitchens, /MAX_DISCOVERY_RADIUS_METERS/);
  assert.match(policy, /DEFAULT_DISCOVERY_RADIUS_METERS = 50_000/);
  assert.match(policy, /MAX_DISCOVERY_RADIUS_METERS = 50_000/);
  assert.doesNotMatch(policy, /10_000|15_000/);
  assert.match(kitchenRoute, /radiusMeters > MAX_DISCOVERY_RADIUS_METERS/);
  assert.match(kitchenRoute, /integer\(params\.get\("radiusMeters"\), DEFAULT_DISCOVERY_RADIUS_METERS\)/);
  assert.match(
    dishRoute,
    /numeric\(request, "radiusMeters", 1, MAX_DISCOVERY_RADIUS_METERS, DEFAULT_DISCOVERY_RADIUS_METERS\)/,
  );
});

test("real backend chefs remain available in production", () => {
  const contents = source("../services/api/chefs.ts");
  assert.match(contents, /dish\.kitchenId === id/);
  assert.match(contents, /catalogBacked: true/);
  assert.doesNotMatch(contents, /reviewPool|LOCATIONS|NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK/);
});

test("dish and customer kitchen detail pages recover live data and return to saved home context", () => {
  const dishPage = source("../screens/public/FoodDetails/FoodDetails.tsx");
  const dishService = source("../services/api/dishes.ts");
  const kitchenPage = source("../screens/public/ChefProfile/ChefProfile.tsx");
  const customerKitchenRoute = source("../app/kitchen/[id]/page.tsx");
  const legacyChefRoute = source("../app/chef/[id]/page.tsx");

  assert.match(dishPage, /discoverDishes\([\s\S]{0,180}DEFAULT_DISCOVERY_RADIUS_METERS/);
  assert.match(dishPage, /loadDish\(id\)/);
  assert.match(dishPage, /const cachedDish = getDish\(id\)/);
  assert.match(dishPage, /const detailPromise = cachedDish\?\.detailsLoaded/);
  assert.match(dishPage, /Promise\.all\(\[[\s\S]{0,280}discoverDishes\(/);
  assert.match(dishPage, /hasHomeReturnState\(\)/);
  assert.match(dishPage, /window\.history\.back\(\)/);
  assert.match(dishService, /\/api\/catalog\/menu-items/);
  assert.match(dishService, /const loadedIds = new Set/);
  assert.match(kitchenPage, /getRouteApi\("\/kitchen\/\$id"\)/);
  assert.match(kitchenPage, /loadSelectedAddress\(\)/);
  assert.match(kitchenPage, /discoverKitchens\([\s\S]{0,180}DEFAULT_DISCOVERY_RADIUS_METERS/);
  assert.match(kitchenPage, /hasHomeReturnState\(\)/);
  assert.match(kitchenPage, /window\.history\.back\(\)/);
  assert.match(customerKitchenRoute, /ChefProfilePage/);
  assert.doesNotMatch(customerKitchenRoute, /ChefAccessBoundary|ChefWorkspaceNavigation/);
  assert.match(legacyChefRoute, /redirect\(`\/kitchen\/\$\{encodeURIComponent\(id\)\}`\)/);
});

test("home kitchen and dish details share one live floating cart without forcing checkout", () => {
  const sharedCart = source("../components/cart/CustomerFloatingCart.tsx");
  const home = source("../screens/public/BrowseFoods/BrowseFoods.tsx");
  const kitchen = source("../screens/public/ChefProfile/ChefProfile.tsx");
  const dish = source("../screens/public/FoodDetails/FoodDetails.tsx");

  assert.match(sharedCart, /subscribeCart/);
  assert.match(sharedCart, /cartCount\(\)/);
  assert.match(sharedCart, /cartTotal\(\)/);
  assert.match(sharedCart, /cartCurrency\(\)/);

  for (const surface of [home, kitchen, dish]) {
    assert.match(surface, /<CustomerFloatingCart \/>/);
  }

  assert.match(kitchen, /useCustomerCartSummary\(\)/);
  assert.match(dish, /useCustomerCartSummary\(\)/);
  assert.match(dish, /cartSummary\.itemCount === 0 \? \(/);
  assert.match(dish, /messageKind === "success"/);
  assert.match(dish, /was added to your cart/);
  assert.doesNotMatch(dish, /navigate\(\{ to: "\/cart" \}\);/);
});

test("every home-chef call to action opens the live chef registration flow", () => {
  const landing = source("../screens/public/LandingPage/LandingPage.tsx");
  const hero = source("../components/sections/HeroSection.tsx");
  const application = source("../components/chef-application-workspace.tsx");
  const kitchen = source("../components/chef-kitchen-form.tsx");

  assert.match(
    landing,
    /onBecomeChef=\{\(\) => openAuth\("register", "chef", true\)\}/,
  );
  assert.match(hero, /onClick=\{onBecomeChef\}/);
  assert.match(
    landing,
    /hasChefRole\(authenticatedUser\)\s*\?\s*"\/chef"\s*:\s*"\/chef\/application"/s,
  );
  assert.match(application, /fetch\("\/api\/customer\/profile"/);
  assert.match(application, /fetch\("\/api\/customer\/addresses"/);
  assert.match(kitchen, /application\.status !== "APPROVED"/);
  assert.match(
    kitchen,
    /Use current location before activating this kitchen/,
  );
});

test("chef evidence UI imports components and contracts from their correct modules", () => {
  const panel = source("../components/chef-application-document-panel.tsx");
  const uploader = source("../components/chef-application-evidence-uploader.tsx");

  assert.match(
    panel,
    /from "@\/components\/chef-application-evidence-uploader"/,
  );
  assert.match(
    panel,
    /parseChefEvidenceList/,
  );
  assert.doesNotMatch(
    panel,
    /import\s*\{[^}]*ChefApplicationEvidenceUploader[^}]*\}\s*from "@\/lib\/chef-application-evidence-contract"/,
  );
  assert.match(
    uploader,
    /parseChefEvidenceMetadata/,
  );
});

test("pending chef applications remain editable exactly as the backend permits", () => {
  const contents = source("../components/chef-application-workspace.tsx");
  assert.match(contents, /const locked = !application \|\| loadFailed \|\| application.status === "APPROVED"/);
  assert.match(contents, /onSubmit=\{submit\}/);
  assert.match(contents, /Update pending application/);
  assert.doesNotMatch(
    contents,
    /application\?\.status === "PENDING" \|\| application\?\.status === "APPROVED"/,
  );
});

test("chef dashboard reuses the working Craves session for applicants and chefs", () => {
  const dashboard = source("../components/chef-mode-dashboard.tsx");
  const phoneAuth = source("../components/phone-auth-form.tsx");
  assert.match(dashboard, /loadSession\(\{ hydrateCustomerProfile: "skip" \}\)/);
  assert.match(dashboard, /state === "applicant"/);
  assert.match(dashboard, /Open chef application/);
  assert.doesNotMatch(dashboard, /fetch\("\/api\/chef\/me"/);
  assert.match(phoneAuth, /Secure Craves access/);
  assert.doesNotMatch(phoneAuth, /Secure customer access/);
});

test("chef identity BFF unwraps the Spring Auth Service response", () => {
  const contents = source("../app/api/chef/me/route.ts");
  assert.match(contents, /parseChefModeIdentity\(raw\?\.identity\)/);
  assert.doesNotMatch(contents, /parseChefModeIdentity\(await upstream\.json/);
});

test("protected chef pages synchronize the JWT after admin grants CHEF", () => {
  const auth = source("../services/auth/cravesAuth.ts");
  const boundary = source("../components/chef-access-boundary.tsx");
  assert.match(auth, /synchronizeSessionRoles/);
  assert.match(auth, /fetch\("\/api\/auth\/refresh"/);
  assert.match(boundary, /loadSession\(\{ hydrateCustomerProfile: "skip" \}\)/);
  assert.match(boundary, /synchronizeSessionRoles\(\{ hydrateCustomerProfile: "skip" \}\)/);
  // Role denial and session races are exercised by rendered components in chef-profile-session.vitest.ts.

  for (const page of [
    "../app/chef/kitchen/page.tsx",
    "../app/chef/menu/page.tsx",
    "../app/chef/menu/media/page.tsx",
    "../app/chef/orders/page.tsx",
    "../app/chef/orders/[orderId]/page.tsx",
  ]) {
    assert.match(source(page), /ChefAccessBoundary/, page);
  }
});

test("customer headers stay lean and share the same responsive scroll behavior", () => {
  const autoHide = source(
    "../components/navigation/AutoHideCustomerHeader.tsx",
  );
  const homeHeader = source("../components/home/BrowseHeader.tsx");
  const detailHeader = source("../components/navigation/DetailBrowseHeader.tsx");
  const cartHeader = source("../components/cart/CartHeader.tsx");
  const checkoutHeader = source("../components/checkout/CheckoutHeader.tsx");
  const profileHeader = source("../components/profile/ProfileHeader.tsx");
  const trackingHeader = source("../components/tracking/TrackingHeader.tsx");
  const orders = source("../screens/OrderHistory/OrderHistory.tsx");
  const saved = source("../screens/Wishlist/Wishlist.tsx");
  const notifications = source("../screens/Notifications/Notifications.tsx");
  const addresses = source("../screens/Profile/Addresses.tsx");

  assert.doesNotMatch(homeHeader, /PersistentCustomerServiceNav/);
  assert.doesNotMatch(detailHeader, /forceServiceNav/);

  for (const surface of [
    homeHeader,
    cartHeader,
    checkoutHeader,
    profileHeader,
    trackingHeader,
    orders,
    saved,
    notifications,
    addresses,
  ]) {
    assert.match(surface, /AutoHideCustomerHeader/);
  }

  assert.match(autoHide, /TOP_REVEAL_PX = 24/);
  assert.match(autoHide, /HIDE_AFTER_PX = 96/);
  assert.match(autoHide, /travel >= HIDE_DELTA_PX/);
  assert.match(autoHide, /travel >= SHOW_DELTA_PX/);
  assert.match(autoHide, /requestAnimationFrame/);
  assert.match(autoHide, /duration-\[260ms\]/);
  assert.match(autoHide, /--craves-desktop-header-offset-md/);
  assert.match(autoHide, /--craves-desktop-header-offset-lg/);
  assert.match(autoHide, /motion-reduce:transition-none/);
  assert.match(autoHide, /onFocusCapture=\{\(\) => setHidden\(false\)\}/);
  assert.match(homeHeader, /<AutoHideCustomerHeader mobileStatic/);
});
```

### apps/customer-web-next/src/screens/Checkout/Checkout.tsx

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Clock3,
  MapPin,
  Plus,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  displayAddressLabel,
  isDeliveryReadyAddress,
  parseCustomerAddresses,
  type CustomerAddress,
} from "@/lib/address-contract";
import {
  parseCheckout,
  type CustomerCheckout,
} from "@/lib/checkout-contract";
import {
  checkoutCartSnapshot,
  parseCheckoutOperationResponse,
} from "@/lib/checkout-operation-contract";
import { loadSession } from "@/services/auth/cravesAuth";
import { sessionFetch } from "@/services/auth/sessionFetch";
import {
  cartCurrency,
  cartTotal,
  ensureCheckoutCart,
  getCart,
  loadCart,
  validateCart,
  type CartItem,
} from "@/services/api/cravesCart";
import { loadDish } from "@/services/api/dishes";
import { CheckoutHeader } from "@/components/checkout/CheckoutHeader";
import {
  CheckoutPaymentButton,
  type CheckoutPaymentFailure,
} from "@/components/checkout/CheckoutPaymentButton";
import { LazyAddressEditorFlow } from "@/components/profile/LazyAddressEditorFlow";
import { CustomerPageSkeleton } from "@/components/loading/CustomerPageSkeleton";

const ADDRESS_KEY = "craves.checkout.addressId";
const CHECKOUT_ID_KEY = "craves.checkout.id";
const CHECKOUT_OPERATION_ID_KEY = "craves.checkout.operationId";
const INSTRUCTIONS_KEY = "craves.checkout.instructions";
const CART_NOTICE_KEY = "craves.cart.notice";

function money(amount: number, currency = "INR") {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `₹${Math.round(amount)}`;
  }
}

function checkoutMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "We couldn’t prepare checkout right now. Your cart is safe — please try again.";
  }

  const message = error.message.trim();
  const normalized = message.toLowerCase();

  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("timeout")
  ) {
    return "Craves is having trouble connecting right now. Your cart is safe — check your connection and try again.";
  }

  if (
    normalized.includes("invalid checkout") ||
    normalized.includes("invalid address response") ||
    normalized.includes("checkout attempt") ||
    normalized.includes("could not be loaded")
  ) {
    return "We couldn’t refresh your checkout details right now. Your cart is safe — please try again.";
  }

  if (
    normalized.includes("authentication") ||
    normalized.includes("session_expired") ||
    normalized.includes("session expired")
  ) {
    return "We’re reconnecting your Craves session. Please try again in a moment.";
  }

  return message || "We couldn’t prepare checkout right now. Your cart is safe — please try again.";
}

function responseMessage(body: unknown, fallback: string): string {
  return body &&
    typeof body === "object" &&
    "message" in body &&
    typeof body.message === "string"
    ? body.message
    : fallback;
}

function fullAddress(address: CustomerAddress): string {
  return [
    address.addressLine1,
    address.addressLine2,
    address.landmark,
    address.areaName,
    address.city,
    address.state,
    address.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

async function fetchAddresses(): Promise<CustomerAddress[]> {
  const response = await sessionFetch("/api/customer/addresses", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const raw = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(responseMessage(raw, "Saved addresses could not be loaded."));
  }
  const parsed = parseCustomerAddresses(raw);
  if (!parsed) throw new Error("Craves returned an invalid address response.");
  return parsed;
}

async function fetchCheckout(
  checkoutId: string,
): Promise<CustomerCheckout | null> {
  const response = await sessionFetch(
    `/api/checkout/${encodeURIComponent(checkoutId)}`,
    {
      cache: "no-store",
      credentials: "same-origin",
    },
  );
  const raw = await response.json().catch(() => null);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(responseMessage(raw, "Checkout could not be restored."));
  }
  const parsed = parseCheckout(raw);
  if (!parsed) throw new Error("Craves returned an invalid checkout response.");
  return parsed;
}

async function fetchCheckoutOperation(
  operationId: string,
) {
  const response = await sessionFetch(
    `/api/checkout/operations/${encodeURIComponent(operationId)}`,
    {
      cache: "no-store",
      credentials: "same-origin",
    },
  );
  const raw = await response.json().catch(() => null);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      responseMessage(raw, "Checkout attempt could not be restored."),
    );
  }
  const parsed = parseCheckoutOperationResponse(raw);
  if (!parsed) {
    throw new Error("Craves returned an invalid checkout attempt response.");
  }
  return parsed;
}

async function createAuthoritativeCheckout(
  operationId: string,
  deliveryAddressId: string,
  note: string,
): Promise<CustomerCheckout> {
  const validatedCart = await validateCart();
  const response = await sessionFetch(
    `/api/checkout/operations/${encodeURIComponent(operationId)}`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deliveryAddressId,
        note: note.trim() || null,
        expectedCart: checkoutCartSnapshot(validatedCart),
      }),
    },
  );
  const raw = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(responseMessage(raw, "Checkout could not be created."));
  }

  const operation = parseCheckoutOperationResponse(raw);
  if (!operation) {
    throw new Error("Craves returned an invalid checkout attempt response.");
  }

  const checkout = await fetchCheckout(operation.checkoutId);
  if (!checkout) {
    throw new Error("Checkout was created but could not be loaded.");
  }
  return checkout;
}

async function resolveLeadMinutes(items: CartItem[]): Promise<number | null> {
  const dishResults = await Promise.allSettled(
    items.map((item) => loadDish(item.menuItemId)),
  );
  const minutes = dishResults
    .flatMap((result) => {
      if (result.status !== "fulfilled") return [];
      const match = /^(\d+)\s*min$/i.exec(result.value.time);
      return match ? [Number(match[1])] : [];
    })
    .filter((value) => Number.isFinite(value) && value > 0);
  return minutes.length ? Math.max(...minutes) : null;
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const prepareStartedRef = useRef(false);
  const autoReviewKeyRef = useRef("");
  const [items, setItems] = useState<CartItem[]>([]);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [showAllAddresses, setShowAllAddresses] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [profileDefaults, setProfileDefaults] = useState({
    recipientName: "",
    contactPhoneNumber: "",
  });
  const [leadMinutes, setLeadMinutes] = useState<number | null>(null);
  const [instructions, setInstructions] = useState("");
  const [checkout, setCheckout] = useState<CustomerCheckout | null>(null);
  const [paymentFailure, setPaymentFailure] =
    useState<CheckoutPaymentFailure>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [addressChangeBusy, setAddressChangeBusy] = useState(false);
  const [error, setError] = useState("");

  const prepareCheckout = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const session = await loadSession({ hydrateCustomerProfile: "background" });
      if (!session) {
        navigate({ to: "/" });
        return;
      }

      setProfileDefaults({
        recipientName:
          [session.firstName, session.lastName].filter(Boolean).join(" ").trim() ||
          session.username ||
          "",
        contactPhoneNumber: session.phoneNumber || session.phone || "",
      });

      const savedInstructions =
        window.sessionStorage.getItem(INSTRUCTIONS_KEY) ?? "";
      setInstructions(savedInstructions);

      const parsedAddresses = await fetchAddresses();
      const activeAddresses = parsedAddresses.filter(isDeliveryReadyAddress);
      setAddresses(activeAddresses);

      const lastUsedId = window.sessionStorage.getItem(ADDRESS_KEY);
      const preferred =
        activeAddresses.find((address) => address.isDefault) ??
        activeAddresses.find((address) => address.id === lastUsedId) ??
        activeAddresses[0];

      const storedCheckoutId = window.sessionStorage.getItem(CHECKOUT_ID_KEY);
      if (storedCheckoutId) {
        try {
          const restored = await fetchCheckout(storedCheckoutId);
          if (restored?.status === "PAYMENT_PENDING") {
            setCheckout(restored);
            setSelectedId(restored.deliveryAddressId ?? preferred?.id ?? "");
            setItems([]);
            setLeadMinutes(null);
            return;
          }
          window.sessionStorage.removeItem(CHECKOUT_ID_KEY);
          window.sessionStorage.removeItem(CHECKOUT_OPERATION_ID_KEY);
        } catch {
          window.sessionStorage.removeItem(CHECKOUT_ID_KEY);
        }
      }

      const storedOperationId =
        window.sessionStorage.getItem(CHECKOUT_OPERATION_ID_KEY);
      if (storedOperationId) {
        try {
          const operation = await fetchCheckoutOperation(storedOperationId);
          if (operation) {
            const restored = await fetchCheckout(operation.checkoutId);
            if (restored?.status === "PAYMENT_PENDING") {
              window.sessionStorage.setItem(
                CHECKOUT_ID_KEY,
                operation.checkoutId,
              );
              setCheckout(restored);
              setSelectedId(restored.deliveryAddressId ?? preferred?.id ?? "");
              setItems([]);
              setLeadMinutes(null);
              return;
            }
          }
          window.sessionStorage.removeItem(CHECKOUT_OPERATION_ID_KEY);
        } catch {
          window.sessionStorage.removeItem(CHECKOUT_OPERATION_ID_KEY);
        }
      }

      await loadCart();
      const nextItems = getCart();
      if (!nextItems.length) {
        navigate({ to: "/cart" });
        return;
      }
      await validateCart();

      setItems(nextItems);
      setSelectedId(preferred?.id ?? "");
      setCheckout(null);
      setLoading(false);
      void resolveLeadMinutes(nextItems)
        .then(setLeadMinutes)
        .catch(() => setLeadMinutes(null));
    } catch (caught) {
      setItems([]);
      setAddresses([]);
      setSelectedId("");
      setLeadMinutes(null);
      setError(checkoutMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (prepareStartedRef.current) return;
    prepareStartedRef.current = true;
    void prepareCheckout();
  }, [prepareCheckout]);

  async function resetCheckoutForAddressChange(): Promise<boolean> {
    if (!checkout) return true;

    try {
      const restored = await ensureCheckoutCart(checkout.orders);
      if (!restored) return false;

      setItems(getCart());
      window.sessionStorage.removeItem(CHECKOUT_ID_KEY);
      window.sessionStorage.removeItem(CHECKOUT_OPERATION_ID_KEY);
      setCheckout(null);
      return true;
    } catch {
      // Keep the existing checkout untouched if the cart cannot be rebuilt.
      // The customer can still pay with the current address or go back.
      return false;
    }
  }

  async function selectAddress(id: string) {
    if (addressChangeBusy || (id === selectedId && checkout)) return;

    setAddressChangeBusy(true);
    setError("");
    try {
      const readyForAddressChange = await resetCheckoutForAddressChange();
      if (!readyForAddressChange) {
        setError(
          "We couldn’t refresh delivery for that address just now. Your current checkout is unchanged — you can try again or return to your cart.",
        );
        return;
      }

      autoReviewKeyRef.current = "";
      setSelectedId(id);
      window.sessionStorage.setItem(ADDRESS_KEY, id);
      window.sessionStorage.removeItem(CHECKOUT_OPERATION_ID_KEY);
      setPaymentFailure(null);
    } catch (caught) {
      setError(checkoutMessage(caught));
    } finally {
      setAddressChangeBusy(false);
    }
  }

  function openAddressEditor() {
    if (addressChangeBusy) return;

    // Opening the editor is safe and should never be blocked by a checkout
    // restoration attempt. We only rebuild the cart if the customer actually
    // selects a different saved address.
    setError("");
    setEditorOpen(true);
  }

  const ensureCheckout = useCallback(async (): Promise<CustomerCheckout> => {
    if (checkout) return checkout;
    if (!selectedId) {
      throw new Error("Choose a delivery address before continuing.");
    }

    const operationId =
      window.sessionStorage.getItem(CHECKOUT_OPERATION_ID_KEY) ??
      crypto.randomUUID();
    window.sessionStorage.setItem(CHECKOUT_OPERATION_ID_KEY, operationId);

    const prepared = await createAuthoritativeCheckout(
      operationId,
      selectedId,
      instructions,
    );
    window.sessionStorage.setItem(CHECKOUT_ID_KEY, prepared.id);
    setCheckout(prepared);
    setPaymentFailure(null);
    return prepared;
  }, [checkout, instructions, selectedId]);

  useEffect(() => {
    if (
      loading ||
      reviewing ||
      addressChangeBusy ||
      checkout ||
      !selectedId ||
      items.length === 0 ||
      paymentFailure
    ) {
      return;
    }

    const reviewKey = `${selectedId}:${instructions.trim()}`;
    if (autoReviewKeyRef.current === reviewKey) return;
    autoReviewKeyRef.current = reviewKey;

    setReviewing(true);
    void ensureCheckout()
      .catch((caught) => {
        setPaymentFailure({
          message: checkoutMessage(caught),
          retryAllowed: true,
        });
      })
      .finally(() => setReviewing(false));
  }, [
    addressChangeBusy,
    checkout,
    ensureCheckout,
    instructions,
    items.length,
    loading,
    paymentFailure,
    reviewing,
    selectedId,
  ]);

  async function handleBackToCart() {
    setError("");

    const currentCheckout = checkout;
    window.sessionStorage.removeItem(CHECKOUT_ID_KEY);
    window.sessionStorage.removeItem(CHECKOUT_OPERATION_ID_KEY);
    setCheckout(null);

    if (!currentCheckout) {
      navigate({ to: "/cart" });
      return;
    }

    // Never trap the customer on checkout. Give cart restoration a short head
    // start, then return to the cart even if the network is slow. The shared
    // cart store keeps updating if restoration finishes after navigation.
    let finished = false;
    const restoration = ensureCheckoutCart(currentCheckout.orders)
      .then((restored) => {
        finished = true;
        if (!restored) {
          window.sessionStorage.setItem(
            CART_NOTICE_KEY,
            "Your cart is open. Please check the items before continuing to checkout again.",
          );
        }
      })
      .catch(() => {
        finished = true;
        window.sessionStorage.setItem(
          CART_NOTICE_KEY,
          "Your cart is open. We couldn’t refresh every item automatically, so please check it before continuing.",
        );
      });

    await Promise.race([
      restoration,
      new Promise<void>((resolve) => window.setTimeout(resolve, 900)),
    ]);

    navigate({ to: "/cart" });

    if (!finished) {
      void restoration;
    }
  }

  async function handleAddressSaved(saved: CustomerAddress | null) {
    const next = (await fetchAddresses()).filter(isDeliveryReadyAddress);
    setAddresses(next);
    setEditorOpen(false);

    const selected =
      saved && isDeliveryReadyAddress(saved)
        ? next.find((address) => address.id === saved.id)
        : null;
    if (selected) {
      await selectAddress(selected.id);
    } else if (!selectedId && next[0]) {
      await selectAddress(next[0].id);
    }
  }

  const subtotal = checkout?.foodSubtotal ?? cartTotal();
  const currency = checkout?.currency ?? cartCurrency();
  const selectedAddress = addresses.find((address) => address.id === selectedId);
  const visibleAddresses = showAllAddresses ? addresses : addresses.slice(0, 3);
  const hasCheckoutContext = items.length > 0 || checkout !== null;

  if (loading) {
    return <CustomerPageSkeleton label="Preparing your checkout" />;
  }

  return (
    <div className="min-h-screen bg-[#F7F7F7] pb-36 text-[#1A1A1A] lg:pb-12">
      <CheckoutHeader
        onBack={() => void handleBackToCart()}
        title="Checkout"
        subtitle="Choose delivery, then pay securely"
      />

      <main className="mx-auto max-w-[1180px] px-4 py-5 md:px-6 md:py-8 lg:px-8 lg:py-9">
        {loading ? (
          <div className="space-y-4" aria-hidden="true">
            <div className="h-64 animate-pulse rounded-[1.25rem] bg-[#F1F3F5]" />
            <div className="h-28 animate-pulse rounded-[1.25rem] bg-[#F1F3F5]" />
            <div className="h-52 animate-pulse rounded-[1.25rem] bg-[#F1F3F5]" />
          </div>
        ) : error && !hasCheckoutContext ? (
          <section className="rounded-[1.25rem] border border-[#F62E18]/20 bg-white p-8 text-center shadow-[0_3px_12px_rgba(0,0,0,0.06)]">
            <AlertTriangle className="mx-auto h-9 w-9 text-[#F62E18]" aria-hidden="true" />
            <h1 className="mt-4 text-xl font-semibold">Checkout could not be prepared</h1>
            <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">{error}</p>
            <button
              type="button"
              onClick={() => void prepareCheckout()}
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F62E18] px-5 text-sm font-semibold text-white"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
            </button>
          </section>
        ) : (
          <div>
            <div className="mb-6 hidden lg:block">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#F62E18]">
                Secure checkout
              </p>
              <div className="mt-1 flex items-end justify-between gap-6">
                <div>
                  <h1 className="text-3xl font-black tracking-[-0.04em] text-[#1A1A1A]">
                    Delivery & payment
                  </h1>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6B6B6B]">
                    Choose where to deliver. Craves calculates the final total automatically before payment.
                  </p>
                </div>
                <span className="rounded-full border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-bold text-[#6B6B6B] shadow-[0_2px_8px_rgba(26,26,26,0.04)]">
                  {items.length} {items.length === 1 ? "item" : "items"} in this order
                </span>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start lg:gap-7 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="space-y-4">
                {paymentFailure ? (
                  <section
                    role="alert"
                    className="rounded-[1.25rem] border border-[#C92716]/20 bg-[#FFF2F0] p-4"
                  >
                    <h2 className="text-sm font-semibold text-[#9F2114]">
                      {checkout
                        ? "Payment didn't go through"
                        : "Order could not be prepared"}
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-[#7A2C22]">
                      {paymentFailure.message}
                    </p>
                  </section>
                ) : null}

                <section className="overflow-hidden rounded-[1.45rem] border border-[#E5E7EB] bg-white shadow-[0_8px_28px_rgba(26,26,26,0.055)]">
                  <div className="flex items-center justify-between gap-3 border-b border-[#F1F3F5] px-4 py-4 sm:px-5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFF1EF] text-[#F62E18]">
                        <MapPin className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[#F62E18]">
                          Step 1
                        </p>
                        <h2 className="text-base font-bold">Delivery address</h2>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={openAddressEditor}
                      disabled={addressChangeBusy}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-[#D7DADF] bg-white px-3 text-xs font-bold text-[#1A1A1A] shadow-[0_1px_2px_rgba(26,26,26,0.06)] transition hover:border-[#F62E18]/25 hover:bg-[#FFF8F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/25 disabled:pointer-events-none disabled:opacity-45"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      Add new
                    </button>
                  </div>

                  {visibleAddresses.length ? (
                    <div className="grid gap-2.5 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-1 xl:grid-cols-2">
                      {visibleAddresses.map((address) => {
                        const checked = address.id === selectedId;
                        return (
                          <label
                            key={address.id}
                            className={[
                              "relative flex min-h-[116px] cursor-pointer items-start gap-3 rounded-[1rem] border p-3.5 transition-[border-color,background-color,box-shadow] focus-within:ring-2 focus-within:ring-[#F62E18]/20",
                              checked
                                ? "border-[#F62E18]/40 bg-[#FFF8F6] shadow-[0_5px_16px_rgba(246,46,24,0.08)]"
                                : "border-[#E5E7EB] bg-white hover:border-[#C8CDD2] hover:bg-[#FAFAFA]",
                            ].join(" ")}
                          >
                            <input
                              type="radio"
                              name="delivery-address"
                              value={address.id}
                              checked={checked}
                              disabled={addressChangeBusy}
                              onChange={() => void selectAddress(address.id)}
                              className="mt-1 h-4 w-4 shrink-0 accent-[#F62E18] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-55"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold capitalize">
                                  {displayAddressLabel(address.addressLabel)}
                                </span>
                                {address.isDefault ? (
                                  <span className="rounded-full bg-[#F62E18]/10 px-2 py-0.5 text-[10px] font-bold text-[#F62E18]">
                                    Default
                                  </span>
                                ) : null}
                              </span>
                              <span className="mt-1.5 block text-xs leading-5 text-[#6B6B6B]">
                                {fullAddress(address)}
                              </span>
                            </span>
                          </label>
                        );
                      })}

                      {addresses.length > 3 ? (
                        <button
                          type="button"
                          onClick={() => setShowAllAddresses((current) => !current)}
                          className="min-h-11 rounded-[1rem] border border-dashed border-[#D7DADF] bg-[#FAFAFA] px-4 text-sm font-bold text-[#1A1A1A] transition hover:border-[#F62E18]/30 hover:bg-[#FFF8F6] sm:col-span-2 lg:col-span-1 xl:col-span-2"
                        >
                          {showAllAddresses
                            ? "Show fewer addresses"
                            : `Show all ${addresses.length} addresses`}
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="px-5 py-8 text-center">
                      <p className="text-sm font-bold">No delivery address yet</p>
                      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[#6B6B6B]">
                        Add a mapped address so Craves can check delivery serviceability and calculate your final total.
                      </p>
                      <button
                        type="button"
                        onClick={openAddressEditor}
                        disabled={addressChangeBusy}
                        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F62E18] px-4 text-sm font-semibold text-white disabled:pointer-events-none disabled:opacity-45"
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Add a new address
                      </button>
                    </div>
                  )}
                </section>

                <section className="rounded-[1.45rem] border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_28px_rgba(26,26,26,0.05)] sm:p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFF8EC] text-[#B86E00]">
                      <Clock3 className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[#F62E18]">
                        Step 2
                      </p>
                      <h2 className="text-base font-bold">Delivery timing</h2>
                    </div>
                  </div>
                  <div className="mt-4 flex items-start gap-3 rounded-[1rem] border border-[#F6B545]/35 bg-[#FFF8EC] p-4">
                    <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#F6B545]" />
                    <div>
                      <p className="text-xs font-semibold text-[#7B5A1A]">Earliest delivery</p>
                      <p className="mt-0.5 text-base font-black text-[#1A1A1A]">As soon as possible</p>
                      <p className="mt-1 text-xs leading-5 text-[#6B6B6B]">
                        {leadMinutes
                          ? `Your chef usually needs about ${leadMinutes} min to prepare this order. Craves arranges delivery at the earliest available time.`
                          : "This kitchen cooks to order. Craves arranges delivery at the earliest available time."}
                      </p>
                    </div>
                  </div>
                </section>

                {instructions.trim() ? (
                  <section className="rounded-[1.25rem] border border-[#E5E7EB] bg-white p-4 shadow-[0_5px_18px_rgba(26,26,26,0.04)]">
                    <p className="text-xs font-bold text-[#6B6B6B]">Cooking instructions</p>
                    <p className="mt-1.5 text-sm leading-6 text-[#1A1A1A]">{instructions.trim()}</p>
                  </section>
                ) : null}
              </div>

              <aside className="lg:sticky lg:top-24">
                <section className="overflow-hidden rounded-[1.45rem] border border-[#E5E7EB] bg-white shadow-[0_12px_36px_rgba(26,26,26,0.07)]">
                  <div className="border-b border-[#F1F3F5] px-4 py-4 sm:px-5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EDF8F0] text-[#16803D]">
                        <ReceiptText className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[#F62E18]">
                          Step 3
                        </p>
                        <h2 className="text-base font-bold">Bill details</h2>
                      </div>
                    </div>
                  </div>

                  <div className="px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
                    <div className="mb-4 rounded-[1rem] bg-[#F8F9FA] px-3.5 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#6B6B6B]">
                        Order summary
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[#1A1A1A]">
                        {items.length} {items.length === 1 ? "item" : "items"} from your selected home kitchen
                      </p>
                    </div>

                    <dl className="space-y-3 text-sm">
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-[#6B6B6B]">Item total</dt>
                        <dd className="font-semibold tabular-nums">
                          {money(subtotal, currency)}
                        </dd>
                      </div>

                      {checkout ? (
                        <>
                          <div className="flex items-center justify-between gap-4">
                            <dt className="text-[#6B6B6B]">Platform fee</dt>
                            <dd className="font-medium tabular-nums">
                              {money(checkout.platformFee, checkout.currency)}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <dt className="text-[#6B6B6B]">Delivery fee</dt>
                            <dd className="font-medium tabular-nums">
                              {money(checkout.deliveryFee, checkout.currency)}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <dt className="text-[#6B6B6B]">GST / tax</dt>
                            <dd className="font-medium tabular-nums">
                              {money(checkout.taxAmount, checkout.currency)}
                            </dd>
                          </div>
                          <div className="mt-3 flex items-end justify-between gap-4 border-t border-[#E5E7EB] pt-4">
                            <div>
                              <dt className="text-sm font-black">To pay</dt>
                              <p className="mt-0.5 text-[10px] text-[#6B6B6B]">Inclusive of applicable taxes</p>
                            </div>
                            <dd className="text-xl font-black tabular-nums text-[#1A1A1A]">
                              {money(checkout.grandTotal, checkout.currency)}
                            </dd>
                          </div>
                        </>
                      ) : (
                        <div className="mt-3 flex items-start gap-2 border-t border-[#E5E7EB] pt-4">
                          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#16A34A]" aria-hidden="true" />
                          <p className="text-xs leading-5 text-[#6B6B6B]">
                            {reviewing
                              ? "Calculating delivery fee, tax and your final total…"
                              : "Your final total is calculated automatically for the selected address."}
                          </p>
                        </div>
                      )}
                    </dl>

                    <div className="mt-4 flex items-start gap-2.5 rounded-[0.9rem] bg-[#EDF8F0] px-3 py-2.5 text-[#176B38]">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <p className="text-[11px] font-semibold leading-5">
                        Secure payment. Your order is placed only after Craves confirms payment.
                      </p>
                    </div>

                    {hasCheckoutContext ? (
                      <CheckoutPaymentButton
                        checkout={checkout}
                        previewAmount={subtotal}
                        currency={currency}
                        disabled={
                          reviewing ||
                          addressChangeBusy ||
                          (!checkout && !selectedAddress)
                        }
                        failure={paymentFailure}
                        ensureCheckout={ensureCheckout}
                        onFailure={setPaymentFailure}
                      />
                    ) : null}
                  </div>
                </section>
              </aside>
            </div>
          </div>
        )}

        {error && hasCheckoutContext ? (
          <div
            role="status"
            className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#F6B545]/40 bg-[#FFF8EC] p-3 text-sm font-medium text-[#6B5526]"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B86E00]" aria-hidden="true" />
            <p>{error}</p>
          </div>
        ) : null}
      </main>

      {editorOpen ? <LazyAddressEditorFlow
        open={editorOpen}
        initialAddress={null}
        profileDefaults={profileDefaults}
        onClose={() => setEditorOpen(false)}
        onSaved={handleAddressSaved}
      /> : null}
    </div>
  );
}
```

### apps/customer-web-next/src/screens/Profile/Addresses.tsx

```tsx
"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  displayAddressLabel,
  isDeliveryReadyAddress,
  type CustomerAddress,
} from "@/lib/address-contract";
import { clearDishDiscoveryCache } from "@/services/api/dishes";
import { clearKitchenDiscoveryCache } from "@/services/api/kitchens";
import {
  invalidateSelectedAddress,
  loadSession,
} from "@/services/auth/cravesAuth";
import { AutoHideCustomerHeader } from "@/components/navigation/AutoHideCustomerHeader";
import { LazyAddressEditorFlow } from "@/components/profile/LazyAddressEditorFlow";

function addressLine(address: CustomerAddress): string {
  return [
    address.addressLine1,
    address.addressLine2,
    address.landmark,
    address.areaName,
    address.districtName,
    address.city,
    address.state,
    address.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

function displayPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91")
    ? digits.slice(2)
    : value;
}

function recipientLine(address: CustomerAddress): string {
  return [address.recipientName, displayPhone(address.contactPhoneNumber)]
    .filter(Boolean)
    .join(" · ");
}

function addressDisplayName(address: CustomerAddress): string {
  return displayAddressLabel(address.addressLabel);
}

function invalidateHomeDeliveryContext(): void {
  invalidateSelectedAddress();
  clearDishDiscoveryCache();
  clearKitchenDiscoveryCache();
}

export default function AddressesPage() {
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [initialLoadState, setInitialLoadState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorAddress, setEditorAddress] = useState<CustomerAddress | null>(null);
  const [profileDefaults, setProfileDefaults] = useState({
    recipientName: "",
    contactPhoneNumber: "",
  });
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomerAddress | null>(null);
  const [message, setMessage] = useState("Loading saved addresses…");

  const load = useCallback(async () => {
    const response = await fetch("/api/customer/addresses", {
      cache: "no-store",
      credentials: "same-origin",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(body?.message || "Addresses could not be loaded.");
    setAddresses(body);
    setInitialLoadState("ready");
    const incomplete = body.filter(
      (address: CustomerAddress) => !isDeliveryReadyAddress(address),
    ).length;
    setMessage(
      incomplete > 0
        ? `${body.length} saved address${body.length === 1 ? "" : "es"}; ${incomplete} need${incomplete === 1 ? "s" : ""} completion before checkout.`
        : body.length
          ? `${body.length} saved address${body.length === 1 ? "" : "es"}.`
          : "No addresses saved yet.",
    );
  }, []);

  useEffect(() => {
    void (async () => {
      const current = await loadSession({ hydrateCustomerProfile: "background" });
      if (!current) {
        navigate({ to: "/" });
        return;
      }
      setProfileDefaults({
        recipientName:
          [current.firstName, current.lastName].filter(Boolean).join(" ").trim()
          || current.username
          || "",
        contactPhoneNumber: current.phoneNumber || current.phone || "",
      });
      await load();
    })().catch((error) => {
      setInitialLoadState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Addresses could not be loaded.",
      );
    });
  }, [load, navigate]);

  function beginCreate() {
    setEditorAddress(null);
    setEditorOpen(true);
  }

  function beginEdit(address: CustomerAddress) {
    setEditorAddress(address);
    setEditorOpen(true);
  }

  async function selectDefault(address: CustomerAddress) {
    if (address.isDefault || busy) return;

    setBusy(true);
    try {
      const response = await fetch(
        `/api/customer/addresses/${address.id}/default`,
        {
          method: "PUT",
          credentials: "same-origin",
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message || "Default address could not be updated.");
      }
      invalidateHomeDeliveryContext();
      await load();
      setMessage(
        `${addressDisplayName(address)} is now your default delivery address.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Default address could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(address: CustomerAddress) {
    setBusy(true);
    try {
      const response = await fetch(`/api/customer/addresses/${address.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || "Address could not be deleted.");
      }
      invalidateHomeDeliveryContext();
      await load();
      setDeleteTarget(null);
      setMessage("Address deleted.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Address could not be deleted.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-white pb-12 text-[#1A1A1A]">
      <AutoHideCustomerHeader className="border-b border-[#E5E7EB] bg-white/95 shadow-[0_4px_18px_rgba(26,26,26,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-5 md:px-6 md:py-6">
          <Link
            to="/profile"
            aria-label="Back to profile"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#E5E7EB] bg-white transition-[background-color,box-shadow] duration-200 ease-out hover:bg-[#F1F3F5] hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)]"
          >
            <ArrowLeft className="h-6 w-6 text-[#1A1A1A]" strokeWidth={2.25} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[#F62E18] md:text-base">
              Your places
            </p>
            <h1 className="mt-0.5 font-display text-2xl font-bold tracking-tight text-[#1A1A1A] md:text-[2rem] md:leading-tight">
              Delivery addresses
            </h1>
          </div>
          <button
            type="button"
            onClick={beginCreate}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl !border !border-[#E5E7EB] !bg-[#F1F3F5] px-4 py-3 text-sm font-bold !text-[#1A1A1A] transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:!bg-white hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)] active:translate-y-0 motion-reduce:transform-none md:px-5"
          >
            <Plus className="h-5 w-5" strokeWidth={2.25} />
            <span className="hidden sm:inline">Add New Address</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </AutoHideCustomerHeader>

      <main className="mx-auto max-w-5xl px-4 pt-7 md:px-6 md:pt-9">
        <div className="mb-6 flex items-start gap-3 rounded-2xl bg-[#F1F3F5] px-4 py-4 md:px-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#F62E18]">
            <MapPin className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black text-[#1A1A1A]">Choose your default delivery address here</p>
            <p className="mt-1 text-xs font-medium leading-5 text-[#6B6B6B] md:text-sm">
              Craves Home discovery and delivery availability use the address you select as default.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {addresses.map((address) => {
            const ready = isDeliveryReadyAddress(address);
            return (
              <article
                key={address.id}
                className={`rounded-[24px] border bg-white px-5 py-5 shadow-[0_4px_18px_rgba(26,26,26,0.06)] transition-shadow md:px-6 md:py-6 ${
                  address.isDefault
                    ? "border-[#F62E18]/35 shadow-[0_8px_28px_rgba(246,46,24,0.08)]"
                    : "border-[#E5E7EB] hover:shadow-[0_10px_30px_rgba(26,26,26,0.09)]"
                }`}
              >
                <div className="flex items-start gap-4">
                  <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F1F3F5] text-[#F62E18] md:h-14 md:w-14">
                    <MapPin className="h-6 w-6 fill-[#F62E18] text-[#F62E18]" strokeWidth={2.1} aria-hidden="true" />
                    <span className="pointer-events-none absolute left-1/2 top-[43%] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-lg font-black text-[#1A1A1A] md:text-xl">
                        {addressDisplayName(address)}
                      </h2>
                      {address.isDefault ? (
                        <span className="inline-flex items-center rounded-full bg-[#F62E18]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#F62E18] md:text-[11px]">
                          <Check className="mr-1 h-3.5 w-3.5" strokeWidth={2.7} />
                          Default
                        </span>
                      ) : null}
                      {!ready ? (
                        <span className="rounded-full bg-[#F1F3F5] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-[#F62E18] md:text-[11px]">
                          UPDATE REQUIRED
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm font-bold text-[#1A1A1A]">
                      {recipientLine(address)}
                    </p>
                    <p className="mt-1.5 text-sm leading-6 text-[#6B6B6B]">
                      {addressLine(address)}
                    </p>
                    {!ready ? (
                      <p className="mt-3 flex items-start gap-2 rounded-xl bg-[#F1F3F5] p-3 text-xs leading-5 text-[#6B6B6B]">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#F62E18]" />
                        This older saved address needs missing delivery details before checkout.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#F1F3F5] pt-4">
                  <button
                    type="button"
                    disabled={busy || address.isDefault}
                    onClick={() => void selectDefault(address)}
                    className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black transition-[background-color,box-shadow,transform] duration-200 ease-out sm:flex-none sm:text-sm ${
                      address.isDefault
                        ? "!bg-[#F1F3F5] !text-[#6B6B6B]"
                        : "!border !border-[#E5E7EB] !bg-[#F1F3F5] !text-[#1A1A1A] hover:-translate-y-0.5 hover:!bg-white hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)] active:translate-y-0 motion-reduce:transform-none"
                    } disabled:cursor-not-allowed disabled:opacity-55`}
                  >
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                    {address.isDefault ? "Default address" : "Set as default"}
                  </button>
                  <button
                    type="button"
                    onClick={() => beginEdit(address)}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl !bg-[#F1F3F5] px-3.5 py-2 text-xs font-black !text-[#1A1A1A] transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:!bg-white hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)] active:translate-y-0 motion-reduce:transform-none sm:text-sm"
                  >
                    <Pencil className="h-4 w-4 text-[#F62E18]" strokeWidth={2.25} />
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDeleteTarget(address)}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl !bg-transparent px-3 py-2 text-xs font-black !text-[#6B6B6B] transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:!bg-[#F1F3F5] hover:!text-[#1A1A1A] hover:shadow-[0_7px_18px_rgba(26,26,26,0.08)] active:translate-y-0 motion-reduce:transform-none disabled:opacity-50 sm:text-sm"
                  >
                    <Trash2 className="h-4 w-4 text-[#F62E18]" strokeWidth={2.25} />
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {initialLoadState === "loading" ? (
          <div
            className="space-y-4"
            role="status"
            aria-label="Loading saved addresses"
          >
            {Array.from({ length: 2 }, (_, index) => (
              <div
                key={index}
                className="rounded-[24px] border border-[#E5E7EB] bg-white px-5 py-5 shadow-[0_4px_18px_rgba(26,26,26,0.04)] md:px-6 md:py-6"
                aria-hidden="true"
              >
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 shrink-0 animate-pulse rounded-2xl bg-[#F1F3F5] md:h-14 md:w-14" />
                  <div className="min-w-0 flex-1">
                    <div className="h-5 w-28 animate-pulse rounded-full bg-[#F1F3F5]" />
                    <div className="mt-3 h-4 w-40 animate-pulse rounded-full bg-[#F1F3F5]" />
                    <div className="mt-3 h-4 w-full max-w-md animate-pulse rounded-full bg-[#F1F3F5]" />
                  </div>
                </div>
              </div>
            ))}
            <span className="sr-only">Loading saved addresses…</span>
          </div>
        ) : null}

        {initialLoadState === "error" ? (
          <div
            role="alert"
            className="rounded-[24px] border border-[#F62E18]/20 bg-[#FFF8F7] px-6 py-8 text-center"
          >
            <AlertTriangle className="mx-auto h-8 w-8 text-[#F62E18]" />
            <h2 className="mt-3 font-display text-xl font-black">
              Saved addresses could not be loaded
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B6B6B]">
              {message}
            </p>
          </div>
        ) : null}

        {initialLoadState === "ready" && addresses.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[#D7DADF] bg-white px-6 py-10 text-center">
            <MapPin className="mx-auto h-8 w-8 text-[#F62E18]" />
            <h2 className="mt-3 font-display text-xl font-black">No saved addresses yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B6B6B]">
              Add your first delivery address, then select it as default for nearby dishes and kitchens.
            </p>
            <button
              type="button"
              onClick={beginCreate}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl !border !border-[#E5E7EB] !bg-[#F1F3F5] px-5 py-2.5 text-sm font-black !text-[#1A1A1A] transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:!bg-white hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)] active:translate-y-0 motion-reduce:transform-none"
            >
              <Plus className="h-4.5 w-4.5" />
              Add New Address
            </button>
          </div>
        ) : null}

        <p role="status" className="mt-6 px-1 text-sm text-[#6B6B6B]">
          {message}
        </p>
      </main>

      {editorOpen ? <LazyAddressEditorFlow
        open={editorOpen}
        initialAddress={editorAddress}
        profileDefaults={profileDefaults}
        onClose={() => {
          setEditorOpen(false);
          setEditorAddress(null);
        }}
        onSaved={async (saved) => {
          invalidateHomeDeliveryContext();
          setEditorOpen(false);
          setEditorAddress(null);
          await load();
          setMessage(
            saved?.isDefault
              ? "Address saved and set as your default delivery address."
              : "Address saved. Select it as default from your saved addresses when you want Home to use it.",
          );
        }}
      /> : null}

      <AlertDialog.Root
        open={Boolean(deleteTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !busy) setDeleteTarget(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[95] bg-black/55 backdrop-blur-[2px]" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[96] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[1.75rem] bg-white p-6 shadow-[0_28px_80px_rgba(26,26,26,0.28)] outline-none md:p-7">
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                disabled={busy}
                className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full !bg-[#F1F3F5] !text-[#1A1A1A] transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:!bg-white hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)] active:translate-y-0 motion-reduce:transform-none disabled:opacity-50"
                aria-label="Close delete confirmation"
              >
                <span className="text-2xl font-light leading-none">×</span>
              </button>
            </AlertDialog.Cancel>

            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#F62E18]/10 text-[#F62E18]">
              <Trash2 className="h-8 w-8" strokeWidth={2} />
            </div>

            <AlertDialog.Title className="mt-6 text-center font-display text-2xl font-black tracking-[-0.03em] text-[#1A1A1A]">
              Delete this address?
            </AlertDialog.Title>
            <AlertDialog.Description className="mx-auto mt-3 max-w-sm text-center text-sm leading-6 text-[#6B6B6B]">
              {deleteTarget
                ? "This will remove your " +
                  displayAddressLabel(deleteTarget.addressLabel) +
                  " address from your saved delivery addresses."
                : "This address will be removed from your saved delivery addresses."}
            </AlertDialog.Description>

            <div className="mt-7 flex items-center justify-center gap-3">
              <AlertDialog.Cancel asChild>
                <button
                  type="button"
                  disabled={busy}
                  className="min-h-11 rounded-xl !border !border-[#E5E7EB] !bg-[#F1F3F5] px-5 text-sm font-black !text-[#1A1A1A] transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:!bg-white hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)] active:translate-y-0 motion-reduce:transform-none disabled:opacity-50"
                >
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  type="button"
                  disabled={busy || !deleteTarget}
                  onClick={(event) => {
                    event.preventDefault();
                    if (deleteTarget) void remove(deleteTarget);
                  }}
                  className="min-h-11 rounded-xl bg-[#F62E18] px-6 text-sm font-black text-white shadow-[0_7px_18px_rgba(246,46,24,0.18)] transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(246,46,24,0.24)] active:translate-y-0 motion-reduce:transform-none disabled:opacity-50"
                >
                  {busy ? "Deleting…" : "Delete"}
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
```

### apps/customer-web-next/src/services/auth/cravesAuth.ts

```typescript
"use client";

import { parseIdentity, type CravesIdentity } from "@/lib/auth-contract";
import { emailVerificationStateSchema, type EmailVerificationState } from "@/lib/email-verification-contract";
import type {
  CustomerAddress,
  DeliveryReadyAddress,
} from "@/lib/address-contract";
import { selectDefaultDeliveryAddress } from "@/lib/address-selection";
import {
  parseCustomerProfile,
  type CustomerProfile,
} from "@/lib/profile-contract";
import { sessionFetch } from "@/services/auth/sessionFetch";

export type CravesUser = {
  id: string;
  phone: string;
  phoneNumber: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  profileComplete: boolean;
  createdAt: number;
  email?: string;
  emailVerified: boolean;
  roles: string[];
  status: string;
};

export type CravesAddress = {
  id?: string;
  label?: string;
  hno: string;
  street?: string;
  city: string;
  mandal: string;
  district: string;
  pincode?: string;
  lat?: number;
  lng?: number;
};

const SESSION_SNAPSHOT_KEY = "craves.customer.session.snapshot.v1";
const ADDRESS_SNAPSHOT_KEY = "craves.customer.selected-address.snapshot.v1";

function readSessionSnapshot(): CravesUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_SNAPSHOT_KEY);
    if (!raw) return null;
    const candidate = JSON.parse(raw) as Partial<CravesUser> | null;
    if (
      !candidate ||
      typeof candidate.id !== "string" ||
      typeof candidate.phoneNumber !== "string" ||
      !Array.isArray(candidate.roles) ||
      candidate.status !== "ACTIVE"
    ) {
      return null;
    }
    return candidate as CravesUser;
  } catch {
    return null;
  }
}

function persistSessionSnapshot(value: CravesUser | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!value) {
      window.sessionStorage.removeItem(SESSION_SNAPSHOT_KEY);
      return;
    }
    window.sessionStorage.setItem(SESSION_SNAPSHOT_KEY, JSON.stringify(value));
  } catch {
    // Storage availability must never decide whether the customer stays signed in.
  }
}

function isAddressSnapshot(value: unknown): value is CravesAddress {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CravesAddress>;
  return (
    typeof candidate.hno === "string" &&
    typeof candidate.city === "string" &&
    typeof candidate.mandal === "string" &&
    typeof candidate.district === "string" &&
    (typeof candidate.lat === "undefined" || typeof candidate.lat === "number") &&
    (typeof candidate.lng === "undefined" || typeof candidate.lng === "number")
  );
}

function readAddressSnapshot(): CravesAddress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ADDRESS_SNAPSHOT_KEY);
    if (!raw) return null;
    const candidate = JSON.parse(raw);
    return session && candidate?.ownerId === session.id && isAddressSnapshot(candidate.address)
      ? candidate.address : null;
  } catch {
    return null;
  }
}

function persistAddressSnapshot(value: CravesAddress | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!value || !session) {
      window.sessionStorage.removeItem(ADDRESS_SNAPSHOT_KEY);
      return;
    }
    window.sessionStorage.setItem(ADDRESS_SNAPSHOT_KEY, JSON.stringify({ ownerId: session.id, address: value }));
  } catch {
    // Storage is only a speed hint; the backend remains authoritative.
  }
}

export function recoverSessionSnapshotForNavigation(): CravesUser | null {
  if (session) return session;
  const cached = readSessionSnapshot();
  if (!cached) return null;
  session = cached;
  notify();
  return session;
}

let session: CravesUser | null = null;
let sessionEmailRevision = -1;
let sessionGeneration = 0;
let sessionEnding = false;
let identityRequestSequence = 0;
let acceptedIdentityRequest = 0;
export type SessionContext = Readonly<{ generation: number; identityId: string | null }>;
export function captureSessionContext(): SessionContext { return { generation: sessionGeneration, identityId: session?.id ?? null }; }
export function isSessionContextCurrent(context: SessionContext): boolean {
  return context.generation === sessionGeneration && context.identityId === (session?.id ?? null);
}
export function getSessionEmailRevision(): number { return sessionEmailRevision; }
export function isSessionReady(): boolean { return !sessionEnding && session?.status === "ACTIVE"; }
function invalidatePendingSessionWork() {
  sessionGeneration += 1;
  roleSynchronization = null;
  identityLookups.clear();
  profileHydrations.clear();
  profileFreshAt = null;
  profileRevision += 1;
}
export function invalidateSession(context: SessionContext): void { if (isSessionContextCurrent(context)) forgetSession(); }
function forgetSession() {
  invalidatePendingSessionWork(); sessionEnding = false; session = null; sessionEmailRevision = -1; selectedLocation = null; persistSessionSnapshot(null); persistAddressSnapshot(null); notify();
}
let selectedLocation: CravesAddress | null = null;
let roleSynchronization: Promise<SessionLookupResult> | null = null;
const sessionRefreshes = new Map<number, Promise<Response | null>>();
type SessionLookupResult = { user: CravesUser | null; profileContext?: SessionContext };
const identityLookups = new Map<string, Promise<SessionLookupResult>>();
const profileHydrations = new Map<number, Promise<CravesUser | null>>();
// Names are display data only. Roles/status still require a fresh Auth lookup.
const PROFILE_FRESHNESS_MS = 30_000;
let profileFreshAt: number | null = null;
let profileRevision = 0;
const listeners = new Set<() => void>();

function refreshSessionForGeneration(generation: number): Promise<Response | null> {
  const existing = sessionRefreshes.get(generation);
  if (existing) return existing;

  const pending = fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  })
    .catch(() => null)
    .finally(() => {
      if (sessionRefreshes.get(generation) === pending) {
        sessionRefreshes.delete(generation);
      }
    });

  sessionRefreshes.set(generation, pending);
  return pending;
}

function fromIdentity(identity: CravesIdentity): CravesUser {
  const digits = identity.phoneNumber.replace(/\D/g, "");
  const displayName = identity.displayName?.trim() || identity.phoneNumber;
  return {
    id: identity.id,
    phone: digits.length > 10 ? digits.slice(-10) : digits,
    phoneNumber: identity.phoneNumber,
    username: displayName,
    firstName: null,
    lastName: null,
    profileComplete: false,
    createdAt: Date.now(),
    email: identity.email ?? undefined,
    emailVerified: identity.emailVerified === true && !!identity.email,
    roles: identity.roles,
    status: identity.status,
  };
}

function notify() {
  for (const listener of listeners) listener();
}

function withCustomerProfile(current: CravesUser, profile: CustomerProfile): CravesUser {
  const username = `${profile.firstName} ${profile.lastName}`.trim();
  return {
    ...current,
    username,
    firstName: profile.firstName,
    lastName: profile.lastName,
    profileComplete: true,
    phone: profile.registeredPhoneNumber.replace(/\D/g, "").slice(-10),
    phoneNumber: profile.registeredPhoneNumber,
  };
}

async function hydrateCustomerProfile(current: CravesUser, context = captureSessionContext()): Promise<CravesUser | null> {
  if (!isSessionContextCurrent(context) || sessionEnding) return session;
  const isCustomer = current.roles.some((role) => role.toUpperCase() === "CUSTOMER");
  if (!isCustomer) return current;
  const age = profileFreshAt === null ? null : Date.now() - profileFreshAt;
  if (age !== null && age >= 0 && age < PROFILE_FRESHNESS_MS) return session;
  const existing = profileHydrations.get(context.generation);
  if (existing) return existing;

  const revision = profileRevision;
  const pending = (async () => {
    const response = await sessionFetch("/api/customer/profile", {
      cache: "no-store",
      credentials: "same-origin",
    }).catch(() => null);
    if (!isSessionContextCurrent(context) || !response?.ok) return session;

    const profile = parseCustomerProfile(await response.json().catch(() => null));
    if (!profile || !isSessionContextCurrent(context) || session?.id !== current.id || revision !== profileRevision) return session;
    session = withCustomerProfile(session, profile);
    profileFreshAt = Date.now();
    persistSessionSnapshot(session);
    notify();
    return session;
  })().finally(() => {
    if (profileHydrations.get(context.generation) === pending) {
      profileHydrations.delete(context.generation);
    }
  });
  profileHydrations.set(context.generation, pending);
  return pending;
}

export function setSessionIdentity(identity: CravesIdentity): CravesUser {
  // An explicit phone sign-in establishes a new session generation even for the same owner.
  invalidatePendingSessionWork();
  sessionEnding = false;
  sessionEmailRevision = -1;
  invalidateSelectedAddress();
  session = fromIdentity(identity);
  persistSessionSnapshot(session);
  notify();
  return session;
}

export function setSessionProfile(profile: CustomerProfile, context = captureSessionContext()): CravesUser | null {
  if (!session || !isSessionContextCurrent(context)) return session;
  session = withCustomerProfile(session, profile);
  profileRevision += 1;
  profileFreshAt = Date.now();
  persistSessionSnapshot(session);
  notify();
  return session;
}

export function getSession(): CravesUser | null {
  return session;
}

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Craves authentication is required.");
    this.name = "AuthenticationRequiredError";
  }
}

/** Accept only the current owner's validated Auth response; a stale profile projection never changes this field. */
export function setSessionEmailVerification(identityId: string, value: EmailVerificationState, context = captureSessionContext()): CravesUser | null {
  const parsed = emailVerificationStateSchema.safeParse(value);
  if (!session || !isSessionContextCurrent(context) || session.id !== identityId || !parsed.success || parsed.data.emailRevision < sessionEmailRevision) return session;
  sessionEmailRevision = parsed.data.emailRevision;
  session = { ...session, email: parsed.data.email ?? undefined, emailVerified: parsed.data.emailVerified };
  persistSessionSnapshot(session);
  notify();
  return session;
}

/** /me and refresh do not carry emailRevision. Preserve the versioned email channel while updating roles/status. */
function applyIdentityLookup(identity: CravesIdentity, context: SessionContext, sequence: number): CravesUser | null {
  if (!isSessionContextCurrent(context) || sequence < acceptedIdentityRequest) return session;
  acceptedIdentityRequest = sequence;
  const previous = session;
  if (previous?.id !== identity.id) {
    invalidateSelectedAddress();
    invalidatePendingSessionWork(); sessionEmailRevision = -1;
  } else if (previous.status !== identity.status) invalidatePendingSessionWork();
  session = fromIdentity(identity);
  if (previous?.id === identity.id) {
    session = { ...session, createdAt: previous.createdAt };
    if (previous.profileComplete) {
      session = {
        ...session,
        username: previous.username,
        firstName: previous.firstName,
        lastName: previous.lastName,
        profileComplete: true,
      };
    }
  }
  if (previous?.id === identity.id && sessionEmailRevision >= 0) {
    session = { ...session, email: previous.email, emailVerified: previous.emailVerified };
  }
  persistSessionSnapshot(session);
  notify();
  return session;
}

type LoadSessionOptions = {
  failFastUnauthenticated?: boolean;
  hydrateCustomerProfile?: "await" | "background" | "skip";
  forceIdentityRefresh?: boolean;
};

async function lookupSessionIdentity(options: LoadSessionOptions, context: SessionContext): Promise<SessionLookupResult> {
  const sequence = ++identityRequestSequence;
  const lookup = async () =>
    fetch("/api/auth/me", {
      cache: "no-store",
      credentials: "same-origin",
      signal: AbortSignal.timeout(15_000),
    });

  let response = await lookup();
  if (!isSessionContextCurrent(context)) return { user: session };

  if (response.status === 401) {
    const failure = await response.clone().json().catch(() => null) as { code?: unknown } | null;
    if (!isSessionContextCurrent(context)) return { user: session };
    if (
      options.failFastUnauthenticated === true &&
      failure?.code === "AUTHENTICATION_REQUIRED" &&
      !session &&
      !readSessionSnapshot()
    ) {
      throw new AuthenticationRequiredError();
    }
    const refreshed = await refreshSessionForGeneration(context.generation);
    if (!isSessionContextCurrent(context)) return { user: session };
    if (refreshed?.ok) response = await lookup();
  }

  if (!isSessionContextCurrent(context) || sequence < acceptedIdentityRequest) {
    return { user: session };
  }

  if (!response.ok) {
    if ((response.status === 401 || response.status === 403) && session) {
      forgetSession();
    }
    return { user: null };
  }

  const identity = parseIdentity(await response.json().catch(() => null));
  if (!isSessionContextCurrent(context) || sequence < acceptedIdentityRequest) return { user: session };
  if (!identity?.id) return { user: null };
  const current = applyIdentityLookup(identity, context, sequence);
  return { user: current, profileContext: captureSessionContext() };
}

export async function loadSession(options: LoadSessionOptions = {}): Promise<CravesUser | null> {
  if (sessionEnding) return null;
  const context = captureSessionContext();
  // Keep fail-fast callers separate: sharing their rejection with a normal
  // lookup would prevent that caller from attempting its refresh-cookie flow.
  const key = `${context.generation}:${context.identityId ?? ""}:${options.failFastUnauthenticated === true}`;
  let pending = options.forceIdentityRefresh ? undefined : identityLookups.get(key);
  if (!pending) {
    pending = lookupSessionIdentity(options, context);
    if (!options.forceIdentityRefresh) {
      const tracked = pending.finally(() => {
        if (identityLookups.get(key) === tracked) identityLookups.delete(key);
      });
      identityLookups.set(key, tracked);
      pending = tracked;
    }
  }
  const result = await pending;
  const current = result.user;
  if (!current || !result.profileContext) return current;
  if (!isSessionContextCurrent(result.profileContext) || sessionEnding) return session;
  if (options.hydrateCustomerProfile === "skip") return current;
  if (options.hydrateCustomerProfile === "background") {
    void hydrateCustomerProfile(current, result.profileContext).catch(() => null);
    return current;
  }
  return hydrateCustomerProfile(current, result.profileContext);
}

export async function synchronizeSessionRoles(options: Pick<LoadSessionOptions, "hydrateCustomerProfile"> = {}): Promise<CravesUser | null> {
  if (sessionEnding) return null;
  let pending = roleSynchronization;
  if (!pending) {
    const context = captureSessionContext();
    const sequence = ++identityRequestSequence;
    const lookup = (async (): Promise<SessionLookupResult> => {
      const response = await refreshSessionForGeneration(context.generation);
      if (!isSessionContextCurrent(context)) return { user: session };
      if (!response?.ok) return { user: null };
      const body = (await response.json().catch(() => null)) as { identity?: CravesIdentity } | null;
      if (!isSessionContextCurrent(context) || sequence < acceptedIdentityRequest) return { user: session };
      if (!body?.identity?.id) return { user: null };
      const identity = parseIdentity(body.identity);
      if (!identity) return { user: null };
      const current = applyIdentityLookup(identity, context, sequence);
      return { user: current, profileContext: captureSessionContext() };
    })();
    const tracked = lookup.finally(() => {
      if (roleSynchronization === tracked) roleSynchronization = null;
    });
    roleSynchronization = tracked;
    pending = tracked;
  }
  // Share the fresh role/token check, rather than any caller's optional display wait.
  const result = await pending;
  const current = result.user;
  if (!current || !result.profileContext) return current;
  if (!isSessionContextCurrent(result.profileContext) || sessionEnding) return session;
  if (options.hydrateCustomerProfile === "skip") return current;
  if (options.hydrateCustomerProfile === "background") {
    void hydrateCustomerProfile(current, result.profileContext).catch(() => null);
    return current;
  }
  return hydrateCustomerProfile(current, result.profileContext);
}

/** A retry belongs only to the session this failed logout restored, never a later sign-in. */
export class LogoutUnconfirmedError extends Error {
  constructor(readonly retryContext: SessionContext | null) {
    super("Sign-out could not be confirmed. You are still signed in. Please try again.");
    this.name = "LogoutUnconfirmedError";
  }
}

export async function clearSession(): Promise<void> {
  // Invalidate pending reads at the start as well as successful completion. Keep the visible account on an unconfirmed logout.
  invalidatePendingSessionWork();
  sessionEnding = true;
  const context = captureSessionContext();
  notify();
  try {
    const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(8_000) });
    const receipt = await response.json().catch(() => null) as { signedOut?: unknown } | null;
    if (!response.ok || receipt?.signedOut !== true || !isSessionContextCurrent(context)) throw new Error("LOGOUT_UNCONFIRMED");
  } catch {
    let retryContext: SessionContext | null = null;
    if (isSessionContextCurrent(context)) {
      sessionEnding = false;
      invalidatePendingSessionWork();
      retryContext = isSessionReady() ? captureSessionContext() : null;
      notify();
    }
    throw new LogoutUnconfirmedError(retryContext);
  }
  forgetSession();
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function saveAddress(address: CravesAddress) {
  selectedLocation = address;
  persistAddressSnapshot(address);
}

export function getAddress(): CravesAddress | null {
  if (selectedLocation) return selectedLocation;
  selectedLocation = readAddressSnapshot();
  return selectedLocation;
}

export function invalidateSelectedAddress(): void {
  selectedLocation = null;
  persistAddressSnapshot(null);
}

function fromCustomerAddress(address: DeliveryReadyAddress): CravesAddress {
  return {
    id: address.id,
    label:
      address.addressLabel,
    hno: address.addressLine1,
    street: address.addressLine2 ?? address.landmark ?? undefined,
    city: address.city,
    mandal: address.areaName,
    district: address.districtName ?? address.city,
    pincode: address.postalCode,
    lat: address.latitude,
    lng: address.longitude,
  };
}

export async function loadSelectedAddress(): Promise<CravesAddress | null> {
  const context = captureSessionContext();
  const response = await sessionFetch("/api/customer/addresses", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("Saved delivery addresses could not be loaded.");
  const addresses = (await response.json().catch(() => null)) as CustomerAddress[] | null;
  if (!isSessionContextCurrent(context)) return null;
  if (!Array.isArray(addresses)) throw new Error("Saved delivery addresses returned an invalid response.");
  const selected = selectDefaultDeliveryAddress(addresses);
  selectedLocation = selected ? fromCustomerAddress(selected) : null;
  persistAddressSnapshot(selectedLocation);
  return selectedLocation;
}
```

### apps/customer-web-next/src/styles/admin-control.css

```css
/* Delivery Intelligence brand system, scoped so customer/chef pages are unchanged. */
.cr-admin {
  --cr-red: #f62e18; --cr-red-dark: #df2412; --cr-ink: #111111;
  --cr-muted: #5f6064; --cr-soft: #fff5f3; --cr-line: #eadfdd;
  --cr-canvas: #f9f7f5; --cr-surface: #ffffff;
  --cr-success: #1d9155; --cr-warning: #ec9524; --cr-info: #286eca;
  color: var(--cr-ink); background: var(--cr-canvas);
  font-family: var(--font-craves-body, Inter), ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px; line-height: 1.55; text-align: left;
}
.cr-admin *, .cr-admin *::before, .cr-admin *::after { box-sizing: border-box; }
.cr-admin[hidden], .cr-admin [hidden] { display: none !important; }
.cr-admin a { text-decoration: none; }
.cr-admin button, .cr-admin input, .cr-admin select, .cr-admin textarea { font: inherit; }
.cr-admin button { cursor: pointer; }
.cr-admin button:disabled { opacity: .52; cursor: not-allowed; }
.cr-admin :is(a, button, input, select, textarea, summary, [tabindex]):focus-visible { outline: 3px solid var(--cr-info); outline-offset: 3px; }
.cr-admin h1, .cr-admin h2, .cr-admin h3, .cr-admin p { margin-top: 0; }
.cr-admin h1 { font-size: clamp(26px, 2.8vw, 36px); font-weight: 760; line-height: 1.2; letter-spacing: -.035em; }
.cr-admin h2 { margin-bottom: 7px; font-size: 21px; font-weight: 740; line-height: 1.3; letter-spacing: -.025em; }
.cr-admin code, .cr-admin kbd { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.cr-admin-shell { display: grid; grid-template-columns: 254px minmax(0, 1fr); min-height: 100vh; }
.cr-sidebar { position: sticky; top: 0; display: flex; flex-direction: column; height: 100vh; height: 100dvh; padding: 25px 15px 15px; border-right: 1px solid var(--cr-line); background: var(--cr-surface); }
.cr-brand { display: flex; align-items: center; gap: 11px; color: var(--cr-ink); padding: 0 9px; }
.cr-brand > span { display: grid; gap: 1px; }
.cr-brand strong { font-size: 24px; font-weight: 800; letter-spacing: -.035em; }
.cr-brand small { font-size: 9px; font-weight: 800; letter-spacing: .12em; color: var(--cr-red-dark); }
.cr-navigation { flex: 1; overflow-y: auto; margin-top: 25px; padding: 0 2px 16px; }
.cr-nav-group { margin-top: 19px; }
.cr-nav-group:first-child { margin-top: 0; }
.cr-nav-label { margin: 0 10px 6px; color: var(--cr-muted); font-weight: 750; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; }
.cr-nav-link { display: flex; align-items: center; gap: 10px; min-height: 42px; border: 1px solid transparent; border-radius: 10px; padding: 9px 10px; margin: 2px 0; color: var(--cr-muted); font-weight: 600; font-size: 12px; transition: background .15s ease, color .15s ease; }
.cr-nav-link > svg { flex-shrink: 0; }
.cr-nav-link > span { flex: 1; }
.cr-nav-link:hover { background: var(--cr-canvas); color: var(--cr-ink); }
.cr-nav-link[aria-current="page"] { background: var(--cr-soft); border-left: 3px solid var(--cr-red); padding-left: 8px; color: var(--cr-ink); font-weight: 750; }
.cr-nav-link[aria-current="page"] > svg { color: var(--cr-red-dark); }
.cr-sidebar-account { border-top: 1px solid var(--cr-line); padding: 15px 6px 0; }
.cr-person { display: flex; gap: 9px; align-items: center; margin-bottom: 11px; }
.cr-person > svg { color: var(--cr-muted); flex: none; }
.cr-person > div { min-width: 0; }
.cr-person strong, .cr-person span { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cr-person strong { font-size: 12px; }
.cr-person span { color: var(--cr-muted); font-size: 11px; }
.cr-signout { width: 100%; margin-top: 10px; justify-content: center; }
.cr-main-area { min-width: 0; display: flex; flex-direction: column; }
.cr-topbar { position: sticky; top: 0; z-index: 20; min-height: 82px; padding: 16px 30px; display: flex; gap: 20px; align-items: center; border-bottom: 1px solid var(--cr-line); background: var(--cr-surface); }
.cr-page-context { display: grid; min-width: 180px; margin-right: auto; }
.cr-page-context > span { color: var(--cr-muted); font-size: 11px; }
.cr-page-context > strong { font-size: 16px; letter-spacing: -.02em; }
.cr-command-trigger { display: flex; align-items: center; gap: 10px; width: min(100%, 440px); min-height: 44px; padding: 10px 13px; border: 1px solid var(--cr-line); border-radius: 11px; background: var(--cr-canvas); color: var(--cr-muted); text-align: left; font-size: 12px !important; }
.cr-command-trigger > svg { flex: none; }
.cr-command-trigger > span { flex: 1; }
.cr-command-trigger kbd { padding: 2px 5px; border: 1px solid var(--cr-line); border-radius: 4px; background: var(--cr-surface); font-size: 10px; white-space: nowrap; }
.cr-content { flex: 1; min-width: 0; width: 100%; max-width: 1650px; margin: 0 auto; padding: 28px 30px; }
.cr-workspace-footer { padding: 18px 30px; border-top: 1px solid var(--cr-line); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; color: var(--cr-muted); font-size: 11px; }
.cr-dashboard { display: grid; gap: 23px; }
.cr-eyebrow { margin-bottom: 8px; color: var(--cr-muted); font-size: 10px; letter-spacing: .12em; text-transform: uppercase; font-weight: 800; }
.cr-muted { color: var(--cr-muted); font-size: 13px; line-height: 1.65; margin-bottom: 0; }
.cr-welcome { display: flex; gap: 28px; align-items: center; justify-content: space-between; padding: 28px 30px; border: 1px solid var(--cr-line); border-left: 4px solid var(--cr-red); border-radius: 18px; background: var(--cr-surface); }
.cr-welcome h1 { margin-bottom: 12px; }
.cr-welcome > div:first-child { max-width: 700px; }
.cr-welcome p:last-child { max-width: 620px; color: var(--cr-muted); font-size: 13px; margin-bottom: 0; }
.cr-welcome .cr-actions { flex-shrink: 0; }
.cr-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.cr-button, .cr-icon-button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 42px; border: 1px solid var(--cr-line); border-radius: 10px; padding: 9px 13px; background: var(--cr-surface); color: var(--cr-ink); font-size: 12px !important; font-weight: 650; transition: background .15s ease, border-color .15s ease; }
.cr-button:hover:not(:disabled), .cr-icon-button:hover:not(:disabled) { background: var(--cr-soft); border-color: var(--cr-red); }
.cr-icon-button { min-width: 42px; padding: 9px; flex: none; }
.cr-primary { background: var(--cr-red-dark); border-color: var(--cr-red-dark); color: var(--cr-surface); }
.cr-primary:hover:not(:disabled) { background: var(--cr-ink); border-color: var(--cr-ink); color: var(--cr-surface); }
.cr-badge { display: inline-flex; align-items: center; gap: 7px; width: fit-content; max-width: 100%; padding: 5px 9px; border: 1px solid var(--cr-line); background: var(--cr-surface); border-radius: 7px; color: var(--cr-ink); font-size: 10px; font-weight: 650; }
.cr-badge > svg { color: var(--cr-success); flex: none; }
.cr-badge[data-tone="warning"] > svg { color: var(--cr-warning); }
.cr-snapshot-line { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; color: var(--cr-muted); font-size: 11px; }
.cr-alert { padding: 15px 18px; border: 1px solid var(--cr-line); border-left: 4px solid var(--cr-warning); border-radius: 10px; background: var(--cr-surface); font-size: 13px; }
.cr-alert p { margin: 5px 0 0; color: var(--cr-muted); }
.cr-panel { min-width: 0; padding: 24px; border: 1px solid var(--cr-line); border-radius: 16px; background: var(--cr-surface); }
.cr-section-heading { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 19px; }
.cr-section-heading > div:first-child { min-width: 0; }
.cr-section-heading > .cr-button { flex-shrink: 0; }
.cr-metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 13px; }
.cr-metric { display: flex; flex-direction: column; gap: 5px; min-width: 0; padding: 18px 20px; background: var(--cr-surface); border: 1px solid var(--cr-line); border-top: 3px solid var(--cr-line); border-radius: 13px; }
.cr-metric-label { color: var(--cr-muted); font-size: 12px; font-weight: 650; }
.cr-metric > strong { font-size: 31px; letter-spacing: -.035em; font-weight: 750; font-variant-numeric: tabular-nums; line-height: 1.35; }
.cr-metric > .cr-muted { font-size: 11px; }
.cr-metric[data-tone="warning"] { border-top-color: var(--cr-warning); }
.cr-metric[data-tone="danger"] { border-top-color: var(--cr-red); }
.cr-metric[data-tone="success"] { border-top-color: var(--cr-success); }
.cr-metric[data-tone="info"] { border-top-color: var(--cr-info); }
.cr-filter-row { display: flex; align-items: end; gap: 12px; flex-wrap: wrap; padding: 14px; background: var(--cr-canvas); border: 1px solid var(--cr-line); border-radius: 11px; margin-bottom: 18px; }
.cr-search-field { display: flex; align-items: center; gap: 9px; min-width: 200px; width: 320px; min-height: 44px; padding: 0 12px; border: 1px solid var(--cr-line); border-radius: 10px; background: var(--cr-surface); }
.cr-search-field svg { color: var(--cr-muted); flex-shrink: 0; }
.cr-search-field input { min-width: 0; width: 100%; border: 0; background: transparent; color: var(--cr-ink); padding: 10px 0; font-size: 12px; }
.cr-filter-row .cr-search-field { flex: 1; }
.cr-search-field:focus-within { outline: 2px solid var(--cr-info); outline-offset: 2px; }
.cr-search-field input:focus-visible { outline: none; }
.cr-select-label { display: inline-flex; flex-direction: column; gap: 4px; color: var(--cr-muted); font-size: 10px; }
.cr-select-label select { min-height: 40px; padding: 7px 28px 7px 7px; border: 1px solid var(--cr-line); border-radius: 8px; background: var(--cr-surface); color: var(--cr-ink); font-size: 12px; }
.cr-table-scroll, .cr-chart-scroll { max-width: 100%; overflow-x: auto; }
.cr-table { border-collapse: collapse; width: 100%; text-align: left; font-size: 12px; }
.cr-table-scroll > .cr-table { min-width: 850px; }
.cr-table th { color: var(--cr-muted); font-size: 10px; text-transform: uppercase; letter-spacing: .055em; font-weight: 750; background: var(--cr-canvas); }
.cr-table th, .cr-table td { padding: 14px 12px; border-bottom: 1px solid var(--cr-line); vertical-align: top; }
.cr-table tbody tr:hover { background: var(--cr-canvas); }
.cr-table td code { font-size: 11px; }
.cr-status { display: inline-flex; align-items: center; gap: 6px; padding: 5px 8px; border: 1px solid var(--cr-line); border-radius: 6px; background: var(--cr-surface); color: var(--cr-ink); white-space: nowrap; font-size: 10px; font-weight: 650; }
.cr-status::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: var(--cr-warning); flex: none; }
.cr-status[data-tone="danger"]::before { background: var(--cr-red); }
.cr-record-details { min-width: 120px; }
.cr-record-details > summary, .cr-chart-data > summary { min-height: 30px; padding: 4px 0; color: var(--cr-ink); font-weight: 650; cursor: pointer; }
.cr-record-details > div { display: grid; gap: 10px; max-width: 300px; padding: 12px 0; }
.cr-record-details code { overflow-wrap: anywhere; }
.cr-pagination { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 17px; color: var(--cr-muted); font-size: 11px; }
.cr-pagination > span:first-child { margin-right: auto; }
.cr-pagination .cr-select-label { flex-direction: row; align-items: center; gap: 8px; }
.cr-empty { display: flex; flex-direction: column; gap: 10px; align-items: center; justify-content: center; min-height: 170px; padding: 25px; text-align: center; color: var(--cr-muted); font-size: 13px; }
.cr-empty strong, .cr-empty h2 { color: var(--cr-ink); }
.cr-empty p { max-width: 560px; margin-bottom: 0; }
.cr-chart-grid { display: grid; grid-template-columns: 1.25fr 1fr; gap: 20px; }
.cr-bar-chart { display: flex; gap: 12px; height: 225px; padding: 15px 5px 0; }
.cr-bar-column { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: end; gap: 7px; min-width: 24px; }
.cr-bar-column strong { font-size: 11px; font-variant-numeric: tabular-nums; }
.cr-bar-column small { color: var(--cr-muted); font-size: 10px; white-space: nowrap; }
.cr-bar-track { height: 150px; display: flex; align-items: end; width: 100%; max-width: 44px; background: var(--cr-canvas); border-radius: 6px 6px 0 0; }
.cr-bar-track > span { display: block; width: 100%; background: var(--cr-red); border-radius: 6px 6px 0 0; }
.cr-chart-data { margin-top: 15px; border-top: 1px solid var(--cr-line); padding-top: 9px; font-size: 12px; }
.cr-stage-list { display: grid; gap: 15px; margin-top: 22px; }
.cr-stage-list > div > div:first-child { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 6px; font-size: 12px; }
.cr-stage-list strong { font-variant-numeric: tabular-nums; }
.cr-stage-track { height: 5px; background: var(--cr-canvas); border-radius: 3px; }
.cr-stage-track > span { display: block; height: 100%; border-radius: 3px; background: var(--cr-red); }
.cr-module-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 13px; }
.cr-module-card { display: flex; flex-direction: column; align-items: start; gap: 10px; border: 1px solid var(--cr-line); border-radius: 12px; padding: 19px; color: var(--cr-ink); transition: border-color .15s ease, background .15s ease; }
.cr-module-card:hover { border-color: var(--cr-red); background: var(--cr-soft); }
.cr-module-card > .cr-eyebrow { margin-bottom: 0; font-size: 9px; }
.cr-module-card > strong { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; font-size: 14px; }
.cr-module-card > strong svg { flex-shrink: 0; color: var(--cr-red-dark); }
.cr-module-card > .cr-muted { font-size: 12px; }
.cr-access-label { margin-top: auto; padding-top: 7px; color: var(--cr-muted); font-size: 10px; }
.cr-footnote { margin: 14px 0 0; color: var(--cr-muted); font-size: 11px; line-height: 1.65; }
.cr-feedback { margin: 0; color: var(--cr-muted); font-size: 12px; }
.cr-feedback:empty { display: none; }
.cr-safety-note { display: flex; align-items: start; gap: 13px; padding: 18px 20px; border: 1px solid var(--cr-line); border-radius: 12px; background: var(--cr-soft); font-size: 12px; }
.cr-safety-note > svg { flex: none; color: var(--cr-ink); }
.cr-safety-note p { margin: 4px 0 0; color: var(--cr-muted); }
.cr-error-text { color: var(--cr-red-dark); font-size: 12px; }
.cr-session-screen { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
.cr-session-card { width: 100%; max-width: 600px; padding: 40px; border: 1px solid var(--cr-line); border-top: 4px solid var(--cr-red); border-radius: 18px; background: var(--cr-surface); }
.cr-session-card > img { margin-bottom: 24px; }
.cr-session-card .cr-actions { margin-top: 24px; }
.cr-dialog { padding: 0; border: 1px solid var(--cr-line); border-radius: 16px; background: var(--cr-surface); color: var(--cr-ink); max-height: 85vh; max-height: 85dvh; margin: auto; box-shadow: 0 24px 80px #11111130; }
.cr-dialog::backdrop { background: #11111170; }
.cr-command-dialog { width: min(660px, calc(100vw - 32px)); }
.cr-command-inner { padding: 22px; }
.cr-dialog-heading { display: flex; align-items: center; justify-content: space-between; gap: 15px; margin-bottom: 17px; }
.cr-dialog-heading h2 { font-size: 19px; margin-bottom: 0; }
.cr-command-inner > .cr-search-field { width: 100%; }
.cr-command-results { display: grid; gap: 3px; margin-top: 15px; max-height: 48vh; overflow-y: auto; }
.cr-command-result { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 10px; border-radius: 8px; color: var(--cr-ink); }
.cr-command-result:hover { background: var(--cr-soft); }
.cr-command-result strong, .cr-command-result small { display: block; }
.cr-command-result strong { font-size: 13px; }
.cr-command-result small { color: var(--cr-muted); font-size: 11px; line-height: 1.6; margin-top: 2px; }
.cr-command-result > svg { flex: none; color: var(--cr-red-dark); }
.cr-menu-dialog { width: min(340px, calc(100vw - 20px)); height: 100vh; height: 100dvh; max-height: 100dvh; margin: 0 auto 0 0; border-radius: 0 14px 14px 0; }
.cr-menu-inner { display: flex; flex-direction: column; padding: 22px 15px; height: 100%; }
.cr-menu-inner .cr-navigation { margin-top: 0; }
.cr-menu-inner .cr-brand { padding: 0; }
.cr-mobile-menu { display: none; }
.cr-mobile-break { display: none; }
.cr-skip { position: fixed; top: 8px; left: 12px; z-index: 100; transform: translateY(-200%); background: var(--cr-surface); color: var(--cr-ink); padding: 12px 20px; border: 2px solid var(--cr-info); border-radius: 8px; }
.cr-skip:focus { transform: translateY(0); }
.cr-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.cr-spin { animation: cr-rotate 1s linear infinite; }
.cr-skeleton { width: min(100%, 450px); height: 12px; border-radius: 6px; background: var(--cr-line); animation: cr-pulse 1.5s ease-in-out infinite; }
@keyframes cr-rotate { to { transform: rotate(360deg); } }
@keyframes cr-pulse { 50% { opacity: .4; } }

/* Auth uses the existing PhoneAuthForm unchanged: OTP, captcha and cookies remain owned there. */
.cr-login { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); padding: 24px; gap: 24px; }
.cr-login-story { display: flex; flex-direction: column; justify-content: space-between; gap: 44px; padding: clamp(30px, 5vw, 75px); border: 1px solid var(--cr-line); border-radius: 22px; background: var(--cr-soft); }
.cr-login-story .cr-brand { padding: 0; }
.cr-login-story .cr-brand strong { font-size: 32px; }
.cr-login-story h2 { font-size: clamp(38px, 4.4vw, 64px); letter-spacing: -.05em; line-height: 1.06; margin: 15px 0 22px; }
.cr-login-story > div > p:last-child { max-width: 480px; color: var(--cr-muted); font-size: 15px; line-height: 1.8; margin-bottom: 0; }
.cr-login-features { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.cr-login-features span { padding: 15px 10px; border-top: 2px solid var(--cr-red); color: var(--cr-ink); font-size: 12px; font-weight: 650; }
.cr-login-quote { font-size: 15px; line-height: 1.8; color: var(--cr-muted); margin-bottom: 0; }
.cr-login-quote strong { color: var(--cr-ink); font-weight: 650; }
.cr-login-form-area { display: flex; flex-direction: column; justify-content: center; max-width: 490px; width: 100%; margin: 0 auto; padding: 30px 12px; }
.cr-login-form-heading { padding: 0 25px; }
.cr-login-form-heading > p { margin-top: 14px; color: var(--cr-muted); font-size: 13px; line-height: 1.7; }
.cr-login-form-area > .cr-footnote { padding: 0 25px; }
.cr-login-auth > section { background: var(--cr-surface); color: var(--cr-ink); border: 1px solid var(--cr-line); border-radius: 16px; box-shadow: none; padding: 26px; }
.cr-login-auth h1 { font-size: 27px; }
.cr-login-auth section > p { color: var(--cr-muted); }
.cr-login-auth input { border: 1px solid var(--cr-line); border-radius: 9px; color: var(--cr-ink); min-height: 46px; }
.cr-login-auth form > button { min-height: 46px; border-radius: 10px; }
.cr-login-auth form > button:not([type="button"]) { background: var(--cr-red-dark); color: var(--cr-surface); }
.cr-login-auth form > button[type="button"] { border-color: var(--cr-line); color: var(--cr-ink); background: var(--cr-surface); }
.cr-login-auth #craves-recaptcha { overflow-x: auto; }

/* Compatibility bridge for existing module views. Match presentation tokens only;
   never re-style error/success tokens or hide security/finance controls. */
.cr-content [class~="bg-[#6930ca]"], .cr-content [class~="bg-[#6930CA]"], .cr-content [class~="bg-[#6d28d9]"], .cr-content [class~="bg-[#7c3aed]"] { background-color: var(--cr-red-dark); }
.cr-content [class~="text-[#6930ca]"], .cr-content [class~="text-[#6930CA]"], .cr-content [class~="text-[#6d28d9]"], .cr-content [class~="text-[#7c3aed]"] { color: var(--cr-red-dark); }
.cr-content [class~="border-[#6930ca]"], .cr-content [class~="border-[#6930CA]"] { border-color: var(--cr-red); }
.cr-content [class~="bg-[#0b1426]"] { background-color: var(--cr-ink); }
.cr-content [class~="bg-[#fff8ec]"], .cr-content [class~="bg-[#FFF8EC]"], .cr-content [class~="bg-[#efe8ff]"] { background-color: var(--cr-soft); }
.cr-content [class~="bg-[#f7f5fb]"], .cr-content [class~="bg-[#f8f6fa]"], .cr-content [class~="bg-[#faf8fc]"] { background-color: var(--cr-canvas); }
.cr-content [class~="text-[#251b35]"] { color: var(--cr-ink); }
.cr-content [class~="text-[#766981]"], .cr-content [class~="text-[#8b7b97]"], .cr-content [class~="text-[#897b94]"], .cr-content [class~="text-[#817487]"], .cr-content [class~="text-[#71677d]"], .cr-content [class~="text-[#62566d]"] { color: var(--cr-muted); }
.cr-content [class~="border-[#ebe5ef]"], .cr-content [class~="border-[#e7dfec]"], .cr-content [class~="border-[#e8e1ee]"], .cr-content [class~="border-[#e9e2ef]"] { border-color: var(--cr-line); }

@media (max-width: 1350px) {
  .cr-welcome { flex-direction: column; align-items: start; }
  .cr-module-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 1050px) {
  .cr-admin-shell { grid-template-columns: minmax(0, 1fr); }
  .cr-sidebar { display: none; }
  .cr-mobile-menu { display: inline-flex; }
  .cr-topbar { gap: 13px; padding: 14px 20px; }
  .cr-content { padding: 22px 20px; }
  .cr-page-context { min-width: 145px; }
  .cr-login { gap: 12px; padding: 14px; }
  .cr-login-story { padding: 35px 25px; }
}
@media (max-width: 750px) {
  .cr-chart-grid { grid-template-columns: minmax(0, 1fr); }
  .cr-section-heading { align-items: start; flex-direction: column; gap: 13px; }
  .cr-section-heading > .cr-search-field { width: 100%; }
  .cr-metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cr-login { grid-template-columns: minmax(0, 1fr); }
  .cr-login-story { padding: 23px; gap: 22px; }
  .cr-login-story h2 { font-size: 37px; }
  .cr-login-story .cr-login-features, .cr-login-quote { display: none; }
  .cr-login-form-area { padding-top: 10px; }
}
@media (max-width: 550px) {
  .cr-topbar { padding: 11px 12px; gap: 8px; min-height: 72px; }
  .cr-page-context { min-width: 0; flex: 1; }
  .cr-page-context > strong { font-size: 13px; }
  .cr-page-context > span { font-size: 10px; }
  .cr-command-trigger { width: 42px; min-width: 42px; padding: 11px; }
  .cr-command-trigger > span, .cr-command-trigger kbd { display: none; }
  .cr-content { padding: 18px 12px; }
  .cr-panel { padding: 17px; }
  .cr-welcome { padding: 21px 18px; gap: 20px; }
  .cr-welcome .cr-actions { width: 100%; }
  .cr-metric { padding: 14px; }
  .cr-metric > strong { font-size: 27px; }
  .cr-module-grid { grid-template-columns: minmax(0, 1fr); }
  .cr-filter-row { padding: 11px; }
  .cr-filter-row > .cr-search-field { min-width: 100%; }
  .cr-pagination { gap: 9px; }
  .cr-pagination > span:first-child { width: 100%; }
  .cr-workspace-footer { padding: 15px; }
  .cr-session-card { padding: 25px; }
  .cr-command-inner { padding: 17px; }
  .cr-login { padding: 10px; }
  .cr-login-form-area { padding-left: 0; padding-right: 0; }
  .cr-login-auth > section { padding: 18px; }
  .cr-login-form-heading { padding: 0 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .cr-admin *, .cr-admin *::before, .cr-admin *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
```

### scripts/release/tests/test_web_performance_release.py

```python
import copy
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch


SPEC = importlib.util.spec_from_file_location("web_performance", Path(__file__).parents[1] / "web_performance_release.py")
performance = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(performance)
release = performance.release
LIVE_SHA = "a" * 40
MAIN_SHA = "b" * 40
SOURCE_SHA = "c" * 40
OLD_IMAGE = release.LOGIN + "/craves/customer-web-next@sha256:" + "a" * 64
NEW_IMAGE = release.LOGIN + "/craves/customer-web-next@sha256:" + "b" * 64


def app(image=OLD_IMAGE, sha=LIVE_SHA):
    return {"identity": {"type": "SystemAssigned"}, "properties": {
        "configuration": {"secrets": [{"name": "binding", "keyVaultUrl": "https://existing.vault.azure.net/secrets/binding"}]},
        "template": {"scale": {"minReplicas": 1, "maxReplicas": 1}, "containers": [{
            "name": "web", "image": image, "env": [
                {"name": "CRAVES_BUILD_SHA", "value": sha},
                {"name": "NEXT_PUBLIC_RAZORPAY_MODE", "value": "production"},
                {"name": "PRIVATE_SETTING", "secretRef": "binding"}]}]}}}


class LocalEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.path = self.root / "evidence.json"
        self.tree = "d" * 40
        self.value = {"schema": 1, "webTree": self.tree, "checks": []}
        for name in sorted(performance.CHECKS):
            log = self.root / (name + ".log")
            log.write_bytes((name + " succeeded\n").encode())
            self.value["checks"].append({"name": name, "exitCode": 0, "logFile": log.name,
                                         "logSha256": performance.sha256(log.read_bytes())})

    def check(self, expected_tree=None):
        self.path.write_text(json.dumps(self.value), encoding="utf-8")
        return performance.local_evidence(self.root, self.path, performance.sha256(self.path.read_bytes()), expected_tree or self.tree)

    def test_exact_web_tree_and_all_saved_logs_are_accepted(self):
        self.assertEqual(self.check()["checks"], sorted(performance.CHECKS))

    def test_different_tree_and_changed_log_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "exact web tree"):
            self.check("e" * 40)
        (self.root / "build.log").write_text("changed", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "log differs"):
            self.check()

    def test_failed_missing_and_duplicate_checks_are_rejected(self):
        original = copy.deepcopy(self.value)
        for kind in ("failed", "missing", "duplicate"):
            self.value = copy.deepcopy(original)
            if kind == "failed":
                self.value["checks"][0]["exitCode"] = 1
            elif kind == "missing":
                self.value["checks"].pop()
            else:
                self.value["checks"][0]["name"] = self.value["checks"][1]["name"]
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                self.check()

    def test_log_path_escape_and_unreviewed_evidence_are_rejected(self):
        self.value["checks"][0]["logFile"] = "../outside.log"
        with self.assertRaisesRegex(ValueError, "escaped"):
            self.check()
        with self.assertRaisesRegex(ValueError, "reviewed hash"):
            performance.local_evidence(self.root, self.path, "0" * 64, self.tree)


class SourceReviewTests(unittest.TestCase):
    def args(self):
        return SimpleNamespace(source=Path("."), sha=SOURCE_SHA, expected_main_sha=MAIN_SHA,
                               expected_live_sha=LIVE_SHA, evidence=Path("evidence.json"), evidence_sha256="e" * 64)

    def commands(self, dirty="", main=MAIN_SHA, remote=MAIN_SHA,
                 changes=performance.APP_PATH + "/src/page.tsx", main_landing_tree="d" * 40):
        def answer(source, *args):
            if args == ("rev-parse", "HEAD"):
                return SOURCE_SHA
            if args[0] == "status":
                return dirty
            if args == ("rev-parse", "origin/main"):
                return main
            if args[0] == "ls-remote":
                return remote + "\trefs/heads/main"
            if args[0] == "merge-base":
                return ""
            if args[0] == "diff":
                return changes
            if args == ("rev-parse", MAIN_SHA + ":" + performance.LANDING_PATH):
                return main_landing_tree
            if args[0] == "rev-parse" and args[1].startswith(SOURCE_SHA):
                return "f" * 40
            return "d" * 40
        return answer

    def test_candidate_on_reviewed_main_with_exact_tree_evidence(self):
        with patch.object(performance, "git", side_effect=self.commands()), patch.object(performance, "local_evidence", return_value={}) as evidence:
            performance.source_guard(self.args())
            self.assertEqual(evidence.call_args.args[-1], "f" * 40)

    def test_dirty_stale_remote_and_backend_changes_fail_before_evidence(self):
        cases = [{"dirty": " M src/page.tsx"}, {"remote": "e" * 40}, {"main": "e" * 40},
                 {"changes": "services/order-service/src/Order.java"}]
        for case in cases:
            with self.subTest(case=case), patch.object(performance, "git", side_effect=self.commands(**case)), patch.object(performance, "local_evidence") as evidence:
                with self.assertRaises(ValueError):
                    performance.source_guard(self.args())
                evidence.assert_not_called()

    def test_landing_authoring_change_with_rebuilt_web_tree_is_allowed(self):
        changes = performance.LANDING_PATH + "/src/App.tsx\n" + performance.APP_PATH + "/public/landing-v20/index.html"
        with patch.object(performance, "git", side_effect=self.commands(changes=changes)), patch.object(performance, "local_evidence", return_value={}) as evidence:
            performance.source_guard(self.args())
            self.assertEqual(evidence.call_args.args[-1], "f" * 40)

    def test_unreconciled_main_landing_authoring_changes_fail_before_evidence(self):
        with patch.object(performance, "git", side_effect=self.commands(main_landing_tree="e" * 40)), patch.object(performance, "local_evidence") as evidence:
            with self.assertRaisesRegex(ValueError, "unreconciled landing"):
                performance.source_guard(self.args())
            evidence.assert_not_called()


class SuccessorSourceReviewTests(unittest.TestCase):
    BASELINE_SHA = "e" * 40
    PRIOR_MAIN_SHA = "6" * 40
    LIVE_TREE = "d" * 40

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "prior.json"
        self.value = {"operation": "deploy", "verified": True, "sourceSha": LIVE_SHA,
                      "image": OLD_IMAGE, "previousSourceSha": self.BASELINE_SHA, "mainSha": self.PRIOR_MAIN_SHA,
                      "localEvidence": {"webTree": self.LIVE_TREE, "checks": sorted(performance.CHECKS)},
                      "protectedApps": {"chef": "1" * 64}}
        self.args = SimpleNamespace(source=Path(self.directory.name), sha=SOURCE_SHA,
            expected_main_sha=MAIN_SHA, expected_live_sha=LIVE_SHA, expected_live_image=OLD_IMAGE,
            evidence=Path("evidence.json"), evidence_sha256="0" * 64,
            prior_release_receipt=self.path, prior_release_receipt_sha256=None)
        self.write_receipt()

    def write_receipt(self):
        self.path.write_text(json.dumps(self.value), encoding="utf-8")
        self.args.prior_release_receipt_sha256 = performance.sha256(self.path.read_bytes())

    def commands(self, wrong_main=None, wrong_prior=None, patch=None, prior_patch=None,
                 main_patch=None, failed_ancestor=None):
        def answer(source, *args):
            if args == ("rev-parse", "HEAD"):
                return SOURCE_SHA
            if args[0] == "status":
                return ""
            if args == ("rev-parse", "origin/main"):
                return MAIN_SHA
            if args[0] == "ls-remote":
                return MAIN_SHA + "\trefs/heads/main"
            if args[0] == "merge-base":
                if args[-2:] == failed_ancestor:
                    raise ValueError("Reviewed source ancestry changed")
                return ""
            if args[0] == "diff":
                if args[2:] == (self.PRIOR_MAIN_SHA, LIVE_SHA):
                    return prior_patch if prior_patch is not None else performance.APP_PATH + "/src/old.tsx"
                if args[2:] == (LIVE_SHA, SOURCE_SHA):
                    return patch if patch is not None else performance.APP_PATH + "/src/new.tsx"
                return main_patch if main_patch is not None else performance.APP_PATH + "/src/old.tsx\n" + performance.APP_PATH + "/src/new.tsx"
            if args[0] == "rev-parse":
                sha, app_path = args[1].split(":")
                if sha == SOURCE_SHA:
                    return "f" * 40
                if sha == LIVE_SHA:
                    return self.LIVE_TREE if app_path == performance.APP_PATH else "7" * 40
                if sha == MAIN_SHA and app_path == wrong_main:
                    return "0" * 40
                if sha == self.PRIOR_MAIN_SHA and app_path == wrong_prior:
                    return "0" * 40
                return "2" * 40 if app_path == performance.APP_PATH else "3" * 40
            self.fail("Unexpected Git invocation")
        return answer

    def review(self, **kwargs):
        with patch.object(performance, "git", side_effect=self.commands(**kwargs)), \
                patch.object(performance, "local_evidence", return_value={"checks": sorted(performance.CHECKS)}):
            return performance.source_guard(self.args)

    def test_explicit_verified_successor_accepts_documented_main_divergence(self):
        proof = self.review()
        self.assertEqual(proof["successor"]["baselineSourceSha"], self.BASELINE_SHA)
        self.assertEqual(proof["successor"]["priorReceiptSha256"], self.args.prior_release_receipt_sha256)
        self.assertEqual(proof["successor"]["liveWebTree"], self.LIVE_TREE)
        self.assertNotEqual(proof["successor"]["mainWebTree"], proof["successor"]["liveWebTree"])
        self.assertNotIn(str(self.path), json.dumps(proof))

    def test_default_guard_does_not_fall_back_to_successor_mode(self):
        self.args.prior_release_receipt = None
        self.args.prior_release_receipt_sha256 = None
        with self.assertRaisesRegex(ValueError, "unreconciled web"):
            self.review()

    def test_missing_hash_or_receipt_and_tampering_are_rejected(self):
        original_hash = self.args.prior_release_receipt_sha256
        self.args.prior_release_receipt_sha256 = None
        with self.assertRaisesRegex(ValueError, "both prior"):
            self.review()
        self.args.prior_release_receipt_sha256 = original_hash
        self.args.prior_release_receipt = None
        with self.assertRaisesRegex(ValueError, "both prior"):
            self.review()
        self.args.prior_release_receipt = self.path
        self.path.write_text(self.path.read_text() + " ", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "reviewed hash"):
            self.review()

    def test_output_receipt_cannot_replace_the_historical_input(self):
        self.args.receipt = self.path.parent / "nested" / ".." / self.path.name
        with self.assertRaisesRegex(ValueError, "must not overwrite"):
            self.review()
        self.args.receipt = self.path.parent / "new-release.json"
        self.assertIn("successor", self.review())

    def test_unverified_wrong_live_image_or_prior_evidence_are_rejected(self):
        original = copy.deepcopy(self.value)
        cases = [("verified", False), ("operation", "inspect"), ("sourceSha", SOURCE_SHA),
                 ("image", NEW_IMAGE), ("previousSourceSha", "short"),
                 ("localEvidence", {"webTree": "0" * 40, "checks": sorted(performance.CHECKS)}),
                 ("localEvidence", {"webTree": self.LIVE_TREE, "checks": ["build"]}),
                 ("protectedApps", {}), ("protectedApps", {"chef": "not-a-fingerprint"})]
        for name, value in cases:
            self.value = copy.deepcopy(original)
            self.value[name] = value
            self.write_receipt()
            with self.subTest(field=name, value=value), self.assertRaises(ValueError):
                self.review()

    def test_main_frontend_changes_and_out_of_scope_successor_or_prior_patch_fail(self):
        for app_path in (performance.APP_PATH, performance.LANDING_PATH):
            with self.subTest(app=app_path), self.assertRaisesRegex(ValueError, "frontend.*baseline"):
                self.review(wrong_main=app_path)
            with self.subTest(prior_app=app_path), self.assertRaisesRegex(ValueError, "frontend.*baseline"):
                self.review(wrong_prior=app_path)
        for parameter in ("patch", "prior_patch", "main_patch"):
            with self.subTest(parameter=parameter), self.assertRaisesRegex(ValueError, "outside.*scope"):
                self.review(**{parameter: "services/order-service/src/Order.java"})

    def test_each_required_ancestry_relationship_is_enforced(self):
        for relationship in ((self.BASELINE_SHA, self.PRIOR_MAIN_SHA), (self.BASELINE_SHA, LIVE_SHA),
                             (self.PRIOR_MAIN_SHA, LIVE_SHA), (self.PRIOR_MAIN_SHA, MAIN_SHA),
                             (MAIN_SHA, SOURCE_SHA), (LIVE_SHA, SOURCE_SHA)):
            with self.subTest(relationship=relationship), self.assertRaisesRegex(ValueError, "ancestry"):
                self.review(failed_ancestor=relationship)

    def test_real_git_history_accepts_successor_but_rejects_candidate_dropping_live_patch(self):
        source = self.args.source
        def command(*args):
            result = subprocess.run(["git", *args], cwd=source, capture_output=True, text=True)
            if result.returncode:
                raise ValueError("Git source ancestry or command failed")
            return result.stdout.strip()
        command("init", "-q")
        command("config", "user.name", "Release guard test")
        command("config", "user.email", "release-guard@example.invalid")
        def commit_file(name, content):
            path = source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
            command("add", name)
            command("commit", "-qm", content)
            return command("rev-parse", "HEAD")
        commit_file(performance.APP_PATH + "/src/page.tsx", "baseline web")
        baseline = commit_file(performance.LANDING_PATH + "/src/App.tsx", "baseline landing")
        main = commit_file("services/orders/source.java", "existing main backend")
        live = commit_file(performance.APP_PATH + "/src/page.tsx", "first deployed improvement")
        candidate = commit_file(performance.APP_PATH + "/src/page.tsx", "second reviewed improvement")
        command("update-ref", "refs/remotes/origin/main", main)
        self.args.sha, self.args.expected_main_sha, self.args.expected_live_sha = candidate, main, live
        self.value.update(sourceSha=live, previousSourceSha=baseline, mainSha=main)
        self.value["localEvidence"]["webTree"] = command("rev-parse", live + ":" + performance.APP_PATH)
        self.write_receipt()
        def real_git(source, *args):
            if args[0] == "ls-remote":
                return main + "\trefs/heads/main"
            return command(*args)
        with patch.object(performance, "git", side_effect=real_git), patch.object(performance, "local_evidence", return_value={}):
            self.assertEqual(performance.source_guard(self.args)["successor"]["baselineSourceSha"], baseline)
            command("checkout", "-q", "--detach", main)
            self.args.sha = commit_file(performance.APP_PATH + "/src/page.tsx", "sibling drops deployed improvement")
            with self.assertRaisesRegex(ValueError, "ancestry"):
                performance.source_guard(self.args)


class WindowsCommandTests(unittest.TestCase):
    def test_azure_cmd_uses_bundled_python_with_argument_boundaries(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cli = root / "wbin" / "az.cmd"
            (root / "python.exe").touch()
            with patch.object(performance.shutil, "which", return_value=str(cli)):
                command = performance.portable_command(("az", "acr", "build", "--build-arg", "PUBLIC=a&b"))
        self.assertEqual(command[1:4], ["-IBm", "azure.cli", "acr"])
        self.assertEqual(command[-1], "PUBLIC=a&b")
        self.assertNotIn("cmd.exe", command)

    def test_missing_cli_fails_without_starting_a_shell(self):
        with patch.object(performance.shutil, "which", return_value=None):
            with self.assertRaisesRegex(ValueError, "unavailable"):
                performance.portable_command(("az", "account", "show"))


class RegistryVerificationTests(unittest.TestCase):
    def payloads(self, label=SOURCE_SHA, architecture="amd64"):
        config = json.dumps({"os": "linux", "architecture": architecture,
                             "config": {"Labels": {"org.opencontainers.image.revision": label},
                                        "Env": ["PRIVATE=never-print-this"]}}, separators=(",", ":")).encode()
        manifest = json.dumps({"schemaVersion": 2, "config": {"digest": "sha256:" + performance.sha256(config),
                                                               "size": len(config)}}, separators=(",", ":")).encode()
        image = release.LOGIN + "/craves/customer-web-next@sha256:" + performance.sha256(manifest)
        return image, manifest, config

    def test_digests_label_platform_and_scoped_pull_without_exposing_env(self):
        image, manifest, config = self.payloads()
        requests = []
        def read(request, limit, allow_blob_redirect=False):
            requests.append(request)
            return [b'{"access_token":"scoped-pull-token"}', manifest, config][len(requests) - 1]
        with patch.object(release, "azure", return_value={"loginServer": release.LOGIN, "accessToken": "private-refresh-token"}), patch.object(performance, "read_bytes", side_effect=read):
            result = performance.verify_registry_image(image, SOURCE_SHA)
        form = performance.urllib.parse.parse_qs(requests[0].data.decode())
        self.assertEqual(form["scope"], ["repository:craves/customer-web-next:pull"])
        self.assertEqual(result["sourceSha"], SOURCE_SHA)
        self.assertNotIn("never-print-this", json.dumps(result))
        self.assertNotIn("token", json.dumps(result))

    def test_wrong_label_platform_and_corrupt_bytes_fail(self):
        for case in ("label", "platform", "digest"):
            image, manifest, config = self.payloads(label=LIVE_SHA if case == "label" else SOURCE_SHA,
                                                    architecture="arm64" if case == "platform" else "amd64")
            if case == "digest":
                config += b" "
            with self.subTest(case=case), patch.object(release, "azure", return_value={"loginServer": release.LOGIN, "accessToken": "refresh"}), patch.object(performance, "read_bytes", side_effect=[b'{"access_token":"pull"}', manifest, config]):
                with self.assertRaises(ValueError):
                    performance.verify_registry_image(image, SOURCE_SHA)

    def test_other_registry_and_mutable_tag_rejected_before_authentication(self):
        for image in ("other.azurecr.io/craves/customer-web-next@sha256:" + "a" * 64,
                      release.LOGIN + "/craves/customer-web-next:latest"):
            with self.subTest(image=image), patch.object(release, "azure") as azure:
                with self.assertRaises(ValueError):
                    performance.verify_registry_image(image, SOURCE_SHA)
                azure.assert_not_called()

    def test_signed_blob_redirect_removes_registry_authorization(self):
        request = performance.urllib.request.Request("https://" + release.LOGIN + "/v2/craves/customer-web-next/blobs/sha256:test",
                                                     headers={"Authorization": "Bearer registry-token"})
        headers = {"Location": "https://registrydata123.blob.core.windows.net/config?sig=private-signed-url"}
        error = performance.urllib.error.HTTPError(request.full_url, 307, "redirect", headers, None)
        opener = Mock()
        opener.open.side_effect = [error, io.BytesIO(b"config")]
        with patch.object(performance.urllib.request, "build_opener", return_value=opener):
            self.assertEqual(performance.read_bytes(request, 20, True), b"config")
        self.assertEqual(opener.open.call_args.args[0].headers, {})

    def test_non_azure_or_insecure_blob_redirect_is_rejected(self):
        for target in ("https://attacker.example/config", "http://registrydata.blob.core.windows.net/config"):
            request = performance.urllib.request.Request("https://" + release.LOGIN + "/v2/craves/customer-web-next/blobs/sha256:test")
            error = performance.urllib.error.HTTPError(request.full_url, 307, "redirect", {"Location": target}, None)
            opener = Mock()
            opener.open.side_effect = error
            with self.subTest(target=target), patch.object(performance.urllib.request, "build_opener", return_value=opener):
                with self.assertRaisesRegex(ValueError, "destination"):
                    performance.read_bytes(request, 20, True)
                self.assertEqual(opener.open.call_count, 1)


class ReleaseSafetyTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.args = SimpleNamespace(source=Path(self.directory.name), sha=SOURCE_SHA,
            expected_main_sha=MAIN_SHA, expected_live_sha=LIVE_SHA, expected_live_image=OLD_IMAGE,
            evidence=Path(self.directory.name) / "evidence.json", evidence_sha256="e" * 64,
            receipt=Path(self.directory.name) / "receipt.json", candidate_image=None, deploy=False)

    def test_default_inspection_never_builds_selects_image_or_contacts_registry_oauth(self):
        with patch.object(performance, "source_guard", return_value={}), patch.object(release, "azure", return_value={"id": release.SUBSCRIPTION, "tenantId": release.inspect.TENANT}) as azure, patch.object(release, "app", return_value=app()), patch.object(release, "ready_web"), patch.object(release, "resolve_image", return_value=OLD_IMAGE), patch.object(performance, "protected_apps", return_value={}), patch.object(performance, "build_image") as build, patch.object(performance, "verify_registry_image") as verify:
            result = performance.execute(self.args)
        self.assertFalse(result["verified"])
        self.assertEqual(azure.call_args_list[0].args, ("account", "show"))
        self.assertEqual(azure.call_count, 1)
        build.assert_not_called()
        verify.assert_not_called()
        self.assertNotIn("PRIVATE_SETTING", self.args.receipt.read_text())

    def test_successor_protected_drift_stops_inspection_before_build_or_update(self):
        proof = {"successor": {"protectedApps": {"chef": "1" * 64}}}
        self.args.deploy = True
        with patch.object(performance, "source_guard", return_value=proof), patch.object(release, "azure", return_value={"id": release.SUBSCRIPTION, "tenantId": release.inspect.TENANT}) as azure, patch.object(release, "app", return_value=app()), patch.object(release, "ready_web"), patch.object(release, "resolve_image", return_value=OLD_IMAGE), patch.object(performance, "protected_apps", return_value={"chef": "2" * 64}), patch.object(performance, "build_image") as build, patch.object(performance, "verify_registry_image") as verify:
            with self.assertRaisesRegex(ValueError, "changed since.*prior deployment"):
                performance.execute(self.args)
        self.assertEqual(azure.call_count, 1)
        build.assert_not_called()
        verify.assert_not_called()

    def test_concurrent_source_image_secret_scale_or_identity_blocks_recovery(self):
        before = app()
        receipt = {"previousImage": OLD_IMAGE, "previousSourceSha": LIVE_SHA}
        for field in ("source", "image", "secret", "scale", "identity"):
            current = app(NEW_IMAGE, SOURCE_SHA)
            if field == "source":
                current["properties"]["template"]["containers"][0]["env"][0]["value"] = "d" * 40
            elif field == "image":
                current["properties"]["template"]["containers"][0]["image"] = "somebody-elses-release"
            elif field == "secret":
                current["properties"]["template"]["containers"][0]["env"][2]["secretRef"] = "changed-binding"
            elif field == "scale":
                current["properties"]["template"]["scale"]["maxReplicas"] = 2
            else:
                current["identity"]["type"] = "None"
            with self.subTest(field=field), patch.object(release, "app", return_value=current), patch.object(release, "azure") as azure:
                with self.assertRaises(ValueError):
                    performance.recover(before, NEW_IMAGE, SOURCE_SHA, receipt, self.args.receipt)
                azure.assert_not_called()

    def test_protected_app_image_and_traffic_drift_changes_fingerprint(self):
        backend = app()
        backend["name"] = release.CHEF
        backend["properties"]["configuration"]["ingress"] = {"traffic": [{"latestRevision": True, "weight": 100}]}
        web = app()
        web["name"] = release.WEB
        with patch.object(release, "azure", return_value=[web, backend]):
            baseline = performance.protected_apps()
        self.assertEqual(set(baseline), {release.CHEF})
        for kind in ("image", "traffic"):
            changed = copy.deepcopy(backend)
            if kind == "image":
                changed["properties"]["template"]["containers"][0]["image"] = NEW_IMAGE
            else:
                changed["properties"]["configuration"]["ingress"] = {"traffic": [{"revisionName": "other", "weight": 100}]}
            self.assertEqual(release.runtime.stable(backend), release.runtime.stable(changed))
            with self.subTest(kind=kind), patch.object(release, "azure", return_value=[web, changed]):
                self.assertNotEqual(baseline, performance.protected_apps())

    def test_automatic_latest_traffic_is_preserved(self):
        before = app()
        before["properties"]["configuration"]["ingress"] = {"traffic": [{"latestRevision": True, "weight": 100}]}
        current = app(NEW_IMAGE, SOURCE_SHA)
        for selector in ([], [{"latestRevision": True, "weight": 100}]):
            current["properties"]["configuration"]["ingress"] = {"traffic": selector}
            performance.web_guard(before, current, NEW_IMAGE, SOURCE_SHA)

    def test_protected_drift_before_image_selection_prevents_runtime_update(self):
        self.args.deploy = True
        before = app()
        with patch.object(performance, "source_guard", return_value={}), patch.object(release, "azure", return_value={"id": release.SUBSCRIPTION, "tenantId": release.inspect.TENANT}) as azure, patch.object(release, "app", return_value=before), patch.object(release, "ready_web"), patch.object(release, "resolve_image", return_value=OLD_IMAGE), patch.object(performance, "protected_apps", side_effect=[{"chef": "before"}, {"chef": "changed"}]), patch.object(performance, "verify_registry_image"), patch.object(performance, "build_image", return_value=NEW_IMAGE):
            with self.assertRaisesRegex(ValueError, "Another app changed"):
                performance.execute(self.args)
        self.assertEqual(azure.call_args_list[0].args, ("account", "show"))
        self.assertEqual(azure.call_count, 1)

    def test_protected_drift_during_release_recovers_only_web_without_waiting(self):
        self.args.deploy = True
        before = app()
        candidate = app(NEW_IMAGE, SOURCE_SHA)
        with patch.object(performance, "source_guard", return_value={}), patch.object(release, "azure", return_value={"id": release.SUBSCRIPTION, "tenantId": release.inspect.TENANT}) as azure, patch.object(release, "app", side_effect=[before, before, before, candidate, candidate, before]), patch.object(release, "ready_web"), patch.object(release, "resolve_image", return_value=OLD_IMAGE), patch.object(performance, "protected_apps", side_effect=[{"chef": "before"}, {"chef": "before"}, {"chef": "changed"}]), patch.object(performance, "verify_registry_image"), patch.object(performance, "build_image", return_value=NEW_IMAGE), patch.object(release, "public_status"), patch.object(performance.time, "sleep") as sleep:
            with self.assertRaisesRegex(ValueError, "previous web image and source were restored"):
                performance.execute(self.args)
        sleep.assert_not_called()
        self.assertEqual(azure.call_count, 3)
        for call in azure.call_args_list[1:]:
            self.assertEqual(call.args[:7], ("containerapp", "update", "-g", release.RG, "-n", release.WEB, "--image"))
        self.assertEqual(azure.call_args.args[7], OLD_IMAGE)

    def test_concurrent_traffic_pin_or_split_blocks_recovery_before_mutation(self):
        before = app()
        before["properties"]["configuration"]["ingress"] = {"traffic": [{"latestRevision": True, "weight": 100}]}
        receipt = {"previousImage": OLD_IMAGE, "previousSourceSha": LIVE_SHA}
        for selector in ([{"revisionName": "pinned", "weight": 100}],
                         [{"latestRevision": True, "weight": 90}, {"revisionName": "old", "weight": 10}]):
            current = app(NEW_IMAGE, SOURCE_SHA)
            current["properties"]["configuration"]["ingress"] = {"traffic": selector}
            with self.subTest(selector=selector), patch.object(release, "app", return_value=current), patch.object(release, "azure") as azure:
                with self.assertRaisesRegex(ValueError, "traffic no longer"):
                    performance.recover(before, NEW_IMAGE, SOURCE_SHA, receipt, self.args.receipt)
                azure.assert_not_called()

    def test_unchanged_old_runtime_is_verified_without_redundant_rollback(self):
        receipt = {"previousImage": OLD_IMAGE, "previousSourceSha": LIVE_SHA}
        with patch.object(release, "app", return_value=app()), patch.object(release, "ready_web"), patch.object(release, "public_status"), patch.object(release, "azure") as azure:
            performance.recover(app(), NEW_IMAGE, SOURCE_SHA, receipt, self.args.receipt)
        azure.assert_not_called()
        self.assertTrue(receipt["recoveryVerified"])
        self.assertFalse(receipt["recoveryRequired"])

    def test_failed_candidate_recovery_changes_only_image_and_build_sha(self):
        receipt = {"previousImage": OLD_IMAGE, "previousSourceSha": LIVE_SHA}
        with patch.object(release, "app", side_effect=[app(NEW_IMAGE, SOURCE_SHA), app()]), patch.object(release, "ready_web"), patch.object(release, "public_status"), patch.object(release, "azure") as azure:
            performance.recover(app(), NEW_IMAGE, SOURCE_SHA, receipt, self.args.receipt)
        self.assertEqual(azure.call_args.args, ("containerapp", "update", "-g", release.RG, "-n", release.WEB,
            "--image", OLD_IMAGE, "--set-env-vars", "CRAVES_BUILD_SHA=" + LIVE_SHA, "--no-wait"))
        self.assertTrue(receipt["recoveryVerified"])

    def test_successful_deploy_preserves_all_runtime_settings(self):
        self.args.deploy = True
        before = app()
        with patch.object(performance, "source_guard", return_value={}), patch.object(release, "azure", return_value={"id": release.SUBSCRIPTION, "tenantId": release.inspect.TENANT}) as azure, patch.object(release, "app", side_effect=[before, before, before, app(NEW_IMAGE, SOURCE_SHA)]), patch.object(release, "ready_web", return_value="reviewed-revision"), patch.object(release, "resolve_image", return_value=OLD_IMAGE), patch.object(performance, "protected_apps", return_value={}), patch.object(performance, "verify_registry_image"), patch.object(performance, "build_image", return_value=NEW_IMAGE), patch.object(release, "public_status", return_value={"sourceVerified": True}):
            result = performance.execute(self.args)
        self.assertTrue(result["verified"])
        self.assertEqual(azure.call_args.args, ("containerapp", "update", "-g", release.RG, "-n", release.WEB,
            "--image", NEW_IMAGE, "--set-env-vars", "CRAVES_BUILD_SHA=" + SOURCE_SHA, "--no-wait"))


if __name__ == "__main__":
    unittest.main()
```

### scripts/release/web_performance_release.py

```python
"""Existing customer-web performance release; inspection is the default.

Only the web image and CRAVES_BUILD_SHA may change. The exact web tree must have
saved successful lint/type/test/build evidence. A clean Git archive goes to the
existing ACR; no Docker installation, infrastructure, backend or database change.
Runtime values and short-lived registry credentials never enter the receipt.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil
import tarfile
import tempfile
import time
import urllib.parse
import urllib.request
import urllib.error
import uuid


TOOLS = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("performance_existing_release", TOOLS / "active_address_release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
require = release.require
APP_PATH = "apps/customer-web-next"
LANDING_PATH = "apps/landing-v20"
REPO = "craves/customer-web-next"
SHA = re.compile(r"[0-9a-f]{40}")
DIGEST = re.compile(r"sha256:[0-9a-f]{64}")
CHECKS = {"lint", "typecheck", "test", "build"}
ALLOWED = (APP_PATH + "/", LANDING_PATH + "/", "docs/performance/")
EXACT_FILES = {
    "scripts/release/web_performance_release.py",
    "scripts/release/tests/test_web_performance_release.py",
}
ORIGINAL_RUN = release.run


def portable_command(args):
    command = list(args)
    executable = shutil.which(command[0])
    require(bool(executable), "Required command is unavailable: " + command[0])
    if command[0] == "az" and executable.lower().endswith(".cmd"):
        # Windows CreateProcess does not find az.cmd as `az`. Invoke the CLI's
        # own bundled Python directly; no shell command string or interpolation.
        python = Path(executable).parent.parent / "python.exe"
        require(python.is_file(), "The installed Azure CLI Python runtime is unavailable")
        return [str(python), "-IBm", "azure.cli", *command[1:]]
    command[0] = executable
    return command


def portable_run(*args, cwd=None, env=None):
    return ORIGINAL_RUN(*portable_command(args), cwd=cwd, env=env)


# Existing guards resolve images/read live state through this same adapter.
release.run = portable_run


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def git(source, *args):
    return release.run("git", *args, cwd=source)


def local_evidence(source, path, expected_hash, web_tree):
    raw = path.read_bytes()
    require(re.fullmatch(r"[0-9a-f]{64}", expected_hash or "") and sha256(raw) == expected_hash,
            "Local evidence file differs from the reviewed hash")
    value = json.loads(raw)
    require(value.get("schema") == 1 and value.get("webTree") == web_tree,
            "Local checks did not run against this exact web tree")
    rows = value.get("checks", [])
    require(isinstance(rows, list) and len(rows) == len(CHECKS)
            and {row.get("name") for row in rows} == CHECKS,
            "All four distinct web checks are required")
    for row in rows:
        require(type(row.get("exitCode")) is int and row["exitCode"] == 0, "A required web check failed")
        log_name = row.get("logFile")
        require(isinstance(log_name, str) and log_name and not Path(log_name).is_absolute(),
                "Check logs must be relative to the evidence directory")
        log = (path.parent / log_name).resolve()
        require(log.is_relative_to(path.parent.resolve()), "Check log escaped the evidence directory")
        require(log.is_file() and re.fullmatch(r"[0-9a-f]{64}", row.get("logSha256", ""))
                and sha256(log.read_bytes()) == row["logSha256"], "Check log differs from its recorded hash")
    return {"webTree": web_tree, "evidenceSha256": expected_hash, "checks": sorted(CHECKS)}


def source_guard(args):
    require(SHA.fullmatch(args.sha or "") and SHA.fullmatch(args.expected_main_sha or "")
            and SHA.fullmatch(args.expected_live_sha or ""), "Exact source, main and live SHAs are required")
    require(git(args.source, "rev-parse", "HEAD") == args.sha, "Release checkout differs from the reviewed SHA")
    require(not git(args.source, "status", "--porcelain", "--untracked-files=no"), "Tracked release source changed")
    require(git(args.source, "rev-parse", "origin/main") == args.expected_main_sha,
            "Fetch and review the exact current origin/main before release")
    remote = git(args.source, "ls-remote", "https://github.com/" + release.evidence.REPO + ".git", "refs/heads/main")
    require(remote.split() == [args.expected_main_sha, "refs/heads/main"], "GitHub main changed since review")
    git(args.source, "merge-base", "--is-ancestor", args.expected_main_sha, args.sha)
    main_tree = git(args.source, "rev-parse", args.expected_main_sha + ":" + APP_PATH)
    live_tree = git(args.source, "rev-parse", args.expected_live_sha + ":" + APP_PATH)
    main_landing_tree = git(args.source, "rev-parse", args.expected_main_sha + ":" + LANDING_PATH)
    live_landing_tree = git(args.source, "rev-parse", args.expected_live_sha + ":" + LANDING_PATH)
    successor = successor_review(args, live_tree)
    if successor is None:
        require(main_tree == live_tree, "Main contains unreconciled web changes since the live release")
        require(main_landing_tree == live_landing_tree,
                "Main contains unreconciled landing authoring changes since the live release")
    else:
        baseline = successor["baselineSourceSha"]
        baseline_tree = git(args.source, "rev-parse", baseline + ":" + APP_PATH)
        baseline_landing_tree = git(args.source, "rev-parse", baseline + ":" + LANDING_PATH)
        require(main_tree == baseline_tree and main_landing_tree == baseline_landing_tree,
                "Main frontend changed from the verified prior release baseline")
        git(args.source, "merge-base", "--is-ancestor", args.expected_live_sha, args.sha)
        patch = git(args.source, "diff", "--name-only", args.expected_live_sha, args.sha).splitlines()
        require(all(name in EXACT_FILES or name.startswith(ALLOWED) for name in patch),
                "Successor patch changes files outside the web performance scope")
        successor.update(mainWebTree=main_tree, mainLandingTree=main_landing_tree,
                         liveWebTree=live_tree, liveLandingTree=live_landing_tree)
    changes = git(args.source, "diff", "--name-only", args.expected_main_sha, args.sha).splitlines()
    require(all(name in EXACT_FILES or name.startswith(ALLOWED) for name in changes),
            "Candidate changes files outside the web performance scope")
    tree = git(args.source, "rev-parse", args.sha + ":" + APP_PATH)
    require(tree != live_tree, "Candidate contains no web performance changes")
    proof = local_evidence(args.source, args.evidence, args.evidence_sha256, tree)
    if successor is not None:
        proof["successor"] = successor
    return proof


def successor_review(args, live_tree):
    path = getattr(args, "prior_release_receipt", None)
    expected_hash = getattr(args, "prior_release_receipt_sha256", None)
    require(bool(path) == bool(expected_hash), "Successor mode needs both prior receipt and its reviewed hash")
    if path is None:
        return None
    output = getattr(args, "receipt", None)
    require(output is None or (path.resolve() != output.resolve()
            and (not output.exists() or not path.samefile(output))),
            "Successor receipt must not overwrite the verified prior receipt")
    raw = path.read_bytes()
    require(re.fullmatch(r"[0-9a-f]{64}", expected_hash or "") and sha256(raw) == expected_hash,
            "Prior release receipt differs from its reviewed hash")
    value = json.loads(raw)
    require(isinstance(value, dict) and value.get("operation") == "deploy" and value.get("verified") is True,
            "Successor mode requires a verified prior deployment receipt")
    require(value.get("sourceSha") == args.expected_live_sha and value.get("image") == args.expected_live_image,
            "Prior deployment receipt does not match the expected live source and image")
    image_reference(value["image"])
    baseline, prior_main = value.get("previousSourceSha"), value.get("mainSha")
    require(isinstance(baseline, str) and SHA.fullmatch(baseline)
            and isinstance(prior_main, str) and SHA.fullmatch(prior_main),
            "Prior receipt must identify exact historical source and main SHAs")
    prior_proof = value.get("localEvidence", {})
    require(isinstance(prior_proof, dict) and prior_proof.get("webTree") == live_tree
            and prior_proof.get("checks") == sorted(CHECKS),
            "Prior receipt did not verify the exact deployed web tree")
    protected = value.get("protectedApps")
    require(isinstance(protected, dict) and bool(protected)
            and all(isinstance(name, str) and isinstance(fingerprint, str)
                    and re.fullmatch(r"[0-9a-f]{64}", fingerprint)
                    for name, fingerprint in protected.items()),
            "Prior receipt has no valid protected app fingerprints")
    for ancestor, descendant in ((baseline, prior_main), (baseline, args.expected_live_sha),
                                 (prior_main, args.expected_live_sha), (prior_main, args.expected_main_sha)):
        git(args.source, "merge-base", "--is-ancestor", ancestor, descendant)
    for app_path in (APP_PATH, LANDING_PATH):
        require(git(args.source, "rev-parse", prior_main + ":" + app_path)
                == git(args.source, "rev-parse", baseline + ":" + app_path),
                "Prior receipt main frontend differs from its documented baseline")
    prior_changes = git(args.source, "diff", "--name-only", prior_main, args.expected_live_sha).splitlines()
    require(all(name in EXACT_FILES or name.startswith(ALLOWED) for name in prior_changes),
            "Prior deployment source chain changes files outside the web performance scope")
    return {"priorReceiptSha256": expected_hash, "priorSourceSha": args.expected_live_sha,
            "priorImage": args.expected_live_image, "priorMainSha": prior_main,
            "baselineSourceSha": baseline, "protectedApps": protected}


def image_reference(image):
    prefix = release.LOGIN + "/" + REPO + "@"
    require(isinstance(image, str) and image.startswith(prefix) and DIGEST.fullmatch(image[len(prefix):]),
            "Web image must be an immutable digest in the existing web repository")
    return image[len(prefix):]


def read_bytes(request, limit, allow_blob_redirect=False):
    # Registry configuration includes runtime values. Return it only in memory;
    # errors are reported by category, never response bodies or token-bearing URLs.
    opener = urllib.request.build_opener(release.evidence.NoRedirect())
    try:
        response = opener.open(request, timeout=30)
    except urllib.error.HTTPError as error:
        try:
            require(allow_blob_redirect and error.code == 307, "Registry metadata request failed")
            target = error.headers.get("Location", "")
            parsed = urllib.parse.urlsplit(target)
            require(parsed.scheme == "https" and not parsed.username and not parsed.password
                    and parsed.port in (None, 443) and not parsed.fragment
                    and (bool(re.fullmatch(r"[a-z0-9]+\.blob\.core\.windows\.net", parsed.hostname or ""))
                         or bool(re.fullmatch(re.escape(release.ACR) + r"\.[a-z0-9-]+\.data\.azurecr\.io", parsed.hostname or ""))),
                    "Registry blob redirect has an unexpected destination")
        finally:
            error.close()
        # The authenticated registry provides a short-lived signed blob URL.
        # Never forward the scoped registry Authorization header to storage,
        # and never persist or report that signed URL. Reject further redirects.
        response = opener.open(urllib.request.Request(target), timeout=30)
    with response:
        data = response.read(limit + 1)
        require(len(data) <= limit, "Registry metadata exceeds its bound")
        return data


def verify_registry_image(image, source_sha):
    digest = image_reference(image)
    auth = release.azure("acr", "login", "-n", release.ACR, "--expose-token")
    require(auth.get("loginServer") == release.LOGIN and bool(auth.get("accessToken")), "Registry authentication unavailable")
    form = urllib.parse.urlencode({"grant_type": "refresh_token", "service": release.LOGIN,
                                  "scope": "repository:" + REPO + ":pull", "refresh_token": auth["accessToken"]}).encode()
    token_request = urllib.request.Request("https://" + release.LOGIN + "/oauth2/token", data=form,
                                          headers={"Content-Type": "application/x-www-form-urlencoded"})
    token = json.loads(read_bytes(token_request, 64 * 1024)).get("access_token")
    require(isinstance(token, str) and bool(token), "Scoped registry pull authentication unavailable")
    headers = {"Authorization": "Bearer " + token,
               "Accept": "application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json"}
    base = "https://" + release.LOGIN + "/v2/" + REPO
    manifest_bytes = read_bytes(urllib.request.Request(base + "/manifests/" + digest, headers=headers), 128 * 1024)
    require("sha256:" + sha256(manifest_bytes) == digest, "Registry manifest bytes differ from the selected digest")
    manifest = json.loads(manifest_bytes)
    config = manifest.get("config", {})
    require(manifest.get("schemaVersion") == 2 and DIGEST.fullmatch(config.get("digest", "")),
            "Expected a single reviewed Linux image manifest")
    config_bytes = read_bytes(urllib.request.Request(base + "/blobs/" + config["digest"], headers=headers), 128 * 1024, True)
    require("sha256:" + sha256(config_bytes) == config["digest"] and len(config_bytes) == config.get("size"),
            "Registry image configuration digest or length differs")
    value = json.loads(config_bytes)
    require(value.get("os") == "linux" and value.get("architecture") == "amd64", "Unexpected web image platform")
    require(value.get("config", {}).get("Labels", {}).get("org.opencontainers.image.revision") == source_sha,
            "Image revision label differs from the reviewed source")
    return {"image": image, "configDigest": config["digest"], "sourceSha": source_sha, "platform": "linux/amd64"}


def public_build_values(before):
    environment = release.environment(before)
    result = {}
    for name in release.FIREBASE:
        entry = environment.get(name, {})
        require(bool(entry.get("value")) and not entry.get("secretRef") and not entry["value"].startswith("$("),
                "Existing public Firebase build setting unavailable: " + name)
        result[name] = entry["value"]
    for name in ("NEXT_PUBLIC_RAZORPAY_MODE", "NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK", "NEXT_PUBLIC_SYNCFUSION_LICENSE_KEY"):
        entry = environment.get(name, {})
        require(not entry.get("secretRef"), "Unexpected public build secret binding: " + name)
        if entry.get("value"):
            result[name] = entry["value"]
    require(result.get("NEXT_PUBLIC_RAZORPAY_MODE") == "production", "Existing payment mode must remain production")
    require(result.get("NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK") in ("true", "false"),
            "Existing catalog fallback build setting must be known and preserved")
    return result


def build_image(args, before):
    if args.candidate_image:
        verify_registry_image(args.candidate_image, args.sha)
        return args.candidate_image
    tag = "perf-" + args.sha + "-" + uuid.uuid4().hex[:12]
    with tempfile.TemporaryDirectory(prefix="craves-web-reviewed-") as directory:
        context = Path(directory)
        archive = context / "reviewed.tar"
        git(args.source, "archive", "--format=tar", "--output=" + str(archive), args.sha, APP_PATH)
        with tarfile.open(archive) as stream:
            stream.extractall(context, filter="data")
        archive.unlink()
        command = ["acr", "build", "-r", release.ACR, "-t", REPO + ":" + tag,
                   "--platform", "linux/amd64", "--build-arg", "CRAVES_SOURCE_SHA=" + args.sha, "--no-logs"]
        for name, value in public_build_values(before).items():
            command.extend(["--build-arg", name + "=" + value])
        command.append(str(context / APP_PATH))
        print("Building the reviewed web archive in the existing registry.", flush=True)
        release.run("az", *command, "--only-show-errors", "-o", "none")
    image = release.resolve_image(release.LOGIN + "/" + REPO + ":" + tag)
    verify_registry_image(image, args.sha)
    return image


def protected_fingerprint(app):
    props = app["properties"]
    value = {
        "runtime": release.runtime.stable(app),
        "images": [{"name": container.get("name"), "image": container.get("image")}
                   for container in props["template"]["containers"]],
        "traffic": props["configuration"].get("ingress", {}).get("traffic"),
    }
    return sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode())


def protected_apps():
    return {app["name"]: protected_fingerprint(app)
            for app in release.azure("containerapp", "list", "-g", release.RG) if app["name"] != release.WEB}


def web_guard(before, current, image=None, sha=None):
    # The live app follows its latest revision automatically. Explicit traffic
    # pins or splits are concurrent changes, including during failed rollouts.
    # Existing runtime guards intentionally omit this revision-sensitive field.
    for app in (before, current):
        traffic = app["properties"]["configuration"].get("ingress", {}).get("traffic", [])
        require(traffic == [] or (isinstance(traffic, list) and len(traffic) == 1
                and traffic[0] == {"latestRevision": True, "weight": 100}),
                "Web traffic no longer follows the automatic latest revision; stop")
    release.web_guard(before, current, image, sha)


def save_receipt(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def recover(before, image, sha, receipt, output):
    current = release.app(release.WEB)
    # A concurrent image, source, secret, payment, scaling or identity change
    # blocks recovery. Never replace somebody else's newer deployment.
    previous_image = receipt["previousImage"]
    previous_sha = receipt["previousSourceSha"]
    if release.build_sha(current) == previous_sha:
        web_guard(before, current, previous_image, previous_sha)
        release.ready_web(current)
        release.public_status(previous_sha)
        receipt.update(recoveryRequired=False, recoveryVerified=True)
        save_receipt(output, receipt)
        return
    web_guard(before, current, image, sha)
    receipt["recoveryRequired"] = True
    release.azure("containerapp", "update", "-g", release.RG, "-n", release.WEB,
                  "--image", previous_image, "--set-env-vars", "CRAVES_BUILD_SHA=" + previous_sha, "--no-wait")
    for _ in range(120):
        current = release.app(release.WEB)
        if release.build_sha(current) == sha:
            web_guard(before, current, image, sha)
        else:
            web_guard(before, current, previous_image, previous_sha)
            try:
                release.ready_web(current)
                release.public_status(previous_sha)
                receipt["recoveryVerified"] = True
                save_receipt(output, receipt)
                return
            except ValueError:
                pass
        time.sleep(10)
    raise ValueError("Recovery was requested but could not be verified")


def execute(args):
    args.source = args.source.resolve()
    proof = source_guard(args)
    image_reference(args.expected_live_image)
    account = release.azure("account", "show")
    require(account.get("id") == release.SUBSCRIPTION and account.get("tenantId") == release.inspect.TENANT,
            "Wrong Azure account")
    before = release.app(release.WEB)
    web_guard(before, before)
    release.ready_web(before)
    require(release.build_sha(before) == args.expected_live_sha
            and before["properties"]["template"]["containers"][0]["image"] == args.expected_live_image,
            "Live web changed since inspection")
    old_image = release.resolve_image(args.expected_live_image)
    require(old_image == args.expected_live_image, "Previous web image digest changed")
    protected = protected_apps()
    if "successor" in proof:
        require(protected == proof["successor"]["protectedApps"],
                "Protected apps changed since the reviewed prior deployment")
    receipt = {"operation": "deploy" if args.deploy else "inspect", "sourceSha": args.sha,
               "mainSha": args.expected_main_sha, "localEvidence": proof,
               "previousImage": old_image, "previousSourceSha": args.expected_live_sha,
               "runtimeFingerprint": release.stable_web(before), "protectedApps": protected,
               "verified": False, "recoveryVerified": False}
    if not args.deploy:
        save_receipt(args.receipt, receipt)
        print(json.dumps(receipt), flush=True)
        return receipt
    verify_registry_image(old_image, args.expected_live_sha)
    image = build_image(args, before)
    source_guard(args)
    web_guard(before, release.app(release.WEB))
    release.ready_web(release.app(release.WEB))
    require(protected == protected_apps(), "Another app changed during preparation; stop")
    receipt["image"] = image
    save_receipt(args.receipt, receipt)
    print("Selecting only the reviewed web image and its source SHA.", flush=True)
    try:
        release.azure("containerapp", "update", "-g", release.RG, "-n", release.WEB,
                      "--image", image, "--set-env-vars", "CRAVES_BUILD_SHA=" + args.sha, "--no-wait")
        for _ in range(120):
            current = release.app(release.WEB)
            require(protected == protected_apps(), "A protected app changed during release")
            if release.build_sha(current) == args.expected_live_sha:
                web_guard(before, current)
            else:
                web_guard(before, current, image, args.sha)
                try:
                    revision = release.ready_web(current)
                    public = release.public_status(args.sha)
                except ValueError:
                    pass
                else:
                    require(protected == protected_apps(), "A protected app changed during release")
                    receipt.update(verified=True, revision=revision, public=public)
                    save_receipt(args.receipt, receipt)
                    print(json.dumps(receipt), flush=True)
                    return receipt
            print("Waiting for the reviewed web revision and public source readback.", flush=True)
            time.sleep(10)
        raise ValueError("Web performance release could not be verified within twenty minutes")
    except Exception:
        recover(before, image, args.sha, receipt, args.receipt)
        raise ValueError("Release failed; previous web image and source were restored and verified")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--expected-main-sha", required=True)
    parser.add_argument("--expected-live-sha", required=True)
    parser.add_argument("--expected-live-image", required=True)
    parser.add_argument("--evidence", required=True, type=Path)
    parser.add_argument("--evidence-sha256", required=True)
    parser.add_argument("--receipt", required=True, type=Path)
    parser.add_argument("--candidate-image", help="Reuse a previously built immutable image after independent verification")
    parser.add_argument("--prior-release-receipt", type=Path,
                        help="Explicit successor mode: exact verified earlier deployment receipt")
    parser.add_argument("--prior-release-receipt-sha256",
                        help="Independently reviewed SHA256 of the successor mode receipt")
    parser.add_argument("--deploy", action="store_true", help="Explicitly update only the existing customer web")
    try:
        execute(parser.parse_args())
    except Exception as error:
        raise SystemExit("Web performance release stopped: " + (str(error) if isinstance(error, ValueError) else type(error).__name__))


if __name__ == "__main__":
    main()
```

### docs/performance/chef-pass-20261006/documents-routing-capabilities-policy-before.xml

```xml
<policies>

  <inbound>

    <base />

    <rewrite-uri template="/api/v1/documents/capabilities" copy-unmatched-params="true" />

  </inbound>

  <backend>

    <base />

  </backend>

  <outbound>

    <base />

  </outbound>

  <on-error>

    <base />

  </on-error>

</policies>
```

### docs/performance/chef-pass-20261006/documents-routing-create-document-policy-before.xml

```xml
<policies>

  <inbound>

    <base />

    <rewrite-uri template="/api/v1/documents" copy-unmatched-params="true" />

    <validate-content unspecified-content-type-action="prevent" max-size="2048" size-exceeded-action="prevent">

      <content type="application/json" validate-as="json" action="prevent" />

    </validate-content>

  </inbound>

  <backend>

    <base />

  </backend>

  <outbound>

    <base />

  </outbound>

  <on-error>

    <base />

  </on-error>

</policies>
```

### docs/performance/chef-pass-20261006/documents-routing-list-documents-policy-before.xml

```xml
<policies>

  <inbound>

    <base />

    <rewrite-uri template="/api/v1/documents" copy-unmatched-params="true" />

  </inbound>

  <backend>

    <base />

  </backend>

  <outbound>

    <base />

  </outbound>

  <on-error>

    <base />

  </on-error>

</policies>
```

### docs/performance/chef-pass-20261006/documents-routing-get-document-policy-before.xml

```xml
<policies>

  <inbound>

    <base />

    <rewrite-uri template="/api/v1/documents/{id}" copy-unmatched-params="true" />

  </inbound>

  <backend>

    <base />

  </backend>

  <outbound>

    <base />

  </outbound>

  <on-error>

    <base />

  </on-error>

</policies>
```

### docs/performance/chef-pass-20261006/documents-routing-download-document-policy-before.xml

```xml
<policies>

  <inbound>

    <base />

    <rewrite-uri template="/api/v1/documents/{id}/download" copy-unmatched-params="true" />

  </inbound>

  <backend>

    <base />

  </backend>

  <outbound>

    <base />

  </outbound>

  <on-error>

    <base />

  </on-error>

</policies>
```

### docs/performance/chef-pass-20261006/documents-routing-email-document-policy-before.xml

```xml
<policies>

  <inbound>

    <base />

    <rewrite-uri template="/api/v1/documents/{id}/email" copy-unmatched-params="true" />

  </inbound>

  <backend>

    <base />

  </backend>

  <outbound>

    <base />

  </outbound>

  <on-error>

    <base />

  </on-error>

</policies>
```

### docs/performance/chef-pass-20261006/documents-routing-email-history-policy-before.xml

```xml
<policies>

  <inbound>

    <base />

    <rewrite-uri template="/api/v1/documents/{id}/emails" copy-unmatched-params="true" />

  </inbound>

  <backend>

    <base />

  </backend>

  <outbound>

    <base />

  </outbound>

  <on-error>

    <base />

  </on-error>

</policies>
```

### docs/performance/chef-pass-20261006/documents-routing-capabilities-proposed-policy-put.json

```json
{
  "properties": {
    "format": "rawxml",
    "value": "<policies>\r\n  <inbound>\r\n    <base />\r\n    <set-backend-service base-url=\"https://ca-craves-notification-service-p.yellowdesert-9c7110ab.centralindia.azurecontainerapps.io\" />\n<rewrite-uri template=\"/api/v1/documents/capabilities\" copy-unmatched-params=\"true\" />\r\n  </inbound>\r\n  <backend>\r\n    <base />\r\n  </backend>\r\n  <outbound>\r\n    <base />\r\n  </outbound>\r\n  <on-error>\r\n    <base />\r\n  </on-error>\r\n</policies>"
  }
}
```

### docs/performance/chef-pass-20261006/documents-routing-create-document-proposed-policy-put.json

```json
{
  "properties": {
    "format": "rawxml",
    "value": "<policies>\r\n  <inbound>\r\n    <base />\r\n    <set-backend-service base-url=\"https://ca-craves-notification-service-p.yellowdesert-9c7110ab.centralindia.azurecontainerapps.io\" />\n<rewrite-uri template=\"/api/v1/documents\" copy-unmatched-params=\"true\" />\r\n    <validate-content unspecified-content-type-action=\"prevent\" max-size=\"2048\" size-exceeded-action=\"prevent\">\r\n      <content type=\"application/json\" validate-as=\"json\" action=\"prevent\" />\r\n    </validate-content>\r\n  </inbound>\r\n  <backend>\r\n    <base />\r\n  </backend>\r\n  <outbound>\r\n    <base />\r\n  </outbound>\r\n  <on-error>\r\n    <base />\r\n  </on-error>\r\n</policies>"
  }
}
```

### docs/performance/chef-pass-20261006/documents-routing-list-documents-proposed-policy-put.json

```json
{
  "properties": {
    "format": "rawxml",
    "value": "<policies>\r\n  <inbound>\r\n    <base />\r\n    <set-backend-service base-url=\"https://ca-craves-notification-service-p.yellowdesert-9c7110ab.centralindia.azurecontainerapps.io\" />\n<rewrite-uri template=\"/api/v1/documents\" copy-unmatched-params=\"true\" />\r\n  </inbound>\r\n  <backend>\r\n    <base />\r\n  </backend>\r\n  <outbound>\r\n    <base />\r\n  </outbound>\r\n  <on-error>\r\n    <base />\r\n  </on-error>\r\n</policies>"
  }
}
```

### docs/performance/chef-pass-20261006/documents-routing-get-document-proposed-policy-put.json

```json
{
  "properties": {
    "format": "rawxml",
    "value": "<policies>\r\n  <inbound>\r\n    <base />\r\n    <set-backend-service base-url=\"https://ca-craves-notification-service-p.yellowdesert-9c7110ab.centralindia.azurecontainerapps.io\" />\n<rewrite-uri template=\"/api/v1/documents/{id}\" copy-unmatched-params=\"true\" />\r\n  </inbound>\r\n  <backend>\r\n    <base />\r\n  </backend>\r\n  <outbound>\r\n    <base />\r\n  </outbound>\r\n  <on-error>\r\n    <base />\r\n  </on-error>\r\n</policies>"
  }
}
```

### docs/performance/chef-pass-20261006/documents-routing-download-document-proposed-policy-put.json

```json
{
  "properties": {
    "format": "rawxml",
    "value": "<policies>\r\n  <inbound>\r\n    <base />\r\n    <set-backend-service base-url=\"https://ca-craves-notification-service-p.yellowdesert-9c7110ab.centralindia.azurecontainerapps.io\" />\n<rewrite-uri template=\"/api/v1/documents/{id}/download\" copy-unmatched-params=\"true\" />\r\n  </inbound>\r\n  <backend>\r\n    <base />\r\n  </backend>\r\n  <outbound>\r\n    <base />\r\n  </outbound>\r\n  <on-error>\r\n    <base />\r\n  </on-error>\r\n</policies>"
  }
}
```

### docs/performance/chef-pass-20261006/documents-routing-email-document-proposed-policy-put.json

```json
{
  "properties": {
    "format": "rawxml",
    "value": "<policies>\r\n  <inbound>\r\n    <base />\r\n    <set-backend-service base-url=\"https://ca-craves-notification-service-p.yellowdesert-9c7110ab.centralindia.azurecontainerapps.io\" />\n<rewrite-uri template=\"/api/v1/documents/{id}/email\" copy-unmatched-params=\"true\" />\r\n  </inbound>\r\n  <backend>\r\n    <base />\r\n  </backend>\r\n  <outbound>\r\n    <base />\r\n  </outbound>\r\n  <on-error>\r\n    <base />\r\n  </on-error>\r\n</policies>"
  }
}
```

### docs/performance/chef-pass-20261006/documents-routing-email-history-proposed-policy-put.json

```json
{
  "properties": {
    "format": "rawxml",
    "value": "<policies>\r\n  <inbound>\r\n    <base />\r\n    <set-backend-service base-url=\"https://ca-craves-notification-service-p.yellowdesert-9c7110ab.centralindia.azurecontainerapps.io\" />\n<rewrite-uri template=\"/api/v1/documents/{id}/emails\" copy-unmatched-params=\"true\" />\r\n  </inbound>\r\n  <backend>\r\n    <base />\r\n  </backend>\r\n  <outbound>\r\n    <base />\r\n  </outbound>\r\n  <on-error>\r\n    <base />\r\n  </on-error>\r\n</policies>"
  }
}
```

### docs/performance/chef-pass-20261006/documents-routing-existing-only-repair.py

```python
"""Reviewable, existing-only APIM documents routing repair.

Inspection is the default. --apply accepts only the two frozen review receipts
and seven exact existing policy changes. No application token, browser session,
document body, export, email, resource creation or container mutation is used.
"""
import argparse
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PROPOSAL_HASH = "90f4cbc597cf1bdf41621cd8df3112042ccccd5758e7c3f6aadd7187fe35b8a9"
SUPPLEMENT_HASH = "fdb30064355308830918b3120f0a27b325504989cc13b1cf5c868c1a3b096ea9"
ORDER = ["create-document", "list-documents", "get-document", "download-document",
         "email-document", "email-history", "capabilities"]
BACKEND = "https://ca-craves-notification-service-p.yellowdesert-9c7110ab.centralindia.azurecontainerapps.io"
ALLOWED_TAGS = {"policies", "inbound", "base", "rewrite-uri", "backend", "outbound",
                "on-error", "validate-content", "content", "set-backend-service"}
spec = importlib.util.spec_from_file_location("documents_existing_web_release", ROOT / "scripts/release/web_performance_release.py")
perf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(perf)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def json_hash(value):
    return digest(json.dumps(value, sort_keys=True, separators=(",", ":")).encode())


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def structure(text):
    root = ET.fromstring(text)
    require(all(node.tag in ALLOWED_TAGS for node in root.iter()), "Unexpected known-operation policy node")

    def node_value(node):
        # Azure's single-policy and collection views serialize indentation and
        # self-closing nodes differently. Ignore only whitespace-only formatting;
        # preserve every attribute, non-whitespace text, node and child order.
        return (node.tag, tuple(sorted(node.attrib.items())),
                node.text if node.text and not node.text.isspace() else None,
                node.tail if node.tail and not node.tail.isspace() else None,
                tuple(node_value(child) for child in node))
    return node_value(root)


def validate_insertion(before, proposed, change):
    old, new = ET.fromstring(before), ET.fromstring(proposed)
    require(not old.findall(".//set-backend-service"), "Original policy already overrides backend")
    inbound = new.find("inbound")
    overrides = new.findall(".//set-backend-service")
    require(inbound is not None and len(overrides) == 1, "Expected exactly one operation backend override")
    inserted = overrides[0]
    require(inserted in list(inbound) and inserted.attrib == {"base-url": BACKEND}
            and not list(inserted) and not (inserted.text or "").strip(), "Unexpected backend override")
    children = list(inbound)
    index = children.index(inserted)
    require(index + 1 < len(children) and children[index + 1].tag == "rewrite-uri",
            "Backend override must immediately precede existing rewrite")
    rewrites = new.findall(".//rewrite-uri")
    require(len(rewrites) == 1 and rewrites[0].attrib == {
        "template": change["currentRewrite"], "copy-unmatched-params": "true"}, "Existing rewrite changed")
    inbound.remove(inserted)
    require(structure(ET.tostring(new, encoding="unicode")) == structure(before),
            "Policy changes more than the reviewed backend insertion")


def load_review():
    proposal_raw = (HERE / "documents-routing-repair-readonly-proposal.json").read_bytes()
    supplement_raw = (HERE / "documents-routing-all-operation-policy-preflight.json").read_bytes()
    require(digest(proposal_raw) == PROPOSAL_HASH and digest(supplement_raw) == SUPPLEMENT_HASH,
            "Frozen review receipts changed")
    proposal, supplement = json.loads(proposal_raw), json.loads(supplement_raw)
    require(supplement["proposalSha256"] == PROPOSAL_HASH and proposal["applyOrderIfAuthorized"] == ORDER,
            "Reviewed receipt chain or operation order changed")
    changes = {item["name"]: item for item in proposal["changes"]}
    require(set(changes) == set(ORDER) and len(supplement["operations"]) == 14,
            "Reviewed operation inventory changed")
    originals, proposed_values = {}, {}
    for name in ORDER:
        item = changes[name]
        # Historical snapshot text was written on Windows with newline
        # translation. Undo exactly that transformation, then require its frozen
        # original hash; no permissive alternate source is accepted.
        before = (HERE / item["beforePolicyFile"]).read_bytes().decode("utf-8").replace("\r\n", "\n")
        payload = json.loads((HERE / item["proposedPolicyPutFile"]).read_bytes())
        require(set(payload) == {"properties"} and set(payload["properties"]) == {"format", "value"}
                and payload["properties"]["format"] == "rawxml", "Unexpected proposed PUT fields")
        proposed = payload["properties"]["value"]
        require(digest(before.encode()) == item["currentPolicySha256"]
                and digest(proposed.encode()) == item["proposedPolicySha256"], "Frozen policy payload changed")
        require(item["proposedBackendRootUrl"] == BACKEND and item["policyResourceId"] == item["operationId"] + "/policies/policy",
                "Unexpected destination or policy resource")
        validate_insertion(before, proposed, item)
        originals[name], proposed_values[name] = before, proposed
    return proposal, supplement, changes, originals, proposed_values


class Repair:
    def __init__(self):
        self.proposal, self.supplement, self.changes, self.originals, self.proposed = load_review()
        self.api = self.proposal["affectedExistingApiId"]
        self.applied = {}
        self.restored = {}
        self.ambiguous = set()
        self.attempted = []
        self.token = None
        self.protected = None
        self.all_apps = None
        self.service_tier = None
        self.receipt = {"startedAtUtc": now(), "operation": "inspection", "proposalSha256": PROPOSAL_HASH,
                        "supplementSha256": SUPPLEMENT_HASH, "configurationVerified": False,
                        "functionalVerified": False, "functionalProofPending": "Root's existing signed-in native browser capability GET",
                        "changes": [], "rollback": [], "newResources": 0, "containerChanges": 0,
                        "authorizationChanges": 0, "documentsGeneratedDownloadedEmailed": 0}

    def account(self):
        account = perf.release.azure("account", "show")
        require(account.get("id") == perf.release.SUBSCRIPTION and account.get("tenantId") == perf.release.inspect.TENANT,
                "Unexpected Azure account")
        return {"subscriptionId": account["id"], "tenantId": account["tenantId"]}

    def get(self, path):
        return perf.release.azure("rest", "--method", "get", "--url",
                                  "https://management.azure.com" + path + "?api-version=2024-05-01")

    def policy_list(self, operation):
        return self.get(operation + "/policies")["value"]

    def direct(self, method, path, payload=None, etag=None):
        if self.token is None:
            credential = perf.release.azure("account", "get-access-token", "--resource", "https://management.azure.com/")
            require(credential.get("subscription") == perf.release.SUBSCRIPTION, "Management credential account changed")
            self.token = credential["accessToken"]
        headers = {"Authorization": "Bearer " + self.token, "Accept": "application/json"}
        data = None
        if payload is not None:
            require(bool(etag), "An exact target ETag is required")
            headers.update({"Content-Type": "application/json", "If-Match": etag})
            data = json.dumps(payload).encode()
        request = urllib.request.Request("https://management.azure.com" + path + "?api-version=2024-05-01&format=rawxml",
                                         data=data, headers=headers, method=method)
        opener = urllib.request.build_opener(perf.release.evidence.NoRedirect())
        try:
            with opener.open(request, timeout=45) as response:
                if method == "PUT":
                    # A successful synchronous status acknowledges this write;
                    # the response body is unnecessary. Read the policy anew.
                    return None, response.headers.get("ETag"), response.status
                raw = response.read(512 * 1024 + 1)
                require(len(raw) <= 512 * 1024, "Management response exceeds bound")
                return json.loads(raw) if raw else None, response.headers.get("ETag"), response.status
        except urllib.error.HTTPError as error:
            status = error.code
            error.close()
            raise ValueError("Management policy request failed; status " + str(status)) from None
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
            raise PolicyTransportError("Management policy request failed; transport outcome unknown") from None

    def check(self, capture=False):
        account = self.account()
        service = self.get(self.api.split("/apis/", 1)[0])
        tier = {"id": service["id"], "location": service["location"], "sku": service["sku"]}
        if capture:
            self.service_tier = tier
            self.receipt["serviceTierBefore"] = tier
        else:
            require(tier == self.service_tier, "APIM service tier drift")
        api = self.get(self.api)
        require(json_hash(api) == self.proposal["apiResourceSha256"], "API resource drift")
        operations = self.get(self.api + "/operations")["value"]
        require(json_hash(operations) == self.proposal["operationsInventorySha256"], "Operation inventory drift")
        require(not self.get(self.api + "/products")["value"], "API product association drift")
        for scope in self.proposal["inheritedPolicies"]:
            policies = self.get(scope["id"].rsplit("/", 1)[0])["value"]
            require(len(policies) == 1 and policies[0]["id"] == scope["id"]
                    and digest(policies[0]["properties"]["value"].encode()) == scope["policySha256"],
                    "Inherited policy drift")
        for row in self.supplement["operations"]:
            policies = self.policy_list(row["operationId"])
            name = row["name"]
            if not row["knownOperation"]:
                require(not policies, "Wildcard operation policy drift")
                continue
            require(len(policies) == 1 and policies[0]["id"] == self.changes[name]["policyResourceId"],
                    "Known operation policy inventory drift")
            xml = policies[0]["properties"]["value"]
            expected_hash = self.applied.get(name, self.restored.get(name, self.changes[name]["currentPolicySha256"]))
            require(digest(xml.encode()) == expected_hash, "Known operation policy drift: " + name)
            require(structure(xml) == structure(self.proposed[name] if name in self.applied else self.originals[name]),
                    "Known operation policy structure drift: " + name)
        apps = perf.release.azure("containerapp", "list", "-g", perf.release.RG)
        all_apps = {app["name"]: perf.protected_fingerprint(app) for app in apps}
        protected = {name: value for name, value in all_apps.items() if name != perf.release.WEB}
        web = next(app for app in apps if app["name"] == perf.release.WEB)
        released = json.loads((HERE / "release-deploy.json").read_bytes())
        require(released.get("verified") is True and protected == released["protectedApps"] and len(protected) == 12,
                "Protected apps differ from the verified customer release")
        require(perf.release.build_sha(web) == self.proposal["sourceSha"]
                and web["properties"]["template"]["containers"][0]["image"] == released["image"],
                "Current web source/image changed")
        if capture:
            self.protected, self.all_apps = protected, all_apps
            self.receipt.update({"account": account, "protectedAppsBefore": protected, "allAppsBefore": all_apps})
        else:
            require(all_apps == self.all_apps, "Container runtime/image/traffic drift")
        return {"observedAtUtc": now(), "apiResourceSha256": json_hash(api),
                "operationsInventorySha256": json_hash(operations), "serviceTier": tier,
                "protectedApps": protected, "allApps": all_apps}

    def target(self, name, expected):
        value, etag, status = self.direct("GET", self.changes[name]["policyResourceId"])
        require(status == 200 and bool(etag) and re.fullmatch(r'"[A-Za-z0-9+/=]+"', etag), "Target has no usable exact ETag")
        require(value.get("id") == self.changes[name]["policyResourceId"]
                and structure(value["properties"]["value"]) == structure(expected), "ETag target structure drift")
        return etag

    def update(self, name, value, etag):
        try:
            _, _, status = self.direct("PUT", self.changes[name]["policyResourceId"],
                                       {"properties": {"format": "rawxml", "value": value}}, etag)
        except PolicyTransportError:
            self.ambiguous.add(name)
            raise
        require(status in (200, 201), "Unexpected policy update status")
        policies = self.policy_list(self.changes[name]["operationId"])
        require(len(policies) == 1, "Updated policy inventory changed")
        actual = policies[0]["properties"]["value"]
        require(structure(actual) == structure(value), "Updated policy differs from reviewed structure")
        if value == self.proposed[name]:
            validate_insertion(self.originals[name], actual, self.changes[name])
        return digest(actual.encode()), status

    def boundary(self):
        base = "https://apim-craves-prodlow-kmqgfy.azure-api.net/api/v1/documents"
        urls = ["https://craves.in/api/documents/capabilities", "https://craves.in/api/documents",
                "https://craves.in/api/documents/00000000-0000-0000-0000-000000000000", base + "/capabilities"]
        opener = urllib.request.build_opener(perf.release.evidence.NoRedirect())
        rows = []
        for url, expected_status in zip(urls, [401, 401, 404, 401]):
            start = time.monotonic()
            request = urllib.request.Request(url, headers={"Accept": "application/json"}, method="GET")
            try:
                response = opener.open(request, timeout=30)
            except urllib.error.HTTPError as error:
                response = error
            except urllib.error.URLError:
                raise ValueError("Anonymous boundary request transport error") from None
            try:
                status = response.status
                cache = response.headers.get("Cache-Control", "")
                edge = response.headers.get("X-Cache", "")
                rows.append({"url": url, "status": status, "cacheControl": cache, "xCache": edge,
                             "seconds": round(time.monotonic() - start, 6), "authenticated": False,
                             "responseBodyRead": False})
                require(status == expected_status, "Anonymous documents boundary status changed")
                require("no-store" in cache.lower() or "private" in cache.lower(), "Anonymous documents response lacks private/no-store cache control")
                require(not edge or edge == "CONFIG_NOCACHE", "Anonymous documents response became cacheable")
            finally:
                response.close()
        baseline = self.receipt.get("anonymousBoundariesBefore")
        if baseline:
            require([{key: row[key] for key in ("url", "status", "cacheControl", "xCache")} for row in rows] ==
                    [{key: row[key] for key in ("url", "status", "cacheControl", "xCache")} for row in baseline],
                    "Anonymous documents boundary headers/status changed")
        return rows

    def save(self, filename):
        self.receipt["lastUpdatedAtUtc"] = now()
        (HERE / filename).write_bytes((json.dumps(self.receipt, indent=2) + "\n").encode())

    def rollback(self):
        # An in-flight update may have succeeded before a transport/readback
        # failure. Discover only exact own proposed structures, then use current
        # ETags. Never restore a concurrently changed target or other scope.
        if self.ambiguous:
            self.receipt["ambiguousWriteOperations"] = sorted(self.ambiguous)
            self.receipt["manualReviewRequired"] = True
            # Bounded observations help discover a late completion, but cannot
            # prove an unacknowledged network write will never complete later.
            # Even an apparently original state retains the unknown outcome.
            for name in sorted(self.ambiguous):
                samples = []
                for round_number in range(3):
                    if round_number:
                        time.sleep(2)
                    policies = self.policy_list(self.changes[name]["operationId"])
                    require(len(policies) == 1, "Ambiguous recovery inventory drift")
                    actual = policies[0]["properties"]["value"]
                    kind = "own-proposed" if structure(actual) == structure(self.proposed[name]) else (
                        "original" if structure(actual) == structure(self.originals[name]) else "concurrent-drift")
                    samples.append({"observedAtUtc": now(), "policySha256": digest(actual.encode()), "structure": kind})
                self.receipt.setdefault("ambiguousWriteReadbacks", {})[name] = samples
        for name in self.attempted:
            policies = self.policy_list(self.changes[name]["operationId"])
            require(len(policies) == 1, "Recovery policy inventory drift")
            actual = policies[0]["properties"]["value"]
            if structure(actual) == structure(self.proposed[name]):
                self.applied[name] = digest(actual.encode())
            elif structure(actual) == structure(self.originals[name]):
                self.applied.pop(name, None)
                self.restored[name] = digest(actual.encode())
            else:
                raise ValueError("Recovery refused: target has concurrent drift")
        self.check()
        for name in reversed(self.attempted):
            if name not in self.applied:
                continue
            self.check()
            etag = self.target(name, self.proposed[name])
            actual_hash, status = self.update(name, self.originals[name], etag)
            self.restored[name] = actual_hash
            del self.applied[name]
            self.receipt["rollback"].append({"operation": name, "restoredAtUtc": now(), "status": status,
                                             "restoredPolicySha256": actual_hash, "originalStructureVerified": True})
            self.save("documents-routing-repair-applied-receipt.json")
        self.receipt["rollbackVerified"] = not self.applied and not self.ambiguous
        self.receipt["afterRollback"] = self.check()

    def execute(self, apply=False):
        before = self.check(capture=True)
        self.receipt["before"] = before
        self.receipt["anonymousBoundariesBefore"] = self.boundary()
        if not apply:
            self.receipt["inspectionVerified"] = True
            self.save("documents-routing-repair-inspection.json")
            return self.receipt
        require(not (HERE / "documents-routing-repair-applied-receipt.json").exists(),
                "An existing apply receipt requires review; automatic rerun is refused")
        self.receipt["operation"] = "apply exact reviewed seven existing operation policies"
        self.save("documents-routing-repair-applied-receipt.json")
        try:
            for name in ORDER:
                preflight = self.check()
                etag = self.target(name, self.originals[name])
                self.attempted.append(name)
                actual_hash, status = self.update(name, self.proposed[name], etag)
                self.applied[name] = actual_hash
                self.receipt["changes"].append({"operation": name, "method": self.changes[name]["method"],
                    "urlTemplate": self.changes[name]["urlTemplate"], "policyResourceId": self.changes[name]["policyResourceId"],
                    "originalPolicySha256": self.changes[name]["currentPolicySha256"],
                    "reviewedProposedPolicySha256": self.changes[name]["proposedPolicySha256"],
                    "readbackPolicySha256": actual_hash, "etagConditionalUpdate": True, "putStatus": status,
                    "onlyReviewedNodeInserted": True, "appliedAtUtc": now(), "preflight": preflight})
                self.save("documents-routing-repair-applied-receipt.json")
                print(json.dumps({"operation": name, "configurationReadbackVerified": True, "appliedAtUtc": now()}), flush=True)
            self.receipt["after"] = self.check()
            self.receipt["anonymousBoundariesAfter"] = self.boundary()
            self.receipt["configurationVerified"] = len(self.applied) == 7
            self.receipt["protectedAppsAfter"] = self.receipt["after"]["protectedApps"]
            self.receipt["allAppsAfter"] = self.receipt["after"]["allApps"]
            self.save("documents-routing-repair-applied-receipt.json")
        except Exception as failure:
            # Fixed categories only: no Azure response, credentials or values.
            self.receipt["failureCategory"] = type(failure).__name__
            self.receipt["configurationVerified"] = False
            try:
                self.rollback()
            except Exception as recovery:
                self.receipt["rollbackVerified"] = False
                self.receipt["rollbackFailureCategory"] = type(recovery).__name__
                self.receipt["manualReviewRequired"] = True
            self.save("documents-routing-repair-applied-receipt.json")
            raise ValueError("Apply verification failed; inspect sanitized receipt and guarded recovery state") from None
        return self.receipt


class PolicyTransportError(Exception):
    """Unknown management write outcome; body and credentials are suppressed."""


def self_test():
    _, _, changes, originals, proposed = load_review()
    for name in ORDER:
        validate_insertion(originals[name], proposed[name], changes[name])
    require(structure('<policies><inbound><base /></inbound></policies>') ==
            structure('<policies>\n <inbound>\n<base/>\n</inbound>\n</policies>'), "Whitespace canonicalization failed")
    bad = [proposed["capabilities"].replace(BACKEND, BACKEND + "/api/v1/documents"),
           proposed["capabilities"].replace('copy-unmatched-params="true"', 'copy-unmatched-params="false"'),
           proposed["capabilities"].replace('<base />', '<base /><set-header name="Authorization" exists-action="delete" />', 1),
           proposed["capabilities"].replace('<set-backend-service', '<set-backend-service extra="value"')]
    for value in bad:
        rejected = False
        try:
            validate_insertion(originals["capabilities"], value, changes["capabilities"])
        except ValueError:
            rejected = True
        require(rejected, "Unsafe policy variation was accepted")
    print(json.dumps({"offlineSelfTestVerified": True, "frozenOperationsValidated": 7, "unsafeVariationsRejected": len(bad)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        require(not args.apply, "Self-test cannot apply")
        self_test()
    else:
        result = Repair().execute(args.apply)
        print(json.dumps({"inspectionVerified": result.get("inspectionVerified", False),
                          "configurationVerified": result["configurationVerified"],
                          "functionalVerified": result["functionalVerified"],
                          "changedOperations": len(result["changes"]),
                          "receipt": "documents-routing-repair-applied-receipt.json" if args.apply else "documents-routing-repair-inspection.json"}))
```

