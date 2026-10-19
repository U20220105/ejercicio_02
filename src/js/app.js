// ============================================================
// app.js — Lógica de la interfaz (proceso de renderizado)
//  1) Listado: pide las series por IPC y pinta una tarjeta por serie
//  2) Buscador: por título, género o cadena
//  3) Filtros: género, estado, idioma y década (+ orden)
//  4) Detalle: ventana modal con el resumen de la serie
// ============================================================

// ------------------------------------------------------------
// Referencias al DOM
// ------------------------------------------------------------
const lista = document.querySelector("#lista");
const templateSerie = document.querySelector("#template-serie").content;
const buscador = document.querySelector("#buscador");
const filtroGenero = document.querySelector("#filtro-genero");
const filtroEstado = document.querySelector("#filtro-estado");
const filtroIdioma = document.querySelector("#filtro-idioma");
const filtroDecada = document.querySelector("#filtro-decada");
const selectOrden = document.querySelector("#orden");
const btnLimpiar = document.querySelector("#btn-limpiar");
const btnActualizar = document.querySelector("#btn-actualizar");
const btnMas = document.querySelector("#btn-mas");
const contador = document.querySelector("#contador");
const cargando = document.querySelector("#cargando");
const mensajeError = document.querySelector("#mensaje-error");
const mensajeAviso = document.querySelector("#mensaje-aviso");
const sinResultados = document.querySelector("#sin-resultados");

const dialogo = document.querySelector("#detalle");
const detalleImg = document.querySelector("#detalle-img");
const detalleTitulo = document.querySelector("#detalle-titulo");
const detalleMeta = document.querySelector("#detalle-meta");
const detalleDatos = document.querySelector("#detalle-datos");
const detalleResumen = document.querySelector("#detalle-resumen");

// ------------------------------------------------------------
// Estado
// ------------------------------------------------------------
const TAMANO_LOTE = 40;      // tarjetas que se pintan cada vez
let series = [];             // todas las series recibidas de la API
let filtradas = [];          // resultado de aplicar busqueda + filtros
let mostradas = 0;           // cuantas tarjetas hay en pantalla

// ------------------------------------------------------------
// Traducciones (la API entrega todo en inglés)
// ------------------------------------------------------------
const GENEROS_ES = {
    Drama: "Drama", Comedy: "Comedia", Action: "Acción", "Science-Fiction": "Ciencia ficción",
    Crime: "Crimen", Thriller: "Suspenso", Horror: "Terror", Romance: "Romance",
    Adventure: "Aventura", Fantasy: "Fantasía", Mystery: "Misterio", Family: "Familiar",
    Anime: "Anime", Children: "Infantil", Music: "Música", Medical: "Médico", Legal: "Legal",
    History: "Historia", War: "Bélico", Western: "Western", Sports: "Deportes",
    Supernatural: "Sobrenatural", Espionage: "Espionaje", Food: "Comida", Travel: "Viajes",
    Nature: "Naturaleza", Adult: "Adulto", DIY: "Hágalo usted mismo"
};

const ESTADOS_ES = {
    Running: "En emisión", Ended: "Finalizada",
    "To Be Determined": "Por determinar", "In Development": "En desarrollo"
};

const IDIOMAS_ES = {
    English: "Inglés", Spanish: "Español", Japanese: "Japonés", Korean: "Coreano",
    French: "Francés", German: "Alemán", Portuguese: "Portugués", Italian: "Italiano",
    Russian: "Ruso", Chinese: "Chino", Hindi: "Hindi", Turkish: "Turco", Arabic: "Árabe",
    Dutch: "Neerlandés", Swedish: "Sueco", Danish: "Danés", Norwegian: "Noruego",
    Polish: "Polaco", Thai: "Tailandés", Hebrew: "Hebreo", Finnish: "Finlandés",
    Greek: "Griego", Czech: "Checo", Hungarian: "Húngaro", Ukrainian: "Ucraniano"
};

const traducirGenero = (g) => GENEROS_ES[g] || g;
const traducirEstado = (e) => ESTADOS_ES[e] || e || "Desconocido";
const traducirIdioma = (i) => IDIOMAS_ES[i] || i || "—";

// Quita tildes y pasa a minúsculas: "Acción" == "accion"
const normalizar = (texto) =>
    (texto || "")
        .toString()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

// ------------------------------------------------------------
// Carga de datos (IPC -> preload -> main -> API)
// ------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    if (window.api) {
        document.querySelector("#version-electron").textContent =
            `Electron v${window.api.versionElectron}`;
    }
    cargarSeries();
});

