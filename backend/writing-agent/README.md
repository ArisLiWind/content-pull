# Content Pull Writing Agent Backend

This is the simple persistent backend for Content Pull.

It does only one thing:

```text
user input -> DeepSeek -> article -> MySQL -> response
```

Then it keeps editing the same task:

```text
new instruction -> read current article -> DeepSeek -> update MySQL -> response
```

No multi-agent runtime. No MCP. No workflow builder.

## Environment

```bash
export CONTENT_PULL_PORT=8788
export DEEPSEEK_API_KEY=your_deepseek_key
export MYSQL_HOST=127.0.0.1
export MYSQL_PORT=3306
export MYSQL_USER=content_x
export MYSQL_PASSWORD=your_mysql_password
export MYSQL_DATABASE=content_x
```

## MySQL

Create database and user first:

```sql
CREATE DATABASE content_x CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'content_x'@'%' IDENTIFIED BY 'your_mysql_password';
GRANT ALL PRIVILEGES ON content_x.* TO 'content_x'@'%';
FLUSH PRIVILEGES;
```

Then create the table:

```bash
mysql -u content_x -p content_x < backend/writing-agent/schema.sql
```

## Start

```bash
npm run writing-agent:start
```

## API

### POST /task

```json
{
  "input": "写一篇关于 AI 内容创作趋势的文章"
}
```

### GET /task/:id

Returns the task, conversation, draft, and updated draft.

### POST /task/:id/continue

```json
{
  "input": "改短一点，更商业"
}
```
