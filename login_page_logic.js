
// login_page_logic.js - منطق برای صفحه ورود و ثبت نام
import { signInUser, signUpUser } from './auth.js';

// DOM Elements
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const showSignupLink = document.getElementById('show-signup');
const showLoginLink = document.getElementById('show-login');

const messageBox = document.getElementById('message-box');
const messageText = document.getElementById('message-text');
const messageOkBtn = document.getElementById('message-ok-btn');

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
    const email = loginForm.elements['email'].value;
    const password = loginForm.elements['password'].value;

    const user = await signInUser(email, password);
    if (user) {
        showMessage('ورود موفقیت‌آمیز! در حال انتقال به میدان بتل...', () => {
            window.location.href = 'index.html'; // ریدایرکت به صفحه اصلی بتل
        });
    } else {
        showMessage('ورود ناموفق. لطفاً ایمیل و رمز عبور خود را بررسی کنید.');
    }
});

signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = signupForm.elements['signup-email'].value;
    const username = signupForm.elements['signup-username'].value;
    const password = signupForm.elements['signup-password'].value;

    const user = await signUpUser(email, password, username);
    if (user) {
        showMessage('ثبت نام موفقیت‌آمیز! لطفاً وارد شوید.', () => {
            loginForm.classList.remove('hidden');
            signupForm.classList.add('hidden');
            loginForm.reset(); // پاک کردن فرم ورود
            signupForm.reset(); // پاک کردن فرم ثبت نام
        });
    } else {
        showMessage('ثبت نام ناموفق. لطفاً اطلاعات را بررسی کنید.');
    }
});

showSignupLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.classList.add('hidden');
    signupForm.classList.remove('hidden');
});

showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    signupForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
});

messageOkBtn.addEventListener('click', hideMessageBox);

// بررسی اولیه نشست در هنگام بارگذاری صفحه ورود
// اگر کاربر قبلاً وارد شده باشد، او را مستقیماً به صفحه بتل هدایت کنید.
document.addEventListener('DOMContentLoaded', async () => {
    const { getSession } = await import('./auth.js'); // ایمپورت دینامیک برای جلوگیری از بارگذاری زودرس
    const session = await getSession();
    if (session) {
        console.log("login_page_logic.js: Session found, redirecting to battles index.");
        window.location.href = 'index.html'; // اگر کاربر لاگین بود، به صفحه اصلی بتل هدایت شود
    }
});

