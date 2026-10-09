# Proyecto Base: Pruebas de Reconocimiento con un GUI Ripper (Playwright)

Un _GUI ripper_ explora automáticamente la interfaz gráfica de una aplicación web: visita sus
páginas, interactúa con los elementos que encuentra (campos de texto, botones, listas
desplegables, enlaces) y construye un grafo con los estados de la interfaz y las transiciones entre
ellos. Es una técnica de reconocimiento: ayuda a descubrir la estructura de la aplicación y errores
evidentes sin escribir casos de prueba.

Este módulo usa [Playwright](https://playwright.dev) como librería y está basado en
[TheSoftwareDesignLab/RIPuppetCoursera](https://github.com/TheSoftwareDesignLab/RIPuppetCoursera).

## Requisitos

- Node.js 24 (`lts/krypton`). El módulo incluye un `.nvmrc`, por lo que pueden usar `nvm use`.
- npm (incluido con Node.js).
- Navegador: `prepare` descarga Chromium para Playwright. Si configuran Firefox o WebKit, instálenlos
  con `npx playwright install firefox webkit`.

## Instalación

Desde la **raíz del repositorio** del proyecto:

```bash
npm run ripper:install
npm run ripper:prepare
```

> [!IMPORTANT]
> Instalen siempre desde la raíz. `ripper:install` deja las dependencias del módulo en su propia
> carpeta `node_modules`, aisladas de los demás módulos. Un `npm install` dentro de la carpeta del
> módulo instala en la raíz del repositorio y modifica el `package-lock.json` raíz sin ese aislamiento.

## Ejecución

| Acción | Desde la raíz | Desde `reconocimiento/misw-4103-ripper` |
|---|---|---|
| Explorar en modo headless (según `config.json`) | `npm run ripper:test` | `npm test` |
| Explorar viendo el navegador | `npm run ripper:ui` | `npm run test:ui` |

`ripper:ui` define `HEADLESS=false`, que tiene prioridad sobre el campo `headless` de `config.json`.

## Estructura

```plaintext
misw-4103-ripper/
├── .nvmrc
├── package.json
├── abp.cjs            # lee la configuración de la aplicación bajo pruebas (.env)
├── config.json        # parámetros de la exploración
├── index.js           # el ripper (beforeExploring prepara la aplicación)
└── public/
    ├── index.html     # plantilla del reporte (grafo interactivo)
    └── index.css
```

## Configuración

`config.json`:

| Campo | Descripción | Valor por defecto |
|---|---|---|
| `url` | Página inicial. También define qué es "el mismo sitio": solo se interactúa con las páginas cuya URL contiene este valor; las demás solo se capturan. | `https://angular-6-registration-login-example.stackblitz.io` (demo en StackBlitz) |
| `headless` | Ejecutar sin ventana del navegador. | `true` |
| `depthLevels` | Profundidad de la exploración siguiendo enlaces (`1` = página inicial y los enlaces que contiene). | `1` |
| `inputValues` | Si es `true`, los campos cuyo `id` aparezca en `values` se llenan con ese valor. | `false` |
| `values` | Pares `id del campo → valor`. Los demás campos se llenan con datos aleatorios según su tipo. | ejemplo de formulario |
| `browsers` | Navegadores a usar: `chromium`, `firefox` y/o `webkit`. | `["chromium"]` |
| `viewportWidth`, `viewportHeight` | Tamaño de la ventana (opcionales). | `1280` × `720` |

## Explorar la ABP

La URL y el administrador de la aplicación bajo pruebas (ABP) están en el archivo `.env` de la raíz
del repositorio, el mismo que usa `npm run abp:up` para desplegar Ghost; `abp.cjs` lo lee. Las
variables disponibles son `ABP_URL`, `ABP_RC_URL`, `ABP_ADMIN_NAME`, `ABP_ADMIN_EMAIL` y
`ABP_ADMIN_PASSWORD`. Una variable de entorno con el mismo nombre tiene prioridad sobre el `.env`;
fuera de un repositorio del proyecto (sin `.env`) se usan los valores por defecto de `abp.cjs`. `index.js` las carga en `abp` (por ejemplo, `abp.ABP_ADMIN_EMAIL`), sin copiarlas en el
módulo.

Para explorar Ghost:

1. Usen en `url` la de `ABP_URL` (`http://localhost:2368`) y levanten la ABP (`npm run abp:up` desde
   la raíz).
2. Para explorar el panel de administración, inicien sesión en la función `beforeExploring(page)` de
   `index.js`: se ejecuta una vez por navegador, antes de la exploración, sobre la misma página que
   usa el ripper. Usen `abp.ABP_URL`, `abp.ABP_ADMIN_EMAIL` y `abp.ABP_ADMIN_PASSWORD`.

`inputValues` y `values` sirven para llenar con valores fijos los campos que el ripper encuentre al
explorar (por ejemplo, un formulario de búsqueda).

## Qué hace la exploración

En cada página del mismo sitio el ripper:

1. Llena los `input` (con `values` o con datos aleatorios de [Faker](https://fakerjs.dev) según su tipo).
2. Hace clic en cada botón habilitado; si el DOM cambia a un estado nuevo, lo registra como
   transición `button-click` y guarda una captura del botón antes del clic (`…BEFORE.png`).
3. Selecciona cada opción habilitada de cada `select`; si el DOM cambia, registra `dropdown-opt-click`.
4. Toma una captura de la página completa y sigue sus enlaces (`link-click`) hasta `depthLevels`.

Los mensajes de consola se asocian a los estados de la URL en la que aparecieron (`graph3.json`), y
cada excepción no controlada de la página genera una captura en `screenshots/`.

## Resultados y reporte

Cada ejecución crea `results/<fecha>/<navegador>/` (en el `.gitignore`) con:

- `screenshots/`: una captura por estado y las capturas `…BEFORE.png` de los botones.
- `graph.json` (páginas y enlaces), `graph2.json` (estados y transiciones) y `graph3.json`
  (estados con sus errores).
- `report.html` e `index.css`: reporte con el grafo interactivo; al hacer clic en un nodo se ven su
  captura y sus errores.

El reporte carga `graph3.json` con una petición HTTP, que los navegadores bloquean si se abre como
archivo (`file://`). Sírvanlo con un servidor local, por ejemplo:

```bash
npx http-server "results/<fecha>/chromium" -o report.html
```

El reporte descarga D3, jQuery y Bootstrap desde Internet.

## Solución de problemas

- **`Executable doesn't exist at …`**: falta el navegador; ejecuten `npm run ripper:prepare`.
- **`Unsupported browsers in config.json`**: revisen el campo `browsers`.
- **El reporte se ve vacío**: lo abrieron como archivo; sírvanlo por HTTP (ver arriba).
- **Advertencia `EBADENGINE`**: están usando una versión de Node.js anterior a la 24.

## Referencias

- [Playwright como librería](https://playwright.dev/docs/library)
- [RIPuppetCoursera](https://github.com/TheSoftwareDesignLab/RIPuppetCoursera)
