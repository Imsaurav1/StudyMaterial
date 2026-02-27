"""
scheduler.py — Keeps the bot running and fires it daily at the configured time.

Run this script to keep the bot alive as a background process.
Usage:
  python scheduler.py           # runs forever (use screen/tmux/systemd)
  python scheduler.py --now     # run once immediately
"""

import sys
import time
import logging
import datetime
import subprocess
from StudyMaterial.news_bot.config import CONFIG

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [SCHEDULER] %(message)s",
    handlers=[
        logging.FileHandler("logs/scheduler.log"),
        logging.StreamHandler()
    ]
)
log = logging.getLogger(__name__)


def run_once():
    """Run the main script once."""
    log.info("Triggering main.py...")
    result = subprocess.run(["python", "main.py"], capture_output=False)
    if result.returncode == 0:
        log.info("✅ main.py completed successfully")
    else:
        log.error(f"❌ main.py exited with code {result.returncode}")


def run_daily():
    """Loop forever, running at the configured daily time."""
    run_time_str = CONFIG["schedule"]["run_time"]  # e.g. "08:00"
    run_hour, run_minute = map(int, run_time_str.split(":"))

    log.info(f"📅 Scheduler started. Daily run at {run_time_str} UTC")
    log.info("   Press Ctrl+C to stop.")

    last_run_date = None

    while True:
        now = datetime.datetime.utcnow()
        today = now.date()

        # Check if it's time to run and we haven't run today
        if (
            now.hour == run_hour
            and now.minute == run_minute
            and last_run_date != today
        ):
            log.info(f"⏰ Scheduled run triggered at {now.strftime('%Y-%m-%d %H:%M:%S')} UTC")
            run_once()
            last_run_date = today

        # Sleep 50 seconds between checks (avoids double-firing within a minute)
        time.sleep(50)


if __name__ == "__main__":
    import logging
    from pathlib import Path
    Path("logs").mkdir(exist_ok=True)

    if "--now" in sys.argv:
        log.info("Running immediately (--now flag detected)")
        run_once()
    else:
        try:
            run_daily()
        except KeyboardInterrupt:
            log.info("Scheduler stopped by user.")
