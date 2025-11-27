#!/usr/bin/env python3
"""
Self-updating portfolio data fetcher

Schedule this to run weekly on Wednesdays with cron:
0 9 * * 3 /usr/bin/python3 /path/to/update.py

To change the frequency, modify the cron schedule or the DAYS_BACK variable below
"""

import os
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
import requests
from dotenv import load_dotenv

# Configuration
SCRIPT_DIR = Path(__file__).parent.absolute()
DAYS_BACK = 3  # How many days back to fetch data (change this to adjust time window)
LOG_FILE = SCRIPT_DIR / "update.log"
DATA_FILE = SCRIPT_DIR / "data.json"
RAW_LINKEDIN_FILE = SCRIPT_DIR / "linkedin_raw.json"

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


def load_env():
    """Load environment variables from .env file"""
    env_file = SCRIPT_DIR / ".env"
    if not env_file.exists():
        logger.error(".env file not found")
        raise FileNotFoundError(".env file not found")

    load_dotenv(env_file)
    logger.info("Environment variables loaded")


def fetch_linkedin_data():
    """Fetch LinkedIn posts data using ugcPosts endpoint"""
    token = os.getenv("linkedin_access_token")
    if not token:
        logger.error("linkedin_access_token not found in .env")
        raise ValueError("linkedin_access_token not found")

    logger.info(f"Fetching LinkedIn posts...")

    # First, try to get user profile to get person URN
    # Note: You might need to hardcode your person URN if profile API doesn't work

    # Try ugcPosts endpoint (works with Member Data Portability API)
    url = "https://api.linkedin.com/v2/ugcPosts"
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Restli-Protocol-Version": "2.0.0",
        "Linkedin-Version": "202312"
    }
    params = {
        "q": "authors",
        "count": 10,
        "sortBy": "LAST_MODIFIED"
    }

    try:
        response = requests.get(url, headers=headers, params=params, timeout=30)

        # If ugcPosts fails, fall back to memberChangeLogs
        if response.status_code != 200:
            logger.warning(f"ugcPosts returned {response.status_code}, falling back to memberChangeLogs")
            start_time = datetime.now() - timedelta(days=DAYS_BACK)
            start_time_ms = int(start_time.timestamp() * 1000)

            url = "https://api.linkedin.com/rest/memberChangeLogs"
            params = {
                "q": "memberAndApplication",
                "startTime": start_time_ms,
                "count": 50
            }
            response = requests.get(url, headers=headers, params=params, timeout=30)

        response.raise_for_status()
        data = response.json()

        # Save raw response for debugging
        with open(RAW_LINKEDIN_FILE, 'w') as f:
            json.dump(data, f, indent=2)
        logger.info(f"Raw LinkedIn response saved to {RAW_LINKEDIN_FILE}")

        logger.info(f"LinkedIn data fetched successfully ({len(data.get('elements', []))} items)")
        return data

    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to fetch LinkedIn data: {e}")
        return {"elements": []}


def parse_linkedin_posts(linkedin_data):
    """
    Parse LinkedIn data and extract posts
    Handles both ugcPosts and memberChangeLogs responses
    """
    elements = linkedin_data.get("elements", [])

    if not elements:
        logger.warning("No LinkedIn elements found")
        return []

    posts = []

    for element in elements:
        # Check if this is a ugcPost
        if "specificContent" in element:
            # ugcPosts structure
            ugc_post_id = element.get("id", "")

            # Extract text content
            content = ""
            if "specificContent" in element:
                linkedin_share = element.get("specificContent", {}).get("com.linkedin.ugc.ShareContent", {})
                share_commentary = linkedin_share.get("shareCommentary", {})
                content = share_commentary.get("text", "")

            # Extract timestamp
            created_time = element.get("created", {}).get("time", 0)
            date = datetime.fromtimestamp(created_time / 1000).isoformat() if created_time else datetime.now().isoformat()

            # Construct post URL
            # ugcPost URN: urn:li:ugcPost:1234567890
            # Convert to activity URN for URL
            if ugc_post_id:
                post_url = f"https://www.linkedin.com/feed/update/urn:li:ugcPost:{ugc_post_id}/"
            else:
                post_url = ""

            if content:
                post = {
                    "date": date,
                    "content": content,
                    "url": post_url,
                    "entity_urn": f"urn:li:ugcPost:{ugc_post_id}"
                }
                posts.append(post)

        else:
            # memberChangeLogs structure (fallback)
            entity_urn = element.get("entityUrn", "")
            content = ""

            if "commentary" in element:
                content = element.get("commentary", {}).get("text", "")
            elif "text" in element:
                content = element.get("text", "")

            created_time = element.get("created", {}).get("time", 0)
            date = datetime.fromtimestamp(created_time / 1000).isoformat() if created_time else datetime.now().isoformat()

            post_url = f"https://www.linkedin.com/feed/update/{entity_urn}/" if entity_urn else ""

            if content or entity_urn:
                post = {
                    "date": date,
                    "content": content,
                    "url": post_url,
                    "entity_urn": entity_urn
                }
                posts.append(post)

    logger.info(f"Parsed {len(posts)} LinkedIn posts")
    return posts[:5]  # Limit to 5 most recent


