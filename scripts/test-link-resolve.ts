/**
 * 链接解析测试脚本
 * 用法: ts-node scripts/test-link-resolve.ts <URL> [COUNTRY]
 */
import { LinkResolver } from '../src/lib/utils/linkResolver';
import { loadConfig } from '../src/lib/config';

async function main() {
  const url = process.argv[2];
  const country = process.argv[3] || 'US';

  if (!url) {
    console.error('Usage: ts-node scripts/test-link-resolve.ts <URL> [COUNTRY]');
    process.exit(1);
  }

  const config = loadConfig('./config.yaml');

  // 代理用户名格式: base_custom_zone_XX
  const proxyUsername = `${config.proxy.username}_custom_zone_${country}`;

  const resolver = new LinkResolver(
    config.proxy.host,
    config.proxy.port,
    proxyUsername,
    config.proxy.password
  );

  console.log(`Resolving: ${url}`);
  console.log(`Country: ${country}, Proxy: ${proxyUsername}@${config.proxy.host}:${config.proxy.port}`);

  const result = await resolver.resolve(url, country);

  console.log('\n=== Result ===');
  console.log(`Final URL: ${result.finalUrl}`);
  console.log(`Domain: ${result.domain}`);
  console.log(`URL Suffix: ${result.urlSuffix}`);
  console.log(`Redirect chain (${result.redirectChain.length} steps):`);
  result.redirectChain.forEach((step, i) => console.log(`  ${i + 1}. ${step}`));
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
