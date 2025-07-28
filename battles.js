
// battles.js - Logic for the Battle System with Debug Logs for Login (نسخه نهایی و ماژولار)

console.log("battles.js: Script loaded successfully."); // <--- لاگ جدید برای بررسی بارگذاری

// وارد کردن supabase client و توابع احراز هویت از auth.js
import { supabase, getSession, getCurrentUserProfile, signOutUser } from './auth.js'; 
// وارد کردن توابع پایگاه داده از db.js
import {
    fetchPendingBattleRequests,
    fetchActiveBattles,
    fetchCompletedBattles,
    fetchBattleById,
    fetchUserByUsername,
    createBattleRequest,
    createNotification,
    acceptBattleRequest,
    rejectBattleRequest,
    uploadToCloudinary,
    fetchBattleRounds,
    hasUserVotedForRound,
    fetchRoundVotes,
    addBattleVote,
    updateBattleInDB,
    fetchBattleParticipants,
    addBattleRound
} from './db.js'; 

// اطمینان از اجرای initializeBattlePage پس از بارگذاری کامل DOM
document.addEventListener('DOMContentLoaded', initializeBattlePage);

// --- Global Variables ---
let currentUser = null; 
let mediaRecorder; 
let audioChunks = []; 
let currentRecordingBlob = null; 
let countdownInterval; 
const MAX_RECORDING_TIME = 30; // seconds

// --- DOM Elements ---
const requestBattleForm = document.getElementById('request-battle-form');
const opponentUsernameInput = document.getElementById('opponent-username');
const totalRoundsInput = document.getElementById('total-rounds');

const pendingBattlesList = document.getElementById('pending-battles-list');
const activeBattlesList = document.getElementById('active-battles-list');
const completedBattlesList = document.getElementById('completed-battles-list');
const activeBattleDetailsContainer = document.getElementById('active-battle-details-container');

