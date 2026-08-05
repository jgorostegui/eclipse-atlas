export type OfficialObservationDirectory = Readonly<{
  region: string;
  producer: string;
  url: string;
}>;

export const officialObservationDirectories: readonly OfficialObservationDirectory[] = [
  {
    region: "Andalucía",
    producer: "Trío de Eclipses",
    url: "https://www.trioeclipses.es/ccaa/andalucia",
  },
  {
    region: "Aragón",
    producer: "Gobierno de Aragón",
    url: "https://www.turismodearagon.com/eclipse-solar-2026/",
  },
  {
    region: "Asturias",
    producer: "Gobierno de Asturias / FICYT",
    url: "https://eclipseasturias2026.ficyt.es/puntos_observacion.php",
  },
  {
    region: "Illes Balears",
    producer: "Govern de les Illes Balears",
    url: "https://www.caib.es/webgoib/-/zones-d-observaci%C3%B3-oficial-zoo-",
  },
  {
    region: "Cantabria",
    producer: "Turismo de Cantabria",
    url: "https://turismodecantabria.com/eclipse-total-de-sol-del-dia-12-de-agosto-de-2026/",
  },
  {
    region: "Castilla-La Mancha",
    producer: "Astroturismo Castilla-La Mancha",
    url: "https://www.astroturismoclm.com/menu/eventos/trio-de-eclipses.html",
  },
  {
    region: "Castilla y León",
    producer: "Junta de Castilla y León",
    url: "https://www.jcyl.es/web/es/portada/eclipse-solar/puntos-visualizacion-recomendados.html",
  },
  {
    region: "Catalunya",
    producer: "Generalitat de Catalunya / IEEC",
    url: "https://eclipsicatalunya.cat/punts-d-observacio/",
  },
  {
    region: "Comunitat Valenciana",
    producer: "Generalitat Valenciana",
    url: "https://eclipses.gva.es/vive-el-eclipse/",
  },
  {
    region: "Euskadi",
    producer: "Gobierno Vasco",
    url: "https://turismo.euskadi.eus/es/eclipse-solar-total/",
  },
  {
    region: "Galicia",
    producer: "Xunta de Galicia",
    url: "https://eclipse.xunta.gal/portada",
  },
  {
    region: "La Rioja",
    producer: "Gobierno de La Rioja",
    url: "https://web.larioja.org/eclipse/",
  },
  {
    region: "Madrid",
    producer: "Comunidad de Madrid",
    url: "https://www.comunidad.madrid/trio-eclipses-2026-2027-2028",
  },
  {
    region: "Navarra",
    producer: "Gobierno de Navarra / NICDO",
    url: "https://eklipsenavarra.com/es/puntos-de-observacion",
  },
];
