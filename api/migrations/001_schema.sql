-- Esquema do Sistema de Gestão de Obras
-- Multiempresa com Row Level Security. Specs 002 a 009.

create schema if not exists app;

-- Contexto da requisição, definido pela API em cada transação (set_config local)
create or replace function app.empresa_id() returns uuid
  language sql stable as $$ select nullif(current_setting('app.empresa_id', true), '')::uuid $$;
create or replace function app.usuario_id() returns uuid
  language sql stable as $$ select nullif(current_setting('app.usuario_id', true), '')::uuid $$;
create or replace function app.perfil() returns text
  language sql stable as $$ select coalesce(nullif(current_setting('app.perfil', true), ''), 'nenhum') $$;
create or replace function app.sub() returns text
  language sql stable as $$ select nullif(current_setting('app.sub', true), '') $$;

create table empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(nome) between 2 and 200),
  cnpj text,
  criado_em timestamptz not null default now()
);

create table usuarios (
  id uuid primary key default gen_random_uuid(),
  cognito_sub text not null unique,
  empresa_id uuid not null references empresas(id),
  nome text not null,
  email text not null,
  perfil text not null check (perfil in ('admin', 'escritorio', 'canteiro', 'cliente')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on usuarios (empresa_id);

create table obras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  codigo text not null,
  nome text not null,
  endereco text,
  cliente_nome text,
  status text not null default 'planejada'
    check (status in ('planejada', 'em_andamento', 'paralisada', 'concluida')),
  data_inicio date,
  data_prevista_fim date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, codigo),
  check (data_prevista_fim is null or data_inicio is null or data_prevista_fim >= data_inicio)
);
create index on obras (empresa_id);

create table obra_clientes (
  empresa_id uuid not null references empresas(id),
  obra_id uuid not null references obras(id) on delete cascade,
  usuario_id uuid not null references usuarios(id),
  criado_em timestamptz not null default now(),
  primary key (obra_id, usuario_id)
);
create index on obra_clientes (usuario_id);

create table orcamento_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  obra_id uuid not null references obras(id) on delete cascade,
  codigo text not null,
  descricao text not null,
  unidade text not null,
  quantidade numeric(14, 3) not null check (quantidade > 0),
  valor_unitario numeric(14, 2) not null check (valor_unitario >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (obra_id, codigo)
);
create index on orcamento_itens (obra_id);

create table cronograma_etapas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  obra_id uuid not null references obras(id) on delete cascade,
  ordem integer not null default 0,
  nome text not null,
  inicio date not null,
  fim date not null,
  percentual numeric(5, 2) not null default 0 check (percentual between 0 and 100),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (fim >= inicio)
);
create index on cronograma_etapas (obra_id);

create table compras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  obra_id uuid not null references obras(id) on delete cascade,
  descricao text not null,
  quantidade numeric(14, 3) not null check (quantidade > 0),
  unidade text not null,
  fornecedor text,
  valor_estimado numeric(14, 2) check (valor_estimado >= 0),
  data_necessidade date,
  status text not null default 'solicitada'
    check (status in ('solicitada', 'aprovada', 'recebida', 'cancelada')),
  solicitado_por uuid references usuarios(id),
  aprovado_por uuid references usuarios(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on compras (obra_id);

create table diarios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  obra_id uuid not null references obras(id) on delete cascade,
  data date not null,
  clima text not null check (clima in ('sol', 'nublado', 'chuva', 'chuva_forte')),
  efetivo integer not null default 0 check (efetivo >= 0),
  atividades text not null,
  ocorrencias text,
  status text not null default 'aberto' check (status in ('aberto', 'fechado')),
  autor_id uuid references usuarios(id),
  pdf_key text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (obra_id, data)
);
create index on diarios (obra_id);

create table diario_fotos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  obra_id uuid not null references obras(id) on delete cascade,
  diario_id uuid not null references diarios(id) on delete cascade,
  s3_key text not null unique,
  content_type text not null check (content_type in ('image/jpeg', 'image/png')),
  legenda text,
  status text not null default 'pendente' check (status in ('pendente', 'validada', 'rejeitada')),
  motivo_rejeicao text,
  tamanho_bytes bigint,
  enviado_por uuid references usuarios(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on diario_fotos (diario_id);

create table medicoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  obra_id uuid not null references obras(id) on delete cascade,
  numero integer not null,
  periodo_inicio date not null,
  periodo_fim date not null,
  status text not null default 'rascunho' check (status in ('rascunho', 'fechada')),
  pdf_key text,
  fechada_por uuid references usuarios(id),
  fechada_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (obra_id, numero),
  check (periodo_fim >= periodo_inicio)
);
create unique index medicoes_um_rascunho_por_obra on medicoes (obra_id) where status = 'rascunho';

create table medicao_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  obra_id uuid not null references obras(id) on delete cascade,
  medicao_id uuid not null references medicoes(id) on delete cascade,
  orcamento_item_id uuid not null references orcamento_itens(id),
  quantidade numeric(14, 3) not null check (quantidade > 0),
  unique (medicao_id, orcamento_item_id)
);
create index on medicao_itens (orcamento_item_id);

create table auditoria (
  id bigint generated always as identity primary key,
  empresa_id uuid not null,
  usuario_id uuid,
  tabela text not null,
  registro_id text,
  acao text not null check (acao in ('INSERT', 'UPDATE', 'DELETE')),
  dados_antes jsonb,
  dados_depois jsonb,
  criado_em timestamptz not null default now()
);
create index on auditoria (empresa_id, criado_em desc);

