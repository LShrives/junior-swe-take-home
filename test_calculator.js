/**
 * Borrowing Power Calculator Test Suite
 *
 * The calculator is tested with a fake API client, and the API client is tested
 * with a fake fetch function, so no real server needs to be running.
 */

const assert = require("assert");
const { BorrowingCalculator } = require("./borrowingCalculator");
const { TaxHemApiClient } = require("./apiClient");

const DEV_PAT = "pat_abcdefghijklmnopqrstuvwxyz0123456789";

// Fixed Tax/HEM values, matching what the real server returns for income 120000 with 2 dependents (annual tax 24000, monthly HEM 3100).
const fakeClient = {
    getTax: async () => 24000,
    getHEM: async () => 3100,
};

describe("BorrowingCalculator", () => {

    it("calculates borrowing power for standard values", async () => {
        const calculator = new BorrowingCalculator(fakeClient);

        const result = await calculator.calculateBorrowingPower(120000, 2, 3000, 10000);

        // Net monthly income (8000) - HEM (3100) - credit card liability (300) = 4600.
        assert.deepStrictEqual(result, { maxLoanAmount: 524173.77, monthlyRepayment: 4600 });
    });

    it("uses declared expenses when they exceed the HEM baseline", async () => {
        const calculator = new BorrowingCalculator(fakeClient);

        // Declared expenses 4000 > HEM 3100, so 4000 is used: 8000 - 4000 - 300 = 3700.
        const result = await calculator.calculateBorrowingPower(120000, 2, 4000, 10000);

        assert.deepStrictEqual(result, { maxLoanAmount: 421618.03, monthlyRepayment: 3700 });
    });

    it("returns zero when there is nothing left to service a loan", async () => {
        const calculator = new BorrowingCalculator(fakeClient);

        // 8000 - 8000 - 300 is negative, so repayment capacity floors at zero.
        const result = await calculator.calculateBorrowingPower(120000, 2, 8000, 10000);

        assert.deepStrictEqual(result, { maxLoanAmount: 0, monthlyRepayment: 0 });
    });

    it("exposes assessmentRate as interestRate plus assessmentBuffer", () => {
        const calculator = new BorrowingCalculator(fakeClient, {
            interestRate: 6.0,
            assessmentBuffer: 2.0,
        });

        assert.strictEqual(calculator.assessmentRate, 8.0);
    });

    it("applies constructor configuration to the loan calculation", async () => {
        const calculator = new BorrowingCalculator(fakeClient, {
            interestRate: 4.0,
            assessmentBuffer: 3.0,
            loanTermMonths: 300,
        });

        const result = await calculator.calculateBorrowingPower(120000, 2, 3000, 10000);

        // Same 4600/month, but a lower rate and shorter term than the defaults.
        assert.deepStrictEqual(result, { maxLoanAmount: 650839.76, monthlyRepayment: 4600 });
    });

    it("rejects a non-numeric input", async () => {
        const calculator = new BorrowingCalculator(fakeClient);

        await assert.rejects(
            calculator.calculateBorrowingPower("lots", 2, 3000, 10000),
            /income must be a non-negative number/
        );
    });

    it("rejects a non-finite input", async () => {
        const calculator = new BorrowingCalculator(fakeClient);

        await assert.rejects(
            calculator.calculateBorrowingPower(120000, Number.NaN, 3000, 10000),
            /dependents must be a non-negative number/
        );
    });

    it("rejects a negative input", async () => {
        const calculator = new BorrowingCalculator(fakeClient);

        await assert.rejects(
            calculator.calculateBorrowingPower(120000, 2, -500, 10000),
            /expenses must be a non-negative number/
        );
    });

    it("propagates an error raised by the API client", async () => {
        const brokenClient = {
            getTax: async () => { throw new Error("tax service unavailable"); },
            getHEM: async () => 3100,
        };
        const calculator = new BorrowingCalculator(brokenClient);

        await assert.rejects(
            calculator.calculateBorrowingPower(120000, 2, 3000, 10000),
            /tax service unavailable/
        );
    });
});


