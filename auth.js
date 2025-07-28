// auth.js - توابع مربوط به احراز هویت کاربر و مدیریت نشست با لاگ‌های دیباگ جامع

console.log("auth.js: Script loaded successfully."); // <--- لاگ جدید برای بررسی بارگذاری

// پیکربندی و ایجاد کلاینت Supabase
const SUPABASE_URL = 'https://qdzypwmrrcelmhsywpdo.supabase.co'; // این URL پروژه شماست
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFdenlwd21ycmNlbG1oc3l3cGRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4MjY5NzcsImV4cCI6MjA2ODQwMjk3N30.KQfe9cUbJuoYC_vnfRMUIMuf0_oBadNuzEIxwGjT0Wo'; // این کلید anon public شماست

console.log("auth.js: Initializing Supabase client...");
console.log("auth.js: Using SUPABASE_URL:", SUPABASE_URL);
console.log("auth.js: Using SUPABASE_ANON_KEY (first 10 chars):", SUPABASE_ANON_KEY.substring(0, 10) + "...");

// ایجاد کلاینت Supabase - این متغیر 'supabase' اکنون در این ماژول تعریف شده است.
// توجه: 'window.supabase.createClient' فرض می‌کند که Supabase SDK قبلاً بارگذاری شده است.
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log("auth.js: Supabase client initialized.");

/**
 * دریافت نشست فعلی کاربر.
 * @returns {Promise<object|null>} شیء نشست کاربر یا null در صورت عدم وجود نشست.
 */
async function getSession() {
    console.groupCollapsed("auth.js: getSession called"); // شروع گروه لاگ
    console.log("auth.js: Attempting to retrieve current session from Supabase...");
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
            console.error("auth.js: ERROR getting session:", error.message, "Details:", error);
            console.groupEnd(); // پایان گروه لاگ
            return null;
        }
        
        if (session) {
            console.log("auth.js: Session found. User ID:", session.user.id, "Expires at:", new Date(session.expires_at * 1000).toLocaleString());
            console.log("auth.js: Full session data:", session);
        } else {
            console.log("auth.js: No active session found.");
        }
        
        console.groupEnd(); // پایان گروه لاگ
        return session;
    } catch (e) {
        console.error("auth.js: UNEXPECTED ERROR in getSession:", e.message, "Stack:", e.stack);
        console.groupEnd(); // پایان گروه لاگ
        return null;
    }
}

/**
 * دریافت پروفایل کاربر فعلی از پایگاه داده.
 * این تابع فرض می‌کند که یک جدول 'users' با 'id' مطابق با 'user.id' از Supabase وجود دارد.
 * @returns {Promise<object|null>} شیء پروفایل کاربر یا null در صورت عدم یافتن.
 */
async function getCurrentUserProfile() {
    console.groupCollapsed("auth.js: getCurrentUserProfile called"); // شروع گروه لاگ
    console.log("auth.js: Attempting to fetch current user profile...");
    try {
        const session = await getSession(); // فراخوانی getSession
        console.log("auth.js: getSession returned:", session ? "active session" : "no session");

        if (!session) {
            console.warn("auth.js: No session available, cannot fetch user profile.");
            console.groupEnd(); // پایان گروه لاگ
            return null;
        }

        const userId = session.user.id;
        console.log(`auth.js: Session found. Fetching profile for user ID: ${userId} from 'users' table using supabase instance...`);
        const { data: profile, error } = await supabase.from('users').select('*').eq('id', userId).single();

        if (error) {
            console.error("auth.js: ERROR fetching current user profile:", error.message, "Details:", error);
            // PGRST116 به معنای "No rows found" است، که در این مورد طبیعی است اگر پروفایل وجود نداشته باشد
            if (error.code === 'PGRST116') {
                console.warn(`auth.js: No profile found in 'users' table for user ID: ${userId}.`);
            }
            console.groupEnd(); // پایان گروه لاگ
            return null;
        }
        
        console.log("auth.js: Current user profile fetched successfully:", profile);
        console.groupEnd(); // پایان گروه لاگ
        return profile;
    } catch (e) {
        console.error("auth.js: UNEXPECTED ERROR in getCurrentUserProfile:", e.message, "Stack:", e.stack);
        console.groupEnd(); // پایان گروه لاگ
        return null;
    }
}

/**
 * ورود کاربر با ایمیل و رمز عبور.
 * @param {string} email - ایمیل کاربر.
 * @param {string} password - رمز عبور کاربر.
 * @returns {Promise<object|null>} شیء کاربر یا null در صورت خطا.
 */
