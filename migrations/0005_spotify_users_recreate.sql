-- 既存のテーブルを削除
DROP TABLE IF EXISTS spotify_users;

-- 新しいテーブルを作成
CREATE TABLE spotify_users
(
    id TEXT PRIMARY KEY,
    spotify_id TEXT not null unique,
    username TEXT not null
);