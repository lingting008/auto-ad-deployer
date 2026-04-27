import * as fs from 'fs';
import * as path from 'path';
import minimist from 'minimist';
import { DeployService } from './DeployService';

/**
 * deploy 脚本入口
 * 从联盟 API 拉取已批准的 offer，写入 Google Sheets
 */
async function main() {
  const argv = minimist(process.argv.slice(2), {
    string: ['affiliate', 'site', 'config', 'count'],
    boolean: ['dry-run', 'help'],
    alias: { a: 'affiliate', s: 'site', c: 'count', d: 'dry-run', h: 'help' },
    default: { count: '5', 'dry-run': 'false' },
  });

  if (argv.help) {
    console.log(`
用法: ts-node src/deploy/index.ts [选项]

选项:
  -a, --affiliate <name>   联盟名称 (如 lh, pb)
  -s, --site <name>        网站名称
  -c, --count <n>          每个联盟处理的 offer 数量 (默认 5)
  -d, --dry-run            只打印不实际写入
  -h, --help               显示帮助

示例:
  ts-node src/deploy/index.ts -a lh -c 3
  ts-node src/deploy/index.ts --affiliate pb --dry-run
  ts-node src/deploy/index.ts (处理所有联盟)
    `);
    return;
  }

  const configPath = argv.config ||
    path.resolve(process.cwd(), 'config.yaml') ||
    path.resolve(__dirname, '../../config.yaml');

  if (!fs.existsSync(configPath)) {
    console.error(`Config file not found: ${configPath}`);
    console.error('Copy config.yaml.example to config.yaml and fill in your credentials.');
    process.exit(1);
  }

  const service = new DeployService(configPath);
  const result = await service.deploy({
    affiliate: argv.affiliate,
    siteName: argv.site,
    count: parseInt(argv.count as string, 10) || 5,
    dryRun: argv['dry-run'] === true || argv['dry-run'] === 'true',
  });

  process.exit(0);
}

main().catch(e => {
  console.error('Deploy failed:', e.message);
  process.exit(1);
});
