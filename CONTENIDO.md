# criolla — sitio web de Cri-Olla

Sitio estático (`index.html` + `support.js`), sin build.

- **Fuente:** este repo (`almuerzocl/criolla`), rama `main`.
- **Despliegue:** Cloudflare (Worker `criolla`, https://criolla.esteban-4af.workers.dev), conectado a GitHub.
- **Dominio de producción:** https://criolla.almuerzo.cl (dominio personalizado configurado en Cloudflare; el DNS de `almuerzo.cl` también está allí).
- **Excepción a la regla de "solo Google Cloud":** decisión del usuario (2026-10-23). Este sitio NO usa Cloud Build ni Cloud Run, y no debe llevar `Dockerfile` ni `cloudbuild.yaml`.
- Sin secretos ni variables de build. `config.js` (valores públicos de Supabase) todavía no lo carga `index.html`.
