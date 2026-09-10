/**
 * cli.js
 *
 * Interactive terminal front-end for the Borrowing Power Calculator.
 * Run with `npm start`.
 */

const readline = require("readline");
const { TaxHemApiClient } = require("./apiClient");
const { BorrowingCalculator } = require("./borrowingCalculator");

function runConsoleMode() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const calculator = new BorrowingCalculator(new TaxHemApiClient());

    console.log("Mortgage Borrowing Power Calculator");
    console.log("===================================");

    rl.question("Gross Annual Income: $", (income) => {
        rl.question("Number of Dependents: ", (dependents) => {
            rl.question("Declared Monthly Expenses: $", (expenses) => {
                rl.question("Total Credit Card Limits: $", async (creditLimits) => {
                    try {
                        const result = await calculator.calculateBorrowingPower(
                            parseFloat(income),
                            parseInt(dependents, 10),
                            parseFloat(expenses),
                            parseFloat(creditLimits)
                        );

                        const years = calculator.loanTermMonths / 12;
                        console.log("\n--- Calculation Summary ---");
                        console.log(
                            `Maximum Borrowing Power at ${calculator.interestRate}%: ` +
                            `$${result.maxLoanAmount.toLocaleString()}`
                        );
                        console.log(
                            `Assumed Monthly Mortgage Repayment: ` +
                            `$${result.monthlyRepayment.toLocaleString()} over ${years} years`
                        );
                    } catch (error) {
                        console.error(`\nCould not complete calculation: ${error.message}`);
                    } finally {
                        rl.close();
                    }
                });
            });
        });
    });
}

if (require.main === module) {
    runConsoleMode();
}

module.exports = { runConsoleMode };
