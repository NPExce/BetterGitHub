// ==UserScript==
// @name         BetterGitHub
// @namespace    adrian.rostkowski.bettergithub
// @version      1.15.0
// @description  Lista PR: approvale, rozwiązane wątki (np. 3/8), reviewerzy, konflikty, zmienione linie, aktywność, komentujący i PR czekające na Ciebie. Strona PR: przycisk Review (Approve, Request changes, Comment) jako zalogowany użytkownik i kopiowanie ścieżki pliku z wątków review. Logowanie przez GitHub albo token. Wyniki są zapamiętywane i odświeżane w tle.
// @homepageURL  https://github.com/NPExce/BetterGitHub
// @updateURL    https://raw.githubusercontent.com/NPExce/BetterGitHub/main/BetterGitHub.user.js
// @downloadURL  https://raw.githubusercontent.com/NPExce/BetterGitHub/main/BetterGitHub.user.js
// @match        https://github.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @connect      api.github.com
// @connect      github.com
// @inject-into  content
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  // ---------- ustawienia ----------
  const API = 'https://api.github.com/graphql';
  const TTL_MS = 90 * 1000;   // po tylu ms dane PR są pobierane ponownie
  const BATCH = 10;           // ile PR w jednym zapytaniu GraphQL
  const STALE_DAYS = 5;       // od ilu dni bez aktywności czas robi się żółty
  const ALIGN_RANGE = 160;    // o ile px mogą się różnić prawe krawędzie etykiet, żeby je wyrównać

  // Client ID aplikacji GitHub organizacji. Nie jest tajny, może być w kodzie.
  // Puste = logowanie przez GitHub niedostępne, zostaje ręczny token (PAT).
  const APP_CLIENT_ID = 'Iv23liIIDcuMMf62wXwd'; // aplikacja "ZT PR badges" w ZnanyTerapeutaOrganization
  const getClientId = () => String(GM_getValue('clientId', '') || APP_CLIENT_ID).trim();
  const getPat = () => String(GM_getValue('token', '') || '').trim();
  const getAppAuth = () => { const a = GM_getValue('appAuth', null); return a && a.accessToken ? a : null; };
  const hasAuth = () => !!(getAppAuth() || getPat());
  const appMode = () => !!(getAppAuth() || (!getPat() && getClientId()));
  const getRequired = () => parseInt(GM_getValue('requiredApprovals', 0), 10) || 0;

  // ---------- ikony (Primer Octicons, MIT) ----------
  const D = {
    check: 'M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z',
    x: 'M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z',
    comment: 'M1.75 1h8.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 10.25 10H7.061l-2.574 2.573A1.458 1.458 0 0 1 2 11.543V10h-.25A1.75 1.75 0 0 1 0 8.25v-5.5C0 1.784.784 1 1.75 1ZM1.5 2.75v5.5c0 .138.112.25.25.25h1a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h3.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25Zm13 2a.25.25 0 0 0-.25-.25h-.5a.75.75 0 0 1 0-1.5h.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 14.25 12H14v1.543a1.458 1.458 0 0 1-2.487 1.03L9.22 12.28a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215l2.22 2.22v-2.19a.75.75 0 0 1 .75-.75h1a.25.25 0 0 0 .25-.25Z',
    clock: 'M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z',
    alert: 'M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z',
    reply: 'M6.78 1.97a.75.75 0 0 1 0 1.06L3.81 6h6.44A4.75 4.75 0 0 1 15 10.75v2.5a.75.75 0 0 1-1.5 0v-2.5a3.25 3.25 0 0 0-3.25-3.25H3.81l2.97 2.97a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L1.47 7.28a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z',
    key: 'M10.5 0a5.499 5.499 0 1 1-1.288 10.848l-.932.932a.749.749 0 0 1-.53.22H7v.75a.749.749 0 0 1-.22.53l-.5.5a.749.749 0 0 1-.53.22H5v.75a.749.749 0 0 1-.22.53l-.5.5a.749.749 0 0 1-.53.22h-2A1.75 1.75 0 0 1 0 14.25v-2c0-.199.079-.389.22-.53l4.932-4.932A5.5 5.5 0 0 1 10.5 0Zm-4 5.5c-.001.431.069.86.205 1.269a.75.75 0 0 1-.181.768L1.5 12.56v1.69c0 .138.112.25.25.25h1.69l.06-.06v-1.19a.75.75 0 0 1 .75-.75h1.19l.06-.06v-1.19a.75.75 0 0 1 .75-.75h1.19l1.023-1.025a.75.75 0 0 1 .768-.18A4 4 0 1 0 6.5 5.5ZM11 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z',
    sync: 'M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z',
    copy: 'M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25ZM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z',
    people: 'M2 5.5a3.5 3.5 0 1 1 5.898 2.549 5.508 5.508 0 0 1 3.034 4.084.75.75 0 1 1-1.482.235 4 4 0 0 0-7.9 0 .75.75 0 0 1-1.482-.236A5.507 5.507 0 0 1 3.102 8.05 3.493 3.493 0 0 1 2 5.5ZM11 4a3.001 3.001 0 0 1 2.22 5.018 5.01 5.01 0 0 1 2.56 3.012.749.749 0 0 1-.885.954.752.752 0 0 1-.549-.514 3.507 3.507 0 0 0-2.522-2.372.75.75 0 0 1-.574-.73v-.352a.75.75 0 0 1 .416-.672A1.5 1.5 0 0 0 11 5.5.75.75 0 0 1 11 4Zm-5.5-.5a2 2 0 1 0-.001 3.999A2 2 0 0 0 5.5 3.5Z',
  };

  // ---------- style ----------
  GM_addStyle(`
    .ztpr{display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px;margin-left:auto;padding-left:10px;vertical-align:middle;
      font-size:12px;line-height:18px;font-weight:400;position:relative;z-index:1;white-space:nowrap}
    .ztpr.ztpr-grid{display:inline-grid;grid-auto-flow:column;column-gap:6px;justify-items:start;
      grid-template-columns:112px 64px 112px 84px 84px 100px}
    .ztpr-col{display:inline-flex;align-items:center;gap:6px;min-width:0}
    .ztpr-num{font-variant-numeric:tabular-nums}
    .ztpr-more{display:inline-flex;align-items:center;gap:2px;margin-left:4px;font-size:11px;color:var(--fgColor-muted,#9198a1)}
    .ztpr-chip{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 7px;border-radius:999px;
      border:1px solid var(--borderColor-default,#3d444d);color:var(--fgColor-default,#e6edf3);
      white-space:nowrap;text-decoration:none!important;font-variant-numeric:tabular-nums;box-sizing:border-box}
    a.ztpr-chip:hover{border-color:var(--borderColor-accent-emphasis,#1f6feb)}
    .ztpr-chip svg{flex:none}
    .ztpr-plain{border-color:transparent!important;padding:0 2px}
    .ztpr-muted{color:var(--fgColor-muted,#9198a1)}
    .ztpr-success{color:var(--fgColor-success,#3fb950);border-color:var(--borderColor-success-muted,rgba(46,160,67,.45))}
    .ztpr-attention{color:var(--fgColor-attention,#d29922);border-color:var(--borderColor-attention-muted,rgba(187,128,9,.45))}
    .ztpr-danger{color:var(--fgColor-danger,#f85149);border-color:var(--borderColor-danger-muted,rgba(248,81,73,.45))}
    .ztpr-done{color:var(--fgColor-done,#ab7df8);border-color:var(--borderColor-done-muted,rgba(171,125,248,.45));
      background:var(--bgColor-done-muted,rgba(171,125,248,.12));font-weight:600}
    .ztpr-accent{color:var(--fgColor-accent,#4493f8);border-color:var(--borderColor-accent-muted,rgba(56,139,253,.4));
      background:var(--bgColor-accent-muted,rgba(56,139,253,.1));font-weight:600}
    .ztpr-ask{border-color:var(--fgColor-done,#ab7df8)!important}
    .ztpr-action{cursor:pointer}
    .ztpr-add{color:var(--fgColor-success,#3fb950)}
    .ztpr-del{color:var(--fgColor-danger,#f85149)}
    .ztpr-chip:has(.ztpr-stack){padding-right:3px}
    .ztpr-stack{display:inline-flex;align-items:center;margin-left:3px}
    .ztpr-stack .ztpr-av + .ztpr-av{margin-left:-5px}
    .ztpr-stack-wait{margin-left:5px}
    .ztpr-av{width:16px;height:16px;border-radius:50%;display:block;background:var(--bgColor-muted,#151b23);
      box-shadow:0 0 0 1.5px var(--bgColor-default,#0d1117)}
    .ztpr-av-wait{opacity:.45;filter:grayscale(1)}
    .ztpr-mine{box-shadow:inset 3px 0 0 var(--fgColor-done,#ab7df8)!important}
    .ztpr-syncing{animation:ztpr-pulse 1.2s ease-in-out infinite}
    @keyframes ztpr-pulse{50%{opacity:.45}}
    .ztpr-sync{position:fixed;left:16px;bottom:16px;z-index:2147481000;display:flex;align-items:center;gap:6px;padding:4px 12px;
      border-radius:999px;border:1px solid var(--borderColor-default,#3d444d);background:var(--overlay-bgColor,var(--bgColor-default,#151b23));
      color:var(--fgColor-muted,#9198a1);font-size:12px;line-height:18px;box-shadow:var(--shadow-floating-small,0 4px 12px rgba(1,4,9,.4));
      pointer-events:none}
    .ztpr-sync.ztpr-sync-ok{color:var(--fgColor-success,#3fb950)}
    .ztpr-sync.ztpr-sync-err{color:var(--fgColor-danger,#f85149)}
    .ztpr-spin svg,svg.ztpr-spin{animation:ztpr-spin 1s linear infinite}
    @keyframes ztpr-spin{to{transform:rotate(360deg)}}

    .ztpr-fab{position:fixed;right:24px;bottom:24px;z-index:100;font-size:14px;line-height:20px;
      color:var(--fgColor-default,#f0f6fc)}
    .ztpr-fab-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 16px;
      border-radius:999px;border:1px solid var(--button-primary-borderColor-rest,rgba(240,246,252,.1));
      background:var(--button-primary-bgColor-rest,#238636);color:var(--button-primary-fgColor-rest,#fff);
      font:inherit;font-weight:600;cursor:pointer;box-shadow:var(--shadow-floating-large,0 8px 24px rgba(1,4,9,.6))}
    .ztpr-fab-btn:hover{background:var(--button-primary-bgColor-hover,#29903b)}
    .ztpr-fab-btn:disabled{opacity:.7;cursor:default}
    .ztpr-fab-btn.ztpr-active{filter:brightness(.85)}
    .ztpr-fab-btn .ztpr-av{width:18px;height:18px;margin-left:2px;box-shadow:none}
    .ztpr-fab-btn.ztpr-rv-ok,.ztpr-fab-btn.ztpr-rv-changes,.ztpr-fab-btn.ztpr-rv-warn{background:transparent}
    .ztpr-fab-btn.ztpr-rv-ok:hover,.ztpr-fab-btn.ztpr-rv-changes:hover,.ztpr-fab-btn.ztpr-rv-warn:hover{background:var(--bgColor-muted,#151b23)}
    .ztpr-rv-ok{color:var(--fgColor-success,#3fb950)!important;border-color:var(--borderColor-success-muted,rgba(46,160,67,.45))!important}
    .ztpr-rv-changes{color:var(--fgColor-danger,#f85149)!important;border-color:var(--borderColor-danger-muted,rgba(248,81,73,.45))!important}
    .ztpr-rv-warn{color:var(--fgColor-attention,#d29922)!important;border-color:var(--borderColor-attention-muted,rgba(187,128,9,.45))!important}
    .ztpr-fab.ztpr-inline{position:relative;right:auto;bottom:auto;display:inline-flex;align-items:center;
      vertical-align:middle;margin-right:12px;z-index:30;font-size:13px}
    .ztpr-inline > .ztpr-fab-btn{height:28px;padding:0 12px;border-radius:6px;box-shadow:none;font-size:13px}
    .ztpr-fab.ztpr-at-tabs{align-self:center;margin:0 16px 0 0}
    .ztpr-at-tabs > .ztpr-fab-btn{height:28px;padding:0 12px;gap:5px;font-size:13px;font-weight:600;line-height:20px}

    .ztpr-pop{position:fixed;z-index:2147482000;width:380px;max-width:calc(100vw - 16px);padding:14px;border-radius:12px;
      border:1px solid var(--borderColor-default,#3d444d);background:var(--overlay-bgColor,var(--bgColor-default,#151b23));
      color:var(--fgColor-default,#f0f6fc);box-shadow:var(--shadow-floating-large,0 8px 24px rgba(1,4,9,.6));
      font-size:14px;line-height:20px;text-align:left;display:flex;flex-direction:column;gap:10px;box-sizing:border-box}
    .ztpr-pop-title{display:flex;align-items:center;gap:6px;font-weight:600}
    .ztpr-pop-title .ztpr-av{width:20px;height:20px;box-shadow:none}
    .ztpr-fab-hint{font-size:12px;color:var(--fgColor-muted,#9198a1)}
    .ztpr-fab-ta{width:100%;box-sizing:border-box;resize:vertical;min-height:80px;padding:6px 8px;border-radius:6px;
      border:1px solid var(--borderColor-default,#3d444d);background:var(--bgColor-default,#0d1117);
      color:var(--fgColor-default,#f0f6fc);font:inherit;font-size:13px}
    .ztpr-fab-ta:focus{outline:2px solid var(--focus-outlineColor,#1f6feb);outline-offset:-1px}
    .ztpr-opts{display:flex;flex-direction:column;gap:2px}
    .ztpr-opt{display:flex;gap:8px;align-items:flex-start;padding:6px 8px;border-radius:6px;cursor:pointer}
    .ztpr-opt:hover{background:var(--bgColor-muted,#151b23)}
    .ztpr-opt input{margin:3px 0 0;cursor:inherit}
    .ztpr-opt-txt{display:flex;flex-direction:column}
    .ztpr-opt-name{font-weight:600}
    .ztpr-opt-off{opacity:.5;cursor:default}
    .ztpr-opt-off:hover{background:transparent}
    .ztpr-fab-row{display:flex;gap:8px;justify-content:flex-end;align-items:center}
    .ztpr-fab-row .ztpr-fab-hint{margin-right:auto}
    .ztpr-pop .ztpr-fab-btn{height:32px;border-radius:6px;box-shadow:none;padding:0 12px}
    .ztpr-fab-cancel{height:32px;padding:0 12px;border-radius:6px;border:1px solid var(--borderColor-default,#3d444d);
      background:transparent;color:var(--fgColor-default,#f0f6fc);font:inherit;cursor:pointer}
    .ztpr-fab-err{color:var(--fgColor-danger,#f85149);font-size:12px;white-space:pre-line}
    .ztpr-copy{display:inline-flex;align-items:center;justify-content:center;flex:none;width:24px;height:24px;margin:0 6px 0 2px;
      padding:0;border:0;border-radius:6px;background:transparent;color:var(--fgColor-muted,#9198a1);cursor:pointer;vertical-align:middle}
    .ztpr-copy:hover{background:var(--bgColor-neutral-muted,rgba(101,108,118,.2));color:var(--fgColor-default,#f0f6fc)}
    .ztpr-copy svg{width:14px;height:14px}
    .ztpr-copy.ztpr-copied{color:var(--fgColor-success,#3fb950)}
    .ztpr-modal-bg{position:fixed;inset:0;z-index:2147483000;background:rgba(1,4,9,.55);display:flex;align-items:center;justify-content:center}
    .ztpr-modal{width:380px;max-width:calc(100vw - 32px);box-sizing:border-box;padding:20px;border-radius:12px;
      border:1px solid var(--borderColor-default,#3d444d);background:var(--overlay-bgColor,var(--bgColor-default,#151b23));
      color:var(--fgColor-default,#f0f6fc);box-shadow:var(--shadow-floating-large,0 8px 24px rgba(1,4,9,.6));
      font-size:14px;line-height:20px;display:flex;flex-direction:column;gap:12px}
    .ztpr-modal h3{margin:0;font-size:16px;font-weight:600}
    .ztpr-modal-code{font:600 26px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:3px;text-align:center;
      padding:12px;border-radius:8px;border:1px dashed var(--borderColor-default,#3d444d);user-select:all}
    .ztpr-modal-wait{display:flex;align-items:center;gap:6px;color:var(--fgColor-muted,#9198a1);font-size:12px}
    .ztpr-modal-ok{display:flex;align-items:center;gap:6px;color:var(--fgColor-success,#3fb950);font-weight:600}
    .ztpr-modal-row{display:flex;gap:8px;justify-content:flex-end;align-items:center;flex-wrap:wrap}
    .ztpr-mbtn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:6px;box-sizing:border-box;
      border:1px solid var(--borderColor-default,#3d444d);background:transparent;color:var(--fgColor-default,#f0f6fc);
      font:inherit;font-weight:500;cursor:pointer;text-decoration:none!important}
    .ztpr-mbtn-primary{background:var(--button-primary-bgColor-rest,#238636);border-color:var(--button-primary-borderColor-rest,rgba(240,246,252,.1));
      color:var(--button-primary-fgColor-rest,#fff)!important;font-weight:600}
    .ztpr-fab-err:empty{display:none}
  `);

  // ---------- pomocnicze ----------
  const SVGNS = 'http://www.w3.org/2000/svg';
  function icon(name) {
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '12');
    svg.setAttribute('height', '12');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', D[name]);
    svg.appendChild(p);
    return svg;
  }

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'onclick') el.addEventListener('click', v);
        else if (k === 'style') el.style.cssText = v;
        else el.setAttribute(k, v);
      }
    }
    for (const k of kids.flat()) {
      if (k == null || k === false) continue;
      el.append(k instanceof Node ? k : String(k));
    }
    return el;
  }

  const stop = (fn) => (e) => { e.preventDefault(); e.stopPropagation(); fn(); };

  function plural(n, one, few, many) {
    if (n === 1) return one;
    const d = n % 10, dd = n % 100;
    return d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14) ? few : many;
  }

  function compact(n) {
    return n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',').replace(',0', '') + 'k' : String(n);
  }

  function relTime(iso) {
    const sec = (Date.now() - new Date(iso).getTime()) / 1000;
    if (sec < 60) return 'teraz';
    if (sec < 3600) return `${Math.max(1, Math.floor(sec / 60))} min temu`;
    if (sec < 86400) return `${Math.floor(sec / 3600)} godz. temu`;
    const d = Math.floor(sec / 86400);
    if (d < 14) return `${d} ${plural(d, 'dzień', 'dni', 'dni')} temu`;
    return `${Math.floor(d / 7)} tyg. temu`;
  }

  function fmtDate(iso) {
    return new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // ---------- ustawienia z menu Violentmonkey ----------
  function askToken() {
    const t = window.prompt(
      'Wklej token GitHub (fine-grained, "Pull requests: Read and write").\nZostaw puste, żeby usunąć token.',
      getPat()
    );
    if (t === null) return;
    GM_setValue('token', t.trim());
    if (t.trim()) GM_setValue('appAuth', null);
    resetAll();
  }

  function askRequired() {
    const v = window.prompt('Ile approvali jest wymaganych do merge? (0 = pokazuj samą liczbę approvali)', String(getRequired()));
    if (v === null) return;
    GM_setValue('requiredApprovals', Math.max(0, parseInt(v, 10) || 0));
    scheduleScan(0);
  }

  function askClientId() {
    const v = window.prompt('Client ID aplikacji GitHub (z ustawień aplikacji, zaczyna się od "Iv"):', getClientId());
    if (v === null) return;
    GM_setValue('clientId', v.trim());
    if (v.trim()) startDeviceLogin();
  }

  function logout() {
    GM_setValue('appAuth', null);
    GM_setValue('token', '');
    resetAll();
  }

  // Login użytkownika zalogowanego na stronie github.com (z meta tagu GitHuba).
  function pageLogin() {
    const m = document.querySelector('meta[name="user-login"]');
    return (m && m.content || '').trim();
  }

  function relogin() {
    GM_setValue('appAuth', null);
    GM_setValue('token', '');
    resetAll();
    authAction();
  }

  // Główna akcja "zaloguj": przez aplikację GitHub, a gdy jej nie ma, ręczny token.
  function authAction() {
    if (getClientId()) startDeviceLogin();
    else askToken();
  }

  if (getClientId()) GM_registerMenuCommand('Zaloguj przez GitHub', () => startDeviceLogin());
  GM_registerMenuCommand('Ustaw token ręcznie (PAT)', askToken);
  if (!APP_CLIENT_ID) GM_registerMenuCommand('Ustaw Client ID aplikacji', askClientId);
  GM_registerMenuCommand('Wyloguj', logout);
  GM_registerMenuCommand('Wymagana liczba approvali', askRequired);
  GM_registerMenuCommand('Odśwież dane PR', refreshAll);

  // ---------- logowanie przez aplikację GitHub (device flow) ----------
  const DEVICE_URL = 'https://github.com/login/device/code';
  const TOKEN_URL = 'https://github.com/login/oauth/access_token';

  function authErr(msg) {
    const e = new Error(msg);
    e.auth = true;
    return e;
  }

  function postForm(url, params) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url,
        timeout: 20000,
        anonymous: true,
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        data: new URLSearchParams(params).toString(),
        onload: (r) => {
          try { resolve(JSON.parse(r.responseText)); } catch (e) { reject(new Error('GitHub: HTTP ' + r.status)); }
        },
        onerror: () => reject(new Error('Brak połączenia z github.com')),
        ontimeout: () => reject(new Error('GitHub nie odpowiedział w 20 s')),
      });
    });
  }

  function saveAppAuth(r) {
    const now = Date.now();
    GM_setValue('appAuth', {
      accessToken: r.access_token,
      expiresAt: r.expires_in ? now + r.expires_in * 1000 : 0,
      refreshToken: r.refresh_token || null,
      refreshExpiresAt: r.refresh_token_expires_in ? now + r.refresh_token_expires_in * 1000 : 0,
    });
    GM_setValue('token', '');
  }

  let refreshing = null;
  function refreshAppToken() {
    if (!refreshing) refreshing = doRefresh().finally(() => { refreshing = null; });
    return refreshing;
  }

  async function doRefresh() {
    const before = getAppAuth();
    if (!before || !before.refreshToken) throw authErr('Logowanie wygasło. Zaloguj się ponownie.');
    let r = null;
    try {
      r = await postForm(TOKEN_URL, { client_id: getClientId(), grant_type: 'refresh_token', refresh_token: before.refreshToken });
    } catch (e) {
      throw e; // chwilowy problem z siecią: nie wylogowujemy
    }
    if (r && r.access_token) { saveAppAuth(r); return; }
    // inna karta mogła już odświeżyć logowanie tym samym kluczem
    const now = getAppAuth();
    if (now && now.accessToken !== before.accessToken) return;
    GM_setValue('appAuth', null);
    throw authErr('Logowanie wygasło. Zaloguj się ponownie.');
  }

  // Aktualny klucz do API: z logowania przez aplikację (odświeżany przed wygaśnięciem) albo ręczny token.
  async function ensureToken() {
    const a = getAppAuth();
    if (a) {
      if (a.expiresAt && Date.now() > a.expiresAt - 5 * 60 * 1000) {
        try { await refreshAppToken(); } catch (e) { if (e.auth) return ''; }
        const b = getAppAuth();
        return b ? b.accessToken : '';
      }
      return a.accessToken;
    }
    return getPat();
  }

  function copyText(t) {
    try { if (typeof GM_setClipboard === 'function') { GM_setClipboard(t, 'text'); return; } } catch (e) { /* dalej */ }
    try { navigator.clipboard.writeText(t); } catch (e) { /* trudno */ }
  }

  const DEVICE_ERRORS = {
    device_flow_disabled: 'W aplikacji GitHub nie jest włączone logowanie kodem. W ustawieniach aplikacji zaznacz "Enable Device Flow".',
    incorrect_client_credentials: 'Nieprawidłowy Client ID aplikacji.',
    access_denied: 'Logowanie zostało anulowane na GitHubie.',
    expired_token: 'Kod wygasł. Spróbuj jeszcze raz.',
  };

  let login = null; // { bg, cancelled }

  function closeLogin() {
    if (!login) return;
    login.cancelled = true;
    login.bg.remove();
    document.removeEventListener('keydown', login.onKey, true);
    login = null;
  }

  async function startDeviceLogin() {
    const clientId = getClientId();
    if (!clientId) { askClientId(); return; }
    closeLogin();
    const box = h('div', { class: 'ztpr-modal', role: 'dialog', 'aria-modal': 'true' });
    const bg = h('div', { class: 'ztpr-modal-bg' }, box);
    const me = { bg, box, cancelled: false };
    me.onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); closeLogin(); } };
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) closeLogin(); });
    document.addEventListener('keydown', me.onKey, true);
    login = me;
    document.body.appendChild(bg);

    const spin = () => { const i = icon('sync'); i.classList.add('ztpr-spin'); return i; };
    const showError = (msg) => {
      if (me.cancelled) return;
      box.replaceChildren(
        h('h3', null, 'Zaloguj przez GitHub'),
        h('div', { class: 'ztpr-fab-err' }, msg),
        h('div', { class: 'ztpr-modal-row' },
          h('button', { type: 'button', class: 'ztpr-mbtn', onclick: closeLogin }, 'Zamknij'),
          h('button', { type: 'button', class: 'ztpr-mbtn ztpr-mbtn-primary', onclick: () => startDeviceLogin() }, 'Spróbuj ponownie'))
      );
    };

    box.replaceChildren(h('h3', null, 'Zaloguj przez GitHub'), h('div', { class: 'ztpr-modal-wait' }, spin(), 'Łączę z GitHubem'));

    let dc;
    try {
      dc = await postForm(DEVICE_URL, { client_id: clientId });
    } catch (e) {
      showError(e.message);
      return;
    }
    if (me.cancelled) return;
    if (!dc || !dc.device_code) {
      showError((dc && (DEVICE_ERRORS[dc.error] || dc.error_description || dc.error)) || 'GitHub nie zwrócił kodu logowania.');
      return;
    }

    const verify = dc.verification_uri || 'https://github.com/login/device';
    box.replaceChildren(
      h('h3', null, 'Zaloguj przez GitHub'),
      h('div', null, '1. Kliknij \u201eOtwórz GitHub\u201d. Kod skopiuje się sam.'),
      h('div', null, '2. Wklej kod na GitHubie i zatwierdź dostęp.'),
      h('div', { class: 'ztpr-modal-wait' }, pageLogin()
        ? `Na GitHubie musisz być zalogowany jako ${pageLogin()} (prawy górny róg). Skrypt działa jako konto, które zatwierdzi kod.`
        : 'Skrypt działa jako konto GitHub, które zatwierdzi kod. Sprawdź login w prawym górnym rogu.'),
      h('div', { class: 'ztpr-modal-code', title: 'Kod logowania' }, dc.user_code),
      h('div', { class: 'ztpr-modal-wait' }, spin(), 'Czekam na potwierdzenie na GitHubie'),
      h('div', { class: 'ztpr-modal-row' },
        h('button', { type: 'button', class: 'ztpr-mbtn', onclick: closeLogin }, 'Anuluj'),
        h('button', { type: 'button', class: 'ztpr-mbtn', onclick: () => copyText(dc.user_code) }, 'Kopiuj kod'),
        h('a', { class: 'ztpr-mbtn ztpr-mbtn-primary', href: verify, target: '_blank', rel: 'noopener', onclick: () => copyText(dc.user_code) }, 'Otwórz GitHub'))
    );

    let interval = (dc.interval || 5) * 1000;
    const deadline = Date.now() + (dc.expires_in || 900) * 1000;
    while (!me.cancelled && Date.now() < deadline) {
      await new Promise((res) => setTimeout(res, interval));
      if (me.cancelled) return;
      let r;
      try {
        r = await postForm(TOKEN_URL, { client_id: clientId, device_code: dc.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
      } catch (e) {
        continue; // chwilowy problem z siecią, próbujemy dalej
      }
      if (me.cancelled) return;
      if (r && r.access_token) {
        saveAppAuth(r);
        let who = '';
        try {
          const v = await gql('query ZtPrWhoAmI { viewer { login } }');
          who = (v.data && v.data.viewer && v.data.viewer.login) || '';
        } catch (e) { /* nieważne */ }
        if (me.cancelled) return;
        resetAll();
        const onPage = pageLogin();
        if (who && onPage && who.toLowerCase() !== onPage.toLowerCase()) {
          box.replaceChildren(
            h('h3', null, 'Zaloguj przez GitHub'),
            h('div', { class: 'ztpr-fab-err' },
              `Zalogowano jako ${who}, a na tej stronie GitHuba jesteś ${onPage}.\n` +
              `Review będą wysyłane jako ${who}. Jeśli to pomyłka, przełącz konto na github.com na ${onPage} i zaloguj się ponownie.`),
            h('div', { class: 'ztpr-modal-row' },
              h('button', { type: 'button', class: 'ztpr-mbtn', onclick: closeLogin }, 'Zostaw'),
              h('button', { type: 'button', class: 'ztpr-mbtn ztpr-mbtn-primary', onclick: relogin }, 'Zaloguj ponownie'))
          );
          return;
        }
        box.replaceChildren(
          h('h3', null, 'Zaloguj przez GitHub'),
          h('div', { class: 'ztpr-modal-ok' }, icon('check'), who ? `Zalogowano jako ${who}` : 'Zalogowano')
        );
        setTimeout(closeLogin, 1200);
        return;
      }
      const err = r && r.error;
      if (err === 'authorization_pending') continue;
      if (err === 'slow_down') { interval = r.interval ? r.interval * 1000 : interval + 5000; continue; }
      showError(DEVICE_ERRORS[err] || (r && r.error_description) || err || 'Logowanie się nie udało.');
      return;
    }
    if (!me.cancelled) showError(DEVICE_ERRORS.expired_token);
  }

  // ---------- GraphQL ----------
  const FRAGMENT = `
fragment ztpr on PullRequest {
  number
  isDraft
  mergeable
  mergeStateStatus
  reviewDecision
  additions
  deletions
  updatedAt
  author { login }
  reactions(first: 1, orderBy: { field: CREATED_AT, direction: DESC }) { nodes { createdAt content user { login } } }
  convComments: comments(last: 10) {
    nodes { reactions(first: 1, orderBy: { field: CREATED_AT, direction: DESC }) { nodes { createdAt content user { login } } } }
  }
  latestReviews(first: 20) {
    nodes { state author { __typename login avatarUrl(size: 40) } }
  }
  latestOpinionatedReviews(first: 20, writersOnly: true) {
    nodes { state author { login avatarUrl(size: 40) } }
  }
  reviewRequests(first: 20) {
    nodes {
      requestedReviewer {
        __typename
        ... on User { login avatarUrl(size: 40) }
        ... on Bot { login avatarUrl(size: 40) }
        ... on Mannequin { login avatarUrl(size: 40) }
        ... on Team { slug name }
      }
    }
  }
  viewerLatestReviewRequest {
    requestedReviewer {
      __typename
      ... on User { login }
      ... on Team { slug }
    }
  }
  reviewThreads(first: 100) {
    totalCount
    nodes {
      isResolved
      isOutdated
      participants: comments(first: 20) { nodes { author { login avatarUrl(size: 40) } } }
      lastComment: comments(last: 1) {
        nodes {
          author { login }
          createdAt
          reactions(first: 1, orderBy: { field: CREATED_AT, direction: DESC }) { nodes { createdAt content user { login } } }
        }
      }
    }
  }
}`;

  function buildQuery(chunk) {
    const repos = new Map();
    for (const it of chunk) {
      const rk = it.owner.toLowerCase() + '/' + it.name.toLowerCase();
      if (!repos.has(rk)) repos.set(rk, { owner: it.owner, name: it.name, items: [] });
      repos.get(rk).items.push(it);
    }
    const list = [...repos.values()];
    const parts = list.map((r, i) =>
      `  r${i}: repository(owner: ${JSON.stringify(r.owner)}, name: ${JSON.stringify(r.name)}) {\n` +
      r.items.map((it) => `    p${it.number}: pullRequest(number: ${it.number}) { ...ztpr }\n`).join('') +
      '  }\n'
    );
    return { list, query: `query ZtPrBadges {\n  viewer { login }\n${parts.join('')}}\n${FRAGMENT}` };
  }

  async function gql(query, variables, retried) {
    const token = await ensureToken();
    if (!token) throw authErr(appMode() ? 'Nie jesteś zalogowany. Kliknij, żeby zalogować się przez GitHub.' : 'Brak tokena GitHub.');
    try {
      return await gqlRaw(token, query, variables);
    } catch (e) {
      const a = getAppAuth();
      if (e.auth && !retried && a && a.refreshToken) {
        try { await refreshAppToken(); } catch (x) { /* poniżej ponowna próba albo błąd logowania */ }
        return gql(query, variables, true);
      }
      throw e;
    }
  }

  function gqlRaw(token, query, variables) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: API,
        timeout: 20000,
        anonymous: true,
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        data: JSON.stringify(variables ? { query, variables } : { query }),
        onload: (r) => {
          let body = null;
          try { body = JSON.parse(r.responseText); } catch (e) { /* brak JSON */ }
          if (r.status === 401) {
            const err = new Error(appMode() ? 'Logowanie wygasło (HTTP 401). Zaloguj się ponownie.' : 'Token nieprawidłowy albo wygasł (HTTP 401). Ustaw nowy w menu Violentmonkey.');
            err.auth = true;
            return reject(err);
          }
          if (r.status >= 400 || !body) {
            return reject(new Error('GitHub API: HTTP ' + r.status + (body && body.message ? ', ' + body.message : '')));
          }
          resolve(body);
        },
        onerror: () => reject(new Error('Brak połączenia z api.github.com')),
        ontimeout: () => reject(new Error('API GitHuba nie odpowiedziało w 20 s')),
      });
    });
  }

  // ---------- stan ----------
  // cache: klucz PR -> { pr, ts, at } albo { error, ts, auth }
  //   ts = kiedy dane uznajemy za świeże (0 = do odświeżenia), at = kiedy zostały pobrane
  const cache = new Map();
  const inflight = new Set();
  let viewer = GM_getValue('viewer', null) || null;

  // Zapamiętane wyniki z poprzednich wizyt: pokazujemy je od razu, a świeże dane pobieramy w tle.
  const STORE_KEY = 'prCache';
  const STORE_MAX = 200;
  (function hydrate() {
    const saved = GM_getValue(STORE_KEY, null);
    if (!saved || typeof saved !== 'object') return;
    for (const [k, v] of Object.entries(saved)) {
      if (v && v.pr) cache.set(k, { pr: v.pr, at: v.at || 0, ts: 0 });
    }
  })();

  let persistTimer = null;
  function persistSoon() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      const entries = [...cache.entries()]
        .filter(([, v]) => v && v.pr)
        .sort((x, y) => (y[1].at || 0) - (x[1].at || 0))
        .slice(0, STORE_MAX);
      const out = {};
      for (const [k, v] of entries) out[k] = { pr: v.pr, at: v.at };
      GM_setValue(STORE_KEY, out);
      if (viewer) GM_setValue('viewer', viewer);
    }, 1000);
  }

  // Zmiana tokena: czyścimy wszystko, bo dane zależą od konta.
  function resetAll() {
    cache.clear();
    viewer = null;
    GM_setValue(STORE_KEY, {});
    GM_setValue('viewer', null);
    if (fab) { closeReviewPanel(fab); fab.el.remove(); fab = null; }
    scheduleScan(0);
  }

  // Ręczne odświeżenie: dane zostają na ekranie, nowe pobierają się w tle.
  function refreshAll() {
    softInvalidate(0);
    scheduleScan(0);
  }

  function softInvalidate(maxAgeMs) {
    const now = Date.now();
    for (const e of cache.values()) if (!e.auth && now - e.ts > maxAgeMs) e.ts = 0;
  }

  // Plakietka w lewym dolnym rogu: trwa synchronizacja z GitHubem, potem krótko wynik.
  // Tylko po wejściu na kartę (otwarcie listy, zmiana adresu, powrót do karty), nie przy cichym odświeżaniu co TTL_MS.
  let announce = true;
  const announced = new Set();
  let syncEl = null;
  let syncHideTimer = null;
  let syncFailed = false;
  function updateSyncIndicator() {
    if (!syncEl) syncEl = h('div', { class: 'ztpr-sync', role: 'status' });
    clearTimeout(syncHideTimer);
    if (announced.size > 0) {
      const spin = icon('sync');
      spin.classList.add('ztpr-spin');
      syncEl.className = 'ztpr-sync';
      syncEl.replaceChildren(spin, `Synchronizacja z GitHubem: ${announced.size} PR`);
      syncEl.dataset.busy = '1';
      if (!syncEl.isConnected) document.body.appendChild(syncEl);
      return;
    }
    if (!syncEl.isConnected || !syncEl.dataset.busy) return;
    delete syncEl.dataset.busy;
    syncEl.className = 'ztpr-sync ' + (syncFailed ? 'ztpr-sync-err' : 'ztpr-sync-ok');
    syncEl.replaceChildren(icon(syncFailed ? 'alert' : 'check'), syncFailed ? 'Synchronizacja nie powiodła się' : 'Zsynchronizowano');
    syncHideTimer = setTimeout(() => syncEl.remove(), syncFailed ? 4000 : 1500);
  }

  function fetchMissing(items) {
    const todo = items.filter((it) => !inflight.has(it.key));
    if (!todo.length) return;
    if (announce && !announced.size) syncFailed = false;
    todo.forEach((it) => inflight.add(it.key));
    if (announce) todo.forEach((it) => announced.add(it.key));
    updateSyncIndicator();
    for (let i = 0; i < todo.length; i += BATCH) runChunk(todo.slice(i, i + BATCH));
  }

  async function runChunk(chunk) {
    const { list, query } = buildQuery(chunk);
    try {
      const body = await gql(query);
      const data = body.data || {};
      if (data.viewer && data.viewer.login) viewer = data.viewer.login;
      const errMsg = (body.errors || []).map((e) => e.message).join('; ');
      const now = Date.now();
      list.forEach((r, i) => {
        const repo = data['r' + i];
        for (const it of r.items) {
          const pr = repo && repo['p' + it.number];
          cache.set(it.key, pr ? { pr, ts: now, at: now } : { error: errMsg || 'Brak danych o tym PR', ts: now });
        }
      });
      persistSoon();
    } catch (e) {
      syncFailed = true;
      const now = Date.now();
      for (const it of chunk) {
        const prev = cache.get(it.key);
        // chwilowy błąd sieci: zostawiamy ostatnie dane zamiast pokazywać błąd
        if (prev && prev.pr && !e.auth) cache.set(it.key, Object.assign({}, prev, { ts: now }));
        else cache.set(it.key, { error: e.message, ts: now, auth: !!e.auth });
      }
    } finally {
      chunk.forEach((it) => { inflight.delete(it.key); announced.delete(it.key); });
      updateSyncIndicator();
      scheduleScan(0);
    }
  }

  // ---------- analiza PR ----------
  function analyze(pr) {
    const reviews = ((pr.latestOpinionatedReviews || {}).nodes || []).filter((x) => x && x.author);
    const approved = reviews.filter((x) => x.state === 'APPROVED');
    const changes = reviews.filter((x) => x.state === 'CHANGES_REQUESTED');
    const requested = ((pr.reviewRequests || {}).nodes || []).map((n) => n && n.requestedReviewer).filter(Boolean);
    // Reviewerzy, którzy zostawili tylko komentarz: GitHub zdejmuje ich z próśb o review, a approvala nie dali.
    const commented = ((pr.latestReviews || {}).nodes || [])
      .filter((x) => x && x.state === 'COMMENTED' && x.author && x.author.__typename !== 'Bot')
      .filter((x) => !pr.author || x.author.login !== pr.author.login)
      .map((x) => ({ login: x.author.login, avatarUrl: x.author.avatarUrl, commented: true }));

    const rt = pr.reviewThreads || { totalCount: 0, nodes: [] };
    const threadsTotal = rt.totalCount || 0;
    const open = (rt.nodes || []).filter((t) => t && !t.isResolved);
    const openOutdated = open.filter((t) => t.isOutdated).length;

    const isAuthor = !!viewer && !!pr.author && pr.author.login === viewer;
    // Otwarte wątki, w których ostatnia aktywność (komentarz albo reakcja na ostatni komentarz) nie jest moja:
    //   replyStarted - wątek zacząłem ja,
    //   replyJoined  - zaczął ktoś inny, a ja w nim piszę albo jestem autorem PR.
    let replyStarted = 0;
    let replyJoined = 0;
    if (viewer) {
      for (const t of open) {
        const last = lastActor(t);
        if (!last || last === viewer) continue;
        const people = ((t.participants || {}).nodes || []).map((c) => c && c.author && c.author.login);
        if (people[0] === viewer) replyStarted++;
        else if (isAuthor || people.includes(viewer)) replyJoined++;
      }
    }
    const replyNeeded = replyStarted + replyJoined;

    const vr = pr.viewerLatestReviewRequest && pr.viewerLatestReviewRequest.requestedReviewer;
    const reviewRequested = !!viewer && !isAuthor && requested.some((x) =>
      (x.__typename === 'User' && x.login === viewer) ||
      (x.__typename === 'Team' && vr && vr.__typename === 'Team' && vr.slug === x.slug)
    );

    // Kto komentuje w wątkach review (bez autora PR): w ilu wątkach, w tym otwartych
    const byLogin = new Map();
    for (const t of rt.nodes || []) {
      if (!t) continue;
      const seen = new Set();
      for (const c of (t.participants || {}).nodes || []) {
        const au = c && c.author;
        if (!au || !au.login || seen.has(au.login)) continue;
        if (pr.author && au.login === pr.author.login) continue;
        seen.add(au.login);
        const e = byLogin.get(au.login) || { login: au.login, avatarUrl: au.avatarUrl, threads: 0, open: 0 };
        e.threads++;
        if (!t.isResolved) e.open++;
        byLogin.set(au.login, e);
      }
    }
    const commenters = [...byLogin.values()].sort((x, y) => (y.open > 0) - (x.open > 0) || y.threads - x.threads);

    return {
      approved, changes, requested, commented, threadsTotal, commenters,
      open: open.length, openOutdated, replyNeeded, replyStarted, replyJoined, reviewRequested,
      mine: reviewRequested || replyNeeded > 0,
    };
  }

  // Kto ostatni coś zrobił w wątku: autor ostatniego komentarza albo ktoś, kto później dodał do niego reakcję.
  function lastActor(t) {
    const node = ((t.lastComment || {}).nodes || [])[0];
    if (!node) return null;
    const reaction = ((node.reactions || {}).nodes || [])[0];
    if (reaction && reaction.user && node.createdAt && reaction.createdAt > node.createdAt) return reaction.user.login;
    return node.author && node.author.login;
  }

  const REACTION_EMOJI = { THUMBS_UP: '👍', THUMBS_DOWN: '👎', LAUGH: '😄', HOORAY: '🎉', CONFUSED: '😕', HEART: '❤️', ROCKET: '🚀', EYES: '👀' };

  // updatedAt GitHuba pomija reakcje emotkami, więc bierzemy późniejszą datę: updatedAt albo najnowszą reakcję
  // (na opis PR, na ostatnie komentarze w rozmowie i na ostatni komentarz każdego wątku review).
  function lastActivity(pr) {
    let best = { at: pr.updatedAt };
    const latest = (x) => ((x && x.reactions && x.reactions.nodes) || [])[0];
    const consider = (r) => {
      if (r && r.createdAt && r.createdAt > best.at) {
        best = { at: r.createdAt, reaction: REACTION_EMOJI[r.content] || r.content, who: r.user && r.user.login };
      }
    };
    consider(latest(pr));
    for (const c of (pr.convComments && pr.convComments.nodes) || []) consider(latest(c));
    for (const t of (pr.reviewThreads && pr.reviewThreads.nodes) || []) consider(latest(((t.lastComment || {}).nodes || [])[0]));
    return best;
  }

  // ---------- budowanie znaczników ----------
  const MAX_AV_OK = 3;   // ile awatarów zatwierdzających pokazać w etykiecie
  const MAX_AV_WAIT = 2; // ile awatarów oczekujących pokazać w etykiecie
  const MAX_AV_COMMENT = 3; // ile awatarów komentujących pokazać w etykiecie wątków

  function buildBadges(r, pr) {
    const a = analyze(pr);
    const req = getRequired();
    const prUrl = `/${r.owner}/${r.name}/pull/${r.number}`;
    const col = (name, ...kids) => h('span', { class: 'ztpr-col ztpr-col-' + name }, ...kids);
    const av = (login, url, cls, title) => h('img', {
      class: 'ztpr-av' + (cls ? ' ' + cls : ''), src: url || `https://avatars.githubusercontent.com/${login}?s=40`,
      alt: login, title, loading: 'lazy',
    });
    const more = (count, title) => (count > 0 ? h('span', { class: 'ztpr-more', title }, '+' + count) : null);

    // Kolumna 1: approvale + awatary (kolorowe: zatwierdzili, szare: przypisani do review bez approvala)
    const approvedLogins = new Set(a.approved.map((x) => x.author.login));
    const changesLogins = new Set(a.changes.map((x) => x.author.login));
    const reRequested = new Set();
    const waitingUsers = [];
    const teams = [];
    for (const x of a.requested) {
      if (x.__typename === 'Team') { teams.push(x); continue; }
      if (!x.login) continue;
      if (approvedLogins.has(x.login) || changesLogins.has(x.login)) reRequested.add(x.login);
      else waitingUsers.push(x);
    }
    for (const x of a.commented) {
      if (approvedLogins.has(x.login) || changesLogins.has(x.login) || waitingUsers.some((w) => w.login === x.login)) continue;
      waitingUsers.push(x);
    }
    const waitingNames = [...waitingUsers.map((x) => x.login), ...teams.map((t) => 'zespół ' + (t.slug || t.name))];

    const n = a.approved.length;
    const approvedOk = pr.reviewDecision === 'APPROVED' || (req > 0 && n >= req);
    const apprTitle = [
      a.reviewRequested ? 'Jesteś poproszony o review tego PR' : '',
      `Approvale: ${n}` + (req ? ` z ${req} wymaganych` : ''),
      n ? 'Zatwierdzili: ' + a.approved.map((x) => x.author.login).join(', ') : 'Nikt jeszcze nie zatwierdził',
      waitingNames.length ? 'Czekamy na: ' + waitingNames.join(', ') : '',
    ].filter(Boolean).join('\n');

    const apprKids = [icon('check'), h('span', { class: 'ztpr-num' }, req ? `${n}/${req}` : String(n))];
    if (n) {
      const shown = a.approved.slice(0, MAX_AV_OK);
      apprKids.push(h('span', { class: 'ztpr-stack' }, shown.map((x) => av(
        x.author.login, x.author.avatarUrl, '',
        `${x.author.login}: zatwierdził` + (reRequested.has(x.author.login) ? ' (poproszony ponownie o review)' : '')
      )), more(n - shown.length, apprTitle)));
    }
    const waitCount = waitingUsers.length + teams.length;
    if (waitCount) {
      const shown = waitingUsers.slice(0, MAX_AV_WAIT);
      apprKids.push(h('span', { class: 'ztpr-stack ztpr-stack-wait' },
        shown.map((x) => av(x.login, x.avatarUrl, 'ztpr-av-wait', x.commented ? `${x.login}: skomentował, bez approvala` : `${x.login}: czeka na jego review`)),
        shown.length ? more(waitCount - shown.length, 'Czekamy na: ' + waitingNames.join(', '))
          : h('span', { class: 'ztpr-more', title: 'Czekamy na: ' + waitingNames.join(', ') }, icon('people'), String(waitCount))
      ));
    }
    const apprChip = h('span', {
      class: 'ztpr-chip ' + (approvedOk ? 'ztpr-success' : n ? '' : 'ztpr-muted') + (a.reviewRequested ? ' ztpr-ask' : ''), title: apprTitle,
    }, apprKids);

    // Kolumna 2: prośby o zmiany
    let changesChip = null;
    if (a.changes.length) {
      const shown = a.changes.slice(0, 2);
      changesChip = h('span', {
        class: 'ztpr-chip ztpr-danger',
        title: 'Prośba o zmiany: ' + a.changes.map((x) => x.author.login).join(', '),
      },
        icon('x'), h('span', { class: 'ztpr-num' }, String(a.changes.length)),
        h('span', { class: 'ztpr-stack' }, shown.map((x) => av(
          x.author.login, x.author.avatarUrl, '',
          `${x.author.login}: prosi o zmiany` + (reRequested.has(x.author.login) ? ' (poproszony ponownie o review)' : '')
        )))
      );
    }

    // Kolumna 3: wątki rozwiązane / wszystkie + awatary komentujących (kolorowe: mają otwarte wątki, szare: wszystkie rozwiązane).
    // Strzałka: w otwartych wątkach jest nowa aktywność innych (komentarz albo reakcja).
    // Niebieski: w wątku, który zacząłeś. Fiolet: w cudzym wątku, w którym piszesz (albo na Twoim PR).
    const resolved = Math.max(0, a.threadsTotal - a.open);
    const tCls = a.replyStarted > 0 ? 'ztpr-accent' : a.replyJoined > 0 ? 'ztpr-done' : a.open > 0 ? 'ztpr-attention' : a.threadsTotal > 0 ? 'ztpr-success' : 'ztpr-muted';
    const waits = (n, where) => (n > 0 ? `Nowa aktywność innych (komentarz lub reakcja) ${where}: ${n}\n` : '');
    let tTitle = waits(a.replyStarted, 'w wątkach, które zacząłeś') + waits(a.replyJoined, 'w wątkach innych osób') +
      `Rozwiązane wątki review: ${resolved} z ${a.threadsTotal}`;
    if (a.open) tTitle += `\nOtwarte: ${a.open}`;
    if (a.openOutdated) tTitle += `, w tym ${a.openOutdated} ${plural(a.openOutdated, 'nieaktualny', 'nieaktualne', 'nieaktualnych')} (kod się zmienił)`;
    const whoTitle = (x) => `${x.login}: ${x.threads} ${plural(x.threads, 'wątek', 'wątki', 'wątków')}` +
      (x.open ? `, ${x.open} ${plural(x.open, 'otwarty', 'otwarte', 'otwartych')}` : x.threads === 1 ? ', rozwiązany' : ', wszystkie rozwiązane');
    if (a.commenters.length) tTitle += '\nKomentują:\n' + a.commenters.map(whoTitle).join('\n');
    const threadKids = [icon(a.replyNeeded > 0 ? 'reply' : 'comment'), h('span', { class: 'ztpr-num' }, `${resolved}/${a.threadsTotal}`)];
    if (a.commenters.length) {
      const shown = a.commenters.slice(0, MAX_AV_COMMENT);
      threadKids.push(h('span', { class: 'ztpr-stack' },
        shown.map((x) => av(x.login, x.avatarUrl, x.open ? '' : 'ztpr-av-wait', whoTitle(x))),
        more(a.commenters.length - shown.length, tTitle)));
    }
    const threadsChip = h('a', { class: 'ztpr-chip ' + tCls, href: prUrl, title: tTitle }, threadKids);

    // Kolumna 4: stan gałęzi (jedna etykieta: konflikt, za base albo draft)
    let statusChip = null;
    if (pr.mergeable === 'CONFLICTING' || pr.mergeStateStatus === 'DIRTY') {
      statusChip = h('span', { class: 'ztpr-chip ztpr-danger', title: 'PR ma konflikty z gałęzią bazową' }, icon('alert'), 'konflikt');
    } else if (pr.mergeStateStatus === 'BEHIND') {
      statusChip = h('span', { class: 'ztpr-chip ztpr-attention', title: 'Gałąź jest w tyle za gałęzią bazową, trzeba ją zaktualizować' }, icon('sync'), 'za base');
    } else if (pr.isDraft) {
      statusChip = h('span', { class: 'ztpr-chip ztpr-muted', title: 'PR jest w wersji roboczej' }, 'draft');
    }

    // Kolumna 5: zmienione linie
    const linesChip = h('a', {
      class: 'ztpr-chip ztpr-plain ztpr-muted', href: prUrl + '/files',
      title: `${pr.additions} dodanych i ${pr.deletions} usuniętych linii`,
    },
      h('span', { class: 'ztpr-add' }, '+' + compact(pr.additions)),
      h('span', { class: 'ztpr-del' }, '−' + compact(pr.deletions))
    );

    // Kolumna 6: ostatnia aktywność
    const act = lastActivity(pr);
    const ageDays = (Date.now() - new Date(act.at).getTime()) / 86400000;
    const ageChip = h('span', {
      class: 'ztpr-chip ztpr-plain ' + (ageDays >= STALE_DAYS ? 'ztpr-attention' : 'ztpr-muted'),
      title: 'Ostatnia aktywność w PR: ' + fmtDate(act.at) + (act.reaction ? `\nReakcja ${act.reaction} od ${act.who || 'kogoś'}` : ''),
    }, icon('clock'), relTime(act.at));

    const out = [
      col('appr', apprChip),
      col('changes', changesChip),
      col('threads', threadsChip),
      col('status', statusChip),
      col('lines', linesChip),
      col('age', ageChip),
    ];
    return { nodes: out, mine: a.mine };
  }

  // ---------- przycisk "Review" na stronie PR ----------
  const PR_PAGE = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/(?:commits|checks))?\/?$/;

  const PR_QUERY = `query ZtPrReviewInfo($owner: String!, $name: String!, $number: Int!) {
  viewer { login avatarUrl(size: 40) }
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      id
      state
      headRefOid
      viewerDidAuthor
      viewerLatestReview { state commit { oid } }
      pending: reviews(first: 5, states: PENDING) { nodes { id author { login } } }
      reviewThreads(first: 100) {
        nodes { path line originalLine comments(first: 50) { nodes { databaseId } } }
      }
    }
  }
}`;

  const REVIEW_NEW = `mutation ZtPrReview($id: ID!, $event: PullRequestReviewEvent!, $body: String) {
  addPullRequestReview(input: { pullRequestId: $id, event: $event, body: $body }) {
    pullRequestReview { state }
  }
}`;

  const REVIEW_PENDING = `mutation ZtPrReviewPending($rid: ID!, $event: PullRequestReviewEvent!, $body: String) {
  submitPullRequestReview(input: { pullRequestReviewId: $rid, event: $event, body: $body }) {
    pullRequestReview { state }
  }
}`;

  const REVIEW_EVENTS = [
    { id: 'COMMENT', label: 'Comment', hint: 'Uwagi bez zatwierdzania.' },
    { id: 'APPROVE', label: 'Approve', hint: 'Zatwierdź zmiany.' },
    { id: 'REQUEST_CHANGES', label: 'Request changes', hint: 'Uwagi, które trzeba poprawić przed merge.' },
  ];

  let fab = null; // { key, el, pop, owner, name, number, pr, login, avatar, busy, draft }

  function prPageTick() {
    const m = location.pathname.match(PR_PAGE);
    const key = m ? `${m[1]}/${m[2]}#${m[3]}`.toLowerCase() : null;
    if (fab && fab.key !== key) { closeReviewPanel(fab); fab.el.remove(); fab = null; }
    if (!m || !hasAuth()) return;
    if (fab) {
      // GitHub potrafi przerysować nagłówek PR: wtedy wstawiamy przycisk ponownie,
      // a jeśli wisiał w rogu, a pasek zakładek już się pojawił, przenosimy go na górę
      const now = Date.now();
      if (!fab.el.isConnected || (!fab.el.classList.contains('ztpr-inline') && now - (fab.lastFind || 0) > 2000)) {
        fab.lastFind = now;
        placeFab(fab.el);
        positionPanel(fab);
      }
      decorateThreadPaths(fab);
      return;
    }
    const el = h('div', { class: 'ztpr-fab', style: 'display:none' });
    fab = { key, el, pop: null, owner: m[1], name: m[2], number: +m[3], pr: null, busy: false, draft: null };
    placeFab(el);
    loadPrInfo(fab);
  }

  // Szuka licznika zmienionych linii ("+122 -41") obok zakładki "Files changed".
  function findDiffstat() {
    const d = document.getElementById('diffstat');
    if (d && d.offsetParent !== null) return d;
    const m = location.pathname.match(PR_PAGE);
    if (!m) return null;
    const base = `/${m[1]}/${m[2]}/pull/${m[3]}`.toLowerCase();
    let tab = null;
    for (const a of document.querySelectorAll('a[href*="/pull/"]')) {
      if (a.closest('.ztpr-fab')) continue;
      const path = a.pathname.toLowerCase().replace(/\/$/, '');
      if (path === base + '/files' || path === base + '/changes') { tab = a; break; }
    }
    if (!tab) return null;
    let scope = tab.parentElement;
    for (let i = 0; scope && scope !== document.body && i < 7; i++, scope = scope.parentElement) {
      const hit = smallestDiffstatIn(scope);
      if (hit) return hit;
    }
    return null;
  }

  // Najmniejszy element, którego tekst to "+liczba ... -liczba".
  function smallestDiffstatIn(scope) {
    let best = null;
    let bestLen = Infinity;
    for (const el of scope.querySelectorAll('span, div')) {
      if (el.closest('.ztpr-fab')) continue;
      const t = (el.textContent || '').replace(/\s+/g, '');
      if (!t || t.length > 40 || t[0] !== '+') continue;
      if (!/^\+[\d,.]+k?/.test(t) || !/[-−–][\d,.]+k?/.test(t)) continue;
      if (t.length < bestLen) { best = el; bestLen = t.length; }
    }
    return best;
  }

  // Zakładka "Conversation" (link do samego PR na pasku zakładek).
  function findConversationTab() {
    const m = location.pathname.match(PR_PAGE);
    if (!m) return null;
    const base = `/${m[1]}/${m[2]}/pull/${m[3]}`.toLowerCase();
    for (const a of document.querySelectorAll('a[href*="/pull/"]')) {
      if (a.closest('.ztpr-fab') || a.offsetParent === null) continue;
      if (a.pathname.toLowerCase().replace(/\/$/, '') !== base) continue;
      if (!a.closest('nav, [role="tablist"], .tabnav-tabs, .tabnav')) continue;
      return a;
    }
    return null;
  }

  // Przycisk stoi na pasku zakładek przed "Conversation". Gdy go nie ma: przed "+122 -41",
  // a w ostateczności w prawym dolnym rogu.
  function placeFab(el) {
    const tab = findConversationTab();
    const target = tab ? (tab.parentElement && tab.parentElement.tagName === 'LI' ? tab.parentElement : tab) : findDiffstat();
    if (target) {
      el.classList.add('ztpr-inline');
      el.classList.toggle('ztpr-at-tabs', !!tab);
      if (el.nextElementSibling !== target) target.before(el);
    } else {
      el.classList.remove('ztpr-inline', 'ztpr-at-tabs');
      if (el.parentElement !== document.body) document.body.appendChild(el);
    }
  }

  async function loadPrInfo(f) {
    try {
      const body = await gql(PR_QUERY, { owner: f.owner, name: f.name, number: f.number });
      if (fab !== f) return;
      const d = body.data || {};
      if (d.viewer && d.viewer.login) {
        viewer = d.viewer.login;
        f.login = d.viewer.login;
        f.avatar = d.viewer.avatarUrl;
      }
      f.pr = d.repository && d.repository.pullRequest;
      renderReviewButton(f);
      await indexThreadPaths(f);
    } catch (e) {
      // na stronie PR nie pokazujemy błędów, lista PR i tak je pokaże
    }
  }

  // Skrypt zalogowany na inne konto niż to, które jest zalogowane na stronie github.com.
  function wrongAccount(f) {
    const onPage = pageLogin();
    return !!(onPage && f.login && onPage.toLowerCase() !== f.login.toLowerCase());
  }

  function pendingReviewId(pr) {
    const nodes = (pr.pending && pr.pending.nodes) || [];
    const mine = nodes.find((n) => n && (!n.author || !viewer || n.author.login === viewer));
    return mine ? mine.id : null;
  }

  function reviewErrorText(msg) {
    if (/not accessible by (personal access token|integration)|Resource not accessible/i.test(msg)) {
      if (appMode()) {
        return 'Aplikacja GitHub nie może wysłać review. Sprawdź, czy jest zainstalowana na tym repo ' +
          'i ma uprawnienie "Pull requests: Read and write".\n\nOdpowiedź GitHuba: ' + msg;
      }
      return 'GitHub nie pozwala temu tokenowi wysyłać review. Sprawdź na github.com/settings/personal-access-tokens, ' +
        'czy token ma "Pull requests: Read and write" i czy nie czeka na zatwierdzenie przez organizację ("Pending").\n\nOdpowiedź GitHuba: ' + msg;
    }
    if (/own pull request/i.test(msg)) return 'Na własnym PR możesz tylko dodać komentarz.';
    return msg;
  }

  async function sendReview(f, event, text) {
    const rid = pendingReviewId(f.pr);
    const body = text && text.trim() ? text.trim() : null;
    const res = rid
      ? await gql(REVIEW_PENDING, { rid, event, body })
      : await gql(REVIEW_NEW, { id: f.pr.id, event, body });
    if (res.errors && res.errors.length) throw new Error(res.errors.map((e) => e.message).join('; '));
    const payload = res.data && (rid ? res.data.submitPullRequestReview : res.data.addPullRequestReview);
    if (!payload || !payload.pullRequestReview) throw new Error('GitHub nie potwierdził review.');
  }

  function renderReviewButton(f) {
    const pr = f.pr;
    if (!pr || pr.state !== 'OPEN') {
      closeReviewPanel(f);
      f.el.style.display = 'none';
      f.el.replaceChildren();
      return;
    }
    f.el.style.display = '';

    const my = pr.viewerLatestReview;
    const onHead = !!(my && my.commit && my.commit.oid === pr.headRefOid);
    let cls = 'ztpr-fab-btn';
    let ic = 'comment';
    let label = 'Review';
    let title = `Review jako ${f.login}`;
    if (my && my.state === 'APPROVED' && onHead) {
      cls += ' ztpr-rv-ok'; ic = 'check'; label = 'Approved';
      title = `Zatwierdziłeś najnowszy commit jako ${f.login}. Kliknij, żeby dodać kolejny review.`;
    } else if (my && my.state === 'CHANGES_REQUESTED') {
      cls += ' ztpr-rv-changes'; ic = 'x'; label = 'Changes requested';
      title = `Poprosiłeś o zmiany jako ${f.login}. Kliknij, żeby dodać kolejny review.`;
    } else if (my && my.state === 'APPROVED') {
      title = `Zatwierdziłeś wcześniejszą wersję jako ${f.login}, od tego czasu doszły nowe commity`;
    }
    if (wrongAccount(f)) {
      cls = 'ztpr-fab-btn ztpr-rv-warn'; ic = 'alert';
      title = `Skrypt jest zalogowany jako ${f.login}, a na GitHubie jesteś ${pageLogin()}`;
    }
    if (f.pop) cls += ' ztpr-active';
    f.el.replaceChildren(h('button', {
      type: 'button', class: cls, title,
      onclick: () => (f.pop ? closeReviewPanel(f) : openReviewPanel(f)),
    }, icon(ic), label, f.avatar ? h('img', { class: 'ztpr-av', src: f.avatar, alt: f.login }) : null));
  }

  // Okienko review wisi bezpośrednio w <body> (position: fixed), żeby nic z GitHuba go nie przykryło ani nie przycięło.
  function openReviewPanel(f) {
    if (f.pop) return;
    if (!f.draft) f.draft = { event: f.pr.viewerDidAuthor ? 'COMMENT' : 'APPROVE', text: '', error: '' };
    f.pop = h('div', { class: 'ztpr-pop', role: 'dialog', 'aria-label': `Review PR #${f.number}` });
    document.body.appendChild(f.pop);
    f.onDocDown = (e) => {
      if (f.busy || f.pop.contains(e.target) || f.el.contains(e.target)) return;
      closeReviewPanel(f);
    };
    f.onKey = (e) => {
      if (e.key === 'Escape' && !f.busy) { e.preventDefault(); e.stopPropagation(); closeReviewPanel(f); }
    };
    f.onMove = () => positionPanel(f);
    document.addEventListener('mousedown', f.onDocDown, true);
    document.addEventListener('keydown', f.onKey, true);
    window.addEventListener('scroll', f.onMove, true);
    window.addEventListener('resize', f.onMove);
    fillReviewPanel(f);
    renderReviewButton(f);
  }

  function closeReviewPanel(f) {
    if (!f.pop) return;
    document.removeEventListener('mousedown', f.onDocDown, true);
    document.removeEventListener('keydown', f.onKey, true);
    window.removeEventListener('scroll', f.onMove, true);
    window.removeEventListener('resize', f.onMove);
    f.pop.remove();
    f.pop = null;
    if (f.el.isConnected) renderReviewButton(f);
  }

  function positionPanel(f) {
    if (!f.pop) return;
    const r = (f.el.firstElementChild || f.el).getBoundingClientRect();
    const pw = f.pop.offsetWidth;
    const ph = f.pop.offsetHeight;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8));
    let top = r.bottom + 8;
    if (top + ph > window.innerHeight - 8 && r.top - 8 - ph >= 8) top = r.top - 8 - ph;
    f.pop.style.left = left + 'px';
    f.pop.style.top = top + 'px';
  }

  function fillReviewPanel(f) {
    const pr = f.pr;
    const d = f.draft;
    const wrong = wrongAccount(f);

    const ta = h('textarea', { class: 'ztpr-fab-ta', rows: '4', placeholder: 'Komentarz' });
    ta.value = d.text;
    ta.addEventListener('input', () => { d.text = ta.value; });

    const err = h('div', { class: 'ztpr-fab-err' }, wrong
      ? `Skrypt jest zalogowany jako ${f.login}, a na GitHubie jesteś ${pageLogin()}. ` +
        `Review poszedłby z konta ${f.login}. Zaloguj się ponownie jako ${pageLogin()}.`
      : d.error || '');

    const opts = REVIEW_EVENTS.map((ev) => {
      const blocked = pr.viewerDidAuthor && ev.id !== 'COMMENT';
      const input = h('input', { type: 'radio', name: 'ztpr-review-event', value: ev.id, disabled: blocked || wrong });
      input.checked = d.event === ev.id;
      input.addEventListener('change', () => { d.event = ev.id; d.error = ''; err.textContent = ''; });
      return h('label', {
        class: 'ztpr-opt' + (blocked || wrong ? ' ztpr-opt-off' : ''),
        title: blocked ? 'Na własnym PR możesz tylko dodać komentarz' : null,
      }, input, h('span', { class: 'ztpr-opt-txt' }, h('span', { class: 'ztpr-opt-name' }, ev.label), h('span', { class: 'ztpr-fab-hint' }, ev.hint)));
    });

    const submit = h('button', { type: 'button', class: 'ztpr-fab-btn', disabled: wrong }, 'Wyślij review');
    const cancel = h('button', { type: 'button', class: 'ztpr-fab-cancel', onclick: () => closeReviewPanel(f) }, 'Anuluj');

    const go = async () => {
      if (f.busy || wrong) return;
      if (d.event !== 'APPROVE' && !d.text.trim() && !pendingReviewId(pr)) {
        d.error = 'Przy "Comment" i "Request changes" GitHub wymaga komentarza.';
        err.textContent = d.error;
        ta.focus();
        return;
      }
      f.busy = true;
      submit.disabled = true;
      cancel.disabled = true;
      const spin = icon('sync');
      spin.classList.add('ztpr-spin');
      submit.replaceChildren(spin, 'Wysyłam');
      try {
        await sendReview(f, d.event, d.text);
        f.busy = false;
        f.draft = null;
        closeReviewPanel(f);
        f.el.replaceChildren(h('button', { type: 'button', class: 'ztpr-fab-btn ztpr-rv-ok', disabled: true }, icon('check'), 'Wysłano'));
        softInvalidate(0);
        setTimeout(() => location.reload(), 1200);
      } catch (e) {
        f.busy = false;
        d.error = reviewErrorText(e.message);
        fillReviewPanel(f);
      }
    };
    submit.addEventListener('click', go);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); }
    });

    const hasPending = !!pendingReviewId(pr);
    f.pop.replaceChildren(...[
      h('div', { class: 'ztpr-pop-title' }, `Review PR #${f.number} jako`, f.avatar ? h('img', { class: 'ztpr-av', src: f.avatar, alt: f.login }) : null, f.login || ''),
      hasPending ? h('div', { class: 'ztpr-fab-hint' }, 'Masz rozpoczęty review z komentarzami. Zostanie wysłany razem z tym review.') : null,
      ta,
      h('div', { class: 'ztpr-opts' }, opts),
      err,
      wrong
        ? h('div', { class: 'ztpr-fab-row' }, cancel, h('button', { type: 'button', class: 'ztpr-fab-btn', onclick: () => { closeReviewPanel(f); relogin(); } }, 'Zaloguj ponownie'))
        : h('div', { class: 'ztpr-fab-row' }, h('span', { class: 'ztpr-fab-hint' }, '⌘ + Enter'), cancel, submit),
    ].filter(Boolean));
    positionPanel(f);
    if (!wrong) setTimeout(() => ta.focus(), 0);
  }

  // ---------- kopiowanie ścieżki pliku przy wątkach review ----------
  // GitHub linkuje plik w wątku jako #diff-<sha256(ścieżka)>, więc skróconą ścieżkę ("…/org/…") odtwarzamy po hashu.
  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function indexThreadPaths(f) {
    const threads = (f.pr && f.pr.reviewThreads && f.pr.reviewThreads.nodes) || [];
    const pathByHash = new Map();
    const lineByComment = new Map(); // id komentarza -> { path, line }
    const seen = new Set();
    for (const t of threads) {
      if (!t || !t.path) continue;
      if (!seen.has(t.path)) {
        seen.add(t.path);
        pathByHash.set(await sha256Hex(t.path), t.path);
      }
      const line = t.line || t.originalLine;
      for (const c of (t.comments && t.comments.nodes) || []) {
        if (c && c.databaseId && line) lineByComment.set(String(c.databaseId), { path: t.path, line });
      }
    }
    f.pathByHash = pathByHash;
    f.lineByComment = lineByComment;
    decorateThreadPaths(f);
  }

  function commentIds(el) {
    const ids = [];
    for (const c of el.querySelectorAll('[id^="discussion_r"]')) ids.push(c.id.slice('discussion_r'.length));
    const holders = [el, ...el.querySelectorAll('[data-hidden-comment-ids]')];
    for (const x of holders) {
      for (const id of (x.getAttribute('data-hidden-comment-ids') || '').split(',')) if (id.trim()) ids.push(id.trim());
    }
    return ids;
  }

  // Linia wątku: z najbliższego kontenera z komentarzami. Gdy wątki w nim wskazują różne linie, zostaje sama ścieżka.
  function threadLine(f, a, path) {
    for (let el = a.parentElement, i = 0; el && el !== document.body && i < 12; el = el.parentElement, i++) {
      const ids = commentIds(el);
      if (!ids.length) continue;
      const lines = new Set(ids.map((id) => f.lineByComment.get(id)).filter((x) => x && x.path === path).map((x) => x.line));
      return lines.size === 1 ? [...lines][0] : null;
    }
    return null;
  }

  function decorateThreadPaths(f) {
    if (!f || !f.pathByHash || !f.pathByHash.size) return;
    for (const a of document.querySelectorAll('a[href*="#diff-"]')) {
      if (a.closest('.ztpr, .ztpr-fab, .ztpr-pop')) continue;
      const next = a.nextElementSibling;
      if (next && next.classList.contains('ztpr-copy')) continue;
      const m = (a.getAttribute('href') || '').match(/#diff-([0-9a-f]{64})/);
      const path = m && f.pathByHash.get(m[1]);
      if (!path) continue;
      const line = threadLine(f, a, path);
      const ref = line ? `${path}:${line}` : path;
      const btn = h('button', {
        type: 'button', class: 'ztpr-copy', 'aria-label': 'Kopiuj ścieżkę pliku',
        title: `Kopiuj: ${ref}\nW IntelliJ: ⌘⇧O i wklej, otworzy plik` + (line ? ` w linii ${line}` : ''),
      }, icon('copy'));
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        copyText(ref);
        btn.classList.add('ztpr-copied');
        btn.replaceChildren(icon('check'));
        setTimeout(() => { btn.classList.remove('ztpr-copied'); btn.replaceChildren(icon('copy')); }, 1500);
      });
      a.after(btn);
    }
  }

  // ---------- znajdowanie wierszy na liście ----------
  const PR_PATH = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/;
  const ROW_SEL = 'li, [role="listitem"], [role="row"], .js-issue-row';

  function isListPage() {
    const p = location.pathname;
    return /^\/[^/]+\/[^/]+\/pulls(\/|$)/.test(p) || /^\/pulls(\/|$)/.test(p);
  }

  function findRow(a) {
    const r = a.closest(ROW_SEL);
    if (r) return r;
    let el = a.parentElement;
    while (el && el.parentElement && el.parentElement !== document.body) {
      const nums = new Set();
      el.parentElement.querySelectorAll('a[href*="/pull/"]').forEach((x) => {
        const m = x.pathname.match(PR_PATH);
        if (m) nums.add(m[3]);
      });
      if (nums.size > 1) return el;
      el = el.parentElement;
    }
    return null;
  }

  function collectRows() {
    const rows = new Map();
    for (const a of document.querySelectorAll('a[href*="/pull/"]')) {
      if (a.closest('.ztpr')) continue;
      if (a.hostname !== location.hostname || a.hash) continue;
      const m = a.pathname.match(PR_PATH);
      if (!m) continue;
      const text = (a.textContent || '').trim();
      if (text.length < 3 || /^[\d\s/#]+$/.test(text)) continue;
      const row = findRow(a);
      if (!row || rows.has(row)) continue;
      const [, owner, name, num] = m;
      rows.set(row, {
        row, a, owner, name, number: +num,
        key: `${owner}/${name}#${num}`.toLowerCase(),
      });
    }
    return [...rows.values()];
  }

  // Szuka linii z metadanymi ("#225 · autor opened ...") i zwraca jej kontener.
  function findMeta(row, a, number) {
    const re = new RegExp('#\\s*' + number + '(?!\\d)');
    const ownText = (el) => {
      let s = '';
      for (const n of el.childNodes) if (n.nodeType === 3) s += n.nodeValue;
      return s;
    };
    const usable = (el) => !el.contains(a) && !a.contains(el) && !el.closest('.ztpr');
    const els = [...row.querySelectorAll('*')].filter(usable);
    // 1) element, którego własny tekst to "#212" (React często dzieli to na "#" i "212")
    let hit = els.find((el) => re.test(ownText(el)));
    // 2) najmniejszy element, którego cały tekst zawiera "#212"
    if (!hit) {
      const all = els.filter((el) => re.test(el.textContent || ''));
      all.sort((x, y) => (x.textContent || '').length - (y.textContent || '').length);
      hit = all[0];
    }
    if (!hit) return null;
    let el = hit;
    while (el.parentElement && el.parentElement !== row && !el.parentElement.contains(a)) el = el.parentElement;
    if (el.contains(a)) return null;
    // płaska struktura: sam numer w osobnym elemencie obok tytułu
    if ((el.textContent || '').trim().length <= String(number).length + 3 && el.parentElement && el.parentElement !== row) {
      return el.parentElement;
    }
    return el;
  }

  function place(r, box) {
    const meta = findMeta(r.row, r.a, r.number);
    if (meta) meta.appendChild(box);
    else r.a.insertAdjacentElement('afterend', box);
  }

  // ---------- renderowanie ----------
  function render(r, state) {
    let sig;
    if (state.noToken) sig = 'notoken';
    else if (state.loading) sig = 'loading';
    else if (state.error) sig = 'err:' + state.error;
    else sig = `ok:${state.ts}:${getRequired()}:${viewer}`;

    let box = r.row.querySelector('.ztpr');
    let mine = false;
    if (state.pr) mine = analyze(state.pr).mine;
    r.row.classList.toggle('ztpr-mine', mine);

    if (box) box.classList.toggle('ztpr-syncing', !!state.pr && announced.has(r.key));
    if (box && box.dataset.sig === sig) return;
    if (!box) {
      box = h('span', { class: 'ztpr' });
      place(r, box);
    }
    box.dataset.sig = sig;

    if (state.noToken) {
      const viaApp = !!getClientId();
      box.replaceChildren(h('span', {
        class: 'ztpr-chip ztpr-attention ztpr-action',
        title: viaApp ? 'Kliknij, żeby zalogować się przez GitHub i zobaczyć approvale i wątki' : 'Kliknij i wklej token GitHub, żeby zobaczyć approvale i wątki',
        onclick: stop(authAction),
      }, icon('key'), viaApp ? 'Zaloguj przez GitHub' : 'Ustaw token GitHub'));
    } else if (state.loading) {
      box.replaceChildren(h('span', { class: 'ztpr-chip ztpr-muted ztpr-spin', title: 'Pobieram dane z GitHuba' }, icon('sync')));
    } else if (state.error) {
      const noAccess = /Could not resolve to a Repository/i.test(state.error);
      const action = state.auth || noAccess;
      const title = noAccess && appMode()
        ? 'Nie masz dostępu do tego repo przez aplikację GitHub.\n' +
          'Możliwe przyczyny: aplikacja nie jest zainstalowana na tym repo albo Twoje konto nie ma do niego dostępu.\n\n' + state.error
        : noAccess
        ? 'Token nie ma dostępu do tego repo.\n' +
          'Najczęstsze przyczyny:\n' +
          '1. Przy tworzeniu tokena jako "Resource owner" zostało Twoje konto zamiast organizacji.\n' +
          '2. Token czeka na zatwierdzenie przez właściciela organizacji.\n' +
          '3. Repo nie zostało zaznaczone w "Repository access".\n' +
          'Kliknij, żeby wkleić nowy token.\n\n' + state.error
        : state.error;
      box.replaceChildren(h('span', {
        class: 'ztpr-chip ztpr-danger' + (action ? ' ztpr-action' : ''), title,
        onclick: action ? stop(authAction) : null,
      }, icon('alert'), state.auth ? (appMode() ? 'Zaloguj ponownie' : 'Zły token') : noAccess ? 'Brak dostępu do repo' : 'Błąd API'));
    } else {
      box.replaceChildren(...buildBadges(r, state.pr).nodes);
    }
    box.classList.toggle('ztpr-grid', !!state.pr);
    box.classList.toggle('ztpr-syncing', !!state.pr && announced.has(r.key));
  }

  let lastHref = location.href;
  function scan() {
    prPageTick();
    if (!isListPage()) return;
    if (location.href !== lastHref) {
      lastHref = location.href;
      announce = true;
      softInvalidate(15000);
    }
    const rows = collectRows();
    if (!rows.length) return;

    if (!hasAuth()) {
      render(rows[0], { noToken: true });
      return;
    }

    const now = Date.now();
    const need = rows.filter((r) => {
      const entry = cache.get(r.key);
      return !entry || (!entry.auth && now - entry.ts > TTL_MS);
    });
    if (need.length) fetchMissing(need);
    announce = false;
    for (const r of rows) render(r, cache.get(r.key) || { loading: true });
    scheduleAlign();
  }

  // Wyrównanie: każda lista etykiet ma tę samą szerokość, więc wystarczy ustawić
  // ich prawe krawędzie w jednej linii, żeby kolumny wypadły dokładnie pod sobą.
  function alignBoxes() {
    const boxes = [...document.querySelectorAll('.ztpr')].filter((b) => b.offsetParent !== null);
    for (const b of boxes) b.style.transform = '';
    if (boxes.length < 2) return;
    const rects = boxes.map((b) => b.getBoundingClientRect());
    // Wyrównujemy tylko etykiety stojące przy prawej krawędzi (różnią się o szerokość
    // kolumny GitHuba z komentarzami). Te, które stoją gdzie indziej, zostawiamy w spokoju.
    const maxRight = Math.max(...rects.map((x) => x.right));
    const cluster = rects.map((x) => x.right).filter((r) => maxRight - r <= ALIGN_RANGE);
    const target = Math.min(...cluster);
    boxes.forEach((b, i) => {
      const right = rects[i].right;
      if (maxRight - right > ALIGN_RANGE) return;
      let shift = right - target;
      if (shift < 1) return;
      // nie nachodzimy na tekst stojący w tej samej linii przed etykietami
      // (liczy się sam tekst, a nie element, który może być rozciągnięty do etykiet)
      const textRight = textRightBefore(b, rects[i]);
      if (textRight != null) shift = Math.min(shift, Math.max(0, rects[i].left - textRight - 8));
      if (shift >= 1) b.style.transform = `translateX(${-shift}px)`;
    });
  }

  // Prawa krawędź tekstu i ikon stojących w tej samej linii przed etykietami.
  // Liczymy tylko tekst, ikony i obrazki: puste, rozciągnięte elementy GitHuba nie blokują wyrównania.
  function textRightBefore(box, boxRect) {
    let right = null;
    const take = (r) => {
      if (!r.width || r.bottom <= boxRect.top || r.top >= boxRect.bottom) return;
      right = right == null ? r.right : Math.max(right, r.right);
    };
    let el = box.previousElementSibling;
    for (let i = 0; el && i < 12; i++, el = el.previousElementSibling) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let node = el;
      do {
        if (node.nodeType === 3) {
          if (!node.nodeValue.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const r of range.getClientRects()) take(r);
        } else if (/^(svg|img)$/i.test(node.nodeName)) {
          take(node.getBoundingClientRect());
        }
      } while ((node = walker.nextNode()));
    }
    return right;
  }

  let alignTimer = null;
  function scheduleAlign() {
    clearTimeout(alignTimer);
    alignTimer = setTimeout(alignBoxes, 50);
  }
  window.addEventListener('resize', scheduleAlign);

  let scanTimer = null;
  function scheduleScan(delay) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, delay == null ? 250 : delay);
  }

  new MutationObserver((muts) => {
    for (const m of muts) {
      const t = m.target;
      if (!(t instanceof Element) || !t.closest('.ztpr, .ztpr-fab, .ztpr-pop, .ztpr-sync')) {
        scheduleScan();
        return;
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      announce = true;
      softInvalidate(30000);
      scheduleScan(0);
    }
  });

  scheduleScan(0);
})();
