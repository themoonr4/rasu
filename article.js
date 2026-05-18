const SUPABASE_URL = 'https://crmbbmwekdlfjgekjnll.supabase.co';
const SUPABASE_KEY = 'sb_publishable_kiBIIC7EYdIOuMUe4ss1Eg_DWDuK2kG';

const supabase = supabaseJs.createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { 'apikey': SUPABASE_KEY } }
});

const urlParams = new URLSearchParams(window.location.search);
const articleId = urlParams.get('id');
let currentUser = null;
let isBookmarked = false;
let categories = [];

async function loadArticle() {
    if(!articleId) {
        document.getElementById('articleCard').innerHTML = '<div class="loader">No article found</div>';
        return;
    }
    
    await checkAuth();
    await loadCategories();
    
    const { data: article } = await supabase.from('news').select('*').eq('id', articleId).single();
    
    if(!article) {
        document.getElementById('articleCard').innerHTML = '<div class="loader">Article not found</div>';
        return;
    }
    
    await updateViewCount(articleId);
    await saveReadingHistory(articleId);
    await updateReadingStreak();
    isBookmarked = await checkBookmark();
    
    const category = categories.find(c => c.id == article.category_id);
    
    document.getElementById('articleCard').innerHTML = `
        <div class="article-card">
            <span class="article-cat">${category?.name || 'News'}</span>
            <h1 class="article-title">${escapeHtml(article.title)}</h1>
            <div class="article-meta">
                <span>📅 ${new Date(article.published_at || article.created_at).toLocaleDateString()}</span>
                <span>👁️ ${(article.views || 0) + 1} views</span>
                <span>⏱️ ${Math.ceil((article.content?.length || 500) / 1000)} min read</span>
            </div>
            ${article.featured_image ? `<img class="article-image" src="${article.featured_image}" onerror="this.style.display='none'">` : ''}
            <div class="article-content">${formatContent(article.content || article.excerpt || '')}</div>
            <div class="action-buttons">
                <button id="bookmarkBtn" class="action-btn" onclick="toggleBookmark()">${isBookmarked ? '✅ Bookmarked' : '🔖 Bookmark'}</button>
                <div class="share-dropdown">
                    <button class="action-btn" onclick="toggleShareDropdown()"><i class="fas fa-share-alt"></i> Share</button>
                    <div id="shareDropdown" class="share-content">
                        <a href="#" onclick="shareArticle('whatsapp');return false;"><i class="fab fa-whatsapp" style="color:#25D366;"></i> WhatsApp</a>
                        <a href="#" onclick="shareArticle('telegram');return false;"><i class="fab fa-telegram" style="color:#0088cc;"></i> Telegram</a>
                        <a href="#" onclick="shareArticle('twitter');return false;"><i class="fab fa-twitter" style="color:#1DA1F2;"></i> Twitter</a>
                        <a href="#" onclick="shareArticle('facebook');return false;"><i class="fab fa-facebook" style="color:#1877F2;"></i> Facebook</a>
                    </div>
                </div>
            </div>
            <div class="comments-section">
                <h3>💬 Comments (<span id="commentCount">0</span>)</h3>
                <div id="commentList"></div>
                <div class="add-comment">
                    <textarea id="commentContent" rows="3" placeholder="Write a comment..."></textarea>
                    <button onclick="postComment()">Post Comment</button>
                </div>
            </div>
        </div>
    `;
    
    if(isBookmarked) document.getElementById('bookmarkBtn').classList.add('bookmarked');
    loadComments();
}

async function loadCategories() {
    const { data } = await supabase.from('categories').select('*');
    categories = data || [];
}

async function checkAuth() {
    const { data } = await supabase.auth.getSession();
    if(data.session) currentUser = data.session.user;
}

async function checkBookmark() {
    if(!currentUser) return false;
    const { data } = await supabase.from('user_bookmarks').select('id').eq('user_id', currentUser.id).eq('news_id', articleId).single();
    return !!data;
}

async function toggleBookmark() {
    if(!currentUser) {
        alert('Please login to bookmark');
        window.location.href = '/rasu/profile.html';
        return;
    }
    
    if(isBookmarked) {
        await supabase.from('user_bookmarks').delete().eq('user_id', currentUser.id).eq('news_id', articleId);
        isBookmarked = false;
        showToast('Removed from bookmarks');
    } else {
        await supabase.from('user_bookmarks').insert({ user_id: currentUser.id, news_id: articleId });
        isBookmarked = true;
        showToast('Bookmarked!');
    }
    
    const btn = document.getElementById('bookmarkBtn');
    if(btn) {
        btn.innerHTML = isBookmarked ? '✅ Bookmarked' : '🔖 Bookmark';
        if(isBookmarked) btn.classList.add('bookmarked');
        else btn.classList.remove('bookmarked');
    }
}

