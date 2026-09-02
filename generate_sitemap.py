#!/usr/bin/env python3
"""
THE MOON - Ultimate Sitemap Generator
- Multi-sitemap (50k+ URLs)
- Google News, Image, Video Sitemap
- hreflang (Hindi/English)
- Priority based on recency + views + comments
- Gzip compression (.xml.gz)
- Telegram alert & Cloudflare purge
"""

import os
import sys
import gzip
import logging
import requests
from datetime import datetime
from typing import List, Dict
import xml.etree.ElementTree as ET
from xml.dom import minidom

# ===================== CONFIG =====================
SUPABASE_URL = os.getenv('SUPABASE_URL', 'https://zpubhlbdqwzyseditrls.supabase.co')
SUPABASE_KEY = os.getenv('SUPABASE_KEY', 'sb_publishable_4YiRI2c1Tij-2KvyNtJ9Sg_8-l0OFuP')
BASE_URL = "https://themoonr4.github.io/rasu"
SITEMAP_LIMIT = 50000

# Telegram (optional)
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID')

# Cloudflare (optional)
CLOUDFLARE_ZONE_ID = os.getenv('CLOUDFLARE_ZONE_ID')
CLOUDFLARE_API_KEY = os.getenv('CLOUDFLARE_API_KEY')

# Static Pages with hreflang
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
    if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
        try:
            requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                json={'chat_id': TELEGRAM_CHAT_ID, 'text': message, 'parse_mode': 'HTML'}
            )
            logger.info("✅ Telegram alert sent")
        except Exception as e:
            logger.error(f"Telegram error: {e}")

# ===================== FETCH NEWS =====================
def fetch_news() -> List[Dict]:
    headers = {'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}'}
    all_news = []
    page = 0
    page_size = 1000

    while True:
        offset = page * page_size
        url = f"{SUPABASE_URL}/rest/v1/news?select=id,title,content,image_url,video_url,views,published_at&status=eq.published&order=published_at.desc&limit={page_size}&offset={offset}"
        try:
            r = requests.get(url, headers=headers, timeout=30)
            r.raise_for_status()
            data = r.json()
            if not data: break
            all_news.extend(data)
            if len(data) < page_size: break
            page += 1
        except Exception as e:
            logger.error(f"Fetch error: {e}")
            send_telegram_alert(f"❌ Sitemap fetch failed: {e}")
            break

    # Fetch comments count
    try:
        comment_url = f"{SUPABASE_URL}/rest/v1/comments?select=news_id,count=id&group=news_id"
        r = requests.get(comment_url, headers=headers, timeout=30)
        if r.status_code == 200:
            comments_map = {int(c['news_id']): int(c['count']) for c in r.json()}
            for item in all_news:
                item['comment_count'] = comments_map.get(item['id'], 0)
        else:
            for item in all_news:
                item['comment_count'] = 0
    except:
        for item in all_news:
            item['comment_count'] = 0

    logger.info(f"✅ Fetched {len(all_news)} published articles.")
    return all_news

