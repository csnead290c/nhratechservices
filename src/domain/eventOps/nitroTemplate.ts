/**
 * Nitro Pre-Event Plan Template
 *
 * Based on the NHRA Nitro pre-event plan sample structure.
 * Used as a static draft helper in the UI — NOT inserted into production DB automatically.
 *
 * To use: pass to EventPrePlanEditor as initialTemplate prop, then user saves manually.
 */

export interface TemplateSectionDef {
  section_key: string;
  title: string;
  body: string;
  sort_order: number;
}

export interface TemplateSessionDef {
  session_key: string;
  title: string;
  class_scope: string | null;
  notes: string;
  sort_order: number;
}

export interface TemplateTaskDef {
  session_key: string | null;
  title: string;
  description: string;
  task_type: 'inspection' | 'survey' | 'briefing' | 'logistics' | 'safety' | 'admin' | 'other';
  priority: 'high' | 'normal' | 'low';
}

export interface NitroPlanTemplate {
  name: string;
  plan_type: 'pre_event';
  sections: TemplateSectionDef[];
  sessions: TemplateSessionDef[];
  tasks: TemplateTaskDef[];
}

export const NITRO_PRE_EVENT_TEMPLATE: NitroPlanTemplate = {
  name: 'Nitro Pre-Event Plan Template',
  plan_type: 'pre_event',

  sections: [
    {
      section_key: 'event_schedule',
      title: 'Event Schedule',
      body: [
        '## Event Schedule',
        '',
        '| Day | Time | Activity |',
        '|-----|------|----------|',
        '| Wednesday | 08:00 | Crew arrival / pit setup |',
        '| Wednesday | 14:00 | Tech inspection opens |',
        '| Thursday  | 08:00 | Official practice sessions |',
        '| Thursday  | 18:00 | Qualifying round 1 |',
        '| Friday    | 10:00 | Qualifying round 2 |',
        '| Friday    | 18:00 | Qualifying round 3 |',
        '| Saturday  | 09:00 | Qualifying round 4 (if needed) |',
        '| Saturday  | 14:00 | Eliminations begin |',
        '| Sunday    | 10:00 | Final eliminations |',
      ].join('\n'),
      sort_order: 1,
    },
    {
      section_key: 'staffing',
      title: 'Staffing',
      body: [
        '## Staffing Plan',
        '',
        '| Role | Name | Arrive | Depart | Notes |',
        '|------|------|--------|--------|-------|',
        '| Chief Tech Inspector | | Wed 07:00 | Sun 18:00 | |',
        '| Assistant Tech Inspector | | Wed 08:00 | Sun 18:00 | |',
        '| Nitro Tech Specialist | | Wed 08:00 | Sun 18:00 | Certified for fuel systems |',
        '| Safety Tech | | Wed 08:00 | Sun 18:00 | |',
        '| Scale / Measurement | | Thu 07:00 | Sun 17:00 | |',
        '| Grid Marshal | | Thu 08:00 | Sun 17:00 | |',
      ].join('\n'),
      sort_order: 2,
    },
    {
      section_key: 'event_map',
      title: 'Event Map',
      body: [
        '## Event Map',
        '',
        'Attach or link event map document below (Files tab).',
        '',
        '**Key locations:**',
        '- Tech inspection station: _[location]_',
        '- Scales: _[location]_',
        '- Staging lanes: _[location]_',
        '- Fuel containment area: _[location]_',
        '- Safety / medical station: _[location]_',
        '- Timing tower / officials: _[location]_',
      ].join('\n'),
      sort_order: 3,
    },
    {
      section_key: 'entries',
      title: 'Entry List by Class',
      body: [
        '## Entry List by Class',
        '',
        'Reference the current entry list (Files tab — entry_list type).',
        '',
        '**New entries this event are highlighted for priority attention.**',
        '',
        'Classes represented:',
        '- Top Fuel (TF)',
        '- Funny Car (FC)',
        '- Pro Stock (PS)',
        '- Pro Stock Motorcycle (PSM)',
      ].join('\n'),
      sort_order: 4,
    },
    {
      section_key: 'priority_inspections',
      title: 'Priority Inspections & Surveys',
      body: [
        '## Priority Inspections & Surveys',
        '',
        'The following items require priority attention before qualifying:',
        '',
        '- [ ] All new entries (first appearance this season) — full inspection',
        '- [ ] Updated chassis certification review',
        '- [ ] Fuel system verification — all nitro cars',
        '- [ ] Ballistic blanket / containment inspection',
        '- [ ] SFI spec documentation review for all drivers',
        '- [ ] Fire suppression system check',
        '- [ ] Data recorder seal verification (if applicable)',
        '',
        'See Tasks tab for individual assigned inspection items.',
      ].join('\n'),
      sort_order: 5,
    },
    {
      section_key: 'session_plan',
      title: 'Session-by-Session Plan',
      body: [
        '## Session-by-Session Plan',
        '',
        'See the Sessions tab for individual session definitions and associated tasks.',
        '',
        'General session protocol:',
        '1. Pre-session staff briefing (15 min before lanes open)',
        '2. Verify all priority inspection tasks complete before first run',
        '3. Post-session debrief: issues identified, carry-forwards noted',
      ].join('\n'),
      sort_order: 6,
    },
    {
      section_key: 'incident_plan',
      title: 'Incident Plan / Checklist',
      body: [
        '## Incident Plan / Checklist',
        '',
        '### On-Track Incident Protocol',
        '1. Race director calls red light — staging lanes hold',
        '2. Safety crew deploys',
        '3. Medical evaluation if any personnel contact',
        '4. Tech inspector documents vehicle condition',
        '5. Determine repairability before re-tech clearance',
        '',
        '### Fire Protocol',
        '1. Driver activates suppression system',
        '2. Safety crew responds with foam',
        '3. No re-entry until fire marshal clears',
        '',
        '### Fuel Spill Protocol',
        '1. Contain spill — notify fuel containment crew',
        '2. Document location and quantity',
        '3. Remediation complete before lane reopens',
        '',
        '### Technical Violation Protocol',
        '1. Immediate hold on car',
        '2. Notify series director',
        '3. Document findings — use incident system',
        '',
        '**Incident Log:** Use /parity/analysis for any run with telemetry flags.',
      ].join('\n'),
      sort_order: 7,
    },
  ],

  sessions: [
    {
      session_key: 'pre_event_tech',
      title: 'Pre-Event Tech (Wednesday)',
      class_scope: null,
      notes: 'Initial credential and vehicle check for all entrants.',
      sort_order: 1,
    },
    {
      session_key: 'practice_1',
      title: 'Practice Session 1 (Thursday AM)',
      class_scope: null,
      notes: 'First on-track runs. Nitro specialists on standby.',
      sort_order: 2,
    },
    {
      session_key: 'q1',
      title: 'Qualifying Round 1 (Thursday PM)',
      class_scope: null,
      notes: '',
      sort_order: 3,
    },
    {
      session_key: 'q2',
      title: 'Qualifying Round 2 (Friday AM)',
      class_scope: null,
      notes: '',
      sort_order: 4,
    },
    {
      session_key: 'q3',
      title: 'Qualifying Round 3 (Friday PM)',
      class_scope: null,
      notes: '',
      sort_order: 5,
    },
    {
      session_key: 'e1_r1',
      title: 'Eliminations — Round 1 (Saturday)',
      class_scope: null,
      notes: '',
      sort_order: 6,
    },
    {
      session_key: 'e1_finals',
      title: 'Eliminations — Finals (Sunday)',
      class_scope: null,
      notes: 'Post-run winner inspection required.',
      sort_order: 7,
    },
  ],

  tasks: [
    {
      session_key: 'pre_event_tech',
      title: 'Review new entrant documentation',
      description: 'Verify SFI certs, license current, all required forms on file for all first-appearance entrants.',
      task_type: 'inspection',
      priority: 'high',
    },
    {
      session_key: 'pre_event_tech',
      title: 'Fuel system inspection — all nitro cars',
      description: 'Verify plumbing, containment, and seals per current rulebook spec.',
      task_type: 'inspection',
      priority: 'high',
    },
    {
      session_key: 'pre_event_tech',
      title: 'Ballistic blanket / containment check',
      description: 'Inspect all required containment devices for condition and proper installation.',
      task_type: 'inspection',
      priority: 'high',
    },
    {
      session_key: 'pre_event_tech',
      title: 'Scale calibration verification',
      description: 'Verify scales are calibrated before first use.',
      task_type: 'logistics',
      priority: 'normal',
    },
    {
      session_key: 'pre_event_tech',
      title: 'Staff briefing — event protocol review',
      description: 'Review event schedule, incident plan, and communication protocol with all tech staff.',
      task_type: 'briefing',
      priority: 'normal',
    },
    {
      session_key: 'practice_1',
      title: 'Pre-session staff check-in',
      description: 'Confirm all positions staffed before lanes open.',
      task_type: 'admin',
      priority: 'normal',
    },
    {
      session_key: 'e1_finals',
      title: 'Post-run winner inspection',
      description: 'Full winner tech inspection per series rules.',
      task_type: 'inspection',
      priority: 'high',
    },
    {
      session_key: null,
      title: 'Verify incident reporting system accessible',
      description: 'Confirm all staff can access /parity and incident logging before event starts.',
      task_type: 'logistics',
      priority: 'normal',
    },
  ],
};
