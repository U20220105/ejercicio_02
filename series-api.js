// ============================================================
// series-api.js — Cliente de la API pública de TVmaze
// Se ejecuta en el proceso principal de Electron (Node).
//
// API:   https://api.tvmaze.com/shows?page=N
// - Pública, gratuita y SIN API key.
// - Devuelve JSON: 250 series por página (la pagina 0 trae los IDs 0-249,
//   la 1 los IDs 250-499, etc.). Cuando se acaban responde 404.
// - Limite: ~20 peticiones cada 10 segundos por IP (aqui se hacen 6).
// ============================================================

const BASE_URL = process.env.TVMAZE_BASE_URL || "https://api.tvmaze.com";
const PAGINAS = Number(process.env.TVMAZE_PAGINAS) || 6;   // 6 x 250 = 1500 series
const TIMEOUT_MS = 15000;
const MAX_REINTENTOS = 3;

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

// ------------------------------------------------------------
// Una pagina, con timeout y reintentos (429, 5xx y fallos de red)
// Devuelve null si la pagina no existe (404 = fin del catalogo)
// ------------------------------------------------------------
async function pedirPagina(numero) {
    const url = `${BASE_URL}/shows?page=${numero}`;
    let ultimoError;

    for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
        try {
            const respuesta = await fetch(url, {
                headers: { Accept: "application/json" },
                signal: AbortSignal.timeout(TIMEOUT_MS)
            });

            if (respuesta.status === 404) return null;

            if (respuesta.ok) {
                const datos = await respuesta.json();
                if (!Array.isArray(datos)) throw Object.assign(new Error("La API devolvió un formato inesperado"), { definitivo: true });
                return datos;
            }

            if (respuesta.status !== 429 && respuesta.status < 500) {
                throw Object.assign(new Error(`La API respondió con el estado ${respuesta.status}`), { definitivo: true });
            }
            ultimoError = new Error(
                respuesta.status === 429
                    ? "Demasiadas peticiones a la API, espera unos segundos"
                    : `El servidor de la API tiene problemas (${respuesta.status})`
            );
        } catch (error) {
            if (error.definitivo) throw error;
            ultimoError = error.name === "TimeoutError"
                ? new Error("La API tardó demasiado en responder")
                : new Error("No hay conexión con la API (revisa tu internet)");
        }
        await esperar(800 * 2 ** intento); // 0.8 s, 1.6 s, 3.2 s
    }
    throw ultimoError;
}

// ------------------------------------------------------------
// Quita las etiquetas HTML del resumen (la API lo entrega como HTML)
// ------------------------------------------------------------
function textoPlano(html) {
    return String(html || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&(aacute|eacute|iacute|oacute|uacute|ntilde);/g, (_, c) =>
            ({ aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ" })[c])
        .replace(/&nbsp;/g, " ")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
}

const aHttps = (url) => (url ? String(url).replace(/^http:\/\//i, "https://") : "");

// ------------------------------------------------------------
// Convierte una serie "cruda" en un objeto compacto con solo lo que
// necesita la interfaz. Varios campos pueden venir vacios (null).
// ------------------------------------------------------------
function normalizarSerie(s) {
    const estreno = typeof s.premiered === "string" ? s.premiered : "";
    const canal = s.network || s.webChannel || null;
    return {
        id: s.id,
        nombre: s.name || "Sin nombre",
        tipo: s.type || "",
        idioma: s.language || "",
        generos: Array.isArray(s.genres) ? s.genres : [],
        estado: s.status || "",
        duracion: Number(s.runtime || s.averageRuntime) || 0,
        estreno,
        anio: estreno ? Number(estreno.slice(0, 4)) || 0 : 0,
        calificacion: Number(s.rating?.average) || 0,
        cadena: canal?.name || "",
        pais: canal?.country?.name || "",
        imagen: aHttps(s.image?.medium || s.image?.original),
        imagenGrande: aHttps(s.image?.original || s.image?.medium),
        resumen: textoPlano(s.summary)
    };
}

// ------------------------------------------------------------
// Descarga varias paginas en orden.
// Si falla una pagina posterior a la primera, se conserva lo ya
// descargado y se marca como incompleto.
// ------------------------------------------------------------
async function descargarSeries() {
    const crudas = [];
    let completo = true;
    let aviso = "";

    for (let pagina = 0; pagina < PAGINAS; pagina++) {
        try {
            const datos = await pedirPagina(pagina);
            if (datos === null || datos.length === 0) break;
            crudas.push(...datos);
        } catch (error) {
            if (pagina === 0) throw error;      // sin datos: es un error real
            completo = false;
            aviso = error.message;
            break;
        }
    }

    const series = crudas.map(normalizarSerie);
    if (series.length === 0) throw new Error("La API no devolvió series");
    return { series, completo, aviso };
}

module.exports = { descargarSeries, normalizarSerie, textoPlano };
