# Chaos sound language

Sounds reinforce visible feedback; no task depends on hearing them. Keep them short, soft and recognizable. Use the shared Web Audio engine and the global `chaos-sfx` preference; each form’s selected pack can also be off. Never create a second completion preference or bypass a muted global preference.

| Event | Signature |
| --- | --- |
| Lesson complete | Two soft rising notes |
| Course complete | Three rising notes, used instead of the lesson sound for the final lesson |
| Correct | Existing short positive interval |
| Incorrect | Existing soft lower interval |
| Live countdown | Existing quiet tick for each countdown step |

Completion starts only after a successful explicit completion save and follows a direct user gesture that unlocks audio. It never delays navigation. Failures use visible errors and do not play success. Reopening an already completed lesson does not replay the sound. Resetting reading progress preserves quiz and card evidence.

Verification: toggle the global preference and lesson control; check normal/muted playback, success/failure, final-course variation, phone audio unlocking and desktop keyboard activation. Also check reduced motion: visual animation is optional and meaning remains visible. Browser/audio availability failures must leave the workflow usable.
