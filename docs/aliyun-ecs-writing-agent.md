# Deploy ViewPull Writing Agent on Alibaba Cloud ECS

Target:

```text
Node.js backend + MySQL + DeepSeek API
```

The backend only has three APIs:

```text
POST /task
GET /task/:id
POST /task/:id/continue
```

## ECS Setup

1. Create an Alibaba Cloud ECS instance.
2. Open security group ports:
   - `22` for SSH
   - `8788` for ViewPull backend, or put Nginx in front and expose `80/443`
3. Install Node.js 22+ or 24.
4. Install MySQL 8.
5. Clone ViewPull.
6. Install dependencies:

```bash
npm install
```

## MySQL Setup

```sql
CREATE DATABASE content_x CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'content_x'@'%' IDENTIFIED BY 'your_mysql_password';
GRANT ALL PRIVILEGES ON content_x.* TO 'content_x'@'%';
FLUSH PRIVILEGES;
```

Apply schema:

```bash
mysql -u content_x -p content_x < backend/writing-agent/schema.sql
```

## Environment

Use ECS environment variables or a process manager such as PM2:

```bash
export VIEWPULL_HOST=0.0.0.0
export VIEWPULL_PORT=8788
export DEEPSEEK_API_KEY=your_deepseek_key
export MYSQL_HOST=127.0.0.1
export MYSQL_PORT=3306
export MYSQL_USER=content_x
export MYSQL_PASSWORD=your_mysql_password
export MYSQL_DATABASE=content_x
```

## Start

```bash
npm run writing-agent:start
```

With PM2:

```bash
npm install -g pm2
pm2 start backend/writing-agent/server.mjs --name viewpull-writing-agent
pm2 save
```

## Test

Create:

```bash
curl -X POST http://YOUR_ECS_IP:8788/task \
  -H 'Content-Type: application/json' \
  -d '{"input":"写一篇关于 AI 内容创作趋势的文章"}'
```

Continue:

```bash
curl -X POST http://YOUR_ECS_IP:8788/task/TASK_ID/continue \
  -H 'Content-Type: application/json' \
  -d '{"input":"改短一点，更商业"}'
```

