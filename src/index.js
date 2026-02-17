export default {
  async fetch(request, env) {
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

    const userMessage = messages[messages.length - 1].content;

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.OPEN_AI_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          input: [
            {
              role: "system",
              content:
                "You are Gv, a calm, intelligent, constraint-aware AI companion. Be thoughtful and clear.",
            },
            {
              role: "user",
              content: userMessage,
            },
          ],
        }),
      });

      const data = await response.json();

      let text = "";

      if (data.output && data.output.length > 0) {
        const contentArray = data.output[0].content || [];
        const textPart = contentArray.find(
          (c) => c.type === "output_text"
        );
        if (textPart) {
          text = textPart.text;
        }
      }

      if (!text) {
        text = "(No text returned from OpenAI)";
      }

      return json({ reply: text }, 200, request);

    } catch (err) {
      return json(
        { error: "OpenAI call failed", details: String(err) },
        500,
        request
      );
    }
  },
};

function json(data, status, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(request),
    },
  });
}

function corsHeaders(request) {
  return {
    "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
