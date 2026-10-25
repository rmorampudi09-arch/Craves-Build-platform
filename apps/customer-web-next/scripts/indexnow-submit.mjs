// Tells Bing, Yandex, Seznam and Naver (and Bing-powered ChatGPT search / Copilot) that craves.in URLs changed.
// Run after each production deploy: node scripts/indexnow-submit.mjs [sitemap-url]
// The key is public by design: the engines verify it at https://craves.in/<key>.txt.
const key = "cbbdef64227c533561bb492e103c5a4d";
const host = "craves.in";
const sitemapUrl = process.argv[2] ?? `https://${host}/sitemap.xml`;

const sitemap = await fetch(sitemapUrl).then((response) => {
  if (!response.ok) throw new Error(`Sitemap fetch failed: ${response.status}`);
  return response.text();
});
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((match) => match[1])
  .filter((url) => new URL(url).host === host);
if (!urlList.length) throw new Error("No craves.in URLs found in the sitemap");

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host, key, keyLocation: `https://${host}/${key}.txt`, urlList }),
});
// 200 = accepted, 202 = accepted pending key check; anything else is a real failure.
if (response.status !== 200 && response.status !== 202) {
  throw new Error(`IndexNow rejected the submission: ${response.status} ${await response.text()}`);
}
console.log(`IndexNow accepted ${urlList.length} URLs (${response.status}).`);
