import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * The HTML shell every statically rendered page is wrapped in.
 *
 * Runs in Node at build time only — there is no browser here, and nothing in
 * this file reaches the client as React. It exists to say the things a web app
 * has to say in markup rather than in JavaScript: what it is called, what
 * colour it is, and where its manifest lives.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="nb">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />

        {/*
          viewport-fit=cover lets the layout reach under the notch once the app
          is installed to a home screen, which is where safe-area insets start
          mattering on web too. user-scalable=no because the album carousel
          handles its own gestures, and pinch-zooming the page fights them.
        */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />

        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />

        {/*
          Safari ignores the manifest for these. Without them an installed app
          gets a browser chrome and a screenshot for an icon.
        */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="EkteTid" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        <meta name="description" content="Ekte øyeblikk med vennene dine." />

        {/* Link previews, for when someone shares the URL. */}
        <meta property="og:title" content="EkteTid" />
        <meta property="og:description" content="Det er tid for å være ekte." />
        <meta property="og:image" content="/icon-512.png" />
        <meta property="og:type" content="website" />

        {/*
          Disables body scrolling on web, so the app's own scroll views behave
          as they do on native rather than the page scrolling underneath them.
        */}
        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: backgroundStyle }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

/*
 * Black before the first paint.
 *
 * The app is dark everywhere, and without this the browser shows its own white
 * page until React mounts — a flash that is far more noticeable on a phone than
 * the splash screen it replaces.
 */
const backgroundStyle = `
body, #root {
  background-color: #000000;
}
`;
