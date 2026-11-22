insert into storage.buckets (id, name, public)
values ('audio', 'audio', false)
on conflict (id) do update set public = false;

alter table public.audio_files add column if not exists uploaded boolean not null default true;
alter table public.notes add column if not exists transcription_id uuid;
alter table public.notes add column if not exists transcription_deadline bigint;

create or replace function public.reserve_note_audio(
  p_note_id bigint, p_file_name text, p_mime text, p_size bigint,
  p_duration double precision, p_original_name text, p_now bigint
) returns setof public.audio_files language plpgsql set search_path = '' as $$
declare
  note_status text;
  next_position integer;
begin
  select status into note_status from public.notes where id = p_note_id for update;
  if not found then raise sqlstate 'PT404' using message = 'Note not found.'; end if;
  if note_status = 'processing' then
    raise sqlstate 'PT409' using message = 'Wait until this note finishes processing before adding audio.';
  end if;
  select coalesce(max(position), -1) + 1 into next_position from public.audio_files where note_id = p_note_id;
  update public.notes set updated_at = p_now where id = p_note_id;
  return query insert into public.audio_files (
    note_id, file_name, mime, size, duration_sec, original_name, position, uploaded, created_at
  ) values (p_note_id, p_file_name, p_mime, p_size, p_duration, p_original_name, next_position, false, p_now)
  returning *;
end;
$$;

create or replace function public.finalize_note_audio(p_note_id bigint, p_file_id bigint, p_now bigint)
returns setof public.audio_files language plpgsql set search_path = '' as $$
declare
  note_status text;
  audio public.audio_files;
begin
  select status into note_status from public.notes where id = p_note_id for update;
  if not found then raise sqlstate 'PT404' using message = 'Note not found.'; end if;
  select * into audio from public.audio_files where note_id = p_note_id and id = p_file_id;
  if not found then raise sqlstate 'PT404' using message = 'Audio not found.'; end if;
  if audio.uploaded then return next audio; return; end if;
  if note_status = 'processing' then
    raise sqlstate 'PT409' using message = 'Wait until this note finishes processing before adding audio.';
  end if;
  update public.notes set updated_at = p_now where id = p_note_id;
  return query update public.audio_files set uploaded = true where id = p_file_id returning *;
end;
$$;

create or replace function public.remove_note_audio(p_note_id bigint, p_file_id bigint, p_now bigint)
returns text language plpgsql set search_path = '' as $$
declare
  note_status text;
  object_name text;
begin
  select status into note_status from public.notes where id = p_note_id for update;
  if not found then return null; end if;
  if note_status = 'processing' and exists (
    select 1 from public.audio_files where note_id = p_note_id and id = p_file_id and uploaded
  ) then
    raise sqlstate 'PT409' using message = 'Wait until this note finishes processing.';
  end if;
  delete from public.audio_files where note_id = p_note_id and id = p_file_id returning file_name into object_name;
  if found then update public.notes set updated_at = p_now where id = p_note_id; end if;
  return object_name;
end;
$$;

create or replace function public.claim_note_transcription(
  p_note_id bigint, p_job_id uuid, p_mode text, p_language text, p_speakers boolean, p_now bigint, p_deadline bigint
) returns void language plpgsql set search_path = '' as $$
declare
  note_status text;
begin
  select status into note_status from public.notes where id = p_note_id for update;
  if not found then raise sqlstate 'PT404' using message = 'Note not found.'; end if;
  if note_status = 'processing' then
    raise sqlstate 'PT409' using message = 'This note is already being transcribed.';
  end if;
  if not exists (select 1 from public.audio_files where note_id = p_note_id and uploaded) then
    raise sqlstate 'PT400' using message = 'This note has no audio to transcribe.';
  end if;
  if p_mode = 'pending' and not exists (
    select 1 from public.audio_files where note_id = p_note_id and uploaded and status <> 'ready'
  ) then
    raise sqlstate 'PT400' using message = 'All audio in this note is already transcribed.';
  end if;

  update public.notes set status = 'processing', stage = 'Waiting to start', progress = 0, error = null,
    transcription_id = p_job_id, transcription_deadline = p_deadline,
    language = p_language, speakers = p_speakers, updated_at = p_now where id = p_note_id;
