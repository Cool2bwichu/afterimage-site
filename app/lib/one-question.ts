// The entrance asks one question and offers one sentence whose words can be tapped.
// Both turn into an ordinary reel request: a chosen catalogue film becomes a
// reference film, anything typed becomes written guidance, and the sentence adds
// only the words the viewer filled in.

export const SENTENCE_WORDS = [
  { key: 'mood', label: 'Mood', blank: 'mood', options: ['quiet', 'tender', 'tense', 'strange', 'funny', 'sweeping', 'dark', 'hopeful'] },
  { key: 'company', label: 'Company', blank: 'with whom', options: ['alone', 'with someone', 'with friends', 'with family'] },
  { key: 'time', label: 'Time', blank: 'when', options: ['tonight', 'in under two hours', 'on a long evening', 'on a slow Sunday'] },
] as const;

export type SentenceKey = typeof SENTENCE_WORDS[number]['key'];
/** The chosen option for each word, or -1 while it is blank. */
export type SentenceChoice = Record<SentenceKey, number>;
export const BLANK_SENTENCE: SentenceChoice = { mood: -1, company: -1, time: -1 };

export type ChosenFilm = { title: string; year: string; tmdbId?: number; posterUrl?: string | null };

/** Steps a word through its options and back to blank, forwards or backwards. */
export function cycleWord(choice: SentenceChoice, key: SentenceKey, direction: 1 | -1 = 1): SentenceChoice {
  const word = SENTENCE_WORDS.find(item => item.key === key);
  if (!word) return choice;
  const states = word.options.length + 1;
  const current = choice[key] + 1;
  const next = ((current + direction) % states + states) % states;
  return { ...choice, [key]: next - 1 };
}

export function wordText(choice: SentenceChoice, key: SentenceKey): string | null {
  const word = SENTENCE_WORDS.find(item => item.key === key);
  const index = choice[key];
  return word && index >= 0 && index < word.options.length ? word.options[index] : null;
}

/** "Something tender to watch alone, tonight." Only the filled words count; none gives ''. */
export function sentenceBrief(choice: SentenceChoice): string {
  const mood = wordText(choice, 'mood');
  const company = wordText(choice, 'company');
  const time = wordText(choice, 'time');
  if (!mood && !company && !time) return '';
  const watch = company ? `to watch ${company}` : 'to watch';
  return `Something ${mood ? `${mood} ` : ''}${watch}${time ? `, ${time}` : ''}.`;
}

export function hasAnswer(text: string, film: ChosenFilm | null, choice: SentenceChoice): boolean {
  return Boolean(film || text.trim() || sentenceBrief(choice));
}

/** The reel request the entrance hands to the page, or null when nothing was answered. */
export function questionRequest(text: string, film: ChosenFilm | null, choice: SentenceChoice): { films: string[]; creativeBrief: string } | null {
  const sentence = sentenceBrief(choice);
  const typed = text.trim().replace(/\s+/g, ' ').slice(0, 600);
  const films = film ? [`${film.title} (${film.year})`] : [];
  const stayed = !film && typed ? `What stayed with me: ${typed.replace(/[.!?]*$/, '')}.` : '';
  const creativeBrief = [stayed, sentence].filter(Boolean).join(' ');
  if (!films.length && !creativeBrief) return null;
  return { films, creativeBrief };
}
