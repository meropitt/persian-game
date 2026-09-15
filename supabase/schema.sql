-- ============================================================
-- مخطط قاعدة البيانات للعبة تعلم الفارسية
-- انسخ هذا الملف بالكامل والصقه في: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- جدول الملفات الشخصية (يرتبط تلقائيًا بمستخدمي Supabase Auth)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  xp integer not null default 0,
  streak integer not null default 0,
  last_played date,
  created_at timestamptz not null default now()
);

-- جدول تقدّم المستخدم في كل عنصر تعليمي (حرف / كلمة / جملة)
create table if not exists public.progress (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null,        -- 'alphabet' | 'vocab' | 'sentence'
  item_id text not null,          -- معرف العنصر داخل بيانات اللعبة
  mastered boolean not null default false,
  times_seen integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (user_id, item_type, item_id)
);

-- جدول نتائج جلسات الألعاب (اختبارات / دروس) لأغراض الإحصاء
create table if not exists public.scores (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  game_mode text not null,        -- 'quiz' | 'flashcards' | 'lesson'
  score integer not null default 0,
  xp_earned integer not null default 0,
  played_at timestamptz not null default now()
);

-- ============================================================
-- تفعيل أمان مستوى الصفوف (RLS)
-- ============================================================
alter table public.profiles enable row level security;
alter table public.progress enable row level security;
alter table public.scores enable row level security;

-- الملفات الشخصية: القراءة عامة (مطلوبة للوحة الصدارة)، والتعديل لصاحب الحساب فقط
drop policy if exists "profiles are publicly readable" on public.profiles;
create policy "profiles are publicly readable"
  on public.profiles for select using (true);

drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

drop policy if exists "users can insert their own profile" on public.profiles;
create policy "users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- التقدّم: خاص بكل مستخدم فقط
drop policy if exists "users manage their own progress" on public.progress;
create policy "users manage their own progress"
  on public.progress for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- النتائج: خاصة بكل مستخدم فقط
drop policy if exists "users manage their own scores" on public.scores;
create policy "users manage their own scores"
  on public.scores for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- إنشاء ملف شخصي تلقائيًا عند تسجيل مستخدم جديد
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- فهرس مساعد للوحة الصدارة
-- ============================================================
create index if not exists profiles_xp_idx on public.profiles (xp desc);