end;
$$;

create or replace function public.finish_note_transcription(
  p_note_id bigint, p_job_id uuid, p_transcript text, p_title text, p_files jsonb, p_now bigint
) returns boolean language plpgsql set search_path = '' as $$
declare
  note_status text;
  file_result record;
begin
  select status into note_status from public.notes where id = p_note_id and transcription_id = p_job_id for update;
  if not found then return false; end if;
  if note_status = 'ready' then return true; end if;
  if note_status <> 'processing' then return false; end if;

  for file_result in select * from jsonb_to_recordset(p_files) as result(id bigint, text text) loop
    update public.audio_files set status = 'ready', transcript = file_result.text
      where note_id = p_note_id and id = file_result.id and uploaded;
    if not found then raise exception 'Audio changed before transcription finished'; end if;
  end loop;
  update public.notes set transcript = p_transcript,
    title = case when btrim(title) = '' then coalesce(p_title, title) else title end,
    status = 'ready', stage = null, progress = null, error = null,
    transcription_deadline = null, updated_at = p_now where id = p_note_id;
  return true;
end;
$$;

create or replace function public.store_prepared_audio(
  p_note_id bigint, p_job_id uuid, p_file_id bigint, p_old_name text,
  p_new_name text, p_mime text, p_duration double precision, p_size bigint
) returns boolean language plpgsql set search_path = '' as $$
begin
  perform 1 from public.notes where id = p_note_id and transcription_id = p_job_id and status = 'processing' for update;
  if not found then return false; end if;
  update public.audio_files set file_name = p_new_name, mime = p_mime, duration_sec = p_duration, size = p_size, prepared = true
    where note_id = p_note_id and id = p_file_id and uploaded and file_name = p_old_name;
  return found;
end;
$$;

create or replace function public.delete_workspace_notes(p_note_ids bigint[])
returns jsonb language plpgsql set search_path = '' as $$
declare
  audio_names jsonb;
  deleted_count integer;
begin
  perform id from public.notes where id = any(p_note_ids) order by id for update;
  select coalesce(jsonb_agg(distinct file_name), '[]'::jsonb) into audio_names
    from public.audio_files where note_id = any(p_note_ids);
  delete from public.notes where id = any(p_note_ids);
  get diagnostics deleted_count = row_count;
  return jsonb_build_object('deleted', deleted_count, 'audio', audio_names);
end;
$$;

revoke all on public.settings, public.notes, public.audio_files, public.tags, public.note_tags,
  public.prompts, public.rewrites, public.dictionary, public.replacements, public.actions from anon, authenticated;
grant select, insert, update, delete on public.settings, public.notes, public.audio_files, public.tags, public.note_tags,
  public.prompts, public.rewrites, public.dictionary, public.replacements, public.actions to service_role;
grant usage on sequence public.notes_id_seq, public.audio_files_id_seq, public.tags_id_seq, public.prompts_id_seq,
  public.rewrites_id_seq, public.dictionary_id_seq, public.replacements_id_seq, public.actions_id_seq to service_role;

revoke execute on function public.reserve_note_audio(bigint, text, text, bigint, double precision, text, bigint),
  public.finalize_note_audio(bigint, bigint, bigint), public.remove_note_audio(bigint, bigint, bigint),
  public.claim_note_transcription(bigint, uuid, text, text, boolean, bigint, bigint),
  public.finish_note_transcription(bigint, uuid, text, text, jsonb, bigint),
  public.store_prepared_audio(bigint, uuid, bigint, text, text, text, double precision, bigint),
  public.delete_workspace_notes(bigint[]) from public, anon, authenticated;
grant execute on function public.reserve_note_audio(bigint, text, text, bigint, double precision, text, bigint),
  public.finalize_note_audio(bigint, bigint, bigint), public.remove_note_audio(bigint, bigint, bigint),
  public.claim_note_transcription(bigint, uuid, text, text, boolean, bigint, bigint),
  public.finish_note_transcription(bigint, uuid, text, text, jsonb, bigint),
  public.store_prepared_audio(bigint, uuid, bigint, text, text, text, double precision, bigint),
  public.delete_workspace_notes(bigint[]) to service_role;