/**
 * Builds a fake fetch function that records its calls and delegates the response
 * to `responder(url, options)`.
 */
function recordingFetch(responder) {
    const calls = [];
    async function fetchFn(url, options) {
        calls.push({ url, options });
        return responder(url, options);
    }
    return { fetchFn, calls };
}

const jsonResponse = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

describe("TaxHemApiClient", () => {

    it("uses the documented defaults when constructed with no options", () => {
        const client = new TaxHemApiClient();

        assert.strictEqual(client.baseUrl, "http://localhost:3000");
        assert.strictEqual(client.token, DEV_PAT);
        assert.strictEqual(client.fetchFn, fetch);
    });

    it("requests /api/tax with the income parameter and bearer token", async () => {
        const { fetchFn, calls } = recordingFetch(() => jsonResponse(200, { income: 120000, tax: 24000 }));
        const client = new TaxHemApiClient({ fetchFn });

        const tax = await client.getTax(120000);

        assert.strictEqual(tax, 24000);
        assert.strictEqual(calls[0].url.pathname, "/api/tax");
        assert.strictEqual(calls[0].url.searchParams.get("income"), "120000");
        assert.strictEqual(calls[0].options.headers.Authorization, `Bearer ${DEV_PAT}`);
    });

    it("requests /api/hem with the income and dependents parameters", async () => {
        const { fetchFn, calls } = recordingFetch(() => jsonResponse(200, { hem: 3100 }));
        const client = new TaxHemApiClient({ fetchFn });

        const hem = await client.getHEM(120000, 2);

        assert.strictEqual(hem, 3100);
        assert.strictEqual(calls[0].url.pathname, "/api/hem");
        assert.strictEqual(calls[0].url.searchParams.get("income"), "120000");
        assert.strictEqual(calls[0].url.searchParams.get("dependents"), "2");
    });

    it("honours a custom base URL and token", async () => {
        const { fetchFn, calls } = recordingFetch(() => jsonResponse(200, { tax: 1 }));
        const client = new TaxHemApiClient({
            baseUrl: "http://example.test:9999",
            token: "tok_custom",
            fetchFn,
        });

        await client.getTax(50000);

        assert.strictEqual(calls[0].url.host, "example.test:9999");
        assert.strictEqual(calls[0].options.headers.Authorization, "Bearer tok_custom");
    });

    it("throws with the server's message on a non-2xx response", async () => {
        const { fetchFn } = recordingFetch(() => jsonResponse(401, {
            error: "Invalid Personal Access Token",
            message: "The provided token is invalid.",
        }));
        const client = new TaxHemApiClient({ fetchFn });

        await assert.rejects(client.getTax(120000), /401: The provided token is invalid\./);
    });

    it("falls back to the error field when no message is present", async () => {
        const { fetchFn } = recordingFetch(() => jsonResponse(400, { error: "Income is required" }));
        const client = new TaxHemApiClient({ fetchFn });

        await assert.rejects(client.getTax(120000), /400: Income is required/);
    });

    it("throws without detail when the error body has no message or error field", async () => {
        const { fetchFn } = recordingFetch(() => jsonResponse(404, {}));
        const client = new TaxHemApiClient({ fetchFn });

        await assert.rejects(client.getTax(120000), (error) => {
            assert.match(error.message, /responded 404$/);
            return true;
        });
    });

    it("throws without detail when the error body cannot be read", async () => {
        const { fetchFn } = recordingFetch(() => ({
            ok: false,
            status: 500,
            json: async () => { throw new Error("not JSON"); },
        }));
        const client = new TaxHemApiClient({ fetchFn });

        await assert.rejects(client.getTax(120000), (error) => {
            assert.match(error.message, /responded 500$/);
            return true;
        });
    });

    it("wraps a network failure in a descriptive error", async () => {
        const { fetchFn } = recordingFetch(() => { throw new Error("ECONNREFUSED"); });
        const client = new TaxHemApiClient({ fetchFn });

        await assert.rejects(client.getTax(120000), /Request to \/api\/tax failed: ECONNREFUSED/);
    });
});
