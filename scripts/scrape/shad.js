// Scrapes Shad Hall tennis availability. Run in the browser pane from shad.hbs.edu on the booking page.
// Court names come from the page's own data-facility-name attributes. Returns {window, rows, diag} as JSON.

const bid = location.pathname.match(/\/booking\/([0-9a-f-]{36})/)[1];   // booking id from the URL, not hardcoded

function to24(h, mi, ap){ h = +h; if(ap === 'PM' && h !== 12) h += 12; if(ap === 'AM' && h === 12) h = 0; return h * 60 + +mi; }

// 0. Facilities and the released date list are both published by the page.
const facs = [...new Map([...document.querySelectorAll('[data-facility-id][data-facility-name]')]
 .map(b => [b.dataset.facilityId, b.dataset.facilityName])).entries()];
if(!facs.length) throw new Error('no facilities on page — not signed in, or layout changed');
const dates = JSON.parse(document.getElementById('hdnDates').value).map(s => s.slice(0, 10));

const rows = [], diag = {facilities: facs.map(f => f[1]), cards: 0};

for(const [fid, fname] of facs) for(const ds of dates){
 const [y, m, dd] = ds.split('-').map(Number);
 const d = new DOMParser().parseFromString(
  await fetch(`/booking/${bid}/slots/${fid}/${y}/${m}/${dd}`).then(r => r.text()), 'text/html');

 [...d.querySelectorAll('.card.h-100')].forEach(c => {
  diag.cards++;
  const tx = c.innerText.replace(/\s+/g, ' ').trim();
  const tm = tx.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*([AP]M)/);
  const av = tx.match(/(\d+) spots? available/i);   // "No spots available" is booked, and drops out here
  if(!tm || !av) return;
  // 1. Shad prints one meridiem, on the END time only. Infer the start's as the latest reading still earlier.
  const e = to24(tm[3], tm[4], tm[5]);
  let s = null;
  for(const ap of ['AM', 'PM']){ const c2 = to24(tm[1], tm[2], ap); if(c2 < e && (s === null || c2 > s)) s = c2; }
  rows.push({v: 'S', court: fname.replace(/^Tennis Court #/, 'Court '), date: ds, start: s, end: e, open: +av[1]});
 });
}

JSON.stringify({
 window: {from: dates[0], to: dates[dates.length - 1]},
 venues: [{code: 'S', name: 'Shad Hall'}],
 diag, rows
})
