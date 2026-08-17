/* ==========================================================================
   Delegatic — the identifying animation. SHELL.md §8.

   WHAT IT DEPICTS: a delegation chain, and one link refusing. Authority
   travels down the chain; at one link it is refused, the refusal lights up,
   and the attempt starts again from the top. That is the subject of this
   site: A2A can carry the delegation perfectly well, and what is missing is
   the rule that says whether it was permitted.

   WHAT IT IS NOT: an instrument. It renders no data and asserts nothing. It
   takes no input from the document and writes nothing back into it — delete
   the <script> that loads this file and every figure, chip, status row and
   word on the page is still there.

   §8.2 is written in blood: gpscoord.com published `for (let i = 0; i < 12;
   i++)` as "12 Active Pathfinders" for months. So the numbers steering this
   drawing are declared in one marked block, and launch-gate.mjs refuses the
   build if any of them also appears as a number in the page's text. THE
   COUNTS BELOW ARE DELIBERATELY NOT ANYTHING THE KERNEL COUNTS — not its
   modules, not its tests, not its refusal reasons, not its MCP tools.
   ========================================================================== */
(function identity() {
    // The one document-level query in this file. Everything else is scoped to
    // the host, so the animation cannot reach any other part of the page.
    const host = document.querySelector("[data-identity-animation]");
    if (!host) return;
    const NS = "http://www.w3.org/2000/svg";
    const gL = host.querySelector(".id-link");
    const gN = host.querySelector(".id-node");
    const gT = host.querySelector(".id-tok");
    if (!gL || !gN || !gT) return;

    /* IDENTITY-CONSTANTS-START */
    const ID_NODES = 13;
    const ID_REFUSE_AT = 9;
    const ID_ATTEMPT = 63;
    const ID_SEED = 51907;
    /* IDENTITY-CONSTANTS-END */

    const SIZE = 320;
    let s = ID_SEED;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

    // A spine down the middle with a lean either side, plus stub branches, so
    // it reads as a hierarchy rather than a queue.
    const N = [];
    for (let i = 0; i < ID_NODES; i++) {
        const t = i / (ID_NODES - 1);
        const el = document.createElementNS(NS, "rect");
        const w = 36 + rnd() * 22, h = 11;
        // A smooth lean either side of the spine. Deterministic in t so the
        // chain reads as a hierarchy rather than a scatter.
        const x = SIZE * 0.5 + Math.sin(t * 3.05 + 0.5) * 68 - w / 2;
        const y = 26 + t * (SIZE - 62);
        el.setAttribute("x", x.toFixed(1));
        el.setAttribute("y", y.toFixed(1));
        el.setAttribute("width", w.toFixed(1));
        el.setAttribute("height", h);
        el.setAttribute("rx", 2);
        gN.appendChild(el);
        N.push({ cx: x + w / 2, cy: y + h / 2, el: el });
    }

    const L = [];
    for (let i = 1; i < ID_NODES; i++) {
        const el = document.createElementNS(NS, "line");
        el.setAttribute("x1", N[i - 1].cx.toFixed(1));
        el.setAttribute("y1", N[i - 1].cy.toFixed(1));
        el.setAttribute("x2", N[i].cx.toFixed(1));
        el.setAttribute("y2", N[i].cy.toFixed(1));
        gL.appendChild(el);
        L.push(el);
    }
    // Stubs: authority that was never asked for. Drawn, never traversed.
    for (let i = 2; i < ID_NODES - 1; i += 3) {
        const el = document.createElementNS(NS, "line");
        const dx = i % 2 ? 46 : -46;
        el.setAttribute("x1", N[i].cx.toFixed(1));
        el.setAttribute("y1", N[i].cy.toFixed(1));
        el.setAttribute("x2", (N[i].cx + dx).toFixed(1));
        el.setAttribute("y2", (N[i].cy + 19).toFixed(1));
        gL.appendChild(el);
    }

    const tok = document.createElementNS(NS, "circle");
    tok.setAttribute("r", 3.6);
    gT.appendChild(tok);

    const REFUSE = Math.min(ID_REFUSE_AT, L.length - 1);
    const PERIOD = ID_ATTEMPT / 10;   // seconds per attempt, refusal included

    function draw(T) {
        // Position along the chain, 0 → REFUSE+1, then a beat of refusal.
        const phase = (T % PERIOD) / PERIOD;
        const travel = Math.min(1, phase / 0.72);
        const refused = phase > 0.72;
        const pos = travel * (REFUSE + 1);
        const seg = Math.min(REFUSE, Math.floor(pos));
        const f = pos - seg;
        const a = N[seg], b = N[seg + 1] || N[seg];
        tok.setAttribute("cx", (a.cx + (b.cx - a.cx) * f).toFixed(1));
        tok.setAttribute("cy", (a.cy + (b.cy - a.cy) * f).toFixed(1));
        tok.setAttribute("class", refused ? "no" : "");
        tok.setAttribute("opacity", refused ? (1 - (phase - 0.72) / 0.28).toFixed(2) : "1");

        for (let i = 0; i < L.length; i++) {
            if (i === REFUSE) L[i].setAttribute("class", pos >= REFUSE ? "no" : "");
            else L[i].setAttribute("class", i < pos ? "hot" : "");
        }
        for (let i = 0; i < N.length; i++) {
            if (i === REFUSE + 1) N[i].el.setAttribute("class", pos >= REFUSE ? "no" : "");
            else N[i].el.setAttribute("class", i <= pos ? "hot" : "");
        }
    }

    /* The first frame is always painted, so the box is never empty — including
       under prefers-reduced-motion, where that frame is all there is. Nothing
       here waits on an IntersectionObserver: it does not fire in a
       non-compositing renderer, and an animation that never starts reads as a
       broken page. */
    draw(0);

    const mq = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0, last = 0;
    function frame(ts) {
        raf = requestAnimationFrame(frame);
        if (ts - last < 33) return; // ~30fps is plenty, and it runs on a phone
        last = ts;
        draw(ts / 1000);
    }
    function onScreen() {
        const r = host.getBoundingClientRect();
        return r.bottom > -40 && r.top < (window.innerHeight || 0) + 40;
    }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
    function tick() {
        const want = !(mq && mq.matches) && !document.hidden && onScreen();
        if (want && !raf) raf = requestAnimationFrame(frame);
        else if (!want) stop();
    }
    window.addEventListener("scroll", tick, { passive: true });
    window.addEventListener("resize", tick, { passive: true });
    document.addEventListener("visibilitychange", tick);
    if (mq && mq.addEventListener) mq.addEventListener("change", tick);
    tick();
})();
