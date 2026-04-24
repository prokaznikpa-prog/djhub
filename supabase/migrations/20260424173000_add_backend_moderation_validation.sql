-- =========================
-- NORMALIZE
-- =========================
create or replace function public.moderation_normalize_text(input_text text)
returns text
language sql
immutable
set search_path = public
as $$
select lower(
regexp_replace(
btrim(coalesce(input_text, '')),
'\s+',
' ',
'g'
)
);
$$;

-- =========================
-- COMPACT
-- =========================
create or replace function public.moderation_compact_text(input_text text)
returns text
language sql
immutable
set search_path = public
as $$
select regexp_replace(
public.moderation_normalize_text(input_text),
'[^0-9a-zа-яё]+',
'',
'g'
);
$$;

-- =========================
-- NAME VALIDATION
-- =========================
create or replace function public.assert_clean_name(input_text text, field_label text default 'Имя')
returns void
language plpgsql
set search_path = public
as $$
declare
normalized text := public.moderation_normalize_text(input_text);
compact text := public.moderation_compact_text(input_text);
visible_length integer := char_length(btrim(coalesce(input_text, '')));
alnum_length integer := char_length(
regexp_replace(coalesce(input_text, ''), '[^0-9A-Za-zА-Яа-яЁё]+', '', 'g')
);
begin
if visible_length < 2 then
raise exception '% слишком короткое', field_label;
end if;

if visible_length > 30 then
raise exception '% слишком длинное', field_label;
end if;

if alnum_length < greatest(2, ceil(visible_length * 0.4)::int) then
raise exception '% не может состоять в основном из символов', field_label;
end if;

if normalized ~* '(https?://|www\.|\.ru\b|\.com\b|\.net\b|\.org\b)'
or normalized ~* '(^|[^a-z0-9_])@[a-z0-9_]{2,}'
or normalized ~* '(telegram|телеграм|tg\b|whatsapp|ватсап|instagram|инстаграм)'
or normalized ~* '(\+7|8\d{10}|\d{10,})' then
raise exception 'В поле "%" нельзя использовать ссылки, контакты или телефоны', field_label;
end if;

if compact ~ '(хуй|хуи|пизд|еб|ёб|бля|сука|член|пенис|cock|dick|sex|porn|муд|манда|залуп|гондон|пидор|пидр|шлюх|соси|сосать|дроч|сперм|жоп|анал|вагин|порно|еблан|ебло|ебыр|выеб|наеб|заеб|отъеб|уеб|хуесос|хер|хрен|чмо|мраз|сучк|блят|fuck|shit|bitch|asshole|pussy|nude)' then
raise exception '% содержит запрещённые слова', field_label;
end if;
end;
$$;

-- =========================
-- TEXT VALIDATION
-- =========================
create or replace function public.assert_clean_text(input_text text, field_label text, max_length integer default 500)
returns void
language plpgsql
set search_path = public
as $$
declare
normalized text;
compact text;
begin
if input_text is null or btrim(input_text) = '' then
return;
end if;

normalized := public.moderation_normalize_text(input_text);
compact := public.moderation_compact_text(input_text);

if char_length(btrim(input_text)) > max_length then
raise exception 'Поле "%" превышает допустимую длину (% символов)', field_label, max_length;
end if;

if normalized ~* '(https?://|www\.|\.ru\b|\.com\b|\.net\b|\.org\b)'
or normalized ~* '(^|[^a-z0-9_])@[a-z0-9_]{2,}'
or normalized ~* '(telegram|телеграм|tg\b|whatsapp|ватсап|instagram|инстаграм)'
or normalized ~* '(\+7|8\d{10}|\d{10,})' then
raise exception 'В поле "%" нельзя использовать ссылки, контакты или телефоны', field_label;
end if;

if compact ~ '(хуй|хуи|пизд|еб|ёб|бля|сука|член|пенис|cock|dick|sex|porn|муд|манда|залуп|гондон|пидор|пидр|шлюх|соси|сосать|дроч|сперм|жоп|анал|вагин|порно|еблан|ебло|ебыр|выеб|наеб|заеб|отъеб|уеб|хуесос|хер|хрен|чмо|мраз|сучк|блят|fuck|shit|bitch|asshole|pussy|nude)' then
raise exception 'Поле "%" содержит запрещённые слова', field_label;
end if;
end;
$$;

-- =========================
-- PRICE VALIDATION
-- =========================
create or replace function public.assert_reasonable_money(input_text text, field_label text, min_value numeric default 0, max_value numeric default 50000)
returns void
language plpgsql
set search_path = public
as $$
declare
digits text;
parsed_value numeric;
begin
if input_text is null or btrim(input_text) = '' then
return;
end if;

digits := regexp_replace(input_text, '\D', '', 'g');

if digits = '' then
raise exception 'Поле "%" должно быть числом', field_label;
end if;

parsed_value := digits::numeric;

if parsed_value < min_value or parsed_value > max_value then
raise exception 'Поле "%" должно быть от % до %', field_label, min_value, max_value;
end if;
end;
$$;

-- =========================
-- MAIN VALIDATOR
-- =========================
create or replace function public.validate_moderated_content()
returns trigger
language plpgsql
set search_path = public
as $$
begin
if tg_table_name = 'dj_profiles' then
perform public.assert_clean_name(new.name, 'Имя');
perform public.assert_clean_text(new.bio, 'Био', 500);
perform public.assert_reasonable_money(new.price, 'Цена', 0, 50000);
return new;
end if;

if tg_table_name = 'venue_profiles' then
perform public.assert_clean_name(new.name, 'Имя');
perform public.assert_clean_text(new.description, 'Описание', 500);
return new;
end if;

if tg_table_name = 'venue_posts' then
perform public.assert_clean_text(new.title, 'Название публикации', 120);
perform public.assert_clean_text(new.description, 'Описание публикации', 500);
perform public.assert_clean_text(new.requirements, 'Требования', 500);
perform public.assert_reasonable_money(new.budget, 'Бюджет', 0, 50000);
return new;
end if;

return new;
end;
$$;

-- =========================
-- TRIGGERS
-- =========================
drop trigger if exists validate_moderated_dj_profiles on public.dj_profiles;
create trigger validate_moderated_dj_profiles
before insert or update on public.dj_profiles
for each row
execute function public.validate_moderated_content();

drop trigger if exists validate_moderated_venue_profiles on public.venue_profiles;
create trigger validate_moderated_venue_profiles
before insert or update on public.venue_profiles
for each row
execute function public.validate_moderated_content();

drop trigger if exists validate_moderated_venue_posts on public.venue_posts;
create trigger validate_moderated_venue_posts
before insert or update on public.venue_posts
for each row
execute function public.validate_moderated_content();