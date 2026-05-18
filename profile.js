const SUPABASE_URL = 'https://crmbbmwekdlfjgekjnll.supabase.co';
const SUPABASE_KEY = 'sb_publishable_kiBIIC7EYdIOuMUe4ss1Eg_DWDuK2kG';

const supabase = supabaseJs.createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { 'apikey': SUPABASE_KEY } }
});

let currentUser = null;

async function login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const msgDiv = document.getElementById('loginMsg');
    
    if(!email || !password) {
        msgDiv.innerHTML = '<div class="error">Enter email and password</div>';
        return;
    }
    
    msgDiv.innerHTML = '<div class="info">Connecting...</div>';
    
    let { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if(error && error.message.includes('Invalid login credentials')) {
        await supabase.auth.signUp({ email, password });
        const { data: retryData } = await supabase.auth.signInWithPassword({ email, password });
        data = retryData;
    } else if(error) {
        msgDiv.innerHTML = `<div class="error">${error.message}</div>`;
        return;
    }
    
    if(data?.user) {
        currentUser = data.user;
        await supabase.from('profiles').upsert({ id: currentUser.id, email: currentUser.email, full_name: currentUser.email.split('@')[0] });
        msgDiv.innerHTML = '<div class="success">✅ Login successful!</div>';
        document.getElementById('loginSection').classList.add('hide');
        document.getElementById('profileSection').classList.remove('hide');
        loadUserData();
    }
}

async function loadUserData() {
    if(!currentUser) return;
    
    document.getElementById('userName').innerText = localStorage.getItem('displayName') || currentUser.email.split('@')[0];
    document.getElementById('userEmail').innerText = currentUser.email;
    
    const { data: bookmarks } = await supabase.from('user_bookmarks').select('*, news(*)').eq('user_id', currentUser.id);
    const { data: history } = await supabase.from('reading_history').select('*, news(*)').eq('user_id', currentUser.id);
    const streak = localStorage.getItem('readingStreak') || 0;
    
    document.getElementById('bookmarkCount').innerText = bookmarks?.length || 0;
    document.getElementById('historyCount').innerText = history?.length || 0;
    document.getElementById('readingStreak').innerText = streak;
    
    document.getElementById('bookmarksList').innerHTML = (!bookmarks || bookmarks.length === 0) ? '<div class="info">No bookmarks yet</div>' : bookmarks.map(b => `
        <div class="bookmark-item" onclick="location.href='/rasu/article.html?id=${b.news.id}'">
            📰 ${b.news.title}
            <div style="font-size:12px; color:var(--text-sec);">${new Date(b.created_at).toLocaleDateString()}</div>
        </div>
    `).join('');
    
    document.getElementById('historyList').innerHTML = (!history || history.length === 0) ? '<div class="info">No reading history yet</div>' : history.map(h => `
        <div class="history-item" onclick="location.href='/rasu/article.html?id=${h.news.id}'">
            📖 ${h.news.title}
            <div style="font-size:12px; color:var(--text-sec);">${new Date(h.read_at).toLocaleDateString()}</div>
        </div>
    `).join('');
    
    document.getElementById('displayName').value = localStorage.getItem('displayName') || '';
    document.getElementById('themeSelect').value = localStorage.getItem('theme') || 'dark';
}

function showTab(tab) {
    document.getElementById('bookmarksTab').classList.add('hide');
    document.getElementById('historyTab').classList.add('hide');
    document.getElementById('settingsTab').classList.add('hide');
    if(tab === 'bookmarks') document.getElementById('bookmarksTab').classList.remove('hide');
    if(tab === 'history') document.getElementById('historyTab').classList.remove('hide');
    if(tab === 'settings') document.getElementById('settingsTab').classList.remove('hide');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
}

function updateProfile() {
    const name = document.getElementById('displayName').value;
    const theme = document.getElementById('themeSelect').value;
    localStorage.setItem('displayName', name);
    localStorage.setItem('theme', theme);
    document.getElementById('userName').innerText = name || currentUser.email.split('@')[0];
    if(theme === 'light') document.body.setAttribute('data-theme', 'light');
    else document.body.removeAttribute('data-theme');
    document.getElementById('settingsMsg').innerHTML = '<div class="success">Settings saved!</div>';
    setTimeout(() => document.getElementById('settingsMsg').innerHTML = '', 2000);
}

async function logout() {
    await supabase.auth.signOut();
    currentUser = null;
    document.getElementById('loginSection').classList.remove('hide');
    document.getElementById('profileSection').classList.add('hide');
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
}

function toggleTheme() {
    if(document.body.hasAttribute('data-theme')) {
        document.body.removeAttribute('data-theme');
        localStorage.setItem('theme', 'dark');
    } else {
        document.body.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
    }
}

document.getElementById('themeToggle').addEventListener('click', toggleTheme);
if(localStorage.getItem('theme') === 'light') document.body.setAttribute('data-theme', 'light');

supabase.auth.getSession().then(({ data }) => {
    if(data.session) {
        currentUser = data.session.user;
        document.getElementById('loginSection').classList.add('hide');
        document.getElementById('profileSection').classList.remove('hide');
        loadUserData();
    }
});
