(function () {
  "use strict";

  var cfg = window.SHUBA_CONFIG || {};
  var DICT = window.SHUBA_I18N || {};
  var links = cfg.links || {};
  var tok = cfg.tokenomics || {};

  var BSC = {
    chainId: "0x38",
    chainName: "BNB Smart Chain",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    rpcUrls: ["https://bsc-dataseed.bnbchain.org"],
    blockExplorerUrls: ["https://bscscan.com"]
  };

  var PALETTE = ["#F0B90B", "#FFD95A", "#E8762B", "#2EBD85", "#7B61FF", "#3FA9F5", "#F6465D", "#C9C3B5"];

  /* ---------- utilità ---------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function isAddress(a) { return typeof a === "string" && /^0x[a-fA-F0-9]{40}$/.test(a.trim()); }
  var CA = isAddress(cfg.contract) ? cfg.contract.trim() : "";

  if (cfg.contract && !CA) {
    console.warn("[Shuba] L'indirizzo del contratto in config.js non è valido:", cfg.contract);
  }

  // Link derivati dall'indirizzo del contratto
  var LINK = {
    pancakeswap: links.pancakeswap || (CA ? "https://pancakeswap.finance/swap?chain=bsc&outputCurrency=" + CA : ""),
    bscscan: links.bscscan || (CA ? "https://bscscan.com/token/" + CA : ""),
    dexscreener: links.dexscreener || (CA ? "https://dexscreener.com/bsc/" + CA : ""),
    telegram: links.telegram || "",
    x: links.x || "",
    instagram: links.instagram || "",
    tiktok: links.tiktok || "",
    email: links.email ? "mailto:" + links.email : ""
  };

  function storageGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function storageSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* niente */ } }

  /* ---------- lingua ---------- */
  var lang = (function () {
    var saved = storageGet("shuba-lang");
    if (saved && DICT[saved]) return saved;
    var nav = (navigator.language || "").slice(0, 2).toLowerCase();
    if (DICT[nav]) return nav;
    return DICT[cfg.defaultLang] ? cfg.defaultLang : "en";
  })();

  function t(key) {
    var s = (DICT[lang] && DICT[lang][key]) || (DICT.en && DICT.en[key]) || key;
    return s
      .replace(/\{name\}/g, cfg.name || "Shuba")
      .replace(/\{ticker\}/g, cfg.ticker || "SHUBA")
      .replace(/\{chain\}/g, cfg.chainName || "BNB Chain");
  }
  function pick(obj) {
    if (obj == null) return "";
    if (typeof obj === "string") return obj;
    return obj[lang] || obj.en || obj.it || "";
  }
  function locale() { return lang === "it" ? "it-IT" : "en-US"; }

  /* ---------- formattazione ---------- */
  function fmtInt(n) { return new Intl.NumberFormat(locale()).format(n); }
  function fmtUsd(n, compact) {
    if (n == null || isNaN(n)) return "-";
    var opts = { style: "currency", currency: "USD" };
    if (compact) { opts.notation = "compact"; opts.maximumFractionDigits = 2; }
    else if (n < 1) { opts.maximumSignificantDigits = 4; }
    else { opts.maximumFractionDigits = 4; }
    return new Intl.NumberFormat(locale(), opts).format(n);
  }
  function fmtPct(n) {
    if (n == null || isNaN(n)) return "-";
    return (n > 0 ? "+" : "") + new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(n) + "%";
  }

  /* ---------- toast ---------- */
  var toastTimer;
  function toast(msg) {
    var el = $("#toast");
    el.textContent = msg;
    el.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("is-on"); }, 2200);
  }

  /* ---------- testi ---------- */
  function applyTexts() {
    document.documentElement.lang = lang;
    $$("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    $$("[data-bind='name']").forEach(function (el) { el.textContent = cfg.name || "Shuba"; });
    $$(".lang button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.lang === lang)); });
    document.title = (cfg.name || "Shuba") + " ($" + (cfg.ticker || "SHUBA") + ") | " +
      (lang === "it" ? "Memecoin su BNB Chain" : "Memecoin on BNB Chain");

    renderBuyButtons();
    renderContract();
    renderTokenomics();
    renderRoadmap();
    renderMarquee();
    if (lastStats) renderStats(lastStats);
  }

  /* ---------- pulsanti di acquisto ---------- */
  function setExternal(a, href) {
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }

  function renderBuyButtons() {
    $$(".js-buy").forEach(function (a) {
      if (LINK.pancakeswap) {
        setExternal(a, LINK.pancakeswap);
        a.classList.remove("is-disabled");
        a.removeAttribute("aria-disabled");
      } else if (a.closest("#how-to-buy")) {
        a.textContent = t("cta.soon");
        a.classList.add("is-disabled");
        a.setAttribute("aria-disabled", "true");
        a.removeAttribute("href");
      } else {
        a.href = "#how-to-buy";
      }
    });

    $$(".js-community").forEach(function (a) {
      if (LINK.telegram) setExternal(a, LINK.telegram);
      else if (LINK.x) setExternal(a, LINK.x);
      else a.href = "#community";
    });

    var addToken = $("#addToken");
    addToken.disabled = !CA;
    addToken.classList.toggle("is-disabled", !CA);
  }

  /* ---------- indirizzo del contratto ---------- */
  function renderContract() {
    var box = $("#ca");
    var val = $("#caValue");
    if (CA) {
      box.classList.remove("is-pending");
      val.textContent = CA;
      val.title = CA;
    } else {
      box.classList.add("is-pending");
      val.textContent = t("hero.contractPending");
    }
    $("#notice").hidden = !!CA;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy") ? resolve() : reject(); } catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }

  $("#caCopy").addEventListener("click", function () {
    if (!CA) return;
    var btn = this;
    copyText(CA).then(function () {
      btn.textContent = t("hero.copied");
      toast(t("hero.copied"));
      setTimeout(function () { btn.textContent = t("hero.copy"); }, 1600);
    }).catch(function () { window.prompt("", CA); });
  });

  /* ---------- tokenomics ---------- */
  function tokItem(labelKey, value, isTba) {
    return '<li class="reveal is-in"><span class="tok__label">' + esc(t(labelKey)) + '</span>' +
      '<span class="tok__value' + (isTba ? " is-tba" : "") + '">' + esc(value) + "</span></li>";
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function boolText(v, yes, no) { return v === true ? t(yes) : v === false ? t(no) : null; }

  function renderTokenomics() {
    var tba = t("tok.tba");
    var supply = typeof tok.totalSupply === "number" ? fmtInt(tok.totalSupply) + " $" + (cfg.ticker || "") : null;
    var buy = typeof tok.buyTax === "number" ? tok.buyTax + "%" : null;
    var sell = typeof tok.sellTax === "number" ? tok.sellTax + "%" : null;
    var lp = boolText(tok.liquidityLocked, "tok.locked", "tok.notLocked");
    var own = boolText(tok.ownershipRenounced, "tok.renounced", "tok.notRenounced");

    $("#tokGrid").innerHTML =
      tokItem("tok.supply", supply || tba, !supply) +
      tokItem("tok.buyTax", buy || tba, !buy) +
      tokItem("tok.sellTax", sell || tba, !sell) +
      tokItem("tok.lp", lp || tba, !lp) +
      tokItem("tok.owner", own || tba, !own);

    var alloc = Array.isArray(tok.allocation) ? tok.allocation.filter(function (a) { return a && a.percent > 0; }) : [];
    var donut = $("#donut");
    var legend = $("#legend");
    $("#allocTba").hidden = alloc.length > 0;
    legend.hidden = alloc.length === 0;

    if (!alloc.length) {
      donut.style.background = "conic-gradient(var(--surface-2) 0 100%)";
      donut.setAttribute("aria-label", t("tok.allocationTba"));
      legend.innerHTML = "";
      return;
    }

    var sum = alloc.reduce(function (s, a) { return s + a.percent; }, 0);
    if (Math.abs(sum - 100) > 0.01) console.warn("[Shuba] La ripartizione in config.js somma a " + sum + "%, non 100%.");

    var acc = 0;
    var stops = alloc.map(function (a, i) {
      var from = (acc / sum) * 100;
      acc += a.percent;
      var to = (acc / sum) * 100;
      return PALETTE[i % PALETTE.length] + " " + from + "% " + to + "%";
    });
    donut.style.background = "conic-gradient(" + stops.join(",") + ")";
    donut.setAttribute("aria-label", alloc.map(function (a) { return pick(a.label) + " " + a.percent + "%"; }).join(", "));
    legend.innerHTML = alloc.map(function (a, i) {
      return '<li><i style="background:' + PALETTE[i % PALETTE.length] + '"></i><span>' + esc(pick(a.label)) +
        "</span><b>" + esc(a.percent) + "%</b></li>";
    }).join("");
  }

  /* ---------- tabella di marcia ---------- */
  function renderRoadmap() {
    var phases = Array.isArray(cfg.roadmap) ? cfg.roadmap : [];
    $("#road").innerHTML = phases.map(function (p) {
      var st = p.status === "done" || p.status === "now" ? p.status : "next";
      var items = pick(p.items);
      if (!Array.isArray(items)) items = [];
      return '<article class="phase reveal is-in is-' + st + '">' +
        '<span class="phase__status">' + esc(t("road." + st)) + "</span>" +
        "<h3>" + esc(pick(p.title)) + "</h3>" +
        "<ul>" + items.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul></article>";
    }).join("");
  }

  /* ---------- nastro scorrevole ---------- */
  function renderMarquee() {
    var words = ["$" + (cfg.ticker || "SHUBA"), "BNB CHAIN", "COMMUNITY", "BEP-20", lang === "it" ? "SEMPRE AVANTI" : "TO THE MOON"];
    var html = words.map(function (w) { return "<span>" + esc(w) + "</span>"; }).join("");
    $("#marquee").innerHTML = html + html + html + html;
  }

  /* ---------- canali social ---------- */
  var ICONS = {
    telegram: '<svg viewBox="0 0 24 24"><path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.5 13.2 1.8 11.7c-1-.3-1-1 .2-1.5L20.5 3c.9-.3 1.6.2 1.4 1.3z"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M17.8 2.5h3.3l-7.2 8.2 8.5 10.8h-6.6l-5.2-6.8-6 6.8H1.3l7.7-8.8L.9 2.5h6.8l4.7 6.2zm-1.2 17h1.8L6.6 4.4H4.6z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4zM17.3 5.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zM12 3.6c2.7 0 3 0 4.1.1 2.7.1 4 1.4 4.1 4.1.1 1.1.1 1.4.1 4.1s0 3-.1 4.1c-.1 2.7-1.4 4-4.1 4.1-1.1.1-1.4.1-4.1.1s-3 0-4.1-.1c-2.7-.1-4-1.4-4.1-4.1C3.7 15 3.7 14.7 3.7 12s0-3 .1-4.1C3.9 5.2 5.2 3.9 7.9 3.8 9 3.7 9.3 3.6 12 3.6zM12 1.8c-2.8 0-3.1 0-4.2.1C4.1 2 2 4.1 1.9 7.8 1.8 8.9 1.8 9.2 1.8 12s0 3.1.1 4.2C2 19.9 4.1 22 7.8 22.1c1.1.1 1.4.1 4.2.1s3.1 0 4.2-.1c3.7-.2 5.8-2.2 5.9-5.9.1-1.1.1-1.4.1-4.2s0-3.1-.1-4.2C22 4.1 19.9 2 16.2 1.9 15.1 1.8 14.8 1.8 12 1.8z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24"><path d="M16.6 2h-3.4v13.6a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9.3a6.3 6.3 0 1 0 5.4 6.3V8.7a8 8 0 0 0 4.6 1.5V6.8a4.6 4.6 0 0 1-4.6-4.8z"/></svg>',
    email: '<svg viewBox="0 0 24 24"><path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm9 7.2L4.2 7v10h15.6V7z"/></svg>'
  };
  var SOCIAL_NAMES = { telegram: "Telegram", x: "X", instagram: "Instagram", tiktok: "TikTok", email: "Email" };

  function renderSocials() {
    var keys = ["telegram", "x", "instagram", "tiktok", "email"].filter(function (k) { return LINK[k]; });
    $("#socials").innerHTML = keys.map(function (k) {
      var ext = k === "email" ? "" : ' target="_blank" rel="noopener noreferrer"';
      return '<a class="social" href="' + esc(LINK[k]) + '"' + ext + ">" + ICONS[k] + "<span>" + SOCIAL_NAMES[k] + "</span></a>";
    }).join("");
    $("#socialsSoon").hidden = keys.length > 0;

    var foot = [
      ["PancakeSwap", LINK.pancakeswap], ["BscScan", LINK.bscscan], ["DexScreener", LINK.dexscreener]
    ].concat(keys.map(function (k) { return [SOCIAL_NAMES[k], LINK[k]]; }))
      .filter(function (l) { return l[1]; });
    $("#footerLinks").innerHTML = foot.map(function (l) {
      var ext = l[1].indexOf("mailto:") === 0 ? "" : ' target="_blank" rel="noopener noreferrer"';
      return '<a href="' + esc(l[1]) + '"' + ext + ">" + esc(l[0]) + "</a>";
    }).join("");
  }

  /* ---------- dati di mercato (DexScreener) ---------- */
  var lastStats = null;

  function renderStats(p) {
    $("#statPrice").textContent = fmtUsd(parseFloat(p.priceUsd));
    $("#statMcap").textContent = fmtUsd(p.marketCap || p.fdv, true);
    $("#statLiq").textContent = fmtUsd(p.liquidity && p.liquidity.usd, true);
    var ch = p.priceChange && p.priceChange.h24;
    var el = $("#statChange");
    el.textContent = fmtPct(ch);
    el.classList.toggle("up", ch > 0);
    el.classList.toggle("down", ch < 0);
  }

  function loadStats() {
    if (!CA || !window.fetch) return;
    fetch("https://api.dexscreener.com/latest/dex/tokens/" + CA)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        var pairs = (data && data.pairs || []).filter(function (p) { return p.chainId === "bsc"; });
        if (!pairs.length) return;
        pairs.sort(function (a, b) { return ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0); });
        lastStats = pairs[0];
        renderStats(lastStats);
        $("#stats").hidden = false;
        $("#statsSrc").hidden = false;
      })
      .catch(function (e) { console.info("[Shuba] Dati DexScreener non disponibili:", e && e.message); });
  }

  function setupChart() {
    if (!CA) return;
    $("#chartFrame").src = "https://dexscreener.com/bsc/" + CA + "?embed=1&theme=dark&trades=0&info=0";
    $("#chart").hidden = false;
  }

  /* ---------- portafoglio ---------- */
  function walletMsg(msg) { $("#walletMsg").textContent = msg; }

  function ensureBsc(eth) {
    return eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BSC.chainId }] })
      .catch(function (err) {
        if (err && (err.code === 4902 || (err.data && err.data.originalError && err.data.originalError.code === 4902))) {
          return eth.request({ method: "wallet_addEthereumChain", params: [BSC] });
        }
        throw err;
      });
  }

  $("#addChain").addEventListener("click", function () {
    var eth = window.ethereum;
    if (!eth) return walletMsg(t("buy.noWallet"));
    ensureBsc(eth).then(function () { walletMsg(""); toast("BNB Smart Chain ✓"); })
      .catch(function () { walletMsg(t("buy.walletError")); });
  });

  $("#addToken").addEventListener("click", function () {
    if (!CA) return;
    var eth = window.ethereum;
    if (!eth) return walletMsg(t("buy.noWallet"));
    ensureBsc(eth).then(function () {
      return eth.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20",
          options: {
            address: CA,
            symbol: String(cfg.ticker || "SHUBA").slice(0, 11),
            decimals: Number(cfg.decimals) || 18,
            image: new URL("assets/logo.svg", location.href).href
          }
        }
      });
    }).then(function () { walletMsg(t("buy.tokenAdded")); })
      .catch(function () { walletMsg(t("buy.walletError")); });
  });

  /* ---------- interfaccia ---------- */
  $$(".lang button").forEach(function (b) {
    b.addEventListener("click", function () {
      lang = b.dataset.lang;
      storageSet("shuba-lang", lang);
      applyTexts();
    });
  });

  var menuBtn = $("#menuBtn");
  var nav = $("#nav");
  function closeMenu() { nav.classList.remove("is-open"); menuBtn.setAttribute("aria-expanded", "false"); }
  menuBtn.addEventListener("click", function () {
    var open = !nav.classList.contains("is-open");
    nav.classList.toggle("is-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
  });
  $$("a", nav).forEach(function (a) { a.addEventListener("click", closeMenu); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });

  var header = $("#header");
  function onScroll() { header.classList.toggle("is-scrolled", window.scrollY > 8); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  if ("IntersectionObserver" in window) {
    var revealObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); revealObs.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    $$(".reveal").forEach(function (el) { revealObs.observe(el); });

    var navLinks = $$("a", nav);
    var navObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        navLinks.forEach(function (a) { a.classList.toggle("is-active", a.getAttribute("href") === "#" + en.target.id); });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    $$("main section[id]").forEach(function (s) { navObs.observe(s); });
  } else {
    $$(".reveal").forEach(function (el) { el.classList.add("is-in"); });
  }

  $("#year").textContent = new Date().getFullYear();

  /* ---------- avvio ---------- */
  applyTexts();
  renderSocials();
  setupChart();
  loadStats();
  if (CA) setInterval(loadStats, 60000);
})();
