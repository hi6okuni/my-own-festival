-- Migration number: 0003 	 2024-05-03T08:46:33.173Z
-- 既存のテーブルを削除
DROP TABLE IF EXISTS email_verification_codes;

-- 新しいテーブルを作成
CREATE TABLE email_verification_codes
(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL
);