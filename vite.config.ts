import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Content-Security-Policy restritiva (ver seção "Security" da especificação).
 * Só é injetada no build de produção: o servidor de desenvolvimento do Vite
 * precisa de scripts inline (React Refresh). `style-src 'unsafe-inline'` é
 * necessário porque componentes Radix injetam <style> em tempo de execução.
 */
function montarCsp(comGoogle: boolean): string {
  // Backup no Google Drive (RN51): entra só quando há VITE_GOOGLE_CLIENT_ID.
  // - script-src accounts.google.com/gsi/client: a biblioteca GIS, só esse
  //   arquivo (o Google não permite empacotá-la);
  // - connect-src accounts.google.com/gsi/: chamadas internas do GIS
  //   (recomendação do Google);
  // - connect-src www.googleapis.com: API do Drive (metadados, upload, download);
  // - connect-src oauth2.googleapis.com/revoke: só esse endereço, a revogação
  //   do token no "Desconectar" (o GIS faz um POST para ele; bloqueado no teste
  //   manual da Fase 8, etapa 3).
  // A lista é conferida com o Google de verdade (Fase 7, etapa 10; Fase 8, etapa 3).
  const script = comGoogle ? "'self' https://accounts.google.com/gsi/client" : "'self'"
  const connect = comGoogle
    ? "'self' https://accounts.google.com/gsi/ https://www.googleapis.com https://oauth2.googleapis.com/revoke"
    : "'self'"
  return [
    "default-src 'self'",
    `script-src ${script}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "media-src 'self'",
    `connect-src ${connect}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ')
}

function cspPlugin(comGoogle: boolean): Plugin {
  const csp = montarCsp(comGoogle)
  return {
    name: 'study-manager-csp',
    apply: 'build',
    // Inserida logo após o <meta charset>, antes de qualquer <script>.
    transformIndexHtml: (html) =>
      html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      ),
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_BASE_PATH || '/'

  return {
    base,
    build: {
      rolldownOptions: {
        output: {
          // Separa as bibliotecas em chunks próprios: melhora o cache entre deploys.
          codeSplitting: {
            groups: [
              {
                name: 'react',
                test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/,
              },
              { name: 'radix', test: /node_modules[\\/](@radix-ui|radix-ui)[\\/]/ },
              { name: 'dexie', test: /node_modules[\\/](dexie|dexie-react-hooks)[\\/]/ },
            ],
          },
        },
      },
    },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    plugins: [
      react(),
      tailwindcss(),
      cspPlugin(Boolean(env.VITE_GOOGLE_CLIENT_ID)),
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['favicon.svg', 'tema.js', 'icons/*.png', 'sounds/*'],
        manifest: {
          name: 'Study Manager',
          short_name: 'Study Manager',
          description: 'Planejamento e controle de estudos para concursos.',
          lang: 'pt-BR',
          dir: 'ltr',
          start_url: '.',
          scope: '.',
          display: 'standalone',
          background_color: '#ffffff',
          theme_color: '#4f46e5',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,mp3,wav,ogg}'],
          navigateFallback: 'index.html',
          cleanupOutdatedCaches: true,
        },
      }),
    ],
  }
})
