-- Migration number: 0002 	 2024-05-03T08:12:49.105Z
create table email_verification_codes
(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT not null,
    email TEXT not null,
    code TEXT not null,
    expires_at TIMESTAMP not null
);

alter table users add column email_verified BOOLEAN default false;