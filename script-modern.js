// ===== CONFIGURATION =====
const SUPABASE_URL = 'https://crmbbmwekdlfjgekjnll.supabase.co';
const SUPABASE_KEY = 'sb_publishable_kiBIIC7EYdIOuMUe4ss1Eg_DWDuK2kG';

// Initialize Supabase
const supabase = window.supabaseJs.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== STATE MANAGEMENT =====
let appState = {
  currentCategory: 'news',
  allNews: [],
  categories: [],
  currentUser: null,
  isDarkMode: localStorage.getItem('theme') === 'dark',
  searchTerm: ''
};

// ===== INITIALIZATION =====
async function initializeApp() {
  console.log('🚀 Initializing THE MOON platform...');
  
  // Initialize AOS (Animate On Scroll)
  AOS.init({
    duration: 600,
    easing: 'ease-in-out',
    once: true,
    offset: 100
  });
  
  // Load data
  await Promise.all([
    loadCategories(),
    loadNews(),
    loadTrending(),
    checkAuthentication()
  ]);
  
  // Setup event listeners
  setupEventListeners();
  setupThemeToggle();
  setupSearch();
  setupMobileMenu();
  
  console.log('✅ THE MOON platform initialized successfully!');
}

// ===== DATA LOADING =====
async function loadCategories() {
  try {
    const { data: categories } = await supabase
      .from('categories')
      .select('*')
      .limit(10);
    
    appState.categories = categories || [];
    console.log('📂 Categories loaded:', appState.categories.length);
  } catch (error) {
    console.error('❌ Error loading categories:', error);
  }
}

async function loadNews() {
  try {
    const newsGrid = document.getElementById('newsGrid');
    if (!newsGrid) return;
    
    // Show loader
    newsGrid.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
    
    let query = supabase.from('news').select('*');
    
    if (appState.currentCategory !== 'all') {
      const category = appState.categories.find(c => c.slug === appState.currentCategory);
      if (category) {
        query = supabase.from('news')
          .select('*')
          .eq('category_id', category.id);
      }
    }
    
    const { data: news } = await query.order('created_at', { ascending: false }).limit(20);
    const publishedNews = (news || []).filter(n => n.status === 'published' || !n.status);
    
    appState.allNews = publishedNews;
    
    if (publishedNews.length === 0) {
      newsGrid.innerHTML = '<div class="loader-container"><p>No news available yet</p></div>';
      return;
    }
    
    // Render news cards
    newsGrid.innerHTML = publishedNews.map((article, index) => `
      <article class="news-card" data-aos="fade-up" data-aos-delay="${index * 50}" onclick="openArticle('${article.id}')">
        ${article.featured_image ? `
          <img src="${escapeHtml(article.featured_image)}" alt="${escapeHtml(article.title)}" loading="lazy" onerror="this.style.display='none'">
        ` : '<div style="background: linear-gradient(135deg, #8b5cf6, #ec4899); width: 200px; height: 150px; display: flex; align-items: center; justify-content: center; color: white; font-size: 3rem;"><i class="fas fa-newspaper"></i></div>'}
        <div class="news-content">
          <span class="news-category">${getCategoryName(article.category_id)}</span>
          <h3 class="news-title">${escapeHtml(article.title)}</h3>
          <p class="news-excerpt">${escapeHtml((article.excerpt || article.content || '').substring(0, 120))}...</p>
          <div class="news-meta">
            <span><i class="fas fa-calendar"></i> ${formatDate(article.published_at || article.created_at)}</span>
            <span><i class="fas fa-eye"></i> ${article.views || 0} views</span>
            <span><i class="fas fa-clock"></i> ${Math.ceil((article.content?.length || 500) / 1000)} min</span>
          </div>
        </div>
      </article>
    `).join('');
    
    console.log('📰 News loaded:', publishedNews.length);
  } catch (error) {
    console.error('❌ Error loading news:', error);
  }
}

