# Alimar

Aplicación web de Alimar para catálogo, pedidos, pedidos personalizados, presupuestos, seguimiento de producción y administración operativa.

## Stack

- React 19 + TypeScript
- Vite 8
- Vercel Functions
- Neon PostgreSQL
- Vercel Blob
- Oxlint
- GitHub Actions

## Comandos

```bash
npm run dev
npm run build
npm run lint
npm test
npm run check
```

`npm run check` es el gate local y de CI: ejecuta lint estricto, build de producción y tests estructurales.

## Rutas

- `/` — storefront público
- `/cuenta` — cuenta del cliente
- `/admin` — panel administrativo
- `/?pedido=...` — seguimiento público
- `/?presupuesto=...` — presupuesto público

Las rutas principales y las vistas públicas pesadas usan carga diferida para mantener separado el bundle inicial.

## Estructura relevante

```text
src/
  admin/
    app/
    costs/
    orders/
    shared/
  storefront/
  styles/
    admin/
    public/
  App.tsx
  AdminApp.tsx
  CustomerAccount.tsx
  RootRouter.tsx
```

La lógica derivada se mantiene fuera de los componentes grandes siempre que sea posible: selectores, cálculos, tipos, configuración y utilidades viven en módulos dedicados.

## Calidad

El repositorio incluye:

- TypeScript build
- Oxlint con warnings bloqueantes
- tests estructurales sin dependencias de test adicionales
- workflow de GitHub Actions
- code splitting por rutas
- validaciones de utilidades de carrito, catálogo, costos y pedidos

Ver `docs/QUALITY.md`.

## Base de datos

Las migraciones están numeradas en `db/migrations`. La estructura actual del proyecto llega a la migración `032_admin_notifications.sql`.

Antes de aplicar migraciones en un entorno, revisar:

```bash
npm run db:migrate:status
```

## Variables de entorno

Usar `.env.example` como referencia. No versionar secretos ni archivos `.env.local`.

## Deploy

El proyecto está preparado para Vercel. Los cambios deben pasar `npm run check` antes de integrarse o desplegarse.

## Documentación

- `docs/MVP-1.0.md`
- `docs/ARCHITECTURE.md`
- `docs/QUALITY.md`
