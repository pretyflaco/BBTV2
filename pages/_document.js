import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html>
      <Head>
        {/* PWA Manifest */}
        <link rel="manifest" href="/manifest.json" />
        
        {/* PWA Meta Tags */}
        <meta name="application-name" content="Blink Tracker" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Blink Tracker" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#f59e0b" />
        
        {/* Favicon and Apple Touch Icons */}
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/icons/icon-152x152.svg" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-192x192.svg" />
        
        {/* Apple Splash Screens */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        
        {/* Microsoft Tiles */}
        <meta name="msapplication-TileColor" content="#f59e0b" />
        <meta name="msapplication-TileImage" content="/icons/icon-144x144.svg" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
