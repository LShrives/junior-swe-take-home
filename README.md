# Borrowing Power Calculator

A small command-line tool that estimates how much a borrower could borrow over a fixed loan term, given their income, dependents, declared expenses and credit card limits. Tax and HEM (Household Expenditure Measure) figures are fetched from a local development API.

## Setup

Requires Node.js 18 or newer 
No runtime dependencies are added — `c8` and `mocha` are dev-only.

```
npm install
```

## Running the API server

The calculator needs the development API running. Start it in its own terminal:

```
npm run api
```

It listens on `http://localhost:3000/`. 

## Running the calculator

In a second terminal:

```
npm start
```

You will be prompted to input the gross annual income, number of dependents, declared monthly expenses and total credit card limits, and shown the estimated maximum borrowing power and the implied monthly repayment.

Example (`income 120000`, `dependents 2`, `expenses 3000`, `credit limits 10000`, default rates), returns:

```
Maximum Borrowing Power at 7%: $524,173.77
Assumed Monthly Mortgage Repayment: $4,600 over 30 years
```

If the API server is not running, or the token is rejected, the calculator prints a single-line error rather than a stack trace, e.g.:

```
Could not complete calculation: Request to /api/tax failed: fetch failed
Could not complete calculation: API /api/tax responded 401: The provided token is invalid.
```

## Running the tests

```
npm test
```

Runs the full suite (18 tests) with Mocha. No server needs to be running — the tests use fakes.

```
npm run coverage
```

Runs the same suite under `c8` and prints a coverage table. This command fails (non-zero exit) if statement, branch, function or line coverage on `apiClient.js` or `borrowingCalculator.js` drops below 100%. The HTML report is written to `coverage/`.

---

## Architecture


cli.js Terminal front-end. Prompts for input, wires a real TaxHemApiClient into a BorrowingCalculator, prints the result or an error.
 - borrowingCalculator.js - BorrowingCalculator class. The finance maths. Takes an API client + rate config.
 - apiClient.js - TaxHemApiClient class. Builds the request, attaches the PAT, parses JSON, describes any errors. 
server.js / server.md   Provided development API and its docs. (As provided by Ferocia)
test_calculator.js      Two unit suites, isolated with fakes.
.c8rc.json              Coverage config.


### `TaxHemApiClient` (`apiClient.js`)

- `new TaxHemApiClient({ baseUrl?, token?, fetchFn? })` — all optional.

  `baseUrl` defaults to `http://localhost:3000`, `token` to the development PAT,
  `fetchFn` to the global `fetch`.
- `async getTax(income)` → `Promise<number>` (annual tax).
- `async getHEM(income, dependents)` → `Promise<number>` (monthly HEM baseline).
- A private `#request` helper builds the URL with `URLSearchParams`, sends the
  `Authorization` header, and throws on a network failure or a non-2xx response,
  with the endpoint path and the server's own error message in the thrown
  `Error`.

### `BorrowingCalculator` (`borrowingCalculator.js`)

- `new BorrowingCalculator(apiClient, { interestRate?, assessmentBuffer?, loanTermMonths? })`.
  Defaults: `7.0`, `3.0`, `360`.
- `get assessmentRate()` → `interestRate + assessmentBuffer` (so `7.0 + 3.0 =
  10.0` by default). Recomputed on every read.
- `async calculateBorrowingPower(income, dependents, expenses, creditLimits)` →
  `Promise<{ maxLoanAmount, monthlyRepayment }>`.

  Steps: validate inputs → fetch tax and HEM concurrently (`Promise.all`) →
  net monthly income after tax → living expenses = `max(declared, HEM)` →
  credit card liability = `3%` of limits → monthly repayment capacity → if that
  is `≤ 0`, return zeros; otherwise apply the annuity present-value formula
  `P = M · (1 − (1 + r)^−n) / r` and round both figures to two decimals.

---

## Design decisions

### Class-based structure

The brief left the approach open. I chose a class because I am already comfortable with them, they're extensible and easy to reason about. 
If the exercise were to be given more complexity with a second round of tests/rules, you could extend the class-based structure with future methods. 
The class itself doesn't hold any mutable state between calls, so I think it equally could have worked as an orchestator function, but I prefer having a tidy place to keep config. 

