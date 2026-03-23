import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { JetBrains_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { WebSocketProvider } from '@/components/providers/WebSocketProvider';
import { Toaster } from 'react-hot-toast';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'PulseTerminal X — Financial Intelligence Platform',
  description:
    'Real-time earnings data, AI-generated insights, and alternative data intelligence. Bloomberg meets AI.',
  keywords: ['financial terminal', 'earnings', 'sentiment analysis', 'AI insights', 'stocks'],
  authors: [{ name: 'PulseTerminal' }],
  openGraph: {
    title: 'PulseTerminal X',
    description: 'Advanced financial intelligence platform',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-display antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <AuthProvider>
            <WebSocketProvider>
              {children}
              <Toaster
                position="bottom-right"
                toastOptions={{
                  style: {
                    background: '#0d1117',
                    color: '#e6edf3',
                    border: '1px solid #1e2736',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '13px',
                  },
                  duration: 4000,
                }}
              />
            </WebSocketProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
