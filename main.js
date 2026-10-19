// ============================================================
// main.js — Proceso principal de Electron
//  - Crea la ventana de la aplicación.
//  - Consulta la API de TVmaze (proceso privilegiado) y entrega los
//    datos a la interfaz mediante IPC (ipcMain.handle).
//  - Guarda una copia local de los datos: si luego no hay internet,
//    la aplicación sigue funcionando con la ultima copia.
// ============================================================

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const { descargarSeries } = require("./series-api");

let seriesEnMemoria = null; // cache en memoria durante la sesion

const archivoCache = () => path.join(app.getPath("userData"), "series-cache.json");

async function leerCacheDisco() {
    try {
        return JSON.parse(await fs.readFile(archivoCache(), "utf8"));
    } catch {
        return null;
    }
}

async function guardarCacheDisco(series) {
    try {
        await fs.writeFile(archivoCache(), JSON.stringify({ fecha: Date.now(), series }));
    } catch (error) {
        console.error("No se pudo guardar la copia local:", error.message);
    }
}

// ------------------------------------------------------------
// Canal IPC: la interfaz pide las series y recibe
//   { ok: true,  datos, origen: "api" | "memoria" | "copia-local", aviso? }
//   { ok: false, error }
// ------------------------------------------------------------
ipcMain.handle("series:obtener", async (_evento, forzar) => {
    if (seriesEnMemoria && !forzar) {
        return { ok: true, datos: seriesEnMemoria, origen: "memoria" };
    }

    try {
        const { series, completo, aviso } = await descargarSeries();
        seriesEnMemoria = series;
        if (completo) await guardarCacheDisco(series);
        return {
            ok: true,
            datos: series,
            origen: "api",
            aviso: completo ? "" : `Se cargaron solo algunas series (${aviso}).`
        };
    } catch (error) {
        console.error("Error al consultar la API:", error.message);

        // Plan B: ultima copia guardada en disco
        const copia = await leerCacheDisco();
        if (copia && Array.isArray(copia.series) && copia.series.length) {
            seriesEnMemoria = copia.series;
            return {
                ok: true,
                datos: copia.series,
                origen: "copia-local",
                fecha: copia.fecha,
                aviso: error.message
            };
        }
        return { ok: false, error: error.message };
    }
});

// ------------------------------------------------------------
// Ventana principal
// ------------------------------------------------------------
function crearVentana() {
    const ventana = new BrowserWindow({
        width: 1240,
        height: 800,
        minWidth: 780,
        minHeight: 540,
        title: "Catálogo de Series",
        icon: path.join(__dirname, "assets", "icon.png"),
        backgroundColor: "#120e22",
        webPreferences: {
            // Buenas practicas de seguridad de Electron
            nodeIntegration: false,   // la interfaz no tiene acceso a Node.js
            contextIsolation: true,   // el preload corre en un contexto aislado
            preload: path.join(__dirname, "preload.js")
        }
    });

    ventana.setMenuBarVisibility(false);

    // La interfaz no debe abrir ventanas nuevas ni navegar fuera de la app
    ventana.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    ventana.webContents.on("will-navigate", (evento) => evento.preventDefault());

    // Carga el HTML desde el disco (sin servidor web local)
    ventana.loadFile(path.join(__dirname, "src", "index.html"));
}

app.whenReady().then(() => {
    crearVentana();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) crearVentana();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