def fetch_github_activity():
    """
    Fetch GitHub activity by getting the most recently pushed repository
    This is more reliable than the Events API which has a 30-day limit
    """
    token = os.getenv("github_pat")
    username = os.getenv("PORTFOLIO_GITHUB")

    if not username:
        logger.error("GitHub username not found in .env")
        return None

    logger.info(f"Fetching GitHub repositories for user: {username}")

    # Get repos sorted by most recently pushed
    url = f"https://api.github.com/users/{username}/repos"
    params = {
        "sort": "pushed",
        "direction": "desc",
        "per_page": 5  # Get top 5 most recently pushed repos
    }

    # Public repos don't require auth
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }

    try:
        response = requests.get(url, headers=headers, params=params, timeout=30)
        response.raise_for_status()
        repos = response.json()

        if repos and len(repos) > 0:
            # Get the most recently pushed repo
            latest_repo = repos[0]
            repo_full_name = latest_repo.get("full_name", "")
            repo_name = latest_repo.get("name", "")
            pushed_at = latest_repo.get("pushed_at", "")

            logger.info(f"Found latest GitHub activity: {repo_full_name} (pushed at {pushed_at})")

            # Optionally, fetch latest commits from this repo
            commits_url = f"https://api.github.com/repos/{repo_full_name}/commits"
            commits_params = {"per_page": 3}

            try:
                commits_response = requests.get(commits_url, headers=headers, params=commits_params, timeout=30)
                commits_response.raise_for_status()
                commits_data = commits_response.json()

                latest_commits = [
                    {
                        "sha": commit.get("sha", "")[:7],
                        "message": commit.get("commit", {}).get("message", "").split('\n')[0]  # First line only
                    }
                    for commit in commits_data[:3]
                ]
            except:
                latest_commits = []

            return {
                "repo": repo_full_name,
                "repo_name": repo_name,
                "commits": latest_commits,
                "pushed_at": pushed_at
            }
        else:
            logger.warning("No repositories found for user")
            return None

    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to fetch GitHub repositories: {e}")
        return None


def fetch_youtube_uploads_playlist():
    """
    Get the uploads playlist ID for the YouTube channel
    """
    api_key = os.getenv("youtube_api_key")
    channel_id = os.getenv("youtube_channel_ID")

    if not api_key or not channel_id:
        logger.error("YouTube API key or channel ID not found in .env")
        return None

    logger.info(f"Fetching YouTube uploads playlist for channel: {channel_id}")

    url = "https://www.googleapis.com/youtube/v3/channels"
    params = {
        "part": "contentDetails",
        "id": channel_id,
        "key": api_key
    }

    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        if "items" in data and len(data["items"]) > 0:
            uploads_id = data["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]
            logger.info(f"Found uploads playlist ID: {uploads_id}")
            return uploads_id
        else:
            logger.warning("No channel found or no uploads playlist")
            return None

    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to fetch YouTube channel details: {e}")
        return None


def fetch_youtube_latest_videos(max_results=5):
    """
    Fetch latest YouTube videos from the uploads playlist
    """
    uploads_playlist_id = fetch_youtube_uploads_playlist()
    if not uploads_playlist_id:
        return []

    api_key = os.getenv("youtube_api_key")
    logger.info(f"Fetching latest {max_results} YouTube videos...")

    url = "https://www.googleapis.com/youtube/v3/playlistItems"
    params = {
        "part": "snippet",
        "playlistId": uploads_playlist_id,
        "maxResults": max_results,
        "key": api_key
    }

    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        videos = []
        for item in data.get("items", []):
            snippet = item.get("snippet", {})
            video_id = snippet.get("resourceId", {}).get("videoId", "")
            videos.append({
                "title": snippet.get("title", ""),
                "video_id": video_id,
                "published_at": snippet.get("publishedAt", ""),
                "thumbnail": snippet.get("thumbnails", {}).get("high", {}).get("url", "")
            })

        logger.info(f"Fetched {len(videos)} YouTube videos")
        return videos

    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to fetch YouTube videos: {e}")
        return []


def generate_data_json(posts, github_activity, youtube_videos):
    """Generate the data.json file for the website"""
    # Get latest LinkedIn post info
    latest_linkedin_post = None
    if posts and len(posts) > 0:
        # Extract first few words from the latest post
        content = posts[0].get("content", "")
        words = content.split()[:5]  # First 5 words
        preview = " ".join(words) + ("..." if len(words) >= 5 else "")

        latest_linkedin_post = {
            "preview": preview,
            "url": posts[0].get("url", ""),  # You'll need to add this in parse_linkedin_posts
            "full_content": content
        }

    data = {
        "name": os.getenv("PORTFOLIO_NAME", "Your Name"),
        "title": os.getenv("PORTFOLIO_TITLE", "Your Title"),
        "linkedin_posts": posts,
        "latest_linkedin_post": latest_linkedin_post,
        "github_activity": github_activity,
        "youtube_videos": youtube_videos,
        "contact": {
            "email": os.getenv("PORTFOLIO_EMAIL", "your.email@example.com"),
            "github": os.getenv("PORTFOLIO_GITHUB", "yourusername"),
            "linkedin": os.getenv("PORTFOLIO_LINKEDIN", "https://linkedin.com/in/yourprofile")
        },
        "last_updated": datetime.now().isoformat()
    }

    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2)

    logger.info(f"data.json updated successfully at {DATA_FILE}")


def main():
    """Main execution flow"""
    logger.info("=" * 50)
    logger.info("Starting portfolio update")
    logger.info("=" * 50)

    try:
        # Load environment variables
        load_env()

        # Fetch LinkedIn data
        linkedin_data = fetch_linkedin_data()

        # Parse LinkedIn posts
        posts = parse_linkedin_posts(linkedin_data)

        # Fetch GitHub activity
        github_activity = fetch_github_activity()

        # Fetch YouTube videos
        youtube_videos = fetch_youtube_latest_videos(max_results=5)

        # Generate data.json
        generate_data_json(posts, github_activity, youtube_videos)

        logger.info("=" * 50)
        logger.info("Portfolio update complete")
        logger.info("=" * 50)

    except Exception as e:
        logger.error(f"Portfolio update failed: {e}", exc_info=True)
        raise


if __name__ == "__main__":
    main()
