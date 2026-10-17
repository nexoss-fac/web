# Instrucciones para continuar NEXOSS

Trabaja únicamente dentro de la carpeta NEXOSS. La carpeta `makd-shop-v27-fundacion-multiempresa` se usó como material de origen de solo lectura; no la edites, publiques ni conectes. No copies sus datos, configuraciones privadas, credenciales, cuentas, contactos o identidad comercial. El código ya portado a NEXOSS puede modificarse independientemente.

Continúa desde el estado real del proyecto y `docs/roadmap.md`. Usa datos ficticios. No despliegues, publiques ni conectes servicios o bases de datos reales. No agregues credenciales ni ejecutes migraciones contra bases compartidas. No afirmes cumplimiento tributario, legal o contable.

La aplicación heredada contiene módulos útiles, pero aún conserva un modelo de tienda única y rutas de datos sin autorización multiempresa. La arquitectura de empresa/usuario/membresía y el resolvedor en `server/multiempresa/` son un inicio aislado, no una integración segura. Antes de habilitar multiempresa, conecta identidad verificada, membresías y repositorios tenant-scoped; añade pruebas negativas para toda ruta, reporte, exportación, archivo y tarea en segundo plano.

Respeta el libro de inventario aprobado: Inicio/Inicial, Entrada, Salida, Autoconsumo y Existencia; no añadas una columna Retiros. Conserva las decisiones abiertas sobre valuación, tasas, redondeo, cierres y correcciones hasta que el dueño y su asesor las definan.

Al finalizar cada fase, resume en español qué cambió, qué verificaste, sus límites y el siguiente paso concreto.
