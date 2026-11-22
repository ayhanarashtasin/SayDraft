import type { PromptProperty, Template } from "./types.ts";

export const TEMPLATE_CATEGORIES = [
  "General",
  "Text Editing",
  "Summary",
  "Emails",
  "Content Creation",
  "Journaling",
  "Personal",
  "Work",
  "Writing Styles",
] as const;

/** Category order in the rewrite panel; user prompts can also use "Custom". */
export const PROMPT_CATEGORIES = [...TEMPLATE_CATEGORIES, "Custom"] as const;

export interface DefaultPrompt {
  builtinKey: string;
  title: string;
  description: string;
  category: string;
  body: string;
}

/** The built-in rewrite presets every workspace starts with (editable by the user). */
export const DEFAULT_PROMPTS: readonly DefaultPrompt[] = [
  {
    builtinKey: "magic",
    title: "Magic",
    description: "Let AI pick the best structure and clean-up",
    category: "General",
    body: "Turn this voice note into clear, polished writing. Remove filler words, false starts and repetition, fix grammar and punctuation, and organize the ideas in the most natural format for the content: paragraphs for narrative, a list for items or steps, short sections for longer notes. Keep the speaker's meaning, facts and voice.",
  },
  {
    builtinKey: "slightly",
    title: "Slightly",
    description: "Light clean-up that keeps your exact words",
    category: "General",
    body: "Make a light edit: remove filler words (um, uh, like, you know), stutters and accidental repetition, and fix punctuation, capitalization and obvious grammar mistakes. Keep the original wording, sentence order and voice as much as possible.",
  },
  {
    builtinKey: "significantly",
    title: "Significantly",
    description: "A thorough rewrite for clarity and flow",
    category: "General",
    body: "Rewrite this thoroughly so it reads as carefully written text. Improve clarity, structure and flow, combine scattered thoughts, cut redundancy and choose precise wording. Preserve every fact, intention and nuance from the original.",
  },
  {
    builtinKey: "structured",
    title: "Structured",
    description: "Sections with headings and bullet points",
    category: "Text Editing",
    body: "Organize this content into a structured document: short plain-text section headings followed by concise bullet points. Group related ideas together and keep every concrete detail (names, numbers, dates).",
  },
  {
    builtinKey: "list",
    title: "List",
    description: "A clean list of items, tasks or points",
    category: "Text Editing",
    body: "Extract the items, tasks or points from this text and present them as a clean bulleted list. Group related items under short labels when helpful, keep quantities and details, and drop conversational filler.",
  },
  {
    builtinKey: "short_summary",
    title: "Short Summary",
    description: "The key points in a few lines",
    category: "Summary",
    body: "Summarize the core message in 2 to 4 short sentences or up to 5 brief bullets. Focus only on what matters most.",
  },
  {
    builtinKey: "detailed_summary",
    title: "Detailed Summary",
    description: "All key points, thoroughly covered",
    category: "Summary",
    body: "Write a thorough summary that covers every main topic, argument, example and conclusion in the text, in logical order. Use short paragraphs or bullets and keep names, figures and dates exact.",
  },
  {
    builtinKey: "meeting_takeaways",
    title: "Meeting Takeaways",
    description: "Decisions, highlights and next steps",
    category: "Summary",
    body: "Turn this meeting conversation into meeting notes with these sections: Summary (2 to 3 sentences), Key points, Decisions, Action items (with owner and due date when mentioned) and Open questions. Leave out any section that has no content. Only include decisions and action items that were actually stated.",
  },
  {
    builtinKey: "casual_email",
    title: "Casual Email",
    description: "A warm, friendly email",
    category: "Emails",
    body: "Write a friendly, natural email based on this note. Start with a short subject line (\"Subject: ...\"), then a greeting, a concise body and a casual sign-off. Don't invent names, dates or details that aren't in the note.",
  },
  {
    builtinKey: "formal_email",
    title: "Formal Email",
    description: "A clear, professional email",
    category: "Emails",
    body: "Write a polished, professional email based on this note. Start with a concise subject line (\"Subject: ...\"), then a courteous greeting, a well-structured body and a professional closing. Don't invent names, dates or details that aren't in the note.",
  },
];

function select(key: string, label: string, options: string[], value: string): PromptProperty {
  return { key, label, type: "select", options, value };
}

function multi(key: string, label: string, options: string[], value: string[]): PromptProperty {
  return { key, label, type: "multi-select", options, value };
}

function text(key: string, label: string, placeholder: string): PromptProperty {
  return { key, label, type: "text", placeholder, value: "" };
}

