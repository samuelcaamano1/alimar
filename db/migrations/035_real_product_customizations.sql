-- ALIMAR 1CAT.21 - PERSONALIZACIONES REALES
-- Solo carga presets cuando el producto no tiene ningun campo activo previo.

WITH preset_fields (
  product_slug, sort_order, label, field_type, placeholder, options, required, max_length
) AS (
  VALUES
    ('topper-torta-2',0,'Nombre del cumpleañero','text','Ej. Martina','[]'::jsonb,true,80),
    ('topper-torta-2',1,'Edad','number','Ej. 8','[]'::jsonb,false,3),
    ('topper-torta-2',2,'Temática o personaje','text','Ej. Bluey, fútbol, flores','[]'::jsonb,true,120),
    ('topper-torta-2',3,'Colores preferidos','text','Ej. Rosa, lila y dorado','[]'::jsonb,false,120),
    ('topper-torta-2',4,'Texto adicional','textarea','Ej. Feliz cumple, apodo o detalle especial','[]'::jsonb,false,240),

    ('foto-recuerdo',0,'Nombre o texto principal','text','Ej. Cumple de Martina','[]'::jsonb,true,100),
    ('foto-recuerdo',1,'Edad','number','Ej. 8','[]'::jsonb,false,3),
    ('foto-recuerdo',2,'Temática o estilo','text','Ej. Flores, fútbol, elegante','[]'::jsonb,false,120),
    ('foto-recuerdo',3,'Dedicatoria o frase','textarea','Ej. Gracias por compartir este día','[]'::jsonb,false,240),

    ('tatuajes',0,'Temática o personaje','text','Ej. Stitch, fútbol, dinosaurios','[]'::jsonb,true,120),
    ('tatuajes',1,'Nombre personalizado','text','Ej. Martina','[]'::jsonb,false,80),
    ('tatuajes',2,'Edad','number','Ej. 8','[]'::jsonb,false,3),
    ('tatuajes',3,'Indicaciones del diseño','textarea','Contanos si querés algún dibujo, frase o estilo especial','[]'::jsonb,false,300),

    ('cajas-de-regalo',0,'Nombre del cumpleañero','text','Ej. Martina','[]'::jsonb,true,80),
    ('cajas-de-regalo',1,'Edad','number','Ej. 8','[]'::jsonb,false,3),
    ('cajas-de-regalo',2,'Temática o personaje','text','Ej. Princesas, fútbol, animales','[]'::jsonb,true,120),
    ('cajas-de-regalo',3,'Colores preferidos','text','Ej. Rosa y dorado','[]'::jsonb,false,120),
    ('cajas-de-regalo',4,'Texto o dedicatoria','textarea','Texto que quieras sumar al diseño','[]'::jsonb,false,240),

    ('porta-photocards',0,'Artista, integrante o personaje','text','Ej. Jungkook, personaje o temática','[]'::jsonb,true,120),
    ('porta-photocards',1,'Color del porta photocard','text','Ej. Rosa, negro, celeste','[]'::jsonb,false,80),
    ('porta-photocards',2,'Tipo de photocard','select','Elegí una opción','["Elegir del catálogo","Enviar foto personalizada por WhatsApp"]'::jsonb,true,120),
    ('porta-photocards',3,'Indicaciones adicionales','textarea','Contanos algún detalle especial','[]'::jsonb,false,240),

    ('personajes-para-pintar-3d',0,'Personaje deseado','text','Ej. Dinosaurio, Stitch, superhéroe','[]'::jsonb,true,120),
    ('personajes-para-pintar-3d',1,'Color base','text','Ej. Blanco, rosa, celeste','[]'::jsonb,false,80),
    ('personajes-para-pintar-3d',2,'Indicaciones adicionales','textarea','Contanos cualquier detalle que debamos tener en cuenta','[]'::jsonb,false,240),

    ('caratulas',0,'Nombre y apellido','text','Ej. Martina Pérez','[]'::jsonb,true,100),
    ('caratulas',1,'Materia','text','Ej. Matemática','[]'::jsonb,true,80),
    ('caratulas',2,'Curso o grado','text','Ej. 4° B','[]'::jsonb,true,40),
    ('caratulas',3,'Temática o personaje','text','Ej. Fútbol, flores, personaje favorito','[]'::jsonb,true,120),
    ('caratulas',4,'Ciclo lectivo','number','Ej. 2027','[]'::jsonb,false,4),
    ('caratulas',5,'Texto adicional','textarea','Curso, colegio u otro dato que quieras sumar','[]'::jsonb,false,240)
)
INSERT INTO product_customization_fields (
  product_id, label, field_type, placeholder, options, required, max_length, sort_order
)
SELECT
  product.id, preset.label, preset.field_type, preset.placeholder,
  preset.options, preset.required, preset.max_length, preset.sort_order
FROM preset_fields AS preset
JOIN products AS product
  ON product.slug = preset.product_slug
 AND product.active = true
 AND product.customization_allowed = true
WHERE NOT EXISTS (
  SELECT 1
  FROM product_customization_fields AS existing
  WHERE existing.product_id = product.id
    AND existing.active = true
);
