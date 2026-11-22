/**
 * Which messages get copied to Muse. Run with: npx tsx src/features/jarvis/museTasks.test.ts
 */
import assert from 'node:assert/strict';
import { classifyMuseTask, withMuseAck, MUSE_ACK } from './museTasks';

const cases: [string, ReturnType<typeof classifyMuseTask>][] = [
  // reminders
  ['remind me to call the bank at 6', 'reminder'],
  ['Remind me tomorrow about the FAR assignment', 'reminder'],
  ['set a reminder for 9pm to take meds', 'reminder'],
  ['can you set an alarm for 6 am', 'reminder'],
  ["don't let me forget the MST on Friday", 'reminder'],
  ['reminder to pay rent on the 1st', 'reminder'],
  // research / lookup
  ['research the best ETFs for silver', 'research'],
  ['find out when the GKS deadline is', 'research'],
  ['look up the OIST internship stipend', 'research'],
  ['check if the EU Blue Book traineeship is open', 'research'],
  ['Jarvis, can you check the RBI internship dates', 'research'],
  ['please search for funded masters in Japan', 'research'],
  // notes
  ['remember this: my locker code is in the blue diary', 'note'],
  ['remember that I prefer morning workouts', 'note'],
  ['note that the QTM quiz moved to Thursday', 'note'],
  ['make a note to buy printer ink', 'note'],
  ['Note: Arjun owes me 500', 'note'],
  ['jot this down, call the dentist', 'note'],
  // explicit
  ['send it to Muse', 'explicit'],
  ['give this to Muse: draft a cold email to Coy', 'explicit'],
  ['Muse, sort out my internship list', 'explicit'],
  // ordinary chat stays with Gemini
  ['how was my streak this week', null],
  ['I feel tired today', null],
  ["I'll check later", null],
  ['do you remember what I said yesterday', null],
  ['what should I eat after the gym', null],
  ['I will research it myself', null],
  ['tell me a joke', null],
  ['', null],
];
for (const [text, kind] of cases) assert.equal(classifyMuseTask(text), kind, `"${text}"`);

assert.equal(withMuseAck('Got it, 6 pm.', true), `${MUSE_ACK} Got it, 6 pm.`);
assert.equal(withMuseAck('   ', true), MUSE_ACK);
assert.ok(withMuseAck('Okay.', false).startsWith("Couldn't send this to Muse"));

console.log(`muse task classifier: ${cases.length} cases passed`);

// Follow-ups to a task are the same task; follow-ups to chat stay chat
assert.equal(classifyMuseTask('set anothero one', 'remind me at 1 to set an alarm'), 'reminder', 'the real typo from the first test');
assert.equal(classifyMuseTask('set another one', 'remind me at 1 to set an alarm'), 'reminder');
assert.equal(classifyMuseTask('do it again for 2am', 'set a reminder for 1am'), 'reminder');
assert.equal(classifyMuseTask('one more for tomorrow', 'research flights to Tokyo'), 'research');
assert.equal(classifyMuseTask('another one', 'tell me a joke'), null);
assert.equal(classifyMuseTask('set another one'), null, 'no previous message: no guess');
console.log('muse follow-ups: passed');
