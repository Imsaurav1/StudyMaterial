# 🤖 TechNews Auto-Publisher

Automatically fetches the latest AI, automation, and tech news every day, generates a polished SEO article using Claude AI, publishes it as an HTML page on your static website, and submits the URL to Google Search Console for indexing.

---

## 📁 File Structure

```
tech_news_bot/
├── main.py              ← Main orchestrator (run this)
├── config.py            ← ⚠️ Your settings & API keys go here
├── fetcher.py           ← Pulls news from NewsAPI + RSS feeds
├── generator.py         ← Sends news to Claude, gets article back
├── publisher.py         ← Renders HTML, saves to your site, updates sitemap
├── indexer.py           ← Submits URL to Google Search Console
├── scheduler.py         ← Runs main.py daily at a set time
├── requirements.txt     ← Python dependencies
├── data/
│   └── published.json   ← Tracks published articles (auto-created)
├── logs/
│   ├── run.log          ← Daily run logs (auto-created)
│   └── scheduler.log    ← Scheduler logs (auto-created)
└── output/              ← Local copy of generated HTML (auto-created)
```

---

## ⚙️ Step-by-Step Setup

### Step 1 — Install Python dependencies

```bash
cd tech_news_bot
pip install -r requirements.txt
```

---

### Step 2 — Get your API keys

#### 🔑 Anthropic (Claude AI) — Required
1. Go to https://console.anthropic.com
2. Create an API key
3. Add to `config.py`: `"api_key": "sk-ant-..."`

#### 📰 NewsAPI — Recommended (free tier)
1. Go to https://newsapi.org and sign up (free)
2. Get your API key from the dashboard
3. Free tier: 100 requests/day — more than enough
4. Add to `config.py`: `"api_key": "your_newsapi_key"`

> **Note:** If you skip NewsAPI, the bot will still work using RSS feeds alone.

---

### Step 3 — Configure your website settings

Open `config.py` and update the `site` section:

```python
"site": {
    "base_url": "https://yourdomain.com",       # Your website URL
    "articles_dir": "/var/www/html/articles",   # Where HTML files are stored
    "articles_url_path": "/articles",           # URL path prefix
    "site_name": "Your Site Name",
},
```

**For a simple static site:**
- If your site is hosted on a server you SSH into, set `articles_dir` to the web-accessible folder.
- If you use GitHub Pages, set `articles_dir` to your local repo's articles folder, then push/deploy separately.

---

### Step 4 — Set up Google Search Console Indexing (Optional but recommended)

This lets Google index your new article within hours instead of days/weeks.

1. **Google Cloud Console:**
   - Go to https://console.cloud.google.com
   - Create a new project (e.g., "TechNews Bot")
   - Go to "APIs & Services" → Enable **"Web Search Indexing API"**
   - Go to "IAM & Admin" → "Service Accounts" → Create a service account
   - Download the JSON key file → Save as `google_service_account.json` in this folder

2. **Google Search Console:**
   - Go to https://search.google.com/search-console
   - Select your property → Settings → Users and permissions
   - Click "Add user" → Enter the **service account email** (from the JSON file, it looks like `something@yourproject.iam.gserviceaccount.com`)
   - Set role to **Owner**

That's it! The bot will now automatically submit each new article URL for fast indexing.

---

### Step 5 — Test a single run

```bash
python main.py
```

Check the `output/` folder — you should see a generated HTML file.
Check `logs/run.log` for detailed output.

---

### Step 6 — Start the daily scheduler

#### Option A: Python scheduler (simplest)
```bash
# Run in background with screen or tmux
screen -S technews
python scheduler.py
# Press Ctrl+A, D to detach
```

#### Option B: Cron job (recommended for Linux servers)
```bash
crontab -e
```
Add this line to run at 8:00 AM UTC daily:
```
0 8 * * * cd /path/to/tech_news_bot && python main.py >> logs/cron.log 2>&1
```

#### Option C: GitHub Actions (free, serverless)
Create `.github/workflows/daily_news.yml`:
```yaml
name: Daily TechNews Publisher
on:
  schedule:
    - cron: '0 8 * * *'   # 8:00 AM UTC daily
  workflow_dispatch:       # Also allows manual trigger

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - run: pip install -r requirements.txt
      - run: python main.py
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          NEWSAPI_KEY: ${{ secrets.NEWSAPI_KEY }}
```

---

## 🔧 Customization

### Change news topics
Edit `CONFIG["newsapi"]["topics"]` in `config.py`:
```python
"topics": ["quantum computing", "biotech", "space exploration", ...]
```

### Change run time
Edit `CONFIG["schedule"]["run_time"]` (UTC time):
```python
"run_time": "07:30",
```

### Change AI model
Edit `CONFIG["anthropic"]["model"]`:
- `"claude-opus-4-6"` — Best quality (default)
- `"claude-sonnet-4-6"` — Faster & cheaper

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| No articles fetched | Check NewsAPI key, or rely on RSS feeds only |
| Article generation fails | Check Anthropic API key and account credits |
| HTML not saving | Check `articles_dir` path exists and is writable |
| Google indexing fails | Verify service account has Owner role in GSC |
| Duplicate articles | Check `data/published.json` — delete to reset |

---

## 📊 What gets generated

Each run produces:
- ✅ A fully formatted HTML article page with SEO meta tags, JSON-LD structured data, Open Graph tags
- ✅ An updated `sitemap.xml`
- ✅ A Google Search Console indexing request
- ✅ A local copy in `output/` folder
- ✅ Logs in `logs/`
