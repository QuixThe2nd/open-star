import path from 'path'
import { glob } from 'glob'

async function buildFiles() {
  const oracles = await glob('src/oracles/*.ts')

  await Bun.build({
    minify: true,
    outdir: 'dist/',
    format: 'esm',
    plugins: [
      {
        name: 'alias',
        setup(build) {
          build.onResolve({ filter: /^fs|@roamhq\/wrtc|(viem(\/.*)?)$/ }, (pkg) => {
            if (pkg.path === 'fs' || pkg.path === '@roamhq/wrtc') return { path: path.resolve('./src/shims/empty.ts') }
            else if (pkg.path.startsWith('viem')) return { path: path.resolve(`./node_modules/${pkg.path}/index.ts`) }
            else {
              console.error('Unknown Package', pkg)
              return pkg
            }
          })
        }
      }
    ],
    entrypoints: [ './src/index.ts', ...oracles ]
  })
}

await buildFiles()