const messageBox = document.getElementById('message-box');
const messageText = document.getElementById('message-text');
const messageOkBtn = document.getElementById('message-ok-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

// --- Initialization ---
/**
 * تابع اصلی برای مقداردهی اولیه صفحه بتل.
 * نشست کاربر را بررسی می‌کند، پروفایل را دریافت می‌کند،
 * شنونده‌های رویداد را تنظیم می‌کند و بتل‌ها را رندر می‌کند.
 */
async function initializeBattlePage() {
    console.log("battles.js: initializeBattlePage started.");
    showLoading('در حال بارگذاری...'); 
    try {
        console.log("battles.js: Calling getSession()...");
        const session = await getSession(); 
        
        if (!session) {
            console.log("battles.js: No session found. Redirecting to login.html.");
            showMessage('برای دسترسی به میدان بتل، ابتدا وارد حساب کاربری خود شوید.', () => {
                window.location.href = 'login.html'; 
            });
            hideLoading(); 
            return; 
        }

        console.log("battles.js: Session found, calling getCurrentUserProfile()...");
        currentUser = await getCurrentUserProfile(); 
        console.log("battles.js: getCurrentUserProfile completed. Current User:", currentUser);
        
        if (!currentUser) {
            console.log("battles.js: No current user profile found. Signing out and redirecting to login.html.");
            showMessage('خطا در بارگذاری اطلاعات کاربری. لطفاً دوباره وارد شوید.', async () => {
                await signOutUser(); 
                window.location.href = 'login.html'; 
            });
            hideLoading(); 
            return; 
        }

        setupEventListeners(); 
        console.log("battles.js: Event listeners setup.");
        await fetchAndRenderAllBattles(); 
        console.log("battles.js: All battles fetched and rendered.");

        const urlParams = new URLSearchParams(window.location.search);
        const initialBattleId = urlParams.get('battleId');
        const initialTab = urlParams.get('tab');

        if (initialBattleId) {
            console.log(`battles.js: Initial battle ID found: ${initialBattleId}. Activating active battles tab.`);
            document.querySelectorAll('.tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            document.getElementById('active-battles-tab').classList.add('active');
            document.querySelector('[data-tab="active-battles-tab"]').classList.add('active');
            await renderActiveBattleDetails(initialBattleId);
            console.log(`battles.js: Rendered initial active battle details for ${initialBattleId}.`);
        } else if (initialTab) {
            console.log(`battles.js: Initial tab found: ${initialTab}. Activating tab.`);
            document.querySelectorAll('.tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            document.getElementById(initialTab).classList.add('active');
            document.querySelector(`[data-tab="${initialTab}"]`).classList.add('active');
        }
    } catch (error) {
        console.error("battles.js: UNEXPECTED ERROR in initializeBattlePage:", error);
        showMessage('خطای جدی در بارگذاری صفحه بتل. لطفاً دوباره تلاش کنید.');
    } finally {
        hideLoading(); 
        console.log("battles.js: initializeBattlePage finished, loading hidden.");
    }
}

// --- Event Listeners ---
/**
 * شنونده‌های رویداد لازم را برای عناصر صفحه بتل تنظیم می‌کند.
 */
function setupEventListeners() {
    console.log("battles.js: Setting up event listeners.");
    document.querySelector('.tabs').addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-btn')) {
            const tabId = e.target.dataset.tab;
            console.log(`battles.js: Tab button clicked: ${tabId}.`);
            document.querySelectorAll('.tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(tabId).classList.add('active');
            activeBattleDetailsContainer.classList.add('hidden');
            activeBattleDetailsContainer.innerHTML = '';
        }
    });

    requestBattleForm.addEventListener('submit', handleRequestBattle);

    messageOkBtn.addEventListener('click', hideMessageBox);

    document.addEventListener('click', async (e) => {
        if (e.target.classList.contains('accept-battle-btn')) {
            const battleId = e.target.dataset.battleId;
            console.log(`battles.js: Accept battle button clicked for battleId: ${battleId}.`);
            await handleAcceptBattle(battleId);
        } else if (e.target.classList.contains('reject-battle-btn')) {
            const battleId = e.target.dataset.battleId;
            console.log(`battles.js: Reject battle button clicked for battleId: ${battleId}.`);
            await handleRejectBattle(battleId);
        } else if (e.target.classList.contains('view-active-battle-btn')) {
            const battleId = e.target.dataset.battleId;
            console.log(`battles.js: View active battle button clicked for battleId: ${battleId}.`);
            await renderActiveBattleDetails(battleId);
        } else if (e.target.classList.contains('vote-btn')) {
            const roundId = e.target.dataset.roundId;
            const votedForPlayerId = e.target.dataset.votedForPlayerId;
            const battleId = e.target.dataset.battleId;
            console.log(`battles.js: Vote button clicked for roundId: ${roundId}, votedForPlayerId: ${votedForPlayerId}, battleId: ${battleId}.`);
            await handleVote(battleId, roundId, votedForPlayerId);
        }
    });
}

// --- Data Fetching and Rendering ---

/**
 * تمام انواع بتل‌ها را برای کاربر فعلی دریافت و رندر می‌کند.
 */
async function fetchAndRenderAllBattles() {
    console.log("battles.js: fetchAndRenderAllBattles started.");
    if (!currentUser) {
        console.warn("battles.js: currentUser is null in fetchAndRenderAllBattles, returning.");
        return;
    }
    showLoading('در حال دریافت بتل‌ها...');
    try {
        const pending = await fetchPendingBattleRequests(currentUser.username); 
        console.log("battles.js: Fetched pending battles:", pending);
        const active = await fetchActiveBattles(currentUser.username); 
        console.log("battles.js: Fetched active battles:", active);
        const completed = await fetchCompletedBattles(currentUser.username); 
        console.log("battles.js: Fetched completed battles:", completed);

        renderPendingBattles(pending); 
        renderActiveBattles(active); 
        renderCompletedBattles(completed); 
        console.log("battles.js: Battles rendered.");
    } catch (error) {
        console.error("battles.js: ERROR in fetchAndRenderAllBattles:", error);
        showMessage('خطا در بارگذاری لیست بتل‌ها.');
    } finally {
        hideLoading();
        console.log("battles.js: fetchAndRenderAllBattles finished, loading hidden.");
    }
}

/**
 * درخواست‌های بتل در انتظار را رندر می‌کند.
 * @param {Array<object>} battles - آرایه‌ای از اشیاء بتل در انتظار.
 */
function renderPendingBattles(battles) {
    console.log("battles.js: renderPendingBattles called.");
    pendingBattlesList.innerHTML = ''; 
    if (battles.length === 0) {
        pendingBattlesList.innerHTML = '<li>درخواست بتل در انتظاری وجود ندارد.</li>';
        console.log("battles.js: No pending battles to render.");
        return;
    }
    battles.forEach(battle => {
        const isRequester = battle.player1 === currentUser.username; 
        const statusText = isRequester ? 'منتظر تایید حریف' : 'درخواست جدید';
        const actionsHtml = isRequester ?
            `<button class="cta-button vibrant-red reject-battle-btn" data-battle-id="${battle.id}">لغو درخواست</button>` : 
            `<button class="cta-button vibrant-green accept-battle-btn" data-battle-id="${battle.id}">پذیرش</button>
             <button class="cta-button vibrant-red reject-battle-btn" data-battle-id="${battle.id}">رد کردن</button>`; 

        const battleItem = document.createElement('li');
        battleItem.classList.add('battle-item');
        battleItem.innerHTML = `
            <div class="battle-header">
                <div class="battle-players">
                    <span>${battle.player1}</span>
                    <i class="fas fa-vs"></i>
                    <span>${battle.player2}</span>
                </div>
                <span class="battle-status">وضعیت: ${statusText}</span>
            </div>
            <div class="battle-actions">
                ${actionsHtml}
            </div>
        `;
        pendingBattlesList.appendChild(battleItem);
    });
    console.log(`battles.js: Rendered ${battles.length} pending battles.`);
}

/**
 * بتل‌های فعال را رندر می‌کند.
 * @param {Array<object>} battles - آرایه‌ای از اشیاء بتل فعال.
 */
function renderActiveBattles(battles) {
    console.log("battles.js: renderActiveBattles called.");
    activeBattlesList.innerHTML = ''; 
    if (battles.length === 0) {
        activeBattlesList.innerHTML = '<li>بتل فعال در حال حاضر وجود ندارد.</li>';
        console.log("battles.js: No active battles to render.");
        return;
    }
    battles.forEach(battle => {
        const battleItem = document.createElement('li');
        battleItem.classList.add('battle-item');
        battleItem.innerHTML = `
            <div class="battle-header">
                <div class="battle-players">
                    <span>${battle.player1}</span>
                    <i class="fas fa-vs"></i>
                    <span>${battle.player2}</span>
                </div>
                <span class="battle-status">راند فعلی: ${battle.currentRound || 1} از ${battle.rounds?.total || 3}</span>
            </div>
            <div class="battle-actions">
                <button class="cta-button vibrant-blue view-active-battle-btn" data-battle-id="${battle.id}">مشاهده و ادامه</button>
            </div>
        `;
        activeBattlesList.appendChild(battleItem);
    });
    console.log(`battles.js: Rendered ${battles.length} active battles.`);
}

/**
 * بتل‌های کامل شده را رندر می‌کند.
 * @param {Array<object>} battles - آرایه‌ای از اشیاء بتل کامل شده.
 */
function renderCompletedBattles(battles) {
    console.log("battles.js: renderCompletedBattles called.");
    completedBattlesList.innerHTML = ''; 
    if (battles.length === 0) {
        completedBattlesList.innerHTML = '<li>بتل گذشته‌ای وجود ندارد.</li>';
        console.log("battles.js: No completed battles to render.");
        return;
    }
    battles.forEach(battle => {
        const winnerText = battle.Winner ? `برنده: ${battle.Winner}` : 'نتیجه نامشخص';
        const player1Score = battle.rounds?.player1_score || 0;
        const player2Score = battle.rounds?.player2_score || 0;

        const battleItem = document.createElement('li');
        battleItem.classList.add('battle-item');
        battleItem.innerHTML = `
            <div class="battle-header">
                <div class="battle-players">
                    <span>${battle.player1}</span>
                    <i class="fas fa-vs"></i>
                    <span>${battle.player2}</span>
                </div>
                <span class="battle-status">${winnerText} (${player1Score} - ${player2Score})</span>
            </div>
            <!-- Optionally add a button to view completed battle details/rounds -->
        `;
        completedBattlesList.appendChild(battleItem);
    });
    console.log(`battles.js: Rendered ${battles.length} completed battles.`);
}

/**
 * نمای جزئیات یک بتل فعال را رندر می‌کند.
 * @param {string} battleId - ID بتل فعال برای نمایش.
 */
async function renderActiveBattleDetails(battleId) {
    console.log(`battles.js: renderActiveBattleDetails called for battleId: ${battleId}.`);
    showLoading('در حال بارگذاری جزئیات بتل...');
    try {
        const battle = await fetchBattleById(battleId); 
        if (!battle) {
            showMessage('بتل مورد نظر یافت نشد.');
            return;
        }

        activeBattleDetailsContainer.classList.remove('hidden'); 
        activeBattleDetailsContainer.innerHTML = `
            <h2 class="section-title">بتل فعال: ${battle.player1} vs ${battle.player2}</h2>
            <p>راند فعلی: ${battle.currentRound || 1} از ${battle.rounds?.total || 3}</p>
            <div id="battle-rounds-display"></div>
            <div id="recorder-section" class="recorder-section">
                <h3>ضبط راند ${battle.currentRound || 1}</h3>
                <p id="countdown-timer">00:00</p>
                <audio id="audio-preview" controls class="hidden"></audio>
                <div style="display: flex; gap: 10px;">
                    <button id="record-btn" class="cta-button vibrant-red"><i class="fas fa-microphone"></i> شروع ضبط</button>
                    <button id="stop-btn" class="cta-button vibrant-purple" disabled><i class="fas fa-stop"></i> توقف</button>
                    <button id="upload-btn" class="cta-button vibrant-green" disabled><i class="fas fa-upload"></i> آپلود راند</button>
                </div>
                <p id="recorder-status"></p>
            </div>
        `;

        setupRecorder(battleId, battle.currentRound, battle.player1, battle.player2);
        await renderBattleRoundsDisplay(battle); 
        console.log(`battles.js: Active battle details rendered for battleId: ${battleId}.`);
    } catch (error) {
        console.error("battles.js: ERROR in renderActiveBattleDetails:", error);
        showMessage('خطا در بارگذاری جزئیات بتل.');
    } finally {
        hideLoading();
    }
}

/**
 * نمایش راندهای ضبط شده و گزینه‌های رأی‌گیری را رندر می‌کند.
 * @param {object} battle - شیء بتل.
 */
async function renderBattleRoundsDisplay(battle) {
    console.log(`battles.js: renderBattleRoundsDisplay called for battleId: ${battle.id}.`);
    const battleRoundsDisplay = document.getElementById('battle-rounds-display');
    battleRoundsDisplay.innerHTML = '';

    const rounds = await fetchBattleRounds(battle.id); 
    console.log(`battles.js: Fetched ${rounds.length} rounds for battle ${battle.id}.`);
    
    const participants = await fetchBattleParticipants(battle.player1, battle.player2); 
    if (!participants) {
        console.error("battles.js: Could not fetch battle participants for voting in renderBattleRoundsDisplay.");
        return;
    }
    const { player1Id, player2Id } = participants;

    for (const round of rounds) {
        const roundCard = document.createElement('div');
        roundCard.classList.add('battle-round-card');
        roundCard.innerHTML = `
            <h3>راند ${round.round_number}</h3>
            <div class="audio-controls">
                <span>${battle.player1}:</span>
                ${round.player1_audio_url ? `<audio controls src="${round.player1_audio_url}"></audio>` : '<span>منتظر ضبط...</span>'}
            </div>
            <div class="audio-controls">
                <span>${battle.player2}:</span>
                ${round.player2_audio_url ? `<audio controls src="${round.player2_audio_url}"></audio>` : '<span>منتظر ضبط...</span>'}
            </div>
            <div class="vote-section" id="vote-section-${round.id}"></div>
        `;
        battleRoundsDisplay.appendChild(roundCard);

        const voteSection = document.getElementById(`vote-section-${round.id}`);
        if (round.player1_audio_url && round.player2_audio_url) {
            await renderVoteSection(voteSection, battle.id, round, player1Id, player2Id, battle.player1, battle.player2);
        } else {
            voteSection.innerHTML = '<p>منتظر تکمیل ضبط هر دو بازیکن برای شروع رأی‌گیری...</p>';
        }
    }
    console.log("battles.js: Battle rounds display rendered.");
}

/**
 * بخش رأی‌گیری برای یک راند خاص را رندر می‌کند.
 * @param {HTMLElement} voteSectionElement - عنصر DOM برای رندر بخش رأی‌گیری.
 * @param {string} battleId - ID بتل.
 * @param {object} round - شیء راند.
 * @param {string} player1Id - ID کاربر بازیکن ۱.
 * @param {string} player2Id - ID کاربر بازیکن ۲.
 * @param {string} player1Username - نام کاربری بازیکن ۱.
 * @param {string} player2Username - نام کاربری بازیکن ۲.
 */
async function renderVoteSection(voteSectionElement, battleId, round, player1Id, player2Id, player1Username, player2Username) {
    console.log(`battles.js: renderVoteSection called for roundId: ${round.id}.`);
    const currentUserId = currentUser.id;
    const hasVoted = await hasUserVotedForRound(round.id, currentUserId); 
    const votes = await fetchRoundVotes(round.id);

    const player1Votes = votes.filter(v => v.voted_for_player_id === player1Id).length;
    const player2Votes = votes.filter(v => v.voted_for_player_id === player2Id).length;

    let roundWinnerText = '';
    if (player1Votes > 0 || player2Votes > 0) { 
        if (player1Votes > player2Votes) {
            roundWinnerText = `برنده راند: ${player1Username}`;
        } else if (player2Votes > player1Votes) {
            roundWinnerText = `برنده راند: ${player2Username}`;
        } else if (player1Votes === player2Votes && (player1Votes > 0 || player2Votes > 0)) { 
            roundWinnerText = 'راند مساوی شد!';
        }
    }

    voteSectionElement.innerHTML = `
        <div class="vote-counts">
            <span class="player1-votes"><i class="fas fa-thumbs-up"></i> ${player1Username}: ${player1Votes} رای</span>
            <span class="player2-votes"><i class="fas fa-thumbs-up"></i> ${player2Username}: ${player2Votes} رای</span>
        </div>
        ${roundWinnerText ? `<p style="font-weight: bold; color: var(--vibrant-gold);">${roundWinnerText}</p>` : ''}
    `;

    if (currentUserId !== player1Id && currentUserId !== player2Id && !hasVoted) {
        voteSectionElement.innerHTML += `
            <p>به کدام بازیکن رأی می‌دهید؟</p>
            <button class="cta-button vibrant-green vote-btn" data-battle-id="${battleId}" data-round-id="${round.id}" data-voted-for-player-id="${player1Id}">رای به ${player1Username}</button>
            <button class="cta-button vibrant-purple vote-btn" data-battle-id="${battleId}" data-round-id="${round.id}" data-voted-for-player-id="${player2Id}">رای به ${player2Username}</button>
        `;
    } else if (hasVoted) {
        voteSectionElement.innerHTML += '<p style="color: var(--text-muted);">شما قبلاً به این راند رأی داده‌اید.</p>';
    } else if (currentUserId === player1Id || currentUserId === player2Id) {
        voteSectionElement.innerHTML += '<p style="color: var(--text-muted);">بازیکنان نمی‌توانند به راندهای خود رأی دهند.</p>';
    }
    console.log(`battles.js: Vote section rendered for roundId: ${round.id}. Has voted: ${hasVoted}.`);
}

// --- Battle Actions ---

/**
 * ارسال درخواست بتل جدید را مدیریت می‌کند.
 * @param {Event} e - رویداد سابمیت فرم.
 */
async function handleRequestBattle(e) {
    console.log("battles.js: handleRequestBattle called.");
    e.preventDefault(); 
    if (!currentUser) {
        showMessage('ابتدا باید وارد حساب کاربری خود شوید.');
        return;
    }

    const opponentUsername = opponentUsernameInput.value.trim();
    const totalRounds = parseInt(totalRoundsInput.value, 10);

    if (!opponentUsername) {
        showMessage('لطفاً نام کاربری حریف را وارد کنید.');
        return;
    }
    if (opponentUsername === currentUser.username) {
        showMessage('نمی‌توانید با خودتان بتل کنید!');
        return;
    }
    if (isNaN(totalRounds) || totalRounds < 1 || totalRounds > 5) {
        showMessage('تعداد راندها باید بین 1 تا 5 باشد.');
        return;
    }

    showLoading('در حال ارسال درخواست بتل...');
    try {
        console.log("handleRequestBattle: Fetching opponent user...");
        const opponentUser = await fetchUserByUsername(opponentUsername); 
        if (!opponentUser) {
            showMessage('کاربری با این نام کاربری یافت نشد.');
            return;
        }
        console.log("handleRequestBattle: Opponent user found:", opponentUser);

        console.log("handleRequestBattle: Checking for existing battles...");
        const existingBattles = await fetchPendingBattleRequests(currentUser.username); 
        const activeBattles = await fetchActiveBattles(currentUser.username); 

        const allExistingBattles = [...existingBattles, ...activeBattles];
        const hasExistingBattle = allExistingBattles.some(battle =>
            (battle.player1 === currentUser.username && battle.player2 === opponentUsername) ||
            (battle.player1 === opponentUsername && battle.player2 === currentUser.username)
        );

        if (hasExistingBattle) {
            showMessage('شما یا حریف قبلاً یک بتل فعال یا در انتظار با یکدیگر دارید.');
            return;
        }

        console.log("handleRequestBattle: Creating battle request...");
        const battleData = await createBattleRequest(currentUser.username, opponentUsername, totalRounds); 

        if (battleData) {
            showMessage(`درخواست بتل برای ${opponentUsername} با موفقیت ارسال شد!`);
            console.log("handleRequestBattle: Battle request created, sending notification...");
            await createNotification(opponentUser.id, currentUser.id, 'battle_request', `شما را به یک بتل دعوت کرد.`, `battles.html?tab=pending-battles-tab`); 
            console.log("handleRequestBattle: Notification sent. Resetting form and refreshing battles...");
            requestBattleForm.reset(); 
            await fetchAndRenderAllBattles(); 
            console.log("handleRequestBattle: Form reset and battles refreshed.");
        } else {
            showMessage('خطا در ارسال درخواست بتل.');
            console.error("handleRequestBattle: createBattleRequest returned null.");
        }
    } catch (error) {
        console.error("handleRequestBattle: UNEXPECTED ERROR:", error);
        showMessage('خطای غیرمنتظره در ارسال درخواست بتل.');
    } finally {
        hideLoading();
    }
}

/**
 * پذیرش درخواست بتل را مدیریت می‌کند.
 * @param {string} battleId - ID بتل برای پذیرش.
 */
async function handleAcceptBattle(battleId) {
    console.log(`battles.js: handleAcceptBattle called for battleId: ${battleId}.`);
    showLoading('در حال پذیرش بتل...');
    try {
        const success = await acceptBattleRequest(battleId); 
        if (success) {
            showMessage('بتل با موفقیت پذیرفته شد! به بخش بتل‌های فعال مراجعه کنید.');
            const battle = await fetchBattleById(battleId); 
            if (battle) {
                const player1User = await fetchUserByUsername(battle.player1); 
                if (player1User) {
                    await createNotification(player1User.id, currentUser.id, 'battle_accepted', `درخواست بتل شما را پذیرفت.`, `battles.html?tab=active-battles-tab&battleId=${battle.id}`); 
                }
            }
            await fetchAndRenderAllBattles(); 
        } else {
            showMessage('خطا در پذیرش بتل.');
        }
    } catch (error) {
        console.error("battles.js: ERROR in handleAcceptBattle:", error);
        showMessage('خطای غیرمنتظره در پذیرش بتل.');
    } finally {
        hideLoading();
    }
}

/**
 * رد کردن درخواست بتل را مدیریت می‌کند.
 * @param {string} battleId - ID بتل برای رد کردن.
 */
async function handleRejectBattle(battleId) {
    console.log(`battles.js: handleRejectBattle called for battleId: ${battleId}.`);
    showLoading('در حال رد کردن بتل...');
    try {
        const success = await rejectBattleRequest(battleId); 
        if (success) {
            showMessage('درخواست بتل با موفقیت رد شد.');
            const battle = await fetchBattleById(battleId); 
            if (battle) {
                const otherPlayerUsername = battle.player1 === currentUser.username ? battle.player2 : battle.player1;
                const otherPlayerUser = await fetchUserByUsername(otherPlayerUsername); 
                if (otherPlayerUser) {
                    await createNotification(otherPlayerUser.id, currentUser.id, 'battle_rejected', `درخواست بتل شما را رد کرد.`, `battles.html`); 
                }
            }
            await fetchAndRenderAllBattles(); 
        } else {
            showMessage('خطا در رد کردن بتل.');
        }
    }
    catch (error) {
        console.error("battles.js: ERROR in handleRejectBattle:", error);
        showMessage('خطای غیرمنتظره در رد کردن بتل.');
    } finally {
        hideLoading();
    }
}

/**
 * اضافه کردن رأی به یک راند بتل را مدیریت می‌کند.
 * @param {string} battleId - ID بتل.
 * @param {string} roundId - ID راندی که به آن رأی داده می‌شود.
 * @param {string} votedForPlayerId - ID بازیکنی که به او رأی داده شده است.
 */
async function handleVote(battleId, roundId, votedForPlayerId) {
    console.log(`battles.js: handleVote called for battleId: ${battleId}, roundId: ${roundId}, votedForPlayerId: ${votedForPlayerId}.`);
    if (!currentUser) {
        showMessage('برای رأی دادن باید وارد شوید.');
        return;
    }

    const battle = await fetchBattleById(battleId); 
    if (!battle) {
        showMessage('بتل مورد نظر یافت نشد.');
        return;
    }

    const participants = await fetchBattleParticipants(battle.player1, battle.player2); 
    if (!participants) {
        showMessage('خطا در دریافت اطلاعات بازیکنان بتل.');
        return;
    }
    const { player1Id, player2Id } = participants;

    if (currentUser.id === player1Id || currentUser.id === player2Id) {
        showMessage('شما نمی‌توانید به راندهای بتل خودتان رأی دهید!');
        return;
    }

    showLoading('در حال ثبت رأی...');
    try {
        const hasVoted = await hasUserVotedForRound(roundId, currentUser.id); 
        if (hasVoted) {
            showMessage('شما قبلاً به این راند رأی داده‌اید.');
            return;
        }

        const voteData = {
            battle_id: battleId,
            round_id: roundId,
            voter_id: currentUser.id,
            voted_for_player_id: votedForPlayerId,
            score: 1 
        };

        const success = await addBattleVote(voteData);

        if (success) {
            showMessage('رأی شما با موفقیت ثبت شد!');
            await renderActiveBattleDetails(battleId);
            await checkRoundCompletionAndScore(battleId, roundId);
        } else {
            showMessage('خطا در ثبت رأی.');
        }
    } catch (error) {
        console.error("battles.js: ERROR in handleVote:", error);
        showMessage('خطای غیرمنتظره در ثبت رأی.');
    } finally {
        hideLoading();
    }
}

/**
 * بررسی می‌کند که آیا یک راند کامل شده است (هر دو بازیکن صدا را آپلود کرده‌اند) و امتیاز بتل را به‌روزرسانی می‌کند.
 * همچنین تکمیل بتل را بررسی می‌کند.
 * @param {string} battleId - ID بتل.
 * @param {string} roundId - ID راند برای بررسی.
 */
async function checkRoundCompletionAndScore(battleId, roundId) {
    console.log(`battles.js: checkRoundCompletionAndScore called for battleId: ${battleId}, roundId: ${roundId}.`);
    const battle = await fetchBattleById(battleId); 
    if (!battle) {
        console.warn("battles.js: Battle not found in checkRoundCompletionAndScore, returning.");
        return;
    }

    const roundsInBattle = await fetchBattleRounds(battleId); 
    const round = roundsInBattle.find(r => r.id === roundId);
    if (!round || !round.player1_audio_url || !round.player2_audio_url) {
        console.log("battles.js: Round not yet complete for both players, or round not found.");
        return;
    }

    const votes = await fetchRoundVotes(round.id); 
    const participants = await fetchBattleParticipants(battle.player1, battle.player2); 
    if (!participants) {
        console.error("battles.js: Could not fetch battle participants for scoring in checkRoundCompletionAndScore.");
        return;
    }
    const { player1Id, player2Id } = participants;

    const player1Votes = votes.filter(v => v.voted_for_player_id === player1Id).length;
    const player2Votes = votes.filter(v => v.voted_for_player_id === player2Id).length;

    let updatedBattleRoundsJson = battle.rounds || { total: 3, player1_score: 0, player2_score: 0 };
    if (!updatedBattleRoundsJson.player1_score) updatedBattleRoundsJson.player1_score = 0;
    if (!updatedBattleRoundsJson.player2_score) updatedBattleRoundsJson.player2_score = 0;

    const roundWinnerKey = `round_${round.round_number}_winner`;
    if (updatedBattleRoundsJson[roundWinnerKey]) {
        console.log(`battles.js: Scores for round ${round.round_number} already tallied.`);
        return; 
    }

    if (player1Votes > player2Votes) {
        updatedBattleRoundsJson.player1_score++;
        updatedBattleRoundsJson[roundWinnerKey] = battle.player1; 
    } else if (player2Votes > player1Votes) {
        updatedBattleRoundsJson.player2_score++;
        updatedBattleRoundsJson[roundWinnerKey] = battle.player2; 
    } else if (player1Votes === player2Votes && (player1Votes > 0 || player2Votes > 0)) { 
        updatedBattleRoundsJson[roundWinnerKey] = 'tie'; 
    }

    const updates = { rounds: updatedBattleRoundsJson };
    const updateSuccess = await updateBattleInDB(battleId, updates); 
    if (!updateSuccess) {
        console.error("battles.js: Failed to update battle scores in DB.");
        return;
    }
    console.log(`battles.js: Battle scores updated for battleId: ${battleId}.`);

    if (battle.currentRound >= updatedBattleRoundsJson.total) {
        let overallWinnerUsername = null;
        if (updatedBattleRoundsJson.player1_score > updatedBattleRoundsJson.player2_score) {
            overallWinnerUsername = battle.player1;
        } else if (updatedBattleRoundsJson.player2_score > updatedBattleRoundsJson.player1_score) {
            overallWinnerUsername = battle.player2;
        }

        const finalUpdates = {
            status: 'completed',
            completed_at: new Date().toISOString(),
            Winner: overallWinnerUsername
        };
        const finalUpdateSuccess = await updateBattleInDB(battleId, finalUpdates);
        if (finalUpdateSuccess) {
            showMessage(`بتل به پایان رسید! برنده: ${overallWinnerUsername || 'مساوی'}!`);

            const player1User = await fetchUserByUsername(battle.player1);
            const player2User = await fetchUserByUsername(battle.player2);

            if (player1User) await createNotification(player1User.id, currentUser.id, 'battle_completed', `بتل شما با ${battle.player2} به پایان رسید. برنده: ${overallWinnerUsername || 'مساوی'}`, `battles.html?tab=completed-battles-tab`);
            if (player2User) await createNotification(player2User.id, currentUser.id, 'battle_completed', `بتل شما با ${battle.player1} به پایان رسید. برنده: ${overallWinnerUsername || 'مساوی'}`, `battles.html?tab=completed-battles-tab`);

            await fetchAndRenderAllBattles();
            console.log(`battles.js: Battle ${battleId} marked as completed.`);
        } else {
            console.error("battles.js: Failed to mark battle as completed in DB.");
            showMessage("خطا در نهایی کردن بتل.");
        }
    } else {
        const nextRound = battle.currentRound + 1;
        const nextRoundUpdateSuccess = await updateBattleInDB(battleId, { currentRound: nextRound });
        if (nextRoundUpdateSuccess) {
            showMessage(`راند ${battle.currentRound} به پایان رسید. آماده برای راند ${nextRound}!`);
            await renderActiveBattleDetails(battleId);
            console.log(`battles.js: Advanced battle ${battleId} to next round: ${nextRound}.`);
        } else {
            console.error("battles.js: Failed to advance to next round in DB.");
            showMessage("خطا در شروع راند بعدی.");
        }
    }
}

// --- Audio Recording Logic ---

/**
 * رکوردر صوتی را برای یک بتل و راند خاص تنظیم می‌کند.
 * @param {string} battleId - ID بتل.
 * @param {number} roundNumber - شماره راند فعلی.
 * @param {string} player1Username - نام کاربری بازیکن ۱.
 * @param {string} player2Username - نام کاربری بازیکن ۲.
 */
function setupRecorder(battleId, roundNumber, player1Username, player2Username) {
    console.log(`battles.js: setupRecorder called for battleId: ${battleId}, round: ${roundNumber}.`);
    const recordBtn = document.getElementById('record-btn');
    const stopBtn = document.getElementById('stop-btn');
    const uploadBtn = document.getElementById('upload-btn');
    const audioPreview = document.getElementById('audio-preview');
    const countdownTimer = document.getElementById('countdown-timer');
    const recorderStatus = document.getElementById('recorder-status');

    recordBtn.onclick = async () => {
        console.log("battles.js: Record button clicked.");
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); 
            mediaRecorder = new MediaRecorder(stream); 
            audioChunks = []; 
            currentRecordingBlob = null;

            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data); 
                console.log("battles.js: MediaRecorder data available.");
            };

            mediaRecorder.onstop = () => {
                console.log("battles.js: MediaRecorder stopped.");
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); 
                currentRecordingBlob = audioBlob;
                const audioUrl = URL.createObjectURL(audioBlob); 
                audioPreview.src = audioUrl;
                audioPreview.classList.remove('hidden'); 
                uploadBtn.disabled = false; 
                recordBtn.disabled = false; 
                recordBtn.classList.remove('recording'); 
                recorderStatus.textContent = 'ضبط متوقف شد. آماده برای آپلود.';
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start(); 
            recordBtn.disabled = true; 
            recordBtn.classList.add('recording'); 
            stopBtn.disabled = false; 
            uploadBtn.disabled = true; 
            audioPreview.classList.add('hidden'); 
            audioPreview.src = ''; 
            recorderStatus.textContent = 'در حال ضبط...';

            let timeLeft = MAX_RECORDING_TIME;
            countdownTimer.textContent = `00:${timeLeft.toString().padStart(2, '0')}`; 
            clearInterval(countdownInterval); 
            countdownInterval = setInterval(() => {
                timeLeft--;
                countdownTimer.textContent = `00:${timeLeft.toString().padStart(2, '0')}`;
                if (timeLeft <= 0) {
                    clearInterval(countdownInterval);
                    if (mediaRecorder.state === 'recording') {
                        mediaRecorder.stop(); 
                    }
                }
            }, 1000); 
            console.log("battles.js: Recording started.");

        } catch (err) {
            console.error('battles.js: Error accessing microphone:', err);
            showMessage('خطا در دسترسی به میکروفون. لطفاً اجازه دسترسی را بدهید.');
            recorderStatus.textContent = 'خطا در دسترسی به میکروفون.';
        }
    };

    stopBtn.onclick = () => {
        console.log("battles.js: Stop button clicked.");
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop(); 
            clearInterval(countdownInterval); 
            stopBtn.disabled = true; 
        }
    };

    uploadBtn.onclick = async () => {
        console.log("battles.js: Upload button clicked.");
        if (!currentRecordingBlob) {
            showMessage('هیچ فایلی برای آپلود وجود ندارد. ابتدا ضبط کنید.');
            return;
        }

        showLoading('در حال آپلود راند...');
        try {
            const audioUrl = await uploadToCloudinary(currentUser.id, currentRecordingBlob, 'audio', 'battle_audios'); 
            console.log(`battles.js: Audio URL from Cloudinary: ${audioUrl}.`);

            if (audioUrl) {
                const battle = await fetchBattleById(battleId); 
                if (!battle) {
                    showMessage('خطا: بتل یافت نشد.');
                    return;
                }

                let roundToUpdate = (await fetchBattleRounds(battleId)).find(r => r.round_number === roundNumber); 

                let updates = {};
                if (currentUser.username === player1Username) {
                    updates = { player1_audio_url: audioUrl, player1_recorded_at: new Date().toISOString() };
                } else if (currentUser.username === player2Username) {
                    updates = { player2_audio_url: audioUrl, player2_recorded_at: new Date().toISOString() };
                } else {
                    showMessage('شما بازیکن این بتل نیستید.');
                    return;
                }

                let success;
                if (roundToUpdate) {
                    console.log(`battles.js: Updating existing round ${roundToUpdate.id} with updates:`, updates);
                    const { data, error } = await supabase.from('battle_rounds').update(updates).eq('id', roundToUpdate.id).select().single();
                    success = !error;
                } else {
                    console.log(`battles.js: Creating new round ${roundNumber} with updates:`, updates);
                    const newRoundData = {
                        battle_id: battleId,
                        round_number: roundNumber,
                        ...updates
                    };
                    const createdRound = await addBattleRound(newRoundData); 
                    success = !!createdRound;
                    if (createdRound) roundToUpdate = createdRound; 
                }

                if (success) {
                    showMessage('راند با موفقیت آپلود شد!');
                    uploadBtn.disabled = true;
                    stopBtn.disabled = true;
                    recordBtn.disabled = false;
                    audioPreview.classList.add('hidden');
                    recorderStatus.textContent = 'راند آپلود شد.';

                    await renderActiveBattleDetails(battleId);
                    await checkRoundCompletionAndScore(battleId, roundToUpdate.id);
                    console.log("battles.js: Round uploaded and processed successfully.");

                } else {
                    showMessage('خطا در آپلود راند.');
                }
            } else {
                showMessage('خطا در آپلود فایل صوتی به Cloudinary.');
            }
        } catch (error) {
            console.error("battles.js: ERROR in uploadBtn.onclick:", error);
            showMessage('خطای غیرمنتظره در آپلود راند.');
        } finally {
            hideLoading();
        }
    };
}

