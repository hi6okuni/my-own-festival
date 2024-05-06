import { Lucia } from "lucia";
import { D1Adapter } from "@lucia-auth/adapter-sqlite";

export function initializeLucia(D1: D1Database) {
	const adapter = new D1Adapter(D1, {
		user: "spotify_users",
		session: "sessions",
	});
	return new Lucia(adapter, {
		sessionCookie: {
			attributes: {
				secure: false, // set `Secure` flag in HTTPS
			},
		},
		getUserAttributes: (attributes) => {
			return {
				// we don't need to expose the password hash!
				spotifyId: attributes.spotify_id,
				username: attributes.username,
			};
		},
		getSessionAttributes: (attributes) => {
			return {
				accessToken: attributes.accessToken,
				refreshToken: attributes.refreshToken,
				accessTokenExpiresAt: attributes.accessTokenExpiresAt,
			};
		},
	});
}

declare module "lucia" {
	interface Register {
		Auth: ReturnType<typeof initializeLucia>;
		DatabaseUserAttributes: DatabaseUserAttributes;
		DatabaseSessionAttributes: DatabaseSessionAttributes;
	}
}

interface DatabaseUserAttributes {
	spotify_id: string;
	username: string;
}

interface DatabaseSessionAttributes {
	accessToken: string;
	refreshToken: string;
	accessTokenExpiresAt: string;
}
// function createDate(duration: { value: number }) {
// 	const now = new Date();
// 	now.setMinutes(now.getMinutes() + duration.value); // duration.valueは分単位であると仮定
// 	return now.toISOString();
// }

// export async function generateEmailVerificationCode(
// 	db: D1Database,
// 	userId: string,
// 	email: string,
// ): Promise<string> {
// 	await db
// 		.prepare("DELETE FROM email_verification_codes WHERE user_id = ?")
// 		.bind(userId)
// 		.run();
// 	const code = generateRandomString(8, alphabet("0-9"));
// 	await db
// 		.prepare(
// 			"INSERT INTO email_verification_codes (user_id, email, code, expires_at) VALUES (?, ?, ?, ?)",
// 		)
// 		.bind(userId, email, code, createDate({ value: 15 }))
// 		.run();

// 	return code;
// }

// type EmailVerificationCode = {
// 	id: number;
// 	email: string;
// 	code: string;
// 	expires_at: string;
// };

// export async function verifyVerificationCode(
// 	db: D1Database,
// 	user: User,
// 	code: string,
// ): Promise<boolean> {
// 	const databaseCode = await db
// 		.prepare(
// 			"DELETE FROM email_verification_codes WHERE user_id = ? AND code = ? AND email = ? returning *",
// 		)
// 		.bind(user.id, code, user.email)
// 		.first<EmailVerificationCode>();

// 	if (!databaseCode) {
// 		return false;
// 	}

// 	if (!isWithinExpirationDate(new Date(databaseCode.expires_at))) {
// 		return false;
// 	}

// 	return true;
// }
