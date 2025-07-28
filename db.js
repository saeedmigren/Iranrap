// db.js - Final, Complete, and Corrected Version (به روز شده برای ایمپورت صریح supabase از auth.js)

console.log("db.js: Script loaded successfully."); // <--- لاگ جدید برای بررسی بارگذاری

import { supabase, getCurrentUserProfile } from './auth_v2.js'; // وارد کردن supabase و getCurrentUserProfile از auth.js

const CLOUDINARY_CLOUD_NAME = "dua53zgnk";
const CLOUDINARY_UPLOAD_PRESET = "Iranrap";

const getXpForNextLevel = (level) => Math.floor(100 * Math.pow(level, 1.5));

function compressImage(file, options = { maxWidth: 1080, quality: 0.75 }) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            let { width, height } = img;
            const { maxWidth } = options;
            if (width > height) {
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
            } else {
                if (height > maxWidth) {
                    width = Math.round((width * maxWidth) / height);
                    height = maxWidth;
                }
            }
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(
                (blob) => {
                    if (!blob) { reject(new Error('Canvas is empty')); return; }
                    const compressedFile = new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() });
                    resolve(compressedFile);
                }, 'image/jpeg', options.quality
            );
        };
        img.onerror = (error) => { console.error("Error loading image for compression:", error); reject(error); };
    });
}

async function createStory(userId, file) {
    if (!file || !userId) return null;
    const compressedFile = await compressImage(file, { maxWidth: 1080, quality: 0.8 });
    const mediaUrl = await uploadToCloudinary(userId, compressedFile, 'image', 'stories');
    if (!mediaUrl) throw new Error("خطا در آپلود فایل استوری.");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase.from('stories').insert({ user_id: userId, media_url: mediaUrl, media_type: 'image', expires_at: expiresAt }).select().single();
    if (error) { console.error("Error creating story in DB:", error); return null; }
    return data;
}

async function fetchActiveStories(userId) {
    if (!userId) return [];
    const { data, error } = await supabase.from('stories').select('*').eq('user_id', userId).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: true });
    if (error) { console.error("Error fetching active stories:", error); return []; }
    return data;
}

async function fetchUsersFromDB() {
    const { data, error } = await supabase.from('users').select('id, username, level, xp, created_at, profilePictureUrl');
    if (error) { console.error("Error fetching users:", error.message); return []; }
    return data;
}

async function fetchUserByUsername(username) {
    const { data, error } = await supabase.from('users').select('*').ilike('username', username).single();
    if (error && error.code !== 'PGRST116') { console.error(`Error fetching user ${username}:`, error.message); return null; }
    return data;
}

async function updateUserInDB(userId, updates) {
    if (updates.xp !== undefined) {
        const { data: user, error: fetchError } = await supabase.from('users').select('level, xp').eq('id', userId).single();
        if (!fetchError && user) {
            let currentLevel = user.level || 1;
            let newTotalXp = updates.xp;
            let xpForNext = getXpForNextLevel(currentLevel);
            let leveledUp = false;
            while (newTotalXp >= xpForNext) {
                newTotalXp -= xpForNext;
                currentLevel++;
                leveledUp = true;
                xpForNext = getXpForNextLevel(currentLevel);
            }
            updates.level = currentLevel;
            updates.xp = newTotalXp;
            if (leveledUp) {
                createNotification(userId, userId, 'level_up', `تبریک! شما به سطح ${currentLevel} رسیدید.`, '#').catch(err => console.error("Failed to create level-up notification:", err));
            }
        }
    }
    const { data, error } = await supabase.from('users').update(updates).eq('id', userId).select().single();
    if (error) { console.error("Error updating user:", error.message); return null; }
    return data;
}

async function uploadProfilePicture(userId, file) {
    const compressedFile = await compressImage(file, { maxWidth: 400, quality: 0.85 });
    return await uploadToCloudinary(userId, compressedFile, 'image', 'avatars');
}

async function fetchBattlesFromDB() {
    const { data, error } = await supabase.from('battles').select('*');
    if (error) { console.error("Error fetching battles:", error.message); return []; }
    return data;
}

async function fetchShopItems() {
    const { data, error } = await supabase.from('shop_items').select('*').order('price', { ascending: true });
    if (error) { console.error("Error fetching shop items:", error); return []; }
    return data;
}

