# Quiz data lifecycle

## Question deletion

Deleting a question is a soft delete. Chaos sets `questions.deletedAt` so the question disappears from the editor, live player payload, quiz counts, and forward-looking analytics while historical session answers can still resolve the original question text and grading data.

The question row is permanently removed only when its entire quiz is deleted.

## Quiz deletion

Quiz deletion is permanent. The creator confirmation names the quiz and states how many recorded responses will be destroyed. Folder deletion names every affected quiz and gives the total response count at risk.

Deleting a quiz:

- permanently deletes all of its questions, including soft-deleted questions;
- permanently deletes all quiz sessions and therefore the results and analytics derived from them;
- clears that quiz's `quizId` from related AI jobs while retaining the jobs for generation history and quota accounting;
- permanently deletes the quiz document;
- immediately retires `/{username}/{slug}`. There is no tombstone, and the slug can later be reused by the creator.

Creator deletion and administrator deletion use the same cascade implementation so both paths have identical data behavior.

## Account-level changes

Banning or elevating an account does not delete content. Changing a username updates the creator's cached quiz username through the existing username flow, so public links follow the current username. No account-wide destructive migration runs automatically.

## Verification to run before merge

- Create a quiz with active and soft-deleted questions, completed/in-progress sessions, and an AI job linked by `quizId`; delete it and verify the quiz/questions/sessions are gone while the AI job remains with `quizId` cleared.
- Delete one answered question and verify it disappears from live creator/player/count/stat views while the existing session detail still shows the original question.
- Delete a quiz and a populated folder from the dashboard and confirm the warnings show the correct response counts and quiz names.
