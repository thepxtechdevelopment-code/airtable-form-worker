// Airtable Form Worker
// A 1-file Cloudflare Worker that receives form submissions from the
// "Airtable Backend" Framer plugin and forwards them to Airtable.
// Your Airtable PAT lives ONLY on Cloudflare's edge. It never ships in
// your published Framer site.
//
// Required environment variables (set in Cloudflare dashboard → Variables):
//   AIRTABLE_PAT       (secret) Your Airtable Personal Access Token
//   AIRTABLE_BASE_ID            Your base ID, starts with "app..."
//   AIRTABLE_TABLE              Your table name (must match exactly)
//   ALLOWED_ORIGIN              Your Framer site URL, e.g. https://yoursite.com
//                               (use "*" to allow all origins — NOT RECOMMENDED)
//
// Optional:
//   RATE_LIMIT_PER_MINUTE       Default 30 — submissions per IP per minute

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || ""
    const allowOrigin = matchOrigin(origin, env.ALLOWED_ORIGIN || "*")

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(allowOrigin) })
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, allowOrigin)
    }

    if (allowOrigin === null) {
      return jsonResponse({ error: "Origin not allowed" }, 403, "")
    }

    // Required env vars
    if (!env.AIRTABLE_PAT || !env.AIRTABLE_BASE_ID || !env.AIRTABLE_TABLE) {
      return jsonResponse({ error: "Worker is not configured. Set AIRTABLE_PAT, AIRTABLE_BASE_ID, AIRTABLE_TABLE in your Worker's Variables tab." }, 500, allowOrigin)
    }

    // Basic rate limit per IP (in-memory, per-isolate — not bulletproof but stops casual abuse)
    const ip = request.headers.get("CF-Connecting-IP") || "unknown"
    const limit = Number(env.RATE_LIMIT_PER_MINUTE || 30)
    if (!checkRate(ip, limit)) {
      return jsonResponse({ error: "Too many submissions, please slow down." }, 429, allowOrigin)
    }

    // Parse body
    let body
    try {
      body = await request.json()
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400, allowOrigin)
    }
    const fields = body && body.fields
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
      return jsonResponse({ error: "Body must be { fields: { ... } }" }, 400, allowOrigin)
    }

    // Forward to Airtable
    const airtableUrl = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(env.AIRTABLE_TABLE)}`
    let res
    try {
      res = await fetch(airtableUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.AIRTABLE_PAT}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields }),
      })
    } catch (err) {
      return jsonResponse({ error: "Network error reaching Airtable" }, 502, allowOrigin)
    }

    const text = await res.text()
    return new Response(text, {
      status: res.status,
      headers: { ...corsHeaders(allowOrigin), "Content-Type": "application/json" },
    })
  },
}

// === helpers ===

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  }
}

function jsonResponse(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  })
}

function matchOrigin(requestOrigin, allowedSetting) {
  if (allowedSetting === "*") return "*"
  // Allow comma-separated list of origins (e.g. "https://a.com,https://b.com")
  const allowed = String(allowedSetting).split(",").map(s => s.trim()).filter(Boolean)
  if (allowed.length === 0) return null
  if (allowed.includes(requestOrigin)) return requestOrigin
  return null
}

const RATE_BUCKET = new Map()
function checkRate(ip, perMinute) {
  const now = Date.now()
  const windowStart = now - 60_000
  const arr = RATE_BUCKET.get(ip) || []
  const recent = arr.filter((t) => t > windowStart)
  if (recent.length >= perMinute) {
    RATE_BUCKET.set(ip, recent)
    return false
  }
  recent.push(now)
  RATE_BUCKET.set(ip, recent)
  // Periodic cleanup
  if (RATE_BUCKET.size > 1000) {
    for (const [k, v] of RATE_BUCKET) {
      const fresh = v.filter((t) => t > windowStart)
      if (fresh.length === 0) RATE_BUCKET.delete(k)
      else RATE_BUCKET.set(k, fresh)
    }
  }
  return true
}
