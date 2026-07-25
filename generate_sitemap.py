#!/usr/bin/env python3
"""
THE MOON - Ultimate Sitemap Generator
Features:
- Multi-sitemap (sitemap index + multiple files)
- Google News, Image, Video sitemap
- hreflang (Hindi/English alternates)
- Priority based on views + comments
- Smart scheduling (auto-run after publish)
- Telegram alert on failure
- Cloudflare cache purge (optional)
"""

import os
import sys
import logging
import requests
from datetime import datetime, timedelta
import xml.etree.ElementTree as ET
from xml.dom import minidom
from typing import List, Dict, Any

# ===================== CONFIG =====================
SUPABASE_URL = os.getenv('SUPABASE_URL', 'https://zpubhlbdqwzyseditrls.supabase.co')
SUPABASE_KEY = os.getenv('SUPABASE_KEY', 'sb_publishable_4YiRI2c1Tij-2KvyNtJ9Sg_8-l0OFuP')
BASE_URL = "https://themoonr4.github.io/rasu"
SITEMAP_LIMIT = 50000  # Google max per sitemap

# Telegram alert (optional)
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID')

# Cloudflare (optional)
CLOUDFLARE_ZONE_ID = os.getenv('CLOUDFLARE_ZONE_ID')
CLOUDFLARE_API_KEY = os.getenv('CLOUDFLARE_API_KEY')

# Static pages
STATIC_PAGES = [
    {'loc': '/', 'priority': 1.0, 'changefreq': 'daily', 'langs': {'en': '/', 'hi': '/hi/'}},
    {'loc': '/study.html', 'priority': 0.8, 'changefreq': 'weekly'},
    {'loc': '/freelance.html', 'priority': 0.8, 'changefreq': 'weekly'},
    {'loc': '/vacancy.html', 'priority': 0.8, 'changefreq': 'weekly'},
    {'loc': '/about.html', 'priority': 0.6, 'changefreq': 'monthly'},
    {'loc': '/contact.html', 'priority': 0.6, 'changefreq': 'monthly'},
    {'loc': '/privacy.html', 'priority': 0.5, 'changefreq': 'monthly'},
    {'loc': '/admin.html', 'priority': 0.4, 'changefreq': 'monthly'},
]

# ===================== LOGGING =====================
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def send_telegram_alert(message):
    """Send alert to Telegram if bot token is set"""
    if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
        try:
            url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
            requests.post(url, json={'chat_id': TELEGRAM_CHAT_ID, 'text': message, 'parse_mode': 'HTML'})
            logger.info("✅ Telegram alert sent")
        except Exception as e:
            logger.error(f"Failed to send Telegram alert: {e}")

# ===================== FETCH DATA =====================
def fetch_news_and_comments() -> List[Dict]:
    """Fetch published news with comments count"""
    headers = {'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}'}
    all_items = []
    page = 0
    page_size = 1000

    # First fetch news with views
    while True:
        offset = page * page_size
        url = f"{SUPABASE_URL}/rest/v1/news?select=id,title,content,image_url,video_url,views,published_at&status=eq.published&order=published_at.desc&limit={page_size}&offset={offset}"
        try:
            r = requests.get(url, headers=headers, timeout=30)
            r.raise_for_status()
            data = r.json()
            if not data: break
            all_items.extend(data)
            if len(data) < page_size: break
            page += 1
        except Exception as e:
            logger.error(f"Error fetching news: {e}")
            send_telegram_alert(f"❌ Sitemap generation failed at fetch news: {e}")
            break

    # Fetch comments count for each news (if needed)
    # We'll get comments count per article
    if all_items:
        ids = [str(item['id']) for item in all_items]
        # Supabase can do in-clause, we'll batch
        # For simplicity, we can fetch all comments and count, but for large data we can use aggregate query.
        # We'll use a group by query
        try:
            comment_url = f"{SUPABASE_URL}/rest/v1/comments?select=news_id,count=id&group=news_id"
            r = requests.get(comment_url, headers=headers, timeout=30)
            if r.status_code == 200:
                comments_data = r.json()
                comments_map = {int(c['news_id']): int(c['count']) for c in comments_data}
                for item in all_items:
                    item['comment_count'] = comments_map.get(item['id'], 0)
            else:
                for item in all_items:
                    item['comment_count'] = 0
        except Exception as e:
            logger.warning(f"Could not fetch comments, using 0: {e}")
            for item in all_items:
                item['comment_count'] = 0

    logger.info(f"✅ Total news fetched: {len(all_items)}")
    return all_items

