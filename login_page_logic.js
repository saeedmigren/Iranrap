// login_page_logic.js - منطق برای نمایش لاگ‌ها روی صفحه و مدیریت فرم ورود

// وارد کردن توابع احراز هویت از auth.js
import { signInUser, signUpUser, getSession } from './auth_v2.js';

// DOM Elements
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const showSignupLink = document.getElementById('show-signup');
const showLoginLink = document.getElementById('show-login');

const messageBox = document.getElementById('message-box');
const messageText = document.getElementById('message-text');
const messageOkBtn = document.getElementById('message-ok-btn');

// --- On-screen Logging System ---
const logOutputDiv = document.getElementById('on-screen-log-output'); 

const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
const originalConsoleGroupCollapsed = console.groupCollapsed;
const originalConsoleGroupEnd = console.groupEnd;

let currentGroupElement = null; 

function appendLogToScreen(message, type = 'info', isGroupHeader = false, groupLabel = '') {
    if (!logOutputDiv) { 
        originalConsoleLog("Log div not found (fallback):", message);
        return;
    }
    const logElement = document.createElement('div');
    logElement.classList.add('log-message', `log-${type}`);
    logElement.textContent = message;

    if (isGroupHeader) {
        logElement.classList.add('log-group-header');
        logElement.textContent = groupLabel;
        const groupContentDiv = document.createElement('div');
        groupContentDiv.classList.add('log-group-content', 'hidden');
        logElement.appendChild(groupContentDiv);
        logElement.onclick = () => {
            groupContentDiv.classList.toggle('hidden');
        };
        if (currentGroupElement) {
            currentGroupElement.appendChild(logElement);
        } else {
            logOutputDiv.appendChild(logElement);
        }
        currentGroupElement = groupContentDiv;
    } else {
        if (currentGroupElement) {
            currentGroupElement.appendChild(logElement);
        } else {
            logOutputDiv.appendChild(logElement);
        }
    }
    logOutputDiv.scrollTop = logOutputDiv.scrollHeight;
}

console.log = function(...args) {
    originalConsoleLog.apply(this, args);
    appendLogToScreen(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '), 'info');
};

console.warn = function(...args) {
    originalConsoleWarn.apply(this, args);
    appendLogToScreen(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '), 'warn');
};

console.error = function(...args) {
    originalConsoleError.apply(this, args);
    appendLogToScreen(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '), 'error');
};

console.groupCollapsed = function(label) {
    originalConsoleGroupCollapsed.apply(this, [label]);
    appendLogToScreen('', 'info', true, label);
};

console.groupEnd = function() {
    originalConsoleGroupEnd.apply(this);
    if (currentGroupElement && currentGroupElement.parentElement && currentGroupElement.parentElement.closest('.log-group-content')) {
        currentGroupElement = currentGroupElement.parentElement.closest('.log-group-content');
    } else {
        currentGroupElement = null;
    }
};

console.log("On-screen logging system initialized for Login Page.");
// --- End On-screen Logging System ---


/**
 * Displays a custom message box.
 * @param {string} msg - The message to display.
 * @param {function} [onOkCallback] - Callback function to execute when OK button is clicked.
 */
function showMessage(msg, onOkCallback = null) {
    messageText.textContent = msg;
    messageBox.classList.add('visible');
    messageOkBtn.onclick = () => {
        hideMessageBox();
        if (onOkCallback) onOkCallback();
    };
}

/**
 * Hides the custom message box.
 */
function hideMessageBox() {
    messageBox.classList.remove('visible');
}

// Event Listeners
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (logOutputDiv) { 
        logOutputDiv.innerHTML = '<p class="text-lg font-semibold mb-2">خروجی لاگ:</p>';
    }
    console.log("--- تلاش برای ورود ---");

    const email = loginForm.elements['email'].value;
    const password = loginForm.elements['password'].value;

    console.log(`ایمیل: ${email}`);

    const result = await signInUser(email, password); // دریافت نتیجه (کاربر یا پیام خطا)
    if (typeof result === 'string') { // اگر نتیجه یک رشته (پیام خطا) بود
        const errorMessage = `ورود ناموفق: ${result}`; // نمایش پیام خطای دقیق
        console.error(errorMessage);
        showMessage(errorMessage);
    } else if (result) { // اگر نتیجه یک شیء کاربر بود (موفقیت)
        console.log(`ورود موفقیت‌آمیز برای کاربر ID: ${result.id}`);
        showMessage('ورود موفقیت‌آمیز! در حال انتقال به میدان بتل...', () => {
            window.location.href = 'index.html'; 
        });
    } else { // اگر null برگردانده شد (خطای نامشخص)
        const errorMessage = `ورود ناموفق. لطفاً ایمیل و رمز عبور خود را بررسی کنید.`;
        console.error(errorMessage);
        showMessage(errorMessage);
    }
});

signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (logOutputDiv) { 
        logOutputDiv.innerHTML = '<p class="text-lg font-semibold mb-2">خروجی لاگ:</p>';
    }
    console.log("--- تلاش برای ثبت نام ---");

    const email = signupForm.elements['signup-email'].value;
    const username = signupForm.elements['signup-username'].value;
    const password = signupForm.elements['signup-password'].value;

    console.log(`ایمیل: ${email}, نام کاربری: ${username}`);

    const result = await signUpUser(email, password, username); // دریافت نتیجه (کاربر یا پیام خطا)
    if (typeof result === 'string') { // اگر نتیجه یک رشته (پیام خطا) بود
        const errorMessage = `ثبت نام ناموفق: ${result}`; // نمایش پیام خطای دقیق
        console.error(errorMessage);
        showMessage(errorMessage);
    } else if (result) { // اگر نتیجه یک شیء کاربر بود (موفقیت)
        console.log(`ثبت نام موفقیت‌آمیز برای کاربر ID: ${result.id}`);
        showMessage('ثبت نام موفقیت‌آمیز! لطفاً وارد شوید.', () => {
            loginForm.classList.remove('hidden');
            signupForm.classList.add('hidden');
            loginForm.reset(); 
            signupForm.reset(); 
        });
    } else { // اگر null برگردانده شد (خطای نامشخص)
        const errorMessage = `ثبت نام ناموفق. لطفاً اطلاعات را بررسی کنید.`;
        console.error(errorMessage);
        showMessage(errorMessage);
    }
});

showSignupLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.classList.add('hidden');
    signupForm.classList.remove('hidden');
    if (logOutputDiv) { 
        logOutputDiv.innerHTML = '<p class="text-lg font-semibold mb-2">خروجی لاگ:</p>'; 
    }
});

showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    signupForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
    if (logOutputDiv) { 
        logOutputDiv.innerHTML = '<p class="text-lg font-semibold mb-2">خروجی لاگ:</p>'; 
    }
});

messageOkBtn.addEventListener('click', hideMessageBox);

document.addEventListener('DOMContentLoaded', async () => {
    console.log("login_page_logic.js: DOMContentLoaded. Checking session...");
    const session = await getSession(); 
    if (session) {
        console.log("login_page_logic.js: Session found, redirecting to battles index.");
        window.location.href = 'index.html'; 
    } else {
        console.log("login_page_logic.js: No active session found on login page.");
    }
});