# ===================== GENERATE SITEMAP =====================
def generate_sitemap_file(news_list, filename, is_index=False):
    root = ET.Element('urlset' if not is_index else 'sitemapindex')
    if is_index:
        root.set('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9')
    else:
        root.set('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9')
        root.set('xmlns:news', 'http://www.google.com/schemas/sitemap-news/0.9')
        root.set('xmlns:image', 'http://www.google.com/schemas/sitemap-image/1.1')
        root.set('xmlns:video', 'http://www.google.com/schemas/sitemap-video/1.1')
        root.set('xmlns:xhtml', 'http://www.w3.org/1999/xhtml')

    if is_index:
        for item in news_list:
            sitemap = ET.SubElement(root, 'sitemap')
            loc = ET.SubElement(sitemap, 'loc')
            loc.text = item['loc']
            lastmod = ET.SubElement(sitemap, 'lastmod')
            lastmod.text = datetime.now().strftime('%Y-%m-%d')
    else:
        # Static Pages
        for page in STATIC_PAGES:
            url_elem = ET.SubElement(root, 'url')
            loc = ET.SubElement(url_elem, 'loc')
            loc.text = BASE_URL + page['loc']
            lastmod = ET.SubElement(url_elem, 'lastmod')
            lastmod.text = datetime.now().strftime('%Y-%m-%d')
            changefreq = ET.SubElement(url_elem, 'changefreq')
            changefreq.text = page['changefreq']
            priority = ET.SubElement(url_elem, 'priority')
            priority.text = str(page['priority'])
            if 'langs' in page:
                for lang, suffix in page['langs'].items():
                    link = ET.SubElement(url_elem, 'xhtml:link', rel='alternate', hreflang=lang, href=BASE_URL + suffix)

        # News Articles
        total = len(news_list)
        for idx, article in enumerate(news_list):
            article_id = article.get('id')
            title = article.get('title', '')
            content = article.get('content', '')
            image = article.get('image_url')
            video = article.get('video_url')
            views = article.get('views', 0)
            comments = article.get('comment_count', 0)
            pub_at = article.get('published_at')

            # Lastmod
            try:
                if pub_at and 'T' in pub_at:
                    lastmod_str = datetime.fromisoformat(pub_at.replace('Z', '+00:00')).strftime('%Y-%m-%d')
                else:
                    lastmod_str = datetime.now().strftime('%Y-%m-%d')
            except:
                lastmod_str = datetime.now().strftime('%Y-%m-%d')

            # Priority: Recency (0.9) + Views boost + Comments boost
            recency = 0.9 if idx < 5 else (0.85 if idx < 20 else 0.7)
            view_boost = min(0.1, views / 100000) if views else 0
            comment_boost = min(0.05, comments / 100) if comments else 0
            priority_val = min(1.0, recency + view_boost + comment_boost)

            url_elem = ET.SubElement(root, 'url')
            loc = ET.SubElement(url_elem, 'loc')
            loc.text = f"{BASE_URL}/article.html?id={article_id}"
            lastmod = ET.SubElement(url_elem, 'lastmod')
            lastmod.text = lastmod_str
            changefreq = ET.SubElement(url_elem, 'changefreq')
            changefreq.text = 'daily'
            priority = ET.SubElement(url_elem, 'priority')
            priority.text = f"{priority_val:.3f}"

            # Google News
            news_elem = ET.SubElement(url_elem, 'news:news')
            pub_elem = ET.SubElement(news_elem, 'news:publication')
            pub_name = ET.SubElement(pub_elem, 'news:name')
            pub_name.text = 'THE MOON'
            pub_lang = ET.SubElement(pub_elem, 'news:language')
            pub_lang.text = 'en'
            news_date = ET.SubElement(news_elem, 'news:publication_date')
            news_date.text = pub_at if pub_at else datetime.now().isoformat()
            news_title = ET.SubElement(news_elem, 'news:title')
            news_title.text = title[:100]

            # Image
            if image:
                img_elem = ET.SubElement(url_elem, 'image:image')
                img_loc = ET.SubElement(img_elem, 'image:loc')
                img_loc.text = image
                img_cap = ET.SubElement(img_elem, 'image:caption')
                img_cap.text = title[:100]
                img_tit = ET.SubElement(img_elem, 'image:title')
                img_tit.text = title[:100]

            # Video
            if video:
                vid_elem = ET.SubElement(url_elem, 'video:video')
                vid_loc = ET.SubElement(vid_elem, 'video:content_loc')
                vid_loc.text = video
                vid_title = ET.SubElement(vid_elem, 'video:title')
                vid_title.text = title[:100]
                vid_desc = ET.SubElement(vid_elem, 'video:description')
                vid_desc.text = content[:200] if content else 'Video'
                vid_dur = ET.SubElement(vid_elem, 'video:duration')
                vid_dur.text = '300'

    # ============================================================
    # 🔥 FINAL FIX: Remove first blank line from pretty
    # ============================================================
    xml_str = ET.tostring(root, encoding='unicode')
    pretty = minidom.parseString(xml_str).toprettyxml(indent='  ')
    
    # Split into lines
    lines = pretty.splitlines()
    
    # Remove first blank line if it exists
    if lines and lines[0].strip() == '':
        lines = lines[1:]
    
    # If minidom already included XML declaration, remove it so we don't double-declare
    if lines and lines[0].strip().startswith('<?xml'):
        lines = lines[1:]
    
    # Join remaining lines
    clean = '\n'.join(lines)
    
    # XML Declaration + content
    final_xml = '<?xml version="1.0" ?>\n' + clean

    # Write .xml
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(final_xml)
    
    # Write .xml.gz (compressed)
    try:
        with gzip.open(filename + '.gz', 'wt', encoding='utf-8') as f:
            f.write(final_xml)
    except Exception as e:
        logger.warning(f"Could not write .gz: {e}")

    logger.info(f"✅ Generated: {filename} ({len(news_list)} urls)")

