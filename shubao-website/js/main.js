/* 曙宝 Shubao · comportamento del sito.
   I testi della pagina sono già nell'HTML (generato da tools/build.py);
   qui arrivano solo i messaggi dinamici, in window.SHUBAO.t */
(function () {
  "use strict";
  var P = window.SHUBAO || {};
  var T = P.t || {};
  var CA = P.contract || "";
  var LOC = P.locale || "en-US";
  var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.documentElement.classList.add("js");

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; }
  }

  /* ---------- lingua: ricorda la scelta e propone quella del browser ---------- */
  $$("[data-lang]").forEach(function (a) {
    a.addEventListener("click", function () { store("shubao-lang", a.dataset.lang); });
  });
  (function autoLang() {
    if (P.lang !== "en" || P.base !== "") return;          // solo sulla pagina inglese principale
    if (/[?&]lang=en\b/.test(location.search)) { store("shubao-lang", "en"); return; }
    var saved = store("shubao-lang");
    if (saved) { if (saved !== "en" && /^(zh|ko|ja)$/.test(saved)) location.replace(saved + "/" + location.hash); return; }
    var nav = ((navigator.languages && navigator.languages[0]) || navigator.language || "").toLowerCase();
    var m = nav.match(/^(zh|ko|ja)/);
    if (m) location.replace(m[1] + "/" + location.hash);
  })();

  /* ---------- avvisi ---------- */
  var toastTimer;
  function toast(msg) {
    var el = $("#toast"); if (!el) return;
    el.textContent = msg;
    el.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("is-on"); }, 2200);
  }

  /* ---------- copia del contratto ---------- */
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
  $$(".js-copy").forEach(function (btn) {
    var label = $(".js-copy-label", btn), orig = label ? label.textContent : "", timer;
    btn.addEventListener("click", function () {
      copy(CA).then(function () {
        btn.classList.add("is-done");
        if (label) label.textContent = T["ca.copied"];
        toast(T["ca.copied"] + " ✓");
        clearTimeout(timer);
        timer = setTimeout(function () { btn.classList.remove("is-done"); if (label) label.textContent = orig; }, 1800);
      }).catch(function () {
        var r = document.createRange(); r.selectNodeContents($("#caValue"));
        var s = getSelection(); s.removeAllRanges(); s.addRange(r);
      });
    });
  });

  /* ---------- età di Shubao (nata il 3 giugno 2026, ora di Seul) ---------- */
  var BORN = Date.UTC(2026, 5, 2, 15, 0, 0); // 3/6/2026 00:00 KST
  var days = Math.max(0, Math.floor((Date.now() - BORN) / 864e5));
  var daysTxt = new Intl.NumberFormat(LOC).format(days);
  $$("[data-age-template]").forEach(function (el) {
    el.textContent = el.getAttribute("data-age-template").replace("{days}", daysTxt);
  });

  /* ---------- verso sintetizzato ---------- */
  var audioCtx = null;
  function squeak(pitch) {
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      audioCtx = audioCtx || new AC();
      var now = audioCtx.currentTime, k = pitch || 1;
      var osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(900 * k, now);
      osc.frequency.exponentialRampToValueAtTime(1700 * k, now + 0.08);
      osc.frequency.exponentialRampToValueAtTime(1100 * k, now + 0.22);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now); osc.stop(now + 0.3);
    } catch (e) { /* niente audio */ }
  }

  /* ---------- il cucciolo cliccabile e la sorpresa ---------- */
  var panda = $("#panda"), squeakTimer, taps = [];
  function pawRain() {
    if (reduceMotion) return;
    var box = document.createElement("div");
    box.className = "paw-rain"; box.setAttribute("aria-hidden", "true");
    for (var i = 0; i < 26; i++) {
      var s = document.createElement("span");
      s.style.left = Math.random() * 100 + "vw";
      s.style.animationDelay = (Math.random() * 0.9).toFixed(2) + "s";
      s.style.setProperty("--r", (Math.random() * 360 | 0) + "deg");
      s.style.setProperty("--s", (0.7 + Math.random() * 0.9).toFixed(2));
      s.innerHTML = '<svg><use href="#paw"/></svg>';
      box.appendChild(s);
    }
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 3600);
  }
  if (panda) panda.addEventListener("click", function () {
    panda.classList.remove("is-squeaking"); void panda.offsetWidth;
    panda.classList.add("is-squeaking");
    squeak();
    clearTimeout(squeakTimer);
    squeakTimer = setTimeout(function () { panda.classList.remove("is-squeaking"); }, 650);
    var now = Date.now();
    taps = taps.filter(function (t) { return now - t < 3000; }); taps.push(now);
    if (taps.length >= 5) { taps = []; pawRain(); toast(T.egg); }
  });

  $$(".js-wiggle").forEach(function (b, i) {
    b.addEventListener("click", function () {
      b.classList.remove("is-wiggle"); void b.offsetWidth; b.classList.add("is-wiggle");
      squeak(0.85 + i * 0.08);
    });
  });

  /* ---------- dati di mercato (DexScreener) ---------- */
  function money(n, compact) {
    if (n == null || isNaN(n)) return "-";
    var o = { style: "currency", currency: "USD" };
    if (compact) { o.notation = "compact"; o.maximumFractionDigits = 2; }
    else if (n < 1) { o.maximumSignificantDigits = 4; }
    else { o.maximumFractionDigits = 2; }
    return new Intl.NumberFormat(LOC, o).format(n);
  }
  function num(n, compact) {
    if (n == null || isNaN(n)) return "-";
    return new Intl.NumberFormat(LOC, compact ? { notation: "compact", maximumFractionDigits: 2 } : {}).format(n);
  }
  function pct(n) {
    if (n == null || isNaN(n)) return "-";
    return (n > 0 ? "+" : "") + new Intl.NumberFormat(LOC, { maximumFractionDigits: 2 }).format(n) + "%";
  }
  function showStats() { $("#stats").hidden = false; $("#statsSrc").hidden = false; }

  function loadMarket() {
    if (!CA || !window.fetch) return;
    fetch("https://api.dexscreener.com/tokens/v1/bsc/" + CA)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (pairs) {
        if (!Array.isArray(pairs) || !pairs.length) return;
        var want = (P.pair || "").toLowerCase();
        var p = pairs.filter(function (x) { return (x.pairAddress || "").toLowerCase() === want; })[0];
        if (!p) {
          pairs.sort(function (a, b) { return ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0); });
          p = pairs[0];
        }
        $("#sPrice").textContent = money(parseFloat(p.priceUsd));
        $("#sMcap").textContent = money(p.marketCap || p.fdv, true);
        $("#sLiq").textContent = money(p.liquidity && p.liquidity.usd, true);
        var ch = p.priceChange && p.priceChange.h24, el = $("#sChange");
        el.textContent = pct(ch); el.classList.toggle("up", ch > 0); el.classList.toggle("down", ch < 0);
        $("#sVol").textContent = money(p.volume && p.volume.h24, true);
        var tx = p.txns && p.txns.h24;
        $("#sTxns").textContent = tx ? num((tx.buys || 0) + (tx.sells || 0)) : "-";
        showStats();
      })
      .catch(function () { /* se DexScreener non risponde, la striscia resta nascosta */ });
  }

  /* ---------- dati letti dalla blockchain (BNB Chain) ---------- */
  var RPCS = ["https://bsc-dataseed.bnbchain.org", "https://bsc-rpc.publicnode.com"];
  var token = { decimals: null, symbol: null };
  function rpcCall(data, i) {
    i = i || 0;
    if (i >= RPCS.length) return Promise.reject(new Error("rpc"));
    return fetch(RPCS[i], {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: CA, data: data }, "latest"] })
    }).then(function (r) { return r.json(); })
      .then(function (j) { if (!j || !j.result || j.result === "0x") throw new Error("vuoto"); return j.result; })
      .catch(function () { return rpcCall(data, i + 1); });
  }
  function decodeString(hex) {
    try {
      var h = hex.slice(2);
      var len = parseInt(h.slice(64, 128), 16);
      var bytes = h.slice(128, 128 + len * 2).match(/../g) || [];
      return new TextDecoder().decode(new Uint8Array(bytes.map(function (b) { return parseInt(b, 16); })));
    } catch (e) { return null; }
  }
  function loadChain() {
    if (!CA || !window.fetch || typeof BigInt === "undefined") return;
    Promise.all([rpcCall("0x313ce567"), rpcCall("0x18160ddd"), rpcCall("0x95d89b41")])
      .then(function (r) {
        token.decimals = parseInt(r[0], 16);
        token.symbol = decodeString(r[2]);
        var supply = BigInt(r[1]) / (BigInt(10) ** BigInt(token.decimals));
        $("#sSupply").textContent = new Intl.NumberFormat(LOC).format(Number(supply)) + (token.symbol ? " " + token.symbol : "");
        $("#supplyCell").hidden = false;
        showStats();
        var add = $("#addToken");
        if (add && token.symbol) add.disabled = false;
      })
      .catch(function () { /* nodo non raggiungibile: il pulsante resta disattivato */ });
  }

  /* ---------- aggiungi a MetaMask ---------- */
  var addBtn = $("#addToken");
  function walletMsg(m) { var el = $("#walletMsg"); if (el) el.textContent = m; }
  if (addBtn) addBtn.addEventListener("click", function () {
    var eth = window.ethereum;
    if (!eth) return walletMsg(T["ca.noWallet"]);
    eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x38" }] })
      .catch(function (err) {
        if (err && err.code === 4902) {
          return eth.request({ method: "wallet_addEthereumChain", params: [{
            chainId: "0x38", chainName: "BNB Smart Chain",
            nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
            rpcUrls: [RPCS[0]], blockExplorerUrls: ["https://bscscan.com"]
          }] });
        }
        throw err;
      })
      .then(function () {
        return eth.request({ method: "wallet_watchAsset", params: { type: "ERC20", options: {
          address: CA, symbol: token.symbol, decimals: token.decimals,
          image: new URL(P.base + "assets/icons/icon-512.png", location.href).href
        } } });
      })
      .then(function () { walletMsg(T["ca.added"]); })
      .catch(function () { walletMsg(T["ca.walletError"]); });
  });

  /* ---------- caricamento pigro: grafico e video ---------- */
  function onVisible(el, fn, margin) {
    if (!el) return;
    if (!("IntersectionObserver" in window)) return fn();
    var io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); fn(); }
    }, { rootMargin: margin || "300px" });
    io.observe(el);
  }
  var chartBox = $("#chartBox");
  onVisible(chartBox, function () {
    var f = document.createElement("iframe");
    f.src = chartBox.dataset.src; f.title = "DexScreener"; f.loading = "lazy";
    f.addEventListener("load", function () { chartBox.classList.add("is-loaded"); });
    chartBox.appendChild(f);
  });

  $$(".js-video").forEach(function (b) {
    b.addEventListener("click", function () {
      var f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(b.dataset.id) + "?autoplay=1&rel=0";
      f.title = b.getAttribute("aria-label") || T["watch.play"];
      f.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      f.allowFullscreen = true;
      f.className = "video__frame";
      b.replaceWith(f);
    });
  });

  /* ---------- generatore di immagine profilo ---------- */
  (function pfp() {
    var cv = $("#pfpCanvas"); if (!cv || !cv.getContext) return;
    var ctx = cv.getContext("2d"), S = cv.width, R = S / 2 - 52;
    var file = $("#pfpFile"), zoom = $("#pfpZoom"), save = $("#pfpSave");
    var photo = null, z = 1, ox = 0, oy = 0;
    var sticker = new Image(); sticker.src = P.base + "assets/img/sticker-morning-800.webp";
    var placeholder = new Image(); placeholder.src = P.base + "assets/img/hero-panda-rest.webp";

    function draw() {
      ctx.clearRect(0, 0, S, S);
      ctx.save();
      ctx.beginPath(); ctx.arc(S / 2, S / 2, R, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
      ctx.fillStyle = "#F7F1E6"; ctx.fillRect(0, 0, S, S);
      var img = photo || placeholder;
      if (img.complete && img.naturalWidth) {
        var base = Math.max((2 * R) / img.naturalWidth, (2 * R) / img.naturalHeight) * (photo ? z : 1);
        var w = img.naturalWidth * base, h = img.naturalHeight * base;
        ctx.drawImage(img, S / 2 - w / 2 + ox, S / 2 - h / 2 + oy, w, h);
      }
      ctx.restore();
      ctx.lineWidth = 40; ctx.strokeStyle = "#EC869B";
      ctx.beginPath(); ctx.arc(S / 2, S / 2, R + 20, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 8; ctx.strokeStyle = "#F7F1E6";
      ctx.beginPath(); ctx.arc(S / 2, S / 2, R - 2, 0, Math.PI * 2); ctx.stroke();
      if (sticker.complete && sticker.naturalWidth) ctx.drawImage(sticker, S - 330, S - 330, 320, 320);
      // targhetta 曙宝
      ctx.fillStyle = "#283016";
      var bx = 70, by = S - 190, bw = 250, bh = 120;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 60); else ctx.rect(bx, by, bw, bh);
      ctx.fill();
      ctx.fillStyle = "#F7F7F7"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = '86px "Ma Shan Zheng", "Noto Sans SC", serif';
      ctx.fillText("曙宝", bx + bw / 2, by + bh / 2 + 6);
    }
    [sticker, placeholder].forEach(function (i) { i.onload = draw; });
    if (document.fonts && document.fonts.load) document.fonts.load('86px "Ma Shan Zheng"', "曙宝").then(draw, draw);
    draw();

    file.addEventListener("change", function () {
      var f = file.files && file.files[0]; if (!f) return;
      var url = URL.createObjectURL(f), img = new Image();
      img.onload = function () { photo = img; z = 1; ox = oy = 0; zoom.value = 1; zoom.disabled = false; save.disabled = false; draw(); };
      img.src = url;
    });
    zoom.addEventListener("input", function () { z = parseFloat(zoom.value) || 1; draw(); });

    var drag = null;
    cv.addEventListener("pointerdown", function (e) {
      if (!photo) return;
      drag = { x: e.clientX, y: e.clientY, ox: ox, oy: oy };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var k = S / cv.getBoundingClientRect().width;
      ox = drag.ox + (e.clientX - drag.x) * k; oy = drag.oy + (e.clientY - drag.y) * k; draw();
    });
    ["pointerup", "pointercancel"].forEach(function (ev) { cv.addEventListener(ev, function () { drag = null; }); });

    save.addEventListener("click", function () {
      cv.toBlob(function (b) {
        if (!b) return;
        var a = document.createElement("a");
        a.href = URL.createObjectURL(b); a.download = "shubao-pfp.png";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      }, "image/png");
    });
  })();

  /* ---------- numeri che contano ---------- */
  function countUp(el) {
    var txt = el.textContent, m = txt.match(/\d[\d,.]*/);
    if (!m || reduceMotion) return;
    var target = parseFloat(m[0].replace(/,/g, "")), dec = (m[0].split(".")[1] || "").length;
    var t0 = null, dur = 1100;
    function step(ts) {
      t0 = t0 || ts;
      var k = Math.min(1, (ts - t0) / dur), v = target * (1 - Math.pow(1 - k, 3));
      var s = dec ? v.toFixed(dec) : Math.round(v).toLocaleString("en-US");
      if (m[0].indexOf(",") < 0) s = s.replace(/,/g, "");
      el.textContent = txt.replace(m[0], k < 1 ? s : m[0]);
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------- interfaccia ---------- */
  var nav = $("#nav"), menuBtn = $("#menuBtn");
  function setMenu(open) { nav.classList.toggle("is-open", open); menuBtn.setAttribute("aria-expanded", String(open)); }
  menuBtn.addEventListener("click", function () { setMenu(!nav.classList.contains("is-open")); });
  $$("a", nav).forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });

  var header = $("#header"), bar = $("#progress"), sticky = $("#stickyBuy"), ca = $("#ca");
  function onScroll() {
    var y = scrollY, h = document.documentElement.scrollHeight - innerHeight;
    header.classList.toggle("is-scrolled", y > 8);
    if (bar) bar.style.transform = "scaleX(" + (h > 0 ? Math.min(1, y / h) : 0) + ")";
    if (sticky && ca) sticky.classList.toggle("is-on", ca.getBoundingClientRect().bottom < 0);
  }
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  if ("IntersectionObserver" in window) {
    var ro = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        $$(".js-count", e.target).forEach(countUp);
        ro.unobserve(e.target);
      });
    }, { threshold: 0.12 });
    $$(".reveal").forEach(function (el) { ro.observe(el); });

    var links = $$("a[href^='#']", nav);
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

  var yr = $("#year"); if (yr) yr.textContent = new Date().getFullYear();

  loadMarket();
  loadChain();
  setInterval(loadMarket, 60000);
})();
