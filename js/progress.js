import { supabase, isConfigured } from "./supabaseClient.js";
import { saveGuestProfile } from "./auth.js";

const GUEST_PROGRESS_KEY = "farsi_game_guest_progress";

function loadGuestProgress() {
  const raw = localStorage.getItem(GUEST_PROGRESS_KEY);
  return raw ? JSON.parse(raw) : {};
}
function saveGuestProgressMap(map) {
  localStorage.setItem(GUEST_PROGRESS_KEY, JSON.stringify(map));
}

// جلب الملف الشخصي (XP، اسم المستخدم...)
export async function getProfile(user) {
  if (!isConfigured || user.isGuest) {
    const raw = localStorage.getItem("farsi_game_guest_profile");
    return raw ? JSON.parse(raw) : { id: "guest", username: "ضيف", xp: 0 };
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return data;
}

// إضافة نقاط خبرة (XP) للمستخدم الحالي
export async function addXp(user, amount) {
  if (!isConfigured || user.isGuest) {
    const profile = JSON.parse(localStorage.getItem("farsi_game_guest_profile") || '{"xp":0}');
    profile.xp = (profile.xp || 0) + amount;
    saveGuestProfile(profile);
    return profile.xp;
  }
  const { data: current } = await supabase.from("profiles").select("xp").eq("id", user.id).single();
  const newXp = (current?.xp || 0) + amount;
  await supabase.from("profiles").update({ xp: newXp, last_played: new Date().toISOString().slice(0, 10) }).eq("id", user.id);
  return newXp;
}

// تسجيل إتقان عنصر تعليمي (حرف / كلمة / جملة)
export async function markItem(user, itemType, itemId, mastered = true) {
  if (!isConfigured || user.isGuest) {
    const map = loadGuestProgress();
    const key = `${itemType}:${itemId}`;
    map[key] = { mastered, timesSeen: (map[key]?.timesSeen || 0) + 1 };
    saveGuestProgressMap(map);
    return;
  }
  await supabase.from("progress").upsert(
    {
      user_id: user.id,
      item_type: itemType,
      item_id: itemId,
      mastered,
      times_seen: 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,item_type,item_id" }
  );
}

// تسجيل نتيجة جلسة لعب (اختبار / بطاقات / درس)
export async function logScore(user, gameMode, score, xpEarned) {
  if (!isConfigured || user.isGuest) return;
  await supabase.from("scores").insert({
    user_id: user.id,
    game_mode: gameMode,
    score,
    xp_earned: xpEarned,
  });
}

// جلب كل عناصر التقدّم الخاصة بالمستخدم كخريطة {type:id -> mastered}
export async function getAllProgress(user) {
  if (!isConfigured || user.isGuest) {
    return loadGuestProgress();
  }
  const { data, error } = await supabase.from("progress").select("*").eq("user_id", user.id);
  if (error) throw error;
  const map = {};
  for (const row of data) {
    map[`${row.item_type}:${row.item_id}`] = { mastered: row.mastered, timesSeen: row.times_seen };
  }
  return map;
}

// لوحة الصدارة: أعلى 20 مستخدمًا حسب نقاط الخبرة
export async function getLeaderboard() {
  if (!isConfigured) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("username, xp")
    .order("xp", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data;
}
