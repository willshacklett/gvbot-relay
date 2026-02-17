// Cloudflare Worker — gvbot-relay
// Accepts either:
//   { "message": "hi" }
// or
//   { "messages": [{ "role": "user", "content": "hi" }, ...] }
//
// Calls OpenAI Responses API and returns:
//   { "reply": "..." }

const ALLOW_ORIGINS = [
  "https://willshacklett.github.io",
  "http://localhost:5500",
  "http://localhost:5173",
  "http://localhost:3000",
];

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonResponse(request, status, obj) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(request),
    },
  });
}

function extractUserMessage(bodyJson) {
  if (bodyJson && typeof bodyJson.message === "string" && bodyJson.message.trim()) {
    return bodyJson.message.trim();
  }

  if (bodyJson && Array.isArray(bodyJson.messages) && bodyJson.messages.length) {
    for (let i = bodyJson.messages.length - 1; i >= 0; i--) {
      const m = bodyJson.messages[i];
      if (m && m.role === "user" && typeof m.content === "string" && m.content.trim()) {
        return m.content.trim();
      }
      if (m && m.role === "user" && Array.isArray(m.content)) {
        const textPart = m.content.find(p => p && p.type === "text" && typeof p.text === "string");
        if (textPart && textPart.text.trim()) return textPart.text.trim();
      }
    }
  }

  return "";
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (request.method !== "POST") {
      return jsonResponse(request, 405, { error: "Use POST." });
    }

    let bodyText = "";
    let bodyJson = null;

    try {
      bodyText = await request.text();
      bodyJson = bodyText ? JSON.parse(bodyText) : {};
    } catch (e) {
      console.log("Bad JSON body:", e?.message || e);
      return jsonResponse(request, 400, { error: "Body must be valid JSON." });
    }

    console.log("Incoming bodyText:", bodyText);

    const userMessage = extractUserMessage(bodyJson);
    console.log("Resolved userMessage:", userMessage);

    if (!userMessage) {
      return jsonResponse(request, 400, {
        error: "I didn't receive a message.",
        hint: "Send {message:\"...\"} or {messages:[{role:\"user\",content:\"...\"}]}",
        got: bodyJson,
      });
    }

    const apiKey = env.OPEN_AI_KEY || env.OPENAI_API_KEY;
    if (!apiKey) {
      return jsonResponse(request, 500, {
        error: "Missing OpenAI key in Worker env.",
        fix: "Add a Secret named OPEN_AI_KEY (or OPENAI_API_KEY).",
      });
    }

    const openaiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5",
        reasoning: { effort: "low" },
        input: [
          { role: "developer", content: "You are Gv. Be concise, warm, and helpful." },
          { role: "user", content: userMessage },
        ],
      }),
    });

    const data = await openaiRes.json();

    const reply =
      data?.output_text ||
      data?.output?.[0]?.content?.[0]?.text ||
      "";

    if (!openaiRes.ok) {
      console.log("OpenAI error:", data);
      return jsonResponse(request, 502, {
        error: "OpenAI call failed.",
        status: openaiRes.status,
        details: data,
      });
    }

    console.log("Reply:", reply);

    return jsonResponse(request, 200, {
      ok: true,
      reply: reply || "(No text returned)",
    });
  },
};
