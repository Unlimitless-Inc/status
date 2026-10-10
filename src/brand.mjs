// THE PAGE WEARS THE SITE'S OWN LOOK, AND CARRIES IT WITH IT.
//
// The lockup (the Unl icon, the Unlimitless wordmark and "your why agent" said once under it), the navy ground with
// its faint grid, the cards, the three faces and the colours are the ones unlimitless.ai shows. They are COPIED here
// rather than loaded from the site, because this page has to stay up when the site is down: nothing on it is fetched
// from unlimitless.ai, or from any font host, when someone opens it. The fonts sit in brand/fonts beside their
// licences and the build copies them next to the page.
//
// WHERE EACH VALUE CAME FROM, so the two do not drift. Copied on 10 October 2026 from the live site's stylesheet and
// icon. If the site changes one of these, change it here too:
//   colours     the site's :root tokens (ground #1A1B26, deep well #16161E, panel #24283B, line, text, muted, dim,
//               wordmark slate #737A86, Unl's cyan hsl(186 92% 58%), working #3ECF8E, problem #F0647E)
//   faces       Space Grotesk for headings and the wordmark, Instrument Sans for body text, Space Mono for small
//               labels, the same three the site loads (SIL Open Font License, see brand/fonts)
//   ground      the 44px grid at 3.5% white, fading down from the top, as the site's body draws it
//   lockup      the icon tile (one rounded corner of 52, border inset 4, the flare bar 113 by 5 at 24/64.5, "Unl" at
//               118/166 in 92px bold), the wordmark ("Unl" in cyan, "imitless" in slate) and the caption in Space Mono
//   cards       rounded 14px with a fine border, as the site's panels
// The amber for "slower than normal" is the status page's own: the site has no warning colour of its own to copy.

export const BRAND_CSS = `
@font-face{font-family:"Space Grotesk";font-weight:400 700;font-display:swap;src:url(fonts/space-grotesk.woff2) format("woff2")}
@font-face{font-family:"Instrument Sans";font-weight:400 700;font-display:swap;src:url(fonts/instrument-sans.woff2) format("woff2")}
@font-face{font-family:"Space Mono";font-weight:400;font-display:swap;src:url(fonts/space-mono-400.woff2) format("woff2")}
@font-face{font-family:"Space Mono";font-weight:700;font-display:swap;src:url(fonts/space-mono-700.woff2) format("woff2")}
:root{--ink:#1A1B26;--ink2:#16161E;--panel:#24283B;--panel2:#292E42;--line:rgba(192,202,245,.10);--line2:rgba(192,202,245,.18);
--text:#E8EAED;--txt:#bcc1c8;--muted:#9AA3AD;--dim:#8F97A3;--white:#f4f5f7;--wm-slate:#737A86;
--unl-cyan:hsl(186 92% 58%);--unl-cyan-glow:hsl(186 92% 58% / .18);
--ok:#3ECF8E;--ok-soft:rgba(62,207,142,.13);--down:#F0647E;--down-soft:rgba(240,100,126,.12);--slow:#E0B341;--slow-soft:rgba(224,179,65,.13);
--none:#2F3449;--radius:14px;
--disp:"Space Grotesk",system-ui,sans-serif;--body:"Instrument Sans",system-ui,sans-serif;--mono:"Space Mono",ui-monospace,monospace;
--flare-w:1.22826em;--flare-h:0.05435em;--flare-gap:0.05978em;--flare-dx:-0.27734em;
--flare-grad:linear-gradient(90deg,hsl(186 92% 58% / .32),hsl(186 92% 58% / .75) 60%,hsl(186 92% 58% / 1))}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--ink);color:var(--text);font:440 16px/1.55 var(--body);-webkit-font-smoothing:antialiased;min-height:100vh}
body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:-1;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:44px 44px;-webkit-mask-image:radial-gradient(ellipse at 50% 0%,#000 0%,rgba(0,0,0,.5) 55%,transparent 100%);mask-image:radial-gradient(ellipse at 50% 0%,#000 0%,rgba(0,0,0,.5) 55%,transparent 100%)}
a{color:inherit}
:focus-visible{outline:2px solid var(--unl-cyan);outline-offset:3px;border-radius:4px}
.brand{display:flex;align-items:center;gap:10px;font-family:var(--disp);font-size:18px;font-weight:600;letter-spacing:.01em;color:var(--white);text-decoration:none}
.brand-key{display:inline-flex;line-height:0}
.brand-key svg{display:block;filter:drop-shadow(0 0 12px var(--unl-cyan-glow))}
.brand-words{display:flex;flex-direction:column;gap:3px}
.brand .wm{position:relative;display:inline-block;white-space:nowrap;flex:none}
.brand .wm .u{font-weight:700;letter-spacing:-0.02174em;color:var(--unl-cyan);text-shadow:0 0 22px var(--unl-cyan-glow)}
.brand .wm .mline{position:absolute;left:var(--flare-dx);bottom:100%;margin-bottom:var(--flare-gap);height:var(--flare-h);width:var(--flare-w);border-radius:999px;background:var(--flare-grad)}
.brand .rest{color:var(--wm-slate)}
.brand-caption{font:400 9.5px/1 var(--mono);letter-spacing:.04em;color:var(--unl-cyan);white-space:nowrap}
`;

