/* ==========================================================================
   delegatic.com — the publication gate. No dependencies, no network.

       node launch-gate.mjs        (or: npm run test:launch)

   It reads the ARTIFACT — the emitted index.html and identity.js — not the
   source, because the artifact is what a visitor gets and it is the only
   thing worth checking. The build already refuses to emit a call to action a
   rung has not earned; this refuses on the other ways a page lies: a rung
   invented, a scope quietly widened, a citation that resolves to nothing, a
   dead mailbox, an animation constant published as a fact, a caveat printed
   at a contrast nobody can read.

   A GATE NOBODY HAS SEEN REFUSE IS AN OPINION. Every check here was broken
   deliberately once and watched to fail; the count is in the commit message.
   ========================================================================== */
import { readFileSync, existsSync } from "fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const S = JSON.parse(read("./records/surface.json"));
const PKG = JSON.parse(read("./package.json"));

for (const f of ["./index.html", "./identity.js"])
    if (!existsSync(new URL(f, import.meta.url))) {
        console.error(`FAIL  missing artifact ${f} — run the build first`);
        process.exit(1);
    }
const HTML = read("./index.html");
const ANIM = read("./identity.js");
const SPEC = read("./docs/spec/README.md");
/* The animation with its comments removed. Several checks below are about what
   the code DOES, and the comments in identity.js discuss the very things being
   checked for. Line comments are only stripped where they are not preceded by
   a colon, so a `https://` inside a string survives. */
const CODE = ANIM.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

let pass = 0;
const fails = [];
function T(name, ok, detail = "") {
    if (ok) pass++;
    else fails.push(`${name}${detail ? " — " + detail : ""}`);
    console.log(`${ok ? "  ok    " : "REFUSED"}  ${name}${detail ? " — " + detail : ""}`);
}

/* ---------- small helpers, because there is no DOM here ---------- */
const NAMED = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–",
    hellip: "…", middot: "·", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
    ensp: " ", emsp: " ", times: "×", rarr: "→", minus: "−", copy: "©", deg: "°",
    sigma: "σ", tau: "τ", gamma: "γ", alpha: "α", rho: "ρ", epsilon: "ε", Sigma: "Σ", isin: "∈",
};
const decode = (s) =>
    String(s).replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (m, e) =>
        e[0] === "#"
            ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
            : e in NAMED ? NAMED[e] : m,
    );
const strip = (h) => decode(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const TEXT = strip(HTML.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, " "));

/* ==========================================================================
   1. Release identity, and the artifact is fully rendered
   ========================================================================== */
T("release identity: package.json == records/surface.json", PKG.version === S.version, `${PKG.version} / ${S.version}`);
/* Which revision of the shared shell this surface was built against. SHELL.md
   asks every surface to record it, because every lane so far has found a defect
   in that document and a page that does not say which revision it predates
   cannot be triaged later. */
T("the surface records the shell revision it was built against",
    typeof S.shell_revision === "string" && /^shell-r\d+$/.test(S.shell_revision), S.shell_revision);
T("the artifact carries the canonical stamp", HTML.includes(`DELEGATIC v${S.version} · RECORD ${S.verified_at}`));
T("no unrendered {{TOKEN}} survived into the artifact", !/\{\{\w+\}\}/.test(HTML));
T("the artifact declares its canonical URL", HTML.includes(`<link rel="canonical" href="${S.origin}/">`));
T("the artifact declares the surface's falsifiable question",
    HTML.includes(`<meta name="falsifiable-question" content="${S.question}">`));
/* A literal script open-tag inside an HTML comment decapitates naive text
   extractors — everything from the comment to the real closing tag vanishes. */
T("no HTML comment carries a literal script tag",
    !(HTML.match(/<!--[\s\S]*?-->/g) || []).some((c) => /<\s*\/?\s*script/i.test(c)));

/* ==========================================================================
   2. No dead mailbox. Travis's call, 2026-08-11.
   ========================================================================== */