async function loadTrending() {
  try {
    const trendingList = document.getElementById('trendingList');
    if (!trendingList) return;
    
    const { data: news } = await supabase
      .from('news')
      .select('*')
      .order('views', { ascending: false })
      .limit(5);
    
    const trending = (news || []).filter(n => n.status === 'published' || !n.status);
    
    trendingList.innerHTML = trending.map((item, index) => `
      <div class="trending-item" onclick="openArticle('${item.id}')" data-aos="fade-left" data-aos-delay="${index * 100}">
        <div class="trending-rank">#${index + 1}</div>
        <div class="trending-title">${escapeHtml(item.title)}</div>
        <div class="trending-views"><i class="fas fa-fire"></i> ${item.views || 0} views</div>
      </div>
    `).join('');
    
    console.log('🔥 Trending loaded:', trending.length);
  } catch (error) {
    console.error('❌ Error loading trending:', error);
  }
}

async function loadTicker() {
  try {
    const tickerContent = document.getElementById('tickerContent');
    if (!tickerContent) return;
    
    const { data: news } = await supabase
      .from('news')
      .select('title')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (news && news.length > 0) {
      const tickerText = news.map(n => escapeHtml(n.title)).join(' • ');
      tickerContent.innerHTML = `🔴 LIVE | ${tickerText} | `;
    }
    
    console.log('📡 Ticker updated');
  } catch (error) {
    console.error('❌ Error loading ticker:', error);
  }
}

// ===== USER FUNCTIONS =====
async function checkAuthentication() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      appState.currentUser = session.user;
      console.log('👤 User logged in:', session.user.email);
    }
  } catch (error) {
    console.error('❌ Auth check error:', error);
  }
}

// ===== NEWSLETTER SUBSCRIPTION =====
async function subscribeNewsletter(event) {
  event.preventDefault();
  
  const email = document.getElementById('newsletterEmail').value;
  const msgDiv = document.getElementById('newsletterMsg');
  
  if (!email) {
    showMessage(msgDiv, '❌ Please enter your email', 'error');
    return;
  }
  
  try {
    const { error } = await supabase
      .from('newsletter')
      .insert([{ email, subscribed_at: new Date() }]);
    
    if (error && error.code === '23505') {
      showMessage(msgDiv, '⚠️ Already subscribed!', 'warning');
    } else if (error) {
      showMessage(msgDiv, '❌ Subscription failed', 'error');
    } else {
      showMessage(msgDiv, '✅ Thanks for subscribing!', 'success');
      document.getElementById('newsletterEmail').value = '';
    }
  } catch (error) {
    console.error('❌ Newsletter error:', error);
    showMessage(msgDiv, '❌ Error occurred', 'error');
  }
}

function showMessage(element, message, type) {
  element.innerHTML = `<div class="message message-${type}">${message}</div>`;
  setTimeout(() => {
    element.innerHTML = '';
  }, 3000);
}

// ===== UTILITY FUNCTIONS =====
function getCategoryName(categoryId) {
  const category = appState.categories.find(c => c.id === categoryId);
  return category ? category.name : 'News';
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function openArticle(articleId) {
  window.location.href = `/rasu/article.html?id=${articleId}`;
}

function filterByCategory(category) {
  appState.currentCategory = category;
  loadNews();
  document.querySelectorAll('[data-cat]').forEach(el => {
    el.classList.remove('active');
    if (el.getAttribute('data-cat') === category) {
      el.classList.add('active');
    }
  });
}

function scrollToSection(sectionId) {
  const element = document.getElementById(sectionId + 'Grid');
  if (element) {
    element.scrollIntoView({ behavior: 'smooth' });
  }
}

// ===== THEME TOGGLE =====
function setupThemeToggle() {
  const themeToggle = document.getElementById('themeToggle');
  if (!themeToggle) return;
  
  // Set initial state
  updateThemeIcon();
  
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = current === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    appState.isDarkMode = newTheme === 'dark';
    updateThemeIcon();
    
    console.log('🌙 Theme changed to:', newTheme);
  });
}

