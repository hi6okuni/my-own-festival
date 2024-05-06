import { Hono } from "hono";
import type { User, Session } from "lucia";
import { csrf } from "hono/csrf";
import { getCookie, setCookie } from "hono/cookie";
import { initializeLucia } from "./auth";
import { generateIdFromEntropySize } from "lucia";
import { createSpotify } from "./spotify";
import { OAuth2RequestError, generateState } from "arctic";
import type { SpotifyUserDB } from "./type/spotify_users";
import { Layout } from "./ui/Layout";
import { decryptData, encryptData, importKey } from "./util";
import { Buffer } from "node:buffer";

type Bindings = {
	DB: D1Database;
	SPOTIFY_CLIENT_ID: string;
	SPOTIFY_CLIENT_SECRET: string;
	KEY_BASE64: string;
	IV_BASE64: string;
};

type SpotifyUser = User & {
	spotifyId: string;
	username: string;
};

type SessionWithAttributes = Session & {
	accessToken: string;
	refreshToken: string;
	accessTokenExpiresAt: string;
};

const app = new Hono<{
	Bindings: Bindings;
	Variables: {
		user: SpotifyUser | null;
		session: Session | null;
	};
}>();

// middleware
app.use(csrf());
app.use("*", async (c, next) => {
	const lucia = initializeLucia(c.env.DB);
	const sessionId = getCookie(c, lucia.sessionCookieName) ?? null;
	if (!sessionId) {
		c.set("user", null);
		c.set("session", null);
		return next();
	}
	const { session, user } = await lucia.validateSession(sessionId);
	if (session?.fresh) {
		// use `header()` instead of `setCookie()` to avoid TS errors
		c.header("Set-Cookie", lucia.createSessionCookie(session.id).serialize(), {
			append: true,
		});
	}
	if (!session) {
		c.header("Set-Cookie", lucia.createBlankSessionCookie().serialize(), {
			append: true,
		});
	}

	c.set("user", user as SpotifyUser);
	c.set("session", session);
	return next();
});

app.get("/", (c) => {
	const user = c.get("user");
	if (user) {
		return c.html(
			<Layout>
				<h1>hello, {user.username}</h1>
				<form action="/logout" method="post">
					<button type="submit">Sign out</button>
				</form>
			</Layout>,
		);
	}

	return c.html(
		<Layout>
			<h1>hello, this is my own festival</h1>
			<a href="/login">first, you need to sign in by spotify</a>
		</Layout>,
	);
});

app.get("/login", (c) => {
	return c.html(
		<Layout>
			<h1>Sign in</h1>
			<a href="/login/spotify">Sign in with Spotify</a>
		</Layout>,
	);
});

app.get("/login/spotify", async (c) => {
	const spotify = createSpotify(
		c.env.SPOTIFY_CLIENT_ID,
		c.env.SPOTIFY_CLIENT_SECRET,
	);
	const state = generateState();
	const url = await spotify.createAuthorizationURL(state, {
		scopes: ["user-top-read"],
	});

	setCookie(c, "spotify_oauth_state", state, {
		path: "/",
		secure: false,
		httpOnly: true,
		maxAge: 60 * 10,
		sameSite: "Lax",
	});
	return c.redirect(url.toString());
});

app.get("/login/spotify/callback", async (c) => {
	const code = c.req.query("code");
	const state = c.req.query("state");
	const storedState = getCookie(c, "spotify_oauth_state");
	if (!code || !state || state !== storedState) {
		return c.body("Invalid state or code", 400);
	}

	const spotify = createSpotify(
		c.env.SPOTIFY_CLIENT_ID,
		c.env.SPOTIFY_CLIENT_SECRET,
	);

	try {
		const tokens = await spotify.validateAuthorizationCode(code);
		const spotifyUserResponse = await fetch("https://api.spotify.com/v1/me", {
			headers: {
				Authorization: `Bearer ${tokens.accessToken}`,
			},
		});
		const spotifyUser: SpotifyAPIUser = await spotifyUserResponse.json();

		// check if the user is already in the database
		const existingUser = await c.env.DB.prepare(
			"SELECT * FROM spotify_users where spotify_id = ?",
		)
			.bind(spotifyUser.id)
			.first<SpotifyUserDB>();

		const lucia = initializeLucia(c.env.DB);

		// encrypt access token
		const key = await importKey(c.env.KEY_BASE64);
		const iv = Buffer.from(c.env.IV_BASE64, "base64");
		const encryptedAccessToken = await encryptData(tokens.accessToken, key, iv);
		const encryptedRefreshToken = await encryptData(
			tokens.refreshToken,
			key,
			iv,
		);

		if (existingUser) {
			const session = await lucia.createSession(existingUser.id.toString(), {
				accessToken: encryptedAccessToken,
				refreshToken: encryptedRefreshToken,
				accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
			});
			const sessionCookie = lucia.createSessionCookie(session.id);
			c.header("Set-Cookie", sessionCookie.serialize(), {
				append: true,
			});
			return c.redirect("/");
		}
		// create a new user
		const userId = generateIdFromEntropySize(10);
		await c.env.DB.prepare(
			"INSERT INTO spotify_users (id, spotify_id, username) VALUES (?, ?, ?)",
		)
			.bind(userId, spotifyUser.id, spotifyUser.display_name)
			.run();
		const session = await lucia.createSession(userId.toString(), {
			accessToken: encryptedAccessToken,
			refreshToken: encryptedRefreshToken,
			accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
		});
		const sessionCookie = lucia.createSessionCookie(session.id);
		c.header("Set-Cookie", sessionCookie.serialize(), {
			append: true,
		});

		return c.redirect("/");
	} catch (e) {
		if (e instanceof OAuth2RequestError) {
			return c.body("Invalid auth", 400);
		}
		console.error(e);
		return c.body("Internal server error", 500);
	}
});

app.get("/favorites", async (c) => {
	const user = c.get("user");
	if (!user) {
		return c.redirect("/login");
	}

	const session = c.get("session") as SessionWithAttributes;
	const key = await importKey(c.env.KEY_BASE64);
	const iv = Buffer.from(c.env.IV_BASE64, "base64");
	const decryptedAccessToken = await decryptData(session.accessToken, key, iv);

	const spotifyUserResponse = await fetch(
		"https://api.spotify.com/v1/me/top/artists",
		{
			headers: {
				Authorization: `Bearer ${decryptedAccessToken}`,
			},
		},
	);

	const favoriteArtists = await spotifyUserResponse.json();
	const sortedArtists = favoriteArtists.items.sort(
		(a: any, b: any) => b.popularity - a.popularity,
	);

	return c.html(
		<Layout>
			<h1>My favorite artists</h1>
			{sortedArtists.map((artist: any) => (
				<div key={artist.name}>
					<h2>{artist.name}</h2>
					<img src={artist.images[0].url} alt={artist.name} />
				</div>
			))}
		</Layout>,
	);
});

app.post("/logout", async (c) => {
	const lucia = initializeLucia(c.env.DB);
	const session = getCookie(c, lucia.sessionCookieName);
	if (session) {
		await lucia.invalidateSession(session);
		c.header("Set-Cookie", lucia.createBlankSessionCookie().serialize(), {
			append: true,
		});
	}
	return c.redirect("/");
});

export default app;
