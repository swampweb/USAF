 USAF Tours Update v6

Replace all files from this ZIP into the same paths in your GitHub repo.

Do not replace assets/js/config.js.

New/updated:
- tours.html
- assets/js/tours.js
- layout navigation now includes Tours
- cycles now require a Tour
- receipts now require a Tour
- dashboard now filters by Tour
- voucher records now include Tour
- reports now summarize by Tour

After upload and commit, open:
https://swampweb.github.io/USAF/tours.html?v=6

Recommended test order:
1. Create Tour
2. Create Cycle inside Tour
3. Add Per Diem Receipt linked to Tour/Cycle
4. Check Dashboard
5. Add Other Receipt linked to Tour
6. Create Voucher Record from Tour/date range
