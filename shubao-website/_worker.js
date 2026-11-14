// Cloudflare Pages · blocco geografico.
// Il sito non è rivolto a chi si trova nei paesi elencati (vedi /legal/#jurisdictions):
// a questi visitatori viene mostrata una pagina di cortesia con codice 451.
// Tutti gli altri ricevono il sito normalmente.
// Per disattivarlo: elimina questo file e pubblica di nuovo.

const BLOCKED = new Set(["GB", "CN", "IR", "KP", "CU", "SY"]);
// Regioni sotto sanzioni dentro paesi non bloccati per intero (codici ISO 3166-2 forniti da Cloudflare)
const BLOCKED_REGIONS = new Set(["UA-43", "UA-14", "UA-09", "UA-40"]); // Crimea, Donetsk, Luhansk, Sebastopoli

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Not available in your region | 曙宝 Shubao</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#283016;color:#F7F7F7;
font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center}
main{max-width:560px}h1{font-size:28px;margin:0 0 12px}p{color:#C9CDBB;margin:0 0 10px}
</style>
</head>
<body>
<main>
<h1>Not available in your region</h1>
<p>This fan-made website about the 曙宝 (Shubao) memecoin is not directed at people located in your country or region, so it is not shown here.</p>
<p>本网站不面向你所在的国家或地区。 · 이 사이트는 귀하의 국가 또는 지역을 대상으로 하지 않습니다. · このサイトはお住まいの国・地域を対象としていません。</p>
</main>
</body>
</html>`;

export default {
  async fetch(request, env) {
    const cf = request.cf || {};
    const country = cf.country || "";
    const region = country && cf.regionCode ? `${country}-${cf.regionCode}` : "";
    if (BLOCKED.has(country) || BLOCKED_REGIONS.has(region)) {
      return new Response(PAGE, {
        status: 451,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "x-robots-tag": "noindex",
        },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