-- Atualiza atualizado_em
create or replace function app.tocar_atualizado_em() returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

-- Auditoria (spec 009). SECURITY DEFINER: a aplicação não tem INSERT direto na tabela.
create or replace function app.auditar() returns trigger
  language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare
  v_antes jsonb;
  v_depois jsonb;
  v_reg jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_antes := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_depois := to_jsonb(new); end if;
  v_reg := coalesce(v_depois, v_antes);
  insert into public.auditoria (empresa_id, usuario_id, tabela, registro_id, acao, dados_antes, dados_depois)
  values ((v_reg ->> 'empresa_id')::uuid, app.usuario_id(), tg_table_name,
          coalesce(v_reg ->> 'id', v_reg ->> 'obra_id'), tg_op, v_antes, v_depois);
  return null;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['obras', 'orcamento_itens', 'cronograma_etapas', 'compras', 'diarios',
                           'diario_fotos', 'medicoes', 'usuarios'] loop
    execute format('create trigger %I before update on %I for each row execute function app.tocar_atualizado_em()',
                   t || '_atualizado_em', t);
  end loop;
  foreach t in array array['obras', 'obra_clientes', 'orcamento_itens', 'cronograma_etapas', 'compras',
                           'diarios', 'diario_fotos', 'medicoes', 'medicao_itens'] loop
    execute format('create trigger %I after insert or update or delete on %I for each row execute function app.auditar()',
                   t || '_auditoria', t);
  end loop;
end $$;

-- ===================== Row Level Security =====================
-- FORCE: vale até para o dono das tabelas.

alter table empresas enable row level security;
alter table empresas force row level security;
create policy empresa_propria on empresas using (id = app.empresa_id());

alter table usuarios enable row level security;
alter table usuarios force row level security;
-- O próprio usuário é encontrado pelo sub do token antes de existir contexto de empresa
create policy usuarios_empresa on usuarios
  using (empresa_id = app.empresa_id() or cognito_sub = app.sub())
  with check (empresa_id = app.empresa_id());

do $$
declare
  t text;
begin
  foreach t in array array['obras', 'obra_clientes', 'orcamento_itens', 'cronograma_etapas', 'compras',
                           'diarios', 'diario_fotos', 'medicoes', 'medicao_itens', 'auditoria'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy tenant on %I using (empresa_id = app.empresa_id()) with check (empresa_id = app.empresa_id())', t);
  end loop;

  -- Perfil cliente: só enxerga obras vinculadas a ele (política RESTRITIVA, soma com a de tenant)
  execute $p$create policy cliente_so_suas_obras on obras as restrictive for select
    using (app.perfil() <> 'cliente' or id in (select oc.obra_id from obra_clientes oc where oc.usuario_id = app.usuario_id()))$p$;
  foreach t in array array['orcamento_itens', 'cronograma_etapas', 'diarios', 'diario_fotos', 'medicoes', 'medicao_itens'] loop
    execute format($p$create policy cliente_so_suas_obras on %I as restrictive for select
      using (app.perfil() <> 'cliente' or obra_id in (select oc.obra_id from obra_clientes oc where oc.usuario_id = app.usuario_id()))$p$, t);
  end loop;
  execute $p$create policy cliente_so_seus_vinculos on obra_clientes as restrictive for select
    using (app.perfil() <> 'cliente' or usuario_id = app.usuario_id())$p$;

  -- Cliente só vê medições fechadas (rascunho ainda pode mudar)
  execute $p$create policy cliente_so_fechadas on medicoes as restrictive for select
    using (app.perfil() <> 'cliente' or status = 'fechada')$p$;

  -- Cliente não vê compras e não vê auditoria
  execute $p$create policy compras_sem_cliente on compras as restrictive for select using (app.perfil() <> 'cliente')$p$;
  execute $p$create policy auditoria_so_admin on auditoria as restrictive for select using (app.perfil() in ('admin', 'sistema'))$p$;

  -- Cliente não grava em nada
  foreach t in array array['obras', 'obra_clientes', 'orcamento_itens', 'cronograma_etapas', 'compras',
                           'diarios', 'diario_fotos', 'medicoes', 'medicao_itens'] loop
    execute format($p$create policy cliente_sem_insert on %I as restrictive for insert with check (app.perfil() <> 'cliente')$p$, t);
    execute format($p$create policy cliente_sem_update on %I as restrictive for update using (app.perfil() <> 'cliente')$p$, t);
    execute format($p$create policy cliente_sem_delete on %I as restrictive for delete using (app.perfil() <> 'cliente')$p$, t);
  end loop;
end $$;

-- ===================== Permissões do usuário da aplicação =====================
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user login;
  end if;
end $$;

grant usage on schema public, app to app_user;
grant execute on all functions in schema app to app_user;
grant select on empresas to app_user;
grant select, insert, update on usuarios to app_user;
grant select, insert, update, delete on obras, obra_clientes, orcamento_itens, cronograma_etapas,
  compras, diarios, diario_fotos, medicoes, medicao_itens to app_user;
-- Auditoria: só leitura (escrita apenas pelo trigger SECURITY DEFINER)
grant select on auditoria to app_user;
