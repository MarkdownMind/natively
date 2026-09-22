#!/usr/bin/env node
/**
 * Fast electron build using esbuild (transpile-only, no type checking).
 * ~10-50x faster than `tsc` for dev builds.
 *
 * This is deliberately a transpile-only build, not a bundle build. The old
 * implementation bundled every Electron source file as an independent entry
 * point. That duplicated the same large dependency graph hundreds of times,
 * drove Node past its default 4 GB heap, and inflated the packaged app. The
 * runtime already expects a directory-shaped CommonJS tree, so preserving
 * that tree is both cheaper and more faithful to production.
 * Run `npm run typecheck:electron` separately for type safety.
 */

const { build, context } = require('esbuild');

// `--watch` replaces the old `tsc -p electron/tsconfig.json --watch` script. That
// script emitted via tsc, which is incompatible with module:"Preserve" (the
// TS7-legal setting) — and tsc has not been the emitter for dist-electron for a
// long time anyway. Type-checking in watch mode is `tsc --noEmit --watch`.
const WATCH = process.argv.includes('--watch');
const SOURCE_MAPS = process.env.NATIVELY_ELECTRON_SOURCEMAP === '1';
// Fork pull requests cannot receive the repository secret needed to fetch the
// private premium submodule. This opt-in mode still transpiles every core
// Electron entrypoint, but leaves private runtime imports unresolved for the
// packaged premium build to supply. Normal development and release builds are
// unchanged.
const CORE_SMOKE = process.env.NATIVELY_CORE_SMOKE === '1';
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const outDir = path.resolve(rootDir, 'dist-electron');

const entryPoints = [];

// Find runtime source files. Tests are run from source and must not become
// application entry points. `.mjs` source modules are transpiled to `.js`
// below so CommonJS output can load them with explicit relative paths.
const findSourceFiles = (dir) => {
  const results = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) {
      if (f.name !== '__tests__') results.push(...findSourceFiles(full));
    } else if (
      (f.name.endsWith('.ts') && !f.name.endsWith('.d.ts')) ||
      (f.name.endsWith('.mjs') && !f.name.includes('.test.'))
    ) {
      results.push(full);
    }
  }
  return results;
};

const electronDir = path.resolve(rootDir, 'electron');
if (fs.existsSync(electronDir)) {
  entryPoints.push(...findSourceFiles(electronDir).map(f => path.relative(rootDir, f)));
}

// Also include premium electron files if they exist
const premiumDir = path.resolve(rootDir, 'premium/electron');
if (fs.existsSync(premiumDir)) {
  entryPoints.push(...findSourceFiles(premiumDir).map(f => path.relative(rootDir, f)));
}

// These renderer-owned modules are imported by the Electron process at
// runtime. Keep them in the CommonJS output tree without shipping the whole
// renderer source tree in the app.
const RUNTIME_SOURCE_ENTRIES = [
  'src/types/promptSettings.ts',
  'src/lib/overlayCustomSize.mjs',
  'src/lib/overlayScrollBudget.mjs',
  'src/lib/launcherCloseDecision.mjs',
  'src/lib/micPermissionPolicy.mjs',
].filter(relativePath => fs.existsSync(path.resolve(rootDir, relativePath)));
entryPoints.push(...RUNTIME_SOURCE_ENTRIES);

const start = Date.now();

