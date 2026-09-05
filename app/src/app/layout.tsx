import type { Metadata } from 'next';
import '@/app/globals.css';

import { AuthContextProvider } from '@/context/AuthContext';
import { LanguageContextProvider } from '@/context/LanguageContext';

export const metadata: Metadata = {
  title: 'Dadix',
  description: 'Dadix app',
  icons: {
    icon: [
      {
        url: '/favicon.ico',
        href: '/favicon.ico',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en'>
      <head>
        <script
          async
          defer
          src='https://app.visitortracking.com/assets/js/tracer.js'
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
            function init_tracer() {
              if(document.location.hostname==='localhost') return;
              var tracer = new Tracer({
              websiteId : "69d8358f-57c2-404a-980d-f603189775cf",
              async : true,
              debug : false });
            }`,
          }}
        />
      </head>
      <body className='antialiased systemTheme'>
        <AuthContextProvider>
          <LanguageContextProvider>
            <>{children}</>
          </LanguageContextProvider>
        </AuthContextProvider>
      </body>
    </html>
  );
}
