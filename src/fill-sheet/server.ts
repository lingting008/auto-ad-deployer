import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { FillSheetService } from './FillSheetService';
import { AppConfig } from '../lib/types';
import { loadConfig } from '../lib/config';

/**
 * fill-sheet HTTP 服务器
 * 运行在 VPS 上，通过 Apps Script 触发
 */
class FillSheetServer {
  private config: AppConfig;
  private service: FillSheetService | null = null;
  private server: http.Server;
  private fillLock: Promise<void> | null = null;

  constructor(configPath: string) {
    this.config = loadConfig(configPath);

    this.server = http.createServer((req, res) => this.handleRequest(req, res));
  }

  /**
   * 获取锁，确保同时只有一个 fill 进程在运行
   * 如果已经有进程在运行，返回 null
   */
  private acquireLock(): Promise<(() => void) | null> {
    if (this.fillLock !== null) {
      return Promise.resolve(null); // 已有进程在运行
    }

    return new Promise<() => void>(resolve => {
      this.fillLock = Promise.resolve();
      resolve(() => {
        this.fillLock = null;
      });
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = url.pathname;

    // 安全 headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    // CORS - 限制为 Google Sheets 相关域名
    res.setHeader('Access-Control-Allow-Origin', 'https://docs.google.com');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // API Key 验证（loadConfig 已确保 api_key 已配置且不是默认值）
    const apiKey = req.headers['x-api-key'] as string || url.searchParams.get('api_key');
    if (apiKey !== this.config.server.api_key) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    try {
      if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          running: this.service?.['isRunning'] || false,
          timestamp: new Date().toISOString(),
        }));
        return;
      }

      if (pathname === '/fill') {
        // 尝试获取锁
        const releaseLock = await this.acquireLock();
        if (!releaseLock) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'conflict', message: 'Another fill process is already running' }));
          return;
        }

        this.service = new FillSheetService(this.config);

        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'started', message: 'Fill process started' }));

        // 后台执行，完成后释放锁
        console.log(`[${new Date().toISOString()}] Starting fill process...`);
        try {
          const result = await this.service.process();
          console.log(`[${new Date().toISOString()}] Fill complete: processed=${result.processed}, errors=${result.errors.length}`);
        } catch (e) {
          console.error(`[${new Date().toISOString()}] Fill error:`, e);
        } finally {
          releaseLock();
        }
        return;
      }

      if (pathname === '/fill-status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ running: this.service?.['isRunning'] || false }));
        return;
      }

      // 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (e) {
      console.error('Handler error:', e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
  }

  start(): void {
    const port = this.config.server.port || 3000;
    const host = this.config.server.host || '0.0.0.0';

    this.server.listen(port, host, () => {
      console.log(`\n========================================`);
      console.log(`  fill-sheet server running`);
      console.log(`  http://${host}:${port}`);
      console.log(`========================================`);
      console.log(`  GET /health          - Health check`);
      console.log(`  GET /fill            - Trigger fill (with ?api_key=YOUR_KEY)`);
      console.log(`  GET /fill-status     - Check if running`);
      console.log(`========================================\n`);
    });
  }

  stop(): void {
    this.server.close();
  }
}

// 入口
function main() {
  const configPath = process.argv[2] || path.resolve(process.cwd(), 'config.yaml');

  if (!fs.existsSync(configPath)) {
    console.error(`Config not found: ${configPath}`);
    console.error('Usage: ts-node src/fill-sheet/server.ts [config.yaml]');
    process.exit(1);
  }

  const server = new FillSheetServer(configPath);
  server.start();

  // PM2 graceful shutdown
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down...');
    server.stop();
    process.exit(0);
  });
  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down...');
    server.stop();
    process.exit(0);
  });
}

main();
