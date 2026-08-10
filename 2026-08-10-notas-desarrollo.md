# Notas de desarrollo — Cards Manager

## Flujo de trabajo con git (importante)

El asistente (Claude/Cowork) corre en un entorno aislado que monta esta carpeta remotamente.
Cuando el asistente ejecuta comandos de git desde ahí, puede **crear** archivos de lock
(`.git/index.lock`, `.git/HEAD.lock`) pero **no puede borrarlos** después — es una limitación
del mount, no de Spotlight ni de permisos normales de macOS.

**Por eso, desde ahora: el asistente no corre `git add/commit/push` directamente.** En su lugar,
da el bloque de comandos completo y el usuario lo pega y corre de una sola vez en su propia
Terminal (Mac). Esto evita la fricción de locks por completo.

Si en algún momento aparece de nuevo `fatal: Unable to create '.../.git/index.lock': File exists`
(por ejemplo, restos de un intento fallido anterior), simplemente correr:
```
rm -f /Users/admin/Cards-Manager/.git/index.lock /Users/admin/Cards-Manager/.git/HEAD.lock
```
y reintentar.

## Estado del feature "Actualizar desde Gmail" (auto-relleno de estados de cuenta)

- OAuth de Google conectado y funcionando (tabla `google_tokens` en Supabase, service role key
  configurada como el JWT legacy, no el nuevo formato `sb_secret_...`).
- Parsers en `api/_lib/parsers.js` para BAC, Banco Aliado, Davivienda y Scotiabank, traducidos
  del pipeline Python ya validado del usuario (`_extraer_datos.py`).
- **Aliado**: corregido para el layout real que devuelve `pdf-parse` en producción (distinto al
  de `pdfplumber` usado en pruebas locales) — ver comentarios en `parseAliado()`.
- Distingue tarjetas del mismo banco por los últimos 4 dígitos (`ultimos_4_digitos` en la
  tarjeta), con fallback a "primer correo encontrado" si el campo queda vacío.
- Antes de sobrescribir una tarjeta con saldo pendiente y no marcada como pagada, la app pide
  confirmación (`window.confirm`) para no perder de vista los datos del ciclo anterior sin darse
  cuenta.
- **Validado en producción con datos reales**: Banco Aliado (VISA Infinite, últimos 4 = 1675).
- **Pendiente de validar**: BAC, Davivienda y Scotiabank en producción (los regex están
  traducidos y probados contra PDFs de ejemplo en local, pero no confirmados contra el texto
  real que extrae `pdf-parse` en Vercel, que puede diferir del de `pdfplumber`).

## Otros

- El usuario perdió sus 7 tarjetas originales por un bug ya corregido (ver historial de commits
  sobre `guardarAhora()` / upsert selectivo). Las está recargando manualmente.
