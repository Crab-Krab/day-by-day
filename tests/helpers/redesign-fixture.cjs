const core = require('../../src/schedule.js');
// Disposable history-rich data. Fixed dates match the browser runner's frozen clock.
module.exports = function redesignFixture() {
  const today = '2026-11-10', yesterday = '2026-11-09';
  const routine = (id, title, extra = {}) => core.createRoutine({id, title, kind:'weekly', weekdays:[0,1,2,3,4,5,6], startDate:'2026-11-01', ...extra}, null, '2026-11-01', {});
  const active = routine('daily', 'Daily review', {time:'09:00', reminders:[15]});
  active.snapshots[yesterday] = core.routineFields({...active, title:'Earlier review'});
  active.versions.push({from:'2026-11-20', ...core.routineFields({...active, title:'Revised daily review', time:'10:00'})});
  const moved = routine('moved', 'Carried occurrence'); moved.exceptions = [today];
  const skipped = routine('skipped', 'Skipped occurrence'); skipped.exceptions = [today];
  const ended = routine('ended', 'Archived routine'); ended.endedOn = yesterday;
  const tasks = [
    {id:'earlier', kind:'once', title:'Earlier unfinished task', date:'2026-10-30'},
    {id:'timed-overdue', kind:'once', title:'Due earlier today', date:today, time:'07:00'},
    routine('overdue-routine', 'Overdue routine', {time:'07:30'}),
    {id:'long', kind:'once', title:'Long title '.repeat(20).slice(0,200), date:today, description:('Notes for a busy day.\n'.repeat(230)+'https://example.com/'+'a'.repeat(300)).slice(0,5000)},
    {id:'plain', kind:'once', title:'Plan tomorrow', date:today, description:'A short note with https://example.com'},
    {id:'complete', kind:'once', title:'Completed item', date:today},
    {id:'carried', kind:'once', title:'Carried occurrence', date:'2026-11-11', movedFrom:{taskId:'moved',date:today}},
    active, moved, skipped, ended
  ];
  for(let i=0;i<24;i++) tasks.push({id:'done-'+i, kind:'once', title:'Finished task '+(i+1), date:today});
  for(let i=0;i<8;i++) tasks.push({id:'future-'+i, kind:'once', title:'Coming up item '+(i+1), date:'2026-11-11'});
  return core.validate({version:5, tasks, completed:{[today]:['complete',...Array.from({length:24},(_,i)=>'done-'+i)], [yesterday]:['daily']}, weekdayOrders:{2:['plain','daily','long']}, routineOrder:['daily','skipped','moved','overdue-routine']});
};
