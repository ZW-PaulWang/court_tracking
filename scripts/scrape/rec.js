// Scrapes Harvard Recreation tennis availability. Run in the browser pane from membership.gocrimson.com.
// Court and venue names are read from the portal's own ProductName/Location fields, never hardcoded here.
// Returns {window, rows, diag} as a JSON string.

const CLASSIFICATION = 'dc42ec33-82df-44ca-b06c-109c3685395d';

// 0. Programs the classification page does not list. Court 6 is real and bookable but absent from
//    /program?classificationId=..., and no paging or keyword param surfaces it, so its id has to be
//    carried. Only the ID is carried; the NAME still comes from the portal below.
const EXTRA_PROGRAM_IDS = ['e11bd3c1-4e58-4b8d-98c7-9fbc1838216e'];

// 1. Venue codes. Keyed on the portal's ProductName prefix, because the page's color tokens
//    (--venue-M, --venue-B) need a stable short code. Unmatched programs throw rather than guess.
const VENUES = [
 {test: /^murr/i, code: 'M', name: 'Murr Indoor'},
 {test: /^beren/i, code: 'B', name: 'Beren'}
];

function to24(h, mi, ap){ h = +h; if(ap === 'PM' && h !== 12) h += 12; if(ap === 'AM' && h === 12) h = 0; return h * 60 + +mi; }

// 2. Compact a Location string into a court label. (before: "Court 16, Court 17, Court 18" -> after: "16, 17 & 18")
function courtsFromLocation(loc){
 const ns = (loc || '').match(/\d+/g) || [];
 if(!ns.length) return (loc || '').trim();
 if(ns.length === 1) return 'Court ' + ns[0];
 return ns.slice(0, -1).join(', ') + ' & ' + ns[ns.length - 1];
}

// 3. Strip the duration suffix the portal appends. (before: "Murr Tennis: Court 6 (1.5 Hours)" -> after: "Court 6")
function courtFromProduct(name){
 const after = name.includes(':') ? name.split(':').slice(1).join(':') : name;
 return after.replace(/\([^)]*\)/g, '').trim() || name.trim();
}

// 4. Discover the program list from the classification page, so a court Harvard adds appears with no edit here.
const listDoc = new DOMParser().parseFromString(
 await fetch('/program?classificationId=' + CLASSIFICATION).then(r => r.text()), 'text/html');
const discovered = [...listDoc.querySelectorAll('.program-list-item')].map(el => {
 const a = el.querySelector('a[href*=courseId]');
 return a ? a.getAttribute('href').match(/courseId=([0-9a-f-]{36})/)[1] : null;
}).filter(Boolean);

const pids = [...new Set(discovered.concat(EXTRA_PROGRAM_IDS))];

const rows = [], days = new Set(), diag = {discovered: discovered.length, extra: EXTRA_PROGRAM_IDS.length, programs: {}};

for(const pid of pids){
 const d = new DOMParser().parseFromString(
  await fetch('/Program/GetProgramInstances?programID=' + pid).then(r => r.text()), 'text/html');
 const el = d.querySelector('#ApptInfo');
 if(!el){ diag.programs[pid] = 'no ApptInfo'; continue; }
 const appts = JSON.parse(el.value);
 if(!appts.length){ diag.programs[pid] = '0 appointments'; continue; }

 // 5. The portal is the authority on naming. Fail loudly instead of mislabeling.
 const product = appts[0].ProductName;
 if(!product) throw new Error('program ' + pid + ' returned no ProductName');
 const venue = VENUES.find(v => v.test.test(product));
 if(!venue) throw new Error('unmapped venue for ProductName "' + product + '" (program ' + pid + ')');

 // 6. Location can differ slot to slot (Beren sometimes includes Court 18), so index it by start time.
 const locBy = {};
 appts.forEach(a => { locBy[a.StartDate.slice(0, 16)] = a.Location; });
 const multiCourt = new Set(appts.map(a => a.Location)).size > 1 ||
                    ((appts[0].Location || '').match(/\d+/g) || []).length > 1;

 const base = new URLSearchParams();
 appts.forEach((a, i) => Object.entries(a).forEach(([k, v]) => base.append(`appointments[${i}][${k}]`, v === null ? '' : v)));
 base.append('programID', pid);

 let cards = 0;
 for(const ds of [...new Set(appts.map(a => a.StartDate.slice(0, 10)))]){
  days.add(ds);
  const b = new URLSearchParams(base); const [y, m, dd] = ds.split('-');
  b.append('year', +y); b.append('month', +m); b.append('day', +dd);
  const h = await fetch('/Program/FilterProgramInstances', {method: 'POST',
   headers: {'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest'}, body: b}).then(r => r.text());

  new DOMParser().parseFromString(h, 'text/html').querySelectorAll('.program-instance-card').forEach(c => {
   cards++;
   const tx = c.innerText.replace(/\s+/g, ' ').trim();
   const tm = tx.match(/(\d{1,2}):(\d{2}) ([AP]M) - (\d{1,2}):(\d{2}) ([AP]M)/);
   const av = tx.match(/(\d+) Spots? available/i);   // availability logic unchanged: only this counts as open
   if(!tm || !av) return;
   const start = to24(tm[1], tm[2], tm[3]);
   const stamp = ds + 'T' + String(Math.floor(start / 60)).padStart(2, '0') + ':' + String(start % 60).padStart(2, '0');
   // 7. A multi-court program is labelled from the slot's own Location; a single court from ProductName.
   const court = multiCourt ? courtsFromLocation(locBy[stamp]) : courtFromProduct(product);
   rows.push({v: venue.code, court, date: ds, start, end: to24(tm[4], tm[5], tm[6]), open: +av[1]});
  });
 }
 diag.programs[product] = cards + ' cards';
}

const sorted = [...days].sort();
JSON.stringify({
 window: {from: sorted[0], to: sorted[sorted.length - 1]},
 venues: VENUES.filter(v => rows.some(r => r.v === v.code)).map(v => ({code: v.code, name: v.name})),
 diag, rows
})