// esbuild preserves relative specifiers when bundle:false. The files above
// are emitted as `.js` CommonJS modules, so make relative `.mjs` and dynamic
// extensionless imports point at the emitted `.js` files. Package imports such
// as pdfjs-dist's `.mjs` entry points are intentionally untouched.
const relativeMjsImportPlugin = {
  name: 'relative-mjs-imports-to-cjs-output',
  setup(esbuild) {
    esbuild.onLoad({ filter: /\.(?:ts|mjs)$/ }, async (args) => {
      const source = await fs.promises.readFile(args.path, 'utf8');
      const withJsMjsSpecifiers = source.replace(
        /(['"])(\.\.?\/[^'"\n]+)\.mjs\1/g,
        '$1$2.js$1',
      );
      const contents = withJsMjsSpecifiers.replace(
        /import\(\s*(['"])(\.\.?\/[^'"\n]+)\1\s*\)/g,
        (match, quote, specifier) => {
          if (/\.(?:js|cjs|mjs|json|node)$/.test(specifier)) return match;
          return `import(${quote}${specifier}.js${quote})`;
        },
      );
      return {
        contents,
        loader: args.path.endsWith('.mjs') ? 'js' : 'ts',
      };
    });
  },
};

const buildOptions = {
  entryPoints,
  bundle: false,
  outdir: outDir,
  outbase: rootDir,       // preserve directory structure (electron/main.ts → dist-electron/electron/main.js)
  platform: 'node',
  target: 'node20',
  format: 'cjs',          // Electron loads package.json main as CommonJS in this repo
                          // (package.json has no "type": "module").
  // Source maps are opt-in: emitting a full map for every runtime module is
  // useful while debugging but wastes disk and can dominate memory during a
  // multi-entry build.
  sourcemap: SOURCE_MAPS,
  jsx: 'automatic',
  loader: {
    '.ts': 'ts',
    '.js': 'js',
  },
  plugins: [
    relativeMjsImportPlugin,
  ],
  // EVAL-ONLY DNS fix, injected at the very top of every output module (runs
  // BEFORE esbuild's deferred __esm module initializers — a top-level statement
  // inside main.ts gets wrapped in a lazy init that never ran at process start).
  // Under the real-UI eval's rapid app-relaunch load, macOS getaddrinfo returns
  // spurious ENOTFOUND for api.natively.software (a Railway CNAME), failing the
  // app's fetch() to /v1/pro/verify and /v1/chat and corrupting the eval — even
  // though `dig`/dns.resolve4 resolve it fine. We reroute dns.lookup for that one
  // host to dns.resolve4 (direct DNS query, no getaddrinfo cache). Gated on
  // NATIVELY_UI_EVAL='1' and idempotent (__nativelyDnsPinned guard), so it is a
  // strict no-op in production and across the multiple bundles that carry it.
  banner: {
    js: `try{if(process.env.NATIVELY_UI_EVAL==='1'&&!globalThis.__nativelyDnsPinned){globalThis.__nativelyDnsPinned=1;var __dns=require('dns');var __ol=__dns.lookup.bind(__dns);__dns.lookup=function(h,o,cb){if(typeof o==='function'){cb=o;o={};}if(h==='api.natively.software'){return __dns.resolve4(h,function(e,a){if(e||!a||!a.length)return __ol(h,o,cb);if(o&&o.all)return cb(null,[{address:a[0],family:4}]);return cb(null,a[0],4);});}return __ol(h,o,cb);};console.log('[eval] dns.lookup→resolve4 pinned for api.natively.software');}}catch(__e){try{console.warn('[eval] dns pin banner failed:',__e&&__e.message);}catch(_){}}`,
  },
  logLevel: 'warning',
};

const onFailure = (err) => {
  console.error('[build-electron] Build failed:', err.message);
  process.exit(1);
};

// Non-JS assets esbuild does not know about. These must be copied on EVERY
// build path — a one-off copy in the non-watch branch left `npm run watch`
// (after a clean) with a dist-electron that has no .proto, so NVIDIA speech
// died at runtime with an ENOENT pointing at the missing file rather than at
// the build.
const ASSETS = [
  { from: 'electron/audio/riva_asr.proto', to: 'electron/audio/riva_asr.proto' },
];

const copyAssets = () => {
  for (const asset of ASSETS) {
    const src = path.resolve(rootDir, asset.from);
    const dest = path.resolve(outDir, asset.to);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }

  // bundle:false does not consume CommonJS helper files. Copy them into the
  // same relative layout so runtime `require('./lib/*.cjs')` calls continue to
  // resolve in both development output and packaged apps.
  for (const sourceRoot of [electronDir, premiumDir]) {
    if (!fs.existsSync(sourceRoot)) continue;
    const runtimeFiles = [];
    const visit = (dir) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, f.name);
        if (f.isDirectory()) {
          if (f.name !== '__tests__') visit(full);
        } else if (f.name.endsWith('.cjs') || f.name.endsWith('.js')) {
          runtimeFiles.push(full);
        }
      }
    };
    visit(sourceRoot);
    for (const src of runtimeFiles) {
      const dest = path.resolve(outDir, path.relative(rootDir, src));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
};

if (WATCH) {
  context(buildOptions).then(async (ctx) => {
    await ctx.watch();
    copyAssets();
    // Deliberately no timing here: ctx.watch() returns once the watcher is armed,
    // and esbuild runs the first build asynchronously after that — printing an
    // elapsed time would report context setup, not a completed build.
    console.log('[build-electron] watching for changes...');
  }).catch(onFailure);
} else {
  if (CORE_SMOKE) {
    console.log('[build-electron] Core smoke mode: private premium imports remain unresolved');
  }
  build(buildOptions).then(() => {
    copyAssets();
    console.log(`[build-electron] Done in ${Date.now() - start}ms`);
  }).catch(onFailure);
}
