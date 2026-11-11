import Constants from 'expo-constants';

type Extra = { apiUrl?: string; webUrl?: string };
const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

/**
 * API base URL including `/api/v1`. Override for local testing with
 * EXPO_PUBLIC_API_URL (e.g. http://192.168.1.20:4000/api/v1 — use your
 * computer's LAN address, not localhost, when testing on a phone).
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || extra.apiUrl || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

/** The website, used for links the app hands off to (paid checkout, full festival page). */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || extra.webUrl || 'https://parvsetu-web.vercel.app').replace(/\/+$/, '');
