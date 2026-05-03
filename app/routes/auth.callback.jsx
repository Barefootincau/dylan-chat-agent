import { getCodeVerifier, storeCustomerToken, getCustomerAccountUrls } from "../db.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const [conversationId] = state.split("-");

  if (!code) {
    return new Response(JSON.stringify({ error: "Authorization code is missing" }), { status: 400 });
  }

  try {
    const tokenResponse = await exchangeCodeForToken(code, state);

    try {
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + tokenResponse.expires_in);
      await storeCustomerToken(conversationId, tokenResponse.access_token, expiresAt);
    } catch (error) {
      console.error('Failed to store token in database:', error);
    }

    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Successful</title>
        <script>
          window.onload = function() {
            document.getElementById('message').style.display = 'block';
            setTimeout(function() {
              window.close();
              document.getElementById('fallback').style.display = 'block';
            }, 1500);
          }
        </script>
        <style>
          body { font-family: system-ui, sans-serif; text-align: center; padding-top: 100px; }
          #message { display: none; }
          #fallback { display: none; margin-top: 20px; }
          .success { color: green; font-size: 18px; }
        </style>
      </head>
      <body>
        <div id="message">
          <h2>Authentication Successful!</h2>
          <p class="success">You've been authenticated successfully</p>
          <p>This window will close automatically.</p>
        </div>
        <div id="fallback">
          <p>If this window didn't close automatically, you can close it and return to your conversation.</p>
        </div>
      </body>
      </html>
    `, { headers: { "Content-Type": "text/html" } });
  } catch (error) {
    console.error("Error exchanging code for token:", error);
    return new Response(JSON.stringify({ error: "Failed to obtain access token" }), { status: 500 });
  }
}

async function exchangeCodeForToken(code, state) {
  const clientId = process.env.SHOPIFY_API_KEY;
  const [conversationId] = state.split("-");

  if (!clientId) {
    throw new Error("SHOPIFY_API_KEY environment variable is required");
  }

  const redirectUri = process.env.REDIRECT_URL;
  const tokenUrl = await getTokenUrl(conversationId);

  if (!tokenUrl) {
    throw new Error("Token URL not found");
  }

  let codeVerifier = "";
  try {
    const verifierRecord = await getCodeVerifier(state);
    if (verifierRecord) {
      codeVerifier = verifierRecord.verifier;
    }
  } catch (error) {
    console.error("Error retrieving code verifier:", error);
  }

  const requestBody = {
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: redirectUri
  };

  if (codeVerifier) {
    requestBody.code_verifier = codeVerifier;
  }

  const formData = new URLSearchParams();
  for (const [key, value] of Object.entries(requestBody)) {
    formData.append(key, value);
  }

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

async function getTokenUrl(conversationId) {
  const urls = await getCustomerAccountUrls(conversationId);
  return urls?.tokenUrl || null;
}
