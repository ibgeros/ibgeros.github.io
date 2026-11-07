create table if not exists analytics_events (
  id bigserial primary key,
  created_at timestamptz not null default date_trunc('day', now()),
  event text not null,
  city text,
  region text,
  country text,
  device text,
  lang text,
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  age_range text,
  sex_filter text,
  uf_filter text,
  income_bucket text,
  edu text,
  marital text,
  kids text,
  bmi text,
  smoke text,
  car text,
  home text,
  race text,
  result_bucket text,
  rare boolean
);

create index if not exists analytics_events_created_idx on analytics_events (created_at desc);
create index if not exists analytics_events_city_idx on analytics_events (city);
create index if not exists analytics_events_event_idx on analytics_events (event);

create table if not exists privacy_requests (
  id bigserial primary key,
  created_at timestamptz not null default date_trunc('day', now()),
  name text,
  email text,
  message text not null,
  status text not null default 'novo'
);

create table if not exists settings (
  key text primary key,
  value text not null
);

insert into settings (key, value) values ('analytics_enabled', 'true')
on conflict (key) do nothing;
