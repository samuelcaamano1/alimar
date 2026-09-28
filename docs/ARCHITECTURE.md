# Arquitectura de Alimar

## Objetivo

Mantener separadas las responsabilidades del storefront, la cuenta del cliente, el panel administrativo, las funciones API y la persistencia.

## Frontend

### Entrada

`src/main.tsx` monta `RootRouter`.

`RootRouter` decide entre:

- storefront
- cuenta del cliente
- administración

Cada superficie se carga con `React.lazy`.

### Storefront

`src/App.tsx` conserva la coordinación de la experiencia pública.

La lógica reutilizable se distribuye en:

- `src/storefront/types.ts`
- `src/storefront/cart.ts`
- `src/storefront/catalog.ts`
- `src/storefront/customRequests.ts`
- `src/storefront/content.ts`

### Administración

Los módulos de administración se agrupan bajo `src/admin`:

- `app`: modelos y utilidades del shell administrativo
- `orders`: tipos, configuración, selectores y utilidades de PED
- `costs`: recursos, cálculo, presupuestos y selectores
- `shared`: infraestructura compartida del frontend admin

Los componentes grandes continúan siendo coordinadores de UI, pero los cálculos y selectores no deben volver a crecer dentro del JSX.

## API

Las funciones viven bajo `api/`.

`api/_lib` contiene servicios y lógica reutilizable para autenticación, pedidos, archivos, clientes, presupuestos, notificaciones y seguridad de requests.

## Persistencia

Neon PostgreSQL es la base transaccional.

Las migraciones viven en `db/migrations` y son acumulativas. No se deben editar migraciones ya desplegadas; cualquier cambio de esquema debe agregarse como una nueva migración numerada.

Vercel Blob se usa para archivos de pedidos.

## Eventos frontend

Existen eventos `alimar:*` para sincronizar paneles que todavía no comparten un store global. Deben usarse sólo para coordinación entre superficies desacopladas; una nueva funcionalidad no debería agregar eventos si una llamada o prop local resuelve el caso.

## Regla de evolución

Antes de agregar una feature:

1. ubicar su responsabilidad;
2. evitar lógica de negocio dentro del render;
3. reutilizar helpers HTTP y módulos existentes;
4. agregar o actualizar tests cuando la lógica sea pura;
5. ejecutar `npm run check`.
