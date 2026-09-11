// GameSlot Pro - Cloudflare Worker entrypoint

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function randomBase64Url(byteLength = 48) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function startGoogleLogin(env) {
  const supabaseUrl = String(env.SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");

  const serviceKey = String(env.SUPABASE_SERVICE_KEY || "").trim();

  if (!supabaseUrl) {
    return new Response(
      "MISSING: SUPABASE_URL",
      { status: 500 }
    );
  }

  if (!serviceKey) {
    return new Response(
      "MISSING: SUPABASE_SERVICE_KEY",
      { status: 500 }
    );
  }

  const flowId = randomBase64Url(32);
  const codeVerifier = randomBase64Url(64);

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier)
  );

  const codeChallenge = base64Url(
    new Uint8Array(digest)
  );

  const redirectTo =
    `https://getgameslotpro.com/?customer_login=1` +
    `&oauth_flow=${encodeURIComponent(flowId)}`;

  const saveFlow = await fetch(
    `${supabaseUrl}/rest/v1/oauth_login_flows`,
    {
      method: "POST",
      headers: {
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        flow_id: flowId,
        code_verifier: codeVerifier,
        redirect_to: redirectTo,
        created_at: new Date().toISOString()
      })
    }
  );

  if (!saveFlow.ok) {
    const detail = await saveFlow.text();

    return new Response(
      `SUPABASE FLOW SAVE FAILED
Status: ${saveFlow.status}
Details: ${detail}`,
      {
        status: 500,
        headers: {
          "Content-Type": "text/plain"
        }
      }
    );
  }

  const authUrl = new URL(
    `${supabaseUrl}/auth/v1/authorize`
  );

  authUrl.searchParams.set(
    "provider",
    "google"
  );

  authUrl.searchParams.set(
    "redirect_to",
    redirectTo
  );

  authUrl.searchParams.set(
    "code_challenge",
    codeChallenge
  );

  authUrl.searchParams.set(
    "code_challenge_method",
    "s256"
  );

  authUrl.searchParams.set(
    "scopes",
    "openid email profile"
  );

  return Response.redirect(
    authUrl.toString(),
    302
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/google-login") {
      return startGoogleLogin(env);
    }

    return env.ASSETS.fetch(request);
  }
};
