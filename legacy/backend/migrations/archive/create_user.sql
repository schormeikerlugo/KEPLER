-- ALERTA: Script de Emergencia para Crear Usuario Confirmado
-- Usar esto SOLO si la interfaz de Supabase Authentication falla al enviar correos.

-- 1. Habilitar extensión pgcrypto para hashear contraseñas (necesario para auth)
create extension if not exists pgcrypto;

-- 2. Insertar Usuario Confirmado (cambiar email/password si deseas)
-- El ID se genera automáticamente.
-- La contraseña '12345678' se hashea con bcrypt.
-- email_confirmed_at = now() es la CLAVE para saltarse la confirmación.

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000', -- instance_id (default)
  gen_random_uuid(), -- id
  'authenticated', -- aud
  'authenticated', -- role
  'schormeikerl@gmail.com', -- EMAIL (Cámbialo si quieres)
  crypt('leno12Ss.', gen_salt('bf')), -- PASSWORD (Cámbialo aquí)
  now(), -- email_confirmed_at (ESTO LO MARCA COMO CONFIRMADO)
  NULL,
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Comandante Manual","username":"manual_commander"}',
  now(),
  now(),
  '',
  '',
  '',
  ''
);

-- NOTA: El trigger handle_new_user() que creamos antes debería ejecutarse automáticamente
-- y crear el perfil en la tabla public.profiles.














-- 1. Necesitamos pgcrypto para encriptar la contraseña (bcrypt)
create extension if not exists pgcrypto;

-- 2. Bloque para crear el usuario y su identidad asociada
do $$
declare
  -- CONFIGURA AQUÍ TU USUARIO
  my_email text := 'schormeikerl@gmail.com';
  my_password text := '112622';
  new_uid uuid;
begin
  -- Insertar en auth.users
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    my_email,
    crypt(my_password, gen_salt('bf')), -- Hash seguro
    now(), -- Email ya confirmado
    '{"provider": "email", "providers": ["email"]}',
    '{}',
    now(),
    now(),
    '',
    ''
  ) returning id into new_uid;

  -- Insertar en auth.identities (Necesario para que el login funcione)
  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    new_uid,
    jsonb_build_object('sub', new_uid, 'email', my_email),
    'email',
    now(),
    now(),
    now()
  );

  raise notice 'Usuario Creado: % / %', my_email, my_password;
end $$;