a/**
 * AI Travel Concierge: selected functions from the production script.
 *
 * The full script (about 110,000 characters) is not published because it
 * contains private family data. These excerpts show the operational layer:
 * scheduling, self-shutdown, a one-nudge reminder policy, and a test harness
 * that never mails the family. String literals lightly edited for publication.
 */

/** Run once. Creates the survey, installs the triggers, emails you the link. */
function runSetup() {
  if (!owKey_())  throw new Error('Set OPENWEATHER_KEY in Project Settings -> Script Properties first.');
  if (!gemKey_()) throw new Error('Set GEMINI_KEY in Project Settings -> Script Properties first.');

  ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t); });
  // 10pm: tomorrow's plan lands the night before, so the family reads it over
  // dinner instead of over a breakfast already half-decided.
  ScriptApp.newTrigger('sendDailyBrief').timeBased().atHour(22).nearMinute(0).everyDays(1).create();
  ScriptApp.newTrigger('checkConditions').timeBased().atHour(12).nearMinute(0).everyDays(1).create();
  ScriptApp.newTrigger('watchReplies').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('checkSurveyReminders').timeBased().atHour(18).nearMinute(0).everyDays(1).create();
  ScriptApp.newTrigger('stopAfterTrip').timeBased().atHour(23).nearMinute(0).everyDays(1).create();

  var url = props_().getProperty('FORM_URL');
  if (!url) { var form = createSurvey_(); url = form.getPublishedUrl(); }

  MailApp.sendEmail({ to: CONFIG.owner, subject: 'Concierge v3 installed', name: 'Family Concierge',
    htmlBody: '<p>Triggers live: nightly brief 10pm (planning the following day), exception check midday, ' +
      'reply watcher every 15 minutes, reminder check 6pm, auto-stop after the trip.</p>' +
      '<p>Survey: <a href="' + url + '">' + url + '</a></p>' });
  log_('setup', 'v3 triggers installed, nightly 10pm');
  return url;
}

/** Self-terminating. Deletes every trigger the day after the trip ends. */
function stopAfterTrip() {
  if (new Date() > new Date(CONFIG.tripEnd + 'T23:59:00')) {
    ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t); });
    MailApp.sendEmail({ to: CONFIG.owner, subject: 'Trip over: concierge switched itself off',
      body: 'All triggers deleted. Nothing further will send.' });
  }
}

/** One nudge, 24 hours after the invite, to non-responders only. Never twice. */
function checkSurveyReminders() {
  var sentAt = Number(props_().getProperty('SURVEY_SENT_AT') || 0);
  if (!sentAt || props_().getProperty('SURVEY_REMINDED') === 'yes') return;
  if (Date.now() - sentAt < 24 * 3600 * 1000) return;

  var answered = respondentNames_();
  var missing = adults_().filter(function(p) { return answered.indexOf(p.name) === -1; });
  if (!missing.length) { props_().setProperty('SURVEY_REMINDED', 'yes'); log_('survey', 'all answered'); return; }

  var url = props_().getProperty('FORM_URL');
  missing.forEach(function(p) {
    MailApp.sendEmail({ to: p.email, subject: p.name + ', still missing your two minutes',
      name: 'Family Concierge', htmlBody: surveyEmail_(p.name, url, true) });
  });
  props_().setProperty('SURVEY_REMINDED', 'yes');
  log_('survey', 'reminded ' + missing.map(function(p) { return p.name; }).join(','));
}

/** Sends one brief to the owner only. Use this to test without mailing the family. */
function testBriefToMeOnly() {
  var saved = CONFIG.people;
  CONFIG.people = [{ name: 'Owner', email: CONFIG.owner, role: 'organiser' }];
  try { sendDailyBrief(); } finally { CONFIG.people = saved; }
}

/** Forces the exception alert to the owner only, ignoring thresholds. For testing. */
function testAlertToMeOnly() {
  var saved = CONFIG.people, savedAlert = CONFIG.alert;
  CONFIG.people = [{ name: 'Owner', email: CONFIG.owner, role: 'organiser' }];
  CONFIG.alert = { rainPct: -1, aqi: -1, tempSwingC: -1, windKmh: -1 };
  props_().setProperty('ALERTED_TODAY', 'no');
  if (!props_().getProperty('PLANNED')) props_().setProperty('PLANNED', JSON.stringify(
    { date: Utilities.formatDate(new Date(), CONFIG.tz, 'yyyy-MM-dd'), hourly: {} }));
  try { checkConditions(); } finally { CONFIG.people = saved; CONFIG.alert = savedAlert; props_().setProperty('ALERTED_TODAY', 'no'); }
}