async function signInUser(email, password) {
    console.groupCollapsed("auth.js: signInUser called"); // شروع گروه لاگ
    console.log(`auth.js: Attempting to sign in user with email: ${email}`);
    // رمز عبور را لاگ نکنید!
    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            console.error("auth.js: ERROR during sign in:", error.message, "Details:", error);
            console.groupEnd(); // پایان گروه لاگ
            return null;
        }
        
        if (data && data.user) {
            console.log("auth.js: User signed in successfully. User ID:", data.user.id);
            console.log("auth.js: Full user data after sign in:", data.user);
            console.log("auth.js: Session data after sign in:", data.session);
        } else {
            console.warn("auth.js: Sign in completed, but no user data returned. This might indicate an issue.");
            console.log("auth.js: Raw data from Supabase:", data);
        }
        
        console.groupEnd(); // پایان گروه لاگ
        return data.user;
    } catch (e) {
        console.error("auth.js: UNEXPECTED ERROR in signInUser:", e.message, "Stack:", e.stack);
        console.groupEnd(); // پایان گروه لاگ
        return null;
    }
}

/**
 * ثبت نام کاربر جدید با ایمیل و رمز عبور.
 * @param {string} email - ایمیل کاربر.
 * @param {string} password - رمز عبور کاربر.
 * @param {string} username - نام کاربری.
 * @returns {Promise<object|null>} شیء کاربر یا null در صورت خطا.
 */
async function signUpUser(email, password, username) {
    console.groupCollapsed("auth.js: signUpUser called"); // شروع گروه لاگ
    console.log(`auth.js: Attempting to sign up new user: ${username} with email: ${email}`);
    try {
        // مرحله 1: ثبت نام در Supabase Auth
        console.log("auth.js: Calling supabase.auth.signUp...");
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { username: username }
            }
        });

        if (error) {
            console.error("auth.js: ERROR during Supabase signUp:", error.message, "Details:", error);
            console.groupEnd(); // پایان گروه لاگ
            return null;
        }

        if (!data || !data.user) {
            console.warn("auth.js: Supabase signUp completed, but no user data returned. This might indicate an issue.");
            console.log("auth.js: Raw data from Supabase signUp:", data);
            console.groupEnd(); // پایان گروه لاگ
            return null;
        }

        console.log("auth.js: User successfully signed up in Supabase Auth. User ID:", data.user.id);
        console.log("auth.js: Full user data from signUp:", data.user);

        console.log(`auth.js: Creating user profile in 'users' table for user ID: ${data.user.id} using supabase instance...`);
        const { error: profileError } = await supabase.from('users').insert({
            id: data.user.id,
            email: data.user.email,
            username: username,
            level: 1,
            xp: 0,
            rapCoins: 0,
            profilePictureUrl: ''
        });

        if (profileError) {
            console.error("auth.js: ERROR creating user profile in 'users' table:", profileError.message, "Details:", profileError);
            console.groupEnd(); // پایان گروه لاگ
            return null;
        }
        
        console.log("auth.js: User signed up and profile created successfully for user:", data.user.id);
        console.groupEnd(); // پایان گروه لاگ
        return data.user;
    } catch (e) {
        console.error("auth.js: UNEXPECTED ERROR in signUpUser:", e.message, "Stack:", e.stack);
        console.groupEnd(); // پایان گروه لاگ
        return null;
    }
}

/**
 * خروج کاربر از سیستم.
 * @returns {Promise<boolean>} true در صورت موفقیت، false در صورت خطا.
 */
async function signOutUser() {
    console.groupCollapsed("auth.js: signOutUser called"); // شروع گروه لاگ
    console.log("auth.js: Attempting to sign out current user...");
    try {
        const { error } = await supabase.auth.signOut();
        
        if (error) {
            console.error("auth.js: ERROR during sign out:", error.message, "Details:", error);
            console.groupEnd(); // پایان گروه لاگ
            return false;
        }
        
        console.log("auth.js: User signed out successfully.");
        console.groupEnd(); // پایان گروه لاگ
        return true;
    } catch (e) {
        console.error("auth.js: UNEXPECTED ERROR in signOutUser:", e.message, "Stack:", e.stack);
        console.groupEnd(); // پایان گروه لاگ
        return false;
    }
}

/**
 * گوش دادن به تغییرات وضعیت احراز هویت.
 * @param {function} callback - تابعی که هنگام تغییر وضعیت احراز هویت فراخوانی می‌شود (session, user).
 * @returns {object} شیء unsubscribe برای توقف گوش دادن.
 */
function onAuthStateChange(callback) {
    console.groupCollapsed("auth.js: onAuthStateChange listener setup"); // شروع گروه لاگ
    console.log("auth.js: Setting up authentication state change listener...");
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
        console.groupCollapsed(`auth.js: Auth state changed event: ${event}`); // شروع گروه داخلی
        console.log("auth.js: Event type:", event);
        console.log("auth.js: Session data:", session);
        console.log("auth.js: User data:", session ? session.user : null);
        callback(session, session ? session.user : null);
        console.groupEnd(); // پایان گروه داخلی
    });
    console.log("auth.js: Auth state change listener successfully attached.");
    console.groupEnd(); // پایان گروه لاگ
    return listener;
}

// توابع و همچنین خود شیء supabase را برای استفاده در سایر فایل‌ها export می‌کنیم
export {
    supabase, // <--- این خط حیاتی است: supabase client را نیز export می‌کنیم
    getSession,
    getCurrentUserProfile,
    signInUser,
    signUpUser,
    signOutUser,
    onAuthStateChange
};


