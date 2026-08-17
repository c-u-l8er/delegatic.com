/* ==========================================================================
   delegatic.com — the build.

       node build-site.mjs        (or: npm run build)

   records/surface.json  →  build-site.mjs  →  index.html
                                  ↑
                       the band, the status block and every call to
                       action are EMITTED from the record. They are not
                       typed into the template, so a rung, a scope or a
                       verb cannot drift from what the record says.

   SHELL.md §4.1: a page cell must be computed, and the record is what it is
   checked against. If the page is the source, nothing can audit it.

   §3 is the load-bearing part: the verb table is code, and a call to action
   the rung has not earned does not get emitted at all. The build refuses
   rather than warning.


   DEPLOYING THIS (SHELL.md §4.4). The artifact is generated and COMMITTED, so
   a Cloudflare Pages project that serves the repository root with no build
   command keeps working exactly as it does today. That is deliberate: it
   changes nothing about how this domain is served.

   The stronger arrangement is to set the Pages build command to
   `npm run test:launch`, which regenerates index.html AND re-proves it before
   Cloudflare is allowed to serve it. A plain `npm run build` would deploy an
   unproven artifact. The build command is only settable in the Cloudflare
   dashboard, which is why it is written down here. [TRAVIS]

   No dependencies. No network.
   ========================================================================== */
import { readFileSync, writeFileSync } from "fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const S = JSON.parse(read("./records/surface.json"));
const PKG = JSON.parse(read("./package.json"));

if (PKG.version !== S.version)
    throw new Error(`BUILD REFUSED — package.json ${PKG.version} != records/surface.json ${S.version}`);

const RUNGS = ["spec", "in_tree", "live_local", "live_deployed", "external"];

/* SHELL.md §1: the chip renders the stored rung, and `?` when there is none.
   Never a default — a defaulted rung is a fabricated status. */
function rung(value) {
    const r = RUNGS.includes(value) ? value : "?";
    return `<span class="rung" data-rung="${r}" title="spec · in_tree · live_local · live_deployed · external">${r}</span>`;
}

/* SHELL.md §3 / SITES.md §0.7 — the rung gates the call to action. */
const VERBS = {
    spec: ["Read", "Challenge", "Implement"],
    in_tree: ["Inspect the source", "Run the tests"],
    live_local: ["Use it", "Reproduce it locally"],
    live_deployed: ["Use the deployed artifact"],
    external: ["See independent evidence", "Contribute another result"],
};
function ctagroup(groupRung, tagText, actions, ok) {
    const allowed = VERBS[groupRung];
    if (!allowed) throw new Error(`BUILD REFUSED — CTA group declares an unknown rung: ${groupRung}`);
    for (const a of actions)
        if (!allowed.includes(a.verb))
            throw new Error(`BUILD REFUSED — CTA "${a.verb}" is not available at rung ${groupRung}. Allowed: ${allowed.join(", ")}`);
    const cards = actions
        .map((a) => `<a href="${a.href}"><span class="verb">${a.verb}</span><span class="what">${a.what}</span></a>`)
        .join("");
    return `<div class="ctagroup"><div class="tag${ok ? " ok" : ""}">${groupRung} &mdash; ${tagText}</div><div class="cta">${cards}</div></div>`;
}

/* ---------- the placement band, SHELL.md §1 ----------
   Place 2 is a product with a defensible rung, and its band form is the
   layer sentence. This is the one of the three governance siblings entitled
   to it — the other two are place 3. The difference is not cosmetic:
   gpscoord shipped a membership claim its own nav deliberately excluded,
   because a template was applied without checking the tier. amp-nav is the
   record; this reads it rather than guessing. */
function band() {
    const covers = `That rung covers ${S.surface_rung_covers}.`;
    if (S.nav_tier === 2)
        return `<div class="band" data-tier="2"><span class="where">${S.surface} is the <b>${S.layer}</b> layer of ${S.parent}</span>${rung(S.surface_rung)}<span class="covers">${covers}</span></div>`;
    if (S.nav_tier === 3)
        return `<div class="band" data-tier="3"><span class="where">${S.surface} is <b>a specification</b> in the ${S.parent} world</span>${rung(S.surface_rung)}<span class="covers">${covers}</span><a class="spec-link" href="${S.spec_url}">the specification &rarr;</a></div>`;
    if (S.nav_tier === 4)
        return `<div class="band" data-tier="4"><span class="where">A <b>${S.parent}</b> project</span>${rung(S.surface_rung)}<span class="covers">${covers}</span></div>`;
    throw new Error(`BUILD REFUSED — nav_tier ${S.nav_tier} has no band form`);
}