/* A mailbox is a live href. The WORD may appear once, inside the retraction,
   because naming what was removed is what a retraction is — the same carve-out
   GPSCoord's retraction blocklist needed on its first run. */
{
    T("no live mailbox anywhere on the page", !/href\s*=\s*["']mailto:/i.test(HTML));
    const outside = HTML.replace(/<div class="retract">[\s\S]*?<\/div>/g, " ");
    T("mailto: appears nowhere outside the retraction", !/mailto:/i.test(outside));
}
T("the correction channel is a live URL, not a mailbox",
    /^https:\/\//.test(S.contact.url) && S.contact.kind !== "mailto", S.contact.url);

/* ==========================================================================
   3. The placement band, and the tier it is allowed to claim
   ========================================================================== */
{
    const m = HTML.match(/<div class="band"[^>]*>[\s\S]*?<\/div>\s*<amp-nav/);
    const band = m ? m[0] : "";
    T("there is a placement band, and it is the first thing in the body", !!band);
    T("the band carries the tier amp-nav records", HTML.includes(`<div class="band" data-tier="${S.nav_tier}">`),
        `tier ${S.nav_tier}`);
    const chip = band.match(/<span class="rung" data-rung="([^"]*)"[^>]*>([^<]*)<\/span>/);
    T("the band carries a rung chip", !!chip);
    if (chip) {
        T("the band chip reads what it stores", chip[1] === chip[2].trim(), `${chip[2].trim()} / ${chip[1]}`);
        T("the band chip is the rung in the record", chip[1] === S.surface_rung, `${chip[1]} / ${S.surface_rung}`);
    }
    const covers = strip((band.match(/<span class="covers">([\s\S]*?)<\/span>/) || [])[1] || "");
    T("the band bounds what its rung covers", covers.length > 40 && covers.includes(strip(S.surface_rung_covers).slice(0, 40)),
        covers.slice(0, 60) + "…");
    /* Place 3 is "a specification in the ComputeDriven world". Only place 2 may
       claim to BE a layer of the portfolio. gpscoord shipped the wrong one.

       Both directions are checked, and the second direction is here because the
       first one alone let a deliberate break through: a tier-2 band that QUIETLY
       DROPPED its layer word passed a gate that only knew how to refuse a layer
       claim it had not earned. Under-claiming is a drift too — the band is the
       thing that tells a visitor where they are. */
    T("the band makes no layer claim it is not entitled to",
        S.nav_tier === 2 || !new RegExp(`layer of ${S.parent}`, "i").test(strip(band)));
    if (S.nav_tier === 2)
        T("the tier-2 band states the layer amp-nav records",
            band.includes(`is the <b>${S.layer}</b> layer of ${S.parent}`), S.layer);
    if (S.nav_tier === 3)
        T("the tier-3 band says it is a specification, in those words",
            band.includes(`is <b>a specification</b> in the ${S.parent} world`));
    if (S.nav_tier === 3)
        T("a place-3 band links the specification it names", band.includes(`href="${S.spec_url}"`));
}

/* ==========================================================================
   4. Every rung on the artifact is a real rung, and none was invented
   ========================================================================== */
{
    const RUNGS = ["spec", "in_tree", "live_local", "live_deployed", "external", "?"];
    const all = [...HTML.matchAll(/data-rung="([^"]*)"/g)].map((m) => m[1]);
    T("the artifact renders at least one rung chip", all.length > 0, `${all.length} chips`);
    const bad = all.filter((r) => !RUNGS.includes(r));
    T("every data-rung is a real rung or \"?\"", bad.length === 0, bad.join(", ") || "all valid");
    T("no rung was defaulted to blank, undefined or null",
        !/data-rung="(|undefined|null)"/.test(HTML));
    let mismatched = 0;
    for (const m of HTML.matchAll(/<span class="rung" data-rung="([^"]*)"[^>]*>([^<]*)<\/span>/g))
        if (m[1] !== m[2].trim()) mismatched++;
    T("every chip's text equals its stored rung", mismatched === 0);
}

/* ==========================================================================
   5. SITES.md §0.7 — the rung gates the call to action
   ========================================================================== */
{
    const VERBS = {
        spec: ["Read", "Challenge", "Implement"],
        in_tree: ["Inspect the source", "Run the tests"],
        live_local: ["Use it", "Reproduce it locally"],
        live_deployed: ["Use the deployed artifact"],
        external: ["See independent evidence", "Contribute another result"],
    };
    const groups = [...HTML.matchAll(/<div class="ctagroup">([\s\S]*?)<\/div><\/div>/g)].map((m) => m[1]);
    T("the page issues at least one call to action", groups.length > 0, `${groups.length} groups`);
    const bad = [];
    for (const g of groups) {
        const tag = strip((g.match(/<div class="tag[^"]*">([\s\S]*?)<\/div>/) || [])[1] || "");
        const r = tag.split(/\s+[—-]\s+/)[0].trim();
        const allowed = VERBS[r];
        if (!allowed) { bad.push(`unknown rung "${r}"`); continue; }
        for (const v of g.matchAll(/<span class="verb">([\s\S]*?)<\/span>/g)) {
            const verb = strip(v[1]);
            if (!allowed.includes(verb)) bad.push(`"${verb}" @ ${r}`);
        }
    }
    T("every call to action is earned by its group's rung", bad.length === 0, bad.join("; ") || "ok");
    T("nothing invites running something at the spec rung",
        !/<div class="tag[^"]*">spec[\s\S]*?<span class="verb">(Use it|Run |Reproduce)/.test(HTML));
}

/* ==========================================================================
   6. The status block is complete, and LIMIT does its job
   ========================================================================== */
for (const label of ["Status", "Last verified", "Source", "Limit", "Next rung"])
    T(`the status block states ${label}`, HTML.includes(`<dt>${label}</dt>`));
T("the LIMIT row names something the evidence does NOT establish",
    /does not|not establish|cannot/i.test(S.status.limit));

/* ==========================================================================
   7. The review ledger cannot lie
   ========================================================================== */
{
    const gates = Object.entries(S.gates).filter(([k]) => !k.startsWith("_"));
    T("every review gate has a valid status", gates.every(([, g]) => ["pending", "approved"].includes(g.status)));
    const naked = gates.filter(([, g]) => g.status === "approved" && !(g.evidence && g.reviewer && g.date));
    T("no gate is approved without its evidence, reviewer and date", naked.length === 0,
        naked.map(([k]) => k).join(", ") || `${gates.length} gates`);
    /* The rung is only as good as the gate that witnesses it. GPSCoord's rule —
       any pending gate keeps the surface below live_deployed — is too blunt:
       independent_use is pending forever by construction. This names the gate. */
    const w = S.gates[S.rung_witness];
    T("the gate that witnesses this surface's rung exists and is approved",
        !!w && w.status === "approved", `${S.rung_witness} = ${w ? w.status : "MISSING"}`);
    T("the external rung is not self-awarded",
        S.surface_rung !== "external" || S.gates.independent_use.status === "approved");
    const pending = gates.filter(([, g]) => g.status === "pending").length;
    T("pending gates are disclosed rather than hidden", pending >= 0, `${pending} pending of ${gates.length}`);
}

/* ==========================================================================
   8. Every spec section this page cites resolves in the specification
   ------------------------------------------------------------------------
   The analogue of GPSCoord's "every function the UI calls is exported by the
   library". A page that cites §6.4 of a document with no §6.4 looks exactly
   like a page that cites a real one, and nothing in any test fails.
   ========================================================================== */
{
    /* Fenced code blocks are stripped first. This specification contains shell
       and Elixir comments that start with `#`, and one of them — `# 3 lines to
       join a deliberation cluster` — reads as a heading numbered 3 to a naive
       regex. A check that accepts a code comment as a section is a check that
       would accept a citation to one. */
    const prose = SPEC.replace(/^```[\s\S]*?^```/gm, "");
    const heads = new Set(
        [...prose.matchAll(/^#{1,4}\s+(\d+(?:\.\d+)*)/gm)].map((m) => m[1]),
    );
    const cited = [...new Set([...TEXT.matchAll(/§\s?(\d+(?:\.\d+)?)/g)].map((m) => m[1]))];
    const missing = cited.filter((c) => !heads.has(c) && !heads.has(c.split(".")[0]));
    T("every spec section cited on the page resolves in docs/spec/README.md",
        cited.length > 0 && missing.length === 0,
        missing.length ? `missing: §${missing.join(", §")}` : `${cited.length} citations, all resolve`);
}

/* ==========================================================================
   9. SHELL.md §8.5 — the identifying animation asserts nothing
   ------------------------------------------------------------------------
   gpscoord.com published `for (let i = 0; i < 12; i++)` as "12 Active
   Pathfinders" for months. This is that defect mechanised.

   WHEN A CHECK HERE FIRES, THE ANIMATION CHANGES — never the page. The page's
   figures have witnesses; the decoration can pick any number it likes.
   ========================================================================== */
{
    T("the page marks an element data-identity-animation", /data-identity-animation/.test(HTML));
    const firstSection = (HTML.split("<section")[1] || "").split("</section>")[0];
    T("the animation is above the fold — inside the first section",
        firstSection.includes("data-identity-animation"));
    T("the h1 comes before the animation — the question comes first",
        HTML.indexOf("<h1") > -1 && HTML.indexOf("<h1") < HTML.indexOf("data-identity-animation"));

    const blk = ANIM.match(/IDENTITY-CONSTANTS-START\s*\*\/([\s\S]*?)\/\*\s*IDENTITY-CONSTANTS-END/);
    T("the animation declares a constants block", !!blk);
    if (blk) {
        const consts = [...blk[1].matchAll(/const\s+(\w+)\s*=\s*(\d+)/g)].map((m) => [m[1], m[2]]);
        T("the constants block declares something", consts.length > 0);
        const printed = new Set(TEXT.match(/\b\d+\b/g) || []);
        const leaked = consts.filter(([, v]) => printed.has(v));
        T("no animation constant is also printed as a number on the page",
            leaked.length === 0,
            leaked.length
                ? `LEAKED ${leaked.map(([n, v]) => n + "=" + v).join(", ")} — change identity.js, not the page`
                : consts.map(([n, v]) => n + "=" + v).join(", "));
    }
    /* A decoration that quotes a frozen record is depicting data.

       SVG_VOCAB is the drawing alphabet — element names, attribute names and
       the SVG namespace. Any code that draws must contain them, and "line"
       collides with the record's own sentence "no line of Deliberatic has been
       written". Excluding a NAMED, VISIBLE vocabulary is honest; quietly
       raising the minimum string length until the collision disappears is not,
       because it would also stop catching a real one. */
    const SVG_VOCAB = ["http://www.w3.org/2000/svg", "circle", "line", "rect", "opacity", "width",
        "height", "stroke-dashoffset", "class", "scroll", "resize", "visibilitychange", "change",
        "prefers-reduced-motion: reduce"];
    const animStrings = [...ANIM.matchAll(/"([^"\\\n]{4,})"|'([^'\\\n]{4,})'/g)]
        .map((m) => m[1] ?? m[2])
        .filter((s) => !SVG_VOCAB.includes(s));
    const recordText = read("./records/surface.json");
    const shared = animStrings.filter((s) => recordText.includes(s));
    T("the animation shares no string with the frozen record", shared.length === 0,
        shared.join(", ") || `${animStrings.length} non-vocabulary strings, none in the record`);

    /* No inputs and no outputs — the cheapest guarantee of the check above.
       createElementNS / appendChild / setAttribute are NOT forbidden here: this
       animation draws SVG and cannot exist without them. What is forbidden is
       reading or writing page CONTENT, and reaching outside its own host. */
    const FORBIDDEN = ["innerHTML", "outerHTML", "textContent", "innerText", "insertAdjacentHTML",
        "document.write", "localStorage", "sessionStorage", "XMLHttpRequest", "fetch(", "data-derived"];
    const found = FORBIDDEN.filter((k) => CODE.includes(k));
    T("the animation neither reads nor writes page content", found.length === 0, found.join(", ") || "no content API used");
    const docQueries = [...ANIM.matchAll(/document\.querySelector(?:All)?\(\s*([^)]*)\)/g)].map((m) => m[1]);
    T("the animation queries the document exactly once, for its own host",
        docQueries.length === 1 && docQueries[0].includes("data-identity-animation"),
        docQueries.join(" | ") || "none");

    /* §8.4 — the constraints that keep it from reading as a broken page. */
    T("the animation honours prefers-reduced-motion", CODE.includes("prefers-reduced-motion"));
    /* Checked against CODE, not the file: this animation's comments EXPLAIN why
       it does not use an IntersectionObserver, and a check that reads its own
       rationale as a violation is a check that punishes writing one down. */
    T("the animation is not triggered only by IntersectionObserver", !CODE.includes("IntersectionObserver"));
    T("the animation stops when the tab is hidden", CODE.includes("document.hidden"));
    T("the animation caps its frame rate", /ts - last < \d+/.test(CODE));
    T("the animation paints a first frame before any loop starts", /\bdraw\(0\)/.test(CODE));
    T("the animation stays cheap enough for a phone", ANIM.length < 9000, `${ANIM.length.toLocaleString()} bytes`);
}

/* ==========================================================================
   10. The page's meaning does not depend on JavaScript
   ========================================================================== */
{
    const tags = [...HTML.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    T("the page ships no inline JavaScript", tags.every((t) => t[2].trim() === ""), `${tags.length} script tags`);
    T("the only scripts are the portfolio nav and the identity animation",
        tags.length === 2 &&
        tags.some((t) => /amp-nav\.js/.test(t[1])) &&
        tags.some((t) => /\bsrc="\/identity\.js"/.test(t[1]) && /\bdefer\b/.test(t[1])),
        tags.map((t) => (t[1].match(/src="([^"]*)"/) || [, "inline"])[1]).join(", "));
    T("the page carries its content as text, not as a hydration target",
        TEXT.length > 9000, `${TEXT.length.toLocaleString()} characters with script and style stripped`);
    T("the retraction survives in the artifact", /Launching 2026\.&rdquo; stood here|Launching 2026.” stood here/.test(TEXT));
    /* A repeated inline style string across n cells is bytes for nothing, and
       it is how a shared shell stops being shared. SHELL.md §5. */
    T("no inline style= attribute in the artifact", !/\sstyle="/.test(HTML));
}

/* ==========================================================================
   10b. The one running thing is quoted exactly, and its rung is bounded
   ------------------------------------------------------------------------
   The page prints a live response. If the service changes what it says, the
   record has to be re-checked and re-dated — the page may not quietly keep
   an old body. So the body on the page is compared to the body in the
   record, character for character.
   ========================================================================== */
{
    const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    T("the health response on the page is the one in the record",
        HTML.includes(esc(S.health.response)), S.health.response);
    T("the page prints the empty policy store rather than hiding it",
        /policies_registered.{0,4}0/.test(TEXT));
    T("the deployed rung is bounded to the kernel, not the platform",
        /policy kernel/i.test(S.surface_rung_covers) && /specified rather than written|not.{0,12}written/i.test(S.surface_rung_covers));
    /* Counts about the kernel come from the record, which was derived from the
       tree. They may not be typed into the template. */
    for (const [k, v] of [["modules", S.kernel.modules], ["test_files", S.kernel.test_files],
        ["tests", S.kernel.tests], ["mcp_tools", S.kernel.mcp_tools], ["refusals", S.kernel.refusals]])
        T(`the record carries a derived count for ${k}`, Number.isInteger(v) && v > 0, String(v));
}

/* ==========================================================================
   11. A caveat nobody can read is not a caveat
   ------------------------------------------------------------------------
   --fg3 shipped at .34 across this shell, which is 2.78:1 against the band.
   Every declared text token is recomputed here against every declared
   surface, and the build is refused below WCAG 2.1 SC 1.4.3's 4.5:1.
   ========================================================================== */
{
    const sheet = read("./src/shell.css");
    const blk = (sheet.match(/\/\*\s*TOKENS-START[\s\S]*?\/\*\s*TOKENS-END\s*\*\//) || [])[0] || "";
    const val = (n) => (blk.match(new RegExp("--" + n + "\\s*:\\s*([^;\\n]+)")) || [])[1]?.trim();
    const hex = (h) => { h = h.replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
    const parse = (s) => {
        if (!s) return null;
        if (s.startsWith("#")) return { rgb: hex(s), a: 1 };
        const m = s.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(",").map(Number);
        return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
    };
    const lin = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : Math.pow((c / 255 + 0.055) / 1.055, 2.4));
    const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const over = (f, a, b) => f.map((c, i) => c * a + b[i] * (1 - a));
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

    const surfaces = ["ink", "ink2", "ink3"].map((n) => [n, parse(val(n))]).filter(([, v]) => v);
    const texts = ["fg", "fg2", "fg3", "acc", "data", "warn"].map((n) => [n, parse(val(n))]).filter(([, v]) => v);
    T("the token block declares three surfaces and six text colours",
        surfaces.length === 3 && texts.length === 6, `${surfaces.length} surfaces, ${texts.length} texts`);
    let worst = { r: 99, n: "" };
    for (const [tn, t] of texts)
        for (const [sn, s] of surfaces) {
            const r = ratio(over(t.rgb, t.a, s.rgb), s.rgb);
            if (r < worst.r) worst = { r, n: `--${tn} on --${sn}` };
            if (r < 4.5) T(`contrast --${tn} on --${sn}`, false, `${r.toFixed(2)}:1, floor is 4.5:1`);
        }
    T("every declared text token clears 4.5:1 on every declared surface", worst.r >= 4.5,
        `worst ${worst.n} at ${worst.r.toFixed(2)}:1`);
    /* Tinted pairings that actually occur: a hovered CTA, the claim tag. */
    const ink2 = parse(val("ink2"));
    const accOnTint = ratio(parse(val("acc")).rgb, over(parse(val("acc-soft")).rgb, parse(val("acc-soft")).a, ink2.rgb));
    T("--acc on a hovered CTA card", accOnTint >= 4.5, `${accOnTint.toFixed(2)}:1`);
    const warnOnTint = ratio(parse(val("warn")).rgb, over(parse("rgba(245,196,81,.06)").rgb, 0.06, ink2.rgb));
    T("--warn on the claim tag's own tint", warnOnTint >= 4.5, `${warnOnTint.toFixed(2)}:1`);
    const btn = ratio(parse(val("acc-ink")).rgb, parse(val("acc")).rgb);
    T("the label inside a filled button", btn >= 4.5, `${btn.toFixed(2)}:1`);
}

/* ==========================================================================
   12. Every interactive element can be seen to be interactive
   ------------------------------------------------------------------------
   .logo had no :hover rule at all on the reference surface, so hovering the
   top-left changed nothing and there was no way to tell it was a link.
   ========================================================================== */
{
    const styles = [...HTML.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
    const hoverSel = [...styles.matchAll(/([^{}]*?):hover/g)].map((m) => m[1]).join(" , ");
    const handles = new Set();
    for (const el of HTML.matchAll(/<(a|button)\b([^>]*)>/gi)) {
        const cls = /class="([^"]*)"/.exec(el[2]);
        handles.add(cls ? "." + cls[1].trim().split(/\s+/)[0] : el[1].toLowerCase());
    }
    const naked = [...handles].filter((h) =>
        h.startsWith(".")
            ? !new RegExp(`\\${h}(?![\\w-])`).test(hoverSel)
            : !new RegExp(`(^|[\\s>+~,(])${h}(?=[\\s.:>+~,)]|$)`, "m").test(hoverSel));
    T("every interactive element has a visible :hover", naked.length === 0,
        naked.length ? `no hover for: ${naked.join(", ")}` : `${handles.size} kinds, all covered`);
    T("the page declares a :focus-visible ring", /:focus-visible\s*\{/.test(styles));
}

/* ==========================================================================
   Verdict
   ========================================================================== */
if (fails.length) {
    console.error(`\nPUBLICATION REFUSED — ${fails.length} problem(s) of ${pass + fails.length} checks:`);
    for (const f of fails) console.error("  REFUSED " + f);
    process.exit(1);
}
console.log(`\nlaunch gate: ${pass} checks passed, 0 refusals. ${HTML.length.toLocaleString()} bytes.`);