# ===================== MULTI-SITEMAP =====================
def generate_multi_sitemaps(all_news):
    total = len(all_news)
    if total <= SITEMAP_LIMIT:
        generate_sitemap_file(all_news, 'sitemap.xml')
        index = [{'loc': f"{BASE_URL}/sitemap.xml"}]
        generate_sitemap_file(index, 'sitemap_index.xml', is_index=True)
        with open('sitemap.txt', 'w') as f:
            f.write(f"{BASE_URL}/sitemap.xml\n")
        return

    chunks = [all_news[i:i+SITEMAP_LIMIT] for i in range(0, total, SITEMAP_LIMIT)]
    index = []
    for i, chunk in enumerate(chunks):
        name = f"sitemap_{i+1}.xml"
        generate_sitemap_file(chunk, name)
        index.append({'loc': f"{BASE_URL}/{name}"})
    
    generate_sitemap_file(index, 'sitemap_index.xml', is_index=True)
    with open('sitemap.txt', 'w') as f:
        f.write(f"{BASE_URL}/sitemap_index.xml\n")

# ===================== ROBOTS.TXT (FIXED) =====================
def update_robots_txt():
    """✅ FIXED: Keep Sitemap at TOP after header comment"""
    # Prefer sitemap_index.xml if present, otherwise sitemap.xml
    if os.path.exists('sitemap_index.xml'):
        sitemap_filename = 'sitemap_index.xml'
    elif os.path.exists('sitemap.xml'):
        sitemap_filename = 'sitemap.xml'
    else:
        # default to sitemap.xml if none generated yet
        sitemap_filename = 'sitemap.xml'

    sitemap_line = f"Sitemap: {BASE_URL}/{sitemap_filename}"
    
    try:
        with open('robots.txt', 'r') as f:
            content = f.read()
    except FileNotFoundError:
        content = ""
    
    # Split content into lines
    lines = content.splitlines()
    
    # Find where the header comment ends
    header_end = 0
    for i, line in enumerate(lines):
        if line.startswith('#') or line.strip() == '':
            header_end = i + 1
        else:
            break
    
    # Remove any existing Sitemap lines
    lines = [line for line in lines if not line.strip().startswith('Sitemap:')]
    
    # Insert Sitemap at proper position (after header, before any rules)
    lines.insert(header_end, sitemap_line)
    
    # Write back
    with open('robots.txt', 'w') as f:
        f.write('\n'.join(lines))
    
    logger.info("✅ robots.txt updated with sitemap at TOP")

def purge_cloudflare():
    if CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_KEY:
        try:
            url = f"https://api.cloudflare.com/client/v4/zones/{CLOUDFLARE_ZONE_ID}/purge_cache"
            headers = {'Authorization': f'Bearer {CLOUDFLARE_API_KEY}', 'Content-Type': 'application/json'}
            payload = {'files': [f"{BASE_URL}/sitemap.xml", f"{BASE_URL}/sitemap_index.xml", f"{BASE_URL}/sitemap.xml.gz"]}
            r = requests.post(url, headers=headers, json=payload)
            if r.status_code == 200:
                logger.info("✅ Cloudflare cache purged")
        except Exception as e:
            logger.error(f"Cloudflare error: {e}")

def main():
    try:
        logger.info("🚀 Generating World-Class Sitemap...")
        news = fetch_news()
        generate_multi_sitemaps(news)
        update_robots_txt()
        purge_cloudflare()
        send_telegram_alert(f"✅ Sitemap generated with {len(news)} articles!")
        logger.info("🎉 World-Class Sitemap Generation Complete!")
    except Exception as e:
        logger.error(f"❌ Fatal: {e}")
        send_telegram_alert(f"❌ Sitemap failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