async function purchaseItem(userId, item) {
    const userProfile = await getCurrentUserProfile();
    if (!userProfile || userProfile.id !== userId) {
        return { success: false, message: "خطا در تأیید هویت کاربر." };
    }
    let finalPrice = item.price;
    if (item.discount_percent > 0 && item.discount_expires_at && new Date(item.discount_expires_at) > new Date()) {
        finalPrice = Math.round(item.price * (1 - item.discount_percent / 100));
    }
    if (userProfile.rapCoins < finalPrice) {
        return { success: false, message: "سکه کافی برای خرید این آیتم را ندارید." };
    }
    const targetColumn = item.target_column;
    if (targetColumn && !(targetColumn in userProfile)) {
        const errorMessage = `خطای پیکربندی آیتم! ستون با نام '${targetColumn}' در پروفایل کاربر وجود ندارد.`;
        return { success: false, message: errorMessage };
    }
    const updates = { rapCoins: userProfile.rapCoins - finalPrice };
    if (targetColumn && typeof item.quantity === 'number' && item.quantity > 0) {
        updates[targetColumn] = (userProfile[targetColumn] || 0) + item.quantity;
    }
    const updatedUser = await updateUserInDB(userId, updates);
    if (updatedUser) {
        return { success: true, message: `خرید ${item.name} با موفقیت انجام شد!`, data: updatedUser };
    } else {
        return { success: false, message: `خطا در پایگاه داده هنگام خرید.` };
    }
}

async function followUser(followerId, followingId) {
    const { error } = await supabase.from('follows').insert([{ follower_id: followerId, following_id: followingId }]);
    if (error) return { success: false, error };
    const actor = await supabase.from('users').select('username').eq('id', followerId).single();
    if (actor.data) {
        await createNotification(followingId, followerId, 'new_follower', `شما را دنبال کرد.`, `profile.html?user=${actor.data.username}`);
    }
    return { success: true };
}

async function unfollowUser(followerId, followingId) {
    const { error } = await supabase.from('follows').delete().match({ follower_id: followerId, following_id: followingId });
    return { success: !error, error };
}

async function checkIfFollowing(viewerId, profileId) {
    if (!viewerId) return false;
    const { data } = await supabase.from('follows').select('id').match({ follower_id: viewerId, following_id: profileId }).single();
    return !!data;
}

async function getFollowStats(userId) {
    const { count: followers } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId);
    const { count: following } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId);
    return { followers: followers || 0, following: following || 0 };
}

async function getFollowers(userId) {
    const { data: follows, error } = await supabase.from('follows').select('follower_id').eq('following_id', userId);
    if (error || !follows || follows.length === 0) return [];
    const followerIds = follows.map(item => item.follower_id);
    const { data: users, error: usersError } = await supabase.from('users').select('id, username, profilePictureUrl').in('id', followerIds);
    return usersError ? [] : users;
}

async function getFollowing(userId) {
    const { data: follows, error } = await supabase.from('follows').select('following_id').eq('follower_id', userId);
    if (error || !follows || follows.length === 0) return [];
    const followingIds = follows.map(item => item.following_id);
    const { data: users, error: usersError } = await supabase.from('users').select('id, username, profilePictureUrl').in('id', followingIds);
    return usersError ? [] : users;
}

async function getPostCount(userId) {
    const { count, error } = await supabase.from('posts').select('*', { count: 'exact', head: true }).eq('user_id', userId);
    if (error) {
        console.error("Error getting post count:", error);
        return 0;
    }
    return count;
}

async function fetchPostDetails(postId, currentUserId) {
    try {
        const { data: post, error: postError } = await supabase.from('posts').select('*').eq('id', postId).single();
        if (postError) return { success: false, error: `خطای اصلی در دریافت پست: ${postError.message}` };
        const { data: authorData, error: authorError } = await supabase.from('users').select('username, profilePictureUrl').eq('id', post.user_id).single();
        post.user = authorError ? { username: 'کاربر ناشناس', profilePictureUrl: '' } : authorData;
        const { data: comments, error: commentsError } = await supabase.from('post_comments').select('*').eq('post_id', postId).order('created_at', { ascending: true });
        if (commentsError) return { success: false, error: `خطا در خواندن لیست کامنت‌ها: ${commentsError.message}` };
        if (comments && comments.length > 0) {
            for (let i = 0; i < comments.length; i++) {
                const comment = comments[i];
                const { data: commentAuthor, error: commentAuthorError } = await supabase.from('users').select('username, profilePictureUrl').eq('id', comment.user_id).single();
                comment.user = commentAuthorError ? { username: 'کاربر ناشناس', profilePictureUrl: '' } : commentAuthor;
            }
        }
        post.comments = comments || [];
        let isLiked = false;
        if (currentUserId) {
            const { data: like } = await supabase.from('post_likes').select('post_id').match({ post_id: postId, user_id: currentUserId }).single();
            isLiked = !!like;
        }
        post.isLiked = isLiked;
        return { success: true, data: post };
    } catch (e) {
        return { success: false, error: `یک خطای غیرمنتظره در fetchPostDetails رخ داد: ${e.message}` };
    }
}

