**scalable harness**
- [x] add an agents.md file and specs feedback loop
- [x] update readme/specs
- [x] time to refactor the README? have a separate specs/ folder to store the binding specs. include one on system architecture, especially those whose context is not captured in this repo. Keep README as a high-level product introduction (target audience: product managers). Have a contributing md file to onboard new developers, and orientate on the AI-assisted developer workflow, don't duplicate information from AGENTS.md or specs in order to keep the segregation of concerns neat.
- [x] make sure the data model is tracked in the specs
- [x] make sure the permissions model is tracked in the specs
- [ ] document user flow in readme
- [ ] is design system sufficient? is current linter sufficient to ensure compliance?
- [ ] dev containers for integration testing?
- [ ] make sure specs (context) and test cases (compliance) are updated (if applicable - how to define applicable to reduce bloat yet capture all essential information?) for each change.
- [ ] can the migration scripts be squashed?
- [ ] playwright scripts?

**system architecture**
- [ ] staging environment?
- [ ] vercel deployment with supabase backend - is it better than current setup?
- [ ] telegram integration - mini app, auth, reminders bot.
- [ ] traffic whitelisting/bot prevention
- [ ] monitoring stack - availability, billing
- [ ] google calendar integration - event creation/modification/deletion integration. can be enabled by user

**UI**
- [x] Remove the tables view and clean up
- [x] clean UI (glassmorphism, light gradient/monochromatic colours, thin capitalized fonts)
- [x] any other suggestions for the overall UI to keep things more clean and consistent?
- [x] keep members and events tab separate as default, regardless of desktop or mobile
- [x] make the events card member's availability dropdown more aligned to the theme
- [ ] FAB to scroll to top
- [ ] table and cards view toggle (inspired by notion)
- [ ] mobile-first experience - single pane of glass for to view roster and plan swaps (these are the core user experiences)

**domain modelling**
- [ ] introuce tenant and teams concept, clean up yaml. each tenant can have multiple teams, each team can have multiple members. members can be cross-team, constraints need to be cross-team aware too.
- [ ] is the current schema enforcement too complicated
- [ ] yaml only for local, no yaml for production. reuse core but separate state providers - local and production should still share the same data models
- [ ] tables: users, roster, teams, events, members, member_preferences, member_constraints - did i miss any?
- [ ] draw the relations
- [ ] is this scalable?
- [ ] multi-version support integrated into the draft and save concept? what would be the workflow and how will the underlying data structure change?


**roster management**
- [x] add and remove (with confirmation) role for event
- [x] add a remove-generated button in the kebab menu
- [x] introduce draft and save concept, showing the changes, and who is affected, and confirmation before saving as a final step that updates the binding. Add UI to visualize uncommitted states
- [x] listen to ctrl-z to undo, ctrl-shift-z to redo
- [x] i intend to add a multi-select of event assignments and bulk delete for them. how to quickly select all? some box-drawing?
- [x] calendar view for member availability
- [ ] When a swap fails, does the existing logic support a more descriptive error message on the toast? instead of just a generic invalid statement.

**roster validation/algorithm**
- [x] clean up roster generation info modal "how roster generation works", clicking the generate button should trigger the generation process immediately since we can undo it. generation results modal can be removed if the roster statistics already does the job.
- [x] understudy concept and dependencies

**roster analytics**
- [x] declutter roster statistics panel, remove the unnecessary info
- [x] members availability chart

**onboarding process**
- [ ] team leaders
  - [ ] team colour (gradient)
- [ ] team bot
- [ ] team members - members onboarding form and claiming (link identity) process
  - [ ] include avatar
- [ ] roster builder - templating engine
- [ ] how to bulk add members and events in production without yaml

**settings page**
- [ ] bot management
- [ ] reminders management
- [ ] validation parameters so users can understand and tune according to their team specific constraints/preferences. parameters use the exisiting defaults and changes are saved locally.
- [ ] expose algorithm parameters/stages for tuning








