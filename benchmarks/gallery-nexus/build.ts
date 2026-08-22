import { buildBenchmark } from '../../../vectojs/benchmarks/_shared/build';

await buildBenchmark({
  benchRoot: new URL('.', import.meta.url).pathname,
  title: 'vectojs gallery nexus particles',
  external: process.argv.includes('--external'),
});
