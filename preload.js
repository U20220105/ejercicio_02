// ============================================================
// preload.js — Puente seguro entre la interfaz y el proceso principal
// Solo se expone lo necesario mediante contextBridge: la interfaz
// nunca recibe ipcRenderer completo ni acceso a Node.js.
// ============================================================

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
    // Pide las series al proceso principal
    obtenerSeries: (forzar = false) => ipcRenderer.invoke("series:obtener", forzar),
    // Version de Electron, solo informativa
    versionElectron: process.versions.electron
});
