# Deployment

## Ubuntu VM

```bash
sudo useradd --system --create-home --home-dir /opt/scallar-outreach scallar
sudo rsync -a ./ /opt/scallar-outreach/
cd /opt/scallar-outreach
cp .env.example .env
npm ci
npm run build
npx tsx src/cli/index.ts db:migrate
sudo cp deploy/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now scallar-outreach-webhook
sudo systemctl enable --now scallar-outreach-worker
```

Keep `SEND_ENABLED=false` until readiness tests pass.

## Docker Compose

```bash
cp .env.example .env
docker compose -f deploy/docker-compose.yml up -d --build
```

SQLite data is persisted in `./data`. Redis data is stored in the named `redis-data` volume.

## Nginx

```bash
sudo cp deploy/nginx/reach.example.conf /etc/nginx/sites-available/reach.example.conf
sudo ln -s /etc/nginx/sites-available/reach.example.conf /etc/nginx/sites-enabled/reach.example.conf
sudo nginx -t
sudo systemctl reload nginx
```

## SSL

```bash
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d reach.example.com
```

## Backup

SQLite:

```bash
sqlite3 data/outreach.db ".backup 'backup/outreach-$(date -u +%Y%m%d%H%M%S).db'"
```

Redis:

```bash
redis-cli BGSAVE
```

## Restore

Stop services, replace `data/outreach.db` with the backup, restore Redis `dump.rdb` if needed, then restart services.
