# Tiqueso · Órdenes de Producción — publicación en Vercel

La diferencia con el `.html` suelto es una sola: **la credencial de Anthropic
vive en el servidor**. Nadie la escribe en su navegador y no viaja al
dispositivo. Quien abra el enlace puede transcribir directamente.

## Archivos

    index.html            la aplicación completa
    api/transcribir.js    función que reenvía a Anthropic con la key
    vercel.json           evita que se cachee una versión vieja del index
    .gitignore

## Publicar

**Desde la web**, sin instalar nada:

1. Entrar a `vercel.com/new`
2. Arrastrar esta carpeta completa
3. Antes de terminar, abrir *Environment Variables* y agregar:

       ANTHROPIC_API_KEY = sk-ant-...

4. *Deploy*

**Desde la terminal**, si preferís:

    npm i -g vercel
    cd tiqueso-vercel
    vercel                       # primera vez: crea el proyecto
    vercel env add ANTHROPIC_API_KEY
    vercel --prod

## Después de publicar

- Abrir el enlace en el iPad y usar *Compartir → Añadir a pantalla de inicio*.
  Queda como una app, sin barra de Safari, con el logo de Tiqueso.
- Al estar en `https://`, funcionan la descarga de archivos y el botón
  **Compartir**, que en `file://` no existen.

## La nube (Supabase)

Esta versión guarda los días en Supabase, así que varias personas pueden
trabajar sobre el mismo día. La URL y la clave pública del proyecto van
embebidas en el `index.html`: la clave anónima es pública por diseño y lo que
protege los datos son las políticas de la base.

No hace falta configurar nada de Supabase en Vercel. La única variable de
entorno sigue siendo `ANTHROPIC_API_KEY`.

## Para actualizar

Arrastrar la carpeta otra vez a `vercel.com/new` **crea un proyecto nuevo con
otra URL**, y eso deja atrás los datos guardados en el navegador. Para
actualizar el proyecto que ya existe se usa la línea de comandos:

    npm i -g vercel          # una sola vez
    cd vercel-ordenes        # la carpeta con el index.html nuevo
    vercel link              # la primera vez: elegir el proyecto existente
    vercel --prod

De ahí en adelante cada actualización es reemplazar `index.html` y correr
`vercel --prod`. La carpeta guarda un `.vercel` con el vínculo al proyecto, así
que no vuelve a preguntar.

`api/transcribir.js` no cambia salvo que cambie la forma de llamar a la API.

### Los datos del navegador sobreviven

Además de la nube, cada navegador guarda una copia local, atada al **dominio**.
Mientras la URL sea la misma, actualizar la app no borra nada. Si la URL cambia,
no se pierde nada de lo que ya estaba en la nube: alcanza con iniciar sesión.

Lo que sí las deja atrás:

- cambiar el nombre del proyecto o el dominio,
- borrar los datos del sitio desde el navegador,
- abrirla en otro dispositivo o en otro navegador.

Antes de una actualización grande conviene igual usar *Exportar el día*: es un
archivo que se puede volver a importar en cualquier lado.

### Si después de actualizar sigue viéndose la versión vieja

`vercel.json` pide no guardar caché de ninguna ruta, pero el navegador puede
tener la anterior en memoria. Recargar con Ctrl+F5, o en iPad cerrar la pestaña
y volver a abrirla. Si está agregada a la pantalla de inicio, a veces hay que
quitar el ícono y volver a agregarlo.

## Límites de Vercel que importan

**El cuerpo de la petición no puede pasar de 4.5 MB.** Es un límite de la
infraestructura: no se cambia desde `vercel.json` ni desde el código. Por eso
la app comprime cada foto hasta dejarla por debajo de 700 KB —bajando calidad y,
si hace falta, resolución— y **mide el envío antes de mandarlo**. Si igual se
pasa, avisa y no lo intenta, en vez de esperar un 413.

Con las mitades activadas cada foto viaja por triplicado. Si aparece el aviso de
peso, esa es la primera casilla que conviene desactivar.

**La función tiene un tiempo máximo.** Está en 300 segundos, dentro de lo que
permite el plan Hobby con fluid compute. Si el despliegue se queja de ese valor,
bajarlo a 60 en `api/transcribir.js`.

Para que el tiempo no sea un problema, la llamada va en **streaming**: los bytes
empiezan a llegar apenas el modelo escribe, en vez de esperar la respuesta
entera. Esta es la diferencia más importante con abrir el `.html` local, donde
el navegador habla directo con Anthropic y no hay función de por medio.
- **Quién puede entrar.** Un despliegue público lo abre cualquiera con el
  enlace, y cada transcripción consume crédito de la cuenta. Si eso importa,
  Vercel permite protegerlo por contraseña en *Settings → Deployment Protection*.

## Los datos están en la nube

Con sesión iniciada, cada orden y las actividades del día se guardan en Supabase
y se sincronizan en vivo entre dispositivos (Dennis y Darwin editan; Jordy solo
ve). El navegador guarda además una copia local para trabajar sin internet; al
volver la conexión, lo pendiente se sube solo.

Antes de publicar esta versión, en Supabase (SQL Editor) deben haberse corrido:

    supabase_ordenes_produccion.sql   tablas ordenes y ordenes_dia
    supabase_config_modelos.sql       configuración de modelos de IA

## Modelos de IA

El modelo principal y el de reintento se eligen desde la nube: indicador ☁ →
"🤖 Modelos de IA" (solo admin). Todos los dispositivos lo usan sin publicar
una versión nueva. En el selector de cada dispositivo, la opción predeterminada
es "Según configuración". Si el modelo configurado no existe o la API rechaza la
solicitud por el modelo, la app reintenta sola con el modelo seguro (Sonnet 5.5 /
Opus 5.5) y deja el aviso en el panel.

## Seguridad del servidor

`api/transcribir.js` solo atiende a usuarios con sesión de Supabase y rol admin o
salidas (Jordy y otros roles reciben "sin permiso"), acepta solo modelos conocidos
o configurados en el panel "Modelos de IA", y limita los tokens de salida. Cada
lectura queda anotada en la tabla `lecturas_ia` (panel "📈 Lecturas IA", solo admin).
Requiere haber corrido `supabase_bloque_A1.sql`.

<!-- Publicación desde GitHub: nube-7 (2026-10-08) -->
