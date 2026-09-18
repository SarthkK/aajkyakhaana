/**
 * "Aaj kya khaana hai?" over the app for about a second.
 *
 * This is a server component on purpose. Rendered from React state it appeared *after*
 * the first paint, so you saw a flash of skeletons and then the splash — backwards.
 * Being in the initial HTML means it covers the screen from the very first frame,
 * while the real screen loads underneath it. Nothing is being waited on.
 *
 * Showing it once per browser session needs no React either: the inline script below
 * runs before the browser paints and marks the document, and CSS does the rest.
 */
export function Splash() {
  return (
    <>
      <script
        // Runs synchronously before first paint, so a returning visitor never sees
        // a frame of it. Deliberately tiny and dependency-free.
        dangerouslySetInnerHTML={{
          __html: `try{if(sessionStorage.getItem('kk_splash')){document.documentElement.dataset.splash='seen'}else{sessionStorage.setItem('kk_splash','1')}}catch(e){document.documentElement.dataset.splash='seen'}`,
        }}
      />
      <div aria-hidden className="splash-layer fixed inset-0 z-[60] grid place-items-center bg-bg pointer-events-none">
        <div className="splash-text text-center px-8">
          <div className="text-5xl mb-4">🍲</div>
          <p className="text-2xl font-bold tracking-tight text-ink">Aaj kya khaana hai?</p>
        </div>
      </div>
    </>
  );
}
