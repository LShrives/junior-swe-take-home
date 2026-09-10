/**
 * apiClient.js
 *
 * Talks to the local development API that supplies Tax and HEM values.
 * See server.md for the endpoint and authentication documentation.
 */

const DEFAULT_BASE_URL = "http://localhost:3000";

// Development Personal Access Token, published in server.md. Not a real secret.
const DEV_PAT = "pat_abcdefghijklmnopqrstuvwxyz0123456789";

class TaxHemApiClient {
    /**
     * @param {object} [options]
     * @param {string} [options.baseUrl]  Base URL of the API server.
     * @param {string} [options.token]    Bearer token sent on every request.
     * @param {Function} [options.fetchFn] HTTP function to use. Defaults to the
     *        global fetch; tests pass a fake so no real server is needed.
     */
    constructor({ baseUrl = DEFAULT_BASE_URL, token = DEV_PAT, fetchFn = fetch } = {}) {
        this.baseUrl = baseUrl;
        this.token = token;
        this.fetchFn = fetchFn;
    }

    /**
     * Annual income tax for a given gross annual income.
     * @param {number} income
     * @returns {Promise<number>}
     */
    async getTax(income) {
        const data = await this.#request("/api/tax", { income });
        return data.tax;
    }

    /**
     * Monthly HEM (Household Expenditure Measure) baseline.
     * @param {number} income
     * @param {number} dependents
     * @returns {Promise<number>}
     */
    async getHEM(income, dependents) {
        const data = await this.#request("/api/hem", { income, dependents });
        return data.hem;
    }

    /**
     * Performs a GET request, checks the response, and returns the parsed JSON body.
     * Throws a descriptive Error if the request cannot be made or the server
     * responds with a non-2xx status.
     */
    async #request(path, params) {
        const url = new URL(path, this.baseUrl);
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
        }

        let response;
        try {
            response = await this.fetchFn(url, {
                headers: { Authorization: `Bearer ${this.token}` },
            });
        } catch (cause) {
            throw new Error(`Request to ${url.pathname} failed: ${cause.message}`, { cause });
        }

        if (!response.ok) {
            const detail = await this.#readErrorDetail(response);
            throw new Error(
                `API ${url.pathname} responded ${response.status}` + (detail ? `: ${detail}` : "")
            );
        }

        return response.json();
    }

    /**
     * Best-effort extraction of a human-readable message from an error response.
     * Returns "" if the body cannot be read as JSON.
     */
    async #readErrorDetail(response) {
        try {
            const body = await response.json();
            return body.message || body.error || "";
        } catch {
            return "";
        }
    }
}

module.exports = { TaxHemApiClient };
