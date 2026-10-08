// Suite "fuzz-markdown": 30,000 random inputs built from hostile fragments go through parseMarkdown(); whatever the input,
// the resulting DOM may only contain the markup the parser itself generates (allowed tags / attributes / classes,
// http(s) links whose href equals their text, no NUL placeholder residue). Deterministic seed, so a failure reproduces.
// Usage: node fuzz-markdown.cjs [path/to/web]   (default: ../../web)
"use strict";
const { launchChromium, webDir, indexUrl, report, harnessFailed } = require("./harness.cjs");
const { mockBridge } = require("./mock-bridge.cjs");

const WEB = webDir();

(async () => {
  const browser = await launchChromium();
  const page = await (await browser.newContext()).newPage();
  const errors = []; const dialogs = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => { dialogs.push(d.message()); d.dismiss(); });
  await page.addInitScript(mockBridge);
  await page.goto(indexUrl(WEB));
  await page.waitForSelector(".approval-card");
  const res = await page.evaluate(() => {
    state.knownUsers["42"] = { name: `"><img src=x onerror=alert(9)> https://evil.example/" onmouseover="alert(8)`, username: "x", bot: false };
    state.knownUsers["43"] = { name: "a`b**c**\u00000\u0000", username: "y", bot: false };
    const frag = ["<", ">", "\"", "'", "&", "`", "```", "**", "*", "\u0000", "\u00000\u0000", "\u00001\u0000", "0", "1", "https://", "http://a.b/c?d=e&f=g", "https://x.y/(z)", "<@42>", "<@!43>", "<@&1510973611467608080>", "<#77>", "javascript:alert(7)", " onerror=alert(6) ", "<img src=x onerror=alert(5)>", "<script>alert(4)</script>", "\n", " ", "&amp;", "&lt;", "&gt;", "&#39;", "&quot;", "</code>", "</pre>", "</a>", "<a href=\"javascript:alert(3)\">", "text", "bash\n", ".", ",", ")", "(", ";", "html", "-->", "<!--", "<svg/onload=alert(2)>", "data-act=\"component\"", "//"];
    let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const allowed = new Set(["DIV", "SPAN", "BUTTON", "PRE", "CODE", "A", "STRONG", "BR", "svg", "rect", "path", "polygon", "circle"]);
    const bad = []; let n = 0, links = 0, blocks = 0, pills = 0;
    const host = document.createElement("div");
    for (let i = 0; i < 30000 && bad.length < 5; i++) {
      let s = ""; const len = 1 + Math.floor(rnd() * 12);
      for (let j = 0; j < len; j++) s += frag[Math.floor(rnd() * frag.length)];
      const html = parseMarkdown(s);
      host.innerHTML = html; n++;
      const why = [];
      if (html.includes("\u0000")) why.push("NUL residue");
      host.querySelectorAll("*").forEach(el => {
        if (!allowed.has(el.tagName)) why.push("tag " + el.tagName);
        [...el.attributes].forEach(a => {
          if (/^on/i.test(a.name)) why.push("attr " + a.name);
          if (!["class", "href", "target", "rel", "title", "type", "width", "height", "viewBox", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "aria-hidden", "d", "x", "y", "rx", "data-act", "data-name", "data-id"].includes(a.name)) why.push("attr " + a.name);
        });
        if (el.tagName === "A") { links++; if (!/^https?:\/\/[^\s"'<>]+$/.test(el.getAttribute("href")) || el.getAttribute("href") !== el.textContent || el.className !== "msg-link" || el.closest("code, pre, .mention-pill, a a")) why.push("link " + el.outerHTML); }
        if (el.tagName === "DIV" && el.className !== "terminal-block-wrapper" && el.className !== "terminal-header") why.push("div." + el.className);
        if (el.tagName === "SPAN" && !/^(mention-pill( role-pill| channel-pill)?|terminal-lang)$/.test(el.className) && !(el.parentElement.className === "btn-copy")) why.push("span." + el.className);
        if (el.dataset.act && !["mention", "channel", "copy"].includes(el.dataset.act)) why.push("data-act " + el.dataset.act);
        if (el.dataset.act === "channel" && !/^\d+$/.test(el.dataset.id)) why.push("channel id");
        if (el.classList.contains("terminal-block-wrapper")) blocks++;
        if (el.classList.contains("mention-pill")) pills++;
      });
      if (why.length) bad.push({ s, html, why: [...new Set(why)] });
    }
    return { n, links, blocks, pills, bad };
  });

  const results = [];
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };
  check(`parseMarkdown: ${res.n} random inputs yield only parser-generated markup (${res.links} links, ${res.blocks} code blocks, ${res.pills} mention pills checked)`,
    res.n === 30000 && res.bad.length === 0, res.bad);
  check("the generators were exercised (links, code blocks and mention pills all produced)", res.links > 0 && res.blocks > 0 && res.pills > 0, { links: res.links, blocks: res.blocks, pills: res.pills });
  check("no dialogs (alert) fired", dialogs.length === 0, dialogs);
  check("zero page errors", errors.length === 0, errors);

  const code = report(results, res);
  await browser.close();
  process.exit(code);
})().catch(harnessFailed);
