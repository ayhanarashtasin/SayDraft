# Saydraft

Saydraft is a private voice notes workspace. Record or upload audio, get a transcript, then rewrite it into a note, email, post, summary, or translation. All app features are available without a Saydraft subscription. OpenAI and hosting services have their own usage limits and charges.

## Features

- Record up to three hours with pause and resume, microphone selection, and recovery from IndexedDB. The browser saves long recordings as ten-minute segments.
- Record meetings with microphone and shared tab or system audio in supported browsers, including Chrome and Edge.
- Upload audio or video directly to private Supabase Storage. ffmpeg prepares audio for playback and splits long files for transcription. Enable speaker separation for multi-speaker notes.
- Search, sort, edit, tag, archive, merge, and delete notes. Play, seek, and download recordings or append audio to a note.
- Stream AI rewrites, use custom prompts or the prompt gallery, translate into more than 60 languages, and configure a dictionary and automatic text replacements.
- Send transcripts and rewrites to webhooks or Notion. Export the library as Markdown, JSON, and audio in one ZIP.

## Deploy on Vercel

1. Push this directory as the GitHub repository root. For a repository that contains this app under `web/`, set **Root Directory** to `web` when importing the project.
2. Create a Supabase project. Apply [the migrations](supabase/migrations/) in order with `supabase link --project-ref <project-ref>` and `supabase db push`, or run the SQL files in the Supabase SQL editor. They create the app tables, server-only permissions, and private `audio` bucket. If the original schema was applied manually, `0001_init.sql` is safe to rerun.
3. In Vercel, import the GitHub repository with the **Next.js** preset. The lockfile and `package.json` select Node.js 24 and this repository enables Fluid compute. Keep **Automatically expose System Environment Variables** enabled so the app recognizes Vercel's deployment domains and the Workflow SDK can authenticate. [Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables)
4. Set the production environment variables below before deploying. Use separate Supabase credentials and a separate workspace password for any preview that needs working data access.
5. Open the deployment and sign in with username `saydraft` and your workspace password. Create a test note, upload a short recording, confirm transcription and audio playback, then try a rewrite and library export.

| Required variable | Value |
| --- | --- |
| `SUPABASE_URL` | The Supabase project URL. |
| `SUPABASE_SECRET_KEY` | The server-side Supabase secret key. The legacy service role key also works under `SUPABASE_SERVICE_ROLE_KEY`. |
| `SAYDRAFT_PASSWORD` | A random password of at least 32 characters. Generate one with `node -p "require('node:crypto').randomBytes(32).toString('base64url')"`. |
| `OPENAI_API_KEY` | An OpenAI API key from a project with API billing enabled. |

Set `ALLOWED_HOSTS` to a comma-separated list of any custom domains that Vercel does not expose through its system variables. Enter host names without `https://` or paths. See [.env.example](.env.example) for optional model, API endpoint, upload, and ffmpeg settings.

The hosted app is designed for a single shared workspace. Everyone with its password can read or edit the same notes and use its AI configuration. Keep the password, OpenAI key, and Supabase secret in server-side environment variables. Each hosted request requires authentication and all browser API mutations are restricted to the app's origin.

### Audio limits

Vercel receives upload metadata and confirms completed objects. The browser sends audio bytes directly to Supabase using resumable uploads. The default limit is 50 MiB per file. To allow larger files, raise both the Supabase Storage limit and `MAX_UPLOAD_MB` up to the app maximum of 1024 MiB. Split very large files if conversion exhausts the function's time or temporary disk allowance. Multi-file audio exports fall back to a ZIP when the tracks cannot be joined within those limits. [Supabase Storage limits](https://supabase.com/docs/guides/storage/uploads/file-limits) · [Vercel function limits](https://vercel.com/docs/functions/limitations)

Transcription runs as a Vercel Workflow with separately retryable audio steps. After upload and submission finish, you can close the browser while the note is transcribed. SQLite and audio files under an older installation's `data/` directory remain local. The hosted app reads its notes and audio from Supabase. [Vercel Workflows](https://vercel.com/docs/workflows)

## Run locally

Use Node.js 24 and npm. For a local database with Docker running, start Supabase from the repository root with `npx supabase@3.2.0 start`. It applies the migrations automatically. You can also use a separate remote Supabase project with the same schema.

```powershell
npm ci
Copy-Item .env.example .env.local
```

Set the Supabase URL and secret in `.env.local`, using the local CLI's **Project URL** and **Secret** for a local stack. Set `OPENAI_API_KEY` to enable AI features. `npm run dev` opens the development server on [http://127.0.0.1:3000](http://127.0.0.1:3000). Use `npm run build` followed by `npm start` to run the production build locally. The workspace password can be omitted on loopback.

## Verify before pushing

With Docker running, execute `npm run verify` to type-check, build, and run the unit and API tests. The API suite starts a disposable Supabase stack, uses fake OpenAI and integration servers, and processes real audio without using API credits. GitHub Actions runs the same verification for pushes to `main` and pull requests.

Use `.env.local` for local credentials. Keep `data/`, local workflow logs, Supabase CLI state, dependency folders, and build outputs out of Git.
