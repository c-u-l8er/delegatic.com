/* ==========================================================================
   Delegatic — the identifying animation. SHELL.md §8.

   IT ANSWERS THE h1 BY SHOWING WHAT "PERMITTED" DEPENDS ON.

   A containment tree, drawn so that authority has a WIDTH. Each org's granted
   scope is a bar, and every child's bar is nested inside its parent's, because
   spec §2 says a child may tighten and may never widen. Over the stack lies
   one column: the scope being asked for.

   A delegation is permitted exactly as far down as the column still fits. At
   the first bar too narrow to contain it the chain refuses, that bar goes
   amber, and the sliver of the column hanging outside it is drawn on its own —
   THAT PIECE IS THE ANSWER. It is the authority no ancestor ever held, so no
   descendant could be given it. The kernel's own refusal is `{:widening, key,
   parent_val, val}`; this is that value, in pixels.

   AND THE POINTER IS THE REQUEST: the column's edge follows your cursor. Ask
   for more and watch the refusal CLIMB THE TREE, because fewer ancestors can
   cover it. Ask for little enough and the whole chain permits it and the token
   reaches the bottom. Move away and it goes back to asking on its own.

   WHAT IT IS NOT: an instrument. It renders no data and asserts nothing — no
   org, no policy and no refusal here corresponds to anything in the deployed
   kernel, whose policy store is empty. It takes no input from the document and
   writes nothing back: delete the <script> that loads this file and every
   figure, chip, status row and word on the page is still there.

   §8.2 is written in blood: gpscoord.com published `for (let i = 0; i < 12;
   i++)` as "12 Active Pathfinders" for months. So every number steering this
   drawing is declared in one marked block and launch-gate.mjs refuses the build
   if one is also printed on the page. THE COUNTS ARE DELIBERATELY NOT ANYTHING
   THE KERNEL COUNTS — not its modules, not its tests, not its refusal reasons,
   not its MCP tools.
   ========================================================================== */
