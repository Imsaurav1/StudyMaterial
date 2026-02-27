"""
config.py — All settings for TechNews Auto-Publisher
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMPORTANT: Never commit this file to GitHub!
Add config.py to your .gitignore
"""

import os

CONFIG = {
    # ── Your Website ──────────────────────────────────────────────────────────
    "site": {
        "base_url": "https://saurabhjha.co.in",        # Your website URL
        "site_name": "Saurabh Kumar Jha",              # Your site name
    },

    # ── Your Existing Backend API ─────────────────────────────────────────────
    # The bot will POST articles directly to your /api/posts endpoint
    # using a JWT token (same as your admin panel does)
    "api": {
        "base_url": os.getenv("API_BASE_URL", "https://your-backend.onrender.com"),
        # Admin credentials — used to get a JWT token before posting
        "admin_email":    os.getenv("ADMIN_EMAIL", "your@email.com"),
        "admin_password": os.getenv("ADMIN_PASSWORD", "yourpassword"),
        # Endpoints (match your Express routes exactly)
        "login_endpoint": "/api/admin/login",
        "posts_endpoint": "/api/posts",
    },

    # ── Groq AI ───────────────────────────────────────────────────────────────
    # Free tier: https://console.groq.com  (very fast, generous free quota)
    "groq": {
        "api_key": os.getenv("GROQ_API_KEY", "YOUR_GROQ_API_KEY_HERE"),
        "model":   "llama-3.3-70b-versatile",
        "max_tokens": 4000,
        "temperature": 0.7,
    },

    # ── News Sources ──────────────────────────────────────────────────────────
    # NewsAPI: free tier at https://newsapi.org (100 requests/day)
    "newsapi": {
        "api_key": os.getenv("NEWSAPI_KEY", "YOUR_NEWSAPI_KEY_HERE"),
        "topics": [
            "artificial intelligence",
            "machine learning",
            "tech automation",
            "science technology",
            "robotics",
            "generative AI",
        ],
        "max_articles_per_topic": 5,
        "language": "en",
        "sort_by": "publishedAt",   # newest first
    },

    # ── RSS Feeds (Free, no API key needed) ───────────────────────────────────
    "rss_feeds": [
        "https://feeds.feedburner.com/TechCrunch",
        "https://www.wired.com/feed/rss",
        "https://feeds.arstechnica.com/arstechnica/technology-lab",
        "https://rss.cnn.com/rss/cnn_tech.rss",
        "https://www.theverge.com/rss/index.xml",
        "https://feeds.feedburner.com/venturebeat/SZYF",  # VentureBeat AI
        "https://www.sciencedaily.com/rss/computers_math/artificial_intelligence.xml",
    ],
    "rss_max_articles": 5,  # per feed

    # ── Google Search Console Indexing API ────────────────────────────────────
    "google": {
        "service_account_key_path": "google_service_account.json",
    },

    # ── Article Generation Settings ───────────────────────────────────────────
    "article": {
        "include_sources": True,
        "tone": "professional yet accessible",
        # Tags automatically applied to every auto-generated article
        "default_tags": ["AI", "Technology", "Automation", "Tech News"],
    },

    # ── Scheduler Settings ────────────────────────────────────────────────────
    "schedule": {
        "run_time": "08:00",   # Daily run at 8:00 AM UTC
        "timezone": "UTC",
    },
}