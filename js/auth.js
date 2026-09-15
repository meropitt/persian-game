import { supabase, isConfigured } from "./supabaseClient.js";

const GUEST_KEY = "farsi_game_guest_profile";

// وضع "ضيف" محلي يعمل بدون Supabase (عندما لا يضبط المستخدم بيانات الاتصال بعد)
function getGuestProfile() {
  const raw = localStorage.getItem(GUEST_KEY);
  if (raw) return JSON.parse(raw);
  const profile = { id: "guest", username: "ضيف", xp: 0, isGuest: true };
  localStorage.setItem(GUEST_KEY, JSON.stringify(profile));
  return profile;
}

export function saveGuestProfile(profile) {
  localStorage.setItem(GUEST_KEY, JSON.stringify(profile));
}

export async function getCurrentUser() {
  if (!isConfigured) return getGuestProfile();
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

export async function signUp(email, password, username) {
  if (!isConfigured) throw new Error("NOT_CONFIGURED");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  if (!isConfigured) throw new Error("NOT_CONFIGURED");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (!isConfigured) return;
  await supabase.auth.signOut();
}

export function onAuthChange(callback) {
  if (!isConfigured) return;
  supabase.auth.onAuthStateChange((_event, session) => callback(session));
}
