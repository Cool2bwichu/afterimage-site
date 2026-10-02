// A stand-in for the Anthropic SDK client that records requests and replays
// scripted answers. No test in this suite reaches the network.
export function fakeClaude(answers = [], { retrieve = async (id) => ({ id }) } = {}) {
  const queue = [...answers];
  const calls = [];
  return {
    calls,
    models: { retrieve },
    beta: {
      messages: {
        stream(params, options = {}) {
          calls.push({ params, options });
          const next = queue.shift();
          return {
            async finalMessage() {
              if (next === undefined) throw new Error('No scripted Claude answer remains.');
              if (next instanceof Error) throw next;
              return typeof next === 'function' ? next(params, options) : next;
            },
          };
        },
      },
    },
  };
}

export function answer(value, { stopReason = 'end_turn', before = [] } = {}) {
  return {
    stop_reason: stopReason,
    content: [
      ...before,
      { type: 'thinking', thinking: '', signature: 'test' },
      { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) },
    ],
  };
}

export const matchedMetadata = async (films) => films.map((film, index) => ({
  requestedTitle: film.title, requestedYear: film.year, status: 'matched', tmdbId: index + 100,
}));
