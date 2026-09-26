"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    ym?: (id: number, method: string, ...args: unknown[]) => void;
  }
}

/**
 * Yandex.Metrika (counter id from YANDEX_METRIKA_ID on the server). The loader runs with the CSP
 * nonce; tag.js is then allowed by 'strict-dynamic'. Client-side navigations are reported as hits.
 */
export function YandexMetrika({ id, nonce }: { id: number; nonce?: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false; // the initial page view is sent by 'init'
      return;
    }
    const q = params.toString();
    window.ym?.(id, "hit", `${location.origin}${pathname}${q ? `?${q}` : ""}`, {
      referer: document.referrer,
    });
  }, [id, pathname, params]);

  const loader = `(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,'script','https://mc.yandex.ru/metrika/tag.js?id=${id}','ym');ym(${id},'init',{ssr:true,webvisor:true,clickmap:true,ecommerce:"dataLayer",referrer:document.referrer,url:location.href,accurateTrackBounce:true,trackLinks:true});`;

  return (
    <>
      <Script id="yandex-metrika" nonce={nonce} strategy="afterInteractive">
        {loader}
      </Script>
      <noscript>
        <div>
          <img
            src={`https://mc.yandex.ru/watch/${id}`}
            style={{ position: "absolute", left: "-9999px" }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}
