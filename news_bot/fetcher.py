"""
fetcher.py — Pulls latest news from NewsAPI + RSS feeds
"""

import logging
import feedparser
import requests
from datetime import datetime, timedelta, timezone
from StudyMaterial.news_bot.config import CONFIG

log = logging.getLogger(__name__)


def fetch_from_newsapi() -> list[dict]:
    """Fetch articles from NewsAPI across configured topics."""
    cfg = CONFIG["newsapi"]
    api_key = cfg["api_key"]

    if "YOUR_" in api_key:
        log.warning("NewsAPI key not configured. Skipping NewsAPI.")
        return []

    articles = []
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")

    for topic in cfg["topics"]:
        try:
            resp = requests.get(
                "https://newsapi.org/v2/everything",
                params={
                    "q": topic,
                    "from": yesterday,
                    "sortBy": cfg["sort_by"],
                    "language": cfg["language"],
                    "pageSize": cfg["max_articles_per_topic"],
                    "apiKey": api_key,
                },
                timeout=10,
            )
            data = resp.json()

            if data.get("status") != "ok":
                log.warning(f"NewsAPI error for '{topic}': {data.get('message')}")
                continue

            for art in data.get("articles", []):
                if art.get("title") and art.get("description"):
                    articles.append({
                        "title": art["title"],
                        "summary": art["description"],
                        "url": art["url"],
                        "source": art["source"]["name"],
                        "published": art.get("publishedAt", ""),
                        "content": art.get("content", "") or art.get("description", ""),
                        "from": "newsapi",
                    })

            log.info(f"   NewsAPI [{topic}]: {len(data.get('articles', []))} articles")

        except Exception as e:
            log.error(f"NewsAPI fetch error for '{topic}': {e}")

    return articles


def fetch_from_rss() -> list[dict]:
    """Fetch articles from configured RSS feeds."""
    articles = []
    feeds = CONFIG["rss_feeds"]
    max_per_feed = CONFIG["rss_max_articles"]
    cutoff = datetime.now(timezone.utc) - timedelta(days=1)

    for feed_url in feeds:
        try:
            feed = feedparser.parse(feed_url)
            count = 0

            for entry in feed.entries[:max_per_feed]:
                # Parse publish date
                pub = None
                if hasattr(entry, "published_parsed") and entry.published_parsed:
                    import calendar
                    pub = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)

                # Only include articles from last 24h (skip if no date)
                if pub and pub < cutoff:
                    continue

                title = entry.get("title", "").strip()
                summary = entry.get("summary", "") or entry.get("description", "")

                # Strip HTML tags from summary
                import re
                summary = re.sub(r"<[^>]+>", "", summary).strip()

                if title and summary:
                    articles.append({
                        "title": title,
                        "summary": summary[:500],
                        "url": entry.get("link", ""),
                        "source": feed.feed.get("title", feed_url),
                        "published": pub.isoformat() if pub else "",
                        "content": summary,
                        "from": "rss",
                    })
                    count += 1

            log.info(f"   RSS [{feed.feed.get('title', feed_url)[:40]}]: {count} articles")

        except Exception as e:
            log.error(f"RSS fetch error for {feed_url}: {e}")

    return articles


def deduplicate(articles: list[dict]) -> list[dict]:
    """Remove duplicate articles by title similarity."""
    seen_titles = set()
    unique = []

    for art in articles:
        # Create a normalized key from first 60 chars of title
        key = art["title"].lower().strip()[:60]
        # Remove common words that don't add uniqueness
        import re
        key = re.sub(r"\b(the|a|an|is|in|of|for|to|and|or|on|at|with)\b", "", key)
        key = re.sub(r"\s+", " ", key).strip()

        if key not in seen_titles:
            seen_titles.add(key)
            unique.append(art)

    return unique


def filter_relevant(articles: list[dict]) -> list[dict]:
    """Keep only tech/AI/science relevant articles."""
    keywords = [
        "ai", "artificial intelligence", "machine learning", "deep learning",
        "robot", "automation", "tech", "technology", "science", "software",
        "hardware", "cloud", "data", "algorithm", "neural", "gpt", "llm",
        "chip", "semiconductor", "quantum", "cybersecurity", "space", "biotech",
        "startup", "innovation", "research", "computing", "model", "openai",
        "google", "microsoft", "meta", "nvidia", "apple", "tesla",
    ]

    relevant = []
    for art in articles:
        text = (art["title"] + " " + art["summary"]).lower()
        if any(kw in text for kw in keywords):
            relevant.append(art)

    return relevant


def fetch_news() -> list[dict]:
    """Main entry: fetch, clean, deduplicate, and return articles."""
    log.info("   Fetching from NewsAPI...")
    newsapi_articles = fetch_from_newsapi()

    log.info("   Fetching from RSS feeds...")
    rss_articles = fetch_from_rss()

    all_articles = newsapi_articles + rss_articles
    log.info(f"   Total raw articles: {len(all_articles)}")

    all_articles = deduplicate(all_articles)
    log.info(f"   After deduplication: {len(all_articles)}")

    all_articles = filter_relevant(all_articles)
    log.info(f"   After relevance filter: {len(all_articles)}")

    # Sort by newest first
    all_articles.sort(key=lambda x: x.get("published", ""), reverse=True)

    # Cap at 20 best articles to send to AI
    return all_articles[:20]
