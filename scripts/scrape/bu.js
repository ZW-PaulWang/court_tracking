// Scrapes BU FitRec tennis availability. Run in the browser pane from the myfitrec.bu.edu ttc search page.
// The activity name is read from each calendar block. Returns {census, rows, days, diag} as JSON.
//
// BU labels a block "Unavailable" whether it is already booked OR simply more than 48 hours out, and the
// two cannot be told apart from this page. The caller therefore clamps the released window to today..today+2
// no matter how far the calendar renders. The census is the safety net: anything other than the all-
// Unavailable key means the layout changed or a genuinely open slot appeared.

const tok = document.querySelector('a[href*="_csrf_token"]').href.match(/_csrf_token=([^&]+)/)[1];

function to24(h, mi, ap){ h = +h; if(ap.toUpperCase() === 'PM' && h != 12) h = +h + 12; if(ap.toUpperCase() === 'AM' && h == 12) h = 0; return +h * 60 + +mi; }

const census = {}, rows = [], seen = new Set(), names = new Set();
const now = new Date(), months = [[now.getMonth() + 1, now.getFullYear()]];
const nx = new Date(now.getFullYear(), now.getMonth() + 1, 1);
months.push([nx.getMonth() + 1, nx.getFullYear()]);

for(const [mo, yr] of months){
 const last = new Date(yr, mo, 0).getDate();
 const p = n => String(n).padStart(2, '0');
 const u = `/webtrac/web/search.html?BeginDate=${p(mo)}/01/${yr}&BeginMonth=${mo}&BeginYear=${yr}&Date=${p(mo)}/01/${yr}`
         + `&Display=Calendar&EndDate=${p(mo)}/${last}/${yr}&Module=ar&keyword=ttc&keywordoption=Match%20One`
         + `&sort=ActivityNumber&_csrf_token=${tok}`;
 const d = new DOMParser().parseFromString(await fetch(u).then(r => r.text()), 'text/html');

 d.querySelectorAll('.calendar__day').forEach(day => {
  const m = ((day.querySelector('.calendar__day-label-long') || {}).textContent || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if(!m) return;
  const iso = `${m[3]}-${m[1]}-${m[2]}`;
  if(seen.has(iso)) return;
  seen.add(iso);

  day.querySelectorAll('.calendar__block').forEach(b => {
   // 0. Blocks are "<name><br> <time><br> <status>", so split on <br> rather than guessing from innerText.
   const parts = b.innerHTML.split('<br>').map(s => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
   const name = parts[0] || '', tail = parts[parts.length - 1] || '';
   names.add(name);
   census[b.className.replace('calendar__block', '').trim() + ' :: ' + tail] =
    (census[b.className.replace('calendar__block', '').trim() + ' :: ' + tail] || 0) + 1;
   if(/unavailable/i.test(tail)) return;            // booked, or beyond BU's 48h release
   const tx = b.innerText.replace(/\s+/g, ' ').trim();
   const tm = tx.match(/(\d{1,2}):(\d{2}) ?([ap]m)\s*-\s*(\d{1,2}):(\d{2}) ?([ap]m)/i);
   if(!tm) return;
   // 1. "1 of 3 Available" means one of three courts is free, so open is the leading count.
   const av = tail.match(/(\d+) of (\d+) available/i);
   rows.push({v: 'U', court: name, date: iso, start: to24(tm[1], tm[2], tm[3]), end: to24(tm[4], tm[5], tm[6]),
              open: av ? +av[1] : 1, label: tail});
  });
 });
}

JSON.stringify({
 census, rows, days: seen.size,
 venues: [{code: 'U', name: 'BU FitRec'}],
 diag: {activityNames: [...names], totalBlocks: Object.values(census).reduce((a, b) => a + b, 0)}
})
