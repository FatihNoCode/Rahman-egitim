import { defineConfig, type Plugin } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver(): Plugin {
  return {
    name: 'figma-asset-resolver',
    resolveId(id: string) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  base: '/',
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  build: {
    // xlsx is the only chunk over the default 500 kB warning threshold, and it
    // is behind a dynamic import in ImportView — it is never fetched unless an
    // admin actually opens a spreadsheet. Raise the bar rather than ship a
    // warning on every build that everyone learns to scroll past.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // React and the Supabase client are the two large dependencies on the
        // boot path, and neither changes between app deploys. Splitting them
        // out means shipping a fix to the app invalidates the app chunk only,
        // instead of making every returning user re-download ~350 kB of
        // framework they already have cached.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
            return 'vendor-react'
          }
          // iceberg-js and tslib are pulled in by supabase-js alone; grouping
          // them keeps the app chunk free of stray framework fragments.
          if (/[\\/]node_modules[\\/](@supabase[\\/]|iceberg-js[\\/]|tslib[\\/])/.test(id)) {
            return 'vendor-supabase'
          }
        },
      },
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  // Pre-bundle the toast/dialog deps up front. Both now sit behind the dynamic
  // import in ui/feedback.tsx, so without this Vite only discovers them once
  // FeedbackHost mounts, re-optimizes, and forces a mid-render reload that can
  // momentarily duplicate React.
  optimizeDeps: {
    include: ['sonner', '@radix-ui/react-alert-dialog'],
  },

  assetsInclude: ['**/*.svg', '**/*.csv'],
})
