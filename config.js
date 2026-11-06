// Configuración PÚBLICA del sitio (sin secretos): la clave es la "publishable" de Supabase, pensada para el navegador.
// Lo que puede leer está limitado por las políticas RLS de almuerzo.cl (menú y datos del local son de lectura pública).
window.CRIOLLA_CONFIG = {
  supabaseUrl: "https://kqanordhsmbtcwtjtrme.supabase.co",
  supabaseKey: "sb_publishable_A7iPFf__kAhp12lZFzl2VA_4hfNGmPI",
  // Cri-Olla - Parque Titanium (restaurants.id). También es el `source` del registro de clientes (profiles.source_restaurant_id).
  restaurantId: "c8f518ae-2da9-4bb4-a95f-cca4c6b96056",
  pwaUrl: "https://app2.almuerzo.cl",
  timezone: "America/Santiago",
  refreshSeconds: 60,
  // Pop-up «¿Sabías que tenemos otro local?». Poner enabled:false para apagarlo.
  otherLocal: {
    enabled: true,
    name: "Cri-Olla Los Militares",
    address: "Los Militares 5934, Local H, Las Condes",
    showAfterSeconds: 4,
    hideForDays: 7
  }
};
