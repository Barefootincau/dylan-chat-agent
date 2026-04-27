/**
 * Authentication service for handling OAuth and PKCE flows
 */

export async function generateAuthUrl(conversationId, shopId) {
  const { storeCodeVerifier } = await import('./db.server');

  const clientId = process.env.SHOPIFY_API_KEY;
  const scope = "customer-account-mcp-api:full";
  const responseType = "code";
  const redirectUri = process.env.REDIRECT_URL;
  const state = `${conversationId}-${shopId}-${Date.now()}`;

  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);

  try {
    await storeCodeVerifier(state, verifier);
  } catch (error) {
    console.error('Failed to store code verifier:', error);
  }

  const codeChallengeMethod = "S256";
  const baseAuthUrl = await getBaseAuthUrl(conversationId);

  if (!baseAuthUrl) {
    throw new Error('Base auth URL not found');
  }

  const authUrl = `${baseAuthUrl}?client_id=${clientId}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=${responseType}&state=${state}&code_challenge=${challenge}&code_challenge_method=${codeChallengeMethod}`;

  return {
    url: authUrl,
    conversation_id: conversationId
  };
}

async function getBaseAuthUrl(conversationId) {
  const { getCustomerAccountUrls } = await import('./db.server');
  const { authorizationUrl } = await getCustomerAccountUrls(conversationId);
  return authorizationUrl;
}

export function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const randomString = convertBufferToString(array);
  return base64UrlEncode(randomString);
}

export async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digestOp = await crypto.subtle.digest('SHA-256', data);
  const hash = convertBufferToString(digestOp);
  return base64UrlEncode(hash);
}

function convertBufferToString(buffer) {
  const uintArray = new Uint8Array(buffer);
  const numberArray = Array.from(uintArray);
  return String.fromCharCode.apply(null, numberArray);
}

function base64UrlEncode(str) {
  let base64 = btoa(str);
  base64 = base64.replace(/\+/g, "-")
                 .replace(/\//g, "_")
                 .replace(/=+$/, "");
  return base64;
}
