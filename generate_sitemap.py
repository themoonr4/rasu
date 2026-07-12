#!/usr/bin/env python3
"""
Dynamic Sitemap Generator for THE MOON
Fetches news from Supabase and generates sitemap.xml
"""

import os
import requests
from datetime import datetime
import xml.etree.ElementTree as ET
from xml.dom import minidom

# Supabase credentials (set as GitHub Secrets or hardcode for testing)
SUPABASE_URL = os.getenv('SUPABASE_URL', 'https://zpubhlbdqwzyseditrls.supabase.co')
SUPABASE_KEY = os.getenv('SUPABASE_KEY', 'sb_publishable_4YiRI2c1Tij-2KvyNtJ9Sg_8-l0OFuP')

# Static pages of your website
STATIC_PAGES = [
    {'loc': 'https://themoonr4.github.io/rasu/', 'priority': 1.0, 'changefreq': 'daily'},
    {'loc': 'https://themoonr4.github.io/rasu/study.html', 'priority': 0.8, 'changefreq': 'weekly'},
    {'loc': 'https://themoonr4.github.io/rasu/freelance.html', 'priority': 0.8, 'changefreq': 'weekly'},
    {'loc': 'https://themoonr4.github.io/rasu/vacancy.html', 'priority': 0.8, 'changefreq': 'weekly'},
    {'loc': 'https://themoonr4.github.io/rasu/about.html', 'priority': 0.6, 'changefreq': 'monthly'},
    {'loc': 'https://themoonr4.github.io/rasu/contact.html', 'priority': 0.6, 'changefreq': 'monthly'},
    {'loc': 'https://themoonr4.github.io/rasu/privacy.html', 'priority': 0.5, 'changefreq': 'monthly'},
    {'loc': 'https://themoonr4.github.io/rasu/admin.html', 'priority': 0.4, 'changefreq': 'monthly'},
]

def fetch_news():
    """Fetch all news articles from Supabase"""
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}'
    }
    url = f"{SUPABASE_URL}/rest/v1/news?select=id,published_at&order=published_at.desc"
    try:
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"⚠️ Error fetching news: {e}")
        return []

def generate_sitemap(news_articles):
    """Generate sitemap.xml with static + dynamic pages"""
    # Root element
    root = ET.Element('urlset', xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")

    # Add static pages
    for page in STATIC_PAGES:
        url_elem = ET.SubElement(root, 'url')
        loc = ET.SubElement(url_elem, 'loc')
        loc.text = page['loc']
        lastmod = ET.SubElement(url_elem, 'lastmod')
        lastmod.text = datetime.now().strftime('%Y-%m-%d')
        changefreq = ET.SubElement(url_elem, 'changefreq')
        changefreq.text = page['changefreq']
        priority = ET.SubElement(url_elem, 'priority')
        priority.text = str(page['priority'])

    # Add dynamic article pages
    for article in news_articles:
        article_id = article.get('id')
        published_at = article.get('published_at', datetime.now().isoformat())
        # Format date as YYYY-MM-DD
        try:
            pub_date = datetime.fromisoformat(published_at.replace('Z', '+00:00'))
            lastmod_str = pub_date.strftime('%Y-%m-%d')
        except:
            lastmod_str = datetime.now().strftime('%Y-%m-%d')

        url_elem = ET.SubElement(root, 'url')
        loc = ET.SubElement(url_elem, 'loc')
        loc.text = f"https://themoonr4.github.io/rasu/article.html?id={article_id}"
        lastmod = ET.SubElement(url_elem, 'lastmod')
        lastmod.text = lastmod_str
        changefreq = ET.SubElement(url_elem, 'changefreq')
        changefreq.text = 'daily'
        priority = ET.SubElement(url_elem, 'priority')
        # Newer articles get higher priority
        priority.text = '0.9' if article_id > 100 else '0.8'  # You can adjust logic

    # Convert to pretty XML
    xml_str = ET.tostring(root, encoding='unicode')
    pretty_xml = minidom.parseString(xml_str).toprettyxml(indent='  ')

    # Write to file
    with open('sitemap.xml', 'w', encoding='utf-8') as f:
        f.write(pretty_xml)

    print("✅ sitemap.xml generated successfully!")

if __name__ == "__main__":
    print("🔄 Fetching news from Supabase...")
    news = fetch_news()
    print(f"📰 Found {len(news)} articles.")
    generate_sitemap(news)