async function cargarSeries(forzar = false) {
    try {
        cargando.classList.remove("d-none");
        mensajeError.classList.add("d-none");
        mensajeAviso.classList.add("d-none");
        btnActualizar.disabled = true;

        if (!window.api) throw new Error("La aplicación debe ejecutarse con Electron");

        const respuesta = await window.api.obtenerSeries(forzar);
        if (!respuesta.ok) throw new Error(respuesta.error);

        series = respuesta.datos.map((serie) => ({
            ...serie,
            // Texto precalculado para que la búsqueda sea rápida
            textoBusqueda: normalizar(
                [serie.nombre, serie.cadena, ...serie.generos, ...serie.generos.map(traducirGenero)].join(" ")
            )
        }));

        poblarFiltros();
        aplicarFiltros();
        mostrarAviso(respuesta);
    } catch (error) {
        console.log(error);
        mensajeError.textContent =
            `No se pudo cargar la información: ${error.message}. ` +
            "Revisa tu conexión a internet y pulsa «Actualizar datos».";
        mensajeError.classList.remove("d-none");
    } finally {
        // finally siempre se ejecuta, haya o no error
        cargando.classList.add("d-none");
        btnActualizar.disabled = false;
    }
}

// Avisa si los datos no vienen de una consulta completa a la API
function mostrarAviso(respuesta) {
    let texto = "";
    if (respuesta.origen === "copia-local") {
        const fecha = new Date(respuesta.fecha).toLocaleString("es-SV");
        texto = `Sin conexión con la API (${respuesta.aviso}). Mostrando la última copia guardada el ${fecha}`;
    } else if (respuesta.aviso) {
        texto = respuesta.aviso;
    }
    if (texto) {
        mensajeAviso.textContent = texto;
        mensajeAviso.classList.remove("d-none");
    }
}

// ------------------------------------------------------------
// Llena los <select> con valores reales presentes en los datos
// (conserva la selección actual si se actualizan los datos)
// ------------------------------------------------------------
function poblarFiltros() {
    const actual = {
        genero: filtroGenero.value,
        estado: filtroEstado.value,
        idioma: filtroIdioma.value,
        decada: filtroDecada.value
    };

    const generos = [...new Set(series.flatMap((s) => s.generos))]
        .sort((a, b) => traducirGenero(a).localeCompare(traducirGenero(b), "es"));
    const estados = [...new Set(series.map((s) => s.estado).filter(Boolean))]
        .sort((a, b) => traducirEstado(a).localeCompare(traducirEstado(b), "es"));
    const idiomas = [...new Set(series.map((s) => s.idioma).filter(Boolean))]
        .sort((a, b) => traducirIdioma(a).localeCompare(traducirIdioma(b), "es"));
    const decadas = [...new Set(series.filter((s) => s.anio > 0).map((s) => Math.floor(s.anio / 10) * 10))]
        .sort((a, b) => b - a)
        .map(String);

    llenarSelect(filtroGenero, "Todos", generos, traducirGenero);
    llenarSelect(filtroEstado, "Todos", estados, traducirEstado);
    llenarSelect(filtroIdioma, "Todos", idiomas, traducirIdioma);
    llenarSelect(filtroDecada, "Todas", decadas, (d) => `${d}s`);

    filtroGenero.value = generos.includes(actual.genero) ? actual.genero : "";
    filtroEstado.value = estados.includes(actual.estado) ? actual.estado : "";
    filtroIdioma.value = idiomas.includes(actual.idioma) ? actual.idioma : "";
    filtroDecada.value = decadas.includes(actual.decada) ? actual.decada : "";
}

function llenarSelect(select, textoTodos, valores, etiqueta) {
    select.textContent = "";
    select.add(new Option(textoTodos, ""));
    valores.forEach((valor) => select.add(new Option(etiqueta(valor), valor)));
}

// ------------------------------------------------------------
// Búsqueda + filtros + orden
// ------------------------------------------------------------
function aplicarFiltros() {
    const consulta = normalizar(buscador.value);
    const genero = filtroGenero.value;
    const estado = filtroEstado.value;
    const idioma = filtroIdioma.value;
    const decada = filtroDecada.value ? Number(filtroDecada.value) : null;

    filtradas = series.filter((serie) => {
        if (consulta && !serie.textoBusqueda.includes(consulta)) return false;
        if (genero && !serie.generos.includes(genero)) return false;
        if (estado && serie.estado !== estado) return false;
        if (idioma && serie.idioma !== idioma) return false;
        if (decada !== null && !(serie.anio >= decada && serie.anio < decada + 10)) return false;
        return true;
    });

    ordenar(filtradas, selectOrden.value);

    lista.textContent = "";
    mostradas = 0;
    mostrarLote();
}

function ordenar(arreglo, criterio) {
    if (criterio === "nombre") {
        arreglo.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    } else if (criterio === "reciente") {
        arreglo.sort((a, b) => b.anio - a.anio);
    } else if (criterio === "antigua") {
        // las series sin fecha (anio 0) van al final
        arreglo.sort((a, b) => (a.anio || 9999) - (b.anio || 9999));
    } else {
        arreglo.sort((a, b) => b.calificacion - a.calificacion);
    }
}

