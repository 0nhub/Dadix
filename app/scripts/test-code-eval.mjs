/**
 * Quick test for Dadix CODE evaluation – run from app dir: node scripts/test-code-eval.mjs
 * Uses dynamic import with path resolution (run from app: node --experimental-vm-modules scripts/test-code-eval.mjs
 * or run via Next.js API route / test).
 *
 * Standalone test: we simulate what FormulaEval does.
 */

// Mock window for UserLocalStorage used in dadixCodeEval
globalThis.window = globalThis.window || {};
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
};

async function run() {
  // Dynamic import with path mapping - from app root we need to resolve @/lib/dadixCodeEval
  const path = await import('path');
  const url = await import('url');
  const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
  const appRoot = path.join(__dirname, '..');
  const modulePath = path.join(appRoot, 'src/lib/dadixCodeEval.ts');
  // Use tsx to run TypeScript
  const { validateDadixCode } = await import(modulePath).catch(() => {
    // Fallback: if running from built app, path might differ
    return import('../src/lib/dadixCodeEval.ts');
  });

  const tests = [
    { code: '"hello"', record: {}, expected: 'hello', name: 'string literal' },
    { code: '42', record: {}, expected: '42', name: 'number' },
    { code: 'title', record: { title: 'Mein Titel' }, expected: 'Mein Titel', name: 'bare identifier = record field' },
    { code: '.title', record: { title: 'Dot field' }, expected: 'Dot field', name: '.field ref' },
  ];

  console.log('Testing Dadix CODE evaluation:\n');
  let ok = 0;
  for (const t of tests) {
    const out = validateDadixCode({
      code: t.code,
      record: t.record,
      fields: [],
    });
    const pass = out.valid && out.result === t.expected;
    if (pass) ok++;
    console.log(
      pass ? '  OK' : '  FAIL',
      t.name,
      '|',
      JSON.stringify(t.code),
      '->',
      out.valid ? JSON.stringify(out.result) : out.error,
      pass ? '' : `(expected ${JSON.stringify(t.expected)})`
    );
  }
  console.log('\n' + ok + '/' + tests.length + ' passed');
  process.exit(ok === tests.length ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
