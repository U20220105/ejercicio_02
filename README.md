# Catálogo de Series (Electron)

Aplicación de escritorio para **consultar, buscar y filtrar series de TV**.
Desarrollada con HTML, CSS, JavaScript y Electron.

## API seleccionada

- **Nombre:** TVmaze API
- **URL:** https://api.tvmaze.com/shows?page=0 (documentación: https://www.tvmaze.com/api)
- Acceso público y gratuito, **sin API key**. Responde en formato JSON mediante HTTP/REST.
- Devuelve 250 series por página; la aplicación descarga 6 páginas (≈ 1 500 series),
  suficiente para justificar búsqueda y filtros.

## Campos de la API utilizados

| Campo de la API | Para qué se usa |
|---|---|
| `id` | Identificador único de la serie |
| `name` | Título mostrado y **búsqueda** |
| `genres` | Se muestra en la tarjeta, entra en la búsqueda y es el **filtro por género** |
| `status` | Se muestra en la tarjeta y es el **filtro por estado** (En emisión, Finalizada…) |
| `language` | Se muestra en la tarjeta y es el **filtro por idioma** |
| `premiered` | Año de estreno: **filtro por década** y orden |
| `rating.average` | Calificación (★) y orden «Mejor calificadas» |
| `network.name` / `webChannel.name` | Cadena o plataforma; entra en la búsqueda |
| `network.country.name` | País de la cadena (detalle) |
| `image.medium` / `image.original` | Póster de la serie |
| `summary` | Resumen (se limpia de etiquetas HTML) en la ventana de detalle |
| `runtime`, `type` | Duración y tipo, en la ventana de detalle |

Algunas series no tienen imagen, género, calificación o fecha; la aplicación muestra «—» o un
texto «Sin imagen» en esos casos.

## Funcionalidades

1. **Listado:** una tarjeta por serie con póster, título, calificación, estado, géneros, año de
   estreno, cadena e idioma. Se pintan de 40 en 40 con el botón «Mostrar más series».
2. **Buscador:** por título, género (en inglés o español) o cadena, sin distinguir mayúsculas ni
   tildes (`accion` encuentra «Acción»). La lógica está implementada en JavaScript (`src/js/app.js`).
3. **Filtros (4 + orden):** género, estado, idioma y década de estreno; además se puede ordenar por
   calificación, título o fecha. Todos se pueden combinar entre sí y con el buscador.
4. **Detalle:** al hacer clic en una tarjeta se abre una ventana con el resumen y más datos.
5. Botón **Limpiar filtros** y botón **Actualizar datos** (vuelve a consultar la API).
6. **Manejo de errores:** reintentos automáticos (límite de peticiones, fallos de red), mensajes
   claros y, si no hay internet, se muestra la última copia guardada en el equipo.

## Cómo ejecutarla

Requisitos: [Node.js](https://nodejs.org/) (LTS) y conexión a internet (la primera vez).

```bash
npm install
npm start
```

No necesita servidor web local ni Live Server: Electron carga `src/index.html` desde el disco.
No hay que configurar ninguna clave.

## Estructura

```
ejercicio_02/
├── package.json     # configuración y script "start"
├── main.js          # proceso principal: ventana + canal IPC + copia local
├── preload.js       # puente seguro con contextBridge
├── series-api.js    # cliente de la API TVmaze (paginación, reintentos, normalización)
├── src/
│   ├── index.html
│   ├── css/styles.css
│   └── js/app.js    # listado, búsqueda, filtros y detalle
└── assets/
    └── icon.png     # icono de la aplicación
```

## Seguridad (buenas prácticas de Electron)

- `nodeIntegration: false` y `contextIsolation: true`: la interfaz no tiene acceso a Node.js.
- La consulta a la API se hace en el **proceso principal** (`main.js` / `series-api.js`); la
  interfaz recibe los datos por IPC (`ipcMain.handle` / `ipcRenderer.invoke`).
- `preload.js` expone con `contextBridge` solo dos cosas: `obtenerSeries()` y la versión de
  Electron. Nunca se expone `ipcRenderer` completo.
- Política de seguridad de contenido (CSP) en el HTML: la interfaz no puede hacer peticiones de
  red (`connect-src 'none'`) y solo carga scripts y estilos propios.
- La ventana no puede abrir ventanas nuevas ni navegar fuera de la aplicación.
