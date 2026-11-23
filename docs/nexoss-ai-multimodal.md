# NEXOSS AI multimodal

## Capacidades actuales de esta entrega

- Chat conversacional dentro de la empresa activa.
- Adjuntar hasta 2 imágenes por conversación (JPG, PNG o WebP), máximo 5 MB por imagen.
- Gemini y Ollama con entrada visual; el modelo Ollama debe ser compatible con visión.
- Preparación de descripciones y fichas preliminares. La IA debe distinguir datos visibles de inferencias y no inventar precios o datos no visibles.

## Seguridad y límites

- Las rutas se ejecutan después de autenticación Firebase y middleware de acceso a empresa.
- El tenant y el rol se obtienen del contexto del servidor, no de campos enviados por el navegador.
- Las imágenes se validan por MIME y tamaño en cliente y servidor.
- Las imágenes se envían desde el servidor al proveedor configurado; no se guardan en la base de datos ni en almacenamiento de NEXOSS.
- Las claves de proveedor permanecen en variables de entorno del servidor.
- Esta entrega no crea ni modifica productos, inventario, precios, códigos de barras, ventas ni gastos. Todo resultado es un borrador que debe revisarse.
- No se envían datos de productos ni registros de la empresa al modelo; solo el mensaje y los adjuntos explícitos de la conversación.

## Variables

```env
NEXOSS_AI_PROVIDER=auto
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
OLLAMA_BASE_URL=
OLLAMA_MODEL=qwen2.5vl:7b
```

En modo `auto`, Gemini tiene prioridad si hay clave configurada; de lo contrario se usa Ollama si su URL está configurada. Para imágenes con Ollama, usa un modelo visual, por ejemplo `qwen2.5vl:7b`, `llava` o `gemma3`. El servidor de NEXOSS debe poder alcanzar de forma privada y autenticada el endpoint de Ollama; no expongas Ollama directamente a Internet.

## Pendiente para habilitar operaciones comerciales

La siguiente fase debe integrar herramientas de lectura de inventario y creación de borradores con autorización por rol y empresa, vista previa de cambios y confirmación explícita antes de cualquier escritura. La mejora/edición de imágenes y generación de etiquetas/códigos debe implementarse como flujos separados y verificables.
