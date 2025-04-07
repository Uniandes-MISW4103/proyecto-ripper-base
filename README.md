# Playwirght Random Tester (GUI Ripper)

Este repositorio contiene el código para un GUI Ripper desarrollado utilizando [Playwright](https://playwright.dev/) un ejecutor de pruebas End to End construido sobre JavaScript.

Este repositorio está basado en la implementación de [TheSoftwareDesignLab/RIPuppetCoursera](https://github.com/TheSoftwareDesignLab/RIPuppetCoursera).

## Requisitos

- Node.js (v20 o superior). Recomendamos usar lts/iron.
- npm o yarn para la gestión de dependencias.

## Cómo ejecutar

Para usar el GUI Ripper, debes seguir estos pasos:

- **Instalar los módulos requeridos**

  ```bash
  npm install
  npm prepare
  ```

- **Configurar los parámetros deseados**: La carpeta raíz del repositorio contiene los archivos de configuración del GUI Ripper (`config.json`)

  ```javascript
  {
      /** Base URL to initiate the exploration */
      "url": "https://thesoftwaredesignlab.github.io",
      /** indicates weheter the execution will be on headless mode */
      "headless": true,
      /** Ripper tree exploration level */
      "depthLevels": 1,
      /** indicates whether to use the data from values' */
      "inputValues": false,

      /** Key-value pairs containing the html ID (key) and input (value) to be used by the ripper */
      "values": {
          "userInput": "Mario",
          "passwordInput": "123456",
          "passwordTwoInput": "123456",
          "nameInput": "Mario",
          "emailInput": "mario@b.com"
      },
      /** list of browser to use for the execution */
      "browsers": ["chromium", "webkit", "firefox"]
  }
  ```

- **Ejecutar el GUI Ripper**: Los comandos para ejecutar las pruebas deben ejecutarse desde la carpeta raíz.

  ```bash
  npm run test
  ```

## Reportes

El GUI Ripper genera un reporte con la exploración realizada por cada uno de los browsers definidos en la configuración. Cada reporte contiene un un archivo `.html` y una serie de archivos `.json` con el grafo de exploración.