function t(
  id: string,
  category: string,
  title: string,
  description: string,
  body: string,
  extra: { properties?: PromptProperty[]; featured?: boolean } = {},
): Template {
  return { id, category, title, description, body, properties: extra.properties ?? [], featured: extra.featured };
}

/** Rewrite Options Gallery: ready-made prompts users can add to their own list. */
export const TEMPLATES: readonly Template[] = [
  // General
  t("format-and-tone", "General", "Format & Tone", "Fine-tune tone, length, spelling and formatting",
    [
      "Rewrite the note using these style settings:",
      "- Tone: {{tone}}",
      "- Sentence length: {{sentence_length}}",
      "- Paragraphs: {{paragraphs}}",
      "- Word choice: {{word_choice}}",
      "- Spelling: {{spelling}}",
      "- Headings: {{headings}}",
      "- Emoji: {{emoji_usage}}",
      "- Sign off with this name: {{personal_name}}",
      "Remove filler words and repetition, and keep every fact and the original meaning.",
    ].join("\n"),
    {
      featured: true,
      properties: [
        multi("tone", "Tone", ["Friendly", "Confident", "Formal", "Empathetic", "Enthusiastic", "Neutral", "Humorous"], ["Friendly"]),
        select("sentence_length", "Sentence length", ["Short", "Medium", "Long", "Varied"], "Medium"),
        select("paragraphs", "Paragraphs", ["Short paragraphs", "Long paragraphs", "One paragraph", "Keep as in the original"], "Short paragraphs"),
        select("word_choice", "Word choice", ["Simple", "Conversational", "Professional", "Academic"], "Simple"),
        select("spelling", "Spelling", ["Keep the original", "American English", "British English"], "Keep the original"),
        select("headings", "Headings", ["No headings", "Add headings for each section"], "No headings"),
        select("emoji_usage", "Emoji", ["No emoji", "A few emoji", "Lots of emoji"], "No emoji"),
        text("personal_name", "Sign-off name", "Your name (optional)"),
      ],
    }),
  t("style-guide", "General", "Style Guide", "Write to your own house style",
    [
      "Rewrite the note following this style guide:",
      "- Audience: {{audience}}",
      "- Point of view: {{voice}}",
      "- Formality: {{formality}}",
      "- Length: {{length}}",
      "- Never use these words or phrases: {{banned_words}}",
      "- Make sure to include: {{must_include}}",
      "- Write dates like: {{date_format}}",
      "- Numbers: {{number_style}}",
      "Keep the meaning and all facts from the original.",
    ].join("\n"),
    {
      properties: [
        text("audience", "Audience", "e.g. busy executives, new customers"),
        select("voice", "Point of view", ["Keep the original", "First person (I)", "First person plural (we)", "Second person (you)", "Third person"], "Keep the original"),
        select("formality", "Formality", ["Casual", "Neutral", "Formal"], "Neutral"),
        select("length", "Length", ["Shorter than the original", "About the same length", "Longer and more detailed"], "About the same length"),
        text("banned_words", "Words to avoid", "Words or phrases to avoid"),
        text("must_include", "Words to include", "Words or phrases to include"),
        select("date_format", "Dates", ["Keep as spoken", "2025-01-31", "31 January 2025", "January 31, 2025"], "Keep as spoken"),
        select("number_style", "Numbers", ["Keep as spoken", "Digits for all numbers", "Words for one to nine, digits above"], "Keep as spoken"),
      ],
    }),
  t("clean-transcript", "General", "Clean Transcript", "Readable verbatim text with punctuation and paragraphs",
    "Turn this raw transcript into a clean, readable verbatim text. Add punctuation, capitalization and paragraph breaks at natural topic changes. Remove only filler sounds (um, uh, er) and accidental repeats. Do not reword, summarize or reorder anything."),
  t("explain-simply", "General", "Explain Simply", "Plain words anyone can follow",
    "Rewrite the note so a 12-year-old could understand it. Use short sentences and everyday words, explain any jargon in a few words, and keep all the important information."),
  t("clarify-question", "General", "Ask a Clear Question", "Turn rambling thoughts into a precise question",
    "The speaker is trying to ask something. Turn the note into one clear, self-contained question (with a short line of context before it if needed) that someone else could answer without hearing the original recording."),

  // Text Editing
  t("fix-grammar", "Text Editing", "Fix Grammar Only", "Correct mistakes without changing your words",
    "Correct spelling, grammar and punctuation mistakes only. Do not change word choice, tone, structure or length beyond what the corrections require."),
  t("shorten", "Text Editing", "Shorten", "Same message, fewer words",
    "Make the note shorter while keeping its key message and important details.\nTarget length: {{target}}.\nCut repetition, side remarks and filler first.",
    {
      properties: [
        select("target", "Target length", ["About 75% of the original length", "About half the original length", "About a quarter of the original length"], "About half the original length"),
      ],
    }),
  t("expand", "Text Editing", "Expand", "Develop rough ideas into full paragraphs",
    "Develop the ideas in this note into fuller, well-connected paragraphs. Add transitions and spell out reasoning that is implied, but do not introduce new facts, examples or claims that the speaker did not make."),
  t("bullet-points", "Text Editing", "Bullet Points", "Every idea as a crisp bullet",
    "Convert the note into concise bullet points, one idea per bullet, in the order they were mentioned. Use indented bullets for supporting details. Keep names, numbers and dates exact."),
  t("step-by-step", "Text Editing", "Step-by-Step Instructions", "Numbered steps someone can follow",
    "Turn the note into clear, numbered step-by-step instructions. Start each step with an action verb, keep one action per step, and add a short \"You will need\" list first if materials or tools are mentioned."),
  t("qa-format", "Text Editing", "Q&A Format", "Questions and answers from your note",
    "Reorganize the content as a set of questions and answers. Write each question the way a reader would ask it, followed by a concise answer that uses only information from the note."),
  t("key-quotes", "Text Editing", "Key Quotes", "Pull out the most memorable lines",
    "Pick the 3 to 8 most insightful or memorable statements from the note and list them as quotes, lightly cleaned of filler words but otherwise in the speaker's own words."),

  // Summary
  t("tldr", "Summary", "TL;DR", "The whole thing in one sentence",
    "Summarize the entire note in a single clear sentence of no more than 30 words."),
  t("executive-summary", "Summary", "Executive Summary", "Overview, key points and recommendation",
    "Write an executive summary with a one-paragraph overview, 3 to 6 key points as bullets and, only if the note contains one, the recommendation or next step. Keep it under 250 words."),
  t("key-insights", "Summary", "Key Insights", "The ideas worth remembering",
    "List the key insights, lessons or conclusions from the note as short bullets. For each, add one sentence explaining why it matters, based only on what the speaker said."),
  t("action-items", "Summary", "Action Items", "Who does what, by when",
    "Extract every task, commitment or follow-up from the note as a checklist. Use the format \"- [ ] Task (owner, due date)\", leaving out the owner or due date when they were not mentioned. If there are no tasks, reply \"No action items.\"",
    { featured: true }),
  t("decision-log", "Summary", "Decision Log", "What was decided and why",
    "List each decision made in the note. For each decision, give the decision itself, the reason given, and any alternatives that were rejected. Only include decisions that were clearly made."),
  t("study-notes", "Summary", "Study Notes", "Lecture or lesson notes for revision",
    "Turn this lecture or lesson into study notes: a title line, the main topics as short sections, key terms with one-line definitions, and 3 to 5 review questions at the end."),

  // Emails
  t("reply-email", "Emails", "Reply to an Email", "Answer an email from your spoken thoughts",
    "The speaker is dictating their reply to an email. Write the reply as a ready-to-send email body in a {{tone}} tone: a greeting, the response points in a logical order, and a closing. Don't invent facts or commitments.",
    { properties: [select("tone", "Tone", ["friendly", "neutral", "formal"], "friendly")] }),
  t("follow-up-email", "Emails", "Follow-up Email", "Recap and next steps after a meeting or call",
    "Write a follow-up email after a meeting or call: a subject line (\"Subject: ...\"), a thank-you line, a short recap of what was discussed, agreed next steps (with owners and dates if mentioned) and a friendly close."),
  t("cold-outreach", "Emails", "Cold Outreach", "A short, personal first-contact email",
    "Write a short first-contact email based on the note: a specific subject line (\"Subject: ...\"), one line on why you're reaching out to this person, the value or request in two or three sentences, and a single clear call to action. Keep it under 150 words."),
  t("thank-you-note", "Emails", "Thank-You Note", "Warm, specific appreciation",
    "Write a warm thank-you message based on the note. Mention specifically what the person did and the difference it made. Keep it sincere and under 120 words."),
  t("meeting-request", "Emails", "Meeting Request", "Ask for time, clearly and politely",
    "Write an email requesting a meeting: a subject line (\"Subject: ...\"), the purpose of the meeting in one or two sentences, proposed times or duration if mentioned, and a polite close."),
  t("apology-email", "Emails", "Apology Email", "Own the mistake and the fix",
    "Write a sincere apology email based on the note: acknowledge what went wrong without excuses, take responsibility, explain what is being done to fix it and prevent it happening again (only as stated in the note), and close respectfully."),

  // Content Creation
  t("linkedin-post", "Content Creation", "LinkedIn Post", "A professional post with a strong hook",
    [
      "Turn the note into a LinkedIn post: an attention-grabbing first line, short paragraphs of one to three sentences, and a closing question or call to action.",
      "Emoji: {{emoji_usage}}",
      "Hashtags: {{hashtags}}",
      "Keep the speaker's own experience and opinions, and don't add claims.",
    ].join("\n"),
    {
      featured: true,
      properties: [
        select("emoji_usage", "Emoji", ["None", "A few", "Plenty"], "A few"),
        select("hashtags", "Hashtags", ["No hashtags", "3 relevant hashtags at the end"], "3 relevant hashtags at the end"),
      ],
    }),
  t("x-thread", "Content Creation", "X Thread", "A numbered thread of short posts",
    "Turn the note into a thread for X (Twitter): 3 to 8 posts, each under 280 characters, numbered like \"1/\", \"2/\". Make the first post a strong hook and the last one a summary or call to action."),
  t("instagram-caption", "Content Creation", "Instagram Caption", "Catchy caption with emoji and hashtags",
    "Write an Instagram caption from the note: a catchy opening line, two or three short lines of story or value, a call to action, a few fitting emoji, and 5 to 10 relevant hashtags on the last line."),
  t("blog-post", "Content Creation", "Blog Post", "A structured article draft",
    [
      "Turn the note into a blog post draft with a compelling title, an engaging introduction, plain-text section headings and a conclusion.",
      "Length: {{length}}",
      "Base the content on the speaker's ideas and do not invent statistics, quotes or sources.",
    ].join("\n"),
    {
      properties: [
        select("length", "Length", ["Short (about 400 words)", "Medium (about 800 words)", "Long (about 1,500 words)"], "Medium (about 800 words)"),
      ],
    }),
  t("newsletter", "Content Creation", "Newsletter Section", "A friendly update for your subscribers",
    "Write a newsletter section from the note: a short headline, a personal and conversational opening, the main update or idea in a few short paragraphs, and a closing line inviting replies."),
  t("video-script", "Content Creation", "Video Script", "Hook, talking points and outro",
    "Write a script for a short video based on the note: a one or two sentence hook, the main talking points in a natural spoken style with short sentences, and an outro with a call to action. Label the sections HOOK, MAIN and OUTRO."),
  t("show-notes", "Content Creation", "Podcast Show Notes", "Episode summary and topics",
    "Write podcast show notes from this conversation: a two to three sentence episode summary, a bulleted list of topics discussed in order, and notable quotes or resources mentioned (only if they appear in the transcript)."),

  // Journaling
  t("daily-journal", "Journaling", "Daily Journal", "A reflective entry about your day",
    "Turn the note into a first-person journal entry about the day. Keep the speaker's feelings and details, write in a reflective and honest tone, and organize it into a few natural paragraphs.",
    { featured: true }),
  t("gratitude-journal", "Journaling", "Gratitude Journal", "What you're thankful for today",
    "From the note, write a gratitude journal entry: a list of the things the speaker is grateful for, each with one sentence on why. Keep it personal and in the first person."),
  t("reflection", "Journaling", "Reflection & Lessons", "What happened and what you learned",
    "Write a short reflection with three parts: What happened, What I learned, and What I'll do differently next time. Use only what the speaker said, in the first person."),
  t("dream-journal", "Journaling", "Dream Journal", "Capture a dream before it fades",
    "Write this down as a dream journal entry in the present tense and first person. Keep all the vivid details, people, places and emotions, and finish with a line naming the main feeling of the dream."),
  t("mood-check-in", "Journaling", "Mood Check-in", "Name the feeling and what's behind it",
    "Turn the note into a brief mood check-in with four lines: Current mood (one or two words), What's contributing to it, What I need right now, and One small next step. Base everything on the speaker's words and keep it gentle and non-judgmental."),

  // Personal
  t("todo-list", "Personal", "To-Do List", "Tasks grouped and prioritized",
    "Turn the note into a to-do list. Group tasks under short headings (for example Today, This week, Later, or by area) and start each task with a verb. Include deadlines and details that were mentioned."),
  t("shopping-list", "Personal", "Shopping List", "Items grouped by store section",
    "Turn the note into a shopping list grouped by store section (for example Produce, Dairy, Bakery, Pantry, Household). Include quantities when mentioned and merge duplicates."),
  t("text-message", "Personal", "Text Message", "A quick, natural message to a friend",
    "Turn the note into a short, natural message to send on {{platform}}. Keep it conversational and brief, like a real person texting. Don't add a greeting or sign-off unless the speaker used one.",
    { properties: [select("platform", "Platform", ["SMS", "WhatsApp", "Slack", "Telegram"], "WhatsApp")] }),
  t("recipe", "Personal", "Recipe Card", "Ingredients and numbered steps",
    "Turn the note into a recipe card: recipe name, servings and time if mentioned, an ingredients list with quantities, and numbered cooking steps. Keep any tips the speaker gave at the end."),
  t("travel-plan", "Personal", "Travel Plan", "An organized itinerary from your ideas",
    "Organize the note into a travel plan: destination and dates if mentioned, a day-by-day or place-by-place itinerary, bookings or reservations to make, and a short packing or to-do list. Only use details from the note."),

  // Work
  t("meeting-minutes", "Work", "Meeting Minutes", "Formal minutes with attendees and outcomes",
    "Write formal meeting minutes from this conversation: Date and attendees (only if mentioned), Agenda topics, a discussion summary for each topic, Decisions, and Action items with owners. Keep the language neutral and factual.",
    { featured: true }),
  t("status-update", "Work", "Status Update", "Progress, blockers and next steps",
    "Turn the note into a project status update with these sections: Summary, Progress since last update, Blockers or risks, and Next steps. Keep each section to a few concise bullets."),
  t("standup", "Work", "Standup Update", "Yesterday, today, blockers",
    "Turn the note into a daily standup update with three short sections: Yesterday, Today and Blockers. Use brief bullets and write \"None\" for an empty section."),
  t("task-ticket", "Work", "Task Ticket", "Title, description and acceptance criteria",
    "Turn the note into a task ticket for an issue tracker: a short title, a description of the problem or feature with any context, acceptance criteria as a checklist, and open questions if any were raised."),
  t("brainstorm", "Work", "Brainstorm Organizer", "Group raw ideas into themes",
    "Organize the ideas in this brainstorm into themes. Under each theme, list the ideas as bullets, and end with the most promising ideas and why the speaker seemed to favor them (only if they said so)."),
  t("feedback", "Work", "Constructive Feedback", "Specific, kind and actionable",
    "Turn the note into constructive feedback for a colleague: what went well (with specific examples), what could be improved (framed as specific, actionable suggestions), and an encouraging closing line. Keep the tone respectful and direct."),
  t("interview-notes", "Work", "Interview Notes", "Candidate or user interview summary",
    "Turn this interview into structured notes: who was interviewed and why (if mentioned), key answers or findings grouped by topic, notable quotes, strengths and concerns, and the overall impression the speaker stated."),

  // Writing Styles
  t("professional", "Writing Styles", "Professional", "Polished and business-ready",
    "Rewrite the note in a polished, professional style suitable for work: clear structure, confident and courteous wording, no slang and no unnecessary words."),
  t("friendly", "Writing Styles", "Friendly & Casual", "Relaxed, warm and conversational",
    "Rewrite the note in a warm, relaxed and conversational style, as if talking to a friend. Use contractions and simple words, and keep it upbeat."),
  t("persuasive", "Writing Styles", "Persuasive", "Make a convincing case",
    "Rewrite the note as a persuasive piece: open with the main point, support it with the reasons and evidence the speaker gave, address an obvious objection if the speaker mentioned one, and finish with a clear call to action."),
  t("storyteller", "Writing Styles", "Storyteller", "Turn events into a short story",
    "Retell the note as an engaging short story with a beginning, middle and end. Use vivid but realistic description, keep the real events and people as the speaker described them, and don't invent new plot points."),
  t("academic", "Writing Styles", "Academic", "Formal, precise and objective",
    "Rewrite the note in a formal academic style: objective tone, precise terminology, well-structured paragraphs with clear topic sentences, and hedged claims where the speaker was uncertain. Do not add citations."),
  t("poem", "Writing Styles", "Poem", "Your note as a short poem",
    "Turn the note into a short poem (8 to 20 lines) that captures its main ideas and feelings. Use vivid imagery; rhyme is optional."),
];

const TEMPLATE_BY_ID = new Map(TEMPLATES.map((template) => [template.id, template]));

export function findTemplate(id: string): Template | undefined {
  return TEMPLATE_BY_ID.get(id);
}