async function uploadToCloudinary(userId, file, resourceType, subfolder = '') {
    if (!file) return null;
    const folderPath = subfolder ? `${subfolder}/${userId}` : `posts/${userId}`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('folder', folderPath);
    const finalResourceType = resourceType === 'audio' ? 'video' : 'image';
    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${finalResourceType}/upload`, { method: 'POST', body: formData });
        const responseData = await response.json();
        if (!response.ok) throw new Error(responseData.error.message);
        return responseData.secure_url;
    } catch (error) {
        console.error(`Cloudinary Upload Error:`, error);
        return null;
    }
}

async function updatePost(postId, updates) {
    const { data, error } = await supabase.from('posts').update(updates).eq('id', postId).select().single();
    if (error) { console.error("Error updating post:", error); return null; }
    return data;
}

async function deletePost(postId) {
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    return !error;
}

async function toggleLike(postId, userId, isCurrentlyLiked) {
    try {
        if (isCurrentlyLiked) {
            await supabase.from('post_likes').delete().match({ post_id: postId, user_id: userId });
        } else {
            await supabase.from('post_likes').insert({ post_id: postId, user_id: userId });
        }
        const { count, error } = await supabase.from('post_likes').select('*', { count: 'exact', head: true }).eq('post_id', postId);
        if (error) throw error;
        await supabase.from('posts').update({ likes_count: count }).eq('id', postId);
        return { success: true, data: { isLiked: !isCurrentlyLiked, likes_count: count } };
    } catch (error) {
        console.error("Error toggling like:", error);
        return { success: false, error };
    }
}

async function addComment(postId, userId, commentText) {
    try {
        const { data, error } = await supabase.from('post_comments').insert({ post_id: postId, user_id: userId, comment_text: commentText }).select().single();
        if (error) throw error;
        const { count, error: countError } = await supabase.from('post_comments').select('*', { count: 'exact', head: true }).eq('post_id', postId);
        if (!countError) {
            await supabase.from('posts').update({ comments_count: count }).eq('id', postId);
        }
        return { success: true, data };
    } catch (error) {
        return { success: false, error };
    }
}

async function createNotification(recipientId, actorId, type, message, link) {
    const { error } = await supabase.from('notifications').insert([{ recipient_id: recipientId, actor_id: actorId, type, message, link, is_read: false }]);
    if (error) console.error('Error creating notification:', error.message);
}

async function fetchNotificationsForUser(userId) {
    if (!userId) return [];
    const { data, error } = await supabase.from('notifications').select(`*, actor:actor_id(username, profilePictureUrl)`).eq('recipient_id', userId).order('created_at', { ascending: false }).limit(30);
    if (error) { console.error("Error fetching notifications:", error); return []; }
    return data;
}

async function markNotificationsAsRead(userId) {
    if (!userId) return;
    await supabase.from('notifications').update({ is_read: true }).eq('recipient_id', userId).eq('is_read', false);
}

async function handleDailyLogin() {
    const user = await getCurrentUserProfile();
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];
    let missionData = user.mission_data || { last_login: "1970-01-01", progress: {}, claimed: {}, final_reward_claimed: false };
    if (missionData.last_login < today) {
        missionData.last_login = today;
        missionData.progress = { ...missionData.progress, 'daily_login': 1 };
        missionData.claimed = { ...missionData.claimed, 'daily_login': false };
        await updateUserInDB(user.id, { mission_data: missionData });
    }
}

async function incrementMissionProgress(missionId) {
    const user = await getCurrentUserProfile();
    if (!user) return;
    let missionData = user.mission_data;
    if (!missionData.progress) missionData.progress = {};
    const currentProgress = missionData.progress[missionId] || 0;
    missionData.progress[missionId] = currentProgress + 1;
    if (missionData.claimed) missionData.claimed[missionId] = false;
    await updateUserInDB(user.id, { mission_data: missionData });
}

async function claimMissionReward(missionId, mission) {
    const user = await getCurrentUserProfile();
    if (!user) return null;
    let missionData = user.mission_data || { progress: {}, claimed: {} };
    if (!missionData.claimed) missionData.claimed = {};
    missionData.claimed[missionId] = true;
    const updates = { mission_data: missionData };
    if (mission.reward.xp) updates.xp = (user.xp || 0) + mission.reward.xp;
    if (mission.reward.rapCoins) updates.rapCoins = (user.rapCoins || 0) + mission.reward.rapCoins;
    return await updateUserInDB(user.id, updates);
}

async function findOrCreateConversation(user1Id, user2Id) {
    const minId = user1Id < user2Id ? user1Id : user2Id;
    const maxId = user1Id > user2Id ? user1Id : user2Id;
    let { data: conversation, error: findError } = await supabase.from('conversations').select('*').eq('user1_id', minId).eq('user2_id', maxId).single();
    if (findError && findError.code !== 'PGRST116') {
        console.error('Error finding conversation:', findError);
        return null;
    }
    if (conversation) {
        return conversation;
    }
    const { data: newConversation, error: createError } = await supabase.from('conversations').insert({ user1_id: minId, user2_id: maxId }).select().single();
    if (createError) {
        console.error('Error creating conversation:', createError);
        return null;
    }
    return newConversation;
}

async function fetchConversationsForUser(userId) {
    const { data: conversations, error: conversationsError } = await supabase.from('conversations').select('*').or(`user1_id.eq.${userId},user2_id.eq.${userId}`);
    if (conversationsError) {
        console.error('Error fetching conversations:', conversationsError);
        throw new Error('خطا در دریافت لیست گفتگوها.');
    }
    if (!conversations || conversations.length === 0) {
        return [];
    }
    const otherUserIds = conversations.map(convo => {
        return convo.user1_id === userId ? convo.user2_id : convo.user1_id;
    });
    const { data: users, error: usersError } = await supabase.from('users').select('id, username, profilePictureUrl').in('id', otherUserIds);
    if (usersError) {
        console.error('Error fetching users for conversations:', usersError);
        throw new Error('خطا در دریافت اطلاعات کاربران گفتگو.');
    }
    const usersById = users.reduce((acc, user) => {
        acc[user.id] = user;
        return acc;
    }, {});
    return conversations.map(convo => {
        const otherUserId = convo.user1_id === userId ? convo.user2_id : convo.user1_id;
        convo.otherUser = usersById[otherUserId] || { username: 'کاربر حذف شده', profilePictureUrl: '' };
        return convo;
    });
}

async function fetchMessagesForConversation(conversationId) {
    const { data, error } = await supabase.from('messages').select('*, sender:sender_id(id, username, profilePictureUrl)').eq('conversation_id', conversationId).order('created_at', { ascending: true });
    if (error) {
        console.error('Error fetching messages:', error);
        return [];
    }
    return data;
}

async function createBattleInDB(battleData) {
    const { data, error } = await supabase.from('battles').insert([battleData]).select().single();
    if (error) {
        console.error("Error creating battle:", error.message);
        return null;
    }
    return data;
}

async function fetchBattleById(battleId) {
    const { data, error } = await supabase.from('battles').select('*').eq('id', battleId).single();
    if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
        console.error("Error fetching battle by ID:", error.message);
        return null;
    }
    return data;
}

async function updateBattleInDB(battleId, updates) {
    const { data, error } = await supabase.from('battles').update(updates).eq('id', battleId).select().single();
    if (error) {
        console.error("Error updating battle:", error.message);
        return false;
    }
    return true;
}

async function deleteBattleInDB(battleId) {
    const { error } = await supabase.from('battles').delete().eq('id', battleId);
    if (error) {
        console.error("Error deleting battle:", error.message);
        return false;
    }
    return true;
}

async function sendMessage(conversationId, senderId, content) {
    const { data, error } = await supabase.from('messages').insert({ conversation_id: conversationId, sender_id: senderId, content: content.trim() }).select().single();
    if (error) {
        console.error('Error sending message:', error);
        return null;
    }
    return data;
}

async function fetchPendingBattleRequests(username) {
    const { data, error } = await supabase
        .from('battles')
        .select('*')
        .or(`player1.eq.${username},player2.eq.${username}`) // Either player1 or player2
        .eq('status', 'pending');
    if (error) {
        console.error("Error fetching pending battle requests:", error.message);
        return [];
    }
    return data;
}

async function fetchActiveBattles(username) {
    const { data, error } = await supabase
        .from('battles')
        .select('*')
        .or(`player1.eq.${username},player2.eq.${username}`)
        .eq('status', 'active');
    if (error) {
        console.error("Error fetching active battles:", error.message);
        return [];
    }
    return data;
}

async function fetchCompletedBattles(username) {
    const { data, error } = await supabase
        .from('battles')
        .select('*')
        .or(`player1.eq.${username},player2.eq.${username}`)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false }); // Order by completion date
    if (error) {
        console.error("Error fetching completed battles:", error.message);
        return [];
    }
    return data;
}

async function createBattleRequest(player1Username, player2Username, totalRounds) {
    const { data, error } = await supabase.from('battles').insert({
        player1: player1Username,
        player2: player2Username,
        status: 'pending',
        currentRound: 1,
        rounds: { total: totalRounds, player1_score: 0, player2_score: 0 }
    }).select().single();
    if (error) {
        console.error("Error creating battle request:", error.message);
        return null;
    }
    return data;
}

async function acceptBattleRequest(battleId) {
    const { data, error } = await supabase.from('battles').update({ status: 'active' }).eq('id', battleId).select().single();
    if (error) {
        console.error("Error accepting battle request:", error.message);
        return false;
    }
    return true;
}

async function rejectBattleRequest(battleId) {
    const { error } = await supabase.from('battles').delete().eq('id', battleId);
    if (error) {
        console.error("Error rejecting battle request:", error.message);
        return false;
    }
    return true;
}

async function fetchBattleRounds(battleId) {
    const { data, error } = await supabase.from('battle_rounds').select('*').eq('battle_id', battleId).order('round_number', { ascending: true });
    if (error) {
        console.error("Error fetching battle rounds:", error.message);
        return [];
    }
    return data;
}

async function addBattleRound(roundData) {
    const { data, error } = await supabase.from('battle_rounds').insert([roundData]).select().single();
    if (error) {
        console.error("Error adding battle round:", error.message);
        return null;
    }
    return data;
}

async function hasUserVotedForRound(roundId, userId) {
    const { data, error } = await supabase.from('battle_votes').select('id').eq('round_id', roundId).eq('voter_id', userId).single();
    if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
        console.error("Error checking user vote:", error.message);
        return false;
    }
    return !!data;
}

async function fetchRoundVotes(roundId) {
    const { data, error } = await supabase.from('battle_votes').select('*').eq('round_id', roundId);
    if (error) {
        console.error("Error fetching round votes:", error.message);
        return [];
    }
    return data;
}

async function addBattleVote(voteData) {
    const { data, error } = await supabase.from('battle_votes').insert([voteData]).select().single();
    if (error) {
        console.error("Error adding battle vote:", error.message);
        return false;
    }
    return true;
}

async function fetchBattleParticipants(player1Username, player2Username) {
    const { data: users, error } = await supabase.from('users').select('id, username').in('username', [player1Username, player2Username]);
    if (error) {
        console.error("Error fetching battle participants:", error.message);
        return null;
    }
    const player1Id = users.find(u => u.username === player1Username)?.id;
    const player2Id = users.find(u => u.username === player2Username)?.id;
    return { player1Id, player2Id };
}


// Export all functions that need to be accessed from other files
export {
    compressImage,
    createStory,
    fetchActiveStories,
    fetchUsersFromDB,
    fetchUserByUsername,
    updateUserInDB,
    uploadProfilePicture,
    fetchBattlesFromDB,
    fetchShopItems,
    purchaseItem,
    followUser,
    unfollowUser,
    checkIfFollowing,
    getFollowStats,
    getFollowers,
    getFollowing,
    getPostCount,
    fetchPostDetails,
    uploadToCloudinary,
    updatePost,
    deletePost,
    toggleLike,
    addComment,
    createNotification,
    fetchNotificationsForUser,
    markNotificationsAsRead,
    handleDailyLogin,
    incrementMissionProgress,
    claimMissionReward,
    findOrCreateConversation,
    fetchConversationsForUser,
    fetchMessagesForConversation,
    createBattleInDB,
    fetchBattleById,
    updateBattleInDB,
    deleteBattleInDB,
    sendMessage,
    fetchPendingBattleRequests,
    fetchActiveBattles,
    fetchCompletedBattles,
    createBattleRequest,
    acceptBattleRequest,
    rejectBattleRequest,
    fetchBattleRounds,
    addBattleRound,
    hasUserVotedForRound,
    fetchRoundVotes,
    addBattleVote,
    fetchBattleParticipants
};


