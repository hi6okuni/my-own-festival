import { Spotify } from "arctic";

export const createSpotify = (clientId: string, clientSecret: string) => {
	return new Spotify(
		clientId,
		clientSecret,
		"http://localhost:8787/login/spotify/callback",
	);
};
