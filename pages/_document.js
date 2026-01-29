import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html>
      <Head>
        {/* Google Fonts - Source Sans Pro */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Source+Sans+Pro:wght@400;600&display=swap" rel="stylesheet" />
        
        {/* PWA Manifest */}
        <link rel="manifest" href="/manifest.json" />
        
        {/* PWA Meta Tags */}
        <meta name="application-name" content="Blink POS" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Blink POS" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#f59e0b" />
        
        {/* Prevent password managers from auto-triggering */}
        <meta name="password" content="false" />
        <meta name="1password-ignore" content="all" />
        
        {/* Favicon and Apple Touch Icons */}
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-ios-192x192.png" />
        <link rel="apple-touch-icon" href="/icons/icon-ios-152x152.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-ios-192x192.png" />
        
        {/* Apple Splash Screens */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        
        {/* Microsoft Tiles */}
        <meta name="msapplication-TileColor" content="#f59e0b" />
        <meta name="msapplication-TileImage" content="/icons/icon-ios-144x144.png" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
