/* ==========================================================================
   say.js — the contact form's upgrade, and nothing else.

   SHELL.md r9. Travis's ruling, 2026-08-17: contact is the ComputeDriven
   Formspree form. Fourteen surfaces were blocked on that endpoint and pointed
   corrections at GitHub issues instead; this replaces that as the primary
   channel and keeps the issues link as a second route.

   THE FORM WORKS WITHOUT THIS FILE. It is a real <form action method="POST">
   posting to Formspree, so with scripting off — the state this whole page is
   built to survive — pressing Send still delivers the message. All this adds
   is an inline reply, so the visitor is not handed to somebody else's
   thank-you screen.

   The one rule that matters: "sent" is printed ONLY after the endpoint
   returns 2xx. A form that says thank-you on submit and drops the message is
   precisely the failure the retraction on this page is about — the previous
   box had "no form, no handler, no destination". Printing success without one
   would be the same lie with better manners.

   It touches the form and nothing else on the page. It is not the identity
   animation and must not become one: identity.js is forbidden from reading or
   writing page content, this file is confined to <form class="say">.
   ========================================================================== */
(function () {
    var form = document.querySelector("form.say");
    if (!form || !window.fetch || !window.FormData) return;

    var msg = form.querySelector(".say-msg");
    var btn = form.querySelector("button[type=submit]");
    if (!msg || !btn) return;

    var say = function (text, cls) {
        msg.textContent = text;
        msg.className = "say-msg" + (cls ? " " + cls : "");
    };

    form.addEventListener("submit", function (e) {
        /* checkValidity is ours to call because the form carries `novalidate`.
           The browser's own bubbles are styled by the browser, not by us, and
           they would be the one part of this page that does not look like it. */
        if (!form.checkValidity()) {
            e.preventDefault();
            var bad = form.querySelector(":invalid");
            say(
                bad && bad.name === "email"
                    ? "That email address will not parse."
                    : "Both fields are needed.",
                "bad",
            );
            if (bad) bad.focus();
            return;
        }
        e.preventDefault();
        btn.disabled = true;
        say("sending…");

        fetch(form.action, {
            method: "POST",
            body: new FormData(form),
            headers: { Accept: "application/json" },
        })
            .then(function (res) {
                return res.json().then(
                    function (data) {
                        return { ok: res.ok, status: res.status, data: data };
                    },
                    function () {
                        return { ok: res.ok, status: res.status, data: null };
                    },
                );
            })
            .then(function (r) {
                if (r.ok) {
                    form.reset();
                    say("Sent. A person reads these; give it a day or two.", "ok");
                    /* Re-enabled so a second, different message is possible
                       without a reload. The reset form cannot resend the first
                       one, because empty fails validation. */
                    btn.disabled = false;
                    return;
                }
                /* Report what the endpoint actually said rather than a generic
                   apology — the reason is usually actionable. */
                var why =
                    (r.data &&
                        (r.data.error ||
                            (r.data.errors &&
                                r.data.errors
                                    .map(function (x) {
                                        return x.message;
                                    })
                                    .join("; ")))) ||
                    "HTTP " + r.status;
                say("Not sent — " + why, "bad");
                btn.disabled = false;
            })
            .catch(function () {
                /* The network, an extension, or a blocked third party. Say so
                   rather than leaving the button spinning on a lie. */
                say(
                    "Not sent — the request never completed. Check the connection, or anything blocking formspree.io.",
                    "bad",
                );
                btn.disabled = false;
            });
    });
})();