// --- Utility Functions (از index.html، تطبیق داده شده یا مجدداً استفاده شده) ---

/**
 * یک باکس پیام سفارشی را نمایش می‌دهد.
 * @param {string} msg - پیامی که باید نمایش داده شود.
 * @param {function} [onOkCallback] - تابع کال‌بک برای اجرا پس از کلیک روی دکمه OK.
 */
function showMessage(msg, onOkCallback = null) {
    console.log(`battles.js: showMessage called with: "${msg}".`);
    messageText.textContent = msg;
    messageBox.classList.add('visible');
    messageOkBtn.onclick = () => {
        hideMessageBox();
        if (onOkCallback) onOkCallback();
    };
}

/**
 * باکس پیام سفارشی را پنهان می‌کند.
 */
function hideMessageBox() {
    console.log("battles.js: hideMessageBox called.");
    messageBox.classList.remove('visible');
}

/**
 * پوشش لودینگ را با یک پیام نمایش می‌دهد.
 * @param {string} msg = 'در حال پردازش...' - پیام لودینگ.
 */
function showLoading(msg = 'در حال پردازش...') {
    console.log(`battles.js: showLoading called with: "${msg}".`);
    loadingText.textContent = msg;
    loadingOverlay.classList.remove('hidden');
}

/**
 * پوشش لودینگ را پنهان می‌کند.
 */
function hideLoading() {
    console.log("battles.js: hideLoading called.");
    loadingOverlay.classList.add('hidden');
}

// بررسی اولیه battleId در URL برای باز کردن مستقیم نمای بتل فعال
const urlParams = new URLSearchParams(window.location.search);
const initialBattleId = urlParams.get('battleId');
const initialTab = urlParams.get('tab');

if (initialBattleId) {
    document.addEventListener('DOMContentLoaded', async () => {
        document.querySelectorAll('.tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById('active-battles-tab').classList.add('active');
        document.querySelector('[data-tab="active-battles-tab"]').classList.add('active');
        await renderActiveBattleDetails(initialBattleId);
    });
} else if (initialTab) {
     document.addEventListener('DOMContentLoaded', async () => {
        document.querySelectorAll('.tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(initialTab).classList.add('active');
        document.querySelector(`[data-tab="${initialTab}"]`).classList.add('active');
    });
}

