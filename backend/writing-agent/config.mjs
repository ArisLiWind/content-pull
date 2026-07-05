export const config = {
  host: process.env.CONTENT_PULL_HOST || "0.0.0.0",
  port: Number(process.env.CONTENT_PULL_PORT || 8788),
  deepseek: {
    apiBaseUrl: process.env.DEEPSEEK_API_BASE_URL || "https://api.deepseek.com",
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat"
  },
  mysql: {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "content_x",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "content_x",
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10)
  }
};

export function assertRuntimeConfig() {
  const missing = [];
  if (!config.deepseek.apiKey) missing.push("DEEPSEEK_API_KEY");
  if (!config.mysql.password) missing.push("MYSQL_PASSWORD");

  return {
    ok: missing.length === 0,
    missing
  };
}

