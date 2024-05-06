import { Buffer } from "node:buffer";

// キーのインポート
export async function importKey(base64Key: string): Promise<CryptoKey> {
	const keyBuffer = Buffer.from(base64Key, "base64");
	return await crypto.subtle.importKey(
		"raw",
		keyBuffer,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
}

// 暗号化関数
export async function encryptData(
	data: string,
	key: CryptoKey,
	iv: Uint8Array,
): Promise<string> {
	const encoded = new TextEncoder().encode(data);
	const encrypted = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
		key,
		encoded,
	);
	return Buffer.from(encrypted).toString("base64");
}

// 復号関数
export async function decryptData(
	encryptedData: string,
	key: CryptoKey,
	iv: Uint8Array,
): Promise<string> {
	const data = Buffer.from(encryptedData, "base64");
	const decrypted = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
		key,
		data,
	);
	return new TextDecoder().decode(decrypted);
}
