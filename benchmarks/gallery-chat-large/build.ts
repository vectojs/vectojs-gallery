import { buildBenchmark } from '../../../vectojs/benchmarks/_shared/build';

await buildBenchmark({
  benchRoot: new URL('.', import.meta.url).pathname,
  title: 'vectojs gallery large Markdown stream',
  external: process.argv.includes('--external'),
});