### A separate `TaxHemApiClient` class

Talking to the API is a different concern from the finance side of things, so it lives in its own class. This keeps `BorrowingCalculator` free of any HTTP knowledge.

Benefits:

- the calculator can be unit-tested with a trivial fake and no server
- the data source could be swapped (a cache, a different service, a stub for a demo) without touching the calculator
- all the HTTP concerns are in a small, separately tested place

### Dependency injection

BorrowingCalculator now receives its API client as a constructor argument. TaxHemApiClient accepts a `fetchFn` (which defaults to the real fetch). cli.js then just wires it together. 

The benefits:

- test the whole borrowing formula against a fake client returning fixed tax and HEM values, and assert exact expected outputs
- test that an API failure propagates by passing a fake client whose `getTax` throws. Without that it'd be trickier to make a real client fail on demand. 
- test every response path in `TaxHemApiClient` (`200`, `401` with a message, `400` with only an `error` field, an empty error body, etcv) by passing a `fetchFn` that returns or throws exactly that.


### Interest-rate policy moved into the calculator

The original CLI computed the assessment rate, and passed the single number into calculateBorrowingPower. I moved the baseline rate, the buffer and the loan term into the `BorrowingCalculator` constructor, with `assessmentRate` as a derived getter. Grouping the logic together makes it easier to make changes and debug.

### `Promise.all` for the two API calls

`getTax` needs only `income`; `getHEM` needs `income` and `dependents`. Neither depends on the other's result, so they are issued together with `Promise.all` rather than one after the other. If either fails, `Promise.all` rejects with that error and the calculation stops.

### Errors are thrown, not returned

A network failure or a non-2xx response throws an `Error` with a readable message (`Request to /api/tax failed: …` or `API /api/tax responded 401: …`). `calculateBorrowingPower` lets it propagate then `cli.js` catches it and prints a `error.message`. 

### Input validation

`calculateBorrowingPower` rejects any argument that is not a finite, non-negative number, with a named error (`income must be a non-negative number`).

### `c8` for coverage

I'm honestly not very familiar with JS tooling, and this one came recommended. It looks like it does the job.

### `mocha` bumped from 11 to 12

The pinned `^11` pulled in a high-severity advisory (`serialize-javascript`). `mocha@12` clears `npm audit` (0 vulnerabilities) and runs fine on Node 18.

---

## Assumptions

- Node ≥ 18, so the global `fetch` is available and no HTTP library is needed.
- HEM from the API is a monthly figure and tax is annual. This matches how the original placeholders were used (HEM subtracted from monthly income; tax
  divided by 12) and the magnitudes the server returns (HEM `1600`–`4100`). I'm not a huge fan of how some of the calcs are written (CREDIT_CARD_LIABILITY_RATE = 0.03, DEFAULT_INTEREST_RATE = 7.0 - both of these are percentages)
- The development PAT is presumably not a secret, though it does make me a little ill to see it there. In a real life scenario I would manage /secrets.
- The borrowing formula is correct as written and out of scope to change. I did double-check a number of results vs the given bendigo bank website; there were a few discrepancies but it is ballpark correct. I imagine a fair bit of this is due to the interest rates and probably other factors, that would normally be accessed via API. 
- Inputs arrive already parsed as numbers. `cli.js` does `parseFloat` / `parseInt`.

---

## Tradeoffs and known limitations

- No automated integration testing.
- No timeout or retry on the HTTP calls. It is fragile in its current state. 
- No caching, which would speed things up at the cost of code complexity.
- Floating-point money - you'd want precise figures in real life. 
- As above - the dev PAT default is committed.
- `dependents` is not required to be an integer by our validation; we rely on the server flooring and capping it to `0`–`3`.
- `cli.js` is outside the coverage gate - excluding the try/catch and the output formatting. To test those you'd need to do the manual test using npm start. 

---

## Possible next steps

- Addressing all the above limitations
- Moving to TS for more control over typing. 
