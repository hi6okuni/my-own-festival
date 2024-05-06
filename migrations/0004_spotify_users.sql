create table spotify_users
(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    spotify_id INTEGER not null unique,
    username TEXT not null
);