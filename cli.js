/**
 * cli.js
 *
 * Interactive terminal front-end for the Borrowing Power Calculator.
 * Run with `npm start`.
 */

const readline = require("readline");
const { TaxHemApiClient } = require("./apiClient");
const { BorrowingCalculator } = require("./borrowingCalculator");
const { error } = require("console");
function invokeCLICommand(command,rl, calculator) {

    if (command === 1 ) {
        mortgageBorrowingPowerCalculator(rl, calculator);
    }
    if (command === 2) {
        verifyCLICommandInput(command);
        rl.close()
    }
    
    
}
function runConsoleMode() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const calculator = new BorrowingCalculator(new TaxHemApiClient());

    console.log("Select command.")
    console.log("===================================");
        
    console.log("1. Mortgage Borrowing Power Calculator");
    console.log("2. Server requests count query");
    console.log("===================================");
    askForCommand(rl, calculator)    
}

function askForCommand(rl, calculator) {
    rl.question("Command: ", (input) => {
            let parsedInput = parseInt(input,10);
            let validInput = verifyCLICommandInput(parsedInput);
            if (validInput === false) {
                askForCommand(rl,calculator)
            return
        };

            invokeCLICommand (parsedInput, rl, calculator)
    });
}

function verifyCLICommandInput(command) {
    console.log("Checking command valid...")
    if (command === 1 || command === 2) {
        return true
    }
    console.log(`\nInput validate command number, either "1" or "2"`);
    return false

}

function mortgageBorrowingPowerCalculator(rl, calculator) {


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