// ------------------------------------------------------------
// Pinta las tarjetas con <template> + DocumentFragment
// (de a TAMANO_LOTE para que la ventana no se ponga lenta)
// ------------------------------------------------------------
function mostrarLote() {
    const fragmento = document.createDocumentFragment();
    const lote = filtradas.slice(mostradas, mostradas + TAMANO_LOTE);

    lote.forEach((serie) => {
        const clon = templateSerie.cloneNode(true);
        const tarjeta = clon.querySelector(".tarjeta");
        tarjeta.dataset.id = serie.id;

        const img = clon.querySelector(".poster-img");
        const sinPoster = clon.querySelector(".sin-poster");
        if (serie.imagen) {
            img.setAttribute("src", serie.imagen);
            img.setAttribute("alt", `Póster de ${serie.nombre}`);
            // Si la imagen no carga, se muestra un texto en su lugar
            img.addEventListener("error", () => {
                img.classList.add("d-none");
                sinPoster.classList.remove("d-none");
            });
        } else {
            img.classList.add("d-none");
            sinPoster.classList.remove("d-none");
        }

        clon.querySelector(".nota").textContent = serie.calificacion ? serie.calificacion.toFixed(1) : "";
        clon.querySelector(".nombre").textContent = serie.nombre;
        clon.querySelector(".estado-texto").textContent = traducirEstado(serie.estado);
        clon.querySelector(".generos").textContent = serie.generos.map(traducirGenero).slice(0, 3).join(" · ");
        clon.querySelector(".anio").textContent = serie.anio || "—";
        clon.querySelector(".cadena").textContent = serie.cadena || "—";
        clon.querySelector(".idioma").textContent = traducirIdioma(serie.idioma);

        // El color del punto depende del estado
        const estado = clon.querySelector(".estado");
        if (serie.estado === "Running") estado.classList.add("en-emision");
        if (serie.estado === "Ended") estado.classList.add("finalizada");

        fragmento.appendChild(clon);
    });

    lista.appendChild(fragmento);
    mostradas += lote.length;

    contador.textContent = `Mostrando ${mostradas} de ${filtradas.length} series (${series.length} cargadas)`;
    sinResultados.classList.toggle("d-none", filtradas.length > 0 || series.length === 0);
    btnMas.classList.toggle("d-none", mostradas >= filtradas.length);
}

// ------------------------------------------------------------
// Detalle de una serie (<dialog> modal)
// ------------------------------------------------------------
function abrirDetalle(id) {
    const serie = series.find((s) => String(s.id) === String(id));
    if (!serie) return;

    detalleImg.classList.toggle("d-none", !serie.imagenGrande);
    detalleImg.setAttribute("src", serie.imagenGrande || "");
    detalleImg.setAttribute("alt", `Póster de ${serie.nombre}`);
    detalleTitulo.textContent = serie.nombre;
    detalleMeta.textContent = serie.generos.map(traducirGenero).join(" · ") || "Sin género";

    const datos = [
        ["Calificación", serie.calificacion ? `${serie.calificacion.toFixed(1)} / 10` : "—"],
        ["Estado", traducirEstado(serie.estado)],
        ["Estreno", serie.estreno || "—"],
        ["Cadena", serie.cadena ? `${serie.cadena}${serie.pais ? ` (${serie.pais})` : ""}` : "—"],
        ["Idioma", traducirIdioma(serie.idioma)],
        ["Duración", serie.duracion ? `${serie.duracion} min por episodio` : "—"],
        ["Tipo", serie.tipo || "—"]
    ];
    detalleDatos.textContent = "";
    datos.forEach(([etiqueta, valor]) => {
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");
        dt.textContent = etiqueta;
        dd.textContent = valor;
        detalleDatos.append(dt, dd);
    });

    detalleResumen.textContent = serie.resumen || "Esta serie no tiene resumen disponible.";
    dialogo.showModal();
}

lista.addEventListener("click", (evento) => {
    const tarjeta = evento.target.closest(".tarjeta");
    if (tarjeta) abrirDetalle(tarjeta.dataset.id);
});

lista.addEventListener("keydown", (evento) => {
    if (evento.key !== "Enter" && evento.key !== " ") return;
    const tarjeta = evento.target.closest(".tarjeta");
    if (tarjeta) {
        evento.preventDefault();
        abrirDetalle(tarjeta.dataset.id);
    }
});

document.querySelector("#detalle-cerrar").addEventListener("click", () => dialogo.close());
// Clic fuera del cuadro (sobre el fondo oscuro) también cierra
dialogo.addEventListener("click", (evento) => {
    if (evento.target === dialogo) dialogo.close();
});

// ------------------------------------------------------------
// Eventos
// ------------------------------------------------------------
buscador.addEventListener("input", aplicarFiltros);
filtroGenero.addEventListener("change", aplicarFiltros);
filtroEstado.addEventListener("change", aplicarFiltros);
filtroIdioma.addEventListener("change", aplicarFiltros);
filtroDecada.addEventListener("change", aplicarFiltros);
selectOrden.addEventListener("change", aplicarFiltros);
btnMas.addEventListener("click", mostrarLote);

btnLimpiar.addEventListener("click", () => {
    buscador.value = "";
    filtroGenero.value = "";
    filtroEstado.value = "";
    filtroIdioma.value = "";
    filtroDecada.value = "";
    selectOrden.value = "calificacion";
    aplicarFiltros();
});

btnActualizar.addEventListener("click", () => cargarSeries(true));
