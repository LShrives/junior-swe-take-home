/**
 * cli.js
 *
 * Interactive terminal front-end for the Borrowing Power Calculator.
 * Run with `npm start`.
 */

const readline = require("readline");
const { ServerStatsRequestAPIClient, TaxHemApiClient } = require("./apiClient");
const { BorrowingCalculator } = require("./borrowingCalculator");

async function getServerRequestStats(rl) {
    // gets the number of API requests made to server, returns to stdout
    const client = new ServerStatsRequestAPIClient();
    try {
        const serverStats = await client.getStats();
        console.log("\n--- Count of total API requests sent to server ---");
        console.log(serverStats.requestCount);
    }
    catch (error) {
        console.error(`\nCould not retrieve count of API requests to server: ${error.message}`);
    } finally {
        rl.close();
    }
}

function runConsoleMode() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log("Select command.")
    console.log("===================================");
    console.log("1. Mortgage Borrowing Power Calculator");
    console.log("2. Server requests count query");
    console.log("===================================");
    askForCommand(rl)
}

function mortgageBorrowingPowerCalculator(rl) {
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

function askForCommand(rl) {
    rl.question("Command: ", (input) => {
        let parsedInput = parseInt(input, 10);
        let validInput = verifyCLICommandInput(parsedInput);
        if (validInput === false) {
            askForCommand(rl)
            return
        };
        invokeCLICommand(parsedInput, rl)
    });
}
function invokeCLICommand(command, rl) {
    if (command === 1) {
        mortgageBorrowingPowerCalculator(rl);
    }
    if (command === 2) {
        getServerRequestStats(rl);
    }
}
function verifyCLICommandInput(command) {
    console.log("Checking command valid...")
    if (command === 1 || command === 2) {
        return true
    }
    console.log(`\nInput validate command number, either "1" or "2"`);
    return false
}

if (require.main === module) {
    runConsoleMode();
}

module.exports = { runConsoleMode };
