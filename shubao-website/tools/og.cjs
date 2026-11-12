// Genera le anteprime social (assets/og-<lingua>.jpg) e il banner per X (assets/kit/x-header-1500x500.jpg).
// Uso: node tools/og.cjs   (serve Playwright con Chromium)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const img = (f) => 'data:image/webp;base64,' + fs.readFileSync(path.join(ROOT, 'assets/img', f)).toString('base64');
const T = {
  en: { chip: 'Community token on BNB Chain', mean: '“A treasure as bright as the dawn light.”', tag: 'Community-run · Fan-made', font: 'Noto Sans SC' },
  zh: { chip: 'BNB Chain 社区代币', mean: '“如曙光般明亮的宝贝。”', tag: '社区运营 · 粉丝自发', font: 'Noto Sans SC' },
  ko: { chip: 'BNB 체인 커뮤니티 토큰', mean: '“새벽빛처럼 밝은 보물.”', tag: '커뮤니티 운영 · 팬 메이드', font: 'Noto Sans KR' },
  ja: { chip: 'BNBチェーンのコミュニティトークン', mean: '「夜明けの光のように輝く宝物。」', tag: 'コミュニティ運営 · ファンメイド', font: 'Noto Sans JP' },
};
const FONTS = '<link href="https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Nanum+Brush+Script&family=Nunito:ital,wght@0,800;0,900;1,800&family=Noto+Sans+SC:wght@800&family=Noto+Sans+KR:wght@800&family=Noto+Sans+JP:wght@800&display=block" rel="stylesheet">';
const BASE = `body{margin:0;overflow:hidden;color:#F7F7F7;font-family:Nunito,var(--cjk),sans-serif;
  background:radial-gradient(50% 70% at 76% 46%,rgba(236,134,155,.35),transparent 70%),linear-gradient(180deg,#283016,#1C220F)}
.chip{display:inline-block;padding:8px 18px;border-radius:999px;background:rgba(122,166,10,.22);color:#A9CF3F;font-weight:900}
.han{font-family:'Ma Shan Zheng';line-height:1}
.alt{font-family:'Nanum Brush Script';color:#EC869B;line-height:1}
.mean{font-weight:800;font-style:italic}
.tag{display:inline-block;padding:6px 14px;border-radius:6px 12px;background:#EC869B;color:#1C220F;font-weight:900}
.sun{position:absolute;border-radius:50%;background:radial-gradient(circle at 40% 35%,#FFE3C2,#F8B9A5 45%,#EC869B 80%)}
.panda{position:absolute;filter:drop-shadow(0 24px 30px rgba(0,0,0,.35))}`;

function og(l) {
  const t = T[l];
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE}
  body{width:1200px;height:630px;--cjk:'${t.font}'}
  .sun{left:690px;top:50px;width:490px;height:490px}.panda{left:660px;top:25px;width:560px}
  .txt{position:absolute;left:70px;top:70px;width:610px}.chip{font-size:22px}
  .han{font-size:200px;margin-top:14px}.alt{font-size:76px;margin-top:4px}.mean{font-size:28px;margin-top:26px}
  .tag{margin-top:22px;font-size:24px}</style></head><body>
  <div class="sun"></div><img class="panda" src="${img('hero-panda-rest.webp')}">
  <div class="txt"><span class="chip">${t.chip}</span><div class="han">曙宝</div><div class="alt">슈바오 · Shubao</div>
  <div class="mean">${t.mean}</div><div class="tag">${t.tag}</div></div></body></html>`;
}

function header() {
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE}
  body{width:1500px;height:500px;--cjk:'Noto Sans SC'}
  .sun{left:960px;top:40px;width:420px;height:420px}.panda{left:930px;top:10px;width:480px}
  .s1{position:absolute;left:40px;bottom:-30px;width:250px;transform:rotate(-6deg)}
  .txt{position:absolute;left:320px;top:120px}.han{font-size:150px}.alt{font-size:62px;margin-top:6px}
  .mean{font-size:24px;margin-top:18px}</style></head><body>
  <img class="s1" src="${img('sticker-morning-800.webp')}">
  <div class="sun"></div><img class="panda" src="${img('hero-panda-rest.webp')}">
  <div class="txt"><div class="han">曙宝</div><div class="alt">슈바오 · Shubao</div>
  <div class="mean">${T.en.mean}</div></div></body></html>`;
}

(async () => {
  const b = await chromium.launch();
  const shot = async (htmlStr, w, h, out) => {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.setContent(htmlStr, { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(300);
    await p.screenshot({ path: out, type: 'jpeg', quality: 86 });
    await p.close();
    console.log('ok', path.relative(ROOT, out));
  };
  for (const l of Object.keys(T)) await shot(og(l), 1200, 630, path.join(ROOT, `assets/og-${l}.jpg`));
  fs.mkdirSync(path.join(ROOT, 'assets/kit'), { recursive: true });
  await shot(header(), 1500, 500, path.join(ROOT, 'assets/kit/x-header-1500x500.jpg'));
  await b.close();
})();
