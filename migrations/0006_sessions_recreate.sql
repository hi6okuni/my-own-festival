-- 既存のテーブルを削除
DROP TABLE IF EXISTS sessions;

-- 新しいテーブルを作成
CREATE TABLE sessions
(
    id TEXT not null primary key,
    user_id TEXT not null,
    expires_at TIMESTAMP not null,
    FOREIGN KEY (user_id) REFERENCES spotify_users (id)
);