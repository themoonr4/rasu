#!/usr/bin/env python3
"""
THE MOON - Auto SEO System with Human Oversight
Supabase + Python + Gemini AI
"""

import os
import sys
import json
import logging
import requests
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import xml.etree.ElementTree as ET
from xml.dom import minidom
import re

# ===================== CONFIG =====================
SUPABASE_URL = os.getenv('SUPABASE_URL', 'https://zpubhlbdqwzyseditrls.supabase.co')
SUPABASE_KEY = os.getenv('SUPABASE_KEY', 'sb_publishable_4YiRI2c1Tij-2KvyNtJ9Sg_8-l0OFuP')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', 'AIzaSyCVxua06c7WNESeIq79f44sD-LSUznPVpA')
BASE_URL = "https://themoonr4.github.io/rasu"

# Telegram
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID')

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

# ===================== SUPABASE CLIENT =====================
def get_supabase_client():
    headers = {'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}'}
    return headers

def supabase_request(method, endpoint, data=None):
    headers = get_supabase_client()
    headers['Content-Type'] = 'application/json'
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}"
    try:
        if method == 'GET':
            response = requests.get(url, headers=headers, timeout=30)
        elif method == 'POST':
            response = requests.post(url, headers=headers, json=data, timeout=30)
        elif method == 'PATCH':
            response = requests.patch(url, headers=headers, json=data, timeout=30)
        elif method == 'DELETE':
            response = requests.delete(url, headers=headers, timeout=30)
        else:
            return None
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error(f"Supabase {method} error: {e}")
        return None

# ===================== FETCH PENDING ARTICLES =====================
def fetch_pending_articles():
    """Fetch articles with review_status = 'pending' (needs human review)"""
    result = supabase_request('GET', 'news?select=*&review_status=eq.pending&order=created_at.desc')
    return result or []

def fetch_draft_articles():
    """Fetch articles with review_status = 'draft' (needs AI suggestions)"""
    result = supabase_request('GET', 'news?select=*&review_status=eq.draft&order=created_at.desc')
    return result or []

# ===================== AI HEADLINE GENERATOR =====================
def generate_headline_suggestions(title, content, category):
    """Generate 3-5 headline suggestions using Gemini AI"""
    if not GEMINI_API_KEY:
        return []
    
    prompt = f"""
    For this news article, generate 5 engaging, clickable headline options.
    
    Category: {category or 'News'}
    Original Title: {title[:100]}
    Content Preview: {content[:500]}
    
    Requirements:
    - Each headline: max 70 characters
    - Include power words (Breaking, Exclusive, Revealed, Shocking, etc.)
    - SEO-friendly (include keywords naturally)
    - Clickable for social media
    
    Return format (one per line, numbered):
    1. [Headline 1]
    2. [Headline 2]
    ...up to 5.
    """
    
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
        response = requests.post(
            url,
            json={'contents': [{'parts': [{'text': prompt}]}]},
            timeout=15
        )
        if response.status_code != 200:
            return []
        data = response.json()
        text = data['candidates'][0]['content']['parts'][0]['text']
        headlines = re.findall(r'\d+\.\s*(.+?)(?:\n|$)', text)
        return [h.strip()[:70] for h in headlines if h.strip()]
    except Exception as e:
        logger.warning(f"Headline generation error: {e}")
        return []

# ===================== GENERATE SEO SUGGESTIONS =====================
def generate_seo_suggestions(article):
    """Generate SEO suggestions for human review"""
    title = article.get('title', '')
    content = article.get('content', '')
    category = article.get('category', 'News')
    
    suggestions = {
        'headlines': generate_headline_suggestions(title, content, category),
        'meta_title': f"{title[:50]} | {category} - THE MOON",
        'meta_description': f"Latest {category} news: {title[:120]}. Stay updated with THE MOON, India's #1 AI-powered news platform."
    }
    
    if suggestions['headlines']:
        # Save suggestions to database
        for idx, headline in enumerate(suggestions['headlines']):
            supabase_request('POST', 'seo_suggestions', {
                'news_id': article.get('id'),
                'suggestion_type': 'headline',
                'suggestion_text': headline,
                'score': 10 - idx * 2,
                'is_selected': idx == 0
            })
    
    return suggestions

