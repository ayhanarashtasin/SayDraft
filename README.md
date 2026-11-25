# Saydraft

Saydraft is a private voice notes workspace. Record or upload audio, get a transcript, then rewrite it into a note, email, post, summary, or translation. All app features are available without a Saydraft subscription. OpenAI and hosting services have their own usage limits and charges.

## Features

- Record up to three hours with pause and resume, microphone selection, and recovery from IndexedDB. The browser saves long recordings as ten-minute segments.
- Record meetings with microphone and shared tab or system audio in supported browsers, including Chrome and Edge.
- See a live transcript while recording. Supported browsers stream word-by-word captions through the Web Speech API, falling back to short audio clips on unsupported browsers. The final transcript is generated from the full recording after you stop.
- Upload audio or video directly to private Supabase Storage. ffmpeg prepares audio for playback and splits long files for transcription. Enable speaker separation for multi-speaker notes.
- Search, sort, edit, tag, archive, merge, and delete notes. Play, seek, and download recordings or append audio to a note.
- Stream AI rewrites, use custom prompts or the prompt gallery, translate into more than 60 languages, and configure a dictionary and automatic text replacements.
- Send transcripts and rewrites to webhooks or Notion. Export the library as Markdown, JSON, and audio in one ZIP.

## Deploy on Vercel

1. Push this directory as the GitHub repository root. For a repository that contains this app under `web/`, set **Root Directory** to `web` when importing the project.
2. Create a Supabase project. Apply [the migrations](supabase/migrations/) in order with `supabase link --project-ref <project-ref>` and `supabase db push`, or run the SQL files in the Supabase SQL editor. They create the app tables, server-only permissions, private `audio` bucket, and the per-user ownership of every row (`0003_accounts.sql`). If the original schema was applied manually, `0001_init.sql` is safe to rerun. `0003_accounts.sql` is also safe to rerun, and it stops without changing anything if rows without an owner exist from an older shared workspace.
3. In Vercel, import the GitHub repository with the **Next.js** preset. The lockfile and `package.json` select Node.js 24 and this repository enables Fluid compute. Keep **Automatically expose System Environment Variables** enabled so the app recognizes Vercel's deployment domains and the Workflow SDK can authenticate. [Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables)
4. Set the production environment variables below before deploying. Use separate Supabase credentials for any preview that needs working data access.
5. Open the deployment and choose **Create an account**. Create a test note, upload a short recording, confirm transcription and audio playback, then try a rewrite and library export.

| Required variable | Value |
| --- | --- |
| `SUPABASE_URL` | The Supabase project URL. |
| `SUPABASE_SECRET_KEY` | The server-side Supabase secret key. The legacy service role key also works under `SUPABASE_SERVICE_ROLE_KEY`. |
| `SUPABASE_PUBLISHABLE_KEY` | The project's publishable key (the legacy anon key also works under `SUPABASE_ANON_KEY`). It is used on the server only, to sign people in. |
| `OPENAI_API_KEY` | An OpenAI API key from a project with API billing enabled. |

Set `ALLOWED_HOSTS` to a comma-separated list of any custom domains that Vercel does not expose through its system variables. Enter host names without `https://` or paths. See [.env.example](.env.example) for optional model, API endpoint, upload, and ffmpeg settings.

### Accounts and privacy

Everyone has their own account (email and password, at least 10 characters). Notes, recordings, tags, rewrite styles, dictionary, text replacements, integrations and settings belong to one account, and other accounts cannot see or change them. Anyone can create an account with an email and password. Because every account uses your OpenAI key and your Supabase storage, watch your usage and remove accounts you do not want.

- **Sessions** are stored in `HttpOnly`, `SameSite=Lax` cookies that only the server reads, for up to 30 days. Logging out ends that device's session at once, and so does deleting the account. Every API request is checked with Supabase Auth, and all browser API mutations are restricted to the app's origin.
- **Data access** goes through the server only. The database keeps row level security on with no policies, so the public key cannot read or write anything, and the server filters every query by the signed-in user.
- **Removing someone:** delete the user in the Supabase dashboard (Authentication > Users). All their notes, tags and settings are deleted with them. Their audio files stay in the private `audio` bucket until you delete them there, so delete their notes in the app first if you want the audio gone too.
- **Forgotten passwords** are reset in the Supabase dashboard (Authentication > Users). There is no email recovery.
- Keep the OpenAI key and the Supabase secret key in server-side environment variables.

### Audio limits

Vercel receives upload metadata and confirms completed objects. The browser sends audio bytes directly to Supabase using resumable uploads. The default limit is 50 MiB per file. To allow larger files, raise both the Supabase Storage limit and `MAX_UPLOAD_MB` up to the app maximum of 1024 MiB. Split very large files if conversion exhausts the function's time or temporary disk allowance. Multi-file audio exports fall back to a ZIP when the tracks cannot be joined within those limits. [Supabase Storage limits](https://supabase.com/docs/guides/storage/uploads/file-limits) · [Vercel function limits](https://vercel.com/docs/functions/limitations)

Transcription runs as a Vercel Workflow with separately retryable audio steps. After upload and submission finish, you can close the browser while the note is transcribed. SQLite and audio files under an older installation's `data/` directory remain local. The hosted app reads its notes and audio from Supabase. [Vercel Workflows](https://vercel.com/docs/workflows)

## Run locally

Use Node.js 24 and npm. For a local database with Docker running, start Supabase from the repository root with `npx supabase@3.2.0 start`. It applies the migrations automatically. You can also use a separate remote Supabase project with the same schema.

```powershell
npm ci
Copy-Item .env.example .env.local
```

Set the Supabase URL, secret key and publishable key in `.env.local`, using the local CLI's **Project URL**, **Secret** and **Publishable** values for a local stack. Set `OPENAI_API_KEY` to enable AI features. `npm run dev` opens the development server on [http://127.0.0.1:3000](http://127.0.0.1:3000). Use `npm run build` followed by `npm start` to run the production build locally. Open the app and choose **Create an account**.

## Verify before pushing

With Docker running, execute `npm run verify` to type-check, build, and run the unit and API tests. The API suite starts a disposable Supabase stack, uses fake OpenAI and integration servers, and processes real audio without using API credits. GitHub Actions runs the same verification for pushes to `main` and pull requests.

Use `.env.local` for local credentials. Keep `data/`, local workflow logs, Supabase CLI state, dependency folders, and build outputs out of Git.