function updateThemeIcon() {
  const icon = document.getElementById('themeToggle')?.querySelector('i');
  if (icon) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
  }
}

// ===== SEARCH FUNCTIONALITY =====
function setupSearch() {
  const searchBtn = document.getElementById('searchBtn');
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');
  
  if (!searchBtn || !searchInput) return;
  
  // Toggle search input
  searchBtn.addEventListener('click', () => {
    searchInput.classList.toggle('active');
    if (searchInput.classList.contains('active')) {
      searchInput.focus();
    }
  });
  
  // Live search
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const term = searchInput.value.toLowerCase();
    
    if (term.length < 2) {
      searchResults.classList.remove('active');
      return;
    }
    
    searchTimeout = setTimeout(() => {
      const filtered = appState.allNews.filter(n => 
        n.title.toLowerCase().includes(term) ||
        (n.excerpt || '').toLowerCase().includes(term)
      );
      
      if (filtered.length > 0) {
        searchResults.innerHTML = filtered.slice(0, 5).map(n => `
          <div class="search-result-item" onclick="openArticle('${n.id}')">
            <div style="font-weight: 600;">${escapeHtml(n.title)}</div>
            <div style="font-size: 0.85rem; color: var(--text-tertiary);">${getCategoryName(n.category_id)}</div>
          </div>
        `).join('');
        searchResults.classList.add('active');
      } else {
        searchResults.classList.remove('active');
      }
    }, 300);
  });
  
  // Close search on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
      searchResults.classList.remove('active');
    }
  });
}

// ===== MOBILE MENU =====
function setupMobileMenu() {
  const menuBtn = document.getElementById('menuBtn');
  const closeSidebar = document.getElementById('closeSidebar');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  
  if (!menuBtn || !sidebar) return;
  
  // Open menu
  menuBtn.addEventListener('click', () => {
    sidebar.classList.add('open');
    overlay.classList.add('active');
  });
  
  // Close menu
  const closeMenu = () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  };
  
  if (closeSidebar) {
    closeSidebar.addEventListener('click', closeMenu);
  }
  
  overlay.addEventListener('click', closeMenu);
  
  // Close menu on link click
  document.querySelectorAll('.sidebar-nav a, .sidebar-nav button').forEach(link => {
    link.addEventListener('click', () => {
      setTimeout(closeMenu, 100);
    });
  });
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
  // Category filters
  document.querySelectorAll('[data-cat]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (el.tagName !== 'INPUT') {
        e.preventDefault();
        const category = el.getAttribute('data-cat');
        filterByCategory(category);
      }
    });
  });
  
  // Quick access cards
  document.querySelectorAll('.qa-card').forEach(card => {
    card.addEventListener('click', () => {
      const index = Array.from(card.parentElement.children).indexOf(card);
      const categories = ['news', 'study', 'jobs', 'freelance'];
      filterByCategory(categories[index] || 'news');
    });
  });
  
  // Notifications
  const notifyBtn = document.getElementById('notifyBtn');
  if (notifyBtn) {
    notifyBtn.addEventListener('click', () => {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            new Notification('Notifications Enabled', {
              body: 'You will now receive updates about breaking news!',
              icon: '/rasu/icon-192.png'
            });
          }
        });
      }
    });
  }
}

// ===== PERFORMANCE OPTIMIZATION =====
// Lazy load images
if ('IntersectionObserver' in window) {
  const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.classList.remove('lazy');
        imageObserver.unobserve(img);
      }
    });
  });
  
  document.querySelectorAll('img[data-src]').forEach(img => imageObserver.observe(img));
}

// PWA Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/rasu/sw.js').catch(err => console.log('SW registration failed:', err));
}

// ===== START APP =====
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// Periodic refresh
setInterval(loadNews, 5 * 60 * 1000); // Refresh every 5 minutes
setInterval(loadTrending, 10 * 60 * 1000); // Refresh trending every 10 minutes