/* ---------- the status block, SHELL.md §2 ---------- */
function status() {
    const rows = [
        ["Status", `<strong>${S.surface_rung}</strong> — ${S.status.statement}`],
        ["Last verified", S.verified_at],
        ["Source", S.status.source],
        ["Limit", S.status.limit, "limit"],
        ["Next rung", `<strong>${S.advance.next_rung}</strong> — ${S.advance.requires}`],
    ];
    return `<dl class="status">${rows
        .map(([dt, dd, cls]) => `<div${cls ? ` class="${cls}"` : ""}><dt>${dt}</dt><dd>${dd}</dd></div>`)
        .join("")}</dl>`;
}

/* ---------- the citation, emitted from the record ---------- */
function src() {
    const c = S.citation;
    const peer = c.peer_reviewed
        ? ""
        : `<span class="warn-i">This is a preprint. It has not been peer-reviewed</span>, and its authors record that the &ldquo;Partial&rdquo; classification &ldquo;involves judgment.&rdquo; `;
    return `<div class="src"><strong>Source.</strong> ${c.authors}, <em>${c.title}</em>, <a href="${c.url}">${c.id}</a>, ${c.date}. ${peer}It scores five protocols against six governance dimensions: ${c.scoring} Read it and disagree with it; that is the point of citing it rather than summarising it.<div class="scores">${c.scores
        .map((s) => `<span>${s}</span>`)
        .join("")}</div></div>`;
}

/* ---------- the one real command, and its one real answer ----------
   Emitted from the record so the response on the page cannot drift from the
   response that was actually received. If the service changes what it says,
   the record has to be re-checked and re-dated; the page cannot quietly keep
   the old body. */
function term() {
    const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<div class="term"><pre><span class="p">$</span> curl -s ${S.health.url}\n<span class="o">${esc(S.health.response)}</span></pre></div>`;
}

/* ---------- emit ---------- */
let css = read("./src/shell.css");
/* Keep the source commented; ship it dense. SHELL.md §5. */
const dense = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("");

const TOKENS = {
    CSS: dense,
    BAND: band(),
    STATUS: status(),
    SRC: src(),
    CTA:
        ctagroup(
            "live_deployed",
            "the policy kernel, answering now",
            [
                {
                    verb: "Use the deployed artifact",
                    href: S.health.url,
                    what: "The health endpoint. It answers, it reports its version, and it reports <code>policies_registered: 0</code> — which is the only number on this page you can check in one request.",
                },
            ],
            true,
        ) +
        ctagroup(
            "spec",
            "everything else on this page",
            [
                {
                    verb: "Read",
                    href: `${S.repo}/blob/main/docs/spec/README.md`,
                    what: "The specification, v0.2. Every section number cited on this page resolves in it.",
                },
                {
                    verb: "Challenge",
                    href: S.contact.url,
                    what: "Open an issue. An unenforced field we have not already named is the most valuable thing you could hand back.",
                },
                {
                    verb: "Implement",
                    href: `${S.repo}/blob/main/docs/spec/README.md#35-effective-policy-computation`,
                    what: "The effective-policy computation is the load-bearing piece and it is fully specified. An implementation that is not ours is the only thing that moves this off <code>spec</code>.",
                },
            ],
            false,
        ),
    TERM: term(),
    LAYER: S.layer,
    QUESTION: S.question,
    ORIGIN: S.origin,
    PARENT: S.parent,
    REPO: S.repo,
    ISSUES: S.contact.url,
    SPEC_URL: S.spec_url,
    STAMP: `DELEGATIC v${S.version} · RECORD ${S.verified_at}`,
};

let html = read("./src/landing.html");
for (const [k, v] of Object.entries(TOKENS)) html = html.split(`{{${k}}}`).join(v);

const left = html.match(/\{\{\w+\}\}/g);
if (left) throw new Error(`BUILD REFUSED — unrendered token(s): ${[...new Set(left)].join(", ")}`);

writeFileSync(new URL("./index.html", import.meta.url), html);
writeFileSync(new URL("./identity.js", import.meta.url), read("./src/identity.js"));

console.log(`built index.html — ${html.length.toLocaleString()} bytes (${dense.length.toLocaleString()} of CSS inlined)`);
console.log(`built identity.js — ${read("./src/identity.js").length.toLocaleString()} bytes`);
