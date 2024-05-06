import { Hono } from "hono";
import type { FC } from "hono/jsx";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { User, Session } from "lucia";
import { Scrypt } from "lucia";
import { csrf } from "hono/csrf";
import { getCookie } from "hono/cookie";
import {
	generateEmailVerificationCode,
	initializeLucia,
	verifyVerificationCode,
} from "./auth";
import { generateIdFromEntropySize } from "lucia";

type Bindings = {
	DB: D1Database;
	SPOTIFY_CLIENT_ID: string;
	SPOTIFY_CLIENT_SECRET: string;
};

const app = new Hono<{
	Bindings: Bindings;
	Variables: {
		user: User | null;
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
	c.set("user", user);
	c.set("session", session);
	return next();
});

const Layout: FC = (props) => {
	return (
		<html lang="en">
			<body>{props.children}</body>
		</html>
	);
};

app.get("/", (c) => {
	const user = c.get("user");
	if (user) {
		return c.html(
			<Layout>
				<h1>Hello, World!</h1>
				{user.emailVerified ? (
					<p>Welcome, {user.id}</p>
				) : (
					<form method="post" action="/email-verification">
						<input name="code" />
						<button type="submit">Verify</button>
					</form>
				)}
				<form method="post" action="/logout">
					<button type="submit">Logout</button>
				</form>
			</Layout>,
		);
	}
	return c.html(
		<Layout>
			<h1>Hello, World!</h1>
			<a href="/signup">signup</a>
			<br />
			<a href="/login">login</a>
		</Layout>,
	);
});

app.get("/signup", (c) => {
	return c.html(
		<Layout>
			<h1>Signup</h1>
			<form method="post">
				<input type="text" name="email" placeholder="Email" />
				<input type="password" name="password" placeholder="Password" />
				<button type="submit">Signup</button>
			</form>
		</Layout>,
	);
});

app.get("/login", (c) => {
	return c.html(
		<Layout>
			<h1>Login</h1>
			<form method="post">
				<input type="text" name="email" placeholder="Email" />
				<input type="password" name="password" placeholder="Password" />
				<button type="submit">Login</button>
			</form>
		</Layout>,
	);
});

app.post(
	"/signup",
	zValidator(
		"form",
		z.object({
			email: z.string().email(),
			password: z.string().min(8),
		}),
	),
	async (c) => {
		const { email, password } = c.req.valid("form");
		const lucia = initializeLucia(c.env.DB);
		const passwordHash = await new Scrypt().hash(password);
		const userId = generateIdFromEntropySize(10); // 16 characters long
		try {
			const insertedUser = c.env.DB.prepare(
				"INSERT INTO users (id, email, hashed_password, email_verified) VALUES (?, ?, ?, ?) RETURNING *",
			)
				.bind(userId, email, passwordHash, false)
				.first();

			console.log("insertedUser:", insertedUser);

			const verificationCode = await generateEmailVerificationCode(
				c.env.DB,
				userId,
				email,
			);
			// await sendVerificationCode(email, verificationCode);
			console.log("verificationCode:", verificationCode);

			const session = await lucia.createSession(userId, {});
			const sessionCookie = lucia.createSessionCookie(session.id);
			c.header("Set-Cookie", sessionCookie.serialize(), {
				append: true,
			});
			return c.redirect("/");
		} catch (e) {
			console.error(e);
			return c.body("Somthing went wrong", 400);
		}
	},
);

type UserRow = {
	id: string;
	email: string;
	hashed_password: string;
	email_verified: number;
};

app.post(
	"/login",
	zValidator(
		"form",
		z.object({
			email: z.string().email(),
			password: z.string().min(8),
		}),
	),
	async (c) => {
		const { email, password } = c.req.valid("form");
		const lucia = initializeLucia(c.env.DB);

		const user = await c.env.DB.prepare("SELECT * FROM users where email = ?")
			.bind(email)
			.first<UserRow>();

		if (!user) {
			return c.body("Invalid email or password", 404);
		}

		const validPassword = await new Scrypt().verify(
			user.hashed_password,
			password,
		);
		if (!validPassword) {
			return c.body("Invalid email or password", 400);
		}

		const session = await lucia.createSession(user.id, {});
		const sessionCookie = lucia.createSessionCookie(session.id);
		c.header("Set-Cookie", sessionCookie.serialize(), {
			append: true,
		});
		return c.redirect("/");
	},
);

app.post("/logout", async (c) => {
	const lucia = initializeLucia(c.env.DB);
	const session = c.get("session");
	if (session) {
		await lucia.invalidateSession(session.id);
	}
	const sessionCookie = lucia.createBlankSessionCookie();
	c.header("Set-Cookie", sessionCookie.serialize(), {
		append: true,
	});
	return c.redirect("/");
});

app.post(
	"/email-verification",
	zValidator(
		"form",
		z.object({
			code: z.string().min(1),
		}),
	),
	async (c) => {
		const user = c.get("user");
		if (!user) {
			return c.body("Unauthorized", 401);
		}
		const { code } = c.req.valid("form");
		const isValidCode = await verifyVerificationCode(c.env.DB, user, code);
		if (!isValidCode) {
			return c.body("Invalid code", 400);
		}

		const lucia = initializeLucia(c.env.DB);
		await lucia.invalidateUserSessions(user.id);
		await c.env.DB.prepare(
			"UPDATE users SET email_verified = true WHERE id = ?",
		)
			.bind(user.id)
			.run();

		const session = await lucia.createSession(user.id, {});
		const sessionCookie = lucia.createSessionCookie(session.id);
		c.header("Set-Cookie", sessionCookie.serialize(), {
			append: true,
		});
		return c.redirect("/");
	},
);

export default app;
