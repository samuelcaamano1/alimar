-- ALIMAR 1CAT.20
-- Corrige el nombre historico de la categoria escolar.
-- Idempotente: solo actua sobre el valor anterior.

UPDATE categories
SET
  name = 'Vuelta al Cole',
  updated_at = now()
WHERE active = true
  AND name = 'Vuelva al Cole';

UPDATE categories AS target
SET
  slug = 'vuelta-al-cole',
  updated_at = now()
WHERE target.slug = 'vuelva-al-cole'
  AND NOT EXISTS (
    SELECT 1
    FROM categories AS other
    WHERE other.id <> target.id
      AND other.slug = 'vuelta-al-cole'
  );
