import type { Metadata } from 'next';
import '@/styles/globals.css';
import WalletProvider from '@/components/wallet/WalletProvider';
import Header from '@/components/layout/Header';

export const metadata: Metadata = {
  title: 'Theorise',
  description: 'Trade on your convictions. Build a vault. Let others invest in your edge.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <WalletProvider>
          <Header />
          <main
            style={{
              maxWidth: 1200,
              margin: '0 auto',
              padding: '0 24px',
              minHeight: 'calc(100vh - 57px)',
            }}
          >
            {children}
          </main>
        </WalletProvider>
      </body>
    </html>
  );
}
