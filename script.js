// Supabase Configuration
const SUPABASE_URL = 'https://crmbbmwekdlfjgekjnll.supabase.co';
const SUPABASE_KEY = 'sb_publishable_kiBIIC7EYdIOuMUe4ss1Eg_DWDuK2kG';

const supabase = supabaseJs.createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { 'apikey': SUPABASE_KEY } }
});

// Global Variables
let currentCat = 'all';
let allNews = [];
let categories = [];
let currentUser = null;

// Initialize
async function init() {
    await loadCategories();
    await loadNews();
    await loadTrending();
    await loadAIPicks();
    await loadTicker();
    await checkAuth();
    setupEventListeners();
    setupPWA();
}

// Load Categories
async function loadCategories() {
    const { data: cats } = await supabase.from('categories').select('*');
    categories = cats || [];
    
    const grid = document.getElementById('categoryGrid');
    if(categories.length > 0) {
        grid.innerHTML = categories.map(cat => `
            <div class="category-card" data-cat="${cat.slug}">
                <i>${cat.icon || '📰'}</i>
                <div>${cat.name}</div>
            </div>
        `).join('');
    }
}

// Load News
async function loadNews() {
    const grid = document.getElementById('newsGrid');
    grid.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
    
    try {
        let query = supabase.from('news').select('*');
        if(currentCat !== 'all') {
            const cat = categories.find(c => c.slug === currentCat);
            if(cat) query = supabase.from('news').select('*').eq('category_id', cat.id);
        }
        
        const { data: news } = await query;
        const publishedNews = (news || []).filter(n => n.status === 'published' || !n.status);
        
        if(publishedNews.length === 0) {
            grid.innerHTML = '<div class="loader">📭 No news yet</div>';
            return;
        }
        
        allNews = publishedNews;
        
        grid.innerHTML = publishedNews.map(article => `
            <div class="news-card" onclick="location.href='/rasu/article.html?id=${article.id}'">
                ${article.featured_image ? `<img class="news-image" src="${article.featured_image}" loading="lazy" onerror="this.style.display='none'">` : ''}
                <div class="news-content">
                    <span class="news-cat">${categories.find(c => c.id == article.category_id)?.name || 'News'}</span>
                    <h3 class="news-title">${escapeHtml(article.title)}</h3>
                    <p class="news-excerpt">${escapeHtml((article.excerpt || article.content || '').substring(0, 120))}...</p>
                    <div class="news-meta">
                        <span>📅 ${new Date(article.published_at || article.created_at).toLocaleDateString()}</span>
                        <span>👁️ ${article.views || 0} views</span>
                        <span>⏱️ ${Math.ceil((article.content?.length || 500) / 1000)} min read</span>
                    </div>
                </div>
            </div>
        `).join('');
        
    } catch(e) { console.error(e); }
}

// Load Trending
async function loadTrending() {
    const { data: news } = await supabase.from('news').select('*');
    const publishedNews = (news || []).filter(n => n.status === 'published' || !n.status);
    const trending = [...publishedNews].sort((a,b) => (b.views||0) - (a.views||0)).slice(0,5);
    
    document.getElementById('trendingList').innerHTML = trending.map((item,i) => `
        <div class="trending-item" onclick="location.href='/rasu/article.html?id=${item.id}'">
            <div style="color:var(--red); font-weight:bold;">#${i+1}</div>
            <div>${escapeHtml(item.title)}</div>
            <div style="font-size:11px; color:var(--text-sec);">👁️ ${item.views || 0} views</div>
        </div>
    `).join('');
}

// Load AI Picks
async function loadAIPicks() {
    const { data: news } = await supabase.from('news').select('*');
    const publishedNews = (news || []).filter(n => n.status === 'published' || !n.status);
    const aiPicks = [...publishedNews].sort((a,b) => (b.views||0) - (a.views||0)).slice(0,3);
    
    document.getElementById('aiPicks').innerHTML = aiPicks.map(item => `
        <div class="trending-item" onclick="location.href='/rasu/article.html?id=${item.id}'">
            🤖 ${escapeHtml(item.title)}
        </div>
    `).join('');
}

// Load Ticker
async function loadTicker() {
    const { data: news } = await supabase.from('news').select('title').limit(5);
    if(news && news.length > 0) {
        document.getElementById('tickerContent').innerHTML = '🔴 LIVE | ' + news.map(n => n.title).join(' | ') + ' | ';
    }
}

