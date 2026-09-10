/**
 * borrowingCalculator.js
 *
 * Calculates how much a borrower can borrow over the loan term, based on their
 * income, dependents, declared expenses and credit card limits.
 *
 * Tax and HEM (Household Expenditure Measure) figures are supplied by an
 * injected API client (see apiClient.js), so this class holds no network code
 * itself and can be unit tested with a fake client.
 */

const DEFAULT_INTEREST_RATE = 7.0;        // baseline interest rate, percent
const DEFAULT_ASSESSMENT_BUFFER = 3.0;    // buffer added on top for loan assessment, percent
const DEFAULT_LOAN_TERM_MONTHS = 360;     // 30 years
const CREDIT_CARD_LIABILITY_RATE = 0.03;  // monthly liability assumed as 3% of total limits

class BorrowingCalculator {
    /**
     * @param {{ getTax: Function, getHEM: Function }} apiClient
     * @param {object} [options]
     * @param {number} [options.interestRate]     Baseline interest rate, percent.
     * @param {number} [options.assessmentBuffer] Buffer added for assessment, percent.
     * @param {number} [options.loanTermMonths]   Loan term in months.
     */
    constructor(apiClient, {
        interestRate = DEFAULT_INTEREST_RATE,
        assessmentBuffer = DEFAULT_ASSESSMENT_BUFFER,
        loanTermMonths = DEFAULT_LOAN_TERM_MONTHS,
    } = {}) {
        this.api = apiClient;
        this.interestRate = interestRate;
        this.assessmentBuffer = assessmentBuffer;
        this.loanTermMonths = loanTermMonths;
    }

    /** Interest rate used to assess the loan: baseline plus the safety buffer. */
    get assessmentRate() {
        return this.interestRate + this.assessmentBuffer;
    }

    /**
     * @param {number} income        Gross annual income.
     * @param {number} dependents    Number of dependents.
     * @param {number} expenses      Declared monthly living expenses.
     * @param {number} creditLimits  Total credit card limits.
     * @returns {Promise<{ maxLoanAmount: number, monthlyRepayment: number }>}
     */
    async calculateBorrowingPower(income, dependents, expenses, creditLimits) {
        this.#assertNonNegativeNumbers({ income, dependents, expenses, creditLimits });

        // Tax and HEM both depend only on the inputs, not on each other, so
        // request them together.
        const [annualTax, baselineHEM] = await Promise.all([
            this.api.getTax(income),
            this.api.getHEM(income, dependents),
        ]);

        // 1. Net monthly income after tax.
        const netMonthlyIncome = (income - annualTax) / 12;

        // 2. Living expenses: declared amount or HEM baseline, whichever is higher.
        const totalLivingExpenses = Math.max(expenses, baselineHEM);

        // 3. Assumed monthly credit card liability.
        const creditCardLiability = creditLimits * CREDIT_CARD_LIABILITY_RATE;

        // 4. Monthly amount available for loan repayments.
        const maxMonthlyRepayment = netMonthlyIncome - totalLivingExpenses - creditCardLiability;

        // Nothing left to service a loan.
        if (maxMonthlyRepayment <= 0) {
            return { maxLoanAmount: 0, monthlyRepayment: 0 };
        }

        // 5. Present value of an annuity: P = M * (1 - (1 + R)^-N) / R
        const monthlyRate = (this.assessmentRate / 100) / 12;
        const maxLoanAmount =
            maxMonthlyRepayment * ((1 - Math.pow(1 + monthlyRate, -this.loanTermMonths)) / monthlyRate);

        return {
            maxLoanAmount: Number(maxLoanAmount.toFixed(2)),
            monthlyRepayment: Number(maxMonthlyRepayment.toFixed(2)),
        };
    }

    /** Throws if any supplied value is not a finite, non-negative number. */
    #assertNonNegativeNumbers(values) {
        for (const [name, value] of Object.entries(values)) {
            if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
                throw new Error(`${name} must be a non-negative number`);
            }
        }
    }
}

module.exports = { BorrowingCalculator };