# ===================== GENERATE SITEMAP =====================
def generate_sitemap():
    """Generate sitemap.xml from published articles"""
    published = supabase_request('GET', 'news?select=id,title,image_url,views,published_at,category&review_status=eq.published&order=published_at.desc')
    news_list = published or []
    
    root = ET.Element('urlset', xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    root.set('xmlns:news', 'http://www.google.com/schemas/sitemap-news/0.9')
    root.set('xmlns:image', 'http://www.google.com/schemas/sitemap-image/1.1')

    # Static pages
    static_pages = [
        {'loc': '/', 'priority': 1.0, 'changefreq': 'daily'},
        {'loc': '/study.html', 'priority': 0.8, 'changefreq': 'weekly'},
        {'loc': '/freelance.html', 'priority': 0.8, 'changefreq': 'weekly'},
        {'loc': '/vacancy.html', 'priority': 0.8, 'changefreq': 'weekly'},
        {'loc': '/about.html', 'priority': 0.6, 'changefreq': 'monthly'},
        {'loc': '/contact.html', 'priority': 0.6, 'changefreq': 'monthly'},
        {'loc': '/privacy.html', 'priority': 0.5, 'changefreq': 'monthly'},
    ]

    for page in static_pages:
        url_elem = ET.SubElement(root, 'url')
        loc = ET.SubElement(url_elem, 'loc')
        loc.text = BASE_URL + page['loc']
        lastmod = ET.SubElement(url_elem, 'lastmod')
        lastmod.text = datetime.now().strftime('%Y-%m-%d')
        changefreq = ET.SubElement(url_elem, 'changefreq')
        changefreq.text = page['changefreq']
        priority = ET.SubElement(url_elem, 'priority')
        priority.text = str(page['priority'])

    # News articles
    for idx, article in enumerate(news_list):
        article_id = article.get('id')
        title = article.get('title', '')
        image = article.get('image_url')
        views = article.get('views', 0)
        pub_at = article.get('published_at')

        try:
            if pub_at and 'T' in pub_at:
                lastmod_str = datetime.fromisoformat(pub_at.replace('Z', '+00:00')).strftime('%Y-%m-%d')
            else:
                lastmod_str = datetime.now().strftime('%Y-%m-%d')
        except:
            lastmod_str = datetime.now().strftime('%Y-%m-%d')

        priority_val = 0.9 if idx < 5 else (0.85 if idx < 20 else 0.7)
        if views and views > 1000:
            priority_val = min(1.0, priority_val + 0.05)

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

        if image:
            img_elem = ET.SubElement(url_elem, 'image:image')
            img_loc = ET.SubElement(img_elem, 'image:loc')
            img_loc.text = image

    xml_str = ET.tostring(root, encoding='unicode')
    pretty = minidom.parseString(xml_str).toprettyxml(indent='  ')
    clean = '\n'.join(line for line in pretty.splitlines() if line.strip())

    with open('sitemap.xml', 'w', encoding='utf-8') as f:
        f.write(clean)

    logger.info(f"✅ Sitemap generated with {len(news_list)} articles")
    return len(news_list)

# ===================== UPDATE ROBOTS.TXT =====================
def update_robots_txt():
    content = """# ============================================
# THE MOON - Robots.txt (Auto-Generated)
# ============================================
User-agent: *
Allow: /
Allow: /article.html
Allow: /study.html
Allow: /freelance.html
Allow: /vacancy.html
Allow: /about.html
Allow: /contact.html
Allow: /privacy.html
Disallow: /admin.html
Sitemap: https://themoonr4.github.io/rasu/sitemap.xml

User-agent: Googlebot
Allow: /
Crawl-delay: 1

User-agent: Bingbot
Allow: /
Crawl-delay: 1

User-agent: GPTBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /

User-agent: Google-Extended
Disallow: /
"""
    with open('robots.txt', 'w', encoding='utf-8') as f:
        f.write(content)
    logger.info("✅ robots.txt updated")

# ===================== PING SEARCH ENGINES =====================
def ping_search_engines():
    sitemap_url = f"{BASE_URL}/sitemap.xml"
    try:
        requests.get(f"https://www.google.com/ping?sitemap={sitemap_url}", timeout=10)
        logger.info("✅ Google pinged")
    except:
        pass
    try:
        requests.get(f"https://www.bing.com/ping?sitemap={sitemap_url}", timeout=10)
        logger.info("✅ Bing pinged")
    except:
        pass

# ===================== MAIN =====================
def main():
    try:
        logger.info("🚀 Starting Auto-SEO System...")
        
        # 1. Process draft articles (generate AI suggestions)
        drafts = fetch_draft_articles()
        for article in drafts:
            logger.info(f"📝 Generating SEO suggestions for: {article.get('title')[:50]}")
            suggestions = generate_seo_suggestions(article)
            # Update status to pending for human review
            supabase_request('PATCH', f'news?id=eq.{article.get("id")}', {
                'review_status': 'pending',
                'seo_title': suggestions.get('meta_title', ''),
                'seo_description': suggestions.get('meta_description', '')
            })
            if suggestions.get('headlines'):
                logger.info(f"✅ Generated {len(suggestions['headlines'])} headline options")
        
        # 2. Generate sitemap
        generate_sitemap()
        
        # 3. Update robots.txt
        update_robots_txt()
        
        # 4. Ping search engines
        ping_search_engines()
        
        # 5. Count pending articles
        pending_count = len(fetch_pending_articles())
        if pending_count > 0:
            send_telegram_alert(
                f"📋 <b>Auto-SEO Update</b>\n"
                f"📰 {pending_count} articles pending human review\n"
                f"🗺️ Sitemap updated: {BASE_URL}/sitemap.xml"
            )
        else:
            send_telegram_alert("✅ Auto-SEO ran successfully. No pending articles.")
        
        logger.info("🎉 Auto-SEO Complete!")
        
    except Exception as e:
        logger.error(f"❌ Fatal error: {e}")
        send_telegram_alert(f"❌ Auto-SEO failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
