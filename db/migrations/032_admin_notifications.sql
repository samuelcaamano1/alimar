-- 032_admin_notifications.sql
-- Centro de notificaciones internas para acciones de clientes que requieren atención del administrador.

CREATE TABLE IF NOT EXISTS admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind varchar(40) NOT NULL,
  title varchar(140) NOT NULL,
  message varchar(500) NOT NULL,
  entity_type varchar(20) NOT NULL,
  entity_id uuid NOT NULL,
  entity_code varchar(40) NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind IN (
    'order_created',
    'request_created',
    'design_approved',
    'design_changes_requested',
    'historical_order_linked'
  )),
  CHECK (entity_type IN ('order', 'request')),
  CHECK (length(trim(title)) >= 1),
  CHECK (length(trim(entity_code)) >= 1)
);

CREATE INDEX IF NOT EXISTS admin_notifications_created_idx
  ON admin_notifications (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_notifications_unread_idx
  ON admin_notifications (created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS admin_notifications_entity_idx
  ON admin_notifications (entity_type, entity_id, created_at DESC);

CREATE OR REPLACE FUNCTION alimar_notify_admin_new_order()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.source = 'web' THEN
    INSERT INTO admin_notifications (
      kind,
      title,
      message,
      entity_type,
      entity_id,
      entity_code
    )
    VALUES (
      'order_created',
      'Nuevo pedido ' || NEW.public_code,
      'Nuevo PED de ' || NEW.customer_name || ' realizado desde la tienda.',
      'order',
      NEW.id,
      NEW.public_code
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS alimar_admin_notification_new_order ON orders;
CREATE TRIGGER alimar_admin_notification_new_order
AFTER INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION alimar_notify_admin_new_order();

CREATE OR REPLACE FUNCTION alimar_notify_admin_new_request()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  request_code text;
BEGIN
  request_code := 'SOL-' || LPAD(NEW.request_number::text, 6, '0');

  INSERT INTO admin_notifications (
    kind,
    title,
    message,
    entity_type,
    entity_id,
    entity_code
  )
  VALUES (
    'request_created',
    'Nueva solicitud ' || request_code,
    'Nueva SOL de ' || NEW.customer_name || ' para revisar y presupuestar.',
    'request',
    NEW.id,
    request_code
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS alimar_admin_notification_new_request ON custom_requests;
CREATE TRIGGER alimar_admin_notification_new_request
AFTER INSERT ON custom_requests
FOR EACH ROW
EXECUTE FUNCTION alimar_notify_admin_new_request();

CREATE OR REPLACE FUNCTION alimar_notify_admin_order_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  order_code text;
  customer_name_value text;
  notification_kind text;
  notification_title text;
  notification_message text;
BEGIN
  IF NEW.event_type NOT IN (
    'file_approved',
    'file_changes_requested',
    'customer_account_linked'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT public_code, customer_name
  INTO order_code, customer_name_value
  FROM orders
  WHERE id = NEW.order_id
  LIMIT 1;

  IF order_code IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.event_type = 'file_approved' THEN
    notification_kind := 'design_approved';
    notification_title := 'Diseño aprobado · ' || order_code;
    notification_message := COALESCE(
      NULLIF(NEW.note, ''),
      'El cliente aprobó un diseño de ' || order_code || '.'
    );
  ELSIF NEW.event_type = 'file_changes_requested' THEN
    notification_kind := 'design_changes_requested';
    notification_title := 'Cambios pedidos · ' || order_code;
    notification_message := COALESCE(
      NULLIF(NEW.note, ''),
      'El cliente pidió cambios en un diseño de ' || order_code || '.'
    );
  ELSE
    notification_kind := 'historical_order_linked';
    notification_title := 'PED vinculado · ' || order_code;
    notification_message := customer_name_value || ' vinculó un pedido histórico a su cuenta.';
  END IF;

  INSERT INTO admin_notifications (
    kind,
    title,
    message,
    entity_type,
    entity_id,
    entity_code
  )
  VALUES (
    notification_kind,
    LEFT(notification_title, 140),
    LEFT(notification_message, 500),
    'order',
    NEW.order_id,
    order_code
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS alimar_admin_notification_order_event ON order_events;
CREATE TRIGGER alimar_admin_notification_order_event
AFTER INSERT ON order_events
FOR EACH ROW
EXECUTE FUNCTION alimar_notify_admin_order_event();
