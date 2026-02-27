"""
indexer.py — Submits new URLs to search engines via IndexNow + Google Sitemap Ping
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NO Google account, NO credit card, NO API keys required.

Method 1 — IndexNow (Bing, Yandex, Seznam, etc.)
  - Open protocol, just needs a key file hosted on your site
  - One-time setup: create a .txt file on your website
  - Docs: https://www.indexnow.org

Method 2 — Google Sitemap Ping
  - Free public endpoint, no login needed
  - Google re-crawls your sitemap when pinged
  - Slightly slower than Indexing API but totally free

Both run automatically on every article publish.
"""

import uuid
import logging
import requests
from pathlib import Path
from StudyMaterial.news_bot.config import CONFIG

log = logging.getLogger(__name__)


# ── IndexNow Key ──────────────────────────────────────────────────────────────
# We generate a stable key once and save it to a file.
# You then host this file at: https://yourdomain.com/<key>.txt
# The file must contain just the key as plain text (nothing else).
KEY_FILE = Path("data/indexnow_key.txt")


def get_or_create_indexnow_key() -> str:
    """
    Load existing IndexNow key or generate a new one.
    Key is saved to data/indexnow_key.txt so it stays stable across runs.
    """
    KEY_FILE.parent.mkdir(exist_ok=True)

    if KEY_FILE.exists():
        key = KEY_FILE.read_text().strip()
        if key:
            return key

    # Generate a new key (32-char hex, as recommended by IndexNow spec)
    key = uuid.uuid4().hex + uuid.uuid4().hex[:8]   # 40 chars
    KEY_FILE.write_text(key)
    log.info(f"   🔑 New IndexNow key generated and saved to {KEY_FILE}")
    log.info(f"   ⚠️  ACTION REQUIRED — see setup instructions below")
    _print_setup_instructions(key)
    return key


def _print_setup_instructions(key: str):
    """Print one-time setup instructions for IndexNow key hosting."""
    cfg = CONFIG["site"]
    base_url = cfg["base_url"].rstrip("/")

    log.info("")
    log.info("━" * 60)
    log.info("  ONE-TIME INDEXNOW SETUP (do this once)")
    log.info("━" * 60)
    log.info(f"  1. Create a file named:  {key}.txt")
    log.info(f"  2. File contents (just this, nothing else):  {key}")
    log.info(f"  3. Host it at:  {base_url}/{key}.txt")
    log.info(f"     So visiting that URL in browser shows just the key text.")
    log.info(f"  4. That's it — no signup, no verification needed.")
    log.info("━" * 60)
    log.info("")


# ── Method 1: IndexNow ────────────────────────────────────────────────────────

def submit_indexnow(url: str) -> bool:
    """
    Submit a URL via IndexNow protocol.
    Notifies Bing, Yandex, Seznam, and other IndexNow-compatible engines.

    API spec: POST https://api.indexnow.org/indexnow
    """
    cfg      = CONFIG["site"]
    base_url = cfg["base_url"].rstrip("/")
    key      = get_or_create_indexnow_key()
    key_url  = f"{base_url}/{key}.txt"  # where the key file is hosted on your site

    payload = {
        "host":    base_url.replace("https://", "").replace("http://", ""),
        "key":     key,
        "keyLocation": key_url,
        "urlList": [url],
    }

    try:
        resp = requests.post(
            "https://api.indexnow.org/indexnow",
            json=payload,
            headers={"Content-Type": "application/json; charset=utf-8"},
            timeout=15,
        )

        # IndexNow response codes:
        # 200 = URL submitted successfully
        # 202 = URL received (will be processed)
        # 400 = bad request (check payload)
        # 403 = key not found at keyLocation (file not hosted yet)
        # 422 = URL doesn't belong to the host
        # 429 = too many requests

        if resp.status_code in (200, 202):
            log.info(f"   ✅ IndexNow: URL submitted (HTTP {resp.status_code})")
            log.info(f"      Engines notified: Bing, Yandex, Seznam, and others")
            return True

        elif resp.status_code == 403:
            log.warning(
                f"   ⚠️  IndexNow: Key file not found (HTTP 403)\n"
                f"      Make sure you've hosted the key file at: {key_url}\n"
                f"      Key content: {key}"
            )
            return False

        elif resp.status_code == 422:
            log.warning(f"   ⚠️  IndexNow: URL host mismatch (HTTP 422) — check site.base_url in config.py")
            return False

        else:
            log.warning(f"   ⚠️  IndexNow: Unexpected HTTP {resp.status_code} — {resp.text[:200]}")
            return False

    except requests.exceptions.Timeout:
        log.warning("   ⚠️  IndexNow: Request timed out")
        return False
    except Exception as e:
        log.warning(f"   ⚠️  IndexNow error: {e}")
        return False


# ── Method 2: Google Sitemap Ping ─────────────────────────────────────────────

def ping_google_sitemap() -> bool:
    """
    Ping Google's public sitemap endpoint — no account or login needed.
    Tells Google to re-crawl your sitemap, which includes your new article URL.

    Endpoint: https://www.google.com/ping?sitemap=<your_sitemap_url>
    """
    cfg         = CONFIG["site"]
    base_url    = cfg["base_url"].rstrip("/")
    sitemap_url = f"{base_url}/sitemap.xml"

    try:
        resp = requests.get(
            "https://www.google.com/ping",
            params={"sitemap": sitemap_url},
            timeout=15,
        )

        if resp.status_code == 200:
            log.info(f"   ✅ Google Sitemap Ping: success")
            log.info(f"      Google will re-crawl: {sitemap_url}")
            return True
        else:
            log.warning(f"   ⚠️  Google Ping: HTTP {resp.status_code} — {resp.text[:100]}")
            return False

    except requests.exceptions.Timeout:
        log.warning("   ⚠️  Google Sitemap Ping: timed out")
        return False
    except Exception as e:
        log.warning(f"   ⚠️  Google Sitemap Ping error: {e}")
        return False


def ping_bing_sitemap() -> bool:
    """
    Also ping Bing's sitemap endpoint directly (belt-and-suspenders alongside IndexNow).
    Free, no account needed.
    """
    cfg         = CONFIG["site"]
    base_url    = cfg["base_url"].rstrip("/")
    sitemap_url = f"{base_url}/sitemap.xml"

    try:
        resp = requests.get(
            "https://www.bing.com/ping",
            params={"sitemap": sitemap_url},
            timeout=15,
        )

        if resp.status_code == 200:
            log.info(f"   ✅ Bing Sitemap Ping: success")
            return True
        else:
            log.warning(f"   ⚠️  Bing Ping: HTTP {resp.status_code}")
            return False

    except Exception as e:
        log.warning(f"   ⚠️  Bing Sitemap Ping error: {e}")
        return False


# ── Main entry point ──────────────────────────────────────────────────────────

def submit_to_google(url: str) -> bool:
    """
    Main indexing function called from main.py.
    Runs all three submission methods and returns True if at least one succeeded.
    """
    log.info(f"   Submitting URL for indexing: {url}")

    results = {
        "indexnow":     submit_indexnow(url),
        "google_ping":  ping_google_sitemap(),
        "bing_ping":    ping_bing_sitemap(),
    }

    success_count = sum(results.values())
    log.info(
        f"   Indexing summary: "
        f"IndexNow={'✅' if results['indexnow'] else '❌'}  "
        f"Google Ping={'✅' if results['google_ping'] else '❌'}  "
        f"Bing Ping={'✅' if results['bing_ping'] else '❌'}"
    )

    return success_count > 0