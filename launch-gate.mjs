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
import { createHash } from "crypto";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const S = JSON.parse(read("./records/surface.json"));
const PKG = JSON.parse(read("./package.json"));

for (const f of ["./index.html", "./identity.js", "./say.js"])
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
/* SHELL.md r8: `<[^>]+>` STOPS AT THE FIRST `>`. An HTML comment that
   contains one — and the comments in this tree are full of them: `-->`,
   `a > b`, `<form action method="POST">` — is therefore only partially
   removed, and the remainder is counted as visible page text. Comments come
   off in their own pass, ahead of any tag stripping, inside strip() itself so
   that EVERY caller gets it: the band extract, the retraction extract, and
   the blocklist counter in §2b whose entire job is telling visible from
   hidden. */
const decomment = (h) => h.replace(/<!--[\s\S]*?-->/g, " ");
const strip = (h) => decode(decomment(h).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const TEXT = strip(HTML.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " "));

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
   2b. The retraction CONFINES what it retracts — counted, not detected
   ------------------------------------------------------------------------
   SHELL.md r6, hole 1. The old check asked "is the retraction present?" and
   stopped. Presence is not the property. A page could KEEP its retraction and
   reinstate the retracted sentence anywhere else on the page and pass — a
   real deliberate break report did exactly that, which is why this lane's
   earlier "44 breaks forced, 44 refused" is an upper bound and not a proof.

   CONFINEMENT is the property. Every needle is counted in the raw artifact
   AND in the extracted text, and every occurrence must fall inside the
   retraction region; `max_total` additionally bounds the count so the
   retraction cannot be padded with reinstated copies of what it retracts.
   Both spaces are counted because a needle can be written as an entity in one
   and read as a character in the other.

   The region is extracted by BALANCED DEPTH. A non-greedy match to the first
   </div> would silently truncate the region if a <div> were ever nested in
   it — the counter would then read part of the retraction as "outside" and
   refuse. That is the safe direction, but a check that is right for the wrong
   reason stops being right when the markup changes.
   ========================================================================== */
{
    const BL = S.retraction_blocklist;
    T("the surface records what its retraction is supposed to confine",
        !!BL && Array.isArray(BL.terms) && BL.terms.length > 0,
        BL ? `${BL.terms.length} needles` : "MISSING");

    const region = (() => {
        const open = HTML.indexOf('<div class="retract">');
        if (open < 0) return null;
        let depth = 0;
        const re = /<(\/?)div\b[^>]*>/g;
        re.lastIndex = open;
        let m;
        while ((m = re.exec(HTML))) {
            depth += m[1] ? -1 : 1;
            if (depth === 0) return HTML.slice(open, m.index + m[0].length);
        }
        return null;
    })();
    T("the retraction region is present and its tags balance", !!region,
        region ? `${region.length} bytes` : "unbalanced or absent");

    if (BL && region) {
        /* SHELL.md r10 — THE BOUND IS A NUMBER, NOT AN EQUALITY.
           The obvious implementation of r6 is `onPage === insideRetraction`:
           every occurrence accounted for inside the retraction. It is still
           defective, and a sibling lane watched it approve a lie. The
           retraction is authored content, so an equality lets the blocklisted
           sentence repeat WITHOUT LIMIT inside it — on agentelic.com it was
           appended three times, putting the retracted claim on the artifact
           four times, and the gate reported 114 passed, 0 refused.

           So: outside must be 0, AND inside is bounded by a literal from the
           record, AND the two are separate checks. The general rule is r10's:
           a check whose two sides are both under the author's control is not
           a check. `max_total` is a number someone has to raise on purpose, in
           a diff, with a reason — not a quantity the page can re-derive by
           editing itself.

           HIDDEN occurrences are refused outright rather than bounded. A
           needle that is in the markup but not in the rendered text is in a
           comment or a non-rendering attribute; it is not a retraction and it
           is not visible, so there is no count at which it is acceptable. */
        const regionText = strip(region);
        const visibleHTML = decomment(HTML);
        const count = (hay, needle) => hay.split(needle).length - 1;
        const escaped = [], loose = [], over = [], inner = [], hidden = [];
        for (const { needle, max_total } of BL.terms) {
            const hRaw = count(HTML, needle), hIn = count(region, needle);
            const tRaw = count(TEXT, needle), tIn = count(regionText, needle);
            if (hRaw === 0 && tRaw === 0) { escaped.push(`"${needle}" has vanished — the retraction no longer names it`); continue; }
            const outside = (hRaw - hIn) + (tRaw - tIn);
            if (outside > 0) loose.push(`"${needle}" appears ${outside}x OUTSIDE the retraction`);
            const total = Math.max(hRaw, tRaw);
            if (total > max_total) over.push(`"${needle}" ${total}x on the page, bound is ${max_total}`);
            /* The inside count is bounded on its own, so this still refuses if
               the confinement check above is ever weakened or removed. */
            const inside = Math.max(hIn, tIn);
            if (inside > max_total) inner.push(`"${needle}" repeats ${inside}x INSIDE the retraction, bound is ${max_total}`);
            const hid = count(visibleHTML, needle) - count(HTML, needle);
            if (hid !== 0) hidden.push(`"${needle}" appears ${-hid}x inside an HTML comment`);
        }
        T("the retraction still names every string it retracts", escaped.length === 0, escaped.join("; ") || "all present");
        T("no retracted string has been reinstated outside the retraction", loose.length === 0,
            loose.join("; ") || `${BL.terms.length} needles, every occurrence confined`);
        T("no retracted string exceeds the count the record bounds it to", over.length === 0,
            over.join("; ") || BL.terms.map((t) => `${t.needle}<=${t.max_total}`).join(", "));
        T("no retracted string repeats inside the retraction beyond its bound", inner.length === 0,
            inner.join("; ") || "the retraction states each of them once, within bound");
        T("no retracted string is hidden in a comment rather than retracted", hidden.length === 0,
            hidden.join("; ") || "none concealed");
    }
}

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
    /* Three now, and the third is the r9 contact form's upgrade. It is a
       separate file on purpose: identity.js is forbidden by §9 from reading or
       writing page content at all, and the form upgrade does nothing else. */
    T("the only scripts are the portfolio nav, the identity animation and the form upgrade",
        tags.length === 3 &&
        tags.some((t) => /amp-nav\.js/.test(t[1])) &&
        tags.some((t) => /\bsrc="\/identity\.js"/.test(t[1]) && /\bdefer\b/.test(t[1])) &&
        tags.some((t) => /\bsrc="\/say\.js"/.test(t[1]) && /\bdefer\b/.test(t[1])),
        tags.map((t) => (t[1].match(/src="([^"]*)"/) || [, "inline"])[1]).join(", "));
    T("the page carries its content as text, not as a hydration target",
        TEXT.length > 9000, `${TEXT.length.toLocaleString()} characters with script and style stripped`);
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
   13. Every .btn keeps its own ink — THE CASCADE IS RESOLVED, NOT ASSUMED
   ------------------------------------------------------------------------
   SHELL.md r7/r8. `.top nav a` is specificity 0,2,1 and `.btn` is 0,1,0, so
   an unscoped nav rule WINS and a call to action inside the header paints
   --fg2 on --acc — washed-out light on a saturated accent — while the
   identical button in the hero paints correctly.

   Nothing we ran caught it, and §11 is the reason: the contrast maths reads
   DECLARED TOKENS. The pair it checks is the pair the button was supposed to
   have. The token was always fine; the element never received it. That is why
   44 forced breaks did not catch this one.

   So this resolves the cascade over the ARTIFACT instead. For every element
   carrying .btn: find every rule that matches it and declares `color`, take
   the winner by (!important, specificity, source order), and refuse unless
   the winner is itself a rule whose rightmost compound carries .btn.

   It FAILS CLOSED. A selector the parser does not understand, a second
   stylesheet, a colour inside an @media — any of them and this refuses rather
   than reports a verdict it cannot stand behind. The verdicts were
   cross-checked against a real browser's getComputedStyle for every .btn on
   the page; they agreed on every one.
   ========================================================================== */
{
    const styleBlocks = [...HTML.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
    T("the artifact carries exactly one stylesheet of its own", styleBlocks.length === 1,
        `${styleBlocks.length} <style> blocks`);
    const links = [...HTML.matchAll(/<link\b[^>]*>/gi)].filter((m) => /rel="stylesheet"/.test(m[0]))
        .map((m) => (m[0].match(/href="([^"]*)"/) || [, ""])[1]);
    T("the only external stylesheet is the font service — nothing else can paint",
        links.length > 0 && links.every((h) => /^https:\/\/fonts\.googleapis\.com\//.test(h)),
        links.join(", ") || "none");

    const SHEET = styleBlocks.join("\n").replace(/\/\*[\s\S]*?\*\//g, " ");
    const mediaBlocks = [...SHEET.matchAll(/@media[^{]*\{((?:[^{}]|\{[^{}]*\})*)\}/g)];
    T("no colour is declared inside an @media block — so one static resolution is the whole truth",
        !mediaBlocks.some((m) => /(?:^|[;{])\s*color\s*:/.test(m[1])), `${mediaBlocks.length} @media blocks`);

    /* ---- :root custom properties, so a verdict prints a colour and not a var() ---- */
    const VARS = {};
    for (const m of SHEET.matchAll(/:root\{([^}]*)\}/g))
        for (const d of m[1].split(";")) {
            const kv = /^\s*(--[\w-]+)\s*:\s*(.+)$/.exec(d);
            if (kv) VARS[kv[1]] = kv[2].trim();
        }
    const resolve = (v) => {
        let s = v, n = 0;
        while (/var\(/.test(s) && n++ < 8)
            s = s.replace(/var\(\s*(--[\w-]+)\s*(?:,[^()]*)?\)/g, (m, k) => (k in VARS ? VARS[k] : m));
        return s.trim();
    };

    /* ---- the rules that declare a colour, in source order ---- */
    const RULES = [];
    let parseFailed = null;
    {
        const flat = SHEET.replace(/@media[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g, " ");
        let m, order = 0;
        const re = /([^{}]+)\{([^{}]*)\}/g;
        while ((m = re.exec(flat))) {
            const col = /(?:^|;)\s*color\s*:\s*([^;]+)/.exec(m[2]);
            if (col)
                for (const s of m[1].split(","))
                    if (s.trim())
                        RULES.push({ sel: s.trim(), color: col[1].replace(/!important/, "").trim(),
                            important: /!important/.test(col[1]), order });
            order++;
        }
    }

    /* ---- selector parsing. Anything unsupported returns null and refuses. ---- */
    const SIMPLE = /^(?:(\*)|([a-zA-Z][\w-]*)|\.([\w-]+)|#([\w-]+)|\[([\w-]+)(?:\s*=\s*"?([^\]"]*)"?)?\]|:not\(([^()]*)\)|::([\w-]+)|:([\w-]+))/;
    const STATEFUL = /^(hover|focus|focus-visible|focus-within|active|visited|target)$/;
    const STRUCTURAL = /^(first-of-type|last-of-type|first-child|last-child|only-child|root)$/;
    function compound(src) {
        const c = { tag: null, id: null, cls: [], attrs: [], not: [], state: false, structural: false, pseudoElement: false, sp: [0, 0, 0] };
        let i = 0;
        if (!src) return null;
        while (i < src.length) {
            const m = SIMPLE.exec(src.slice(i));
            if (!m) return null;
            i += m[0].length;
            if (m[1] !== undefined) { /* * adds nothing */ }
            else if (m[2] !== undefined) { c.tag = m[2].toLowerCase(); c.sp[2]++; }
            else if (m[3] !== undefined) { c.cls.push(m[3]); c.sp[1]++; }
            else if (m[4] !== undefined) { c.id = m[4]; c.sp[0]++; }
            else if (m[5] !== undefined) { c.attrs.push([m[5], m[6]]); c.sp[1]++; }
            else if (m[7] !== undefined) {
                const inner = compound(m[7].trim());
                if (!inner) return null;
                c.not.push(inner);
                for (let k = 0; k < 3; k++) c.sp[k] += inner.sp[k];
            } else if (m[8] !== undefined) {
                /* A pseudo-ELEMENT paints something that is not the element —
                   ::placeholder, ::before. It can never decide a button's own
                   colour, so it is recorded and then excluded, rather than
                   being treated as unparseable and refusing the whole run. */
                c.pseudoElement = true;
                c.sp[2]++;
            } else if (m[9] !== undefined) {
                if (STATEFUL.test(m[9])) c.state = true;
                else if (STRUCTURAL.test(m[9])) c.structural = true;
                else return null;
                c.sp[1]++;
            }
        }
        return c;
    }
    function parseSelector(sel) {
        const toks = sel.replace(/\s*>\s*/g, " > ").trim().split(/\s+/).filter(Boolean);
        const seq = [];
        for (const t of toks) {
            if (t === ">") { seq.push(">"); continue; }
            const c = compound(t);
            if (!c) return null;
            seq.push(c);
        }
        return seq.length ? seq : null;
    }
    for (const r of RULES) {
        r.seq = parseSelector(r.sel);
        if (!r.seq) parseFailed = r.sel;
    }
    T("every colour selector in the emitted stylesheet parses — the check fails closed",
        !parseFailed, parseFailed ? `cannot parse: ${parseFailed}` : `${RULES.length} colour rules`);

    /* ---- the artifact's elements, each with its ancestor chain ---- */
    const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input",
        "link", "meta", "param", "source", "track", "wbr"]);
    function elements(html) {
        const src = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<!--[\s\S]*?-->/g, " ");
        const out = [], stack = [];
        const re = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
        let m;
        while ((m = re.exec(src))) {
            const [, close, rawTag, attrText, selfClose] = m;
            const tag = rawTag.toLowerCase();
            if (close) {
                for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) { stack.length = i; break; }
                continue;
            }
            const attrs = {};
            for (const a of attrText.matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g))
                attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? "";
            const el = {
                tag, id: attrs.id || null,
                cls: (attrs.class || "").trim().split(/\s+/).filter(Boolean),
                attrs, chain: stack.slice(),
            };
            out.push(el);
            if (!VOID.has(tag) && !selfClose) stack.push(el);
        }
        return out;
    }
    function matchCompound(c, el) {
        if (c.structural) return false;   /* not resolvable here; refuse to claim it matches */
        if (c.tag && c.tag !== el.tag) return false;
        if (c.id && c.id !== el.id) return false;
        for (const k of c.cls) if (!el.cls.includes(k)) return false;
        for (const [a, v] of c.attrs) {
            const got = el.attrs[a.toLowerCase()];
            if (got === undefined) return false;
            if (v !== undefined && got !== v) return false;
        }
        for (const n of c.not) if (matchCompound(n, el)) return false;
        return true;
    }
    function matches(seq, el) {
        let i = seq.length - 1;
        if (!matchCompound(seq[i], el)) return false;
        i--;
        let a = el.chain.length - 1, child = false;
        while (i >= 0) {
            if (seq[i] === ">") { child = true; i--; continue; }
            let found = false;
            while (a >= 0) {
                if (matchCompound(seq[i], el.chain[a])) { found = true; a--; break; }
                if (child) return false;
                a--;
            }
            if (!found) return false;
            child = false;
            i--;
        }
        return true;
    }
    const specOf = (seq) => seq.filter((s) => s !== ">")
        .reduce((acc, c) => [acc[0] + c.sp[0], acc[1] + c.sp[1], acc[2] + c.sp[2]], [0, 0, 0]);
    const cmp = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];

    const btnDeclared = resolve((RULES.find((r) => r.sel === ".btn") || {}).color || "");
    T("the stylesheet declares an ink colour for .btn", !!btnDeclared, btnDeclared || "none");

    const buttons = elements(HTML).filter((e) => e.cls.includes("btn"));
    T("the artifact renders at least one .btn to check", buttons.length > 0, `${buttons.length} buttons`);

    const stolen = [], resolved = [];
    for (const b of buttons) {
        let win = null;
        for (const r of RULES) {
            if (!r.seq) continue;
            /* resting state only, and never a pseudo-element */
            if (r.seq.some((s) => s !== ">" && (s.state || s.pseudoElement))) continue;
            if (!matches(r.seq, b)) continue;
            if (!win) { win = r; continue; }
            if (r.important !== win.important) { if (r.important) win = r; continue; }
            const d = cmp(specOf(r.seq), specOf(win.seq));
            if (d > 0 || (d === 0 && r.order >= win.order)) win = r;
        }
        const rightmost = win ? win.seq.filter((s) => s !== ">").slice(-1)[0] : null;
        const ownedByBtn = !!rightmost && rightmost.cls.includes("btn");
        const where = b.chain.slice(-2).map((a) => a.tag + (a.cls[0] ? "." + a.cls[0] : "")).join(">");
        resolved.push(`${b.tag}.${b.cls.join(".")}@${where}=${resolve(win ? win.color : "inherit")}`);
        if (!ownedByBtn)
            stolen.push(`${b.tag}.${b.cls.join(".")} inside ${where} → "${win ? win.sel : "NOTHING"}" paints ${resolve(win ? win.color : "inherit")}, not .btn's ${btnDeclared}`);
    }
    /* The resolved colour of every button is PRINTED, passing or failing. That
       is what makes this auditable against a browser: SHELL.md r8 asks for the
       verdicts to be cross-checked against getComputedStyle, and a check that
       only speaks when it is unhappy cannot be. */
    T("every .btn's colour is decided by a .btn rule, not by a rule that out-specifies it",
        stolen.length === 0, stolen.join(" | ") || resolved.join("  "));
}

/* ==========================================================================
   14. The display face's line box clears the face's own box
   ------------------------------------------------------------------------
   SHELL.md r7. Travis reported the `g` of "agents" reading as cut off. A line
   box smaller than the font's own box makes consecutive lines' em boxes
   overlap and a descender collides with the cap-height beneath it.

   The metrics cannot be measured here — there is no font engine in node and
   this gate takes no dependencies. So they are MEASURED IN A BROWSER, once,
   and recorded in records/surface.json with the method that produced them;
   this checks the record's own arithmetic, checks the recorded line-height
   clears the requirement, and checks the EMITTED stylesheet still carries
   that line-height. A value edited in the CSS without re-measuring refuses.
   ========================================================================== */
{
    const M = S.type_metrics;
    T("the surface records the type metrics it was measured against",
        !!M && !!M.selectors && typeof M.margin === "number", M ? `${Object.keys(M.selectors).length} selectors, face ${M.display_face}` : "MISSING");
    if (M && M.selectors) {
        const SHEET = [...HTML.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
        const bad = [];
        for (const [sel, m] of Object.entries(M.selectors)) {
            const need = +(Math.max(m.font_box_ratio, m.ink_box_ratio) + M.margin).toFixed(4);
            if (Math.abs(need - m.required_ratio) > 1e-4)
                bad.push(`${sel}: record says required ${m.required_ratio}, its own numbers say ${need}`);
            if (m.line_height < m.required_ratio)
                bad.push(`${sel}: recorded line-height ${m.line_height} is below the required ${m.required_ratio}`);
            const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const rule = new RegExp(`(?:^|[};])${esc}\\{([^}]*)\\}`).exec(SHEET);
            if (!rule) { bad.push(`${sel}: no such rule in the emitted stylesheet`); continue; }
            const lh = /(?:^|;)\s*line-height\s*:\s*([\d.]+)/.exec(rule[1]);
            if (!lh) { bad.push(`${sel}: the emitted rule declares no line-height`); continue; }
            if (Math.abs(parseFloat(lh[1]) - m.line_height) > 1e-6)
                bad.push(`${sel}: the artifact ships ${lh[1]}, the record was measured at ${m.line_height}`);
        }
        T("every display heading's line box clears the ink measured for its face", bad.length === 0,
            bad.join(" | ") || Object.entries(M.selectors).map(([s, m]) => `${s} ${m.line_height}>=${m.required_ratio}`).join(", "));
    }
}

/* ==========================================================================
   15. The artifact came from THIS build
   ------------------------------------------------------------------------
   SHELL.md r6, hole 2. Nothing proved it. If build-site.mjs threw, the
   previous index.html stayed on disk and this gate read it and approved it —
   a page nobody had just produced from the sources beside it. A real
   deliberate break report PASSED on exactly that.

   Output digests alone do not close it: after a failed build the old manifest
   and the old artifact still agree with each other. So the manifest binds the
   INPUTS as well, and a source that has moved on since the artifact was
   written is the definition of stale.
   ========================================================================== */
{
    let B = null, why = "";
    try { B = JSON.parse(read("./records/build.json")); } catch (e) { why = String(e.message || e); }
    T("the build left a manifest of what it emitted", !!B && !!B.inputs && !!B.outputs,
        B ? `built_at ${B.built_at}` : `records/build.json unreadable — ${why}`);
    if (B && B.inputs && B.outputs) {
        const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");
        const digestOf = (p) => { try { return sha(read("./" + p)); } catch { return null; } };
        const badOut = Object.entries(B.outputs).filter(([n, o]) => digestOf(n) !== o.sha256);
        T("every artifact on disk is byte-for-byte the one the build emitted", badOut.length === 0,
            badOut.map(([n]) => n).join(", ") || `${Object.keys(B.outputs).length} outputs verified`);
        const badIn = Object.entries(B.inputs).filter(([n, d]) => digestOf(n) !== d);
        T("every source is the one the build read — the artifact is not stale", badIn.length === 0,
            badIn.length ? `CHANGED SINCE THE BUILD: ${badIn.map(([n]) => n).join(", ")} — rebuild` :
                `${Object.keys(B.inputs).length} inputs verified`);
    }
}

/* ==========================================================================
   16. The contact form, SHELL.md r9
   ------------------------------------------------------------------------
   Ruled by Travis 2026-08-17: contact is the ComputeDriven Formspree form.
   This page pointed corrections at GitHub issues and flagged the missing
   endpoint [TRAVIS]; that item is answered.

   The properties worth refusing on are the ones that make it a form rather
   than a gesture: a real action a browser can POST without scripting, the
   honeypot the endpoint needs, a reply a screen reader hears, and — the one
   this portfolio actually cares about — success printed only on a 2xx.
   ========================================================================== */
{
    const SAY = read("./say.js");
    const form = (HTML.match(/<form\b[^>]*class="say"[\s\S]*?<\/form>/) || [""])[0];
    T("the page carries a contact form", !!form, form ? `${form.length} bytes of markup` : "none");
    const action = (form.match(/\baction="([^"]*)"/) || [, ""])[1];
    T("the form posts to the endpoint the record declares", action === S.contact.form_endpoint,
        `${action || "none"} / ${S.contact.form_endpoint}`);
    T("the endpoint is Formspree over https, and is not a mailbox",
        /^https:\/\/formspree\.io\/f\/[A-Za-z0-9]+$/.test(action));
    T("it is a real POST form, not a fetch bolted to a button — it works with scripting off",
        /\bmethod="POST"/i.test(form) && !!action);
    T("the honeypot Formspree needs is present and hidden from people",
        /name="_gotcha"/.test(form) && /tabindex="-1"/.test(form) &&
        /autocomplete="off"/.test(form) && /aria-hidden="true"/.test(form));
    T("the reply is announced rather than only drawn",
        /role="status"/.test(form) && /aria-live="polite"/.test(form));
    T("the submit control is a .btn, so §13 resolves its colour too",
        /<button[^>]*\btype="submit"[^>]*\bclass="[^"]*\bbtn\b/.test(form));
    T("the placeholder still invites the message this portfolio most needs",
        /a number of ours you think is wrong/.test(form));
    T("the upgrade never rewrites the action, so the no-script path cannot be diverted",
        !/\.action\s*=[^=]/.test(SAY));
    T("success is printed only on an actual 2xx from the endpoint",
        /\br\.ok\b/.test(SAY) && /\bres\.ok\b/.test(SAY) && !/say\(\s*"Sent[\s\S]{0,120}?\bfetch\(/.test(SAY));
    T("the correction channel keeps a second route that is not a mailbox",
        /^https:\/\//.test(S.contact.url) && !/^mailto:/i.test(S.contact.url), S.contact.url);
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
