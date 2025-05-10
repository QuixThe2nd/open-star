import path from 'path'
import { glob } from 'glob'

await Bun.build({
  minify: true,
  outdir: 'dist/',
  format: 'esm',
  plugins: [{
    name: 'alias',
    setup(build) {
      build.onResolve({ filter: /^fs|@roamhq\/wrtc$/ }, (pkg) => {
        if (pkg.path === 'fs' || pkg.path === '@roamhq/wrtc') return { path: path.resolve('./src/shims/empty.ts') }
        else {
          console.error('Unknown Package', pkg)
          return pkg
        }
      })
    }
  }],
  entrypoints: ['./src/openstar.ts'],
  target: 'browser',
  sourcemap: 'external',
  root: 'src/'
})

await Bun.build({
  minify: true,
  outdir: 'dist/',
  format: 'esm',
  plugins: [{
    name: 'alias',
    setup(build) {
      build.onResolve({ filter: /^fs|@roamhq\/wrtc$/ }, (pkg) => {
        if (pkg.path === 'fs' || pkg.path === '@roamhq/wrtc') return { path: path.resolve('./src/shims/empty.ts') }
        else {
          console.error('Unknown Package', pkg)
          return pkg
        }
      })
    }
  }],
  entrypoints: await glob('oracles/*.ts'),
  target: 'browser',
  sourcemap: 'external',
  root: 'oracles/'
})
