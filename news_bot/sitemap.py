"""
sitemap.py — Fetches all published posts from your API and generates sitemap.xml
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Since articles are stored in MongoDB (not as flat HTML files), we fetch
the post list from your public /api/posts endpoint and build a sitemap.xml.

You can host this sitemap.xml at the root of your static site.
The bot regenerates it on every run so it always includes the newest article.
"""

import logging
import requests
from datetime import datetime
from pathlib import Path
from StudyMaterial.news_bot.config import CONFIG

log = logging.getLogger(__name__)


def fetch_all_slugs() -> list[dict]:
    """Fetch all published post slugs from your public /api/posts endpoint."""
    cfg      = CONFIG["api"]
    base_url = cfg["base_url"].rstrip("/")
    slugs    = []
    page     = 1

    while True:
        try:
            resp = requests.get(
                f"{base_url}/api/posts",
                params={"page": page, "limit": 100},
                timeout=15,
            )
            if resp.status_code != 200:
                log.warning(f"Could not fetch posts page {page}: HTTP {resp.status_code}")
                break

            data  = resp.json()
            posts = data.get("posts", [])
            if not posts:
                break

            for post in posts:
                slugs.append({
                    "slug":    post["slug"],
                    "updated": post.get("updatedAt", datetime.now().isoformat())[:10],
                })

            pagination = data.get("pagination", {})
            if page >= pagination.get("totalPages", 1):
                break
            page += 1

        except Exception as e:
            log.warning(f"Error fetching posts for sitemap: {e}")
            break

    log.info(f"   Fetched {len(slugs)} post slugs for sitemap")
    return slugs


def generate_sitemap(new_slug: str = None) -> str:
    """
    Generate sitemap.xml content from all published posts.
    Saves to output/sitemap.xml — copy this to your site root.
    """
    cfg      = CONFIG["site"]
    base_url = cfg["base_url"].rstrip("/")
    today    = datetime.now().strftime("%Y-%m-%d")

    slugs = fetch_all_slugs()

    # Make sure the new article slug is included even if API hasn't indexed it yet
    if new_slug and not any(s["slug"] == new_slug for s in slugs):
        slugs.insert(0, {"slug": new_slug, "updated": today})

    # Build XML
    urls = f"""  <url>
    <loc>{base_url}/</loc>
    <lastmod>{today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>\n"""

    for item in slugs:
        urls += f"""  <url>
    <loc>{base_url}/blog/{item['slug']}</loc>
    <lastmod>{item['updated']}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>\n"""

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{urls}</urlset>"""

    # Save locally
    out = Path("output/sitemap.xml")
    out.parent.mkdir(exist_ok=True)
    out.write_text(xml, encoding="utf-8")
    log.info(f"   Sitemap saved to {out} ({len(slugs)} URLs)")

    return str(out)