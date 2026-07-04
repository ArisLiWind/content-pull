export class McpGateway {
  constructor(toolRouter, backendConfig = {}, openclaw = null) {
    this.toolRouter = toolRouter;
    this.backendConfig = backendConfig;
    this.openclaw = openclaw;
    this.calls = [];
  }

  async call(toolName, input, context = {}) {
    const startedAt = performance.now();
    const remoteResult = await this.callOpenClaw(toolName, input, context);
    const result = remoteResult.ok
      ? {
          ...remoteResult,
          durationMs: Math.round(performance.now() - startedAt)
        }
      : await this.toolRouter.call(toolName, input);

    this.calls.unshift({
      toolName,
      input,
      context,
      backend: {
        apiBaseUrl: this.backendConfig.apiBaseUrl || "",
        mcpEndpoint: this.backendConfig.mcpEndpoint || "",
        openclawGatewayUrl: this.backendConfig.openclawGatewayUrl || "",
        model: this.backendConfig.model || "",
        hasApiKey: Boolean(this.backendConfig.apiKey)
      },
      ok: result.ok,
      provider: result.provider,
      durationMs: result.durationMs,
      at: new Date().toISOString()
    });
    this.calls = this.calls.slice(0, 80);
    return result;
  }

  async callOpenClaw(toolName, input, context) {
    if (!this.openclaw?.enabled || toolName !== "research.search") {
      return { ok: false, error: "OpenClaw Gateway is not available for this tool." };
    }

    const prompt = [
      "You are the ViewPull research tool.",
      "Use OpenClaw's local gateway capabilities when available.",
      "Return concise, source-aware research notes suitable for drafting a Chinese article.",
      `Task stage: ${context.stage || "research"}`,
      `Query: ${input.query || ""}`
    ].join("\n");

    const response = await this.openclaw.chat(prompt, { sessionId: context.taskId || "viewpull-research" });
    if (!response.ok) return response;

    const summary = String(response.text || "").trim();
    if (!summary) {
      return { ok: false, error: "OpenClaw Gateway returned an empty response." };
    }

    return {
      ok: true,
      provider: "openclaw-gateway",
      data: {
        query: input.query,
        sources: [
          {
            id: `openclaw-${input.round || 1}-${Date.now()}`,
            title: `OpenClaw research: ${input.query}`,
            url: "openclaw://gateway/v1/chat/completions",
            platform: "openclaw",
            author: "OpenClaw Gateway",
            publishedAt: new Date().toISOString(),
            summary: summary.slice(0, 900),
            credibilityScore: 0.86
          }
        ]
      }
    };
  }

  auditTrail() {
    return this.calls;
  }
}
