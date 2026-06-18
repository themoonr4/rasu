// ==========================================
// THE MOON - Advanced Bot Protection System
// ==========================================
// Yeh code automatically bot detect karega
// Bina kisi existing code ko change kiye

(function() {
    'use strict';
    
    // Already loaded check
    if(window._THE_MOON_BOT_PROTECTION_LOADED) return;
    window._THE_MOON_BOT_PROTECTION_LOADED = true;
    
    // ==========================================
    // ALLOWED DOMAINS - NEVER BLOCK THESE
    // ==========================================
    const ALLOWED_DOMAINS = [
        'google-analytics.com',
        'googletagmanager.com',
        'posthog.com',
        'onesignal.com',
        'supabase.co',
        'pollinations.ai',
        'generativelanguage.googleapis.com'
    ];
    
    function isAnalyticsDomain(url) {
        if (!url) return false;
        return ALLOWED_DOMAINS.some(domain => url.includes(domain));
    }
    
    // ==========================================
    // Bot Detection - IMPROVED
    // ==========================================
    
    function isBot() {
        const ua = navigator.userAgent.toLowerCase();
        
        // 🔥 FIX: REAL DEVICES (Phone/Tablet/Desktop) ko kabhi bot mat mano
        // Common real device patterns
        const realDevicePatterns = [
            'android', 'iphone', 'ipad', 'ipod', 'windows', 'macintosh',
            'linux', 'chrome', 'firefox', 'safari', 'edge', 'opera',
            'mobile', 'tablet', 'phone', 'galaxy', 'pixel', 'miui'
        ];
        
        // Agar real device pattern match kare toh bot nahi hai
        if (realDevicePatterns.some(p => ua.includes(p))) {
            return false;
        }
        
        // Bot patterns - sirf pure bots ko catch karo
        const botPatterns = [
            'headless', 'phantom', 'selenium', 'puppeteer', 'playwright',
            'curl', 'wget', 'python-requests', 'java', 'okhttp',
            'scrapy', 'semrush', 'ahrefs', 'majestic', 'rogerbot',
            'dotbot', 'mj12bot', 'bingbot', 'googlebot', 'slurp',
            'duckduckbot', 'baiduspider', 'yandexbot', 'facebot',
            'facebookexternalhit', 'twitterbot', 'axios', 'postman'
        ];
        
        if(botPatterns.some(p => ua.includes(p))) return true;
        
        // Headless browser detection
        if(navigator.webdriver === true) return true;
        
        // Missing plugins (common in pure bots)
        if(navigator.plugins.length === 0) return true;
        
        // Tiny viewport
        if(window.screen.width < 100 || window.screen.height < 100) return true;
        
        return false;
    }
    
    // ==========================================
    // Bot Blocking - GA/PostHog/OneSignal SAFE
    // ==========================================
    
    // 🔥 CRITICAL FIX: GA script ko pehle load hone do, bot detection ke baad bhi
    // isBot() true hone par bhi GA ko block mat karo
    
    if(isBot()) {
        // Mark as bot (for server-side tracking)
        sessionStorage.setItem('_tm_is_bot', 'true');
        localStorage.setItem('_tm_bot_detected', Date.now().toString());
        
        // 🔥 FIX: GA को कभी block मत करो - पूरी तरह bypass करो
        // GA already loaded hai, isliye usko block mat karo
        
        // Disable OneSignal tracking BUT keep SDK loaded
        if(window.OneSignalDeferred) {
            window._tm_original_onesignal = window.OneSignalDeferred;
            // Keep it alive, don't override
        }
        
        // Prevent dataLayer from tracking (but keep GA intact)
        // Add attribute to body
        document.body.setAttribute('data-tm-bot', 'true');
        
        // Console log suppress (optional)
        console.log = function() {};
        
        // 🔥 CRITICAL: GA को पूरी तरह bypass करो - return mat karo
        // return; // ← YEH LINE HATAAO! GA ko block karta hai
    }
    
    // ==========================================
    // Human Verification
    // ==========================================
    
    let humanScore = 0;
    let isHuman = false;
    
    function addScore(points) {
        if(isHuman) return;
        humanScore += points;
        if(humanScore >= 30 && !isHuman) {
            isHuman = true;
            sessionStorage.setItem('_tm_is_human', 'true');
            sessionStorage.setItem('_tm_human_score', humanScore);
            document.body.setAttribute('data-tm-human', 'true');
            
            // Dispatch event for existing code
            window.dispatchEvent(new CustomEvent('tmHumanVerified', {
                detail: { score: humanScore }
            }));
        }
    }
    
    // Track human behaviors (once each)
    document.addEventListener('mousemove', () => addScore(10), { once: true });
    document.addEventListener('scroll', () => addScore(15), { once: true });
    document.addEventListener('click', () => addScore(20), { once: true });
    document.addEventListener('keydown', () => addScore(10), { once: true });
    document.addEventListener('touchstart', () => addScore(15), { once: true });
    
    // Time-based verification
    setTimeout(() => addScore(25), 8000);
    
    // Visibility change
    document.addEventListener('visibilitychange', () => {
        if(document.visibilityState === 'visible') addScore(10);
    }, { once: true });
    
    // ==========================================
    // Rate Limiting (Silent) - GA को bypass
    // ==========================================
    
    const requestLog = new Map();
    
    window._tm_checkRateLimit = function(endpoint) {
        // 🔥 FIX: GA और analytics domains को rate limit से exempt करो
        if (isAnalyticsDomain(endpoint)) {
            return true; // Always allow analytics
        }
        
        const now = Date.now();
        const sessionId = sessionStorage.getItem('_tm_session_id') || 'anon';
        const key = `${endpoint}_${sessionId}`;
        
        if(!requestLog.has(key)) requestLog.set(key, []);
        
        const requests = requestLog.get(key).filter(t => now - t < 60000);
        
        if(requests.length > 30) return false;
        
        requests.push(now);
        requestLog.set(key, requests);
        return true;
    };
    
    // Monitor fetch requests - GA को bypass
    const originalFetch = window.fetch;
    window.fetch = function() {
        const url = arguments[0];
        // 🔥 FIX: GA और analytics URLs को fetch से भी exempt करो
        if (typeof url === 'string' && isAnalyticsDomain(url)) {
            return originalFetch.apply(this, arguments);
        }
        if(!window._tm_checkRateLimit(url)) {
            return Promise.reject(new Error('Rate limit exceeded'));
        }
        return originalFetch.apply(this, arguments);
    };
    
    // ==========================================
    // Session ID (Unique per user)
    // ==========================================
    
    if(!sessionStorage.getItem('_tm_session_id')) {
        sessionStorage.setItem('_tm_session_id', 
            Math.random().toString(36).substring(2) + Date.now().toString(36)
        );
    }
    
    // ==========================================
    // Analytics Wrapper - GA को पूरी तरह allow करो
    // ==========================================
    
    if(window.gtag && !window._tm_gtag_wrapped) {
        window._tm_original_gtag = window.gtag;
        window._tm_gtag_wrapped = true;
        
        window.gtag = function() {
            const isRealUser = sessionStorage.getItem('_tm_is_human') === 'true';
            const isBotUser = sessionStorage.getItem('_tm_is_bot') === 'true';
            
            // 🔥 FIX: GA को हमेशा allow करो, बस bot flag add करो
            const args = Array.from(arguments);
            
            // Add human verification flag if real user
            if(isRealUser && !isBotUser) {
                if(args[0] === 'event' && args[2]) {
                    args[2].tm_human_verified = true;
                    args[2].tm_human_score = parseInt(sessionStorage.getItem('_tm_human_score') || '0');
                }
                window._tm_original_gtag.apply(this, args);
            } else if (isBotUser) {
                // Bots: GA को allow करो लेकिन bot flag के साथ
                if(args[0] === 'event' && args[2]) {
                    args[2].tm_is_bot = true;
                }
                window._tm_original_gtag.apply(this, args);
            } else {
                // Unknown users - allow GA
                window._tm_original_gtag.apply(this, args);
            }
        };
    }
    
    // ==========================================
    // Supabase Wrapper - GA को preserve करो
    // ==========================================
    
    const checkSupabase = setInterval(() => {
        if(window.supabaseClient || window.supabase) {
            clearInterval(checkSupabase);
            
            const supabaseObj = window.supabaseClient || window.supabase;
            
            if(supabaseObj && supabaseObj.from && !supabaseObj._tm_wrapped) {
                const originalFrom = supabaseObj.from;
                supabaseObj._tm_wrapped = true;
                
                supabaseObj.from = function(table) {
                    const query = originalFrom.call(this, table);
                    
                    if(query.insert && !query._tm_insert_wrapped) {
                        const originalInsert = query.insert;
                        query._tm_insert_wrapped = true;
                        
                        query.insert = function(data) {
                            // Bot data ko filter करो, GA को नहीं
                            if(sessionStorage.getItem('_tm_is_bot') === 'true') {
                                return Promise.resolve({ data: null, error: null });
                            }
                            return originalInsert.call(this, data);
                        };
                    }
                    
                    return query;
                };
            }
        }
    }, 100);
    
    // ==========================================
    // Optional: Log Clean Data (for admin)
    // ==========================================
    
    setTimeout(() => {
        if(sessionStorage.getItem('_tm_is_human') === 'true') {
            let realVisitors = JSON.parse(localStorage.getItem('_tm_real_visitors') || '[]');
            const today = new Date().toISOString().split('T')[0];
            
            if(!realVisitors.some(v => v.date === today && v.session === sessionStorage.getItem('_tm_session_id'))) {
                realVisitors.push({
                    date: today,
                    session: sessionStorage.getItem('_tm_session_id'),
                    score: sessionStorage.getItem('_tm_human_score'),
                    time: new Date().toISOString()
                });
                if(realVisitors.length > 3000) realVisitors = realVisitors.slice(-3000);
                localStorage.setItem('_tm_real_visitors', JSON.stringify(realVisitors));
            }
        }
    }, 10000);
    
    // ==========================================
    // Clean up old bot data periodically
    // ==========================================
    
    setInterval(() => {
        const botKeys = [];
        for(let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if(key && key.includes('_tm_bot_')) {
                const timestamp = parseInt(key.split('_').pop());
                if(Date.now() - timestamp > 86400000) {
                    botKeys.push(key);
                }
            }
        }
        botKeys.forEach(key => localStorage.removeItem(key));
    }, 3600000);
    
    // Console log for admin verification
    console.log('🛡️ THE MOON Bot Protection Active | GA/PostHog/OneSignal ALLOWED');
    
})();