/** The icon, drawn once per page and used by reference, exactly as the site does. */
export const MARK_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<linearGradient id="mline" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" style="stop-color:var(--unl-cyan)" stop-opacity=".32"/><stop offset="60%" style="stop-color:var(--unl-cyan)" stop-opacity=".75"/><stop offset="100%" style="stop-color:var(--unl-cyan)" stop-opacity="1"/></linearGradient>
<radialGradient id="mark-glow" cx="50%" cy="58%" r="62%"><stop offset="0%" style="stop-color:var(--unl-cyan)" stop-opacity=".16"/><stop offset="100%" style="stop-color:var(--unl-cyan)" stop-opacity="0"/></radialGradient>
</defs><symbol id="mark" viewBox="0 0 236 236">
<path d="M0 52 A52 52 0 0 1 52 0 L236 0 L236 236 L0 236 Z" fill="#16161E"/>
<path d="M0 52 A52 52 0 0 1 52 0 L236 0 L236 236 L0 236 Z" fill="url(#mark-glow)"/>
<path d="M4 52 A48 48 0 0 1 52 4 L232 4 L232 232 L4 232 Z" fill="none" style="stroke:var(--unl-cyan)" stroke-width="2.6"/>
<rect x="24" y="64.5" width="113" height="5" rx="2.5" fill="url(#mline)"/>
<text x="118" y="166" text-anchor="middle" font-family="Space Grotesk,sans-serif" font-size="92" font-weight="700" letter-spacing="-2" style="fill:var(--unl-cyan)">Unl</text>
</symbol></svg>`;

/** The lockup, linking home: icon, wordmark, and "your why agent" once, under the wordmark. */
export const lockup = (size = 30) => `<a href="https://unlimitless.ai/" class="brand" aria-label="Unlimitless. Unl, your why agent">
<span class="brand-key"><svg width="${size}" height="${size}" aria-hidden="true"><use href="#mark"/></svg></span>
<span class="brand-words"><span class="wm" aria-hidden="true"><span class="mline"></span><span class="u">Unl</span><span class="rest">imitless</span></span><span class="brand-caption" aria-hidden="true">your why agent</span></span>
</a>`;

/** A short, honest version of the site's footer: the lockup and the site's own links, plus this page's own two. */
export const FOOTER_COLUMNS = [
  { h: "Product", links: [["https://unlimitless.ai/why", "Why"], ["https://unlimitless.ai/how-it-works", "How it works"], ["https://unlimitless.ai/pricing", "Pricing"]] },
  { h: "Resources", links: [["https://unlimitless.ai/docs", "Docs"], ["https://unlimitless.ai/connect", "Connect your AI"], ["https://unlimitless.ai/support", "Support"]] },
  { h: "Legal", links: [["https://unlimitless.ai/privacy", "Privacy"], ["https://unlimitless.ai/terms", "Terms"]] },
  { h: "This page", links: [["feed.xml", "Updates feed"], ["status.json", "status.json"]] },
];
