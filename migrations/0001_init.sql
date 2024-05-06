-- Migration number: 0001 	 2024-05-02T07:22:26.662Z
create table users
(
    id TEXT not null primary key,
    email TEXT not null unique,
    hashed_password TEXT not null
);

create table sessions
(
    id TEXT not null primary key,
    user_id TEXT not null,
    expires_at TIMESTAMP not null,
    FOREIGN KEY (user_id) REFERENCES users (id)
);