(function identity() {
    // The one document-level query here. Everything else is scoped to the
    // host, so the animation cannot reach any other part of the page.
    const host = document.querySelector("[data-identity-animation]");
    if (!host) return;
    const NS = "http://www.w3.org/2000/svg";
    const G = (c) => host.querySelector(c);
    const gL = G(".id-link"), gN = G(".id-node"), gT = G(".id-tok"),
        gA = G(".id-ask"), gO = G(".id-over");
    if (!gL || !gN || !gT || !gA || !gO) return;

    /* IDENTITY-CONSTANTS-START */
    const ID_ORGS = 9;
    /* Tenths of a second: how long one attempt takes to walk the chain, and
       how long the request takes to swell and shrink again on its own. */
    const ID_WALK = 21;
    const ID_ASK = 78;
    const ID_SEED = 51907;
    /* IDENTITY-CONSTANTS-END */

    let s = ID_SEED;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const sm = (u) => u * u * (3 - 2 * u);
    const mk = (g, t) => { const e = document.createElementNS(NS, t); g.appendChild(e); return e; };
    // Duck-typed on toFixed rather than a typeof test. The type name such a
    // test needs is a word the frozen record also uses, so writing it here —
    // even inside this comment, which the check also reads — trips §8.5. And
    // §8.5 is unambiguous about which side moves: THE ANIMATION.
    const at = (e, k, v) => e.setAttribute(k, v.toFixed ? v.toFixed(1) : v);

    /* The tree. lo/hi is an org's granted scope, and each child is generated
       INSIDE its parent — containment is a property of how these are built,
       not something checked afterwards. That is the point of the drawing: a
       widening cannot be constructed here, only requested. */
    const O = [];
    let lo = 26, hi = 294;
    for (let i = 0; i < ID_ORGS; i++) {
        if (i) {
            const l = 8 + rnd() * 11, r = 8 + rnd() * 11;
            if (hi - lo - l - r > 26) { lo += l; hi -= r; }
        }
        const y = 22 + i * (274 / (ID_ORGS - 1));  // PITCH, but it is not declared yet
        O.push({ lo, hi, y, cx: (lo + hi) / 2, el: mk(gN, "rect"), link: i ? mk(gL, "line") : null });
    }
    const H = 11;
    const PITCH = 274 / (ID_ORGS - 1);   // row spacing; overhangs are this tall, so they tile
    const ASK = O[ID_ORGS - 1].cx;          // the request is centred on the deepest org,
    const WIDE = 132;                       // so at nothing asked it fits everywhere
    const col = mk(gA, "rect");
    // Two overhang blocks per org, not two in total: see the draw loop.
    const OVER = O.map(() => [mk(gO, "rect"), mk(gO, "rect")]);
    const tok = mk(gT, "circle");
    at(tok, "r", 3.6);

    for (const o of O) {
        at(o.el, "x", o.lo); at(o.el, "y", o.y);
        at(o.el, "width", o.hi - o.lo); at(o.el, "height", H); at(o.el, "rx", 2);
    }
    for (let i = 1; i < ID_ORGS; i++) {
        at(O[i].link, "x1", O[i - 1].cx); at(O[i].link, "y1", O[i - 1].y + H);
        at(O[i].link, "x2", O[i].cx); at(O[i].link, "y2", O[i].y);
    }

    /* The pointer never touches the page: it is read off window coordinates
       against this element's own box, so the layer keeps pointer-events:none
       and cannot swallow a click or a scroll anywhere in the hero. Hover only
       — a finger lifting sends no further move event, and the request would
       stay stuck at whatever width the last touch left it. */
    let ptr = 0, want = 0, wantOn = 0, on = 0;
    window.addEventListener("pointermove", (ev) => {
        if (ev.pointerType === "touch") return;
        const r = host.getBoundingClientRect();
        if (!r.width) return;
        const x = ((ev.clientX - r.left) / r.width) * 320;
        const y = (ev.clientY - r.top) / r.height;
        wantOn = y > -0.15 && y < 1.15 ? 1 : 0;
        want = Math.min(WIDE, Math.abs(x - ASK));
    }, { passive: true });

    /* The clock starts a quarter of the way into the sweep, not at zero. Under
       prefers-reduced-motion the first frame is the ONLY frame, and at zero the
       request is at its narrowest — a picture of a tree with nothing refused,
       which is the half of the answer a still frame least needs to carry. */
    let prev = 0, clock = ID_ASK / 40;
    function draw(T) {
        clock += Math.max(0, Math.min(0.2, T - prev));
        prev = T;
        on += (wantOn - on) * 0.1;
        ptr += (want - ptr) * 0.16;

        /* How much is being asked for. Left alone it swells and shrinks on a
           triangle so a visitor who never moves still sees both answers; under
           the pointer it is simply the distance from the column's centre. */
        const u = (clock % (ID_ASK / 10)) / (ID_ASK / 10);
        const auto = 6 + sm(u < 0.5 ? u * 2 : 2 - u * 2) * (WIDE - 6);
        const h = auto + (ptr - auto) * on;
        const a = ASK - h, b = ASK + h;

        // Permitted exactly as far as the column still fits. Bars are nested,
        // so once one fails every bar below it fails too — the first is the
        // whole answer, and there is no need to look past it.
        let cut = ID_ORGS;
        for (let i = 0; i < ID_ORGS; i++)
            if (a < O[i].lo - 0.5 || b > O[i].hi + 0.5) { cut = i; break; }
        const ok = cut >= ID_ORGS;
        const end = ok ? ID_ORGS - 1 : cut;

        for (let i = 0; i < ID_ORGS; i++) {
            at(O[i].el, "class", i < cut ? "hot" : i === cut ? "no" : "");
            if (O[i].link) at(O[i].link, "class", i <= cut - 1 ? "hot" : i === cut ? "no" : "");
        }
        at(col, "x", a); at(col, "y", 16);
        at(col, "width", h * 2); at(col, "height", O[ID_ORGS - 1].y + H - 10);
        at(col, "class", ok ? "hot" : "");

        /* THE OVERHANG, AND WHY IT IS DRAWN FOR EVERY ORG BELOW THE CUT RATHER
           THAN ONLY AT IT. At the refusing org the request exceeds the granted
           scope by a hair — it is the FIRST org to fail, so it fails by the
           least — and a two-pixel sliver at the edge of a bar reads as noise,
           not as an answer. Scopes only narrow, so the same request exceeds
           every org below by more and more, and drawing all of them tiles into
           one wedge opening downward from the refusal. The wedge is the shape
           of the thing being refused: authority no ancestor ever held, so no
           descendant could be given it. */
        for (let i = 0; i < ID_ORGS; i++) {
            const live = !ok && i >= cut;
            at(OVER[i][0], "x", a); at(OVER[i][1], "x", O[i].hi);
            at(OVER[i][0], "width", live ? Math.max(0, O[i].lo - a) : 0);
            at(OVER[i][1], "width", live ? Math.max(0, b - O[i].hi) : 0);
            for (const el of OVER[i]) { at(el, "y", O[i].y - PITCH / 2 + H / 2); at(el, "height", PITCH); }
        }

        /* An attempt walks the chain at a CONSTANT rate and gets no further
           than the chain let it — then waits there. Scaling the walk to fit the
           distance instead would make a delegation refused at the first hop
           crawl, and a stalled token reads as a broken animation rather than a
           refusal. */
        const p = Math.min(end, ((clock % (ID_WALK / 10)) / (ID_WALK / 10)) * ID_ORGS);
        const i0 = Math.min(end, Math.floor(p)), f = p - i0;
        const q = O[Math.min(end, i0 + 1)];
        at(tok, "cx", O[i0].cx + (q.cx - O[i0].cx) * f);
        at(tok, "cy", O[i0].y + H / 2 + (q.y - O[i0].y) * f);
        at(tok, "class", !ok && p > end - 0.06 ? "no" : "");
    }

    /* The first frame is always painted, so the box is never empty — including
       under prefers-reduced-motion, where that frame is all there is. Nothing
       waits on an IntersectionObserver: it does not fire in a non-compositing
       renderer, and an animation that never starts reads as a broken page. */
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
        const go = !(mq && mq.matches) && !document.hidden && onScreen();
        // prev is re-based on resume, or a backgrounded tab returns with a
        // multi-minute delta and the request jumps across its whole range.
        if (go && !raf) { prev = performance.now() / 1000; raf = requestAnimationFrame(frame); }
        else if (!go) stop();
    }
    window.addEventListener("scroll", tick, { passive: true });
    window.addEventListener("resize", tick, { passive: true });
    document.addEventListener("visibilitychange", tick);
    if (mq && mq.addEventListener) mq.addEventListener("change", tick);
    tick();
})();
