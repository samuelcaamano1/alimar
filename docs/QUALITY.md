# Calidad técnica

## Gate único

```bash
npm run check
```

Ejecuta:

1. `npm run lint`
2. `npm run build`
3. `npm test`

## Lint

Oxlint está configurado con `denyWarnings`, por lo que un warning nuevo falla localmente y en CI.

La regla `react/set-state-in-effect` está desactivada deliberadamente: Alimar usa efectos para cargar datos externos y manejar estados `loading/ready/error`. El resto de las reglas de hooks continúa activo.

## Tests

`scripts/test-structural.mjs` usa el runtime de transformación de Vite ya incluido en el proyecto. No agrega Vitest, Jest ni otro paquete.

Actualmente valida:

- identidad de items del carrito;
- totales del carrito;
- precios por variante;
- parsing monetario argentino;
- redondeo comercial;
- cálculo guiado de costos;
- resumen de estados de pedidos;
- búsqueda/filtro de pedidos.

Los tests son de lógica pura y no requieren Neon, Vercel ni secretos.

## CI

`.github/workflows/ci.yml` ejecuta en pushes a `main` y pull requests:

```text
npm ci
npm run check
```

No utiliza secretos.

## Criterio para nuevos cambios

Una modificación no debería integrarse si:

- TypeScript no compila;
- Oxlint produce warnings o errores;
- falla un test estructural;
- una migración existente fue editada;
- se agregó lógica reutilizable directamente dentro de un componente grande sin justificarlo.
