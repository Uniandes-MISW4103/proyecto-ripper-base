# Proyecto Base: Pruebas de Reconocimiento con un GUI Ripper (Playwright)

Un _GUI ripper_ explora automáticamente la interfaz gráfica de una aplicación web y construye un
modelo de ella: un grafo cuyos nodos son los **estados** de la interfaz (lo que el usuario ve) y cuyas
aristas son las **acciones** que llevan de un estado a otro (seguir un enlace, hacer clic en un botón,
llenar y enviar un formulario, elegir una opción). Es una técnica de reconocimiento: descubre la
estructura de la aplicación y errores evidentes sin escribir casos de prueba.

Este ripper:

- explora de forma **sistemática** (en anchura), estado por estado, cada acción disponible;
- reconoce los estados a los que se llega sin cambiar de URL (diálogos, paneles, mensajes);
- es **reproducible**: con la misma semilla y los mismos parámetros recorre la misma secuencia de
  eventos;
- **guarda su avance** después de cada acción, de modo que una exploración detenida (por un
  presupuesto o con Ctrl+C) se puede continuar más tarde desde el mismo punto;
- asocia cada falla (errores de JavaScript, de consola o HTTP) a la acción que la produjo, con los
  pasos para reproducirla.

Usa [Playwright](https://playwright.dev) como librería y se inspira en
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
| Iniciar una exploración (según `config.json`) | `npm run ripper:test` | `npm test` |
| Iniciar una exploración viendo el navegador | `npm run ripper:ui` | `npm run test:ui` |
| Continuar la última exploración sin terminar | `npm run ripper:resume` | `npm run resume` |
| Continuar una exploración específica | — | `npm run resume -- <ejecución>` |

`ripper:ui` define `HEADLESS=false`, que tiene prioridad sobre el campo `headless` de `config.json`.
`<ejecución>` es el nombre de la carpeta de la ejecución en `results/`.

## Estructura

```plaintext
misw-4103-ripper/
├── .nvmrc
├── package.json
├── abp.cjs            # lee la configuración de la aplicación bajo pruebas (.env)
├── config.json        # parámetros de la exploración
├── hooks.js           # preparación de la aplicación (inicio de sesión) y exclusiones propias
├── src/               # el ripper
│   ├── cli.js         # comandos test y resume
│   ├── config.js      # lectura y validación de config.json
│   ├── ripper.js      # ciclo de exploración
│   ├── model.js       # modelo: estados, eventos y acciones pendientes
│   ├── scan.js        # elementos interactivos de la página
│   ├── fingerprint.js # identificación de estados
│   ├── discovery.js   # acciones de cada estado, alcance y exclusiones
│   ├── actions.js     # ejecución de las acciones
│   ├── data.js        # valores de los campos
│   ├── oracles.js     # detección de fallas
│   ├── browser.js     # navegador y sesión
│   ├── checkpoint.js  # avance guardado de cada ejecución
│   └── report/        # summary.json y report.html
└── test/              # pruebas del ripper (npm run test:engine)
```

`config.json` y `hooks.js` son los archivos que se adaptan a la aplicación bajo pruebas. Los
archivos de `src/` son el ripper; si los modifican, documenten el cambio y su propósito en este
`README.md`.

## Configuración

`config.json` (todos los campos son opcionales; un campo desconocido o un valor inválido detiene la
ejecución con un mensaje que lo indica):

| Campo | Descripción | Valor por defecto |
|---|---|---|
| `url` | Página inicial de la exploración. | `https://angular-6-registration-login-example.stackblitz.io` (demo en StackBlitz) |
| `seed` | Semilla: fija el orden en que se exploran las acciones de cada estado y los valores que se escriben en los campos. | `4103` |
| `browser` | `chromium`, `firefox` o `webkit`. | `chromium` |
| `headless` | Ejecutar sin ventana del navegador. | `true` |
| `viewport` | Tamaño de la ventana: `{ "width": …, "height": … }`. | `1280` × `720` |
| `maxDepth` | Profundidad máxima: cantidad de acciones desde la página inicial. Los estados a esa profundidad se registran, pero sus acciones no se exploran. | `2` |
| `maxActions` | Acciones que ejecuta cada sesión (`test` o `resume`) antes de detenerse. | `200` |
| `maxStates` | La exploración se detiene al llegar a esta cantidad de estados. | `50` |
| `maxDurationSeconds` | Duración máxima de cada sesión, en segundos (`0` = sin límite). | `0` |
| `settleMs` | Tiempo sin cambios en la página que se espera después de cada acción. | `500` |
| `actionTimeoutMs`, `navigationTimeoutMs` | Tiempo máximo de cada acción y de cada navegación. | `5000`, `15000` |
| `scope` | Prefijos de URL que el ripper puede visitar. Los enlaces fuera del alcance no se siguen y las navegaciones hacia afuera se bloquean. | el origen de `url` |
| `exclude` | Textos que, si aparecen en el texto, el enlace o el selector de un elemento, impiden actuar sobre él (sin distinguir mayúsculas). | `["signout", "sign out", "logout", "log out"]` |
| `fingerprint.ignore` | Selectores CSS de regiones que no cuentan para identificar un estado (por ejemplo, un contador o una lista de notificaciones). | `[]` |
| `fingerprint.includeQuery` | Si la consulta de la URL (`?…`) distingue estados. | `false` |
| `values` | Valores fijos para los campos, por `id`, `name` o etiqueta del campo. Los demás campos se llenan con datos de [Faker](https://fakerjs.dev) según su tipo. | `{}` |

## Explorar la ABP

La URL y el administrador de la aplicación bajo pruebas (ABP) están en el archivo `.env` de la raíz
del repositorio, el mismo que usa `npm run abp:up` para desplegar Ghost; `abp.cjs` lo lee. Las
variables disponibles son `ABP_URL`, `ABP_RC_URL`, `ABP_ADMIN_NAME`, `ABP_ADMIN_EMAIL` y
`ABP_ADMIN_PASSWORD`. Una variable de entorno con el mismo nombre tiene prioridad sobre el `.env`;
fuera de un repositorio del proyecto (sin `.env`) se usan los valores por defecto de `abp.cjs`. El
ripper las entrega a `hooks.js` en `abp` (por ejemplo, `abp.ABP_ADMIN_EMAIL`), sin copiarlas en el
módulo.

Para explorar Ghost:

1. Levanten la ABP desde la raíz (`npm run abp:up`) y usen en `url` la página de la ABP que quieren
   explorar, con la URL de `ABP_URL` (`http://localhost:2368`).
2. Para explorar el panel de administración, inicien sesión en la función `beforeExploring(page, {
   abp })` de `hooks.js`, con `abp.ABP_URL`, `abp.ABP_ADMIN_EMAIL` y `abp.ABP_ADMIN_PASSWORD`. El
   ripper la ejecuta en cada contexto nuevo del navegador antes de abrir `url`: al empezar y cada vez
   que necesita un contexto limpio para restaurar un estado.
3. Revisen `exclude`: además de cerrar sesión, excluyan las acciones que destruyen los datos que la
   exploración necesita (por ejemplo, borrar todo el contenido), las que la sacan del panel y las que
   cambian preferencias que la ABP guarda (por ejemplo, ocultar el menú lateral): después de ellas,
   los estados anteriores ya no se pueden restaurar. También pueden excluir acciones con la función
   `isExcluded(action)` de `hooks.js`.

`values` sirve para llenar con valores fijos los campos que el ripper encuentre al explorar (por
ejemplo, un formulario de búsqueda).

## Cómo explora

1. Abre `url` y registra el estado inicial (`s0`) con sus **acciones**: enlaces dentro del alcance,
   botones, casillas, cada opción de las listas desplegables (hasta cinco por lista), cada campo de
   texto fuera de un formulario, y cada formulario como una sola acción (llenar sus campos y
   enviarlo). Si hay un diálogo abierto, solo se consideran los elementos del diálogo.
2. Toma la siguiente acción pendiente, en anchura: primero todas las del estado inicial, luego las de
   los estados a profundidad 1, y así sucesivamente. El orden de las acciones de cada estado depende
   de la semilla.
3. Lleva el navegador al estado de esa acción. Si no está en él, lo **restaura**: abre `url` y repite
   el camino de acciones con el que se descubrió el estado.
4. Ejecuta la acción, espera a que la página deje de cambiar e identifica el estado resultante: uno
   nuevo, uno conocido o el mismo. Registra el evento con su resultado y las fallas que aparecieron.
5. Si el estado es nuevo y está por debajo de `maxDepth`, agrega sus acciones a las pendientes.
6. Guarda el avance y repite hasta que no queden acciones pendientes o se alcance un presupuesto.

Un **estado** se identifica por la ruta de la página (sin la consulta) y la estructura de sus
elementos interactivos, sus títulos principales, el diálogo abierto y la presencia de alertas o
campos inválidos, sin el texto libre ni los identificadores que el framework genera en cada render.
Una lista que crece no crea un estado nuevo.

Resultados de un evento: `new-state`, `known-state`, `same-state`, `external` (la acción intentó
salir del alcance) y `error` (la acción no se pudo ejecutar, por ejemplo porque el elemento ya no
existe). Un estado que no se puede restaurar se marca como no restaurable y sus acciones pendientes
se omiten.

### Fallas que detecta

| Tipo | Qué es |
|---|---|
| `pageerror` | Excepción de JavaScript no controlada en la página. |
| `console` | Mensaje de error en la consola del navegador. |
| `http` | Respuesta 4xx o 5xx de una URL dentro del alcance. |
| `requestfailed` | Petición dentro del alcance que no obtuvo respuesta. |
| `crash` | La página dejó de responder. |

Los diálogos del navegador (`alert`, `confirm`) se cierran con "Cancelar" y quedan registrados en el
evento.

## Semillas y reproducibilidad

La semilla determina el orden de exploración y los datos que se escriben. Dos ejecuciones con la
misma semilla y los mismos parámetros recorren la misma secuencia de eventos, siempre que la ABP
empiece con los mismos datos: antes de comparar ejecuciones, restauren la ABP con
`npm run abp:reset`, porque la exploración crea y modifica contenido. Con presupuestos, semillas
distintas exploran partes distintas de la aplicación.

La secuencia de eventos de una ejecución está en `results.events` de su `summary.json`.

## Presupuestos y continuación

Cada sesión se detiene al ejecutar `maxActions` acciones, al cumplir `maxDurationSeconds` o al llegar
a `maxStates` estados, y también con Ctrl+C (el ripper termina la acción en curso y guarda el
avance). Para continuar:

```bash
npm run ripper:resume
```

Una ejecución continuada produce los mismos eventos que una ejecución sin interrupciones con los
mismos parámetros. Entre sesiones pueden cambiar los presupuestos, los tiempos y `headless`; si
cambian `url`, `seed`, `browser`, `viewport`, `maxDepth`, `scope`, `exclude`, `fingerprint` o
`values`, el ripper no continúa la ejecución e indica qué campo cambió.

## Resultados y reporte

Cada ejecución crea `results/<fecha>/` (en el `.gitignore`) con:

- `report.html`: reporte con el grafo de estados (se puede desplazar y ampliar), el detalle de cada
  estado (captura, URL, profundidad y cómo llegar a él), cada evento (captura del elemento antes de
  la acción, fallas y pasos para reproducirlo), la tabla de fallas y la de eventos. Se abre
  directamente desde el explorador de archivos, sin servidor ni conexión a Internet.
- `summary.json`: la configuración, el ambiente, las sesiones, los estados, la secuencia ordenada de
  eventos y las fallas.
- `checkpoint.json`: el avance guardado, que usa `ripper:resume`.
- `screenshots/`: una captura por estado (`s<n>.png`) y una del elemento de cada evento antes de la
  acción (`e<n>.png`).

Códigos de salida: `0` si la exploración terminó o se detuvo por un presupuesto, `1` si la
configuración o la preparación (`beforeExploring`, la página inicial) fallaron, `2` si se interrumpió.

## Solución de problemas

- **`Executable doesn't exist at …`**: falta el navegador; ejecuten `npm run ripper:prepare`.
- **`Campo desconocido en config.json`** o **`config.json: "…" debe ser …`**: corrijan el campo
  indicado.
- **`No hay ejecuciones sin terminar`**: todas las ejecuciones de `results/` terminaron; inicien una
  nueva con `npm run ripper:test`.
- **`config.json cambió en …`**: restauren esos campos para continuar la ejecución, o inicien una
  nueva.
- **Muchos estados no restaurables**: la exploración cambió los datos que el camino necesita; usen
  `npm run abp:reset`, excluyan las acciones que borran datos o usen `fingerprint.ignore` para las
  regiones que cambian.
- **La exploración termina en la página de inicio de sesión**: revisen `beforeExploring` y que
  `exclude` incluya la acción de cerrar sesión de la ABP.
- **Advertencia `EBADENGINE`**: están usando una versión de Node.js anterior a la 24.

## Referencias

- [Playwright como librería](https://playwright.dev/docs/library)
- [RIPuppetCoursera](https://github.com/TheSoftwareDesignLab/RIPuppetCoursera)
