-- ============================================================
--  ゾンビシューティング：アカウントの進み具合を置くテーブル
--
--  Supabase のダッシュボード → SQL Editor に、この中身をぜんぶ貼って
--  「Run」を押してください。1回だけでOKです。
--  （何回流しても壊れないように書いてあります）
-- ============================================================

-- 1人1行。id は Supabase のログイン情報（auth.users）とひもづく
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  -- 画面に出るなまえ
  name       text not null,
  -- コイン・武器のレベル・買ったものをまとめて入れる
  data       jsonb,
  updated_at timestamptz not null default now()
);

-- ここから下がだいじ。
-- RLS（行ごとの鍵）を掛けて、「自分の行しか触れない」ようにする。
-- これを忘れると、ブラウザに置いてある公開キーだけで
-- 他の人のコインを書きかえられてしまう。
alter table public.profiles enable row level security;

drop policy if exists "read own profile"   on public.profiles;
drop policy if exists "insert own profile" on public.profiles;
drop policy if exists "update own profile" on public.profiles;

-- 読めるのは自分の行だけ
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

-- 作れるのは自分の行だけ
create policy "insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- 書きかえられるのも自分の行だけ
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- 消す許可はどこにも出していないので、ブラウザからは誰の行も消せない。

-- 確かめ用：エラーが出なければ準備できています
select 'profiles テーブルの準備ができました' as result;
