import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import '@/styles/globals.css';
import '@/styles/tokens.css';
import '@/styles/professor-flux-brand.css';
import '@/styles/a11y.css';
import '@/styles/flow-builder.css';

export const metadata: Metadata = {
  title: 'Professor Flux',
  description: 'O construtor de conhecimento com IA — provas, atividades e materiais para professores',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'Professor Flux' },
};

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="icon" href="/branding/professor-flux-logo.png" type="image/png" />
        <link rel="apple-touch-icon" href="/branding/professor-flux-logo.png" />
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;600;700;800&family=Raleway:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <Script src="https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js" strategy="beforeInteractive" crossOrigin="anonymous" />
        <Script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js" strategy="beforeInteractive" />
        <Script src="https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js" strategy="beforeInteractive" />
        <Script
          src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
          strategy="beforeInteractive"
        />
        <Script
          src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/dist/umd/supabase.js"
          strategy="beforeInteractive"
        />
        <Script src="/pedagia-cloud.js" strategy="beforeInteractive" />
        <Script
          src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"
          strategy="beforeInteractive"
        />
        <Script
          src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"
          strategy="beforeInteractive"
        />
        <Script
          src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"
          strategy="beforeInteractive"
        />
      </body>
    </html>
  );
}
