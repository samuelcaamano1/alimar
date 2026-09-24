# Alimar MVP 1.0

Estado: **release estable de operación**.

## Flujo cubierto

- catálogo con precios publicados;
- Pedido Personalizado sin producto obligatorio;
- galería de inspiración administrable;
- referencia visual del cliente;
- SOL → PRE → aceptación/rechazo → PED;
- PDF de presupuesto;
- cobros, saldo y anulaciones auditables;
- fechas, prioridad y etapas de producción;
- historial de clientes;
- dashboard comercial, rentabilidad y producción;
- WhatsApp como canal de coordinación.

## Seguridad del MVP 1.0

- sesión admin firmada por HMAC;
- cookie HttpOnly, SameSite=Strict y Secure en HTTPS;
- `Origin` obligatorio y exacto en mutaciones admin;
- `Origin` obligatorio en checkout, pedidos personalizados y respuesta de PRE;
- rate limit distribuido en Neon para login y mutaciones públicas;
- los identificadores de rate limit se guardan con SHA-256, sin IP cruda;
- payload JSON público limitado a aproximadamente 1.3 MB;
- login limitado a 16 KB;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `X-Frame-Options: DENY`;
- Permissions Policy bloquea cámara, micrófono y geolocalización;
- `/admin` marcado `noindex, nofollow, noarchive`.

## Rate limits

- login admin: 8 intentos / 15 minutos / cliente;
- pedido del catálogo: 12 envíos / 10 minutos / cliente;
- Pedido Personalizado: 8 envíos / 30 minutos / cliente;
- aceptación/rechazo de PRE: 20 envíos / 10 minutos / cliente.

Los límites se aplican en base de datos para funcionar entre distintas instancias serverless.

## Release

- package version: `1.0.0`;
- Git tag: `v1.0.0`;
- migración final de este release: `021_api_rate_limits.sql`.

## Regla post-MVP

Después de `v1.0.0`:

1. bugs y problemas operativos tienen prioridad;
2. las mejoras nuevas se agrupan para una versión posterior;
3. cambios de esquema siguen usando migraciones numeradas;
4. ningún hotfix debe romper compatibilidad con la base de producción.

## Deuda conocida para una versión posterior

- object storage para imágenes si aumenta el volumen;
- paginación avanzada de pedidos/clientes cuando el historial crezca;
- autenticación externa/SSO sólo si el negocio la necesita;
- observabilidad y alertas externas si el volumen operativo lo justifica.
