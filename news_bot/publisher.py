"""
publisher.py — Authenticates with your backend and POSTs the article to /api/posts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Flow:
  1. POST /api/admin/login  → get JWT token
  2. POST /api/posts        → create the article (with Bearer token)

This mirrors exactly what your admin panel does when creating a post.
The article lands in MongoDB with the same PostSchema structure.
"""

import json
import logging
import requests
from pathlib import Path
from StudyMaterial.news_bot.config import CONFIG

log = logging.getLogger(__name__)

# Cache the JWT token for the duration of one run
_cached_token = None


def get_jwt_token():
    """
    Log in to your backend and return a JWT admin token.
    Caches the token so we only log in once per run.
    """
    global _cached_token
    if _cached_token:
        return _cached_token

    cfg = CONFIG["api"]
    login_url = cfg["base_url"].rstrip("/") + cfg["login_endpoint"]

    log.info(f"   Logging in to backend API: {login_url}")

    try:
        resp = requests.post(
            login_url,
            json={
                "email":    cfg["admin_email"],
                "password": cfg["admin_password"],
            },
            timeout=15,
        )

        if resp.status_code == 200:
            token = resp.json().get("token")
            if token:
                _cached_token = token
                log.info("   JWT token obtained")
                return token
            else:
                log.error(f"Login succeeded but no token in response: {resp.json()}")
                return None

        elif resp.status_code == 401:
            log.error("Login failed: Invalid admin credentials. Check ADMIN_EMAIL/ADMIN_PASSWORD in config.")
            return None

        else:
            log.error(f"Login failed: HTTP {resp.status_code} — {resp.text[:200]}")
            return None

    except requests.exceptions.ConnectionError:
        log.error(f"Cannot connect to backend at {cfg['base_url']}. Is it running?")
        return None
    except requests.exceptions.Timeout:
        log.error("Backend login request timed out after 15s")
        return None
    except Exception as e:
        log.error(f"Login error: {e}")
        return None


def publish_article(article):
    """
    POST the article to your /api/posts endpoint.
    Returns the canonical URL of the published post on success, None on failure.
    """
    cfg      = CONFIG["api"]
    cfg_site = CONFIG["site"]

    token = get_jwt_token()
    if not token:
        log.error("Cannot publish: failed to obtain JWT token")
        return None

    # Strip internal _meta key before sending to API
    meta      = article.pop("_meta", {})
    post_url  = cfg["base_url"].rstrip("/") + cfg["posts_endpoint"]
    slug      = article.get("slug", "unknown")
    canonical = meta.get("canonical_url", f"{cfg_site['base_url']}/blog/{slug}")

    log.info(f"   POSTing to {post_url}")
    log.info(f"   Title: {article['title']}")

    try:
        resp = requests.post(
            post_url,
            json=article,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type":  "application/json",
            },
            timeout=30,
        )

        if resp.status_code == 201:
            created = resp.json()
            post_id = created.get("post", {}).get("_id", "unknown")
            log.info(f"   Article created in MongoDB! ID: {post_id}")
            _save_local_backup(article, meta, slug)
            article["_meta"] = meta   # restore for indexer
            return canonical

        elif resp.status_code == 401:
            log.error("Publish failed: JWT token rejected.")
            return None

        elif resp.status_code == 409:
            log.warning(f"Slug conflict: {resp.json()}")
            return None

        elif resp.status_code == 400:
            log.error(f"Validation error: {resp.json()}")
            return None

        else:
            log.error(f"Unexpected response: HTTP {resp.status_code} — {resp.text[:300]}")
            return None

    except requests.exceptions.ConnectionError:
        log.error(f"Cannot connect to backend at {cfg['base_url']}")
        return None
    except requests.exceptions.Timeout:
        log.error("Backend publish request timed out after 30s")
        return None
    except Exception as e:
        log.error(f"Publish error: {e}")
        return None


def _save_local_backup(article, meta, slug):
    """Save a local JSON backup of everything we published."""
    try:
        backup_dir = Path("output")
        backup_dir.mkdir(exist_ok=True)
        backup = {**article, "_meta": meta}
        backup_path = backup_dir / f"{slug}.json"
        backup_path.write_text(json.dumps(backup, indent=2, ensure_ascii=False))
        log.info(f"   Local backup saved: {backup_path}")
    except Exception as e:
        log.warning(f"Could not save local backup: {e}")