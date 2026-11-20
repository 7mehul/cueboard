import type { GranolaNote } from '../src/memory/granola.ts';
import { STORY } from './docs.ts';

// Two notes as Granola's API returns them, for tests and `serve.ts --fake-granola`. The first is
// the Larkspur call from the story: its "my notes" are the story's call notes, so the fake model
// recognises it and answers as a good model would. The second is an internal stand-up.

const notes = STORY.find(s => s.doc.id === 'd3')!.doc.text;
const ME = { name: 'Alex Rivera', email: 'alex@cueboard.example' };

export const GRANOLA_NOTES: GranolaNote[] = [
  {
    id: 'not_LarkspurCall01',
    title: 'Call with Maya (Larkspur)',
    owner: ME,
    created_at: '2026-10-08T14:32:00Z',
    web_url: 'https://notes.granola.ai/d/0b3c1c9e-larkspur-call',
    calendar_event: { event_title: 'Cueboard <> Larkspur Ventures', scheduled_start_time: '2026-10-08T14:00:00Z', scheduled_end_time: '2026-10-08T14:30:00Z' },
    attendees: [ME, { name: 'Maya Chen', email: 'maya@larkspur.example' }],
    private_notes_markdown: notes,
    summary_markdown: '### Churn\n- Maya asked about churn for small teams twice\n\n### Next steps\n- Alex to send cohort table\n- Maya to introduce Ben Okoro',
    transcript: [
      { speaker: { source: 'speaker', attribution: 'them', name: 'Maya Chen' }, text: 'Thanks for making time.' },
      { speaker: { source: 'speaker', attribution: 'them', name: 'Maya Chen' }, text: 'How does churn look for the small teams?' },
      { speaker: { source: 'microphone', attribution: 'me' }, text: 'We’re at 3.1% a month for teams under ten seats.' },
      { speaker: { source: 'speaker', attribution: 'them', name: 'Maya Chen' }, text: 'Isn’t this just a feature Zoom will add?' },
      { speaker: { source: 'microphone', attribution: 'me' }, text: 'We work across Zoom, Meet and Teams.' },
    ],
  },
  {
    id: 'not_WeeklyTeam0001',
    title: 'Weekly team sync',
    owner: ME,
    created_at: '2026-10-19T16:20:00Z',
    web_url: 'https://notes.granola.ai/d/7a1d-weekly-sync',
    calendar_event: { event_title: 'Weekly team sync', scheduled_start_time: '2026-10-19T16:00:00Z', scheduled_end_time: '2026-10-19T16:20:00Z' },
    attendees: [ME, { name: 'Priya Shah', email: 'priya@cueboard.example' }],
    private_notes_markdown: null,
    summary_markdown: '- Shipped Today view\n- Next: calendar sync',
    transcript: [{ speaker: { source: 'speaker', attribution: 'them', name: 'Priya Shah' }, text: 'Today view is live.' }],
  },
];
