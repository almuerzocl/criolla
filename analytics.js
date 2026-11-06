"use strict";
/*
 * Google Analytics 4 con aviso de cookies. Mismo modelo que la PWA de almuerzo.cl (src/components/ConsentAnalytics.tsx):
 *   - 'accepted'  → Google Analytics completo (con cookies).
 *   - sin elección o rechazo → medición anónima: sin cookies ni almacenamiento, sin señales de Google, sin referrer.
 * El modo se fija al cargar la página; aceptar después rige desde la siguiente visita (igual que en la PWA).
 * La clave `cookie-consent` es la misma de la PWA, pero cada dominio guarda su propia elección (localStorage no se comparte entre orígenes).
 * Si config.js no trae `analyticsId`, este archivo no hace nada.
 */
(() => {
  const C = window.CRIOLLA_CONFIG;
  const ID = C && typeof C.analyticsId === "string" ? C.analyticsId.trim() : "";
  if (!/^G-[A-Z0-9]{6,}$/.test(ID)) return;

  const CONSENT_KEY = "cookie-consent";
  const CONSENT_EVENT = "cookie-consent-change";

  const read = () => { try { const v = localStorage.getItem(CONSENT_KEY); return v === "accepted" || v === "essential-only" ? v : null; } catch { return null; } };
  const choice = read();
  const full = choice === "accepted";

  /* ---------- Google Analytics ---------- */
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", ID, full ? {} : { send_page_view: false, client_storage: "none", allow_google_signals: false, allow_ad_personalization_signals: false });
  if (!full) gtag("event", "page_view", { page_path: "/", page_location: location.origin + "/", page_referrer: "" });

  const s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(ID);
  document.head.appendChild(s);

  // Embudo: clic en los botones que llevan a Almuerzo.cl (ingresar, crear cuenta, pedir, reservar, mis pedidos).
  document.addEventListener("click", (e) => {
    const a = e.target instanceof Element ? e.target.closest("a[data-link]") : null;
    if (a) gtag("event", "cta_click", { cta: a.dataset.link, restaurant_id: C.restaurantId });
  });

  /* ---------- Aviso de cookies ---------- */
  if (choice !== null) return;
  const bar = document.createElement("section");
  bar.className = "cookie";
  bar.setAttribute("aria-label", "Aviso de cookies");

  const p = document.createElement("p");
  p.append("Usamos cookies para mejorar tu experiencia. Las analíticas son opcionales; si las rechazas, medimos las visitas de forma anónima, sin cookies. Revisa nuestra ");
  const link = document.createElement("a");
  link.href = (C.pwaUrl || "https://app2.almuerzo.cl").replace(/\/+$/, "") + "/cookies";
  link.textContent = "Política de Cookies";
  p.append(link, ".");

  const buttons = document.createElement("div");
  buttons.className = "cookie__btns";
  const decide = (value) => {
    try { localStorage.setItem(CONSENT_KEY, value); } catch { /* sin almacenamiento: se vuelve a preguntar la próxima vez */ }
    bar.remove();
    window.dispatchEvent(new Event(CONSENT_EVENT));
  };
  const mk = (text, cls, value) => { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = text; b.addEventListener("click", () => decide(value)); return b; };
  buttons.append(mk("Rechazar opcionales", "btn btn--paper btn--sm", "essential-only"), mk("Aceptar", "btn btn--yellow btn--sm", "accepted"));

  bar.append(p, buttons);
  document.body.appendChild(bar);
})();