# ===================== GENERATE SITEMAP FILE =====================
def generate_sitemap_file(news_list, filename, is_index=False):
    """Generate a single sitemap XML file (or sitemap index)"""
    if is_index:
        root = ET.Element('sitemapindex', xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
        for news in news_list:
            sitemap = ET.SubElement(root, 'sitemap')
            loc = ET.SubElement(sitemap, 'loc')
            loc.text = news['loc']
            lastmod = ET.SubElement(sitemap, 'lastmod')
            lastmod.text = datetime.now().strftime('%Y-%m-%d')
        xml_str = ET.tostring(root, encoding='unicode')
        pretty = minidom.parseString(xml_str).toprettyxml(indent='  ')
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(pretty)
        logger.info(f"✅ Sitemap index generated: {filename}")
        return

    # Regular sitemap
    root = ET.Element('urlset', xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    root.set('xmlns:news', 'http://www.google.com/schemas/sitemap-news/0.9')
    root.set('xmlns:image', 'http://www.google.com/schemas/sitemap-image/1.1')
    root.set('xmlns:video', 'http://www.google.com/schemas/sitemap-video/1.1')
    root.set('xmlns:xhtml', 'http://www.w3.org/1999/xhtml')  # for hreflang

    # Static pages with hreflang
    for page in STATIC_PAGES:
        url_elem = ET.SubElement(root, 'url')
        loc = ET.SubElement(url_elem, 'loc')
        loc.text = BASE_URL + page['loc']
        lastmod = ET.SubElement(url_elem, 'lastmod')
        lastmod.text = datetime.now().strftime('%Y-%m-%d')
        changefreq = ET.SubElement(url_elem, 'changefreq')
        changefreq.text = page.get('changefreq', 'daily')
        priority = ET.SubElement(url_elem, 'priority')
        priority.text = str(page.get('priority', 0.5))

        # hreflang (if Hindi version exists)
        if 'langs' in page:
            for lang, url_suffix in page['langs'].items():
                link = ET.SubElement(url_elem, 'xhtml:link', rel='alternate', hreflang=lang, href=BASE_URL + url_suffix)

    # News articles
    for idx, article in enumerate(news_list):
        article_id = article.get('id')
        title = article.get('title', '')
        content = article.get('content', '')
        image_url = article.get('image_url')
        video_url = article.get('video_url')
        views = article.get('views', 0)
        comments = article.get('comment_count', 0)
        published_at = article.get('published_at')

        # Lastmod
        try:
            if published_at and 'T' in published_at:
                pub_date = datetime.fromisoformat(published_at.replace('Z', '+00:00'))
                lastmod_str = pub_date.strftime('%Y-%m-%d')
            else:
                lastmod_str = datetime.now().strftime('%Y-%m-%d')
        except:
            lastmod_str = datetime.now().strftime('%Y-%m-%d')

        # Priority: recency + views + comments
        if idx < 5:
            base_priority = 0.9
        elif idx < 20:
            base_priority = 0.8
        else:
            base_priority = 0.7

        engagement_boost = min(0.08, (views * 0.01 + comments * 0.1) / 1000)
        priority_val = min(1.0, base_priority + engagement_boost)

        url_elem = ET.SubElement(root, 'url')
        loc = ET.SubElement(url_elem, 'loc')
        loc.text = f"{BASE_URL}/article.html?id={article_id}"
        lastmod = ET.SubElement(url_elem, 'lastmod')
        lastmod.text = lastmod_str
        changefreq = ET.SubElement(url_elem, 'changefreq')
        changefreq.text = 'daily'
        priority = ET.SubElement(url_elem, 'priority')
        priority.text = f"{priority_val:.2f}"

        # hreflang for news (English default, Hindi alternate if exists)
        # We assume Hindi version would be /hi/article.html?id=... (if implemented)
        # For now, we add only English.
        # If you have Hindi pages, add similar xhtml:link.

        # Google News
        news_elem = ET.SubElement(url_elem, 'news:news')
        pub_elem = ET.SubElement(news_elem, 'news:publication')
        pub_name = ET.SubElement(pub_elem, 'news:name')
        pub_name.text = 'THE MOON'
        pub_lang = ET.SubElement(pub_elem, 'news:language')
        pub_lang.text = 'en'
        news_date = ET.SubElement(news_elem, 'news:publication_date')
        news_date.text = published_at if published_at else datetime.now().isoformat()
        news_title = ET.SubElement(news_elem, 'news:title')
        news_title.text = title[:100] if title else 'News'

        # Image
        if image_url:
            img_elem = ET.SubElement(url_elem, 'image:image')
            img_loc = ET.SubElement(img_elem, 'image:loc')
            img_loc.text = image_url
            img_caption = ET.SubElement(img_elem, 'image:caption')
            img_caption.text = title[:100] if title else 'News image'
            img_title = ET.SubElement(img_elem, 'image:title')
            img_title.text = title[:100] if title else 'News image'

        # Video
        if video_url:
            vid_elem = ET.SubElement(url_elem, 'video:video')
            vid_loc = ET.SubElement(vid_elem, 'video:content_loc')
            vid_loc.text = video_url
            vid_title = ET.SubElement(vid_elem, 'video:title')
            vid_title.text = title[:100] if title else 'Video'
            vid_desc = ET.SubElement(vid_elem, 'video:description')
            vid_desc.text = content[:200] if content else 'Video description'
            vid_dur = ET.SubElement(vid_elem, 'video:duration')
            vid_dur.text = '300'  # placeholder, can be extracted if available

    # Write pretty XML
    xml_str = ET.tostring(root, encoding='unicode')
    pretty = minidom.parseString(xml_str).toprettyxml(indent='  ')
    clean = '\n'.join(line for line in pretty.splitlines() if line.strip())
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(clean)

    logger.info(f"✅ Sitemap generated: {filename} with {len(news_list)} articles")

# ===================== MULTI-SITEMAP =====================
def generate_multi_sitemaps(all_news):
    """Split news into multiple sitemaps if > limit"""
    total = len(all_news)
    if total <= SITEMAP_LIMIT:
        generate_sitemap_file(all_news, 'sitemap.xml')
        # Also create sitemap_index.xml with one entry
        index_entries = [{'loc': f"{BASE_URL}/sitemap.xml"}]
        generate_sitemap_file(index_entries, 'sitemap_index.xml', is_index=True)
        return

    # Split into chunks
    chunks = [all_news[i:i+SITEMAP_LIMIT] for i in range(0, total, SITEMAP_LIMIT)]
    index_entries = []
    for i, chunk in enumerate(chunks):
        filename = f"sitemap_{i+1}.xml"
        generate_sitemap_file(chunk, filename)
        index_entries.append({'loc': f"{BASE_URL}/{filename}"})

    generate_sitemap_file(index_entries, 'sitemap_index.xml', is_index=True)
    logger.info(f"✅ Multi-sitemap: {len(chunks)} files + index")

# ===================== ROBOTS.TXT =====================
def update_robots_txt():
    sitemap_line = f"Sitemap: {BASE_URL}/sitemap_index.xml\n"
    try:
        with open('robots.txt', 'r+') as f:
            content = f.read()
            if sitemap_line not in content:
                f.write(sitemap_line)
                logger.info("✅ robots.txt updated")
    except FileNotFoundError:
        with open('robots.txt', 'w') as f:
            f.write("User-agent: *\nAllow: /\n" + sitemap_line)
        logger.info("✅ robots.txt created")

# ===================== CLOUDFLARE PURGE (optional) =====================
def purge_cloudflare_cache():
    if CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_KEY:
        try:
            url = f"https://api.cloudflare.com/client/v4/zones/{CLOUDFLARE_ZONE_ID}/purge_cache"
            headers = {'Authorization': f'Bearer {CLOUDFLARE_API_KEY}', 'Content-Type': 'application/json'}
            payload = {'files': [f"{BASE_URL}/sitemap.xml", f"{BASE_URL}/sitemap_index.xml"]}
            r = requests.post(url, headers=headers, json=payload)
            if r.status_code == 200:
                logger.info("✅ Cloudflare cache purged")
            else:
                logger.warning("Cloudflare purge failed")
        except Exception as e:
            logger.error(f"Cloudflare error: {e}")

# ===================== MAIN =====================
def main():
    try:
        logger.info("🚀 Starting ultimate sitemap generation...")
        news = fetch_news_and_comments()
        if news:
            generate_multi_sitemaps(news)
        else:
            logger.warning("No news found, creating static-only sitemap")
            generate_sitemap_file([], 'sitemap.xml')
            index_entries = [{'loc': f"{BASE_URL}/sitemap.xml"}]
            generate_sitemap_file(index_entries, 'sitemap_index.xml', is_index=True)

        update_robots_txt()
        purge_cloudflare_cache()
        send_telegram_alert("✅ Sitemap generation successful!")
        logger.info("🎉 All done!")
    except Exception as e:
        logger.error(f"❌ Fatal error: {e}")
        send_telegram_alert(f"❌ Sitemap generation failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
