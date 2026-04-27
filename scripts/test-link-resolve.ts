/**
 * 链接解析测试脚本
 * 用法: ts-node scripts/test-link-resolve.ts <URL>
 */
import { LinkResolver } from '../src/lib/utils/linkResolver';

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: ts-node scripts/test-link-resolve.ts <URL>');
    process.exit(1);
  }

  const proxyHost = process.env.PROXY_HOST || 'localhost';
  const proxyPort = parseInt(process.env.PROXY_PORT || '8080');

  const resolver = new LinkResolver(proxyHost, proxyPort);

  console.log(`Resolving: ${url}`);
  const result = await resolver.resolve(url, 'US');

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