async function updateViewCount(id) {
    const { data: article } = await supabase.from('news').select('views').eq('id', id).single();
    await supabase.from('news').update({ views: (article?.views || 0) + 1 }).eq('id', id);
}

async function saveReadingHistory(id) {
    if(!currentUser) return;
    await supabase.from('reading_history').upsert({ user_id: currentUser.id, news_id: id, read_at: new Date() });
}

async function updateReadingStreak() {
    if(!currentUser) return;
    const today = new Date().toDateString();
    const lastRead = localStorage.getItem('lastReadDate');
    let streak = parseInt(localStorage.getItem('readingStreak') || 0);
    
    if(lastRead !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        streak = lastRead === yesterday.toDateString() ? streak + 1 : 1;
        localStorage.setItem('readingStreak', streak);
        localStorage.setItem('lastReadDate', today);
        await supabase.from('profiles').upsert({ id: currentUser.id, reading_streak: streak });
    }
}

async function loadComments() {
    const { data } = await supabase.from('comments').select('*').eq('news_id', articleId).order('created_at', { ascending: false });
    const commentList = document.getElementById('commentList');
    const commentCount = document.getElementById('commentCount');
    if(commentCount) commentCount.innerText = data?.length || 0;
    
    if(!data || data.length === 0) {
        commentList.innerHTML = '<div style="text-align:center;padding:20px;">No comments yet</div>';
        return;
    }
    commentList.innerHTML = data.map(c => `
        <div class="comment-item">
            <div class="comment-name">${escapeHtml(c.user_name || 'Anonymous')}</div>
            <div class="comment-text">${escapeHtml(c.content)}</div>
            <div class="comment-date">${new Date(c.created_at).toLocaleDateString()}</div>
        </div>
    `).join('');
}

async function postComment() {
    if(!currentUser) {
        alert('Please login to comment');
        window.location.href = '/rasu/profile.html';
        return;
    }
    
    const content = document.getElementById('commentContent').value;
    if(!content.trim()) {
        alert('Please write a comment');
        return;
    }
    
    await supabase.from('comments').insert({
        news_id: articleId,
        user_id: currentUser.id,
        user_name: currentUser.email?.split('@')[0] || 'User',
        content: content
    });
    
    document.getElementById('commentContent').value = '';
    loadComments();
    showToast('Comment posted!');
}

function shareArticle(platform) {
    const url = encodeURIComponent(window.location.href);
    const title = encodeURIComponent(document.querySelector('.article-title')?.innerText || 'THE MOON News');
    let shareUrl = '';
    if(platform === 'whatsapp') shareUrl = `https://wa.me/?text=${title}%20${url}`;
    else if(platform === 'telegram') shareUrl = `https://t.me/share/url?url=${url}&text=${title}`;
    else if(platform === 'twitter') shareUrl = `https://twitter.com/intent/tweet?text=${title}&url=${url}`;
    else if(platform === 'facebook') shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
    if(shareUrl) window.open(shareUrl, '_blank');
    
    let shares = parseInt(localStorage.getItem('totalShares') || 0);
    localStorage.setItem('totalShares', shares + 1);
}

function toggleShareDropdown() {
    const dropdown = document.getElementById('shareDropdown');
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
}

function formatContent(content) {
    if(!content) return '<p>No content available</p>';
    return content.split('\n').filter(p => p.trim()).map(p => `<p>${escapeHtml(p)}</p>`).join('');
}

function escapeHtml(text) {
    if(!text) return '';
    return text.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Theme
const savedTheme = localStorage.getItem('theme');
if(savedTheme === 'light') document.body.setAttribute('data-theme', 'light');
document.getElementById('themeToggle').onclick = () => {
    if(document.body.hasAttribute('data-theme')) {
        document.body.removeAttribute('data-theme');
        localStorage.setItem('theme', 'dark');
    } else {
        document.body.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
    }
};

document.addEventListener('click', (e) => {
    if(!e.target.closest('.share-dropdown')) {
        const dropdown = document.getElementById('shareDropdown');
        if(dropdown) dropdown.style.display = 'none';
    }
});

loadArticle();
