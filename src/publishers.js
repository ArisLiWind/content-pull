export class PublisherRegistry {
  constructor() {
    this.plugins = new Map();
  }

  register(plugin) {
    this.plugins.set(plugin.platform, plugin);
  }

  async publish(platform, content, metadata = {}) {
    const plugin = this.plugins.get(platform);
    if (!plugin) {
      throw new Error(`Publisher not registered: ${platform}`);
    }

    const validation = await plugin.validate(content);
    if (!validation.ok) {
      return {
        platform,
        status: "failed",
        error: validation.error
      };
    }

    const prepared = await plugin.prepare(content, metadata);
    return plugin.publish(prepared, metadata);
  }
}

export class MarkdownPublisher {
  platform = "markdown";
  name = "Markdown Export";

  async validate(content) {
    return content.markdown ? { ok: true } : { ok: false, error: "Markdown content is empty." };
  }

  async prepare(content, metadata) {
    return {
      filename: slugify(metadata.title || "viewpull-draft") + ".md",
      markdown: content.markdown
    };
  }

  async publish(prepared) {
    return {
      platform: this.platform,
      status: "exported",
      fileName: prepared.filename,
      content: prepared.markdown
    };
  }
}

export class HtmlPublisher {
  platform = "html";
  name = "HTML Export";

  async validate(content) {
    return content.html ? { ok: true } : { ok: false, error: "HTML content is empty." };
  }

  async prepare(content, metadata) {
    return {
      filename: slugify(metadata.title || "viewpull-draft") + ".html",
      html: content.html
    };
  }

  async publish(prepared) {
    return {
      platform: this.platform,
      status: "exported",
      fileName: prepared.filename,
      content: prepared.html
    };
  }
}

export class DraftPublisher {
  constructor(platform) {
    this.platform = platform;
    this.name = `${platform} Draft Publisher`;
  }

  async validate(content) {
    return content.markdown ? { ok: true } : { ok: false, error: "Draft content is empty." };
  }

  async prepare(content, metadata) {
    return {
      title: metadata.title || "ViewPull Draft",
      markdown: content.markdown,
      metadata,
      preparedAt: new Date().toISOString()
    };
  }

  async publish(prepared) {
    try {
      const response = await fetch("http://127.0.0.1:8788/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: this.platform,
          content: {
            markdown: prepared.markdown,
            title: prepared.title
          },
          metadata: prepared.metadata
        })
      });
      const payload = await response.json();
      return {
        platform: this.platform,
        status: payload.status || (response.ok ? "published" : "failed"),
        content: prepared,
        url: payload.url || "",
        externalId: payload.externalId || "",
        error: payload.error || "",
        setup: payload.setup || null
      };
    } catch (error) {
      return {
        platform: this.platform,
        status: "failed",
        content: prepared,
        url: "",
        error: `ViewPull backend publisher is unavailable: ${error.message}`
      };
    }
  }
}

export function createPublisherRegistry() {
  const registry = new PublisherRegistry();
  registry.register(new MarkdownPublisher());
  registry.register(new HtmlPublisher());
  registry.register(new DraftPublisher("wechat"));
  registry.register(new DraftPublisher("xiaohongshu"));
  registry.register(new DraftPublisher("x"));
  registry.register(new DraftPublisher("linkedin"));
  return registry;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "viewpull-draft";
}
