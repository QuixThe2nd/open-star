import { readFileSync } from 'fs'
import path from 'path'
import { glob } from 'glob'
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

async function buildFiles() {
  const tsFiles = await glob('src/**/*.ts')

  await Bun.build({
    minify: true,
    outdir: '.',
    format: 'esm',
    external: Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.peerDependencies || {})),
    define: {
      'process.env.NODE_ENV': '"production"'
    },
    plugins: [
      {
        name: 'alias',
        setup(build) {
          build.onResolve({ filter: /^fs|@roamhq\/wrtc|(viem(\/.*)?)$/ }, (pkg) => {
            if (pkg.path === 'fs' || pkg.path === '@roamhq/wrtc') return { path: path.resolve('./src/shims/empty.ts') }
            else if (pkg.path === 'viem') return { path: path.resolve('./node_modules/viem/index.ts') }
            else if (pkg.path === 'viem/accounts') return { path: path.resolve('./node_modules/viem/accounts/index.ts') }
            else if (pkg.path === 'viem/utils') return { path: path.resolve('./node_modules/viem/utils/index.ts') }
            else console.error('Unknown Package', pkg)
          })
        }
      }
    ],
    entrypoints: tsFiles
  })
}

buildFiles()