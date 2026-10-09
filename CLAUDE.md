# Órdenes de Producción Tiqueso — instrucciones para Claude Code

App web de Tiqueso / COPROLAC (Costa Rica) que transcribe con IA las hojas de producción y genera el archivo para SAP Business One (DTW). Usuario: Dennis (admin). **Respondé en español de Costa Rica (voseo), claro y concreto.**

## Estructura del repositorio
- `index.html`: toda la app (React 18 + Babel en el navegador, un solo archivo).
- `api/transcribir.js`: función de Vercel con **streaming** que llama a Claude con `ANTHROPIC_API_KEY`. La key vive solo en Vercel, **nunca** en el repositorio. Sin este archivo la app no transcribe (404).
- `vercel.json`, `README.md`, `.gitignore`.

## Ramas y publicación
- `main` = **producción**. Cada commit en `main` publica en la dirección del equipo. **No hagas push a `main` sin que Dennis lo apruebe.**
- `pruebas` = **pruebas**. Todo cambio va primero a `pruebas` (dirección fija de Preview en Vercel). Cuando Dennis diga "Pasá pruebas a producción", se une `pruebas` en `main`.
- Pruebas y producción comparten la **misma base de Supabase**: para pruebas que escriben datos, usá fechas 2099.
- `index.html`, `vercel.json` y `api/` tienen que quedar siempre en la raíz.

## Reglas de trabajo
1. La fuente de verdad es el documento maestro (`Tiqueso_Apps_Documento_Maestro.md`, en el proyecto de Claude de Dennis).
2. **Nunca inventes códigos de SAP, lotes ni cantidades.**
3. El código compartido con Salidas y Entradas (nube, `PuertaNube`, modelos de IA, registro de lecturas) está copiado en cada app. Si lo cambiás acá, anotá que hay que replicarlo en las otras dos.
4. Salidas lee la tabla `ordenes` (`data.lote` y `data.componentes[].lote`) para validar lotes. Si cambiás dónde se guarda el lote, avisá: hay que ajustar Salidas.
5. Reglas propias de Órdenes: campos nuevos de una orden → agregarlos a `ORDEN_VACIA()`; usar siempre `setOrdenes`/`setActividades`; órdenes vacías no se suben hasta tener datos; las preferencias del dispositivo son locales a propósito.
6. **Antes de entregar:** compilá el `<script type="text/babel">` con `@babel/standalone`, probá con la nube simulada y todos los roles (incluido Jordy en solo lectura y un día vacío) y, si hay cambios visuales, revisá capturas a 1024 px y 390 px.
7. SQL solo re-ejecutable. Indicá si hay que correrlo y en qué orden respecto de publicar.
8. Subí la versión en cada entrega y terminá con el bloque **"Cambios para el documento maestro"**.
