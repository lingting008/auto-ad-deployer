import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { FillSheetService } from './FillSheetService';
import { AppConfig } from '../lib/types';

/**
 * fill-sheet HTTP 服务器
 * 运行在 VPS 上，通过 Apps Script 触发
 */
class FillSheetServer {
  private config: AppConfig;
  private service: FillSheetService | null = null;
  private server: http.Server;
  private proxyHost: string;
  private proxyPort: number;

  constructor(configPath: string) {
    this.config = yaml.load(fs.readFileSync(configPath, 'utf8')) as AppConfig;
    this.proxyHost = this.config.proxy.host;
    this.proxyPort = this.config.proxy.port;

    this.server = http.createServer((req, res) => this.handleRequest(req, res));
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = url.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // API Key 验证
    const apiKey = req.headers['x-api-key'] as string || url.searchParams.get('api_key');
    if (this.config.server.api_key && apiKey !== this.config.server.api_key) {
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
        if (this.service?.['isRunning']) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'already_running', message: 'Fill is already in progress' }));
          return;
        }

        this.service = new FillSheetService(this.config, this.proxyHost, this.proxyPort);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'started', message: 'Fill process started' }));

        // 后台执行
        console.log(`[${new Date().toISOString()}] Starting fill process...`);
        const result = await this.service.process();
        console.log(`[${new Date().toISOString()}] Fill complete: processed=${result.processed}, errors=${result.errors.length}`);
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
