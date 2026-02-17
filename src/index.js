export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request),
      });
    }

    if (request.method !== "POST") {
      return json({ error: "POST only" }, 405, request);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, request);
    }

    const { messages } = body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "Missing messages[]" }, 400, request);
    }

    // Basic “GV-ish” system prompt (we’ll expand later)
    const system = {
      role: "system",
      content:
        "You are Gv, a constraint-aware AI companion. Be helpful, calm, and safety-minded. " +
        "If user asks for harmful/illegal instructions, refuse and offer safe alternatives. " +
        "Keep replies concise unless asked for detail."
    };

    const payload = {
      model: env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [system, ...messages],
      temperature: 0.7,
    };

    // Call OpenAI Chat Completions endpoint
    // NOTE: You must set OPENAI_API_KEY as a Worker secret.
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return json({ error: "Upstream error", detail: txt }, 502, request);
    }

    const data = await resp.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "";
    return json({ reply }, 200, request);
  },
};

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(obj, status, request) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(request),
    },
  });
}