// Search Functionality
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
    
    searchInput.addEventListener('input', () => {
        const term = searchInput.value.toLowerCase();
        if(term.length < 2) {
            searchResults.classList.remove('active');
            return;
        }
        
        const filtered = allNews.filter(n => n.title.toLowerCase().includes(term));
        if(filtered.length > 0) {
            searchResults.innerHTML = filtered.slice(0,5).map(n => `
                <div class="search-result-item" onclick="location.href='/rasu/article.html?id=${n.id}'">
                    ${escapeHtml(n.title)}
                </div>
            `).join('');
            searchResults.classList.add('active');
        } else {
            searchResults.classList.remove('active');
        }
    });
    
    document.addEventListener('click', (e) => {
        if(!searchInput.contains(e.target)) {
            searchResults.classList.remove('active');
        }
    });
}

// Newsletter Subscription
async function subscribeNewsletter() {
    const email = document.getElementById('newsletterEmail').value;
    const msgDiv = document.getElementById('newsletterMsg');
    
    if(!email) {
        msgDiv.innerHTML = '<div style="color:#dc3545;">Enter email</div>';
        setTimeout(() => msgDiv.innerHTML = '', 3000);
        return;
    }
    
    const { error } = await supabase.from('newsletter').insert({ email, subscribed_at: new Date() });
    
    if(error && error.code === '23505') {
        msgDiv.innerHTML = '<div style="color:#ffc107;">Already subscribed!</div>';
    } else if(error) {
        msgDiv.innerHTML = '<div style="color:#dc3545;">Failed</div>';
    } else {
        msgDiv.innerHTML = '<div style="color:#28a745;">✅ Subscribed!</div>';
        document.getElementById('newsletterEmail').value = '';
    }
    setTimeout(() => msgDiv.innerHTML = '', 3000);
}

// Check Auth
async function checkAuth() {
    const { data } = await supabase.auth.getSession();
    if(data.session) {
        currentUser = data.session.user;
        document.getElementById('profileLink').innerHTML = `<i class="fas fa-user-check"></i>`;
    }
}

// Escape HTML
function escapeHtml(text) {
    if(!text) return '';
    return text.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// Sidebar
function setupSidebar() {
    const menuBtn = document.getElementById('menuBtn');
    const closeSidebar = document.getElementById('closeSidebar');
    const overlay = document.getElementById('overlay');
    const sidebar = document.getElementById('sidebar');
    
    menuBtn.onclick = () => {
        sidebar.classList.add('open');
        overlay.classList.add('active');
    };
    closeSidebar.onclick = () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    };
    overlay.onclick = () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    };
}

// Theme Toggle
function setupTheme() {
    const savedTheme = localStorage.getItem('theme');
    if(savedTheme === 'light') {
        document.body.setAttribute('data-theme', 'light');
        document.getElementById('themeToggle').innerHTML = '<i class="fas fa-sun"></i>';
    }
    
    document.getElementById('themeToggle').onclick = () => {
        if(document.body.hasAttribute('data-theme')) {
            document.body.removeAttribute('data-theme');
            localStorage.setItem('theme', 'dark');
            document.getElementById('themeToggle').innerHTML = '<i class="fas fa-moon"></i>';
        } else {
            document.body.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
            document.getElementById('themeToggle').innerHTML = '<i class="fas fa-sun"></i>';
        }
    };
}

// Category Click Events
function setupCategoryEvents() {
    document.querySelectorAll('.category-card, .nav a, .bottom-nav a, .sidebar a').forEach(el => {
        if(el.hasAttribute('data-cat')) {
            el.onclick = (e) => {
                e.preventDefault();
                currentCat = el.getAttribute('data-cat');
                loadNews();
                document.querySelectorAll('.nav a, .bottom-nav a, .sidebar a').forEach(n => n.classList.remove('active'));
                el.classList.add('active');
                document.getElementById('sidebar').classList.remove('open');
                document.getElementById('overlay').classList.remove('active');
            };
        }
    });
}

// PWA Install
function setupPWA() {
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        const installBtn = document.getElementById('installApp');
        if(installBtn) {
            installBtn.style.display = 'block';
            installBtn.onclick = async () => {
                installBtn.style.display = 'none';
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                deferredPrompt = null;
            };
        }
    });
}

// Event Listeners
function setupEventListeners() {
    setupSidebar();
    setupTheme();
    setupSearch();
    setupCategoryEvents();
    
    document.getElementById('newsletterBtn').onclick = subscribeNewsletter;
    document.getElementById('notifyBtn').onclick = () => {
        if(window.OneSignalDeferred) {
            window.OneSignalDeferred.push(async function(OneSignal) {
                await OneSignal.Notifications.requestPermission();
                showToast('Notifications enabled!');
            });
        }
    };
}

// Toast
function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Start
init();
