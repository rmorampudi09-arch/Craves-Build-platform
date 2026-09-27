#!/usr/bin/env python3
"""Read-only HTTP acceptance checks; run against a built server or production."""
import argparse
import json
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from urllib.error import HTTPError
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.parse import quote
from xml.etree import ElementTree

PUBLIC = ["/", "/homemade-food-hyderabad", "/home-chefs-hyderabad", "/products-pricing",
          "/contact", "/privacy", "/terms", "/refunds-cancellations", "/security"]
PRIVATE = ["/profile", "/orders", "/checkout", "/chef/application", "/sign-in"]
CANONICAL = "https://craves.in"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch(url, headers=None):
    req = Request(url, headers=headers or {})
    try:
        response = build_opener(NoRedirect).open(req, timeout=35)
    except HTTPError as error:
        response = error
    with response:
        return response.status, response.headers, response.read().decode("utf-8", "replace")


class Head(HTMLParser):
    def __init__(self):
        super().__init__()
        self.canonicals, self.meta, self.schemas, self.title = [], {}, [], ""
        self.in_title, self.in_schema, self.schema = False, False, ""

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonicals.append(attrs.get("href"))
        if tag == "meta":
            self.meta[attrs.get("name", attrs.get("property"))] = attrs.get("content", "")
        self.in_title = tag == "title" or self.in_title
        if tag == "script" and attrs.get("type") == "application/ld+json":
            self.in_schema, self.schema = True, ""

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        if tag == "script" and self.in_schema:
            self.schemas.append(json.loads(self.schema))
            self.in_schema = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        if self.in_schema:
            self.schema += data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", default=CANONICAL)
    parser.add_argument("--check-www", action="store_true")
    parser.add_argument("--check-images", action="store_true")
    args = parser.parse_args()
    origin = args.origin.rstrip("/")
    receipts, failures, titles = [], [], []

    def verify_page(path):
        status, headers, body = fetch(origin + path)
        page = Head()
        page.feed(body)
        checks = {
            "http_200": status == 200,
            "single_canonical": page.canonicals == [CANONICAL + path],
            "title": bool(page.title) and page.title.count("Craves") == 1,
            "description": bool(page.meta.get("description")),
            "indexable": "noindex" not in headers.get("X-Robots-Tag", "") + page.meta.get("robots", ""),
            "social_url": page.meta.get("og:url") == CANONICAL + path,
            "social_image": page.meta.get("og:image", "").startswith(CANONICAL + "/"),
        }
        if path == "/":
            graph = [node for schema in page.schemas for node in schema.get("@graph", [schema])]
            org = next((node for node in graph if node.get("@type") == "Organization"), {})
            checks["organization_and_website"] = bool(org) and any(n.get("@type") == "WebSite" for n in graph)
            checks["three_verified_profiles"] = set(org.get("sameAs", [])) == {
                "https://www.linkedin.com/company/craves-technologies-private-limited/",
                "https://www.instagram.com/craves.in_/",
                "https://www.facebook.com/profile.php?id=61594485405454",
            }
        return {"path": path, "status": status, "title": page.title, "checks": checks}

    with ThreadPoolExecutor(max_workers=4) as executor:
        for receipt in executor.map(verify_page, PUBLIC):
            receipts.append(receipt)
            titles.append(receipt["title"])
            failures.extend(f"{receipt['path']}: {name}" for name, passed in receipt["checks"].items() if not passed)
    if len(set(titles)) != len(titles):
        failures.append("Public titles must be unique")
    status, _, xml = fetch(origin + "/sitemap.xml")
    locations = [entry.text for entry in ElementTree.fromstring(xml).iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
    if status != 200 or sorted(locations) != sorted(CANONICAL + path for path in PUBLIC):
        failures.append("Sitemap must contain exactly the public canonical URLs")
    status, _, robots = fetch(origin + "/robots.txt")
    if status != 200 or "Sitemap: https://craves.in/sitemap.xml" not in robots or "Disallow: /\n" in robots:
        failures.append("robots.txt discovery/access")
    for path in PRIVATE:
        status, headers, _ = fetch(origin + path)
        passed = "noindex" in headers.get("X-Robots-Tag", "")
        receipts.append({"path": path, "status": status, "noindex": passed})
        if not passed:
            failures.append(path + ": account page lacks noindex")
    if args.check_www:
        status, headers, _ = fetch(origin + "/contact?source=seo-check", {"Host": "www.craves.in"})
        if status != 308 or headers.get("Location") != CANONICAL + "/contact?source=seo-check":
            failures.append("www redirect must preserve path and query with HTTP 308")
    images = []
    if args.check_images:
        for asset in ["rider-delivery.png", "story-grid/prep-1.png", "story-grid/cook-fresh-pot.png"]:
            source = "/landing-v20/images/" + asset
            with build_opener().open(origin + source, timeout=35) as response:
                original_bytes = len(response.read())
            url = origin + "/_next/image?url=" + quote(source, safe="") + "&w=828&q=75"
            with build_opener().open(Request(url, headers={"Accept": "image/webp"}), timeout=35) as response:
                optimized_bytes = len(response.read())
                image_type = response.headers.get("Content-Type", "")
                passed = response.status == 200 and image_type == "image/webp" and optimized_bytes < original_bytes
            images.append({"asset": asset, "original_bytes": original_bytes,
                           "optimized_bytes": optimized_bytes, "content_type": image_type, "passed": passed})
            if not passed:
                failures.append(asset + ": responsive optimizer failed")
    print(json.dumps({"origin": origin, "pages": receipts, "sitemap_urls": locations,
                      "images": images, "failures": failures}, indent=2))
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
