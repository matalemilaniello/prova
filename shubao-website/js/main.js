(function () {
  "use strict";
  document.documentElement.classList.add("js");

  var CFG = window.SHUBAO || {};
  var DICT = window.SHUBAO_I18N || {};
  var LANGS = CFG.languages || ["en", "zh", "ko"];
  var HTML_LANG = { en: "en", zh: "zh-Hans", ko: "ko" };
  var LOCALE = { en: "en-US", zh: "zh-CN", ko: "ko-KR" };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; }
  }

  /* ---------- lingua ---------- */
  function pickLang() {
    var q = new URLSearchParams(location.search).get("lang");
    if (q && DICT[q]) return q;
    var saved = store("shubao-lang");
    if (saved && DICT[saved]) return saved;
    return LANGS[0]; // inglese predefinito, come da brief
  }
  var lang = pickLang();

  function t(key) { return (DICT[lang] && DICT[lang][key]) || (DICT.en && DICT.en[key]) || ""; }

  function applyLang() {
    document.documentElement.lang = HTML_LANG[lang] || lang;
    $$("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    $$("[data-i18n-label]").forEach(function (el) { el.setAttribute("aria-label", t(el.getAttribute("data-i18n-label"))); });
    $$(".lang button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.lang === lang)); });
    document.title = t("meta.title");
    var md = $('meta[name="description"]');
    if (md) md.setAttribute("content", t("meta.description"));
    if (lastPair) renderStats(lastPair);
  }

  $$(".lang button").forEach(function (b) {
    b.addEventListener("click", function () {
      lang = b.dataset.lang;
      store("shubao-lang", lang);
      applyLang();
    });
  });

  /* ---------- link ufficiali ---------- */
  $$(".js-link").forEach(function (a) {
    var href = CFG.links && CFG.links[a.dataset.link];
    if (!href) { a.hidden = true; return; }
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });

  /* ---------- contratto ---------- */
  var CA = CFG.contract || "";
  $("#caValue").textContent = CA;

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (ok, ko) {
      var ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy") ? ok() : ko(); } catch (e) { ko(e); }
      document.body.removeChild(ta);
    });
  }

  var toastTimer, copyTimer;
  function toast(msg) {
    var el = $("#toast");
    el.textContent = msg;
    el.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("is-on"); }, 1800);
  }

  $("#caCopy").addEventListener("click", function () {
    var btn = this, label = $("#caCopyText");
    copy(CA).then(function () {
      btn.classList.add("is-done");
      label.textContent = t("ca.copied");
      toast(t("ca.copied") + " ✓");
      clearTimeout(copyTimer);
      copyTimer = setTimeout(function () { btn.classList.remove("is-done"); label.textContent = t("ca.copy"); }, 1800);
    }).catch(function () {
      // ultima risorsa: seleziona il testo per la copia manuale
      var r = document.createRange(); r.selectNodeContents($("#caValue"));
      var s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
  });

  /* ---------- il cucciolo cliccabile ---------- */
  var audioCtx = null;
  function squeak() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = audioCtx || new AC();
      var now = audioCtx.currentTime;
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(900, now);
      osc.frequency.exponentialRampToValueAtTime(1700, now + 0.08);
      osc.frequency.exponentialRampToValueAtTime(1100, now + 0.22);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } catch (e) { /* audio non disponibile */ }
  }

  var panda = $("#panda"), squeakTimer;
  panda.addEventListener("click", function () {
    panda.classList.remove("is-squeaking");
    void panda.offsetWidth; // riavvia l'animazione
    panda.classList.add("is-squeaking");
    squeak();
    clearTimeout(squeakTimer);
    squeakTimer = setTimeout(function () { panda.classList.remove("is-squeaking"); }, 650);
  });

  /* ---------- dati di mercato in tempo reale (DexScreener) ---------- */
  var lastPair = null;

  function money(n, compact) {
    if (n == null || isNaN(n)) return "-";
    var o = { style: "currency", currency: "USD" };
    if (compact) { o.notation = "compact"; o.maximumFractionDigits = 2; }
    else if (n < 1) { o.maximumSignificantDigits = 4; }
    else { o.maximumFractionDigits = 2; }
    return new Intl.NumberFormat(LOCALE[lang] || "en-US", o).format(n);
  }
  function pct(n) {
    if (n == null || isNaN(n)) return "-";
    return (n > 0 ? "+" : "") + new Intl.NumberFormat(LOCALE[lang] || "en-US", { maximumFractionDigits: 2 }).format(n) + "%";
  }

  function renderStats(p) {
    $("#sPrice").textContent = money(parseFloat(p.priceUsd));
    $("#sMcap").textContent = money(p.marketCap || p.fdv, true);
    $("#sLiq").textContent = money(p.liquidity && p.liquidity.usd, true);
    var ch = p.priceChange && p.priceChange.h24, el = $("#sChange");
    el.textContent = pct(ch);
    el.classList.toggle("up", ch > 0);
    el.classList.toggle("down", ch < 0);
  }

  function loadStats() {
    if (!CA || !window.fetch) return;
    fetch("https://api.dexscreener.com/tokens/v1/bsc/" + CA)
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (pairs) {
        if (!Array.isArray(pairs) || !pairs.length) return;
        var want = (CFG.pair || "").toLowerCase();
        var p = pairs.filter(function (x) { return (x.pairAddress || "").toLowerCase() === want; })[0];
        if (!p) {
          pairs.sort(function (a, b) { return ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0); });
          p = pairs[0];
        }
        lastPair = p;
        renderStats(p);
        $("#stats").hidden = false;
        $("#statsSrc").hidden = false;
      })
      .catch(function () { /* se DexScreener non risponde, la striscia resta nascosta */ });
  }

  /* ---------- interfaccia ---------- */
  var nav = $("#nav"), menuBtn = $("#menuBtn");
  function setMenu(open) {
    nav.classList.toggle("is-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
  }
  menuBtn.addEventListener("click", function () { setMenu(!nav.classList.contains("is-open")); });
  $$("a", nav).forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });

  var header = $("#header");
  function onScroll() { header.classList.toggle("is-scrolled", scrollY > 8); }
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  if ("IntersectionObserver" in window) {
    var ro = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("is-in"); ro.unobserve(e.target); } });
    }, { threshold: 0.12 });
    $$(".reveal").forEach(function (el) { ro.observe(el); });

    var links = $$("a", nav);
    var so = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.classList.toggle("is-active", a.getAttribute("href") === "#" + e.target.id); });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    $$("main section[id]").forEach(function (s) { so.observe(s); });
  } else {
    $$(".reveal").forEach(function (el) { el.classList.add("is-in"); });
  }

  $("#year").textContent = new Date().getFullYear();

  applyLang();
  loadStats();
  setInterval(loadStats, 60000);
})();
